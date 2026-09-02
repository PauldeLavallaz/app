import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  buildWorkflowCreateData,
  parseWorkflowImport,
  SubmissionLock,
} from "./workflow-import-data.ts";

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

    const importedWorkflow = parseWorkflowImport(text);

    assert.deepEqual(importedWorkflow, {
      environment: {
        gpu: "A10G",
        comfyui_version: "test-hash",
      },
      importJson: text,
      workflowApi: JSON.stringify({ prompt: {} }),
      workflowJson: text,
    });

    const requestBody = buildWorkflowCreateData({
      name: "Imported workflow",
      workflowJson: importedWorkflow.workflowJson,
      workflowApi: importedWorkflow.workflowApi,
      machineId: "machine-1",
    });

    assert.deepEqual(requestBody, {
      name: "Imported workflow",
      workflow_json: text,
      workflow_api: JSON.stringify({ prompt: {} }),
      machine_id: "machine-1",
    });
    assert.deepEqual(JSON.parse(requestBody.workflow_json), JSON.parse(text));
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
      /Invalid workflow format: 'nodes' and 'links' must be arrays/,
    );
  });

  test("rejects an environment without a workflow graph", () => {
    assert.throws(
      () => parseWorkflowImport('{"environment":{"gpu":"A10G"}}'),
      /Invalid workflow format: 'nodes' and 'links' must be arrays/,
    );
  });

  test("rejects a non-object workflow API", () => {
    assert.throws(
      () =>
        parseWorkflowImport(
          '{"nodes":[],"links":[],"workflow_api":"not-an-object"}',
        ),
      /Invalid workflow format: 'workflow_api' must be an object/,
    );
  });

  test("rejects an empty workflow body before calling the API", () => {
    assert.throws(
      () =>
        buildWorkflowCreateData({
          name: "Broken import",
          workflowJson: "",
        }),
      /Workflow JSON is required/,
    );
  });
});

describe("SubmissionLock", () => {
  test("runs one concurrent submit and unlocks for a retry", async () => {
    const lock = new SubmissionLock();
    let finishFirstSubmit;
    let submissions = 0;

    const firstSubmit = lock.run(
      () =>
        new Promise((resolve) => {
          submissions += 1;
          finishFirstSubmit = resolve;
        }),
    );
    const duplicateSubmit = lock.run(async () => {
      submissions += 1;
    });

    assert.equal(await duplicateSubmit, undefined);
    assert.equal(submissions, 1);

    finishFirstSubmit();
    await firstSubmit;

    await lock.run(async () => {
      submissions += 1;
    });
    assert.equal(submissions, 2);
  });

  test("unlocks after an error so the user can retry", async () => {
    const lock = new SubmissionLock();

    await assert.rejects(
      lock.run(async () => {
        throw new Error("temporary API failure");
      }),
      /temporary API failure/,
    );

    assert.equal(await lock.run(async () => "retried"), "retried");
  });
});
