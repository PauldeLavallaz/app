import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { parseWorkflowImport } from "./workflow-import-data.ts";

describe("parseWorkflowImport", () => {
  // Regression: ISSUE-001 — ComfyDeploy exports lost the workflow body on submit.
  // Found by /qa on 2026-09-02.
  // Report: ../.gstack/qa-reports/qa-report-app-comfydeploy-com-2026-09-02.md
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
