import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import {
    Check,
    CheckCircle2,
    Circle,
    CircleCheckBig,
    FileText,
    Image as ImageIcon,
    Lightbulb,
    MousePointer,
    Plus,
    Upload,
    AlertCircle,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type {
    ConflictingNodeInfo,
    WorkflowDependencies,
} from "@/components/onboarding/workflow-analyze";
import type { NodeData } from "@/components/onboarding/workflow-machine-import";
import {
    buildDockerStepsFromNodes,
    findFirstDuplicateNode,
    type GpuTypes,
    WorkflowImportCustomNodeSetup,
    WorkflowImportSelectedMachine,
} from "@/components/onboarding/workflow-machine-import";
import { WorkflowModelCheck } from "@/components/onboarding/workflow-model-check";
import {
    type Step,
    type StepComponentProps,
    StepForm,
} from "@/components/step-form";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useLatestHashes } from "@/utils/comfydeploy-hash";
import { defaultWorkflowTemplates } from "@/utils/default-workflow";
import {
    extractWorkflowFromPNG,
    isPNGFile,
} from "@/utils/png-metadata-extractor";
import { FileURLRender } from "../workflows/OutputRender";
import { useCurrentPlan } from "@/hooks/use-current-plan";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { Route } from "@/routes/workflows";
import { buildImportedWorkflowPatch } from "./workflow-import-utils";

// Add these interfaces
export interface StepValidation {
    reset: (latestHashes?: {
        comfyui_hash?: string;
        comfydeploy_hash?: string;
    }) => void;
    setValidation: (validation: Partial<StepValidation>) => void;

    setWorkflowName: (workflowName: string) => void;
    setImportOption: (importOption: "import" | "default") => void;
    setImportJson: (importJson: string) => void;
    setWorkflowJson: (workflowJson: string) => void;
    setWorkflowApi: (workflowApi: string) => void;
    setSelectedMachineId: (selectedMachineId: string) => void;
    setMachineOption: (machineOption: "existing" | "new") => void;
    setMachineName: (machineName: string) => void;
    setGpuType: (gpuType: GpuTypes) => void;
    setComfyUiHash: (comfyUiHash: string) => void;
    setSelectedComfyOption: (
        selectedComfyOption: "recommended" | "latest" | "custom",
    ) => void;
    setDependencies: (dependencies: WorkflowDependencies) => void;
    setSelectedConflictingNodes: (selectedConflictingNodes: {
        [nodeName: string]: ConflictingNodeInfo[];
    }) => void;
    setDockerCommandSteps: (dockerCommandSteps: DockerCommandSteps) => void;
    setHasEnvironment: (hasEnvironment: boolean) => void;
    setExistingMachineMissingNodes: (
        existingMachineMissingNodes: NodeData[],
    ) => void;
    setImportedFileName: (importedFileName: string) => void;

    latestHashes?: { comfyui_hash?: string; comfydeploy_hash?: string };

    workflowName?: string;
    importOption?: "import" | "default";
    importJson?: string;
    workflowJson?: string;
    workflowApi?: string;
    selectedMachineId?: string;
    machineOption?: "existing" | "new";
    existingMachine?: any;
    machineConfig?: any; // only for existing machine
    existingMachineMissingNodes?: NodeData[];
    // Add more fields as needed for future steps
    hasEnvironment?: boolean;
    machineName?: string;
    gpuType?: GpuTypes;
    python_version?: string;
    install_custom_node_with_gpu?: boolean;
    base_docker_image?: string;
    comfyUiHash?: string;
    selectedComfyOption?: "recommended" | "latest" | "custom";
    firstTimeSelectGPU?: boolean;
    importedFileName?: string;
    selectedTemplateId?: string;

    dependencies?: WorkflowDependencies;
    selectedConflictingNodes?: {
        [nodeName: string]: ConflictingNodeInfo[];
    };
    selectedCustomNodesToApply?: Set<string>;

    docker_command_steps?: DockerCommandSteps;
    isEditingHashOrAddingCommands?: boolean;
}
interface DockerCommandSteps {
    steps: DockerCommandStep[];
}

interface DockerCommandStep {
    id: string;
    type: "custom-node" | "commands";
    data: CustomNodeData | string;
}

interface CustomNodeData {
    name: string;
    hash?: string;
    url: string;
    files: string[];
    install_type: "git-clone";
    pip?: string[];
    meta?: {
        message: string;
        latest_hash?: string;
        committer?: {
            name: string;
            email: string;
            date: string;
        };
        commit_url?: string;
        stargazers_count?: number;
    };
}

