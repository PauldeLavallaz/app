import { useUser } from "@clerk/clerk-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import {
  AlertCircle,
  Globe,
  Grid2X2,
  LayoutList,
  MoreHorizontal,
  PinIcon,
  PinOff,
  Server,
  Workflow,
} from "lucide-react";
import { useQueryState } from "nuqs";
import * as React from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { CloneWorkflowDialog } from "@/components/clone-workflow-dialog";
import { DialogTemplate } from "@/components/dialog-template";
import { AdminAndMember, useIsAdminAndMember } from "@/components/permissions";
import { ShareWorkflowDialog } from "@/components/share-workflow-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deleteWorkflow,
  pinWorkflow,
  renameWorkflow,
} from "@/components/workflow-api";
import {
  getEnvColor,
  useWorkflowDeployments,
} from "@/components/workspace/ContainersTable";
import {
  useCurrentPlan,
  useCurrentPlanQuery,
  useCurrentPlanWithStatus,
} from "@/hooks/use-current-plan";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMachine } from "@/hooks/use-machine";
import { getWorkflowLimits } from "@/lib/autumn-helpers";
import { callServerPromise } from "@/lib/call-server-promise";
import { cn } from "@/lib/utils";
import type {
  AutumnDataV2Response,
  Feature as AutumnFeature,
} from "@/types/autumn-v2";
import { useWorkflowList } from "../hooks/use-workflow-list";
import { getRelativeTime } from "../lib/get-relative-time";
import { UserIcon } from "./run/SharePageComponent";
import { UnifiedFilterSelect } from "./unified-filter-select";
import { FileURLRender } from "./workflows/OutputRender";

export function useWorkflowVersion(
  workflow_id?: string,
  debouncedSearchValue?: string,
) {
  const BATCH_SIZE = 10;
  return useInfiniteQuery<any[]>({
    queryKey: ["workflow", workflow_id, "versions"],
    enabled: !!workflow_id,
    queryKeyHashFn: (queryKey) =>
      [...queryKey, "versions", debouncedSearchValue].toString(),
    meta: {
      limit: BATCH_SIZE,
      offset: 0,
      params: {
        search: debouncedSearchValue ?? "",
      },
    },
    getNextPageParam: (lastPage, allPages) => {
      // Check if lastPage is defined and has a length property
      if (
        lastPage &&
        Array.isArray(lastPage) &&
        lastPage.length === BATCH_SIZE
      ) {
        return allPages.length * BATCH_SIZE;
      }
      return undefined;
    },
    initialPageParam: 0,
  });
}

