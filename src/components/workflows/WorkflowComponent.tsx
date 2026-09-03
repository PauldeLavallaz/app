import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { EventSourcePolyfill } from "event-source-polyfill";
import {
  AlertCircle,
  Archive,
  CheckCircle,
  ChevronDown,
  Copy,
  Expand,
  ExternalLink,
  Info,
  LinkIcon,
  Loader2,
  Settings2Icon,
  XCircle,
  Zap,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { LogsViewer } from "@/components/log/logs-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getApiRouteUrl } from "@/lib/runtime-config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutputRenderRun } from "@/components/workflows/OutputRender";
import { RunInputs } from "@/components/workflows/RunInputs";
import {
  RunOutputs,
  WorkflowExecutionGraph,
  WorkflowNodesSchema,
} from "@/components/workflows/RunOutputs";
import { useRunsTableStore } from "@/components/workflows/RunsTable";
import { StatusBadge } from "@/components/workflows/StatusBadge";
import { useMachine } from "@/hooks/use-machine";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { ApiPlaygroundDemo2 } from "../api-playground-demo";
import { MyDrawer } from "../drawer";
import { UserIcon } from "../run/SharePageComponent";
import { Alert, AlertDescription } from "../ui/alert";
import { CodeBlock } from "../ui/code-blocks";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  getEnvColor,
  useWorkflowDeployments,
} from "../workspace/ContainersTable";
import { InfoItem } from "./InfoItem";
import { LiveStatus } from "./LiveStatus";
import { RunTimeline } from "./RunTimeline";

export default function WorkflowComponent() {
  // Utility function for parsing timestamps with microsecond precision

  const [runId, setRunId] = useQueryState("run-id");
  const [tab, setTab] = useQueryState("tab", parseAsString);

  const { selectedRun, setSelectedRun } = useRunsTableStore();

  const handleCloseRun = () => {
    setSelectedRun(null);
    setRunId(null);
    setTab(null);
  };

  return (
    <>
      {runId && (
        <MyDrawer
          backgroundInteractive={true}
          desktopClassName="w-[600px] ring-1 ring-gray-200 shadow-xl dark:ring-zinc-700/80"
          open={!!runId}
          onClose={() => {
            handleCloseRun();
          }}
        >
          <RunDetails run_id={runId} onClose={handleCloseRun} />
        </MyDrawer>
      )}
    </>
  );
}

