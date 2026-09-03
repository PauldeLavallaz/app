import { OrganizationProfile, useAuth } from "@clerk/clerk-react";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute(
  "/organization-profile/organization-members/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { orgId } = useAuth();

  if (!orgId) {
    return <div>Not Found</div>;
  }
  return (
    <OrganizationProfile
      routing="virtual"
      appearance={{
        elements: {
          rootBox: "w-full h-full shadow-none outline-none bg-transparent px-0",
          cardBox:
            "max-w-full md:max-w-4xl w-full h-full shadow-none outline-none rounded-none bg-transparent",
          scrollBox: "shadow-none outline-none rounded-none bg-transparent",
        },
      }}
    />
  );
}
