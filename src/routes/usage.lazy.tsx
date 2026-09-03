import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import {
  AlertCircle,
  BarChart2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  ExternalLink,
  Grid2X2,
  Plus,
  Wallet,
} from "lucide-react";
import {
  memo,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { TopUpButton } from "@/components/pricing/TopUpButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BlueprintOutline } from "@/components/ui/custom/blueprint-outline";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UsageGraph } from "@/components/usage/UsageGraph";
import { api } from "@/lib/api";
import {
  useCredit,
  useCreditInDollars,
  useFreePlan,
} from "@/lib/autumn-helpers";
import { callServerPromise } from "@/lib/call-server-promise";
import { getDuration } from "@/lib/get-relative-time";
import type { AutumnDataV2Response, Feature, Product } from "@/types/autumn-v2";
import { isFeatureItem, isPricedFeatureItem } from "@/types/autumn-v2";

export const Route = createLazyFileRoute("/usage")({
  component: RouteComponent,
});

function RouteComponent() {
  const [viewMode, setViewMode] = useState<"graph" | "grid">("graph");
  const [creditsExpanded, setCreditsExpanded] = useState(false);
  const [showAddons, setShowAddons] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { isFreePlan, isLoading: isFreePlanLoading } = useFreePlan();

  const { openBillingPortal, refetch } = useCustomer();

  // Handle topup success from URL params
  const searchParams = new URLSearchParams(window.location.search);
  useEffect(() => {
    if (searchParams.get("topup") === "success") {
      const checkoutSessionId =
        searchParams.get("checkout_session_id") ?? searchParams.get("session_id");

      const cleanUrl = () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("topup");
        url.searchParams.delete("checkout_session_id");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.pathname);
      };

      if (!checkoutSessionId) {
        toast.success("Credits added successfully!");
        cleanUrl();
        return;
      }

      api({
        url: "platform/topup/complete",
        init: {
          method: "POST",
          body: JSON.stringify({ session_id: checkoutSessionId }),
        },
      })
        .then(() => {
          toast.success("Credits added successfully!");
          queryClient.invalidateQueries({ queryKey: ["platform", "user-settings"] });
          queryClient.invalidateQueries({ queryKey: ["platform", "autumn-data"] });
          queryClient.invalidateQueries({ queryKey: ["platform", "plan"] });
          refetch?.();
          cleanUrl();
        })
        .catch(() => {
          toast.error("Payment completed, but credits could not be confirmed yet.");
        });
    }
  }, []);
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["platform", "invoices"],
  });

  const { data: sub, isLoading: subLoading } = useQuery<Subscription>({
    queryKey: ["platform", "plan"],
  });

  const { data: raw } = useQuery<AutumnDataV2Response>({
    queryKey: ["platform", "autumn-data"],
  });
  const autumnData = raw?.autumn_data;

  // const { customer } = useCustomer();
  // const autumnData = data;

  const { credit: creditFeature, isLoading: autumnLoading } = useCredit();
  const gpuCreditFeature = creditFeature?.data;

  const usage_display = (creditFeature?.data?.usage ?? 0) / 100;
  const credit = usage_display + (creditFeature?.data?.balance ?? 0) / 100; // Remaining credit balance

  // Final usage should be usage minus available credit (but not negative)
  const finalUsed = Math.max(0, usage_display - credit);

  // Get current period from the last invoice timestamp in current plan
  const currentPeriod = useMemo(() => {
    if (!sub?.plans?.last_invoice_timestamp) return null;
    const start = new Date(sub.plans.last_invoice_timestamp * 1000);
    const end = new Date();
    return {
      id: "current",
      label: `Current (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`,
      start,
      end,
      period_start: start.toLocaleDateString(),
      period_end: end.toLocaleDateString(),
      period_start_timestamp: sub.plans.last_invoice_timestamp,
      period_end_timestamp: Math.floor(end.getTime() / 1000),
    };
  }, [sub]);

  // console.log(sub);

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(
    "current",
  );

  // Get selected invoice data
  const selectedInvoice = useMemo<Invoice | CurrentPeriod | null>(() => {
    if (!selectedPeriod) return currentPeriod;
    if (selectedPeriod === "current") return currentPeriod;
    if (!invoices?.length) return currentPeriod;
    return invoices.find((inv) => inv.id === selectedPeriod) || currentPeriod;
  }, [selectedPeriod, invoices, currentPeriod]);

  // Get usage data for current period
  const { data: usage } = useQuery<Usage>({
    queryKey: ["platform", "usage"],
    queryKeyHashFn: (queryKey) =>
      [
        ...queryKey,
        selectedInvoice?.period_start_timestamp,
        selectedInvoice?.period_end_timestamp,
      ].toString(),
    meta: {
      params: {
        start_time: selectedInvoice?.period_start_timestamp
          ? new Date(
              selectedInvoice.period_start_timestamp * 1000,
            ).toISOString()
          : undefined,
        end_time: selectedInvoice?.period_end_timestamp
          ? new Date(selectedInvoice.period_end_timestamp * 1000).toISOString()
          : undefined,
      },
    },
  });

  const handlePeriodChange = (direction: "prev" | "next") => {
    if (!selectedPeriod) return;
    if (!invoices?.length) return;

    console.log("Current period:", selectedPeriod);
    console.log("Direction:", direction);
    console.log("Invoices:", invoices);

    // When on current period, only allow going back to most recent invoice
    if (selectedPeriod === "current") {
      if (direction === "prev" && invoices.length > 0) {
        console.log(
          "Moving from current to most recent invoice:",
          invoices[0].id,
        );
        setSelectedPeriod(invoices[0].id);
      }
      return;
    }

    // Find current position in invoice list
    const currentIndex = invoices.findIndex((inv) => inv.id === selectedPeriod);
    console.log("Current index in invoices:", currentIndex);

    if (currentIndex === -1) return;

    // Handle navigation
    if (direction === "prev") {
      // Go to older invoice if available
      if (currentIndex < invoices.length - 1) {
        console.log("Moving to older invoice:", invoices[currentIndex + 1].id);
        setSelectedPeriod(invoices[currentIndex + 1].id);
      }
    } else {
      // Going next (to newer invoices)
      if (currentIndex === 0) {
        // At most recent invoice, go to current period
        console.log("Moving to current period");
        setSelectedPeriod("current");
      } else {
        // Go to newer invoice
        console.log("Moving to newer invoice:", invoices[currentIndex - 1].id);
        setSelectedPeriod(invoices[currentIndex - 1].id);
      }
    }
  };

  const is_displaying_invoice = isInvoice(selectedInvoice);
  // console.log(selectedInvoice);

  return (
    <div className="py-8 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
      <div className=" w-full">
        {/* <Alert variant="warning" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Under Maintenance</AlertTitle>
          <AlertDescription>
            The usage page is currently under maintenance. Some features may be
            temporarily unavailable. We apologize for any inconvenience.
          </AlertDescription>
        </Alert> */}
        {/* <Suspense> */}
        <UnpaidInvoices />
        {/* </Suspense> */}
        {/* Plan */}
        <div className="mb-6">
          <div className="mb-2 px-1">
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Plan
            </h2>
          </div>
          {/* GPU Credits - Compact (moved above plan) */}
          {isFreePlan && (
            <Card className="relative mb-0 rounded-[2px] border-zinc-200/50 shadow-sm dark:border-zinc-800/50">
              <div className="pointer-events-none absolute inset-0 h-full w-full bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem] opacity-40 dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)]" />
              <button
                type="button"
                onClick={() => {
                  if (
                    gpuCreditFeature?.breakdown &&
                    gpuCreditFeature.breakdown.length > 0
                  ) {
                    setCreditsExpanded(!creditsExpanded);
                  }
                }}
                className="relative z-10 w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-4 w-4 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800">
                    <Wallet className="h-2.5 w-2.5 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    GPU Credits
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 dark:text-zinc-500">
                      Balance
                    </span>
                    <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      $
                      {gpuCreditFeature
                        ? ((gpuCreditFeature.balance ?? 0) / 100).toFixed(3)
                        : "0.00"}
                    </span>
                  </div>
                  <TopUpButton
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs font-medium rounded-[2px] bg-gradient-to-b from-white to-gray-100 ring-1 ring-gray-200/50 shadow-sm hover:bg-gray-100 dark:from-zinc-800 dark:to-zinc-700 dark:ring-zinc-700/50"
                    showIcon={true}
                  >
                    Add Credits
                  </TopUpButton>
                  {gpuCreditFeature?.breakdown &&
                    gpuCreditFeature.breakdown.length > 0 && (
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${creditsExpanded ? "rotate-180" : ""}`}
                      />
                    )}
                </div>
              </button>

              {creditsExpanded &&
                gpuCreditFeature?.breakdown &&
                gpuCreditFeature.breakdown.length > 0 && (
                  <div className="relative z-10 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-2">
                    {gpuCreditFeature.breakdown.map((breakdown, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-500 dark:text-zinc-500">
                          {breakdown.interval === "month"
                            ? "Monthly"
                            : breakdown.interval === "lifetime"
                              ? "Lifetime"
                              : breakdown.interval}
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-zinc-900 dark:text-zinc-100">
                            ${(breakdown.balance / 100).toFixed(2)}
                          </span>
                          <span className="text-zinc-400 dark:text-zinc-600">
                            /
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400">
                            ${(breakdown.included_usage / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          )}
          {!isFreePlan && (
            <Card className="relative mb-0 rounded-[2px] border-zinc-200/50 shadow-sm dark:border-zinc-800/50">
              <div className="pointer-events-none absolute inset-0 h-full w-full bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem] opacity-40 dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)]" />
              <button
                type="button"
                onClick={() => {
                  if (
                    gpuCreditFeature?.breakdown &&
                    gpuCreditFeature.breakdown.length > 0
                  ) {
                    setCreditsExpanded(!creditsExpanded);
                  }
                }}
                className="relative z-10 w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-4 w-4 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800">
                    <Wallet className="h-2.5 w-2.5 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    On Demand Billing
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500 dark:text-zinc-500">
                      Billable Usage
                    </span>
                    <span className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      ${gpuCreditFeature ? finalUsed.toFixed(2) : "0.00"}
                    </span>
                  </div>
                  <Button
                    onClick={async () => {
                      const result = await openBillingPortal({
                        openInNewTab: true,
                      });
                      // result.data?.url &&
                      // window.open(result.data.url, "_blank");
                    }}
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs font-medium rounded-[2px] bg-gradient-to-b from-white to-gray-100 ring-1 ring-gray-200/50 shadow-sm hover:bg-gray-100 dark:from-zinc-800 dark:to-zinc-700 dark:ring-zinc-700/50"
                    // showIcon={true}
                  >
                    Manage
                  </Button>
                  {/* {gpuCreditFeature?.breakdown &&
                    gpuCreditFeature.breakdown.length > 0 && (
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${creditsExpanded ? "rotate-180" : ""}`}
                      />
                    )} */}
                </div>
              </button>

              {creditsExpanded &&
                gpuCreditFeature?.breakdown &&
                gpuCreditFeature.breakdown.length > 0 && (
                  <div className="relative z-10 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-2">
                    {gpuCreditFeature.breakdown.map((breakdown, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-500 dark:text-zinc-500">
                          {breakdown.interval === "month"
                            ? "Monthly"
                            : breakdown.interval === "lifetime"
                              ? "Lifetime"
                              : breakdown.interval}
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-zinc-900 dark:text-zinc-100">
                            ${(breakdown.balance / 100).toFixed(2)}
                          </span>
                          <span className="text-zinc-400 dark:text-zinc-600">
                            /
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400">
                            ${(breakdown.included_usage / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          )}
          <Card className="relative rounded-[2px] border-zinc-200/50 shadow-sm dark:border-zinc-800/50">
            <div className="relative z-10">
              <Table>
                <TableBody>
                  {/* Active plan products */}
                  {autumnLoading && (
                    <>
                      {Array.from({ length: 2 }).map((_, i) => (
                        <TableRow
                          key={`plan-skel-${i}`}
                          className="border-b border-zinc-100/50 dark:border-zinc-800/30"
                        >
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-4 rounded-[2px]" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Skeleton className="h-3 w-10" />
                          </TableCell>
                          <TableCell className="py-2">
                            <Skeleton className="h-3 w-12" />
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex justify-end">
                              <Skeleton className="h-3 w-16" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                  {(autumnData?.products ?? [])
                    .filter((p) => !p.is_add_on)
                    .filter((p) => p.id !== "credit")
                    .map((product, idx) => {
                      const priceItem = product.items?.find(
                        (item) => item.type === "price",
                      );
                      console.log(product.items);

                      const hasAddons = (autumnData?.products ?? []).some(
                        (p) => p.is_add_on,
                      );
                      return (
                        <TableRow
                          key={product.id}
                          className="border-b border-zinc-100/50 dark:border-zinc-800/30"
                        >
                          <TableCell className="py-1">
                            <div className="flex items-center gap-2">
                              <div className="flex h-4 w-4 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800">
                                <CreditCard className="h-2 w-2 text-zinc-600 dark:text-zinc-400" />
                              </div>
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                {product.name}
                              </span>
                              {hasAddons && idx === 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAddons((v) => !v)}
                                  className="ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
                                  aria-label="Toggle add-ons"
                                  aria-expanded={showAddons}
                                >
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform ${showAddons ? "rotate-180" : ""}`}
                                  />
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-1">
                            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                              Plan
                            </span>
                          </TableCell>
                          <TableCell className="py-1">
                            <div className="flex items-center gap-1">
                              <div
                                className={`h-1.5 w-1.5 rounded-full ${product.status === "active" ? "bg-green-500" : "bg-zinc-400"}`}
                              />
                              <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
                                {product.status}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-1 text-right">
                            {priceItem && (
                              <div className="text-xs">
                                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                                  ${priceItem.price.toFixed(2)}
                                </span>
                                {priceItem.interval && (
                                  <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-500">
                                    /
                                    {priceItem.interval === "month"
                                      ? "mo"
                                      : priceItem.interval}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {/* Add-on products (collapsible) */}
                  {showAddons &&
                    (autumnData?.products ?? [])
                      .filter((p) => p.is_add_on)
                      .map((product) => {
                        const priceItem = product.items.find(
                          (item) => item.type === "price",
                        );
                        return (
                          <TableRow
                            key={product.id}
                            className="border-b border-zinc-100/50 dark:border-zinc-800/30"
                          >
                            <TableCell className="py-1">
                              <div className="flex items-center gap-2">
                                <div className="flex h-4 w-4 items-center justify-center rounded bg-zinc-100 dark:bg-zinc-800">
                                  <Plus className="h-2 w-2 text-zinc-600 dark:text-zinc-400" />
                                </div>
                                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                  {product.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-1">
                              <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                                Add-on
                              </span>
                            </TableCell>
                            <TableCell className="py-1">
                              <div className="flex items-center gap-1">
                                <div
                                  className={`h-1.5 w-1.5 rounded-full ${product.status === "active" ? "bg-green-500" : "bg-zinc-400"}`}
                                />
                                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
                                  {product.status}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-1 text-right">
                              {priceItem && (
                                <div className="text-xs">
                                  <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                                    ${priceItem.price.toFixed(2)}
                                  </span>
                                  {priceItem.interval && (
                                    <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-500">
                                      /
                                      {priceItem.interval === "month"
                                        ? "mo"
                                        : priceItem.interval}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                </TableBody>
              </Table>
            </div>
            {/* Collapsible Features Section - Bottom Right */}
            {autumnData?.features &&
              Object.keys(autumnData.features).filter(
                (id) => !id.includes("gpu-credit"),
              ).length > 0 && (
                <div className="relative px-4 py-2 border-t border-zinc-200/50 dark:border-zinc-800/50">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setFeaturesExpanded(!featuresExpanded)}
                      className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 underline underline-offset-2"
                    >
                      {featuresExpanded ? "Hide Details" : "View Details"}
                    </button>
                  </div>
                  {featuresExpanded && (
                    <div className="absolute top-full right-4 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg p-4 min-w-[380px] sm:min-w-[420px] z-50">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
                            <TableHead className="h-7 text-[10px] font-normal text-zinc-500 dark:text-zinc-500">
                              Feature
                            </TableHead>
                            <TableHead className="h-7 text-[10px] font-normal text-zinc-500 dark:text-zinc-500">
                              Usage
                            </TableHead>
                            <TableHead className="h-7 text-[10px] font-normal text-zinc-500 text-right dark:text-zinc-500">
                              Limit
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(autumnData.features)
                            .filter(([id]) => !id.includes("gpu-credit"))
                            .map(([id, feature]) => (
                              <TableRow
                                key={id}
                                className="border-b border-zinc-100/50 dark:border-zinc-800/30"
                              >
                                <TableCell className="py-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                                      {feature.name}
                                    </span>
                                    {feature.overage_allowed && (
                                      <Badge
                                        variant="outline"
                                        className="h-3.5 px-1 text-[9px]"
                                      >
                                        Overage
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-1 w-[45%]">
                                  {feature.type === "static" ? (
                                    <div className="flex items-center gap-1">
                                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                        Available
                                      </span>
                                    </div>
                                  ) : feature.unlimited ? (
                                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                      —
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100 whitespace-nowrap min-w-[60px]">
                                        {feature.usage} /{" "}
                                        {feature.included_usage}
                                      </span>
                                      {/* Progress bar to visualize usage vs limit */}
                                      <Progress
                                        value={(() => {
                                          const limit =
                                            feature.included_usage || 0;
                                          if (limit <= 0) return 100;
                                          const pct =
                                            (feature.usage / limit) * 100;
                                          return Math.min(
                                            Math.max(pct, 0),
                                            100,
                                          );
                                        })()}
                                        className="h-1.5 rounded-sm bg-zinc-200 dark:bg-zinc-800 w-[120px]"
                                      />
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="py-1 text-right">
                                  {feature.type === "static" ? (
                                    <Badge
                                      variant="secondary"
                                      className="h-4 px-1.5 text-[9px]"
                                    >
                                      Enabled
                                    </Badge>
                                  ) : feature.unlimited ? (
                                    <Badge
                                      variant="secondary"
                                      className="h-4 px-1.5 text-[9px]"
                                    >
                                      Unlimited
                                    </Badge>
                                  ) : (
                                    <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                                      {feature.included_usage}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
          </Card>
        </div>
      </div>

      {/* Usage + Period Selection */}
      <div className="flex w-full items-center justify-between mb-2 mt-6 px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Usage
          </h2>
          <div className="flex items-center rounded border border-zinc-200/50 bg-white p-0.5 shadow-sm dark:border-zinc-800/50 dark:bg-zinc-900">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode("graph")}
              className={`h-6 w-6 rounded-[3px] ${viewMode === "graph" ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"}`}
            >
              <BarChart2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode("grid")}
              className={`h-6 w-6 rounded-[3px] ${viewMode === "grid" ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"}`}
            >
              <Grid2X2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            onClick={() => handlePeriodChange("prev")}
            disabled={
              !selectedPeriod ||
              (selectedPeriod !== "current" &&
                invoices &&
                invoices.findIndex((inv) => inv.id === selectedPeriod) ===
                  invoices.length - 1)
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Select
            value={selectedPeriod ?? undefined}
            onValueChange={(value) => setSelectedPeriod(value)}
          >
            <SelectTrigger className="h-8 w-[180px] border-zinc-200/50 text-xs dark:border-zinc-800/50 sm:w-[240px] rounded-none">
              <SelectValue placeholder="Select billing period" />
            </SelectTrigger>
            <SelectContent>
              {invoicesLoading ? (
                <div className="px-4 py-2">
                  <Skeleton className="h-6 w-full mb-2" />
                  <Skeleton className="h-6 w-2/3 mb-2" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              ) : (
                <>
                  <SelectItem value="current" className="text-xs">
                    {(() => {
                      if (!currentPeriod) return null;
                      const startDate = currentPeriod.period_start_timestamp
                        ? new Date(currentPeriod.period_start_timestamp * 1000)
                        : new Date();
                      const endDate = currentPeriod.period_end_timestamp
                        ? new Date(currentPeriod.period_end_timestamp * 1000)
                        : new Date();
                      const startStr = `${startDate.getMonth() + 1}/${startDate.getDate()}/${String(startDate.getFullYear()).slice(-2)}`;
                      const endStr = `${endDate.getMonth() + 1}/${endDate.getDate()}/${String(endDate.getFullYear()).slice(-2)}`;
                      return (
                        <>
                          Current
                          <span className="ml-2 text-zinc-500 dark:text-zinc-500">
                            ({startStr} - {endStr})
                          </span>
                        </>
                      );
                    })()}
                  </SelectItem>
                  <div className="px-2 py-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-500">
                    Past Periods
                  </div>
                  {invoices?.map((invoice) => {
                    const startDate = invoice.period_start_timestamp
                      ? new Date(invoice.period_start_timestamp * 1000)
                      : new Date();
                    const endDate = invoice.period_end_timestamp
                      ? new Date(invoice.period_end_timestamp * 1000)
                      : new Date();
                    const monthName = startDate.toLocaleString("default", {
                      month: "long",
                    });
                    const startStr = `${startDate.getMonth() + 1}/${startDate.getDate()}/${String(startDate.getFullYear()).slice(-2)}`;
                    const endStr = `${endDate.getMonth() + 1}/${endDate.getDate()}/${String(endDate.getFullYear()).slice(-2)}`;
                    return (
                      <SelectItem
                        key={invoice.id}
                        value={invoice.id}
                        className="text-xs"
                      >
                        {monthName}
                        <span className="ml-2 text-zinc-500 dark:text-zinc-500">
                          ({startStr} - {endStr})
                        </span>
                      </SelectItem>
                    );
                  })}
                </>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            onClick={() => handlePeriodChange("next")}
            disabled={selectedPeriod === "current"}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!isFreePlan && (
        <Card className="relative mb-0 border-zinc-200/50 shadow-sm dark:border-zinc-800/50 rounded-[2px]">
          <div className="relative z-10 grid divide-x divide-zinc-200/50 dark:divide-zinc-800/50 sm:grid-cols-3">
            <div className="px-4 py-3">
              <div className="text-sm font-normal text-zinc-500 dark:text-zinc-500">
                Usage
              </div>
              <div className="mt-0.5 text-base font-mono font-medium text-zinc-900 dark:text-zinc-100">
                $
                {is_displaying_invoice
                  ? (usage?.total_cost?.toFixed(2) ?? "0.00")
                  : (usage_display?.toFixed(2) ?? "0.00")}
              </div>
            </div>
            {!is_displaying_invoice && (
              <div className="px-4 py-3">
                <div className="text-sm font-normal text-zinc-500 dark:text-zinc-500">
                  Credit Balance
                </div>
                <div className="mt-0.5 text-base font-mono font-medium text-green-600 dark:text-green-400">
                  ${(credit ?? 0).toFixed(2)}
                </div>
              </div>
            )}
            <div className="px-4 py-3">
              <div className="text-sm font-normal text-zinc-500 dark:text-zinc-500">
                Billable Usage
              </div>
              <div className="mt-0.5 text-base font-mono font-medium text-zinc-900 dark:text-zinc-100">
                $
                {is_displaying_invoice
                  ? (usage?.final_cost?.toFixed(2) ?? "0.00")
                  : finalUsed?.toFixed(2)}
              </div>
            </div>
          </div>
        </Card>
      )}
      {/* Graph/Table section with subtle grid background */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 h-full w-full bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem] opacity-40 dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)]" />

        {/* Graph/Table content */}
        <div className="relative z-10">
          <Suspense fallback={<Skeleton className="h-[400px]" />}>
            {viewMode === "graph" ? (
              <UsageBreakdownMemo
                startTimeOverride={selectedInvoice?.period_start_timestamp}
                endTimeOverride={selectedInvoice?.period_end_timestamp}
              />
            ) : (
              <UsageTable
                invoice={selectedInvoice}
                startTimeOverride={
                  selectedInvoice
                    ? new Date(selectedInvoice.period_start_timestamp * 1000)
                    : undefined
                }
                endTimeOverride={
                  selectedInvoice
                    ? new Date(selectedInvoice.period_end_timestamp * 1000)
                    : undefined
                }
              />
            )}
          </Suspense>
        </div>

        {selectedInvoice && (
          <div className="relative z-10 mt-8">
            <InvoiceDetails invoice={selectedInvoice} />
          </div>
        )}
      </div>
    </div>
  );
}

export function UsageBreakdown({
  startTimeOverride,
  endTimeOverride,
}: {
  startTimeOverride?: number;
  endTimeOverride?: number;
}) {
  const { startDate, endDate } = useMemo(() => {
    if (startTimeOverride && endTimeOverride) {
      return {
        startDate: new Date(startTimeOverride * 1000).toISOString(),
        endDate: new Date(endTimeOverride * 1000).toISOString(),
      };
    }
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 180);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [startTimeOverride, endTimeOverride]);

  const { data: usageInfo } = useSuspenseQuery<any>({
    queryKey: ["platform", "usage-details"],
    queryKeyHashFn: (queryKey) =>
      [...queryKey, startDate.split("T")[0], endDate.split("T")[0]].toString(),
    meta: {
      params: {
        start_time: startDate,
        end_time: endDate,
      },
    },
  });
  return <UsageGraph chartData={usageInfo} />;
}

const UsageBreakdownMemo = memo(UsageBreakdown);

function Credit() {
  const { data: userSettings, isLoading } = useSuspenseQuery<any>({
    queryKey: ["platform", "user-settings"],
  });

  const credit = userSettings?.credit ?? 0;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Badge>Usage Credit</Badge>
        <div className="flex gap-2">
          {credit > 0 && "$ "}
          {credit.toFixed(3)}
        </div>
      </div>
    </Card>
  );
}

export function DevelopmentOnly(props: { children: ReactNode }) {
  if (process.env.NODE_ENV === "development") return props.children;
  return <></>;
}

export function UsageTable(props: {
  invoice?: Invoice | CurrentPeriod | null;
  startTimeOverride?: Date;
  endTimeOverride?: Date;
}) {
  const { data: usage } = useSuspenseQuery<any>({
    queryKey: ["platform", "usage"],
    queryKeyHashFn: (queryKey) =>
      [
        ...queryKey,
        // props.startTimeOverride?.toISOString(),
        // props.endTimeOverride?.toISOString(),
        props.invoice?.id,
      ].toString(),
    meta: {
      params: {
        start_time: props.startTimeOverride?.toISOString(),
        end_time: props.endTimeOverride?.toISOString(),
      },
    },
  });

  return (
    <Card className="overflow-hidden border-zinc-200/50 shadow-sm dark:border-zinc-800/50 rounded-[2px]">
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader className="bg-background top-0 sticky">
            <TableRow className="border-b border-zinc-200/50 hover:bg-transparent dark:border-zinc-800/50">
              <TableHead className="h-7 text-[10px] font-normal text-zinc-500 dark:text-zinc-500">
                Machine
              </TableHead>
              <TableHead className="h-7 text-[10px] font-normal text-zinc-500 dark:text-zinc-500">
                GPU
              </TableHead>
              <TableHead className="h-7 text-[10px] font-normal text-zinc-500 dark:text-zinc-500">
                Duration
              </TableHead>
              <TableHead className="h-7 text-[10px] font-normal text-zinc-500 text-right dark:text-zinc-500">
                Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody key={props.invoice?.id}>
            {usage.usage.length > 0 ? (
              <>
                {usage.usage.map((x: any) => (
                  <TableRow
                    key={`${x.machine_id}-${x.cost_item_title ?? x.gpu ?? x.ws_gpu ?? "usage"}`}
                    className="border-b border-zinc-100/50 dark:border-zinc-800/30"
                  >
                    <TableCell className="py-1.5">
                      <Tooltip>
                        <TooltipTrigger className="text-left">
                          {x.cost_item_title ? (
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                              {x.cost_item_title}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Link
                                className="text-xs font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                                href={`/machines/${x.machine_id}`}
                              >
                                {x.machine_name}
                              </Link>
                              {x.ws_gpu && (
                                <span className="text-[9px] font-medium text-zinc-500 dark:text-zinc-500">
                                  WS
                                </span>
                              )}
                            </div>
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="font-mono text-xs">
                            {x.machine_id}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {x.gpu || x.ws_gpu || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {x.cost_item_title ? "—" : getDuration(x.usage_in_sec)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                        ${x.cost.toFixed(2)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/20">
                  <TableCell colSpan={3} className="py-2 text-right">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Total
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      ${usage.total_cost.toFixed(2)}
                    </span>
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    No usage recorded
                  </span>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  );
}

export const pricingPlanNameMapping = {
  ws_basic: "Workspace Basic",
  ws_pro: "Workspace Pro",
  pro: "API Pro (Early Adopter)",
  creator: "API Creator (Early Adopter)",
  business: "API Business",
  basic: "API Basic",
} as const;

export function InvoiceItem({
  invoice,
  children,
}: {
  invoice: Invoice;
  children: React.ReactNode;
}) {
  if (!isInvoice(invoice)) {
    return null;
  }

  const [isExpanded, setIsExpanded] = useState(false);

  const handleViewInvoice = () => {
    if (invoice.hosted_invoice_url) {
      window.open(invoice.hosted_invoice_url, "_blank");
    }
  };

  const getStatusIndicator = () => {
    const statusConfig = {
      paid: { color: "bg-green-500", label: "Paid" },
      open: { color: "bg-yellow-500", label: "Unpaid" },
      uncollectible: { color: "bg-red-500", label: "Failed" },
      void: { color: "bg-zinc-400", label: "Void" },
    };

    const config = statusConfig[
      invoice.status as keyof typeof statusConfig
    ] || { color: "bg-zinc-400", label: invoice.status };

    return (
      <div className="flex items-center gap-1">
        <div className={`h-1.5 w-1.5 rounded-full ${config.color}`} />
        <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
          {config.label}
        </span>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden border-zinc-200/50 shadow-sm dark:border-zinc-800/50">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
            {invoice.period_start} - {invoice.period_end}
          </span>
          {getStatusIndicator()}
        </div>
        <div className="flex items-center gap-2">
          {invoice.hosted_invoice_url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewInvoice();
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {invoice.status === "open" ? "Pay Invoice" : "View Invoice"}
              </TooltipContent>
            </Tooltip>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      {isExpanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-4">
          {children}
        </div>
      )}
    </Card>
  );
}

// Type guard to check if an object is an Invoice
function isInvoice(obj: any): obj is Invoice {
  return obj && "line_items" in obj && "subtotal" in obj;
}

interface Invoice {
  id: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  total: number;
  total_cost?: number;
  period_start_timestamp: number;
  period_end_timestamp: number;
  line_items: Array<{
    description: string;
    amount: number;
    quantity?: number;
  }>;
  hosted_invoice_url?: string;
  status?: string;
}

interface Subscription {
  sub?: {
    last_invoice_timestamp: number;
  };
  plans?: {
    plans: Array<keyof typeof pricingPlanNameMapping>;
    charges?: number[];
    amount?: number[];
    last_invoice_timestamp: number;
  };
}

function InvoiceDetails({ invoice }: { invoice: Invoice | CurrentPeriod }) {
  if (!isInvoice(invoice)) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-zinc-200/50 shadow-sm dark:border-zinc-800/50">
      <div className="px-4 py-3">
        <h3 className="text-xs font-medium text-zinc-900 dark:text-zinc-100 mb-2">
          Invoice Details
        </h3>
        <ul className="space-y-1">
          {invoice.line_items.map((item, index) => (
            <li
              key={item.description || index}
              className="flex justify-between text-xs"
            >
              <span className="text-zinc-600 dark:text-zinc-400">
                {item.description}
              </span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                ${item.amount.toFixed(2)}
                {item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-500">Subtotal</span>
            <span className="font-mono text-zinc-600 dark:text-zinc-400">
              ${invoice.subtotal.toFixed(2)}
            </span>
          </div>
          {invoice.subtotal > invoice.total && (
            <div className="flex justify-between text-xs">
              <span className="text-green-600 dark:text-green-400">
                Discount
              </span>
              <span className="font-mono text-green-600 dark:text-green-400">
                -${(invoice.subtotal - invoice.total).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Total
            </span>
            <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
              ${invoice.total.toFixed(2)}
            </span>
          </div>
        </div>
        {invoice.hosted_invoice_url && (
          <div className="flex justify-end mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(invoice.hosted_invoice_url, "_blank")}
              className="h-6 px-2 text-[10px] font-medium"
            >
              <ExternalLink className="mr-1 h-2.5 w-2.5" />
              View
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function UnpaidInvoices() {
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["platform", "invoices"],
  });

  const unpaidInvoices = useMemo(
    () =>
      invoices?.filter((invoice: Invoice) => invoice.status === "open") ?? [],
    [invoices],
  );

  if (unpaidInvoices.length === 0) return null;

  return (
    <Card className="mb-4 overflow-hidden border-red-200/50 bg-red-50/30 shadow-sm dark:border-red-900/20 dark:bg-red-900/10">
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="flex h-4 w-4 items-center justify-center bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="h-2.5 w-2.5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
              Unpaid Invoices
            </h3>
            <div className="mt-1.5 space-y-1">
              {unpaidInvoices.map((invoice: Invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between bg-white/60 px-2 py-1 dark:bg-zinc-900/40"
                >
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
                    {invoice.period_start} - {invoice.period_end}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      ${invoice.total.toFixed(2)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 border-red-200 px-1.5 text-[9px] font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                      onClick={() =>
                        window.open(invoice.hosted_invoice_url, "_blank")
                      }
                    >
                      Pay
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface CurrentPeriod {
  id: string;
  label: string;
  start: Date;
  end: Date;
  period_start: string;
  period_end: string;
  period_start_timestamp: number;
  period_end_timestamp: number;
  total_cost?: number;
  total?: number;
}

interface Usage {
  total_cost: number;
  final_cost: number;
  usage: Array<{
    machine_id: string;
    machine_name: string;
    cost: number;
    gpu?: string;
    ws_gpu?: string;
    usage_in_sec: number;
    cost_item_title?: string;
  }>;
  credit?: number;
  free_tier_credit: number;
}
