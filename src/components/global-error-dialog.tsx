import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useErrorDialogStore } from "@/stores/error-dialog-store";
import {
  ExternalLink,
  ShieldX,
  TriangleAlert,
  WifiOff,
  FileWarning,
  CircleAlert,
  Copy,
  ChevronDown,
  ChevronUp,
  Lock,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";

const TopUpInline = lazy(() =>
  import("@/components/pricing/TopUpInline").then((module) => ({
    default: module.TopUpInline,
  })),
);

export function GlobalErrorDialog() {
  const { open, error, clear } = useErrorDialogStore();
  const [showDetails, setShowDetails] = useState(false);

  const showTopUp = error?.kind === "insufficient_credit";
  const showUpgrade = error?.kind === "upgrade_required";

  const icon = useMemo(() => {
    switch (error?.kind) {
      case "insufficient_credit":
        return <CircleAlert className="h-5 w-5 text-rose-500" />;
      case "upgrade_required":
        return <Lock className="h-5 w-5 text-amber-500" />;
      case "forbidden":
        return <ShieldX className="h-5 w-5 text-rose-500" />;
      case "network":
        return <WifiOff className="h-5 w-5 text-rose-500" />;
      case "not_found":
        return <FileWarning className="h-5 w-5 text-amber-500" />;
      default:
        return <TriangleAlert className="h-5 w-5 text-rose-500" />;
    }
  }, [error?.kind]);

  const prettyBody = useMemo(() => {
    const body = error?.body as any;
    if (!body) return "";
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return body;
      }
    }
    try {
      return JSON.stringify(body, null, 2);
    } catch {
      return String(body);
    }
  }, [error]);

  const copyDetails = async () => {
    const payload = JSON.stringify(
      {
        title: error?.title,
        message: error?.message,
        status: error?.status,
        path: error?.path,
        body: error?.body ?? undefined,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore copy errors
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? clear() : undefined)}>
      <DialogContent className="sm:max-w-[560px] rounded-2xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {icon}
            <span>{error?.title ?? "Error"}</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-primary">
              {error?.message && (
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                  {error.kind === "insufficient_credit"
                    ? "You're out of credits."
                    : error.kind === "upgrade_required"
                      ? "This feature is not available in your current plan."
                      : error.message
                  }
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {showTopUp ? (
          <div className="mt-2 rounded-xl border p-4 bg-muted/30">
            <Suspense fallback={null}>
              <TopUpInline />
            </Suspense>
          </div>
        ) : null}

        {showUpgrade ? (
          <div className="mt-2 rounded-xl border p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Upgrade to access this feature</p>
                <p className="text-xs text-muted-foreground">
                  Choose a plan that includes the features you need.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  clear();
                  window.open('/pricing', '_blank');
                }}
                className="flex items-center gap-1"
              >
                <Lock className="h-4 w-4" />
                View Plans
              </Button>
            </div>
          </div>
        ) : null}

        {/* Details toggle */}
        {prettyBody && (
          <div className="mt-4">
            <button
              type="button"
              className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/80 hover:text-foreground"
              onClick={() => setShowDetails((s) => !s)}
            >
              {showDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showDetails ? "See less" : "See more"}
            </button>

            {showDetails && (
              <div className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {error?.status !== undefined && (
                    <span className="rounded border bg-background px-1.5 py-0.5">Status: {error.status}</span>
                  )}
                  {error?.code && (
                    <span className="rounded border bg-background px-1.5 py-0.5">Code: {error.code}</span>
                  )}
                  {error?.path && (
                    <span className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5">
                      <ExternalLink className="h-3 w-3" /> {error.path}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-2 text-[11px] font-mono">
                    {prettyBody}
                  </pre>
                  <div className="absolute right-2 top-2">
                    <Button variant="outline" size="sm" onClick={copyDetails} className="h-7 gap-1 px-2">
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {error?.confirm && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-red-600">This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={clear}>
                Cancel
              </Button>
              <Button
                variant={error.confirm.destructive ? "destructive" : "default"}
                onClick={() => {
                  try {
                    error.confirm?.onConfirm?.();
                  } finally {
                    clear();
                  }
                }}
              >
                {error.confirm.label}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
