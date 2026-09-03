import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useRouter, useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookText,
  Box,
  Database,
  FileClock,
  Folder,
  GitBranch,
  History,
  ImageIcon,
  Link2,
  Loader2,
  Lock,
  Menu,
  Play,
  Plus,
  Save,
  Server,
  Settings,
  Share,
  Slash,
  TextSearch,
  WorkflowIcon,
  X,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DeploymentForm } from "@/components/deployment/DeploymentForm";
import {
  DeploymentDialog,
  useSelectedDeploymentStore,
} from "@/components/deployment/deployment-page";
import {
  getEnvColor,
  useWorkflowDeployments,
} from "@/components/workspace/ContainersTable";
import {
  useSessionIdInSessionView,
  useWorkflowIdInWorkflowPage,
} from "@/hooks/hook";
import {
  useCurrentPlanQuery,
  useIsDeploymentAllowed,
} from "@/hooks/use-current-plan";
import { useCurrentWorkflow } from "@/hooks/use-current-workflow";
import { useGetWorkflowVersionData } from "@/hooks/use-get-workflow-version-data";
import { useMachine } from "@/hooks/use-machine";
import { useSessionAPI } from "@/hooks/use-session-api";
import { api } from "@/lib/api";
import { callServerPromise } from "@/lib/call-server-promise";
import { queryClient } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { serverAction } from "@/lib/workflow-version-api";
import { useDrawerStore } from "@/stores/drawer-store";
import type { Session } from "./app-sidebar";
import { ImageInputsTooltip } from "./image-inputs-tooltip";
import { WorkflowModelCheck } from "./onboarding/workflow-model-check";
import { useIsAdminAndMember } from "./permissions";
import { ShareWorkflowDialog } from "./share-workflow-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CopyButton } from "./ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { useSelectedVersion, VersionSelectV2 } from "./version-select";
import { WorkflowDropdown } from "./workflow-dropdown";
import { AssetBrowserSidebar } from "./workspace/assets-browser-sidebar";
import { DeploymentDrawer } from "./workspace/DeploymentDisplay";
import { ExternalNodeDocs } from "./workspace/external-node-docs";
import { LogDisplay } from "./workspace/LogDisplay";
import { MachineSelect } from "./workspace/MachineSelect";
import { SessionTimer, useSessionTimer } from "./workspace/SessionTimer";
import { useSession } from "./workspace/SessionView";
import { sendWorkflow } from "./workspace/sendEventToCD";
import { getCurrentEffectiveSessionId } from "./workspace/session-creator-form";
import { WorkflowCommitSidePanel } from "./workspace/WorkflowCommitSidePanel";
import { useWorkflowStore } from "./workspace/Workspace";

// Navigation helper hook
function useWorkflowNavigation() {
  const router = useRouter();
  const { workflowId } = useParams({ from: "/workflows/$workflowId/$view" });
  const search = useSearch({ from: "/workflows/$workflowId/$view" });

  return useCallback(
    (
      view: string,
      options?: { sessionId?: string; preserveSearch?: boolean },
    ) => {
      const currentSearch = search as any;

      // Build search params, preserving isFirstTime if it exists
      const searchParams: any = {};

      // Always preserve isFirstTime if it exists
      if (currentSearch?.isFirstTime) {
        searchParams.isFirstTime = currentSearch.isFirstTime;
      }

      // Add sessionId if provided
      if (options?.sessionId) {
        searchParams.sessionId = options.sessionId;
      }

      // If preserveSearch is true, keep all existing search params
      if (options?.preserveSearch) {
        Object.assign(searchParams, currentSearch);
      }

      router.navigate({
        to: "/workflows/$workflowId/$view",
        params: { workflowId, view },
        search: Object.keys(searchParams).length > 0 ? searchParams : undefined,
      });
    },
    [router, workflowId, search],
  );
}

