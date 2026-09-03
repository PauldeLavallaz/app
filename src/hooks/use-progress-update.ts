import { EventSourcePolyfill } from "event-source-polyfill";
import { useEffect, useRef, useState } from "react";
import { convertDateFields } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { getApiRouteUrl } from "@/lib/runtime-config";

export interface ProgressUpdate {
  run_id: string;
  workflow_id: string;
  machine_id: string;
  progress: number;
  status: string;
  node_class: string;
  timestamp: string;
  // New fields from Redis pub/sub
  user_id?: string;
  org_id?: string;
  gpu_event_id?: string;
  workflow_version_id?: string;
  log_type?: string;
  log?: string;
}

// New message types from Redis pub/sub
export interface RedisMessage {
  type:
    | "connection_established"
    | "subscribed"
    | "keepalive"
    | "error"
    | "stream_cancelled"
    | "stream_complete";
  channels?: string[];
  channel?: string;
  timestamp?: string;
  message?: string;
  reason?: string;
  source?: string;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "reconnecting";

export interface ConnectionDetails {
  status: ConnectionStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  isReconnecting: boolean;
}

export function useProgressUpdates({
  runId,
  workflowId,
  machineId,
  onUpdate,
  returnRun,
  fromStart,
  reconnect,

  status,
  deploymentId,
}: {
  runId?: string;
  workflowId?: string;
  machineId?: string;
  onUpdate?: (update: ProgressUpdate) => void;
  returnRun?: boolean;
  fromStart?: boolean;
  reconnect?: boolean;

  status?: string;
  deploymentId?: string;
}) {
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>(
    {
      status: "connecting",
      retryCount: 0,
      maxRetries: 5,
      isReconnecting: false,
    },
  );
  const fetchToken = useAuthStore((state) => state.fetchToken);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!runId && !workflowId && !machineId) {
      setConnectionDetails({
        status: "disconnected",
        retryCount: 0,
        maxRetries: 5,
        isReconnecting: false,
      });
      return;
    }

    // Clear the timeline when runId changes
    setProgressUpdates([]);

    let eventSource: EventSource | undefined;
    let unmounted = false;
    let shouldReconnect = reconnect ?? false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 3000; // 3 seconds
    const terminalStatuses = new Set([
      "success",
      "failed",
      "timeout",
      "cancelled",
    ]);

    const setupEventSource = async () => {
      setConnectionDetails((prev) => ({
        ...prev,
        status: retryCount > 0 ? "reconnecting" : "connecting",
        isReconnecting: retryCount > 0,
      }));
      const token = await fetchToken();

      if (unmounted) return;

      const url = new URL(getApiRouteUrl("/v2/stream-progress"));
      if (runId) {
        url.searchParams.append("run_id", runId);
      }
      if (workflowId) {
        url.searchParams.append("workflow_id", workflowId);
      }
      if (machineId) {
        url.searchParams.append("machine_id", machineId);
      }
      if (returnRun) {
        url.searchParams.append("return_run", "true");
      }
      if (fromStart) {
        url.searchParams.append("from_start", "true");
      }

      if (status) {
        url.searchParams.append("status", status);
      }
      if (deploymentId) {
        url.searchParams.append("deployment_id", deploymentId);
      }

      eventSource = new EventSourcePolyfill(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }) as unknown as EventSource;