// Random name generator for workflows
function generateRandomWorkflowName(): string {
    const adjectives = [
        "Cosmic",
        "Neural",
        "Digital",
        "Mystic",
        "Quantum",
        "Ethereal",
        "Luminous",
        "Crystalline",
        "Infinite",
        "Radiant",
        "Spectral",
        "Vivid",
        "Prismatic",
        "Celestial",
        "Enchanted",
        "Sublime",
        "Ethereal",
        "Boundless",
        "Transcendent",
        "Luminescent",
        "Iridescent",
        "Kaleidoscopic",
        "Shimmering",
    ];

    const nouns = [
        "Canvas",
        "Vision",
        "Dream",
        "Artisan",
        "Forge",
        "Studio",
        "Workshop",
        "Laboratory",
        "Atelier",
        "Gallery",
        "Realm",
        "Odyssey",
        "Journey",
        "Creation",
        "Masterpiece",
        "Symphony",
        "Tapestry",
        "Mosaic",
        "Prism",
        "Aurora",
        "Nebula",
        "Constellation",
        "Genesis",
        "Renaissance",
    ];

    const randomAdjective =
        adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

    return `${randomAdjective} ${randomNoun}`;
}

function generateRandomMachineName(workflowName: string): string {
    return `${workflowName}'s Machine`;
}

// Add this helper function near the top of the file, after the imports
function ensureComfyUIDeployInSteps(
    dockerSteps: any,
    latestHashes?: { comfydeploy_hash?: string },
): any {
    if (!dockerSteps?.steps) {
        return {
            steps: [
                {
                    id: crypto.randomUUID().slice(0, 10),
                    type: "custom-node",
                    data: {
                        name: "ComfyUI Deploy",
                        url: "https://github.com/BennyKok/comfyui-deploy",
                        files: [],
                        install_type: "git-clone",
                        pip: [],
                        hash: latestHashes?.comfydeploy_hash,
                    },
                },
            ],
        };
    }

    // Check if ComfyUI Deploy already exists (case insensitive)
    const hasComfyDeploy = dockerSteps.steps.some((step: any) => {
        if (step.type !== "custom-node") return false;
        console.log("step: ", step);
        const url = step.data?.url?.toLowerCase();
        return (
            url === "https://github.com/bennykok/comfyui-deploy" ||
            url === "https://github.com/bennykok/comfyui-deploy.git" ||
            url === "git@github.com:bennykok/comfyui-deploy.git"
        );
    });

    if (hasComfyDeploy) {
        console.log("hasComfyDeploy: ", hasComfyDeploy);
        // Update existing ComfyUI Deploy with latest hash if needed
        return {
            ...dockerSteps,
            steps: dockerSteps.steps.map((step: any) => {
                if (step.type !== "custom-node") return step;
                const url = step.data?.url?.toLowerCase();
                const isComfyDeploy =
                    url === "https://github.com/bennykok/comfyui-deploy" ||
                    url === "https://github.com/bennykok/comfyui-deploy.git" ||
                    url === "git@github.com:bennykok/comfyui-deploy.git";

                if (isComfyDeploy) {
                    return {
                        ...step,
                        data: {
                            ...step.data,
                            hash: step.data.hash || latestHashes?.comfydeploy_hash,
                        },
                    };
                }
                return step;
            }),
        };
    }

    // Add ComfyUI Deploy if not present
    return {
        ...dockerSteps,
        steps: [
            ...dockerSteps.steps,
            {
                id: crypto.randomUUID().slice(0, 10),
                type: "custom-node",
                data: {
                    name: "ComfyUI Deploy",
                    url: "https://github.com/BennyKok/comfyui-deploy",
                    files: [],
                    install_type: "git-clone",
                    pip: [],
                    hash: latestHashes?.comfydeploy_hash,
                },
            },
        ],
    };
}