export function WorkflowNavbar() {
  const sessionId = useSessionIdInSessionView();

  return (
    <div>
      <div
        className={cn(
          "pointer-events-none fixed top-0 right-0 left-0 z-40 h-14 backdrop-blur-sm dark:from-zinc-900/80 dark:to-transparent",
          sessionId
            ? "from-zinc-900/80 to-transparent"
            : "bg-gradient-to-b from-white/80 to-transparent ",
        )}
        style={{
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div className="pointer-events-none fixed top-0 right-0 left-0 z-50 flex h-14 items-center">
        <WorkflowNavbarLeft />

        <div
          className={cn(
            "-translate-x-1/2 pointer-events-auto absolute left-1/2 hidden transform items-center md:flex",
            sessionId && "dark",
          )}
        >
          <CenterNavigation />
        </div>

        <div className="pointer-events-auto ml-auto flex items-center pr-2 md:pr-4">
          <WorkflowNavbarRight />
        </div>
      </div>
    </div>
  );
}

function CenterNavigation() {
  const workflowId = useWorkflowIdInWorkflowPage();
  const { workflow } = useCurrentWorkflow(workflowId || "");

  const isAdminAndMember = useIsAdminAndMember();
  const { view } = useParams({ from: "/workflows/$workflowId/$view" });
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const effectiveSessionId = getCurrentEffectiveSessionId(workflowId || "");
  const navigateToView = useWorkflowNavigation();

  const shouldHideDeploymentFeatures = false; //!isPlanLoading && !isDeploymentAllowed;

  const { data: machine, isLoading: isMachineLoading } = useMachine(
    workflow?.selected_machine_id,
  );

  // Detect machine-not-found (404) without hiding UI
  const isMachineNotFound = Boolean(workflow?.selected_machine_id && !machine);
  console.log("isMachineNotFound", isMachineNotFound);

  const deploymentDisabled = shouldHideDeploymentFeatures || isMachineNotFound;

  // Auto-redirect to machine settings when machine is not found
  useEffect(() => {
    if (isMachineLoading) return;
    if (isMachineNotFound && view !== "machine") {
      navigateToView("machine");
    }
  }, [isMachineNotFound, view, navigateToView, isMachineLoading]);

  // Unified helper functions for disabled state
  const isButtonDisabled = (buttonView: string) => {
    // Machine button is never disabled since it's the target for configuration
    if (buttonView === "machine") return false;
    // All other buttons are disabled when machine is not found
    return isMachineNotFound;
  };

  const getDisabledClassName = (buttonView: string, baseClassName: string) => {
    return isButtonDisabled(buttonView)
      ? `${baseClassName} opacity-50 cursor-not-allowed`
      : baseClassName;
  };

  const handleButtonClick = (
    buttonView: string,
    originalHandler: () => void,
  ) => {
    if (isButtonDisabled(buttonView)) {
      navigateToView("machine");
      return;
    }
    originalHandler();
  };

  const [buttonPositions, setButtonPositions] = useState<
    Record<string, { left: number; width: number }>
  >({});
  const lastPositionsRef = useRef<
    Record<string, { left: number; width: number }>
  >({});
  const [positionsReady, setPositionsReady] = useState(false);
  const isFirstRender = useRef(true);
  const hasInteracted = useRef(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Calculate button positions after mount
  useEffect(() => {
    if (!navRef.current) return;

    // Do not force-hide while recalculating to avoid flicker

    const updatePositions = () => {
      const nav = navRef.current;
      if (!nav) return;

      const positions: Record<string, { left: number; width: number }> = {};
      const navRect = nav.getBoundingClientRect();

      nav.querySelectorAll("[data-button-id]").forEach((button) => {
        const id = button.getAttribute("data-button-id");
        if (!id) return;

        const rect = button.getBoundingClientRect();
        positions[id] = {
          left: rect.left - navRect.left,
          width: rect.width,
        };
      });

      // Only update state when positions actually change
      let changed = false;
      const prev = lastPositionsRef.current;
      const keys = new Set([...Object.keys(prev), ...Object.keys(positions)]);
      for (const key of keys) {
        const a = prev[key];
        const b = positions[key];
        if (!a || !b || a.left !== b.left || a.width !== b.width) {
          changed = true;
          break;
        }
      }

      if (changed) {
        setButtonPositions(positions);
        setPositionsReady(true);
        lastPositionsRef.current = positions;
      }
    };

    // Force position update on first interaction
    const handleFirstInteraction = () => {
      if (!hasInteracted.current) {
        hasInteracted.current = true;
        updatePositions();
      }
    };

    // Timers for position updates
    const timers: NodeJS.Timeout[] = [];

    // Use requestAnimationFrame to ensure DOM is painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updatePositions();
      });
    });

    // Multiple attempts to catch layout shifts
    timers.push(setTimeout(updatePositions, 100));
    timers.push(setTimeout(updatePositions, 250));

    // Extra delay for first render to ensure everything is settled
    if (isFirstRender.current) {
      timers.push(
        setTimeout(() => {
          updatePositions();
          isFirstRender.current = false;
        }, 500),
      );
    }

    // Wait for fonts to load
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        updatePositions();
      });
    }

    // Use ResizeObserver with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updatePositions, 10);
    });

    resizeObserver.observe(navRef.current);

    window.addEventListener("resize", updatePositions);

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePositions);
    };
  }, [isAdminAndMember, view]);

  return (
    <div className="mt-2 flex flex-row gap-2">
      <SessionTimerButton
        workflowId={workflowId}
        restoreCachedSession={() => {
          navigateToView("workspace", {
            sessionId: effectiveSessionId || undefined,
          });
        }}
      />

      {/* Main navbar with layout animation */}
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 250,
          damping: 20,
          mass: 0.6,
          opacity: { duration: 0.3 },
        }}
        ref={navRef}
        className="relative z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white/60 px-1.5 text-sm shadow-md backdrop-blur-sm dark:border-zinc-800/50 dark:bg-zinc-700/60"
        onMouseLeave={() => setHoveredButton(null)}
      >
        {/* Floating hover background */}
        <AnimatePresence>
          {hoveredButton && buttonPositions[hoveredButton] && (
            <motion.div
              layoutId="hover-background"
              className="absolute inset-y-1 rounded-full bg-gray-100/60 backdrop-blur-sm dark:bg-zinc-600/20"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                left: buttonPositions[hoveredButton].left,
                width: buttonPositions[hoveredButton].width,
              }}
              exit={{ opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 25,
                mass: 0.5,
              }}
            />
          )}
        </AnimatePresence>

        {/* Workspace button with text - admin only */}
        {isAdminAndMember && (
          <button
            type="button"
            data-button-id="workspace"
            disabled={isButtonDisabled("workspace")}
            className={getDisabledClassName(
              "workspace",
              `relative z-10 flex items-center gap-1.5 px-4 py-2.5 transition-colors ${
                view === "workspace"
                  ? "font-medium text-gray-900 dark:text-zinc-100"
                  : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`,
            )}
            onClick={() =>
              handleButtonClick("workspace", () => {
                navigateToView("workspace", {
                  sessionId: effectiveSessionId || undefined,
                });
              })
            }
            onMouseEnter={() =>
              !isButtonDisabled("workspace") && setHoveredButton("workspace")
            }
          >
            <WorkflowIcon className="h-4 w-4" />
            <span>Workflow</span>
          </button>
        )}

        {/* Playground button with text - always visible */}
        <button
          type="button"
          data-button-id="playground"
          disabled={isButtonDisabled("playground")}
          className={getDisabledClassName(
            "playground",
            `relative z-10 flex items-center gap-1.5 px-4 py-2.5 transition-colors ${
              view === "playground"
                ? "font-medium text-gray-900 dark:text-zinc-100"
                : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`,
          )}
          onClick={() =>
            handleButtonClick("playground", () => {
              navigateToView("playground");
            })
          }
          onMouseEnter={() =>
            !isButtonDisabled("playground") && setHoveredButton("playground")
          }
        >
          <Play className="h-4 w-4" />
          <span>Playground</span>
        </button>

        {/* Machine button - icon only, admin only */}
        {isAdminAndMember && (
          <ImageInputsTooltip tooltipText="Machine" delayDuration={300}>
            <button
              type="button"
              data-button-id="machine"
              disabled={isButtonDisabled("machine")}
              className={getDisabledClassName(
                "machine",
                `relative z-10 flex items-center justify-center p-2.5 transition-colors ${
                  view === "machine"
                    ? "text-gray-900 dark:text-zinc-100"
                    : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`,
              )}
              onClick={() =>
                handleButtonClick("machine", () => {
                  navigateToView("machine");
                })
              }
              onMouseEnter={() =>
                !isButtonDisabled("machine") && setHoveredButton("machine")
              }
            >
              <Settings className="h-4 w-4" />
            </button>
          </ImageInputsTooltip>
        )}

        {/* Model button - icon only, admin only */}
        {isAdminAndMember && (
          <ImageInputsTooltip tooltipText="Model" delayDuration={300}>
            <button
              type="button"
              data-button-id="model"
              disabled={isButtonDisabled("model")}
              className={getDisabledClassName(
                "model",
                `relative z-10 flex items-center justify-center p-2.5 transition-colors ${
                  view === "model"
                    ? "text-gray-900 dark:text-zinc-100"
                    : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`,
              )}
              onClick={() =>
                handleButtonClick("model", () => {
                  navigateToView("model");
                })
              }
              onMouseEnter={() =>
                !isButtonDisabled("model") && setHoveredButton("model")
              }
            >
              <Database className="h-4 w-4" />
            </button>
          </ImageInputsTooltip>
        )}

        {/* Gallery button - icon only, always visible */}
        <ImageInputsTooltip tooltipText="Gallery" delayDuration={300}>
          <button
            type="button"
            data-button-id="gallery"
            disabled={isButtonDisabled("gallery")}
            className={getDisabledClassName(
              "gallery",
              `relative z-10 flex items-center justify-center p-2.5 transition-colors ${
                view === "gallery"
                  ? "text-gray-900 dark:text-zinc-100"
                  : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`,
            )}
            onClick={() =>
              handleButtonClick("gallery", () => {
                navigateToView("gallery");
              })
            }
            onMouseEnter={() =>
              !isButtonDisabled("gallery") && setHoveredButton("gallery")
            }
          >
            <ImageIcon className="h-4 w-4" />
          </button>
        </ImageInputsTooltip>

        {/* Divider between icon buttons and API section */}
        {isAdminAndMember && (
          <div className="mx-1 h-6 w-px bg-gray-300 dark:bg-zinc-600" />
        )}

        {/* API button with text - admin only */}
        {isAdminAndMember && (
          <button
            type="button"
            data-button-id="deployment"
            disabled={deploymentDisabled}
            className={getDisabledClassName(
              "deployment",
              `relative z-10 flex items-center gap-1.5 px-4 py-2.5 transition-colors ${
                !deploymentDisabled
                  ? view === "deployment"
                    ? "font-medium text-gray-900 dark:text-zinc-100"
                    : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  : shouldHideDeploymentFeatures && !isMachineNotFound
                    ? "text-purple-600 dark:text-purple-400"
                    : "text-gray-600 dark:text-zinc-400"
              }`,
            )}
            onClick={() =>
              handleButtonClick("deployment", () => {
                navigateToView("deployment");
              })
            }
            onMouseEnter={() =>
              !deploymentDisabled && setHoveredButton("deployment")
            }
          >
            {shouldHideDeploymentFeatures && !isMachineNotFound ? (
              <Lock className="h-4 w-4" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            <span>API</span>
          </button>
        )}

        {/* Requests button - icon only, admin only */}
        {isAdminAndMember && (
          <ImageInputsTooltip tooltipText="Requests" delayDuration={300}>
            <button
              type="button"
              data-button-id="requests"
              disabled={deploymentDisabled}
              className={getDisabledClassName(
                "requests",
                `relative z-10 flex items-center justify-center p-2.5 transition-colors ${
                  !deploymentDisabled
                    ? view === "requests"
                      ? "text-gray-900 dark:text-zinc-100"
                      : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    : shouldHideDeploymentFeatures && !isMachineNotFound
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-gray-600 dark:text-zinc-400"
                }`,
              )}
              onClick={() =>
                handleButtonClick("requests", () => {
                  navigateToView("requests");
                })
              }
              onMouseEnter={() =>
                !deploymentDisabled && setHoveredButton("requests")
              }
            >
              <TextSearch className="h-4 w-4" />
            </button>
          </ImageInputsTooltip>
        )}

        {/* Active state background */}
        {(() => {
          // Map view names to button IDs
          const viewToButtonId: Record<string, string> = {
            workspace: "workspace",
            playground: "playground",
            machine: "machine",
            model: "model",
            gallery: "gallery",
            deployment: "deployment",
            requests: "requests",
          };

          const buttonId = viewToButtonId[view] || view;
          const position = buttonPositions[buttonId];

          return (
            <motion.div
              className="absolute inset-y-1 rounded-full bg-gradient-to-br from-gray-100/80 via-gray-200/80 to-gray-300/80 backdrop-blur-sm dark:from-zinc-500/50 dark:via-zinc-600/50 dark:to-zinc-700/50"
              style={{
                opacity: positionsReady && position ? 1 : 0,
                pointerEvents: "none",
              }}
              animate={
                position
                  ? {
                      left: position.left,
                      width: position.width,
                    }
                  : undefined
              }
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 30,
                mass: 0.7,
              }}
            />
          );
        })()}
      </motion.div>

    </div>
  );
}

