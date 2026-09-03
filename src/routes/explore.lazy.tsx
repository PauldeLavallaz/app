import { createLazyFileRoute } from "@tanstack/react-router";
import { ExploreSharedWorkflows } from "@/components/explore-shared-workflows";

export const Route = createLazyFileRoute("/explore")({
  component: ExploreSharedWorkflows,
});