export const useImportWorkflowStore = create<StepValidation>((set, get) => ({
    workflowName: "",
    importOption:
        (localStorage.getItem("workflowImportOption") as "import" | "default") ||
        "import",
    get importJson() {
        return get().workflowJson;
    },
    workflowJson: "",
    workflowApi: "",
    selectedMachineId: "",
    machineOption: "new",
    machineName: "",
    gpuType: "A10G",
    comfyUiHash: "",
    selectedComfyOption: "recommended",
    dependencies: undefined,
    selectedConflictingNodes: {},
    importedFileName: "",
    selectedTemplateId: undefined,
    docker_command_steps: {
        steps: [
            {
                id: crypto.randomUUID().slice(0, 10),
                type: "custom-node",
                data: {
                    name: "ComfyUI Deploy",
                    url: "https://github.com/BennyKok/comfyui-deploy",
                    files: [],
                    install_type: "git-clone",
                    pip: [],
                    hash: "",
                },
            },
        ],
    },

    setWorkflowName: (workflowName: string) =>
        set({ workflowName, machineName: generateRandomMachineName(workflowName) }),
    setImportOption: (importOption: "import" | "default") =>
        set({ importOption }),
    setImportJson: (importJson: string) => set({ workflowJson: importJson }),
    setWorkflowJson: (workflowJson: string) => set({ workflowJson }),
    setWorkflowApi: (workflowApi: string) => set({ workflowApi }),
    setSelectedMachineId: (selectedMachineId: string) =>
        set({ selectedMachineId }),
    setMachineOption: (machineOption: "existing" | "new") =>
        set({ machineOption }),
    setMachineName: (machineName: string) => set({ machineName }),
    setGpuType: (gpuType: GpuTypes) => set({ gpuType }),
    setComfyUiHash: (comfyUiHash: string) => set({ comfyUiHash }),
    setSelectedComfyOption: (
        selectedComfyOption: "recommended" | "latest" | "custom",
    ) => set({ selectedComfyOption }),
    setDependencies: (dependencies: WorkflowDependencies) =>
        set({ dependencies }),
    setSelectedConflictingNodes: (selectedConflictingNodes: {
        [nodeName: string]: ConflictingNodeInfo[];
    }) => set({ selectedConflictingNodes }),
    setDockerCommandSteps: (dockerCommandSteps: DockerCommandSteps) =>
        set({ docker_command_steps: dockerCommandSteps }),
    setHasEnvironment: (hasEnvironment: boolean) => set({ hasEnvironment }),
    setExistingMachineMissingNodes: (existingMachineMissingNodes: NodeData[]) =>
        set({ existingMachineMissingNodes }),
    setImportedFileName: (importedFileName: string) => set({ importedFileName }),

    setValidation: (update: Partial<StepValidation>) => {
        const current = get();
        // Start from current state and shallow-merge the update
        const next: StepValidation = {
            ...(current as StepValidation),
            ...(update as StepValidation),
        } as StepValidation;

        // Only modify workflowJson if the caller provided one of these fields
        if (Object.prototype.hasOwnProperty.call(update, "workflowJson")) {
            // use provided workflowJson as-is (may be empty string intentionally)
        } else if (Object.prototype.hasOwnProperty.call(update, "importJson")) {
            // keep workflowJson in sync when importJson is explicitly provided
            // @ts-ignore - Partial may not include importJson
            next.workflowJson = update.importJson as string;
        } else {
            // Preserve existing workflowJson; do not clobber it on unrelated updates
            next.workflowJson = current.workflowJson;
        }

        // Keep machine name derived from workflow name on changes
        next.machineName = generateRandomMachineName(current.workflowName || "");

        set(next as Partial<StepValidation>);
    },

    latestHashes: undefined,

    reset: (latestHashes?: {
        comfyui_hash?: string;
        comfydeploy_hash?: string;
    }) => {
        // Generate random names
        const randomWorkflowName = generateRandomWorkflowName();
        set({
            latestHashes: latestHashes ? latestHashes : get().latestHashes,
            workflowName: randomWorkflowName,
            importOption:
                (localStorage.getItem("workflowImportOption") as
                    | "import"
                    | "default") || "import",
            importJson: "",
            workflowJson: "",
            workflowApi: "",
            selectedMachineId: "",
            machineOption: "new",
            machineName: generateRandomMachineName(randomWorkflowName),
            gpuType: "A10G",
            comfyUiHash:
                latestHashes?.comfyui_hash ||
                "158419f3a0017c2ce123484b14b6c527716d6ec8",
            selectedComfyOption: "recommended",
            dependencies: undefined,
            selectedConflictingNodes: {},
            docker_command_steps: {
                steps: [
                    {
                        id: crypto.randomUUID().slice(0, 10),
                        type: "custom-node",
                        data: {
                            name: "ComfyUI Deploy",
                            url: "https://github.com/BennyKok/comfyui-deploy",
                            files: [],
                            install_type: "git-clone",
                            pip: [],
                            hash: latestHashes?.comfydeploy_hash,
                        },
                    },
                ],
            },
            importedFileName: "",
            hasEnvironment: false,
            existingMachine: undefined,
            selectedTemplateId: undefined,
        });
    },
}));