function WorkflowNavbarLeft() {
  const workflowId = useWorkflowIdInWorkflowPage();
  const search = useSearch({ from: "/workflows/$workflowId/$view" });
  const sessionId = (search as any)?.sessionId;

  return (
    <div
      className={cn(
        "pointer-events-auto ml-2 flex items-center gap-2 rounded-full pr-2 pl-4 backdrop-blur-md",
        sessionId
          ? "dark bg-zinc-700/30 shadow-md"
          : "bg-white/50 dark:bg-zinc-800/30",
      )}
    >
      <Link
        href="/"
        className="mr-2 shrink-0 drop-shadow-md transition-transform hover:scale-105"
      >
        <img
          src="/morfeo-icon-light.svg"
          alt="Morfeo Deploy"
          className="h-7 w-7 dark:hidden"
        />
        <img
          src="/morfeo-icon.svg"
          alt="Morfeo Deploy"
          className="hidden h-7 w-7 dark:block"
        />
      </Link>
      {workflowId && (
        <>
          <Slash className="h-3 w-3 shrink-0 text-muted-foreground/50 drop-shadow-md" />
          <WorkflowDropdown
            workflow_id={workflowId}
            className={cn(
              "drop-shadow-md sm:max-w-32",
              sessionId ? "max-w-12" : "max-w-28",
            )}
          />
          <Slash className="h-3 w-3 shrink-0 text-muted-foreground/50 drop-shadow-md" />
          <VersionSelectV2
            workflow_id={workflowId}
            className="drop-shadow-md"
          />
        </>
      )}
    </div>
  );
}