export function RunDetails(props: {
  run_id: string;
  onClose?: () => void;
  isShare?: boolean;
  isPlayground?: boolean;
}) {
  const { run_id, onClose, isShare = false, isPlayground = false } = props;

  const [selectedTab, setSelectedTab] = useQueryState("tab", parseAsString);
  const [tweakRunId, setTweakRunId] = useQueryState("runID");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: run, isLoading } = useQuery<any>({
    queryKey: ["run", run_id],
    meta: {
      params: {
        queue_position: true,
      },
    },
    queryKeyHashFn: (queryKey) => [...queryKey, "outputs"].toString(),
    refetchOnMount: (query) => {
      if (query.state.data?.status === "finished") {
        return false;
      }
      return true;
    },
    refetchInterval: (query) => {
      if (
        query.state.data?.status === "running" ||
        query.state.data?.status === "uploading" ||
        query.state.data?.status === "not-started" ||
        query.state.data?.status === "queued" ||
        query.state.data?.status === "started"
      ) {
        return 2000;
      }
      return false;
    },
  });

  useEffect(() => {
    if (run?.status === "failed") {
      setSelectedTab("logs");
    }
  }, [run]);

  useEffect(() => {
    if (isPlayground) {
      setSelectedTab("inputs");
    }
  }, [isPlayground]);

  useEffect(() => {
    if (!run?.webhook && selectedTab === "webhook") {
      setSelectedTab(null);
    }
  }, [run?.id]);

  const [isApiPlaygroundOpen, setIsApiPlaygroundOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!run) {
    return (
      // <Card className="relative h-fit w-full lg:max-w-[500px]">
      // <CardContent className="space-y-6">
      <div className="py-8 text-center text-muted-foreground">
        No run data available
      </div>
      // </CardContent>
      // </Card>
    );
  }

  const handleClick = () => {
    if (!run) return;

    if (isShare) {
      // For share page, we need to trigger the tweak through a custom event
      // since we can't access the setters directly from here
      window.dispatchEvent(
        new CustomEvent("triggerTweak", {
          detail: { runId: run.id },
        }),
      );

      // Close the modal/drawer
      if (onClose) {
        onClose();
      }
      return;
    }

    navigate({
      to: "/workflows/$workflowId/$view",
      params: {
        workflowId: run.workflow_id,
        view: isPlayground ? "playground" : "requests",
      },
      search: (prev) => ({
        ...prev,
        tweak: true,
      }),
    });
  };

  const content = (
    <>
      <div className="mb-4 flex flex-row items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl">Run Details</h2>
          <div className="flex items-center">
            <p className="line-clamp-1 font-mono text-2xs text-muted-foreground">
              #{run.id?.slice(0, 8)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(run.id);
                toast.success("Run ID copied to clipboard");
              }}
              title="Copy run ID"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <UserIcon user_id={run.user_id} className="h-5 w-5" displayName />
          {run.batch_id && (
            <Link
              href={`/batch/${run.batch_id}`}
              className="text-primary hover:underline"
            >
              Batch #{run.batch_id}
            </Link>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClick} className="gap-1">
              <Settings2Icon size={16} /> Tweak
            </Button>
            {process.env.NODE_ENV === "development" &&
              run.machine_type === "comfy-deploy-serverless" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    window.open(
                      `https://modal.com/apps/comfy-deploy/main/deployed/${run.machine_id}`,
                      "_blank",
                    );
                  }}
                >
                  <Info size={14} className="mr-2 text-green-700" />
                  Modal
                </Button>
              )}
          </div>
        </div>
      </div>
      <div>
        <div className="grid grid-cols-3 gap-3">
          <InfoItem
            label="Status"
            value={<StatusBadge status={run.status} />}
          />
          <RunVersionAndDeployment run={run} />
          {run.machine_id && <RunMachine machineId={run.machine_id} />}
          {!props.isShare && (
            <InfoItem label="GPU" value={<Badge>{run.gpu || "N/A"}</Badge>} />
          )}
          {run.queue_position !== undefined && run.queue_position !== null && (
            <InfoItem label="Queue Position" value={run.queue_position} />
          )}
          {run.batch_id && (
            <InfoItem
              label="Batch"
              value={
                <Link
                  href={`/batch/${run.batch_id}`}
                  className="text-primary hover:underline"
                >
                  #{run.batch_id}
                </Link>
              }
            />
          )}
        </div>
        <div className="mt-4">
          <RunTimeline run={run} />
        </div>
        {/* Live Status now integrated into RunTimeline */}

        <Tabs
          defaultValue="outputs"
          className="mt-4"
          value={selectedTab ?? "outputs"}
          onValueChange={setSelectedTab}
        >
          <TabsList className="">
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            <TabsTrigger value="outputs">Outputs</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            {/* <TabsTrigger value="graph">Execution</TabsTrigger> */}
            {run.webhook && <TabsTrigger value="webhook">Webhook</TabsTrigger>}
          </TabsList>
          <TabsContent value="inputs">
            <ScrollArea className="h-[calc(100vh-470px)]">
              <RunInputs run={run as any} />
            </ScrollArea>
          </TabsContent>
          <TabsContent
            value="outputs"
            className="flex w-fit flex-col justify-start gap-2"
          >
            <ScrollArea className="h-[calc(100vh-515px)]">
              <OutputRenderRun
                run={run as any}
                imgClasses="max-w-[230px] w-full h-[230px] object-cover object-center rounded-[8px]"
                canExpandToView={true}
                columns={2}
              />
            </ScrollArea>
            <div className="flex flex-row items-center justify-end gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="link" className="flex items-center gap-2">
                    View Full Outputs <ExternalLink size={16} />
                  </Button>
                </DialogTrigger>
                <DialogContent className="flex h-fit max-h-[calc(100vh-10rem)] max-w-3xl flex-col">
                  <DialogHeader>
                    <DialogTitle>Run outputs</DialogTitle>
                    <DialogDescription>
                      <div className="flex items-center justify-between">
                        You can view your run&apos;s outputs here
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="flex w-full flex-col pr-4">
                    <div className="w-full rounded-md border border-gray-200 bg-muted/50 p-2">
                      <RunInputs run={run as any} />
                    </div>
                    <div className="mt-4 w-full rounded-md border border-gray-200 bg-muted/50 p-2">
                      <RunOutputs run={run as any} />
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
              <Button
                variant={"ghost"}
                onClick={() => {
                  setIsApiPlaygroundOpen(true);
                }}
                className="flex items-center gap-2"
              >
                View Get Run API
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="graph">
            <FilteredWorkflowExecutionGraph run={run as any} />
          </TabsContent>
          <TabsContent value="logs">
            <span className="pl-2 text-2xs text-muted-foreground">
              *Logs are only available for <b>30 days</b>.
            </span>
            <ErrorBoundary fallback={() => <div>Error loading logs</div>}>
              <FinishedRunLogDisplay
                runId={run.id}
                modalFnCallId={run.modal_function_call_id}
                runUpdatedAt={run.updated_at}
              />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="webhook">
            <WebhookTab run={run} webhook={run.webhook} />
          </TabsContent>
        </Tabs>

        <MyDrawer
          desktopClassName="w-[1100px]"
          open={isApiPlaygroundOpen}
          onClose={() => {
            setIsApiPlaygroundOpen(false);
          }}
        >
          <ApiPlaygroundDemo2
            defaultPathParams={{
              run_id: run.id,
            }}
          />
        </MyDrawer>
      </div>
    </>
  );

  return <div className="relative h-fit w-full">{content}</div>;
}

