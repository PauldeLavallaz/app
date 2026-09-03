import type { LogsType } from "@/components/log/logs-viewer";
import { getApiRouteUrl } from "@/lib/runtime-config";
import { useAuth } from "@clerk/clerk-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReadyState } from "react-use-websocket";
import { EventSourcePolyfill } from "event-source-polyfill";

interface UseBuildProgressProps {
  machine_version_id: string;
  endpoint: string;
  instance_id: string;
  auth_token: string | null;
}

export function useMachineBuildProgress({
  machine_version_id,
  endpoint,
  instance_id,
  auth_token,
}: UseBuildProgressProps) {
  const [logs, setLogs] = useState<LogsType>([]);
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState<"failed" | "success">();
  const [readyState, setReadyState] = useState<ReadyState>(
    ReadyState.UNINSTANTIATED,
  );

  // Keep a ref to the EventSource for cleanup
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Only start when we have a token and not finished
    if (!auth_token || !machine_version_id || finished) return;

    setReadyState(ReadyState.CONNECTING);

    const url = new URL(getApiRouteUrl("/v2/stream-logs"));
    // Treat machine_id as run_id for the v2 log stream
    url.searchParams.append("machine_id_version", machine_version_id);
    // Do not filter by log level so we receive builder/webhook/info logs uniformly

    const es = new EventSourcePolyfill(url.toString(), {
      headers: {
        Authorization: `Bearer ${auth_token}`,
      },
    }) as unknown as EventSource;

    esRef.current = es;

    es.onopen = () => setReadyState(ReadyState.OPEN);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle control messages
        if (
          data?.type === "stream_cancelled" ||
          data?.type === "stream_complete"
        ) {
          setFinished(true);
          return;
        }

        // Expect normalized log entries: { message, level, timestamp }
        const { message, timestamp } = data as {
          message: unknown;
          level?: string;
          timestamp?: string;
        };

        let parsedLogs: Array<{ timestamp: number; logs: string }> | undefined;

        if (typeof message === "string") {
          // Some producers send JSON string arrays or objects in message
          try {
            const maybeJson = JSON.parse(message);
            if (Array.isArray(maybeJson)) {
              parsedLogs = maybeJson.map((entry) => ({
                timestamp:
                  typeof entry.timestamp === "number"
                    ? entry.timestamp
                    : entry.timestamp
                      ? Math.floor(new Date(entry.timestamp).getTime() / 1000)
                      : timestamp
                        ? Math.floor(new Date(timestamp).getTime() / 1000)
                        : Math.floor(Date.now() / 1000),
                logs:
                  typeof entry.logs === "string"
                    ? entry.logs
                    : String(entry.logs),
              }));
            } else {
              // Fallback: JSON object string -> show as plain string
              parsedLogs = [
                {
                  timestamp: timestamp
                    ? Math.floor(new Date(timestamp).getTime() / 1000)
                    : Math.floor(Date.now() / 1000),
                  logs: message,
                },
              ];
            }
          } catch {
            // treat as plain string
            parsedLogs = [
              {
                timestamp: timestamp
                  ? Math.floor(new Date(timestamp).getTime() / 1000)
                  : Math.floor(Date.now() / 1000),
                logs: message,
              },
            ];
          }
        } else if (Array.isArray(message)) {
          parsedLogs = (
            message as Array<{
              timestamp?: number | string;
              logs?: unknown;
            }>
          ).map((entry) => ({
            timestamp:
              typeof entry.timestamp === "number"
                ? entry.timestamp
                : entry.timestamp
                  ? Math.floor(new Date(entry.timestamp).getTime() / 1000)
                  : timestamp
                    ? Math.floor(new Date(timestamp).getTime() / 1000)
                    : Math.floor(Date.now() / 1000),
            logs:
              typeof entry.logs === "string" ? entry.logs : String(entry.logs),
          }));
        } else if (message != null) {
          parsedLogs = [
            {
              timestamp: timestamp
                ? Math.floor(new Date(timestamp).getTime() / 1000)
                : Math.floor(Date.now() / 1000),
              logs: JSON.stringify(message),
            },
          ];
        }

        if (parsedLogs && parsedLogs.length > 0) {
          setLogs((prev) => [...prev, ...parsedLogs]);

          // Opportunistic success/failure detection
          const lastLog = parsedLogs[parsedLogs.length - 1]?.logs || "";
          if (/✓ Created objects\./.test(lastLog)) {
            setStatus("success");
          } else if (/error|failed|traceback/i.test(lastLog)) {
            setStatus("failed");
          }
        }
      } catch (e) {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setReadyState(ReadyState.CLOSED);
      try {
        es.close();
      } catch {}
    };

    return () => {
      setReadyState(ReadyState.CLOSING);
      try {
        es.close();
      } catch {}
      setReadyState(ReadyState.CLOSED);
    };
  }, [auth_token, machine_version_id, finished]);

  return {
    logs,
    finished,
    status,
    readyState,
  };
}

interface BuildProgressBarProps {
  machine_version_id: string;
  endpoint: string;
  instance_id: string;
  machine: {
    type: string;
    status: string;
    docker_command_steps?: { steps: unknown[] } | null;
    updated_at?: string;
  };
}

export function getMachineBuildProgress({
  machine_version_id,
  endpoint,
  instance_id,
  machine,
}: BuildProgressBarProps) {
  if (
    machine.type !== "comfy-deploy-serverless" ||
    machine.status !== "building"
  ) {
    return null;
  }

  const { getToken } = useAuth();
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    getToken().then(setAuthToken);
  }, [getToken]);

  const { logs, finished } = useMachineBuildProgress({
    machine_version_id,
    endpoint,
    instance_id,
    auth_token: authToken,
  });

  const progress = useMemo(() => {
    const totalSteps = 5 + (machine.docker_command_steps?.steps.length || 0);

    const getCurrentStep = () => {
      const stepMarkers = [
        "Builder Version:",
        "Cloning into '/comfyui'...",
        "https://github.com/bennykok/comfyui-deploy",
        "get_static_assets",
        "✓ Created objects.",
      ];

      for (let i = stepMarkers.length - 1; i >= 0; i--) {
        if (logs.some((log) => log.logs.includes(stepMarkers[i]))) {
          return i + 1 + (machine.docker_command_steps?.steps.length || 0);
        }
      }
      return 0;
    };

    const currentStep = getCurrentStep();
    const progress = (currentStep / totalSteps) * 100;

    if (finished) return null;
    return progress;
  }, [logs, machine.docker_command_steps?.steps.length, finished]);

  return progress;
}
