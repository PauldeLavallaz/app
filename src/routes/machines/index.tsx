import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/machines/")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      view: search.view === "create" ? "create" : undefined,
      action:
        search.action === "update-custom-nodes"
          ? "update-custom-nodes"
          : undefined,
    };
  },
});
