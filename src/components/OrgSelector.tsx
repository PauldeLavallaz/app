import {
  CreateOrganization,
  OrganizationList,
  useAuth,
  useClerk,
  useOrganization,
  useOrganizationList,
} from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import { useCustomer } from "autumn-js/react";
import { useEffect, useState } from "react";
import { isDarkTheme } from "@/lib/utils";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { LoadingIcon } from "./ui/custom/loading-icon";
import { Input } from "./ui/input";
import { LoadingProgress } from "./ui/loading-progress";
import { Skeleton } from "./ui/skeleton";

export function useOrgSelector() {
  const { theme } = useTheme();

  const { organization, isLoaded: isOrganizationLoaded } = useOrganization();
  const { userMemberships, isLoaded } = useOrganizationList({
    userMemberships: true,
  });

  const auth = useAuth();
  const clerk = useClerk();

  const { check, isLoading } = useCustomer();

  const workflowLimit = check({ featureId: "workflow_limit" });

  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  if (!auth.isLoaded || !auth.isSignedIn) {
    return null;
  }

  if (
    isLoading ||
    !isLoaded ||
    !isOrganizationLoaded ||
    userMemberships.isFetching
  ) {
    return null;
    // return (
    //   <>
    //     <div className="h-full flex  w-full flex-col items-center justify-center p-8 bg-background z-50">
    //       <LoadingIcon />
    //     </div>
    //   </>
    // );
  }

  const workflowUsage = workflowLimit.data?.usage ?? 0;

  //   The user is in a personal org, has other org, no workflows, show the org list
  if (!organization) {
    if (
      userMemberships?.count &&
      userMemberships.count > 0 &&
      workflowUsage === 0
    ) {
      return (
        <div className="h-full flex  w-full flex-col items-center justify-center p-8 bg-background z-50">
          <div className="text-center">
            <OrganizationList
              hidePersonal
              afterSelectOrganizationUrl="/org/:slug/workflows"
              afterCreateOrganizationUrl="/org/:slug/workflows"
              appearance={{
                baseTheme: isDarkTheme(theme) ? dark : undefined,
                elements: {
                  cardBox: "dark:border-zinc-700",
                },
              }}
            />
          </div>
        </div>
      );
    }

    //   The user is in a personal org, no workflows, show the create org form
    const dontHaveAnyOrgs = userMemberships?.count === 0;
    // console.log(
    //   "dontHaveAnyOrgs",
    //   dontHaveAnyOrgs,
    //   userMemberships,
    //   workflowUsage,
    //   workflowLimit,
    // );
    if (dontHaveAnyOrgs && workflowUsage === 0) {
      const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const name = e.target.name.value;
        setIsCreatingOrg(true);
        const organization = await clerk.createOrganization({ name });
        console.log("organization", organization);
        setIsCreatingOrg(false);
        window.location.href = `/org/${organization.slug}/workflows`;
        // router.push(`/org/${organization.id}/workflows`);
      };
      return (
        <div className="h-full inset-0 flex flex-col items-center justify-center p-8 z-50 w-full max-w-md mx-auto">
          <div className="text-center w-full">
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-md space-y-6 w-full"
            >
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground text-left">
                  Create Organization
                </h1>
                <p className="text-sm text-muted-foreground text-left">
                  Deploy Comfy as API, share as a simplfied playground, access
                  cloud GPU
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  id="name"
                  name="name"
                  placeholder="Organization name"
                  className="w-full"
                  required
                />
              </div>

              <Button
                type="submit"
                isLoading={isCreatingOrg}
                className="w-full"
              >
                Get Started
              </Button>
            </form>
          </div>
        </div>
      );
    }
  }

  //   Legazy user, personal org, has workflows
  return null;
}
