import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FileURLRender } from "@/components/workflows/OutputRender";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  Eye,
  ExternalLink,
  Import,
  User,
  Calendar,
  Workflow,
  Settings,
} from "lucide-react";
import { getRelativeTime } from "@/lib/get-relative-time";
import { useState, lazy, Suspense, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { WorkflowProperties } from "@/components/workflow-preview/workflow-properties";
import { UserIcon } from "@/components/run/SharePageComponent";
import { useAuth, useClerk } from "@clerk/clerk-react";

const ComfyUIFlow = lazy(() =>
  import("@/components/workflow-preview/comfyui-flow").then((mod) => ({
    default: mod.ComfyUIFlow,
  })),
);

interface WorkflowEnvironment {
  comfyui_version?: string;
  gpu?: string;
  python_version?: string;
  base_docker_image?: string;
  docker_command_steps?: {
    steps?: Array<{
      type: string;
      data?: {
        name?: string;
        url?: string;
      };
    }>;
  };
}

interface SharedWorkflow {
  id: string;
  user_id: string;
  org_id: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_export: {
    workflow_api?: Record<string, unknown>;
    environment?: WorkflowEnvironment;
    [key: string]: unknown;
  };
  share_slug: string;
  title: string;
  description: string;
  cover_image: string;
  is_public: boolean;
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export const Route = createFileRoute("/share/workflow/$user/$slug")({
  component: SharedWorkflowDetails,
});

function SharedWorkflowDetails() {
  const { user: userParam, slug } = Route.useParams();
  const [isDownloading, setIsDownloading] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();
  const clerk = useClerk();

  const {
    data: sharedWorkflow,
    isLoading,
    error,
  } = useQuery<SharedWorkflow>({
    queryKey: ["shared-workflow", slug],
    queryFn: async () => {
      const apiUrl = `shared-workflows/${slug}`;
      console.log("Making API request to:", apiUrl);

      try {
        const data = await api({
          url: apiUrl,
        });
        console.log("API Response data:", data);
        return data;
      } catch (error) {
        console.error("API Error:", error);
        throw error;
      }
    },
    // Prevent frequent refetching to avoid inflated view counts
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Track views once per session
  useEffect(() => {
    if (!sharedWorkflow) return;

    const sessionKey = `viewed_workflow_${slug}`;
    const hasViewed = sessionStorage.getItem(sessionKey);

    if (!hasViewed) {
      // Track the view
      api({
        url: `shared-workflows/${slug}/view`,
        init: { method: "POST" },
      })
        .then(() => {
          sessionStorage.setItem(sessionKey, "true");
        })
        .catch((error) => {
          console.error("Failed to track view:", error);
        });
    }
  }, [sharedWorkflow, slug]);

  console.log("Query state:", { isLoading, error, sharedWorkflow });

  const handleDownload = async () => {
    if (!sharedWorkflow) return;

    // Check if user is signed in
    if (!auth.isSignedIn) {
      clerk.openSignIn({
        redirectUrl: window.location.href,
      });
      return;
    }

    setIsDownloading(true);
    try {
      // Use api utility with raw: true to get the response object
      const response = await api({
        url: `shared-workflows/${slug}/download`,
        raw: true,
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `${sharedWorkflow.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Workflow downloaded successfully!");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download workflow");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUseWorkflow = () => {
    if (!sharedWorkflow) return;

    // Navigate to the import flow with pre-populated workflow data
    navigate({
      to: "/workflows",
      search: {
        view: "import",
        shared_workflow_id: sharedWorkflow.id,
        shared_slug: slug,
      },
    });
  };

  if (isLoading) {
    return <SharedWorkflowDetailsSkeleton />;
  }

  if (error || !sharedWorkflow) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <h2 className="mb-2 text-2xl font-bold text-muted-foreground">
              Workflow Not Found
            </h2>
            <p className="mb-4 text-muted-foreground">
              The shared workflow you're looking for doesn't exist or has been
              removed.
            </p>
            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <strong>Debug info:</strong>
                <br />
                User: {userParam}
                <br />
                Slug: {slug}
                <br />
                Error: {error.message}
              </div>
            )}
            <Link to="/explore">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Browse
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/explore">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Browse
          </Button>
        </Link>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Cover Image */}
          <div className="w-full lg:w-1/3">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted">
              {sharedWorkflow.cover_image ? (
                <FileURLRender
                  url={sharedWorkflow.cover_image}
                  imgClasses="h-full w-full object-cover"
                  isSmallView
                />
              ) : (
                <Workflow className="h-16 w-16 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 space-y-4">
            <div>
              <h1 className="mb-2 font-semibold text-2xl">
                {sharedWorkflow.title}
              </h1>
              <p className="text-muted-foreground text-sm leading-5">
                {sharedWorkflow.description || "No description provided"}
              </p>
            </div>

            {/* Author */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Shared by</span>
              <UserIcon
                user_id={sharedWorkflow.user_id}
                className="h-5 w-5"
                displayName={true}
              />
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span>{sharedWorkflow.view_count} views</span>
              </div>
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>{sharedWorkflow.download_count} downloads</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Shared {getRelativeTime(sharedWorkflow.created_at)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="gap-2" onClick={handleUseWorkflow}>
                <Import className="h-4 w-4" />
                Use This Workflow
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={handleDownload}
                disabled={isDownloading}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {isDownloading ? "Downloading..." : "Download JSON"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Preview */}
      {sharedWorkflow.workflow_export && (
        <div className="space-y-6">
          {/* Workflow Properties */}
          <WorkflowProperties workflow={sharedWorkflow.workflow_export} />

          {/* Workflow Visual Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Workflow className="h-5 w-5" />
                Workflow Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] w-full rounded-lg border bg-muted/20">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <p className="text-sm text-muted-foreground">
                          Loading workflow preview...
                        </p>
                      </div>
                    </div>
                  }
                >
                  <ComfyUIFlow
                    workflow={sharedWorkflow.workflow_export}
                    apiFormat={sharedWorkflow.workflow_export.workflow_api}
                  />
                </Suspense>
              </div>
            </CardContent>
          </Card>

          {/* Environment Configuration */}
          {sharedWorkflow.workflow_export.environment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5" />
                  Environment Configuration
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  This workflow includes pre-configured environment settings
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="font-medium text-left py-2 pr-4 text-muted-foreground">
                          Setting
                        </th>
                        <th className="font-medium text-left py-2 text-muted-foreground">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sharedWorkflow.workflow_export.environment
                        ?.comfyui_version && (
                        <tr>
                          <td className="font-medium py-2 pr-4">
                            ComfyUI Version
                          </td>
                          <td className="bg-muted font-mono px-2 py-2 rounded text-xs">
                            {
                              sharedWorkflow.workflow_export.environment
                                .comfyui_version
                            }
                          </td>
                        </tr>
                      )}
                      {sharedWorkflow.workflow_export.environment?.gpu && (
                        <tr>
                          <td className="font-medium py-2 pr-4">GPU Type</td>
                          <td className="py-2">
                            <Badge variant="secondary">
                              {sharedWorkflow.workflow_export.environment.gpu}
                            </Badge>
                          </td>
                        </tr>
                      )}
                      {sharedWorkflow.workflow_export.environment
                        ?.python_version && (
                        <tr>
                          <td className="font-medium py-2 pr-4">
                            Python Version
                          </td>
                          <td className="bg-muted font-mono px-2 py-2 rounded text-xs">
                            {
                              sharedWorkflow.workflow_export.environment
                                .python_version
                            }
                          </td>
                        </tr>
                      )}
                      {sharedWorkflow.workflow_export.environment
                        ?.base_docker_image && (
                        <tr>
                          <td className="font-medium py-2 pr-4">
                            Base Docker Image
                          </td>
                          <td className="break-all bg-muted font-mono px-2 py-2 rounded text-xs">
                            {
                              sharedWorkflow.workflow_export.environment
                                .base_docker_image
                            }
                          </td>
                        </tr>
                      )}

                      {sharedWorkflow.workflow_export.environment
                        ?.docker_command_steps?.steps &&
                        sharedWorkflow.workflow_export.environment
                          .docker_command_steps.steps.length > 0 && (
                          <tr>
                            <td className="align-top font-medium py-2 pr-4">
                              Custom Nodes
                            </td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                {sharedWorkflow.workflow_export.environment.docker_command_steps.steps
                                  .filter((step) => step.type === "custom-node")
                                  .map((step, index) => (
                                    <Badge
                                      key={`custom-node-${step.data?.name || step.data?.url || index}`}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {step.data?.name ||
                                        step.data?.url?.split("/").pop() ||
                                        "Unknown"}
                                    </Badge>
                                  ))}
                              </div>
                            </td>
                          </tr>
                        )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usage Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5" />
                How to Use
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <p>
                    Click <strong>"Use This Workflow"</strong> to import it into
                    your Morfeo Deploy workspace with pre-configured environment
                    settings
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary" />
                  <p>
                    Download the JSON file to use in your own ComfyUI instance
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SharedWorkflowDetailsSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Skeleton className="mb-4 h-10 w-32" />

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="w-full lg:w-1/3">
            <Skeleton className="aspect-video rounded-lg" />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <Skeleton className="mb-2 h-8 w-3/4" />
              <Skeleton className="h-6 w-full" />
            </div>

            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>

            <div className="flex gap-3">
              <Skeleton className="h-12 w-40" />
              <Skeleton className="h-12 w-36" />
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Skeleton className="mb-3 h-5 w-32" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>

          <div>
            <Skeleton className="mb-3 h-5 w-24" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