function RunMachine({ machineId }: { machineId: string }) {
  const { data: machine } = useMachine(machineId);

  return (
    <InfoItem
      label="Machine"
      value={
        <Link
          to="/machines/$machineId"
          params={{ machineId }}
          className="line-clamp-1 text-xs text-primary hover:underline"
        >
          {machine?.name}
        </Link>
      }
    />
  );
}

function RunVersionAndDeployment({ run }: { run: any }) {
  const { data: versionData, isLoading } = useQuery<any>({
    queryKey: ["workflow-version", run.workflow_version_id],
    enabled: !!run.workflow_version_id,
  });
  const { data: deploymentData } = useWorkflowDeployments(run.workflow_id);

  if (!versionData || isLoading) return null;

  // Find the matching deployment once instead of multiple times
  const matchingDeployment = deploymentData?.find(
    (deployment) => deployment.id === run.deployment_id,
  );
  const isDeployment = !!matchingDeployment;

  return (
    <InfoItem
      label="Run Version"
      value={
        <div className="flex items-center gap-2">
          {isDeployment && (
            <Badge className={getEnvColor(matchingDeployment.environment)}>
              {matchingDeployment.environment}
            </Badge>
          )}
          <Badge variant="outline" className="dark:border-gray-600">
            v{versionData.version}
          </Badge>
          {versionData.comment && (
            <span className="line-clamp-1 text-muted-foreground text-xs">
              {versionData.comment}
            </span>
          )}
        </div>
      }
    />
  );
}

