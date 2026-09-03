import { useClerk, useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MyDrawer } from "@/components/drawer";
import { RunWorkflowInline } from "@/components/run/RunWorkflowInline";
import {
  getFormattedInputs,
  UserIcon,
  useRun,
} from "@/components/run/SharePageComponent";
import { Badge } from "@/components/ui/badge";
import { LoadingIcon } from "@/components/ui/custom/loading-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaygroundOutputRenderRun } from "@/components/workflows/OutputRender";
import { RunDetails } from "@/components/workflows/WorkflowComponent";
import { api } from "@/lib/api";
import { getDefaultValuesFromWorkflow } from "@/lib/getInputsFromWorkflow";
import { getApiRouteUrl } from "@/lib/runtime-config";

export const Route = createFileRoute("/share/$user/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user: userParam, slug } = useParams({ from: "/share/$user/$slug" });
  const { isSignedIn } = useUser();

  const { data: shareDeployment, isLoading } = useQuery({
    queryKey: ["share-deployment", userParam, slug],
    queryFn: async () => {
      if (isSignedIn) {
        // Use api function for authenticated users
        return api({
          url: `share/${userParam}/${slug}`,
        });
      } else {
        // Use regular fetch for unauthenticated users
        return fetch(
          getApiRouteUrl(`/share/${userParam}/${slug}`),
        ).then((res) => (res.ok ? res.json() : null));
      }
    },
    enabled: !!userParam && !!slug && isSignedIn !== undefined,
  });

  return (
    <div className="relative h-full w-full">
      {/* Useless Background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="pointer-events-none"
      >
        <div className="-translate-x-[20%] -translate-y-1/2 absolute inset-1/2 h-[450px] w-[450px] animate-[pulse_9s_ease-in-out_infinite] rounded-full bg-blue-400 bg-opacity-30 blur-3xl" />
        <div className="-translate-x-[90%] -translate-y-[10%] absolute inset-1/2 h-72 w-72 animate-[pulse_7s_ease-in-out_infinite] rounded-full bg-purple-400 bg-opacity-30 blur-3xl delay-300" />
        <div className="-translate-x-[90%] -translate-y-[120%] absolute inset-1/2 h-52 w-52 animate-[pulse_6s_ease-in-out_infinite] rounded-full bg-red-400 bg-opacity-40 blur-2xl delay-600" />
      </motion.div>

      {/* Share Deployment */}
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center">
          <LoadingIcon />
        </div>
      ) : !shareDeployment ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
          Share not found
        </div>
      ) : (
        <ShareDeployment shareDeployment={shareDeployment} />
      )}
    </div>
  );
}

