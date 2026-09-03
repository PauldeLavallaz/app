import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button"; // Assuming you have this UI component
import { getAdminBaseUrl } from "@/lib/runtime-config";
import { useOrganizationList } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { z } from "zod";
const isLocalEnvironment = process.env.NODE_ENV === "development";

export const Route = createFileRoute("/org-not-found")({
  component: RouteComponent,
  validateSearch: (search) => {
    return z
      .object({
        org: z.string().optional(),
      })
      .parse(search);
  },
});

function RouteComponent() {
  // Query to get current user's organizations
  const { org } = Route.useSearch();
  const orgs = useOrganizationList({
    userMemberships: true,
  });
  const targetOrg = isLocalEnvironment ? "comfydeploystaging" : "comfy-deploy";

  // Check if user belongs to the target organization
  const isInTargetOrg = orgs.userMemberships.data?.some(
    (org) => org.organization.slug === targetOrg,
  );

  const handleAdminRedirect = () => {
    const baseUrl = getAdminBaseUrl();
    window.location.href = `${baseUrl}/?tab=users&q=${org}`;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div>
        Organization <Badge>{org}</Badge> not found
      </div>

      {isInTargetOrg && (
        <Button onClick={handleAdminRedirect} className="mt-4">
          Go to Admin Dashboard
        </Button>
      )}
    </div>
  );
}
