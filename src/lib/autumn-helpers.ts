import { useQuery } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";
import type {
  AutumnDataV2Response,
  Feature as AutumnFeature,
} from "@/types/autumn-v2";

const PAID_PLAN_IDS = new Set([
  "creator_monthly",
  "creator_yearly",
  "deployment_monthly",
  "deployment_yearly",
  "business_monthly",
  "business_yearly",
]);

function hasPaidPlan(products?: Array<{ id?: string }>) {
  return products?.some((product) => product.id && PAID_PLAN_IDS.has(product.id));
}

export function useCredit() {
  const { check, customer, isLoading } = useCustomer();
  const { data: userSettings, isLoading: isSettingsLoading } = useQuery<any>({
    queryKey: ["platform", "user-settings"],
  });

  const isFreePlan = !hasPaidPlan(customer?.products);
  const credit = isFreePlan
    ? check({ featureId: "gpu-credit-topup" })
    : check({ featureId: "gpu-credit" });
  const localCreditCents = Math.round(Number(userSettings?.credit ?? 0) * 100);
  const mergedCredit =
    localCreditCents > 0
      ? {
          ...(credit ?? {}),
          data: {
            ...(credit?.data ?? {}),
            balance: Number(credit?.data?.balance ?? 0) + localCreditCents,
          },
        }
      : credit;

  return { credit: mergedCredit, isLoading: isLoading || isSettingsLoading };
}

export function useFreePlan() {
  const { customer, isLoading } = useCustomer();

  const isFreePlan = !hasPaidPlan(customer?.products);

  return { isFreePlan, isLoading };
}

export function useCreditInDollars() {
  const { credit, isLoading } = useCredit();

  if (!credit || !credit.data?.balance) return { credit: 0, isLoading };

  return { credit: credit?.data?.balance / 100, isLoading };
}

/**
 * Helper functions for working with Autumn Data V2 features
 */

export interface PlanStatusResponse {
  plans?: {
    autumn_data?: {
      features?: Record<string, AutumnFeature>;
    };
  };
}

/**
 * Get the autumn data from either autumn response or plan status (prioritize autumnResp)
 */
export function getAutumnData(
  planStatus?: PlanStatusResponse,
  autumnResp?: AutumnDataV2Response,
) {
  return autumnResp?.autumn_data ?? planStatus?.plans?.autumn_data;
}

/**
 * Get a specific feature from autumn data
 */
export function getAutumnFeature(
  featureId: string,
  planStatus?: PlanStatusResponse,
  autumnResp?: AutumnDataV2Response,
): AutumnFeature | null {
  const autumnData = getAutumnData(planStatus, autumnResp);
  return (autumnData?.features?.[featureId] ?? null) as AutumnFeature | null;
}

function parseIncludedUsage(value: unknown, unlimited?: boolean) {
  if (unlimited) return { isUnlimited: true, limit: "Unlimited" as const };
  if (
    value === undefined ||
    value === null ||
    String(value).toLowerCase() === "inf" ||
    String(value).toLowerCase() === "infinity" ||
    String(value).toLowerCase() === "unlimited"
  ) {
    return { isUnlimited: true, limit: "Unlimited" as const };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { isUnlimited: true, limit: "Unlimited" as const };
  }

  return { isUnlimited: false, limit: parsed };
}

/**
 * Check if workflows are limited based on autumn data (prioritizing autumnResp)
 */