function FilteredWorkflowExecutionGraph({ run }: { run: any }) {
  const data = useMemo(() => {
    const output = run.outputs?.find((output: any) => {
      const parseResult = WorkflowNodesSchema.safeParse(output.data);
      return parseResult.success;
    });
    if (!output) return null;
    return WorkflowNodesSchema.parse(output?.data);
  }, [run]);

  if (!data)
    return (
      <div className="w-full rounded-md bg-muted p-4 text-center text-muted-foreground text-xs">
        No execution data
      </div>
    );

  return <WorkflowExecutionGraph run={data} />;
}

const parseTimestampSafely = (timestamp: string | number): Date => {
  try {
    if (typeof timestamp === "string") {
      // Handle microseconds by truncating to milliseconds
      const truncated = timestamp.replace(/(\.\d{3})\d*/, "$1");
      const date = new Date(truncated);
      if (isNaN(date.getTime())) {
        console.warn("Invalid timestamp format:", timestamp);
        return new Date(); // fallback to current time
      }
      return date;
    }
    // Handle numeric timestamps
    if (typeof timestamp === "number") {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        console.warn("Invalid numeric timestamp:", timestamp);
        return new Date(); // fallback to current time
      }
      return date;
    }
    console.warn("Unknown timestamp type:", typeof timestamp, timestamp);
    return new Date(); // fallback to current time
  } catch (error) {
    console.warn("Error parsing timestamp:", timestamp, error);
    return new Date(); // fallback to current time
  }
};

export function LogsTab({ runId }: { runId: string }) {
  const [logs, setLogs] = useState<Array<{ timestamp: number; logs: string }>>(
    [],
  );
  const fetchToken = useAuthStore((state) => state.fetchToken);

  useEffect(() => {
    // Reset logs when runId changes
    setLogs([]);

    let eventSource: EventSource;
    let unmounted = false;

    const setupEventSource = async () => {
      const token = await fetchToken();

      if (unmounted) return;

      const url = new URL(
        getApiRouteUrl("/v2/stream-logs"),
      );
      url.searchParams.append("run_id", runId);
      url.searchParams.append("log_level", "info");

      eventSource = new EventSourcePolyfill(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }) as unknown as EventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "keepalive") return;
        // console.log("Received data:", data);
        // console.log("data.message type:", typeof data.message);
        // console.log("data.message content:", data.message);

        try {
          let parsedLogs;
          if (typeof data.message === "string") {
            try {
              parsedLogs = JSON.parse(data.message);
            } catch (error) {
              console.log(parseTimestampSafely(data.timestamp));
              parsedLogs = [
                {
                  timestamp:
                    parseTimestampSafely(data.timestamp).getTime() / 1000,
                  logs: data.message,
                },
              ];
            }
          } else if (Array.isArray(data.message)) {
            parsedLogs = data.message;
          } else {
            console.error("Unexpected data.message format:", data.message);
            return;
          }

          if (Array.isArray(parsedLogs)) {
            setLogs((prevLogs) => [...prevLogs, ...parsedLogs]);
          } else {
            setLogs((prevLogs) => [
              ...prevLogs,
              {
                timestamp: data.timestamp,
                logs: JSON.stringify(parsedLogs),
              },
            ]);
            // console.error("Parsed message is not an array:", parsedLogs);
          }
        } catch (error) {
          console.error("Error processing message:", error);
          console.error("Problematic data:", data.message);
        }
      };

      eventSource.onerror = (event) => {
        console.error("EventSource failed:", event);
        eventSource.close();
      };
    };

    setupEventSource();

    return () => {
      unmounted = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [runId, fetchToken]); // Added runId to the dependency array

  return (
    <div className="h-[300px] w-full">
      <LogsViewer logs={logs} stickToBottom hideTimestamp />
    </div>
  );
}

type WebhookData = {
  timestamp: string;
  type: string;
  message: {
    status: number;
    latency_ms: number;
    message?: string;
    payload?: string;
  };
};