function WorkflowNavbarRight() {
  const search = useSearch({ from: "/workflows/$workflowId/$view" });
  const sessionId = (search as any)?.sessionId;
  const { workflowId, view } = useParams({
    from: "/workflows/$workflowId/$view",
  });
  const { workflow } = useCurrentWorkflow(workflowId || "");
  const { data: machine, isLoading: isMachineLoading } = useMachine(
    workflow?.selected_machine_id,
  );

  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const { selectedDeployment, setSelectedDeployment } =
    useSelectedDeploymentStore();

  // Get deployments and versions for sharing
  const { data: deployments } = useWorkflowDeployments(workflowId || "");
  const { value: version } = useSelectedVersion(workflowId || "");

  const publicShareDeployment = deployments?.find(
    (d: any) => d.environment === "public-share",
  );
  const communityShareDeployment = deployments?.find(
    (d: any) => d.environment === "community-share",
  );
  const privateShareDeployment = deployments?.find(
    (d: any) => d.environment === "private-share",
  );

  // Reset update form state when deployment changes or drawer closes
  useEffect(() => {
    if (!selectedDeployment) {
      setShowUpdateForm(false);
    }
  }, [selectedDeployment]);

  return (
    <>
      <AnimatePresence mode="popLayout">
        {view === "workspace" && !sessionId && (
          <motion.div
            layout
            key="workspace-share"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 180,
              damping: 15,
              mass: 0.8,
              opacity: { duration: 0.4 },
            }}
            className="mt-2 hidden items-center rounded-full border border-gray-200 bg-white/60 text-sm shadow-md backdrop-blur-sm md:flex dark:border-zinc-800/50 dark:bg-zinc-700/60"
          >
            <button
              type="button"
              className="flex h-12 items-center gap-1.5 p-4 text-gray-600 transition-colors hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share className="h-4 w-[18px]" />
              Share
            </button>
          </motion.div>
        )}
        {(view === "playground" || view === "gallery") && (
          <motion.div
            layout
            key="playground-share"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 180,
              damping: 15,
              mass: 0.8,
              opacity: { duration: 0.4 },
            }}
            className={cn(
              "mt-2 hidden items-center rounded-full border text-sm shadow-md backdrop-blur-sm md:flex",
              publicShareDeployment
                ? `${getEnvColor(publicShareDeployment.environment)} border-green-200 bg-green-100/40`
                : communityShareDeployment
                  ? `${getEnvColor(communityShareDeployment.environment)} border-cyan-200 bg-cyan-100/40`
                  : privateShareDeployment
                    ? `${getEnvColor(privateShareDeployment.environment)} border-purple-200 bg-purple-100/40`
                    : "border-gray-200 bg-white/40 dark:border-zinc-800/50 dark:bg-zinc-700/60",
            )}
          >
            <button
              type="button"
              className={cn(
                "flex h-12 items-center gap-1.5 px-4 transition-colors",
                publicShareDeployment
                  ? "text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-100"
                  : communityShareDeployment
                    ? "text-cyan-600 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-100"
                    : privateShareDeployment
                      ? "text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-100"
                      : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (publicShareDeployment) {
                  setSelectedDeployment(publicShareDeployment.id);
                } else if (communityShareDeployment) {
                  setSelectedDeployment(communityShareDeployment.id);
                } else if (privateShareDeployment) {
                  setSelectedDeployment(privateShareDeployment.id);
                } else if (version) {
                  setSelectedVersion(version);
                  setIsDrawerOpen(true);
                }
              }}
            >
              <Share className="h-4 w-[18px]" />
              <span>
                {publicShareDeployment
                  ? "Shared"
                  : communityShareDeployment
                    ? "Community"
                    : privateShareDeployment
                      ? "Internal"
                      : "Link"}
              </span>
            </button>
          </motion.div>
        )}
        {view === "workspace" && sessionId && <SessionBar />}
        {!sessionId && (
          <div className="mt-2 md:hidden">
            <WorkflowNavbarRightMobile />
          </div>
        )}
      </AnimatePresence>

      <ShareWorkflowDialog
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        workflowId={workflowId}
        workflowName={workflow?.name || "Untitled Workflow"}
        workflowDescription={workflow?.description}
        workflowCoverImage={workflow?.cover_image}
      />

      <DeploymentDialog
        open={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedVersion(null);
        }}
        selectedVersion={selectedVersion}
        workflowId={workflowId || ""}
        onSuccess={setSelectedDeployment}
        publicLinkOnly={true}
        existingDeployments={deployments || []}
      />
      <DeploymentDrawer hideHeader={true}>
        {(selectedDeployment === publicShareDeployment?.id ||
          selectedDeployment === privateShareDeployment?.id ||
          selectedDeployment === communityShareDeployment?.id) && (
          <>
            {showUpdateForm ? (
              <DeploymentForm
                workflowId={workflowId || ""}
                isUpdateMode={true}
                deploymentToUpdate={
                  deployments?.find((d: any) => d.id === selectedDeployment) ||
                  null
                }
                onCancel={() => setShowUpdateForm(false)}
                onSubmit={async (data) => {
                  const deployment = deployments?.find(
                    (d: any) => d.id === selectedDeployment,
                  );
                  if (!deployment) return;

                  try {
                    await callServerPromise(
                      api({
                        url: `deployment/${deployment.id}`,
                        init: {
                          method: "PATCH",
                          body: JSON.stringify({
                            workflow_version_id:
                              data.selectedWorkflowVersion?.id,
                            machine_id: data.selectedMachineId,
                            environment: data.selectedEnvironment,
                          }),
                        },
                      }),
                    );
                    toast.success("Deployment updated successfully");
                    setShowUpdateForm(false);
                    await queryClient.invalidateQueries({
                      queryKey: ["workflow", workflowId, "deployments"],
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["deployment", selectedDeployment],
                    });
                  } catch (error: any) {
                    toast.error(
                      `Failed to update deployment: ${error.message}`,
                    );
                  }
                }}
              />
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowUpdateForm(true)}
                >
                  Update
                </Button>
                <Button
                  variant="secondary"
                  className="transition-all hover:bg-gradient-to-b hover:from-red-400 hover:to-red-600 hover:text-white"
                  confirm
                  onClick={async () => {
                    await callServerPromise(
                      api({
                        init: {
                          method: "DELETE",
                        },
                        url: `deployment/${selectedDeployment}`,
                      }),
                    );
                    setSelectedDeployment(null);
                    setSelectedVersion(null);
                    setIsDrawerOpen(false);
                    await queryClient.invalidateQueries({
                      queryKey: ["workflow", workflowId, "deployments"],
                    });
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </>
        )}
      </DeploymentDrawer>
    </>
  );
}

function WorkflowNavbarRightMobile() {
  const router = useRouter();
  const { workflowId } = useParams({
    from: "/workflows/$workflowId/$view",
  });

  // Add permission hooks
  const isAdminAndMember = useIsAdminAndMember();
  const { isLoading: isPlanLoading } = useCurrentPlanQuery();
  const isDeploymentAllowed = useIsDeploymentAllowed();

  // Get machine and check if not found
  const { workflow } = useCurrentWorkflow(workflowId || "");
  const { data: machine, isLoading: isMachineLoading } = useMachine(
    workflow?.selected_machine_id,
  );
  const isMachineNotFound = Boolean(workflow?.selected_machine_id && !machine);

  const shouldHideDeploymentFeatures = !isPlanLoading && !isDeploymentAllowed;

  // Unified mobile helper functions for disabled state
  const isMobileButtonDisabled = (buttonView: string) => {
    // Machine button is never disabled since it's the target for configuration
    if (buttonView === "machine") return false;
    // All other buttons are disabled when machine is not found
    return isMachineNotFound;
  };

  const getMobileDisabledClassName = (
    buttonView: string,
    baseClassName: string,
  ) => {
    return isMobileButtonDisabled(buttonView)
      ? `${baseClassName} opacity-50 cursor-not-allowed`
      : baseClassName;
  };

  const handleMobileButtonClick = (
    buttonView: string,
    originalHandler: () => void,
  ) => {
    if (isMobileButtonDisabled(buttonView)) {
      router.navigate({
        to: "/workflows/$workflowId/$view",
        params: {
          workflowId,
          view: "machine",
        },
      });
      return;
    }
    originalHandler();
  };

  // Handle deployment-specific disabled state for mobile
  const isMobileDeploymentDisabled = (buttonView: string) => {
    if (buttonView === "deployment" || buttonView === "requests") {
      return shouldHideDeploymentFeatures || isMachineNotFound;
    }
    return isMobileButtonDisabled(buttonView);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <motion.div
          layout
          key="workflow-navbar-right-mobile"
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.3 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 180,
            damping: 15,
            mass: 0.8,
            opacity: { duration: 0.4 },
          }}
          className="flex items-center rounded-full border border-zinc-300/50 bg-white/80 text-sm shadow-md backdrop-blur-sm dark:border-zinc-700/50 dark:bg-zinc-700/60"
        >
          <button
            type="button"
            className="flex items-center gap-1.5 p-4 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span className="sr-only">More</span>
            <Menu className="h-4 w-[16px] shrink-0" />
          </button>
        </motion.div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 rounded-2xl bg-white/80 text-gray-600 backdrop-blur-sm md:hidden dark:border-zinc-700/50 dark:bg-zinc-800/70 dark:text-gray-300"
      >
        {/* Only show admin-only items for admins and members */}
        {isAdminAndMember && (
          <>
            <DropdownMenuItem
              className={getMobileDisabledClassName(
                "workspace",
                "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
              )}
              disabled={isMobileButtonDisabled("workspace")}
              onClick={() =>
                handleMobileButtonClick("workspace", () => {
                  router.navigate({
                    to: "/workflows/$workflowId/$view",
                    params: {
                      workflowId,
                      view: "workspace",
                    },
                  });
                })
              }
            >
              <WorkflowIcon size={16} className="mr-2" />
              Workflow
            </DropdownMenuItem>
            <DropdownMenuItem
              className={getMobileDisabledClassName(
                "machine",
                "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
              )}
              disabled={isMobileButtonDisabled("machine")}
              onClick={() =>
                handleMobileButtonClick("machine", () => {
                  router.navigate({
                    to: "/workflows/$workflowId/$view",
                    params: {
                      workflowId,
                      view: "machine",
                    },
                  });
                })
              }
            >
              <Server size={16} className="mr-2" />
              Machine
            </DropdownMenuItem>
            <DropdownMenuItem
              className={getMobileDisabledClassName(
                "model",
                "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
              )}
              disabled={isMobileButtonDisabled("model")}
              onClick={() =>
                handleMobileButtonClick("model", () => {
                  router.navigate({
                    to: "/workflows/$workflowId/$view",
                    params: {
                      workflowId,
                      view: "model",
                    },
                  });
                })
              }
            >
              <Database size={16} className="mr-2" />
              Model
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-4 my-2 bg-zinc-200/60 md:hidden dark:bg-zinc-600/60" />
          </>
        )}

        {/* Playground and Gallery are always available */}
        <DropdownMenuItem
          className={getMobileDisabledClassName(
            "playground",
            "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
          )}
          disabled={isMobileButtonDisabled("playground")}
          onClick={() =>
            handleMobileButtonClick("playground", () => {
              router.navigate({
                to: "/workflows/$workflowId/$view",
                params: {
                  workflowId,
                  view: "playground",
                },
              });
            })
          }
        >
          <Play size={16} className="mr-2" />
          Playground
        </DropdownMenuItem>
        <DropdownMenuItem
          className={getMobileDisabledClassName(
            "gallery",
            "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
          )}
          disabled={isMobileButtonDisabled("gallery")}
          onClick={() =>
            handleMobileButtonClick("gallery", () => {
              router.navigate({
                to: "/workflows/$workflowId/$view",
                params: {
                  workflowId,
                  view: "gallery",
                },
              });
            })
          }
        >
          <ImageIcon size={16} className="mr-2" />
          Gallery
        </DropdownMenuItem>

        {/* Only show deployment features for admins and members */}
        {isAdminAndMember && (
          <>
            <DropdownMenuSeparator className="mx-4 my-2 bg-zinc-200/60 md:hidden dark:bg-zinc-600/60" />
            <DropdownMenuItem
              className={getMobileDisabledClassName(
                "deployment",
                "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
              )}
              disabled={isMobileDeploymentDisabled("deployment")}
              onClick={() =>
                handleMobileButtonClick("deployment", () => {
                  if (!shouldHideDeploymentFeatures) {
                    router.navigate({
                      to: "/workflows/$workflowId/$view",
                      params: {
                        workflowId,
                        view: "deployment",
                      },
                    });
                  }
                })
              }
            >
              {shouldHideDeploymentFeatures && !isMachineNotFound ? (
                <Lock size={16} className="mr-2" />
              ) : (
                <GitBranch size={16} className="mr-2" />
              )}
              API
            </DropdownMenuItem>
            <DropdownMenuItem
              className={getMobileDisabledClassName(
                "requests",
                "px-3 py-2 md:hidden dark:focus:bg-zinc-700/40",
              )}
              disabled={isMobileDeploymentDisabled("requests")}
              onClick={() =>
                handleMobileButtonClick("requests", () => {
                  if (!shouldHideDeploymentFeatures) {
                    router.navigate({
                      to: "/workflows/$workflowId/$view",
                      params: {
                        workflowId,
                        view: "requests",
                      },
                    });
                  }
                })
              }
            >
              <TextSearch size={16} className="mr-2" />
              Requests
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============== utils ==============

function SessionBar() {
  const { hasChanged, workflow } = useWorkflowStore();
  const { activeDrawer, toggleDrawer, closeDrawer } = useDrawerStore();
  const [workflowUpdateTrigger, setWorkflowUpdateTrigger] = useState(0);
  const [sessionId] = useQueryState("sessionId", parseAsString);
  const navigateToView = useWorkflowNavigation();

  const {
    data: session,
    // isLoading: isLoadingSession,
    // isError,
  } = useSession(sessionId);

  const url = session?.url || session?.tunnel_url;

  useEffect(() => {
    if (workflow) {
      setWorkflowUpdateTrigger((prev) => prev + 1);
    }
  }, [workflow]);

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <motion.div
          layout
          key="session-bar-commit"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: hasChanged ? 1.03 : 1 }}
          whileTap={{ scale: hasChanged ? 0.95 : 1 }}
          transition={{
            type: "spring",
            stiffness: 180,
            damping: 15,
            mass: 0.8,
            opacity: { duration: 0.4 },
          }}
          className={cn(
            "flex items-center rounded-full border text-sm shadow-md backdrop-blur-sm transition-colors duration-300",
            hasChanged
              ? "border-orange-400/20 bg-gradient-to-br from-orange-400/40 to-orange-600/40 shadow-orange-500/25 hover:from-orange-500/50 hover:to-orange-600/50 hover:shadow-orange-400/40"
              : " border-zinc-800/30 bg-zinc-700/30 opacity-50 shadow-zinc-700/20",
          )}
        >
          <ImageInputsTooltip
            tooltipText={hasChanged ? "Commit" : "No changes to commit"}
            delayDuration={300}
          >
            <button
              type="button"
              disabled={!hasChanged}
              className={cn(
                "flex h-12 items-center gap-1.5 p-4 transition-colors duration-200",
                hasChanged
                  ? "text-orange-200 hover:text-white"
                  : " text-zinc-600",
              )}
              onClick={() => {
                if (hasChanged) {
                  toggleDrawer("commit");
                }
              }}
            >
              <Save className="h-4 w-[18px]" />
              <span className="hidden sm:block">Commit</span>
            </button>
          </ImageInputsTooltip>
        </motion.div>

        <BackgroundAutoUpdate />

        <DropdownMenu>
          <DropdownMenuTrigger>
            <motion.div
              layout
              key="session-bar-more"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.3 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 180,
                damping: 15,
                mass: 0.8,
                opacity: { duration: 0.4 },
              }}
              className="flex items-center rounded-full border border-zinc-800/50 bg-zinc-700/60 text-sm shadow-md backdrop-blur-sm"
            >
              <ImageInputsTooltip tooltipText="Menu" delayDuration={300}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 p-4 text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  <span className="sr-only">More</span>
                  <Menu className="h-4 w-[16px] shrink-0" />
                </button>
              </ImageInputsTooltip>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="dark w-44 rounded-2xl border-zinc-700/50 bg-zinc-800/70 text-gray-300 backdrop-blur-sm"
          >
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40 md:hidden"
              onClick={() => {
                navigateToView("workspace");
              }}
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-4 my-2 bg-zinc-600/60 md:hidden" />
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40"
              onClick={() => toggleDrawer("log")}
            >
              <FileClock size={16} className="mr-2" />
              Log
            </DropdownMenuItem>
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40"
              onClick={() => toggleDrawer("assets")}
            >
              <Folder size={16} className="mr-2" />
              Assets
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-4 my-2 bg-zinc-600/60" />
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40"
              onClick={() => toggleDrawer("external-node")}
            >
              <BookText size={16} className="mr-2" />
              API Nodes
            </DropdownMenuItem>
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40"
              onClick={() => toggleDrawer("model")}
            >
              <Box size={16} className="mr-2" />
              Model Check
            </DropdownMenuItem>
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40"
              onClick={() => toggleDrawer("integration")}
            >
              <Link2 size={16} className="mr-2" />
              Integration
            </DropdownMenuItem>
            <DropdownMenuItem
              className="px-3 py-2 focus:bg-zinc-700/40"
              onClick={() => toggleDrawer("configuration")}
            >
              <Settings size={16} className="mr-2" />
              Configuration
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Drawer Panel - Slides out from navbar */}
      <AnimatePresence>
        {activeDrawer && (
          <motion.div
            className="fixed top-16 right-0 z-40 h-[calc(100vh-66px)] w-full rounded-xl bg-background shadow-2xl md:right-4 md:h-[calc(100vh-80px)] md:w-[450px]"
            initial={{ opacity: 0, x: 50 }}
            animate={{
              opacity: 1,
              x: 0,
            }}
            exit={{
              opacity: 0,
              x: 50,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 40,
            }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closeDrawer}
              className="absolute top-2 right-2 z-10 rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-700/50 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-full flex-col overflow-hidden">
              <AnimatePresence mode="wait">
                {activeDrawer === "log" && (
                  <motion.div
                    key="log"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-full flex-col p-4"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <FileClock className="h-4 w-4" />
                      <span className="font-medium">Log</span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <LogDisplay
                        className="!w-full h-full"
                        containerClassName="min-h-full"
                      />
                    </div>
                  </motion.div>
                )}

                {activeDrawer === "assets" && (
                  <motion.div
                    key="assets"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-full flex-col p-4"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      <span className="font-medium">Assets</span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <AssetBrowserSidebar
                        onItemClick={(asset) => {
                          closeDrawer();
                        }}
                      />
                    </div>
                  </motion.div>
                )}

                {activeDrawer === "external-node" && (
                  <motion.div
                    key="external-node"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-full flex-col gap-2 p-4"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <BookText className="h-4 w-4" />
                      <span className="font-medium">External API Nodes</span>
                    </div>
                    <span className="mb-4 text-xs leading-snug">
                      External API Nodes are a way to connect to external APIs
                      from within the workflow. Hover to see more details.
                    </span>
                    <ScrollArea className="flex-1">
                      <ExternalNodeDocs />
                    </ScrollArea>
                  </motion.div>
                )}

                {activeDrawer === "model" && (
                  <motion.div
                    key="model"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-full flex-col p-4"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <Box className="h-4 w-4" />
                      <span className="font-medium">Model Check</span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <WorkflowModelCheck
                        workflow={JSON.stringify(workflow)}
                        key={workflowUpdateTrigger}
                        onWorkflowUpdate={sendWorkflow}
                      />
                    </div>
                  </motion.div>
                )}

                {activeDrawer === "integration" && (
                  <motion.div
                    key="integration"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-full flex-col p-4"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      <span className="font-medium">Integration</span>
                    </div>
                    <div className="flex-1">
                      <IntegrationUrl />
                    </div>
                  </motion.div>
                )}

                {activeDrawer === "commit" && url && (
                  <motion.div
                    key="commit"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full"
                  >
                    <WorkflowCommitSidePanel
                      endpoint={url}
                      machine_id={session?.machine_id}
                      machine_version_id={session?.machine_version_id}
                      onClose={() => closeDrawer()}
                    />
                  </motion.div>
                )}

                {activeDrawer === "configuration" && (
                  <motion.div
                    key="configuration"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-full flex-col p-4"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span className="font-medium">
                        Workspace Configuration
                      </span>
                    </div>
                    <div className="flex-1">
                      <WorkspaceConfigurationPanel />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function IntegrationUrl() {
  const sessionId = useSessionIdInSessionView();
  const { data: session } = useQuery<Session>({
    queryKey: ["session", sessionId],
    enabled: !!sessionId,
  });

  const url = useMemo(() => session?.url || session?.tunnel_url, [session]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 p-3">
        <div className="truncate text-muted-foreground text-sm">
          {url || "No session URL available"}
        </div>
        {url && (
          <CopyButton text={url} variant="outline" className="shrink-0" />
        )}
      </div>
    </div>
  );
}

function SessionTimerButton({
  workflowId,
  restoreCachedSession,
}: {
  workflowId: string | null;
  restoreCachedSession: () => void;
}) {
  const navigateToView = useWorkflowNavigation();
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [_, setUrlSessionId] = useQueryState("sessionId", parseAsString);
  const urlSessionId = useSessionIdInSessionView();

  const effectiveSessionId = getCurrentEffectiveSessionId(workflowId || "");
  const activeSessionId = effectiveSessionId || urlSessionId;

  const { data: session, refetch } = useQuery<Session>({
    enabled: !!activeSessionId,
    queryKey: ["session", activeSessionId],
    refetchInterval: (query) => {
      if (!query.state.data) return false;
      if ((query.state.data as Session).timeout_end !== null) return false;
      return 5_000;
    },
  });

  // Only show session if we have both session data AND a valid session ID
  const activeSession = activeSessionId ? session : null;

  const { countdown, progressPercentage } = useSessionTimer(session);
  const { deleteSession } = useSessionAPI();

  // Calculate if less than 30 seconds remaining
  const isLowTime = countdown
    ? (() => {
        const [hours, minutes, seconds] = countdown.split(":").map(Number);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        return totalSeconds < 30;
      })()
    : false;

  // Format countdown to show hours only when necessary
  const formattedCountdown = countdown
    ? (() => {
        const parts = countdown.split(":");
        const hours = parseInt(parts[0], 10);
        return hours > 0 ? countdown : parts.slice(1).join(":");
      })()
    : "00:00";

  // Check if hours are being displayed
  const showsHours = countdown
    ? parseInt(countdown.split(":")[0], 10) > 0
    : false;

  const handleDeleteSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const sessionIdToDelete = activeSessionId;
    if (!sessionIdToDelete) return;
    setIsPopoverOpen(false);

    try {
      navigateToView("workspace");
      await deleteSession.mutateAsync({
        sessionId: sessionIdToDelete,
        // waitForShutdown: true,
      });
      setUrlSessionId(null);

      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["session", sessionIdToDelete],
      });

      toast.success("Session ended successfully");
    } catch (error) {
      toast.error("Failed to end session");
    }
  };

  const handleTimerClick = (e: React.MouseEvent) => {
    if (urlSessionId) {
      setIsPopoverOpen(true);
    } else {
      e.preventDefault();
      e.stopPropagation();
      restoreCachedSession();
    }
  };

  const handleRefetch = async () => {
    await refetch();
    return Promise.resolve();
  };

  return (
    <AnimatePresence mode="popLayout">
      {activeSession && activeSessionId && (
        <motion.div
          layout
          key="session-timer"
          initial={{ opacity: 0, scale: 0.3, x: 120, rotateZ: -5 }}
          animate={{ opacity: 1, scale: 1, x: 0, rotateZ: 0 }}
          exit={{ opacity: 0, scale: 0.3, x: 120, rotateZ: 5 }}
          transition={{
            type: "spring",
            stiffness: 180,
            damping: 15,
            mass: 0.8,
            opacity: { duration: 0.4 },
          }}
          className="flex items-center"
        >
          <TimerPopover
            session={activeSession}
            isDeleteSessionPending={deleteSession.isPending}
            onRefetch={handleRefetch}
            open={isPopoverOpen}
            onOpenChange={setIsPopoverOpen}
          >
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <div
              className={`relative flex h-10 cursor-pointer items-center justify-between overflow-hidden rounded-full shadow-lg transition-all duration-400 ${
                isLowTime
                  ? "bg-gradient-to-br from-orange-400 to-orange-600 shadow-orange-500/25 hover:shadow-orange-500/40 dark:from-orange-500 dark:to-orange-700 dark:shadow-orange-600/25 dark:hover:shadow-orange-600/40"
                  : "border border-gray-200 bg-gradient-to-br from-white to-white shadow-md dark:border-zinc-800/50 dark:from-gray-700 dark:to-gray-800 dark:shadow-gray-700/25 dark:hover:shadow-gray-700/40"
              }`}
              style={{
                width:
                  isHovered || urlSessionId
                    ? showsHours
                      ? "150px"
                      : "134px"
                    : "42px",
                paddingLeft: isHovered || urlSessionId ? "6px" : "0px",
                paddingRight: isHovered || urlSessionId ? "12px" : "0px",
                transitionTimingFunction:
                  isHovered || urlSessionId
                    ? "cubic-bezier(0.68, -0.55, 0.265, 1.55)"
                    : "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                transitionDuration:
                  isHovered || urlSessionId ? "400ms" : "200ms",
              }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={handleTimerClick}
            >
              {/* Timer Icon */}
              {deleteSession.isPending ? (
                <div className="relative flex h-10 w-10 flex-shrink-0 animate-pulse items-center justify-center rounded-full">
                  <Loader2
                    className={cn(
                      "h-5 w-5 animate-spin",
                      isLowTime ? "text-white" : "text-orange-500",
                    )}
                  />
                </div>
              ) : (
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-transform duration-150 hover:scale-105 active:scale-95">
                  {/* Progress ring */}
                  <div className="absolute inset-0.5">
                    <svg
                      viewBox="0 0 32 32"
                      className="-rotate-90 h-full w-full"
                      role="img"
                      aria-label="Session timer progress"
                    >
                      {/* Background ring */}
                      <circle
                        cx="16"
                        cy="16"
                        r="10"
                        fill="none"
                        stroke={
                          isLowTime
                            ? "rgba(255, 255, 255, 0.2)"
                            : "rgba(251, 146, 60, 0.2)"
                        }
                        strokeWidth="2"
                      />
                      {/* Progress ring */}
                      <circle
                        cx="16"
                        cy="16"
                        r="10"
                        fill="none"
                        stroke={
                          isLowTime
                            ? "rgba(255, 255, 255, 0.9)"
                            : "rgba(251, 146, 60, 0.9)"
                        }
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 10}`}
                        strokeDashoffset={`${2 * Math.PI * 10 * (1 - progressPercentage / 100)}`}
                        className="transition-all duration-1000 ease-out"
                      />

                      {/* Clock hand */}
                      <line
                        x1="16"
                        y1="16"
                        x2="16"
                        y2="9"
                        stroke={
                          isLowTime
                            ? "rgba(255, 255, 255, 0.95)"
                            : "rgba(251, 146, 60, 0.95)"
                        }
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        transform={`rotate(${-270 + progressPercentage * 3.6} 16 16)`}
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* Countdown Text and End Button */}
              <div
                className={`flex items-center gap-2 transition-all ${
                  isHovered || urlSessionId
                    ? "translate-x-0 opacity-100"
                    : "translate-x-4 opacity-0"
                }`}
                style={{
                  transitionDelay: isHovered || urlSessionId ? "100ms" : "0ms",
                  transitionDuration:
                    isHovered || urlSessionId ? "300ms" : "150ms",
                  transitionTimingFunction:
                    isHovered || urlSessionId
                      ? "cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                      : "ease-out",
                }}
              >
                <span
                  className={`whitespace-nowrap font-medium text-sm ${
                    isLowTime ? "text-white" : "text-gray-900 dark:text-white"
                  }`}
                >
                  {formattedCountdown}
                </span>

                <ImageInputsTooltip tooltipText="End session">
                  <button
                    type="button"
                    onClick={handleDeleteSession}
                    disabled={deleteSession.isPending}
                    className={`rounded-full p-1 transition-colors duration-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
                      isLowTime
                        ? "text-white hover:text-white"
                        : "text-gray-600 hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400"
                    }`}
                    title="End session"
                  >
                    {deleteSession.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                </ImageInputsTooltip>
              </div>
            </div>
          </TimerPopover>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TimerPopover({
  session,
  isDeleteSessionPending,
  onRefetch,
  open,
  onOpenChange,
  children,
}: {
  session: Session | undefined;
  isDeleteSessionPending: boolean;
  onRefetch: () => Promise<unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  // console.log("🚀 ~ session:", session);
  const [selectedIncrement, setSelectedIncrement] = useState("5");
  const { countdown } = useSessionTimer(session);

  const [hours, minutes, seconds] = countdown.split(":").map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  // Auto-open popover when less than 30 seconds remaining
  useEffect(() => {
    if (totalSeconds > 0 && totalSeconds < 30 && !isDeleteSessionPending) {
      onOpenChange(true);
    }
  }, [totalSeconds, onOpenChange, isDeleteSessionPending]);

  const timeIncrements = [
    { value: "1", label: "1 minute" },
    { value: "5", label: "5 minutes" },
    { value: "10", label: "10 minutes" },
    { value: "15", label: "15 minutes" },
  ];

  const incrementTime = async () => {
    if (!session) {
      toast.error("Session details not found");
      return;
    }

    try {
      await increaseSessionTimeout(session.id, Number(selectedIncrement));
      onRefetch();
      // Only close the popover when time is increased
      if (totalSeconds >= 30) {
        onOpenChange(false);
      }
    } catch (error) {
      // Error handling is already done in the utility function
      console.error("Failed to increase session timeout:", error);
    }
  };

  // Function to determine text color based on the time remaining
  const getTimeWarningClass = () => {
    if (totalSeconds < 30) {
      return "text-yellow-600";
    }
    return "text-muted-foreground";
  };

  return (
    <Popover
      open={open}
      onOpenChange={(openState) => {
        // Only allow closing the popover if time is >= 30 seconds
        if (totalSeconds < 30 && !openState) {
          return; // Prevent closing when time is < 30 seconds
        }
        onOpenChange(openState);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[340px]">
        <span className="font-medium text-sm">Increase Session Time</span>
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center text-muted-foreground text-sm">
              <span className="flex items-center space-x-2">
                Instance:{" "}
                <span className="ml-1 font-medium">{session?.gpu}</span>
              </span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between rounded-none bg-muted/50 px-2 py-3">
                <div className="flex items-center gap-2">
                  <History className={`h-4 w-4 ${getTimeWarningClass()}`} />
                  <span
                    className={`font-medium text-sm ${getTimeWarningClass()}`}
                  >
                    Time Remaining
                  </span>
                </div>
                {session && (
                  <SessionTimer
                    session={session}
                    size="sm"
                    className={getTimeWarningClass()}
                  />
                )}
              </div>
              {session?.timeout_end && session?.created_at && (
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all ${
                      totalSeconds < 30 ? "bg-yellow-500" : "bg-primary"
                    }`}
                    style={{
                      width: `${
                        ((new Date(session.timeout_end).getTime() -
                          Date.now()) /
                          (new Date(session.timeout_end).getTime() -
                            new Date(session.created_at).getTime())) *
                        100
                      }%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Select
              value={selectedIncrement}
              onValueChange={setSelectedIncrement}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Minutes" />
              </SelectTrigger>
              <SelectContent>
                {timeIncrements.map((increment) => (
                  <SelectItem key={increment.value} value={increment.value}>
                    {increment.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={incrementTime} className="flex-1">
              <Plus className="mr-2 h-4 w-4" /> Add Time
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Utility function to increase session timeout
function increaseSessionTimeout(
  sessionId: string | null,
  minutes: number,
): Promise<any> {
  if (!sessionId) {
    return Promise.reject("No session ID provided");
  }

  return callServerPromise(
    api({
      url: `session/${sessionId}/increase-timeout`,
      init: {
        method: "POST",
        body: JSON.stringify({
          minutes: minutes,
        }),
      },
    }),
    {
      loadingText: "Increasing session time...",
      successMessage: "Session time extended",
    },
  );
}

function BackgroundAutoUpdate() {
  const { userId } = useAuth();
  const { hasChanged } = useWorkflowStore();
  const workflowId = useWorkflowIdInWorkflowPage();
  const sessionId = useSessionIdInSessionView();

  // Get all the values we need
  const settings = JSON.parse(
    localStorage.getItem("workspaceConfig") || "{}",
  ) || {
    autoSave: false,
    autoSaveInterval: "60",
    autoExpandSession: false,
  };

  const { data: session, refetch } = useQuery<Session>({
    queryKey: ["session", sessionId],
    enabled: !!sessionId && settings.autoExpandSession,
  });

  const { countdown } = useSessionTimer(session);
  const autoExtendInProgressRef = useRef(false);
  const isLegacyMode = !session?.timeout_end;

  // Auto-save related data
  const machine_id = session?.machine_id;
  const machine_version_id = session?.machine_version_id;
  const session_url = session?.url;
  const endpoint = session?.url || session?.tunnel_url;
  const { value: selectedVersion } = useSelectedVersion(workflowId || "");

  const {
    query,
    setVersion,
    is_fluid_machine,
    comfyui_snapshot,
    comfyui_snapshot_loading,
  } = useGetWorkflowVersionData({
    machine_id,
    machine_version_id,
    session_url,
    workflowId,
  });

  // Store the save function in a ref so it doesn't change
  const saveFunction = useRef<() => Promise<void>>(undefined);

  // Store the extend function in a ref so it doesn't change
  const extendFunction = useRef<() => Promise<void>>(undefined);

  // Update the save function whenever dependencies change
  useEffect(() => {
    saveFunction.current = async () => {
      try {
        await serverAction({
          comment: "Auto Save",
          endpoint,
          machine_id,
          machine_version_id,
          userId,
          workflowId,
          is_fluid_machine,
          query,
          setVersion,
          setOpen: () => {},
          snapshotAction: "COMMIT_ONLY",
          comfyui_snapshot,
          comfyui_snapshot_loading,
          sessionId,
          workflow_api: selectedVersion?.workflow_api,
        });
      } catch (error) {}
    };
  }, [
    endpoint,
    machine_id,
    machine_version_id,
    userId,
    workflowId,
    is_fluid_machine,
    query,
    setVersion,
    comfyui_snapshot,
    comfyui_snapshot_loading,
    sessionId,
    selectedVersion?.workflow_api,
  ]);

  // Update the extend function whenever dependencies change
  useEffect(() => {
    extendFunction.current = async () => {
      if (!sessionId) return;

      try {
        autoExtendInProgressRef.current = true;

        await increaseSessionTimeout(sessionId, 5);
        await refetch();
      } catch (error) {
        toast.error(`Failed to auto-extend session: ${error}`);
      } finally {
        // Add a small delay before allowing another auto-extension
        setTimeout(() => {
          autoExtendInProgressRef.current = false;
        }, 10000);
      }
    };
  }, [sessionId, refetch]);

  // Separate effect for managing the auto-save interval - only depends on stable values
  useEffect(() => {
    let saveIntervalId: NodeJS.Timeout | undefined;

    const { autoSave, autoSaveInterval } = settings;

    if (hasChanged && autoSave && saveFunction.current) {
      saveIntervalId = setInterval(() => {
        if (saveFunction.current) {
          saveFunction.current();
        }
      }, +autoSaveInterval * 1000);
    }

    return () => {
      if (saveIntervalId) {
        clearInterval(saveIntervalId);
        saveIntervalId = undefined;
      }
    };
  }, [settings.autoSave, settings.autoSaveInterval, hasChanged]); // Only stable dependencies

  // Separate effect for monitoring countdown - runs every second but only checks conditions
  useEffect(() => {
    if (
      !settings.autoExpandSession ||
      !sessionId ||
      !countdown ||
      autoExtendInProgressRef.current ||
      isLegacyMode ||
      !extendFunction.current
    ) {
      return;
    }

    const [hours, minutes, seconds] = countdown.split(":").map(Number);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    if (totalSeconds > 0 && totalSeconds < 60) {
      extendFunction.current();
    }
  }, [countdown, settings.autoExpandSession, sessionId, isLegacyMode]);

  return <></>;
}

// Workspace Configuration Panel Component
function WorkspaceConfigurationPanel() {
  const sessionId = useSessionIdInSessionView();
  // Load settings from localStorage with defaults
  const [settings, setSettings] = useState(() => {
    const savedSettings = localStorage.getItem("workspaceConfig");
    return savedSettings
      ? JSON.parse(savedSettings)
      : {
          autoSave: false,
          autoSaveInterval: "60",
          autoExpandSession: false,
        };
  });
  const { data: session } = useQuery<Session>({
    queryKey: ["session", sessionId],
    enabled: !!sessionId && settings.autoExpandSession,
  });
  const isLegacyMode = !session?.timeout_end;

  // Update settings and save to localStorage
  const updateSettings = useCallback((key: string, value: any) => {
    setSettings((prev: any) => {
      const newSettings = { ...prev, [key]: value };
      localStorage.setItem("workspaceConfig", JSON.stringify(newSettings));
      return newSettings;
    });
  }, []);
  // Format interval text
  const getIntervalText = () => {
    if (!settings.autoSave) return "";
    return settings.autoSaveInterval === "30"
      ? "30s"
      : settings.autoSaveInterval === "300"
        ? "5m"
        : "1m";
  };

  return (
    <div className="space-y-3">
      {/* Auto Save Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Auto Save</span>
              {settings.autoSave && (
                <Badge variant="outline" className="h-5 px-2 text-xs">
                  {getIntervalText()}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Automatically commit workflow changes
            </p>
          </div>
          <Switch
            checked={settings.autoSave}
            onCheckedChange={(checked) => updateSettings("autoSave", checked)}
          />
        </div>

        {settings.autoSave && (
          <div className="ml-4 border-muted border-l-2 pl-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Interval:</span>
              <Select
                value={settings.autoSaveInterval}
                onValueChange={(value) =>
                  updateSettings("autoSaveInterval", value)
                }
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">1m</SelectItem>
                  <SelectItem value="300">5m</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Session Management Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-medium text-sm">Auto Expand Session</span>
            <p className="text-muted-foreground text-xs">
              Automatically extend session time when about to expire
            </p>
          </div>
          <Switch
            checked={settings.autoExpandSession}
            onCheckedChange={(checked) =>
              updateSettings("autoExpandSession", checked)
            }
          />
        </div>

        {settings.autoExpandSession && session && (
          <div className="ml-4 border-muted border-l-2 pl-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span>Status:</span>
              <span className="text-green-600">
                {isLegacyMode ? "Not supported (legacy session)" : "Active"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
