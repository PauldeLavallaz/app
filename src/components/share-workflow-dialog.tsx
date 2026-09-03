import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Share,
  ExternalLink,
  AlertCircle,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileURLRender } from "@/components/workflows/OutputRender";
import { useAssetsBrowserStore } from "@/components/workspace/Workspace";

interface ShareWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  workflowName: string;
  workflowDescription?: string;
  workflowCoverImage?: string;
}

export function ShareWorkflowDialog({
  open,
  onOpenChange,
  workflowId,
  workflowName,
  workflowDescription,
  workflowCoverImage,
}: ShareWorkflowDialogProps) {
  const [title, setTitle] = useState(workflowName);
  const [description, setDescription] = useState(workflowDescription || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coverImage, setCoverImage] = useState<string>(
    workflowCoverImage || "",
  );

  const queryClient = useQueryClient();
  const { setOpen: setAssetBrowserOpen, setOnAssetSelect } =
    useAssetsBrowserStore();

  // Query to check for existing shared workflows
  const { data: existingShares } = useQuery({
    queryKey: ["workflow", workflowId, "shared-status"],
    enabled: open, // Only fetch when dialog is open
  });

  // Check if this workflow already has shared versions
  const existingShare = (
    existingShares as {
      shared_workflows?: Array<{
        workflow_id: string;
        title: string;
        description: string;
        cover_image?: string;
        user_id: string;
        share_slug: string;
      }>;
    }
  )?.shared_workflows?.find((share) => share.workflow_id === workflowId);

  // Update form fields when existing share is found
  useEffect(() => {
    if (existingShare) {
      setTitle(existingShare.title);
      setDescription(existingShare.description || "");
      setCoverImage(existingShare.cover_image || "");
    } else {
      setTitle(workflowName);
      setDescription(workflowDescription || "");
      setCoverImage(workflowCoverImage || "");
    }
  }, [existingShare, workflowName, workflowDescription, workflowCoverImage]);

  const handleCopyExistingLink = async () => {
    if (existingShare) {
      const shareUrl = `${window.location.origin}/share/workflow/${existingShare.user_id}/${existingShare.share_slug}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Existing share link copied to clipboard!");
    }
  };

  const handleUnpublish = async () => {
    if (!existingShare) return;

    setIsSubmitting(true);
    try {
      await api({
        url: `workflow/${workflowId}/share`,
        init: {
          method: "DELETE",
        },
      });

      toast.success(
        "Workflow unpublished from Explore successfully! It's no longer shared.",
      );

      queryClient.setQueryData(["workflow", workflowId, "shared-status"], {
        shared_workflows: [],
        total: 0,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workflow", workflowId, "shared-status"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["workflows"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["shared-workflows"],
        }),
      ]);

      onOpenChange(false);
    } catch (error) {
      console.error("Unpublish error:", error);
      toast.error("Failed to unpublish workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshShareQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["workflow", workflowId, "shared-status"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["workflows"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["shared-workflows"],
      }),
    ]);
  };

  const handleUpdateWithLatestVersion = async () => {
    if (!existingShare) return;

    setIsSubmitting(true);
    try {
      await api({
        url: `workflow/${workflowId}/share`,
        init: {
          method: "POST",
          body: JSON.stringify({
            workflow_id: workflowId,
            title: existingShare.title,
            description: existingShare.description,
            cover_image: existingShare.cover_image,
            // This will update with the latest workflow version
          }),
        },
      });

      toast.success(
        "Workflow updated with latest version! Your shared workflow now reflects the newest changes.",
      );
      onOpenChange(false);

      await refreshShareQueries();
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Failed to update workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssetSelect = (asset: {
    url: string;
    name: string;
    id: string;
  }) => {
    setCoverImage(asset.url);
    setOnAssetSelect(null);
    setAssetBrowserOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!description.trim()) {
      toast.error("Description is required before publishing");
      return;
    }

    if (!coverImage.trim()) {
      toast.error("Cover image is required before publishing");
      return;
    }

    setIsSubmitting(true);

    try {
      const sharedWorkflow = await api({
        url: `workflow/${workflowId}/share`,
        init: {
          method: "POST",
          body: JSON.stringify({
            workflow_id: workflowId,
            title,
            description,
            cover_image: coverImage,
          }),
        },
      });

      if (sharedWorkflow) {
        const shareUrl = `${window.location.origin}/share/workflow/${sharedWorkflow.user_id}/${sharedWorkflow.share_slug}`;

        await navigator.clipboard.writeText(shareUrl);

        toast.success(
          existingShare
            ? "Workflow updated and published to Explore! Share link copied to clipboard."
            : "Workflow published to Explore successfully! Share link copied to clipboard.",
        );

        onOpenChange(false);

        await refreshShareQueries();

        // Reset form will be handled by useEffect when dialog closes
      }
    } catch (error) {
      console.error("Share workflow error:", error);
      toast.error("Failed to publish workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/15 backdrop-blur-sm" />
      )}
      <Dialog
        open={open}
        onOpenChange={(newOpen) => {
          if (isSubmitting && !newOpen) return;
          onOpenChange(newOpen);
        }}
      >
        <DialogContent className="sm:max-w-[500px]" hideOverlay={true}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="h-5 w-5" />
              Publish to Explore
            </DialogTitle>
          </DialogHeader>

          {existingShare && (
            <Alert className="mb-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="mb-1 font-semibold">
                  <span className="text-green-700 dark:text-green-400">
                    Published to Explore
                  </span>
                </div>
                This workflow is publicly visible in Explore. You can copy
                the link, update it with the latest version, or unpublish it.
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyExistingLink}
                    disabled={isSubmitting}
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Copy Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateWithLatestVersion}
                    disabled={isSubmitting}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Update Latest
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleUnpublish}
                    disabled={isSubmitting}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Unpublish
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title{" "}
                <span className="text-red-500 text-xs dark:text-red-400">
                  *
                </span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter workflow title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description{" "}
                <span className="text-red-500 text-xs dark:text-red-400">
                  *
                </span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter workflow description"
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>
                Cover Image{" "}
                <span className="text-red-500 text-xs dark:text-red-400">
                  *
                </span>
              </Label>
              <div className="flex gap-6">
                {coverImage ? (
                  <div className="group relative h-24 w-24 overflow-hidden rounded-md border">
                    <FileURLRender
                      url={coverImage}
                      imgClasses="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImage("")}
                      className="absolute top-1 right-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-md border-2 border-gray-300 border-dashed hover:border-gray-400"
                    onClick={() => {
                      setOnAssetSelect(handleAssetSelect);
                      setAssetBrowserOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOnAssetSelect(handleAssetSelect);
                        setAssetBrowserOpen(true);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <ImageIcon className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex flex-col justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOnAssetSelect(handleAssetSelect);
                      setAssetBrowserOpen(true);
                    }}
                  >
                    {coverImage ? "Change Image" : "Select Image"}
                  </Button>
                  {!coverImage && (
                    <p className="text-2xs text-muted-foreground">
                      * Cover image is required
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting || !coverImage.trim() || !description.trim()
                }
              >
                {isSubmitting
                  ? existingShare
                    ? "Updating..."
                    : "Publishing..."
                  : existingShare
                    ? "Update & Publish"
                    : "Publish to Explore"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
