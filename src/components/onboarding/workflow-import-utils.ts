const DEFAULT_COMFYUI_HASH = "158419f3a0017c2ce123484b14b6c527716d6ec8";

export type LatestWorkflowHashes = {
    comfyui_hash?: string;
    comfydeploy_hash?: string;
};

export type ImportedWorkflowPatch = {
    importOption: "import";
    importJson: string;
    workflowJson: string;
    workflowApi?: string;
    importedFileName: string;
    dependencies: undefined;
    selectedConflictingNodes: Record<string, never>;
    selectedCustomNodesToApply: undefined;
    docker_command_steps?: unknown;
    gpuType: string;
    comfyUiHash: string;
    install_custom_node_with_gpu: boolean;
    base_docker_image?: string;
    python_version?: string;
    hasEnvironment: boolean;
};

export function buildImportedWorkflowPatch(
    text: string,
    fileName?: string,
    latestHashes?: LatestWorkflowHashes,
): ImportedWorkflowPatch {
    const json = JSON.parse(text);

    if (!json.environment && (!json.nodes || !json.links)) {
        throw new Error(
            "Invalid workflow format: missing 'nodes' or 'links' keys",
        );
    }

    const basePatch = {
        importOption: "import" as const,
        importJson: text,
        workflowJson: text,
        importedFileName: fileName || "",
        dependencies: undefined,
        selectedConflictingNodes: {},
        selectedCustomNodesToApply: undefined,
    };

    if (!json.environment) {
        return {
            ...basePatch,
            workflowApi: undefined,
            docker_command_steps: undefined,
            gpuType: "A10G",
            comfyUiHash: latestHashes?.comfyui_hash || DEFAULT_COMFYUI_HASH,
            install_custom_node_with_gpu: false,
            base_docker_image: undefined,
            python_version: "3.11",
            hasEnvironment: false,
        };
    }

    const environment = json.environment;

    return {
        ...basePatch,
        workflowApi:
            json.workflow_api === undefined
                ? undefined
                : JSON.stringify(json.workflow_api),
        docker_command_steps: environment.docker_command_steps,
        gpuType: environment.gpu || "A10G",
        comfyUiHash:
            environment.comfyui_version ||
            latestHashes?.comfyui_hash ||
            DEFAULT_COMFYUI_HASH,
        install_custom_node_with_gpu:
            environment.install_custom_node_with_gpu ?? false,
        base_docker_image: environment.base_docker_image,
        python_version: environment.python_version || "3.11",
        hasEnvironment: true,
    };
}