function ShareDeployment({ shareDeployment }: { shareDeployment: any }) {
  const { isSignedIn } = useUser();
  const { user: userParam } = useParams({ from: "/share/$user/$slug" });
  const clerk = useClerk();
  const { data: orgName } = useQuery({
    enabled: !!shareDeployment?.org_id,
    queryKey: ["org", shareDeployment?.org_id],
    queryFn: () => {
      return clerk.getOrganization(shareDeployment?.org_id || "");
    },
  });

  const [pendingTweakRunId, setPendingTweakRunId] = useState<string | null>(
    null,
  );
  const [runId, setRunId] = useQueryState("run-id");

  // Separate query for tweak data to avoid interfering with the runs list
  const { data: tweakRun } = useRun(pendingTweakRunId || undefined);

  const [default_values, setDefaultValues] = useState(
    getDefaultValuesFromWorkflow(shareDeployment?.input_types),
  );

  useEffect(() => {
    setDefaultValues(
      getDefaultValuesFromWorkflow(shareDeployment?.input_types),
    );
  }, [shareDeployment?.input_types]);

  // Handle tweak functionality
  useEffect(() => {
    // Check if we have a pending tweak and the run data is now available
    if (pendingTweakRunId && tweakRun && tweakRun.id === pendingTweakRunId) {
      setDefaultValues(getFormattedInputs(tweakRun));
      toast.success("Input values updated from run.");
      setPendingTweakRunId(null);
      return;
    }
  }, [tweakRun, pendingTweakRunId]);

  // Listen for tweak events from the RunDetails component
  useEffect(() => {
    const handleTweakEvent = (event: CustomEvent) => {
      const { runId: tweakRunId } = event.detail;
      // Store the pending tweak - this will trigger the useRun hook for tweakRun
      setPendingTweakRunId(tweakRunId);
    };

    window.addEventListener("triggerTweak", handleTweakEvent as EventListener);

    return () => {
      window.removeEventListener(
        "triggerTweak",
        handleTweakEvent as EventListener,
      );
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[85rem] space-y-2 p-4 md:p-8">
      <div className="flex flex-row items-end gap-3">
        <h1 className="text-xl">{shareDeployment.workflow.name}</h1>
        <h2 className="text-muted-foreground text-sm">
          {shareDeployment.share_slug.split("_")[1]}
        </h2>
        {shareDeployment.environment === "public-share" ? (
          <Badge variant="green">Link Access</Badge>
        ) : shareDeployment.environment === "private-share" ? (
          <Badge variant="purple">Internal</Badge>
        ) : (
          <></>
        )}
      </div>
      {isSignedIn ? (
        <div className="flex flex-row items-center gap-1 text-muted-foreground">
          <UserIcon
            className="h-5 w-5"
            user_id={shareDeployment.user_id}
            displayName
          />
          {orgName && <span className="text-xs">•</span>}
          {orgName && <span className="text-xs">{orgName.name}</span>}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">{userParam}</span>
      )}
      <div className="line-clamp-2 max-w-3xl text-muted-foreground/80 text-sm">
        {shareDeployment.description}
      </div>
      <div className="flex flex-col gap-10 pt-2 lg:flex-row lg:items-start">
        <div className="run-workflow-inline w-full max-w-[500px] rounded-xl border border-gray-200 bg-white/50 p-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-xl dark:border-zinc-800 dark:bg-zinc-900/50">
          <RunWorkflowInline
            blocking={false}
            default_values={default_values}
            inputs={shareDeployment?.input_types}
            runOrigin={shareDeployment.environment}
            deployment_id={shareDeployment.id}
            scrollAreaClassName="[&>[data-radix-scroll-area-viewport]]:max-h-[60vh] pt-0"
          />
        </div>
        <div className="@container flex w-full flex-col gap-4">
          <span className="text-muted-foreground">Recent Runs</span>
          <RecentRunsGallery
            deploymentId={shareDeployment.id}
            modalRunId={runId}
            setModalRunId={setRunId}
          />
        </div>
      </div>
    </div>
  );
}

function RecentRunsGallery({
  deploymentId,
  modalRunId,
  setModalRunId,
}: {
  deploymentId: string;
  modalRunId: string | null;
  setModalRunId: (runId: string | null) => void;
}) {
  const { isSignedIn } = useUser();
  const { data: runs, isLoading } = useQuery({
    queryKey: ["deployment", deploymentId, "runs"],
    enabled: isSignedIn,
    refetchInterval: 3000,
  });

  const handleCloseRun = () => {
    setModalRunId(null);
  };

  if (!isSignedIn) {
    return (
      <div className="flex w-full items-center justify-center py-10">
        <span className="text-muted-foreground/80 text-sm">
          No recent runs found
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid w-full grid-cols-2 gap-2 opacity-60 @md:grid-cols-3 @lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={`skeleton-${i}`}
            className="aspect-square w-full rounded-[10px]"
          />
        ))}
      </div>
    );
  }

  if (!(runs as any)?.data?.length) {
    return (
      <div className="flex w-full items-center justify-center py-10">
        <span className="text-muted-foreground/80 text-sm">
          No recent runs found
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="grid w-full grid-cols-2 gap-2 @md:grid-cols-3 @lg:grid-cols-4">
        {(runs as any)?.data?.map((run: any, index: number) => (
          <button
            type="button"
            onClick={() => setModalRunId(run.id)}
            key={`run-${run.id}-${index}`}
            className="overflow-hidden rounded-[10px]"
          >
            <RunCard runId={run.id} />
          </button>
        ))}
      </div>

      {modalRunId && (
        <MyDrawer
          desktopClassName="w-[600px] ring-1 ring-gray-200 shadow-xl dark:ring-zinc-700/80"
          open={!!modalRunId}
          onClose={() => {
            handleCloseRun();
          }}
        >
          <RunDetails
            run_id={modalRunId}
            onClose={handleCloseRun}
            isShare={true}
          />
        </MyDrawer>
      )}
    </>
  );
}

function RunCard({ runId }: { runId: string }) {
  const { data: run, isLoading } = useRun(runId);

  if (isLoading) {
    return <Skeleton className="aspect-square w-full rounded-[10px]" />;
  }

  return (
    <PlaygroundOutputRenderRun
      run={run}
      imgClasses="aspect-square object-cover rounded-[10px] shrink-0 overflow-hidden hover:scale-105 transition-transform duration-300"
      isSharePage
    />
  );
}