export function WorkflowList() {
  const [view, setView] = useLocalStorage<"list" | "grid">(
    "workflow-view-mode",
    "grid",
  );

  const user = useUser();

  const sub = useCurrentPlan();
  const { data: planStatus } = useCurrentPlanWithStatus();
  const { data: autumnResp } = useQuery<AutumnDataV2Response>({
    queryKey: ["platform", "autumn-data"],
  });
  const { isLoading: isAutumnLoading } = useCustomer();
  const {
    isLimited: isWorkflowLimited,
    limit: workflowLimit,
    currentCount: currentWorkflowCount,
    feature: workflowLimitFeature,
  } = getWorkflowLimits(planStatus, autumnResp, sub);

  // console.log(workflowLimitFeature);
  // console.log(workflowLimit);
  // console.log(isWorkflowLimited);
  // console.log(currentWorkflowCount);

  // Convert to URL query parameters
  const [searchValue, setSearchValue] = useQueryState("search");
  const [debouncedSearchValue] = useDebounce(searchValue, 250);
  const [selectedUserIds, setSelectedUserIds] = useQueryState("user", {
    defaultValue: "",
  });
  const [selectedMachineId, setSelectedMachineId] = useQueryState("machine", {
    defaultValue: "",
  });

  const {
    data: workflowsFromPythonApi,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWorkflowList(
    debouncedSearchValue ?? "",
    selectedUserIds,
    selectedMachineId,
  );

  const parentRef = React.useRef<HTMLDivElement>(null);
  useInfiniteScroll(parentRef, fetchNextPage, hasNextPage, isFetchingNextPage);

  const flatData = React.useMemo(
    () => workflowsFromPythonApi?.pages.flat() ?? [],
    [workflowsFromPythonApi],
  );

  React.useEffect(() => {
    refetch();
  }, [debouncedSearchValue]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex w-full flex-row items-center gap-2 p-4">
        <div className="relative max-w-sm flex-1">
          <Input
            placeholder="Filter workflows..."
            value={searchValue ?? ""}
            onChange={(event) => {
              if (event.target.value === "") {
                setSearchValue(null);
              } else {
                setSearchValue(event.target.value);
              }
            }}
            className="pr-12" // Add padding to prevent text overlap with kbd
          />
          <kbd className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>

        <div className="ml-auto flex gap-2">
          {/* Unified filter component */}
          <UnifiedFilterSelect
            onUserFilterChange={setSelectedUserIds}
            onMachineFilterChange={setSelectedMachineId}
          />

          {/* Grid/list toggle moved to the right */}
          <div className="flex h-9 rounded-md border bg-background shadow-sm">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-full"
              onClick={() => setView("grid")}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setView("list")}
              className="h-full"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </Button>
          </div>

          <AdminAndMember>
            <Tooltip>
              <TooltipTrigger>
                {isAutumnLoading ? (
                  <Skeleton className="hidden h-6 w-12 sm:block" />
                ) : (
                  workflowLimitFeature && (
                    <Badge
                      className={cn(
                        "hidden sm:block",
                        !isWorkflowLimited
                          ? "border-gray-400 text-gray-500"
                          : "",
                      )}
                    >
                      <div className="flex items-center gap-2 px-2 text-xs">
                        {currentWorkflowCount}/{workflowLimit}
                      </div>
                    </Badge>
                  )
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isAutumnLoading
                    ? "Loading workflow limits..."
                    : `Current workflows: ${currentWorkflowCount} / Max: ${workflowLimit}`}
                </p>
              </TooltipContent>
            </Tooltip>
          </AdminAndMember>
        </div>
      </div>
      <ScrollArea className="fab-workflow-list flex-grow" ref={parentRef}>
        {isLoading ? (
          <div
            className={cn(
              view === "grid"
                ? "mx-auto grid w-full max-w-screen-2xl grid-cols-1 justify-items-center gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "mx-auto flex w-full max-w-screen-2xl flex-col px-4 pb-4",
            )}
          >
            {Array.from({ length: 8 }, (_, index) => (
              <WorkflowCardSkeleton key={index} view={view} />
            ))}
          </div>
        ) : flatData?.length === 0 ? (
          <div className="absolute inset-0 flex h-full flex-col items-center justify-center p-4 text-center">
            {debouncedSearchValue || selectedUserIds || selectedMachineId ? (
              <>
                <h3 className="mb-2 font-semibold text-lg">No results found</h3>
                <p className="mb-4 text-muted-foreground">
                  Try adjusting your search or filter to find what you're
                  looking for.
                </p>
              </>
            ) : (
              <>
                <h3 className="mb-2 font-semibold text-lg">
                  Welcome{" "}
                  {user.user?.username ??
                    `${user.user?.firstName ?? ""} ${user.user?.lastName ?? ""}`}
                </h3>
                <p className="mb-4 text-muted-foreground">
                  Click the + button in the bottom right to create your first
                  workflow
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            className={cn(
              view === "grid"
                ? "mx-auto grid w-full max-w-screen-2xl grid-cols-1 justify-items-center gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "mx-auto flex w-full max-w-screen-2xl flex-col px-4 pb-4",
            )}
          >
            {flatData?.map((workflow) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                mutate={refetch}
                view={view}
              />
            ))}
            {isFetchingNextPage &&
              Array.from({ length: 4 }, (_, index) => (
                <WorkflowCardSkeleton key={index} view={view} />
              ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function WorkflowCardSkeleton({ view = "grid" }: { view?: "list" | "grid" }) {
  if (view === "grid") {
    return (
      <div className="flex w-full flex-col md:max-w-[320px]">
        <Card className="group relative flex aspect-square w-full flex-col overflow-hidden rounded-md">
          <div className="flex h-full w-full flex-col items-center justify-center">
            <Skeleton className="mb-2 h-10 w-10 rounded-full" />
          </div>
          <div className="absolute top-2 right-2">
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </Card>
        <div className="flex flex-col px-2 pt-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="mt-1 flex justify-between">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-4 border-b py-4 px-3">
      <Skeleton className="h-12 w-12 rounded-md" />
      <div className="flex-grow min-w-0">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="mt-1 flex justify-between">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  );
}

// Component to display publication status
function PublicationStatusBadge({ workflowId }: { workflowId: string }) {
  const { data: sharedWorkflows } = useQuery({
    queryKey: ["workflow", workflowId, "shared-status"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const existingShare = sharedWorkflows?.shared_workflows?.find(
    (share: any) => share.workflow_id === workflowId,
  );

  if (!existingShare) return null;

  return (
    <Badge
      variant="default"
      className="bg-green-600/80 text-white text-xs backdrop-blur-sm hover:bg-green-700/80 dark:bg-green-500/80 dark:text-white dark:hover:bg-green-600/80"
    >
      <Globe className="h-3 w-3" />
      Explore
    </Badge>
  );
}

// Component to display deployment status for production/staging
function DeploymentStatusBadges({ workflowId }: { workflowId: string }) {
  const { data: deployments } = useWorkflowDeployments(workflowId);

  const productionDeployment = deployments?.find(
    (d: any) => d.environment === "production",
  );
  const stagingDeployment = deployments?.find(
    (d: any) => d.environment === "staging",
  );

  if (!productionDeployment && !stagingDeployment) return null;

  return (
    <div className="hidden gap-1 md:flex">
      {productionDeployment && (
        <Badge className={cn("!text-2xs", getEnvColor("production"))}>
          Production
        </Badge>
      )}
      {stagingDeployment && (
        <Badge className={cn("!text-2xs", getEnvColor("staging"))}>
          Staging
        </Badge>
      )}
    </div>
  );
}

// Shared actions dropdown component
function WorkflowActionsDropdown({
  workflow,
  mutate,
  setDeleteModalOpen,
  openRenameDialog,
  setCloneModalOpen,
  setShareModalOpen,
  variant = "grid",
}: {
  workflow: any;
  mutate: () => void;
  setDeleteModalOpen: (open: boolean) => void;
  openRenameDialog: (e: React.MouseEvent<HTMLDivElement>) => void;
  setCloneModalOpen: (open: boolean) => void;
  setShareModalOpen: (open: boolean) => void;
  variant?: "grid" | "list";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-8 w-8 p-0",
            variant === "grid"
              ? "bg-black/30 text-white opacity-0 transition-all duration-300 group-hover:opacity-100 data-[state=open]:opacity-100"
              : "rounded-full hover:bg-muted",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Workflow Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={(e) => openRenameDialog(e)}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setCloneModalOpen(true);
          }}
        >
          Clone
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShareModalOpen(true);
          }}
        >
          <div className="flex w-full items-center justify-between gap-3">
            Publish to Explore
            <Globe className="h-4 w-4" />
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive dark:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setDeleteModalOpen(true);
          }}
        >
          Delete
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const newPinnedState = !workflow.pinned;
            await callServerPromise(pinWorkflow(workflow.id, newPinnedState), {
              loadingText: newPinnedState
                ? "Pinning workflow"
                : "Unpinning workflow",
              successMessage: `${workflow.name} ${newPinnedState ? "pinned" : "unpinned"} successfully`,
            });
            mutate();
          }}
        >
          <div className="flex w-full items-center justify-between">
            {workflow.pinned ? "Unpin" : "Pin"}
            {workflow.pinned ? (
              <PinOff className="h-4 w-4 rotate-45" />
            ) : (
              <PinIcon className="h-4 w-4 rotate-45" />
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkflowCard({
  workflow,
  mutate,
  className,
  view = "grid",
}: {
  workflow: any;
  mutate: () => void;
  className?: string;
  view?: "list" | "grid";
}) {
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [cloneModalOpen, setCloneModalOpen] = React.useState(false);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState<string>();
  const [renameValue, setRenameValue] = React.useState("");
  const { data: machine } = useMachine(workflow?.selected_machine_id);

  const { refetch: refetchPlan } = useCurrentPlanQuery();
  const navigate = useNavigate();
  const { refetch: refetchCustomer } = useCustomer();

  const openRenameDialog = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setRenameValue(workflow.name);
    setModalOpen("rename");
  };

  const isAdminAndMember = useIsAdminAndMember();

  const { data: latest_runs } = useQuery<any[]>({
    queryKey: ["workflow", workflow.id, "run", "latest"],
    queryKeyHashFn: (queryKey) => [...queryKey, "latest"].toString(),
  });

  const latest_output = latest_runs?.[0]?.outputs?.[0]?.data;
  const lastest_run_at = latest_runs?.[0]?.created_at;
  const status = latest_runs?.[0]?.status;

  return (
    <>
      <CloneWorkflowDialog
        workflow={workflow}
        open={cloneModalOpen}
        onOpenChange={setCloneModalOpen}
        onSuccess={(newWorkflow) => {
          mutate();
          toast.info(`Redirecting to ${newWorkflow.name}...`);
          navigate({
            to: `/workflows/${newWorkflow.id}/workspace`,
          });
        }}
      />
      <ShareWorkflowDialog
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        workflowId={workflow.id}
        workflowName={workflow.name || "Untitled Workflow"}
        workflowDescription={workflow.description}
        workflowCoverImage={workflow.cover_image ?? latest_output?.images?.[0]?.url}
      />
      <DialogTemplate
        open={modalOpen === "rename"}
        onOpenChange={(open) => {
          if (!open) setModalOpen(undefined);
          setRenameValue(workflow.name);
        }}
        title="Rename"
        onCancel={() => setModalOpen(undefined)}
        onConfirm={async () => {
          setModalOpen(undefined);
          await callServerPromise(renameWorkflow(workflow.id, renameValue), {
            loadingText: "Renaming workflow",
            successMessage: `${workflow.name} renamed successfully`,
          });
          mutate();
        }}
        onConfirmBtnProps={{
          disabled: renameValue === "" || renameValue === workflow.name,
          className:
            renameValue === "" || renameValue === workflow.name
              ? "opacity-50"
              : "",
        }}
        workflowName={workflow.name}
      >
        <Label className="pb-4">
          Please enter a new name for this workflow.
        </Label>
        <Input
          className="mt-3"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
        />
      </DialogTemplate>
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className={cn("sm:max-w-[425px]")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {"Delete"} <Badge variant={"secondary"}>{workflow.name}</Badge>
            </DialogTitle>
            <DialogDescription className="text-primary">
              Careful this is destructive and cannot be undone.
              <Alert variant="warning" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  Any existing runs will keep running, before deleting make sure
                  your workflow is not currently running.
                </AlertDescription>
              </Alert>
            </DialogDescription>
          </DialogHeader>
          <div className="flex w-full justify-end gap-2">
            <Button
              className="w-fit"
              variant={"outline"}
              onClick={() => {
                setDeleteModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              className="w-fit"
              variant="destructive"
              onClick={async () => {
                await callServerPromise(deleteWorkflow(workflow.id), {
                  loadingText: "Deleting workflow",
                  successMessage: `${workflow.name} deleted successfully`,
                });
                await refetchPlan();
                await refetchCustomer();
                mutate();
                setDeleteModalOpen(false);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Link
        to={
          isAdminAndMember
            ? `/workflows/${workflow.id}/workspace`
            : `/workflows/${workflow.id}/playground`
        }
        className={cn(
          view === "grid"
            ? "flex w-full flex-col md:max-w-[320px]"
            : "flex w-full items-center gap-4 border-b py-4 px-3 hover:bg-muted/50 transition-colors",
          className,
        )}
      >
        {view === "grid" ? (
          <>
            <Card className="group relative flex aspect-square w-full flex-col overflow-hidden rounded-md transition-all duration-300 ease-in-out hover:shadow-lg dark:hover:shadow-zinc-800">
              <div className="h-full w-full">
                {workflow.cover_image || latest_output?.images?.[0]?.url ? (
                  <FileURLRender
                    url={workflow.cover_image ?? latest_output.images[0].url}
                    imgClasses="w-full h-full aspect-square rounded-[8px] object-cover transition-all duration-300 ease-in-out group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center dark:bg-gradient-to-br dark:from-zinc-800/80 dark:to-zinc-700/80 dark:backdrop-blur-md">
                    <Workflow
                      size={40}
                      strokeWidth={1.5}
                      className="mb-2 text-gray-400"
                    />
                  </div>
                )}
              </div>
              <div className="absolute top-2 right-2">
                <AdminAndMember>
                  <WorkflowActionsDropdown
                    workflow={workflow}
                    mutate={mutate}
                    setDeleteModalOpen={setDeleteModalOpen}
                    openRenameDialog={openRenameDialog}
                    setCloneModalOpen={setCloneModalOpen}
                    setShareModalOpen={setShareModalOpen}
                    variant="grid"
                  />
                </AdminAndMember>
              </div>

              <div className="absolute top-4 left-4 flex items-center gap-2">
                {workflow.pinned && (
                  <PinIcon className="rotate-45 text-white drop-shadow-md" />
                )}
                <PublicationStatusBadge workflowId={workflow.id} />
              </div>
            </Card>
            <div className="flex flex-col px-2 pt-2">
              <div className="flex w-full flex-row justify-between truncate font-medium text-gray-700 text-md dark:text-gray-300">
                <div className="mr-2 truncate text-sm">{workflow.name}</div>
                {status && (
                  <Badge
                    variant={status === "success" ? "success" : "secondary"}
                    className="shrink-0"
                  >
                    {status}
                  </Badge>
                )}
              </div>
              <div className="flex flex-row justify-between">
                <div className="flex items-center gap-2 truncate text-muted-foreground text-xs">
                  {workflow.user_id && (
                    <UserIcon user_id={workflow.user_id} className="h-4 w-4" />
                  )}
                  {workflow.user_name || "Unknown"}
                </div>
                <div className="shrink-0 text-2xs text-muted-foreground">
                  {lastest_run_at ? (
                    getRelativeTime(lastest_run_at)
                  ) : (
                    <Skeleton className="h-4 w-16" />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* List view - Figma-like clean design */}
            <div className="flex items-center gap-4 w-full">
              {/* Thumbnail with better sizing and shadows */}
              <div className="w-14 h-14 shrink-0 rounded-md overflow-hidden shadow-sm">
                {workflow.cover_image || latest_output?.images?.[0]?.url ? (
                  <FileURLRender
                    url={workflow.cover_image ?? latest_output.images[0].url}
                    imgClasses="w-full h-full object-cover aspect-square"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                    <Workflow
                      size={24}
                      strokeWidth={1.5}
                      className="text-gray-400"
                    />
                  </div>
                )}
              </div>

              {/* Content area with better spacing */}
              <div className="flex-grow min-w-0 py-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate text-sm text-foreground">
                    {workflow.name}
                  </h3>
                  {workflow.pinned && (
                    <PinIcon className="h-3 w-3 rotate-45 text-muted-foreground shrink-0" />
                  )}
                  <PublicationStatusBadge workflowId={workflow.id} />
                  {status && (
                    <Badge
                      variant={status === "success" ? "success" : "secondary"}
                      className="shrink-0 text-[10px] h-5 px-1.5"
                    >
                      {status}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1.5 truncate text-muted-foreground text-xs">
                    {workflow.user_id && (
                      <UserIcon
                        user_id={workflow.user_id}
                        className="h-3.5 w-3.5"
                      />
                    )}
                    <span className="truncate">
                      {workflow.user_name || "Unknown"}
                    </span>
                  </div>
                  <div className="h-3 w-[1px] bg-border shrink-0" />
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {lastest_run_at ? (
                      getRelativeTime(lastest_run_at)
                    ) : (
                      <Skeleton className="h-3.5 w-16" />
                    )}
                  </div>
                </div>
              </div>

              {machine && (
                <div className="hidden items-center gap-2 md:flex">
                  <Server className="h-3.5 w-3.5" />
                  <div className="line-clamp-1 text-muted-foreground text-xs">
                    {machine.name}
                  </div>
                </div>
              )}

              <DeploymentStatusBadges workflowId={workflow.id} />

              {/* Actions area */}
              <div className="shrink-0 flex items-center">
                <AdminAndMember>
                  <WorkflowActionsDropdown
                    workflow={workflow}
                    mutate={mutate}
                    setDeleteModalOpen={setDeleteModalOpen}
                    openRenameDialog={openRenameDialog}
                    setCloneModalOpen={setCloneModalOpen}
                    setShareModalOpen={setShareModalOpen}
                    variant="list"
                  />
                </AdminAndMember>
              </div>
            </div>
          </>
        )}
      </Link>
    </>
  );
}
