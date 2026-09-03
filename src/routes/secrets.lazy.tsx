import { SecretsList } from "@/components/secrets/secrets-list";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/secrets")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SecretsList />;
}
