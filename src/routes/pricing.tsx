import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      ready: search.ready as boolean | undefined,
      plan: search.plan as string | undefined,
    };
  },
});
