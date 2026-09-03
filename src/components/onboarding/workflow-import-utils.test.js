import { describe, expect, test } from "bun:test";

import { buildImportedWorkflowPatch } from "./workflow-import-utils";

describe("buildImportedWorkflowPatch", () => {
    test("keeps workflow_json populated for ComfyDeploy exports with environment", () => {
        const workflowApi = {
            "1": {
                class_type: "SaveImage",
                inputs: { filename_prefix: "ComfyUI" },
            },
        };
        const workflowExport = {
            nodes: [{ id: 1, type: "SaveImage" }],
            links: [],
            workflow_api: workflowApi,
            environment: {
                gpu: "A10G",
                comfyui_version: "a".repeat(40),
                docker_command_steps: { steps: [] },
                install_custom_node_with_gpu: true,
                base_docker_image: "nvidia/cuda:12.6.3-cudnn-devel-ubuntu22.04",
                python_version: "3.12",
            },
        };
        const text = JSON.stringify(workflowExport);

        const patch = buildImportedWorkflowPatch(text, "export.json");

        expect(patch.workflowJson).toBe(text);
        expect(JSON.parse(patch.workflowJson).nodes).toHaveLength(1);
        expect(patch.workflowApi).toBe(JSON.stringify(workflowApi));
        expect(patch.hasEnvironment).toBe(true);
        expect(patch.gpuType).toBe("A10G");
    });

    test("keeps plain ComfyUI workflows intact", () => {
        const workflow = { nodes: [{ id: 1 }], links: [] };
        const text = JSON.stringify(workflow);

        const patch = buildImportedWorkflowPatch(text, "workflow.json", {
            comfyui_hash: "b".repeat(40),
        });

        expect(patch.workflowJson).toBe(text);
        expect(patch.workflowApi).toBeUndefined();
        expect(patch.hasEnvironment).toBe(false);
        expect(patch.comfyUiHash).toBe("b".repeat(40));
    });

    test("rejects invalid ComfyUI workflow JSON without environment metadata", () => {
        expect(() =>
            buildImportedWorkflowPatch(JSON.stringify({ nodes: [] })),
        ).toThrow("Invalid workflow format");
    });
});
