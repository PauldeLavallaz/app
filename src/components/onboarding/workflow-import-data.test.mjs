import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseWorkflowImport } from "./workflow-import-data.ts";

describe("parseWorkflowImport", () => {
  test("keeps a ComfyDeploy export as the workflow body sent to the API", () => {
    const text = JSON.stringify({
      nodes: [],
      links: [],
      workflow_api: { prompt: {} },
      environment: {
        gpu: "A10G",
        comfyui_version: "test-hash",
      },
    });

    assert.deepEqual(parseWorkflowImport(text), {
      environment: {
        gpu: "A10G",
        comfyui_version: "test-hash",
      },
      importJson: text,
      workflowApi: JSON.stringify({ prompt: {} }),
      workflowJson: text,
    });
  });

  test("keeps a plain ComfyUI workflow as the workflow body", () => {
    const text = JSON.stringify({ nodes: [], links: [] });

    assert.deepEqual(parseWorkflowImport(text), {
      environment: undefined,
      importJson: text,
      workflowApi: undefined,
      workflowJson: text,
    });
  });

  test("rejects JSON that is neither a workflow nor a ComfyDeploy export", () => {
    assert.throws(
      () => parseWorkflowImport('{"name":"not-a-workflow"}'),
      /Invalid workflow format: missing 'nodes' or 'links' keys/,
    );
  });
});
