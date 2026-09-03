import { MachineCreate } from "@/components/machines/machine-create";
import { MachineList } from "@/components/machines/machine-list";
import { useCurrentPlan } from "@/hooks/use-current-plan";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentPlanWithStatus } from "@/hooks/use-current-plan";
import { getMachineLimits } from "@/lib/autumn-helpers";
export const Route = createLazyFileRoute("/machines/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate({ from: "/machines" });
  const sub = useCurrentPlan();
  const { view } = Route.useSearch();
  const { data: planStatus } = useCurrentPlanWithStatus();
  const { isLimited: machineLimited } = getMachineLimits(planStatus, undefined, sub);

  useKeyboardShortcut(
    "c",
    () => {
      if (!machineLimited) {
        navigate({
          search: { view: "create" as const, action: undefined },
        });
      }
    },
    {
      exactPath: "/machines",
    },
  );

  if (view === "create") {
    return <MachineCreate />;
  }

  return <MachineList />;
}