      eventSource.onmessage = (event) => {
        let data = JSON.parse(event.data);
        data = convertDateFields(data);

        // Handle Redis pub/sub system messages
        if (data.type) {
          switch (data.type) {
            case "connection_established":
              console.log(
                "Redis pub/sub connection established, channels:",
                data.channels,
              );
              setConnectionDetails((prev) => ({
                ...prev,
                status: "connected",
                retryCount: 0,
                isReconnecting: false,
                lastError: undefined,
              }));
              return;

            case "subscribed":
              console.log("Successfully subscribed to channel:", data.channel);
              setConnectionDetails((prev) => ({
                ...prev,
                status: "connected",
                retryCount: 0,
                isReconnecting: false,
                lastError: undefined,
              }));
              return;

            case "keepalive":
              // Silent keepalive, just update connection status
              setConnectionDetails((prev) => ({
                ...prev,
                status: "connected",
              }));
              return;

            case "error":
              console.error("Redis pub/sub error:", data.message);
              setConnectionDetails((prev) => ({
                ...prev,
                status: "error",
                lastError: data.message,
                isReconnecting: false,
              }));
              return;

            case "stream_cancelled":
              console.log("Stream cancelled:", data.reason);
              shouldReconnect = false;
              eventSource?.close();
              setConnectionDetails((prev) => ({
                ...prev,
                status: "disconnected",
                isReconnecting: false,
              }));
              return;

            case "stream_complete":
              console.log("Stream completed from:", data.source);
              shouldReconnect = false;
              eventSource?.close();
              setConnectionDetails((prev) => ({
                ...prev,
                status: "disconnected",
                isReconnecting: false,
              }));
              return;

            default:
              console.warn("Unknown message type:", data.type);
              return;
          }
        }

        // Handle actual progress updates (no type field means it's progress data)
        console.log("Progress update:", data);
        if (onUpdateRef.current) {
          onUpdateRef.current(data);
        }
        setProgressUpdates((prevUpdates) => [...prevUpdates.slice(-99), data]);
        setConnectionDetails((prev) => ({
          ...prev,
          status: "connected",
        }));

        if (runId && terminalStatuses.has(data.status)) {
          shouldReconnect = false;
          eventSource?.close();
        }
      };

      eventSource.onerror = (event) => {
        console.error("EventSource failed:", event);
        eventSource?.close();

        setConnectionDetails((prev) => ({
          ...prev,
          status: "error",
          lastError: "Connection failed",
          isReconnecting: false,
        }));

        if (shouldReconnect) {
          if (retryCount < maxRetries && !unmounted) {
            retryCount++;
            console.log(
              `Attempting to reconnect to Redis pub/sub (${retryCount}/${maxRetries})...`,
            );
            setConnectionDetails((prev) => ({
              ...prev,
              status: "reconnecting",
              retryCount,
              isReconnecting: true,
              lastError: "Connection lost, reconnecting...",
            }));
            retryTimer = setTimeout(setupEventSource, retryDelay);
          } else if (retryCount >= maxRetries) {
            console.error("Max retries reached. Real-time updates disabled.");
            setConnectionDetails((prev) => ({
              ...prev,
              status: "error",
              lastError: "Max retries reached. Connection failed.",
              isReconnecting: false,
            }));
          }
        }
      };

      eventSource.onopen = () => {
        console.log(
          "EventSource connection opened - waiting for Redis pub/sub confirmation",
        );
        setConnectionDetails((prev) => ({
          ...prev,
          status: "connecting", // Keep as connecting until we get Redis confirmation
        }));
        retryCount = 0; // Reset retry count on successful connection
      };
    };

    setupEventSource();

    return () => {
      unmounted = true;
      if (eventSource) {
        eventSource.close();
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      setConnectionDetails((prev) => ({
        ...prev,
        status: "disconnected",
        isReconnecting: false,
      }));
    };
  }, [
    runId,
    workflowId,
    machineId,
    fetchToken,
    returnRun,
    fromStart,
    reconnect,
    status,
    deploymentId,
  ]);

  return {
    progressUpdates,
    connectionStatus: connectionDetails.status,
    connectionDetails,
  };
}

// Enhanced hook specifically for Redis pub/sub v2 endpoint
export function useProgressUpdatesV2({
  runId,
  workflowId,
  machineId,
  onUpdate,
  onConnectionChange,
  returnRun = false,
  reconnect = true,
  status,
  deploymentId,
}: {
  runId?: string;
  workflowId?: string;
  machineId?: string;
  onUpdate?: (update: ProgressUpdate) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  returnRun?: boolean;
  reconnect?: boolean;
  status?: string;
  deploymentId?: string;
}) {
  const result = useProgressUpdates({
    runId,
    workflowId,
    machineId,
    onUpdate,
    returnRun,
    fromStart: false, // v2 starts from current time by default
    reconnect,
    status,
    deploymentId,
  });

  // Notify about connection changes
  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(result.connectionStatus);
    }
  }, [result.connectionStatus, onConnectionChange]);

  return {
    ...result,
    // Add helper methods for v2
    isConnected: result.connectionStatus === "connected",
    isConnecting: result.connectionStatus === "connecting",
    isReconnecting: result.connectionStatus === "reconnecting",
    hasError: result.connectionStatus === "error",
    isDisconnected: result.connectionStatus === "disconnected",
  };
}