export function getWorkflowLimits(
  planStatus?: PlanStatusResponse,
  autumnResp?: AutumnDataV2Response,
  fallbackSub?: {
    features?: {
      workflowLimited?: boolean;
      workflowLimit?: number;
      currentWorkflowCount?: number;
    };
  },
) {
  // Prioritize autumnResp over planStatus
  const workflowLimitFeature = getAutumnFeature(
    "workflow_limit",
    planStatus,
    autumnResp,
  );

  const currentCount =
    workflowLimitFeature?.usage ??
    fallbackSub?.features?.currentWorkflowCount ??
    0;

  if (workflowLimitFeature) {
    const { isUnlimited, limit } = parseIncludedUsage(
      workflowLimitFeature.included_usage,
      workflowLimitFeature.unlimited,
    );
    return {
      isUnlimited,
      isLimited: !isUnlimited && currentCount >= Number(limit),
      limit,
      currentCount,
      feature: workflowLimitFeature,
    };
  }

  const fallbackLimit = fallbackSub?.features?.workflowLimit;
  const fallbackLimited = fallbackSub?.features?.workflowLimited;

  return {
    isUnlimited: fallbackLimit === undefined || fallbackLimit >= 999999999,
    isLimited: fallbackLimited ?? false,
    limit:
      fallbackLimit === undefined || fallbackLimit >= 999999999
        ? "Unlimited"
        : fallbackLimit,
    currentCount,
    feature: workflowLimitFeature,
  };
}

/**
 * Check if machines are limited based on autumn data (prioritizing autumnResp)
 */
export function getMachineLimits(
  planStatus?: PlanStatusResponse,
  autumnResp?: AutumnDataV2Response,
  fallbackSub?: {
    features?: {
      machineLimited?: boolean;
      machineLimit?: number;
      currentMachineCount?: number;
    };
  },
) {
  // Prioritize autumnResp over planStatus
  const machineLimitFeature = getAutumnFeature(
    "machine_limit",
    planStatus,
    autumnResp,
  );

  const currentCount =
    machineLimitFeature?.usage ??
    fallbackSub?.features?.currentMachineCount ??
    0;

  if (machineLimitFeature) {
    const { isUnlimited, limit } = parseIncludedUsage(
      machineLimitFeature.included_usage,
      machineLimitFeature.unlimited,
    );
    return {
      isUnlimited,
      isLimited: !isUnlimited && currentCount >= Number(limit),
      limit,
      currentCount,
      feature: machineLimitFeature,
    };
  }

  const fallbackLimit = fallbackSub?.features?.machineLimit;
  const fallbackLimited = fallbackSub?.features?.machineLimited;

  return {
    isUnlimited: fallbackLimit === undefined || fallbackLimit >= 999999999,
    isLimited: fallbackLimited ?? false,
    limit:
      fallbackLimit === undefined || fallbackLimit >= 999999999
        ? "Unlimited"
        : fallbackLimit,
    currentCount,
    feature: machineLimitFeature,
  };
}

/**
 * Check if self-hosted machines are allowed based on autumn data
 */
export function getSelfHostedMachinesAllowed(
  planStatus?: PlanStatusResponse,
  autumnResp?: AutumnDataV2Response,
): boolean {
  // Prioritize autumnResp over planStatus
  const selfHostedFeature = getAutumnFeature(
    "self_hosted_machines",
    planStatus,
    autumnResp,
  );

  // Debug logging
  console.log("getSelfHostedMachinesAllowed debug:", {
    selfHostedFeature,
    hasFeature: !!selfHostedFeature,
    featureType: selfHostedFeature?.type,
    planStatus:
      planStatus?.plans?.autumn_data?.features?.["self_hosted_machines"],
    autumnResp: autumnResp?.autumn_data?.features?.["self_hosted_machines"],
  });

  // Morfeo Deploy does not plan-gate self-hosted machines.
  if (!selfHostedFeature) {
    return true;
  }

  // For static/boolean features, if the feature exists, the user has access
  return (
    selfHostedFeature.type === "static" || selfHostedFeature.type === "boolean"
  );
}

/**
 * Get credit balance for a feature
 */
export function getFeatureCredits(
  featureId: string,
  planStatus?: PlanStatusResponse,
  autumnResp?: AutumnDataV2Response,
) {
  const feature = getAutumnFeature(featureId, planStatus, autumnResp);
  return {
    balance: feature?.balance ?? 0,
    usage: feature?.usage ?? 0,
    includedUsage: feature?.included_usage ?? 0,
    unlimited: feature?.unlimited ?? false,
    nextResetAt: feature?.next_reset_at,
  };
}
