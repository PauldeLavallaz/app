import { Fab } from "@/components/fab";
import WorkflowImport from "@/components/onboarding/workflow-import";
import { useIsAdminAndMember } from "@/components/permissions";
import { WorkflowList } from "@/components/workflow-list";
import { useCurrentPlan, useCurrentPlanWithStatus } from "@/hooks/use-current-plan";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { AutumnDataV2Response } from "@/types/autumn-v2";
import { useQuery } from "@tanstack/react-query";
import { getWorkflowLimits } from "@/lib/autumn-helpers";

export const Route = createLazyFileRoute("/workflows/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate({ from: "/workflows" });
  const { view } = Route.useSearch();
  const sub = useCurrentPlan();
  const { data: planStatus } = useCurrentPlanWithStatus();
  const { data: autumnResp } = useQuery<AutumnDataV2Response>({ queryKey: ["platform", "autumn-data"] });
  const { isLimited: workflowLimited } = getWorkflowLimits(planStatus, autumnResp, sub);
  const isAdminOrMember = useIsAdminAndMember();

  useKeyboardShortcut(
    "c",
    () => {
      if (!workflowLimited) {
        navigate({
          search: { view: "import" },
        });
      }
    },
    {
      exactPath: "/workflows",
    },
  );

  return (
    <>
      {view === "import" ? <WorkflowImport /> : <WorkflowList />}

      {!view && (
        <Fab
          refScrollingContainerKey="fab-workflow-list [data-radix-scroll-area-viewport]"
          mainItem={{
            name: "Create Workflow",
            icon: Plus,
            onClick: () => {
              if (!workflowLimited && isAdminOrMember) {
                navigate({
                  search: { view: "import" },
                });
              }
            },
          }}
          disabled={{
            disabled: workflowLimited || !isAdminOrMember,
            disabledText: "Workflows Limited Exceeded. ",
          }}
        />
      )}
    </>
  );
}
