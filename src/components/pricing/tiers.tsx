import type { ReactNode } from "react";

export const BUSINESS_TIER = {
  name: "Business",
  id: "business",
  startingAt: false,
  href: "/pricing?ready=true&plan=business",
  priceMonthly: "$998",
  description: "Required for hosted ComfyDeploy workspaces and deployment operations",
  mostPopular: true,
} satisfies Tier;

export const ENTERPRISE_TIER = {
  name: "Enterprise",
  id: "large_enterprise",
  startingAt: false,
  href: "https://cal.com/team/comfy-deploy",
  priceMonthly: "Custom",
  description: "Custom solutions for larger teams and platform rollouts",
  mostPopular: false,
} satisfies Tier;

export type Tier = {
  name: string;
  id: string;
  startingAt: boolean;
  href: string;
  priceMonthly: string;
  description: ReactNode;
  mostPopular: boolean;
};

export const tiersNew = [BUSINESS_TIER, ENTERPRISE_TIER] satisfies Tier[];
