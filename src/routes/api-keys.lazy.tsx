import { APIKeyList } from "@/components/api-key-list";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/api-keys")({
  component: RouteComponent,
});

function RouteComponent() {
  return <APIKeyList />;
}