function WebhookTab({ run, webhook }: { run: any; webhook: string }) {
  const fetchToken = useAuthStore((state) => state.fetchToken);
  const [webhookEvents, setWebhookEvents] = useState<WebhookData[]>([]);
  const [expandedEventIndex, setExpandedEventIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let eventSource: EventSource;
    let unmounted = false;

    setWebhookEvents([]);
    setExpandedEventIndex(null);

    const setupEventSource = async () => {
      const token = await fetchToken();

      if (unmounted) return;

      const url = new URL(
        getApiRouteUrl("/v2/stream-logs"),
      );
      url.searchParams.append("run_id", run.id);
      url.searchParams.append("log_level", "webhook");

      eventSource = new EventSourcePolyfill(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }) as unknown as EventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "keepalive") return;

        try {
          const parsedMessage = JSON.parse(data.message);
          const webhookData: WebhookData = {
            timestamp: data.timestamp,
            type: data.type,
            message: parsedMessage,
          };

          setWebhookEvents((prev) => [...prev, webhookData]);
        } catch (error) {
          console.error("Error parsing webhook data:", error);
        }
      };

      eventSource.onerror = (event) => {
        console.error("EventSource failed:", event);
        eventSource.close();
      };
    };

    setupEventSource();

    return () => {
      unmounted = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [run.id, fetchToken]);

  const toggleExpand = (index: number) => {
    setExpandedEventIndex(expandedEventIndex === index ? null : index);
  };

  const formatTime = (timestamp: string) => {
    return parseTimestampSafely(timestamp).toLocaleTimeString();
  };

  const formatDateTime = (timestamp: string) => {
    return parseTimestampSafely(timestamp).toLocaleString();
  };

  const formatLatency = (ms: number) => {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${ms.toFixed(0)}ms`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <LinkIcon size={14} />
          <span className="text-sm">URL</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="overflow-hidden text-ellipsis text-muted-foreground text-xs">
            {webhook}
          </span>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="border-b bg-muted/40 px-3 py-2">
          <h3 className="text-sm">Events</h3>
        </div>

        <ScrollArea className="h-[300px]">
          <ul className="divide-y">
            {webhookEvents
              .slice()
              .reverse()
              .map((event, index) => {
                return (
                  <li key={index} className="px-3 py-2">
                    {/* biome-ignore lint/a11y/useButtonType: <explanation> */}
                    <button
                      onClick={() => toggleExpand(index)}
                      className="flex w-full items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        {event.message.status === 200 ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <XCircle size={16} className="text-red-500" />
                        )}
                        <span className="text-2xs text-muted-foreground">
                          {formatTime(event.timestamp)}
                        </span>
                        <Badge
                          variant={
                            event.message.status === 200
                              ? "green"
                              : "destructive"
                          }
                          className="!text-2xs !py-0"
                        >
                          {event.message.status}
                        </Badge>
                        {event.message.payload && (
                          <ErrorBoundary
                            fallback={() => {
                              return (
                                <Badge
                                  variant="outline"
                                  className="!text-2xs !py-0"
                                >
                                  -
                                </Badge>
                              );
                            }}
                          >
                            <Badge
                              variant="outline"
                              className="!text-2xs !py-0"
                            >
                              {JSON.parse(event.message.payload)?.event_type}
                            </Badge>
                          </ErrorBoundary>
                        )}
                      </div>
                      <div className="flex items-center">
                        <span className="mr-2 font-mono text-2xs text-muted-foreground">
                          {formatLatency(event.message.latency_ms)}
                        </span>
                        <ChevronDown
                          size={16}
                          className={cn(
                            "text-muted-foreground transition-transform",
                            expandedEventIndex === index
                              ? "rotate-180 transform"
                              : "",
                          )}
                        />
                      </div>
                    </button>

                    {expandedEventIndex === index && (
                      <div className="mt-2 rounded bg-muted/40 p-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="font-medium">Created at</p>
                            <p className="text-muted-foreground">
                              {formatDateTime(event.timestamp)}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium">Status</p>
                            <p className="text-muted-foreground">
                              {event.message.status}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium">Latency</p>
                            <p className="font-mono text-muted-foreground">
                              {formatLatency(event.message.latency_ms)}
                            </p>
                          </div>
                          {event.message.payload && (
                            <div className="col-span-2">
                              <p className="font-medium">Payload</p>
                              <CodeBlock
                                className="h-[200px] text-2xs"
                                code={JSON.stringify(
                                  JSON.parse(event.message.payload),
                                  null,
                                  2,
                                )}
                                lang="json"
                              />
                            </div>
                          )}
                          {event.message.message && (
                            <div className="col-span-2">
                              <p className="font-medium">Error Message</p>
                              <div className="mt-1 rounded bg-gray-100 p-2 font-mono text-2xs">
                                <pre className="whitespace-pre-wrap break-words text-red-600">
                                  {typeof event.message.message === "string"
                                    ? event.message.message
                                    : JSON.stringify(
                                        event.message.message,
                                        null,
                                        2,
                                      )}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}

            {run.status !== "success" &&
              run.status !== "failed" &&
              run.status !== "cancelled" && (
                <div className="flex items-center justify-center p-2 text-2xs text-muted-foreground">
                  <Loader2 className="mr-2 h-[14px] w-[14px] animate-spin" />
                  Waiting for webhook events...
                </div>
              )}
          </ul>
        </ScrollArea>
      </div>
    </div>
  );
}

type RunLog = {
  run_id: string;
  timestamp: string;
  log: string;
};

function FinishedRunLogDisplay({
  runId,
  modalFnCallId,
  runUpdatedAt,
}: {
  runId: string;
  modalFnCallId: string;
  runUpdatedAt: string;
}) {
  const { data: runLogs, isLoading } = useQuery<RunLog[]>({
    queryKey: ["v2", "clickhouse-run-logs", runId],
    enabled: !!runId,
  });

  const [showRawLogs, setShowRawLogs] = useState(false);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

  // Add check for logs older than 30 days
  const isLogsExpired = useMemo(() => {
    if (!runUpdatedAt) return false;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return new Date(runUpdatedAt) < thirtyDaysAgo;
  }, [runUpdatedAt]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (isLogsExpired) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex max-w-md flex-col items-center rounded-lg border border-muted bg-muted/30 px-6 py-8 text-center shadow-md">
          <div className="mb-2 rounded-full bg-muted/50 p-3">
            <Archive className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mb-1 font-medium text-sm">
            Log Retention Limit Reached
          </h3>
          <p className="text-muted-foreground text-xs leading-5">
            These logs are no longer available as they have exceeded our 30-day
            retention period.
          </p>
        </div>
      </div>
    );
  }

  if (!runLogs || runLogs.length === 0) {
    return (
      <div>
        {modalFnCallId ? (
          <LogsTab runId={runId} />
        ) : (
          <Alert
            variant="default"
            className="w-auto max-w-md border-muted bg-muted/50"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-muted-foreground text-sm">
              We're unable to display logs for runs from the workspace.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border">
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5 font-medium text-xs">
        <span>Logs</span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              "h-6 rounded-none text-[10px]",
              !showRawLogs
                ? "-mb-[2px] border-primary border-b-2 bg-muted/80"
                : "text-muted-foreground",
            )}
            onClick={() => setShowRawLogs(false)}
          >
            Grouped
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              "h-6 rounded-none text-[10px]",
              showRawLogs
                ? "-mb-[2px] border-primary border-b-2 bg-muted/80"
                : "text-muted-foreground",
            )}
            onClick={() => setShowRawLogs(true)}
          >
            Raw
          </Button>
        </div>
      </div>

      {showRawLogs ? (
        <div>
          {modalFnCallId ? (
            <LogsTab runId={runId} />
          ) : (
            <Alert
              variant="default"
              className="w-auto max-w-md border-muted bg-muted/50"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-muted-foreground text-sm">
                We're unable to display logs for runs from the workspace.
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <>
          <div className="group relative">
            <Button
              className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setIsLogDialogOpen(true)}
            >
              <Expand className="h-4 w-4" />
            </Button>
            <ScrollArea>
              <div className="h-[calc(100vh-550px)]">
                <FormattedRunLogs runLogs={runLogs} />
              </div>
            </ScrollArea>
          </div>
          <Dialog open={isLogDialogOpen} onOpenChange={setIsLogDialogOpen}>
            <DialogContent className="max-h-[80vh] max-w-screen-2xl">
              <DialogHeader>
                <DialogTitle>Grouped Logs</DialogTitle>
                <DialogDescription>
                  <span className="font-mono text-2xs">#{runId}</span>
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="h-[calc(80vh-100px)]">
                <FormattedRunLogs runLogs={runLogs} />
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function FormattedRunLogs({ runLogs }: { runLogs: RunLog[] }) {
  const formatLogContent = (logText: string) => {
    if (!logText) return;

    try {
      const jsonData = JSON.parse(logText);

      // Handle validation error format
      if (jsonData.error?.error?.type === "prompt_outputs_failed_validation") {
        const nodeErrors = jsonData.error.node_errors;
        const firstError = Object.values(nodeErrors)[0] as any;

        return (
          <div className="space-y-2">
            {/* Simplified error message */}
            <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/50">
              <div className="font-medium text-2xs text-destructive dark:text-red-400">
                {firstError.errors[0].message}
              </div>
            </div>

            {/* Full error details in collapsible */}
            <details>
              <summary className="cursor-pointer font-medium text-2xs text-muted-foreground">
                View full error details
              </summary>
              <pre className="mt-1 rounded bg-muted p-2 text-[10px] leading-snug">
                {JSON.stringify(jsonData, null, 2)}
              </pre>
            </details>
          </div>
        );
      }

      // If it's an exception log with traceback, format it specially
      if (jsonData.exception_message && jsonData.traceback) {
        return (
          <div className="text-2xs">
            <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/50">
              <div className="font-medium text-destructive dark:text-red-400">
                {jsonData.exception_type}: {jsonData.exception_message}
              </div>
            </div>
            <pre className="mt-1 rounded bg-muteds p-1 text-[10px] leading-snug">
              {jsonData.traceback.join("")}
            </pre>
            {jsonData.current_inputs && (
              <details className="mt-1">
                <summary className="cursor-pointer font-medium text-2xs">
                  Inputs
                </summary>
                <pre className="mt-1 rounded bg-muted p-1 text-[10px] leading-snug">
                  {JSON.stringify(jsonData.current_inputs, null, 2)}
                </pre>
              </details>
            )}
          </div>
        );
      }

      // Otherwise just pretty-print the JSON with improved formatting
      return (
        <pre className="whitespace-pre-wrap break-words rounded bg-muted p-1 text-[10px] leading-snug">
          {JSON.stringify(jsonData, null, 2)}
        </pre>
      );
    } catch {
      // Not JSON, return as plain text with word wrapping
      return (
        <div className="whitespace-pre-wrap text-2xs">
          {logText.replace(/\r/g, "\n")}
        </div>
      );
    }
  };

  return (
    <>
      {runLogs.map((entry, index) => {
        return (
          <div key={index} className="border-b px-3 py-1 hover:bg-muted/50">
            <div className="flex items-start gap-3">
              <div className="flex w-20 flex-shrink-0 justify-end">
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger>
                      <div className="mt-[3px] font-mono text-[10px] text-muted-foreground">
                        {parseTimestampSafely(
                          entry.timestamp,
                        ).toLocaleTimeString()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <div className="font-mono text-[11px]">
                        <div className="grid grid-cols-[70px_auto]">
                          <div>Date</div>
                          <div>
                            {parseTimestampSafely(
                              entry.timestamp,
                            ).toLocaleString()}
                          </div>
                          <div>Timestamp</div>
                          <div>{Number(entry.timestamp)}</div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex-grow">{formatLogContent(entry.log)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