export default function WorkflowImport() {
    const navigate = useNavigate();
    const { data: latestHashes, isLoading: hashesLoading } = useLatestHashes();
    const sub = useCurrentPlan();
    const isFreePlan = !sub?.plans?.plans?.length || sub?.plans?.plans?.includes("free");

    const { shared_slug: sharedSlug } = Route.useSearch();

    const validation = useImportWorkflowStore();

    // Initialize once with latest hashes to seed defaults
    const didInitRef = useRef(false);
    useEffect(() => {
        if (didInitRef.current) return;
        if (latestHashes?.comfyui_hash && !hashesLoading) {
            validation.reset(latestHashes);
            didInitRef.current = true;
        }
    }, [latestHashes?.comfyui_hash, latestHashes?.comfydeploy_hash, hashesLoading]);

    const { data: sharedWorkflow, isLoading: isSharedWorkflowLoading } = useQuery({
        queryKey: ["shared-workflow", sharedSlug],
        enabled: !!sharedSlug && !validation.importJson,
        queryFn: () => {
            return api({
                url: `shared-workflows/${sharedSlug}`,
            });
        },
    });

    // Handle shared workflow import
    useEffect(() => {
        if (!sharedWorkflow) return;
        if (sharedWorkflow?.workflow_export) {
            const workflowJson = JSON.stringify(
                sharedWorkflow.workflow_export,
                null,
                2,
            );

            // Extract environment data from shared workflow if it exists
            const environment = sharedWorkflow.workflow_export.environment;
            const environmentFields: Partial<StepValidation> = {};

            if (environment) {
                // Map environment fields to validation state
                if (environment.comfyui_version) {
                    environmentFields.comfyUiHash = environment.comfyui_version;
                    environmentFields.selectedComfyOption = "custom";
                }
                if (environment.gpu) {
                    environmentFields.gpuType = environment.gpu;
                }
                if (environment.python_version) {
                    environmentFields.python_version = environment.python_version;
                }
                if (environment.base_docker_image) {
                    environmentFields.base_docker_image =
                        environment.base_docker_image;
                }
                if (environment.install_custom_node_with_gpu !== undefined) {
                    environmentFields.install_custom_node_with_gpu =
                        environment.install_custom_node_with_gpu;
                }
                if (environment.docker_command_steps) {
                    environmentFields.docker_command_steps =
                        environment.docker_command_steps;
                }

                environmentFields.hasEnvironment = true;
            }

            validation.setValidation({
                workflowName: sharedWorkflow.title || validation.workflowName,
                importOption: "import",
                importJson: workflowJson,
                ...environmentFields,
            });

            if (environment) {
                const configItems = [];
                if (environment.comfyui_version)
                    configItems.push("ComfyUI version");
                if (environment.gpu) configItems.push("GPU type");
                if (environment.python_version)
                    configItems.push("Python version");
                if (environment.docker_command_steps)
                    configItems.push("custom nodes");

                const environmentMessage =
                    configItems.length > 0
                        ? ` with pre-configured ${configItems.join(", ")}`
                        : " with environment configuration";
                toast.success(
                    `Imported workflow: ${sharedWorkflow.title}${environmentMessage}`,
                );
            } else {
                toast.success(`Imported workflow: ${sharedWorkflow.title}`);
            }
        }
    }, [sharedWorkflow]);

    if (isSharedWorkflowLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-muted-foreground text-sm">
                        Loading shared workflow...
                    </p>
                </div>
            </div>
        );
    }

    // Show loading while hashes are being fetched
    if (hashesLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <p className="text-muted-foreground text-sm">
                        Loading latest versions...
                    </p>
                </div>
            </div>
        );
    }

    const handleFinish = async () => {
        try {
            let machineId = validation.selectedMachineId;
            const workflowJson =
                validation.workflowJson?.trim() ||
                validation.importJson?.trim() ||
                "";

            if (!workflowJson) {
                toast.error("Workflow JSON is missing");
                return;
            }

            // Create new machine if needed
            if (validation.machineOption === "new") {
                let finalDockerSteps = ensureComfyUIDeployInSteps(
                    validation.docker_command_steps,
                    latestHashes,
                );

                // For free plan, filter to only ComfyUI Deploy nodes
                // if (isFreePlan && finalDockerSteps?.steps) {
                //     const filteredSteps = finalDockerSteps.steps.filter((step: any) => {
                //         if (step.type !== "custom-node") return false;
                //         const url = step.data?.url?.toLowerCase() || "";
                //         return url.includes("github.com/bennykok/comfyui-deploy");
                //     });

                //     finalDockerSteps = {
                //         ...finalDockerSteps,
                //         steps: filteredSteps
                //     };
                // }

                const machineData: any = {
                    name: validation.machineName,
                    gpu: validation.gpuType,
                    comfyui_version: validation.comfyUiHash,
                    docker_command_steps: finalDockerSteps,
                    python_version: validation.python_version,
                    install_custom_node_with_gpu: validation.install_custom_node_with_gpu,
                    base_docker_image: validation.base_docker_image,
                };

                const machine = await api({
                    url: "machine/serverless",
                    init: {
                        method: "POST",
                        body: JSON.stringify(machineData),
                    },
                });

                machineId = machine.id;
                toast.success(
                    `Machine "${validation.machineName}" created successfully!`,
                );
            }

            // Create workflow
            const workflowData = {
                name: validation.workflowName,
                workflow_json: workflowJson,
                ...(validation.workflowApi && { workflow_api: validation.workflowApi }),
                ...(machineId && { machine_id: machineId }),
            };

            const workflowResult = await api({
                url: "workflow",
                init: {
                    method: "POST",
                    body: JSON.stringify(workflowData),
                },
            });

            toast.success(
                `Workflow "${validation.workflowName}" created successfully!`,
            );

            if (workflowResult.deployment_error) {
                toast.warning(
                    "Workflow was created, but the preview deployment could not be created automatically.",
                );
            }

            // Navigate to workflow page
            navigate({
                to: "/workflows/$workflowId/$view",
                params: {
                    workflowId: workflowResult.workflow_id,
                    view: "workspace",
                },
            });
        } catch (error) {
            console.error("Error creating workflow:", error);
            toast.error(
                isApiError(error)
                    ? error.message
                    : error instanceof Error
                      ? error.message
                      : "Failed to create workflow",
            );
        }
    };

    return (
        <div className="relative flex w-full flex-col overflow-hidden">
            <div className="flex w-full flex-1 justify-center overflow-auto">
                <div className="mx-4 w-full max-w-5xl py-10">
                    <div className="space-y-12">
                        <Import />
                        <WorkflowImportSelectedMachine />
                        <WorkflowModelCheck />
                    </div>

                    {/* Only show Finish button if we have a workflow */}
                    {((validation.importOption === "import" && validation.importJson) ||
                        (validation.importOption === "default" &&
                            validation.workflowJson)) && (
                            <div className="sticky bottom-8 mt-16 flex justify-end pr-8">
                                <Button
                                    size="lg"
                                    onClick={handleFinish}
                                    Icon={Check}
                                    iconPlacement="right"
                                    className="flex items-center gap-2 px-8 py-3 drop-shadow-lg"
                                    disabled={
                                        !validation.workflowName ||
                                        (validation.machineOption === "existing" &&
                                            !validation.selectedMachineId)
                                    }
                                >
                                    Finish
                                </Button>
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
}

// Update component props
function Import() {
    const validation = useImportWorkflowStore();
    const setValidation = validation.setValidation;

    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

    const navigate = useNavigate();

    // Get the currently selected template for display (prefer ID to avoid string-equality issues)
    const selectedTemplate =
        validation.importOption === "default" && validation.selectedTemplateId
            ? defaultWorkflowTemplates.find(
                (t) => t.workflowId === validation.selectedTemplateId,
            )
            : undefined;

    return (
        <div className="flex flex-col gap-8">
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Workflow Name</span>
                        <span className="text-red-500 text-sm">*</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTemplateDialogOpen(true)}
                        className="flex items-center gap-2 bg-white hover:bg-gray-50 border-gray-300 shadow-sm dark:bg-gray-900 dark:hover:bg-gray-800 dark:border-gray-600/50"
                    >
                        <Plus className="h-4 w-4" />
                        Template
                    </Button>
                </div>
                <Input
                    placeholder="Enter a descriptive name for your workflow..."
                    value={validation.workflowName}
                    onChange={(e) =>
                        setValidation({ ...validation, workflowName: e.target.value })
                    }
                    className="h-11 border-gray-300 focus:border-primary transition-colors"
                />
            </div>

            <div className="space-y-6">
                {/* Show selected template, imported workflow, or import options */}
                {selectedTemplate ? (
                    <TemplateSelectedView
                        template={selectedTemplate}
                        onClear={() => validation.reset(validation.latestHashes)}
                    />
                ) : validation.importOption === "import" &&
                    validation.importJson &&
                    validation.importJson.trim() !== "" ? (
                    <ImportedWorkflowView
                        validation={validation}
                        onClear={() => {
                            navigate({
                                to: "/workflows",
                                search: {
                                    view: "import",
                                    shared_slug: undefined,
                                    shared_workflow_id: undefined,
                                },
                            });
                            validation.reset(validation.latestHashes)
                        }}
                    />
                ) : (
                    <ImportView />
                )}

                {/* Template selection dialog */}
                <TemplateSelectionDialog
                    open={templateDialogOpen}
                    onOpenChange={setTemplateDialogOpen}
                />
            </div>
        </div>
    );
}

// New components for the refactored UI
function TemplateSelectedView({
    template,
    onClear,
}: {
    template: any;
    onClear: () => void;
}) {
    return (
        <div className="relative rounded-lg border bg-blue-50/30 p-3 shadow-sm dark:bg-blue-900/30">
            <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md">
                    <FileURLRender
                        url={template.workflowImageUrl}
                        imgClasses="h-full w-full object-cover"
                    />
                </div>
                <div className="flex flex-1 items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm text-gray-800 dark:text-gray-200">
                                {template.workflowName}
                            </h3>
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground text-xs">
                            <span className="line-clamp-1">
                                {template.workflowDescription}
                            </span>
                            {template.hasEnvironment && (
                                <>
                                    <span className="text-gray-400">•</span>
                                    <span className="flex items-center gap-1 text-yellow-600 whitespace-nowrap dark:text-yellow-500">
                                        <Lightbulb className="h-3 w-3" />
                                        With Preset
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        className="h-8 text-muted-foreground hover:text-foreground transition-colors dark:hover:text-foreground"
                    >
                        Clear
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ImportedWorkflowView({
    validation,
    onClear,
}: {
    validation: StepValidation;
    onClear: () => void;
}) {
    // Get workflow info from the imported JSON
    const getWorkflowInfo = () => {
        try {
            const workflow = JSON.parse(validation.importJson || "{}");
            // Correct way to count nodes in ComfyUI workflows
            const nodeCount = workflow.nodes ? workflow.nodes.length : 0;

            // Use imported file name if available, otherwise try to get title from various places
            let title = validation.importedFileName || "Imported Workflow";
            if (!validation.importedFileName) {
                if (workflow.title) {
                    title = workflow.title;
                } else if (workflow.workflow?.title) {
                    title = workflow.workflow.title;
                } else if (workflow.extra?.title) {
                    title = workflow.extra.title;
                }
            }

            return {
                title,
                nodeCount,
                hasEnvironment: validation.hasEnvironment || false,
                size: Math.round((validation.importJson?.length || 0) / 1024),
            };
        } catch (error) {
            return {
                title: validation.importedFileName || "Imported Workflow",
                nodeCount: 0,
                hasEnvironment: validation.hasEnvironment || false,
                size: Math.round((validation.importJson?.length || 0) / 1024),
            };
        }
    };

    const workflowInfo = getWorkflowInfo();

    return (
        <div className="relative rounded-lg border bg-green-50/30 p-3 shadow-sm dark:bg-green-900/30">
            <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-green-100">
                    <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex flex-1 items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm text-gray-800 dark:text-gray-200">
                                {workflowInfo.title}
                            </h3>
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground text-xs">
                            <span>{workflowInfo.nodeCount} nodes</span>
                            <span className="text-gray-400">•</span>
                            <span>{workflowInfo.size}KB</span>
                            {workflowInfo.hasEnvironment && (
                                <>
                                    <span className="text-gray-400">•</span>
                                    <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500">
                                        <Lightbulb className="h-3 w-3" />
                                        With Preset
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        className="h-8 text-muted-foreground hover:text-foreground transition-colors dark:hover:text-foreground"
                    >
                        Clear
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ImportView() {
    const validation = useImportWorkflowStore();
    const setValidation = validation.setValidation;

    const { data: latestHashes, isLoading: hashesLoading } = useLatestHashes();
    const sub = useCurrentPlan();
    const isFreePlan = !sub?.plans?.plans?.length || sub?.plans?.plans?.includes("free");
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [workflowJsonUrl] = useQueryState("workflow_json");

    // Add useEffect to handle URL query parameter
    useEffect(() => {
        if (workflowJsonUrl) {
            // Fetch the JSON from the URL
            fetch(workflowJsonUrl)
                .then((response) => response.text())
                .then((text) => {
                    try {
                        postProcessImport(text, "Workflow from URL");
                    } catch (error) {
                        toast.error("Failed to load workflow from URL");
                    }
                })
                .catch((error) => {
                    toast.error("Failed to fetch workflow from URL");
                });
        }
    }, [workflowJsonUrl]);

    const postProcessImport = useCallback(
        (text: string, fileName?: string) => {
            if (!text.trim()) {
                const clearedData = {
                    importOption: "import" as const,
                    importJson: "",
                    workflowJson: "",
                    workflowApi: "",
                    importedFileName: "",

                    // Reset dependencies and custom node selections when clearing
                    dependencies: undefined,
                    selectedConflictingNodes: {},
                    selectedCustomNodesToApply: undefined,

                    // Remove docker_command_steps when clearing
                    docker_command_steps: undefined,
                    hasEnvironment: false,
                    gpuType: "A10G",
                    comfyUiHash:
                        latestHashes?.comfyui_hash ||
                        "158419f3a0017c2ce123484b14b6c527716d6ec8",
                    install_custom_node_with_gpu: false,
                    base_docker_image: undefined,
                    python_version: "3.11",
                } as Partial<StepValidation>;

                setValidation({
                    ...clearedData,
                });
                return;
            }

            setValidation({
                ...(buildImportedWorkflowPatch(
                    text,
                    fileName,
                    latestHashes,
                ) as Partial<StepValidation>),
            });
        },
        [validation, setValidation, latestHashes],
    );

    const handleFileSelect = async (file: File) => {
        if (file && file.type === "application/json") {
            // Handle JSON files
            const text = await file.text();
            try {
                postProcessImport(text, file.name);
                toast.success("Workflow JSON imported successfully");
            } catch (error) {
                toast.error(
                    error instanceof Error ? error.message : "Invalid JSON file",
                );
            }
        } else if (file && isPNGFile(file)) {
            // Handle PNG files with metadata
            try {
                const workflowJson = await extractWorkflowFromPNG(file);
                postProcessImport(workflowJson, file.name);
                toast.success("Workflow extracted from image successfully");
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Failed to extract workflow from image",
                );
            }
        } else {
            toast.error(
                "Please select a JSON file or PNG image with ComfyUI metadata",
            );
        }
    };

    // Add global paste event listener
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            // Only handle if no input/textarea is focused (except our hidden one)
            const activeElement = document.activeElement;
            if (
                activeElement &&
                (activeElement.tagName === "INPUT" ||
                    activeElement.tagName === "TEXTAREA") &&
                !activeElement.classList.contains("sr-only")
            ) {
                return;
            }

            e.preventDefault();
            const text = e.clipboardData?.getData("text");
            if (text) {
                try {
                    postProcessImport(text, "Pasted Workflow");
                    toast.success("Workflow JSON pasted successfully");
                } catch (error) {
                    toast.error(
                        error instanceof Error ? error.message : "Invalid JSON format",
                    );
                }
            }
        };

        document.addEventListener("paste", handlePaste);
        return () => {
            document.removeEventListener("paste", handlePaste);
        };
    }, [postProcessImport]);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        await handleFileSelect(file);
    };

    return (
        <div className="space-y-6">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="application/json,image/png"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                }}
            />

            {/* File Upload Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                        <Upload className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="font-semibold text-sm">Upload File</span>
                </div>
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label="Upload file"
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                    }}
                    onDrop={handleDrop}
                    className={cn(
                        "cursor-pointer rounded-lg border-2 border-dashed dark:border-gray-500 p-8 transition-all duration-200 hover:shadow-md dark:hover:shadow-gray-600/50",
                        isDragging
                            ? "border-blue-500 bg-gradient-to-r from-green-100 to-blue-100 shadow-lg dark:bg-green-900 dark:from-green-900 dark:to-blue-900"
                            : "border-gray-300 bg-gradient-to-r from-green-50 to-blue-50 hover:border-green-400 dark:bg-green-900 dark:from-green-900 dark:to-blue-900",
                    )}
                >
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div
                            className={cn(
                                "flex items-center justify-center w-14 h-14 rounded-full transition-all duration-200",
                                isDragging
                                    ? "bg-blue-200 text-blue-700 scale-110 dark:bg-blue-900 dark:text-blue-200"
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400",
                            )}
                        >
                            {isDragging ? (
                                <Upload className="h-6 w-6" />
                            ) : (
                                <MousePointer className="h-6 w-6" />
                            )}
                        </div>
                        <div className="space-y-2">
                            <p className="font-semibold text-base">
                                {isDragging
                                    ? "Drop your file here"
                                    : "Click to browse or drag & drop"}
                            </p>
                            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                    <FileText className="h-4 w-4" />
                                    <span>JSON files</span>
                                </div>
                                <span className="text-gray-400">•</span>
                                <div className="flex items-center gap-1.5">
                                    <ImageIcon className="h-4 w-4" />
                                    <span>ComfyUI PNG images</span>
                                </div>
                            </div>
                            {/* Paste shortcut notice */}
                            <div className="mt-3 flex items-center justify-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full">
                                <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-background border rounded shadow-sm">
                                    {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+V
                                </kbd>
                                <span className="text-xs text-muted-foreground">
                                    to paste workflow JSON
                                </span>
                                {validation.importJson && (
                                    <CheckCircle2 className="h-3 w-3 text-green-600 ml-1" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {validation.hasEnvironment && (
                    <div className="flex justify-center">
                        <Badge
                            variant="secondary"
                            className="bg-green-100 border-green-200 text-green-700 hover:bg-green-100"
                        >
                            <CheckCircle2 className="mr-1.5 h-3 w-3" />
                            Environment Detected
                        </Badge>
                    </div>
                )}
            </div>
        </div>
    );
}

function TemplateSelectionDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    // Include loading state to prevent undefined reference during selection
    const { data: latestHashes, isLoading: hashesLoading } = useLatestHashes();

    // Use Zustand store for reactive updates to ensure sync
    const validation = useImportWorkflowStore();
    const setValidation = validation.setValidation;

    // Initialize workflowSelected from validation if it exists, otherwise use default
    const [workflowSelected, setWorkflowSelected] = useState<string>(
        validation.selectedTemplateId ||
            (validation.workflowJson
                ? defaultWorkflowTemplates.find(
                    (t) => t.workflowJson === validation.workflowJson,
                )?.workflowId || "sd1.5"
                : "sd1.5"),
    );

    // Handle template selection and close dialog
    const handleTemplateSelect = (templateId: string) => {
        setWorkflowSelected(templateId);
        // Avoid applying before hashes load to keep consistency
        if (hashesLoading) {
            toast.info("Loading latest versions… please try again in a moment");
            return;
        }

        const selectedTemplate = defaultWorkflowTemplates.find(
            (template) => template.workflowId === templateId,
        );

        if (selectedTemplate) {
            const updatedValidation: Partial<StepValidation> = {
                ...validation,
                importOption: "default" as const,
                workflowJson: selectedTemplate.workflowJson,
                workflowApi: selectedTemplate.workflowApi,
                importJson: "",
                hasEnvironment: selectedTemplate.hasEnvironment || false,
                selectedTemplateId: templateId,

                // Reset dependencies to trigger re-analysis when template changes
                dependencies: undefined,
                selectedConflictingNodes: {},
                selectedCustomNodesToApply: undefined,

                // Clear machine settings when changing templates
                machineOption: "new" as const,
                selectedMachineId: "",
                existingMachine: undefined,
                machineConfig: undefined,
                existingMachineMissingNodes: [],
            };

            // If the template has environment data, include those properties
            if (selectedTemplate.hasEnvironment) {
                try {
                    const workflowData = JSON.parse(selectedTemplate.workflowJson);
                    const environment = workflowData.environment;

                    if (environment) {
                        // Update docker_command_steps to use latest ComfyUI Deploy hash and add if missing
                        let updatedDockerSteps = environment.docker_command_steps;

                        if (environment.docker_command_steps) {
                            // Check if ComfyUI Deploy already exists
                            const hasComfyDeploy =
                                environment.docker_command_steps.steps?.some(
                                    (step: DockerCommandStep) =>
                                        step.type === "custom-node" &&
                                        (step.data as CustomNodeData)?.url ===
                                        "https://github.com/BennyKok/comfyui-deploy",
                                );

                            updatedDockerSteps = {
                                ...environment.docker_command_steps,
                                steps: [
                                    // Update existing steps and ComfyUI Deploy hash if present
                                    ...(environment.docker_command_steps.steps?.map(
                                        (step: DockerCommandStep) => {
                                            if (
                                                step.type === "custom-node" &&
                                                (step.data as CustomNodeData)?.url ===
                                                "https://github.com/BennyKok/comfyui-deploy"
                                            ) {
                                                return {
                                                    ...step,
                                                    data: {
                                                        ...(step.data as CustomNodeData),
                                                        hash:
                                                            latestHashes?.comfydeploy_hash ||
                                                            (step.data as CustomNodeData).hash,
                                                    },
                                                };
                                            }
                                            return step;
                                        },
                                    ) || []),
                                    // Add ComfyUI Deploy if it doesn't exist
                                    ...(hasComfyDeploy
                                        ? []
                                        : [
                                            {
                                                id: crypto.randomUUID().slice(0, 10),
                                                type: "custom-node" as const,
                                                data: {
                                                    name: "ComfyUI Deploy",
                                                    url: "https://github.com/BennyKok/comfyui-deploy",
                                                    files: [],
                                                    install_type: "git-clone" as const,
                                                    pip: [],
                                                    hash: latestHashes?.comfydeploy_hash,
                                                } as CustomNodeData,
                                            },
                                        ]),
                                ],
                            };
                        }

                        const comfyVersion = environment.required_comfy_version
                            ? environment.comfyui_version
                            : latestHashes?.comfyui_hash || environment.comfyui_version;

                        Object.assign(updatedValidation, {
                            docker_command_steps: updatedDockerSteps,
                            gpuType: environment.gpu,
                            // Use latest ComfyUI hash unless the template requires a specific version
                            comfyUiHash: comfyVersion,
                            install_custom_node_with_gpu:
                                environment.install_custom_node_with_gpu,
                            base_docker_image: environment.base_docker_image,
                            python_version: environment.python_version,
                        });
                    }
                } catch (error) {
                    console.error("Error parsing workflow JSON:", error);
                }
            }

            setValidation(updatedValidation);
        }

        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[85vh]">
                <DialogHeader className="pb-4 border-b">
                    <DialogTitle className="text-xl font-semibold">
                        Select a Workflow Template
                    </DialogTitle>
                    <p className="text-muted-foreground text-sm mt-2">
                        Choose a pre-built workflow to get started quickly
                    </p>
                </DialogHeader>
                <div className="mt-6 grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 pr-2">
                    {defaultWorkflowTemplates.map((template) => (
                        <button
                            key={template.workflowId}
                            type="button"
                            className={cn(
                                "group relative h-[280px] w-full overflow-hidden rounded-lg border text-left transition-all duration-500 ease-in-out sm:h-[320px] lg:h-[350px]",
                                workflowSelected === template.workflowId
                                    ? "opacity-100 shadow-lg"
                                    : "opacity-70 grayscale hover:grayscale-0",
                            )}
                            onClick={() => handleTemplateSelect(template.workflowId)}
                            aria-pressed={workflowSelected === template.workflowId}
                        >
                            <FileURLRender
                                url={template.workflowImageUrl}
                                imgClasses="h-full max-w-full w-full object-cover absolute inset-0 group-hover:scale-105 transition-all duration-500 pointer-events-none"
                            />
                            {/* Selected state overlay */}
                            {workflowSelected === template.workflowId && (
                                <div className="absolute inset-0 border-2 border-primary rounded-lg" />
                            )}
                            <div
                                className={cn(
                                    "absolute flex flex-col gap-2 bg-gradient-to-t from-background/95 via-background/80 to-transparent p-4",
                                    workflowSelected === template.workflowId
                                        ? "right-2 bottom-2 left-2 rounded-b-md"
                                        : "right-0 bottom-0 left-0",
                                )}
                            >
                                <div className="flex flex-row items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {workflowSelected === template.workflowId ? (
                                            <CircleCheckBig className="h-4 w-4" />
                                        ) : (
                                            <Circle className="h-4 w-4" />
                                        )}
                                        <h3 className="line-clamp-1 font-medium text-shadow">
                                            {template.workflowName}
                                        </h3>
                                    </div>
                                    {template.hasEnvironment && (
                                        <Badge variant="yellow" className="whitespace-nowrap">
                                            <Lightbulb className="h-3 w-3" />
                                            With Preset
                                        </Badge>
                                    )}
                                </div>

                                <p className="line-clamp-1 text-muted-foreground text-sm backdrop-blur-[2px]">
                                    {template.workflowDescription}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// =============== Utils ===============
// Keep this export for other components that depend on it (like workflow-machine-import)
export type AccordionOptionProps = {
    value: string;
    selected: string | undefined;
    label: string | React.ReactNode;
    content: React.ReactNode;
    disabled?: boolean;
};

export function AccordionOption({
    value,
    selected,
    label,
    content,
    disabled = false,
}: AccordionOptionProps) {
    return (
        <AccordionItem
            value={value}
            disabled={disabled}
            className={cn(
                "rounded-sm border border-gray-200 px-4 py-1",
                selected !== value && "opacity-50",
                selected === value && "ring-2 ring-gray-500 ring-offset-2",
                disabled && "cursor-not-allowed opacity-50 hover:opacity-50",
            )}
        >
            <AccordionTrigger className={disabled ? "cursor-not-allowed" : ""}>
                <div className={"flex flex-row items-center"}>
                    {selected === value ? (
                        <CircleCheckBig className="mr-4 h-3 w-3" />
                    ) : (
                        <Circle className="mr-4 h-3 w-3" />
                    )}
                    {label}
                </div>
            </AccordionTrigger>
            <AccordionContent>{content}</AccordionContent>
        </AccordionItem>
    );
}
