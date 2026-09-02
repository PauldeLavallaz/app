import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  AmbiguousWorkflowCreationError,
  buildWorkflowCreateData,
  parseWorkflowImport,
  SubmissionLock,
  WorkflowCreationSession,
  WorkflowNavigationError,
} from "./workflow-import-data.ts";

function createMemoryCheckpointStore() {
  let value;
  return {
    clear: () => {
      value = undefined;
    },
    load: () => value,
    save: (checkpoint) => {
      value = structuredClone(checkpoint);
    },
  };
}

function createMachineData(stepId) {
  return {
    name: "Generated machine",
    gpu: "A10G",
    docker_command_steps: {
      steps: [
        {
          id: stepId,
          type: "custom-node",
          data: { url: "https://github.com/BennyKok/comfyui-deploy" },
        },
      ],
    },
  };
}

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

  test("accepts an official export without a workflow API or machine", () => {
    const text = JSON.stringify({
      nodes: [],
      links: [],
      workflow_api: null,
      environment: {},
    });

    assert.deepEqual(parseWorkflowImport(text), {
      environment: undefined,
      importJson: text,
      workflowApi: undefined,
      workflowJson: text,
    });
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

  test("rejects an invalid workflow API before calling the API", () => {
    assert.throws(() =>
      buildWorkflowCreateData({
        name: "Broken API workflow",
        workflowJson: JSON.stringify({ nodes: [], links: [] }),
        workflowApi: "not-json",
      }),
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

describe("WorkflowCreationSession", () => {
  test("sends one exact machine/workflow sequence for concurrent submits", async () => {
    const session = new WorkflowCreationSession();
    const requests = [];
    const navigations = [];
    let starts = 0;
    let finishes = 0;
    let releaseMachine = () => {
      throw new Error("machine request was not started");
    };
    const workflowJson = JSON.stringify({
      nodes: [],
      links: [],
      environment: { gpu: "A10G" },
    });
    const options = {
      machineData: { name: "Machine 1", gpu: "A10G" },
      workflowName: "Imported workflow",
      workflowJson,
      workflowApi: JSON.stringify({ prompt: {} }),
      request: async (request) => {
        requests.push(request);
        if (request.url === "machine/serverless") {
          return new Promise((resolve) => {
            releaseMachine = () => resolve({ id: "machine-1" });
          });
        }
        return { workflow_id: "workflow-1" };
      },
      navigate: async (workflowId) => {
        navigations.push(workflowId);
      },
      onStart: () => {
        starts += 1;
      },
      onFinish: () => {
        finishes += 1;
      },
    };

    const firstSubmit = session.submit(options);
    assert.equal(await session.submit(options), undefined);
    assert.equal(requests.length, 1);

    releaseMachine();
    assert.equal(await firstSubmit, "workflow-1");

    assert.equal(starts, 1);
    assert.equal(finishes, 1);
    assert.deepEqual(navigations, ["workflow-1"]);
    assert.deepEqual(
      requests.map(({ url, init }) => ({
        url,
        body: JSON.parse(init.body),
      })),
      [
        {
          url: "machine/serverless",
          body: { name: "Machine 1", gpu: "A10G" },
        },
        {
          url: "workflow",
          body: {
            name: "Imported workflow",
            workflow_json: workflowJson,
            workflow_api: JSON.stringify({ prompt: {} }),
            machine_id: "machine-1",
          },
        },
      ],
    );
  });

  test("reuses a confirmed machine when workflow creation is retried", async () => {
    const session = new WorkflowCreationSession();
    let machineRequests = 0;
    let workflowRequests = 0;
    const options = {
      machineData: { name: "Machine 1" },
      workflowName: "Retry workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async ({ url }) => {
        if (url === "machine/serverless") {
          machineRequests += 1;
          return { id: "machine-1" };
        }

        workflowRequests += 1;
        if (workflowRequests === 1) throw new Error("invalid workflow");
        return { workflow_id: "workflow-1" };
      },
      navigate: async () => {},
      isDefinitiveFailure: (_error, resource) => resource === "workflow",
    };

    await assert.rejects(session.submit(options), /invalid workflow/);
    assert.equal(await session.submit(options), "workflow-1");
    assert.equal(machineRequests, 1);
    assert.equal(workflowRequests, 2);
  });

  test("honors a changed machine selection on a new attempt", async () => {
    const session = new WorkflowCreationSession();
    const workflowBodies = [];
    let machineRequests = 0;
    const request = async ({ url, init }) => {
      if (url === "machine/serverless") {
        machineRequests += 1;
        return { id: "machine-1" };
      }

      const body = JSON.parse(init.body);
      workflowBodies.push(body);
      if (workflowBodies.length === 1) throw new Error("invalid workflow");
      return { workflow_id: "workflow-2" };
    };
    const firstAttempt = {
      machineData: { name: "Machine 1" },
      workflowName: "Retry workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request,
      navigate: async () => {},
      isDefinitiveFailure: (_error, resource) => resource === "workflow",
    };

    await assert.rejects(session.submit(firstAttempt), /invalid workflow/);
    assert.equal(
      await session.submit({
        ...firstAttempt,
        machineData: undefined,
        selectedMachineId: "machine-2",
      }),
      "workflow-2",
    );

    assert.equal(machineRequests, 1);
    assert.deepEqual(
      workflowBodies.map((body) => body.machine_id),
      ["machine-1", "machine-2"],
    );
  });

  test("retries only navigation after the workflow was created", async () => {
    const session = new WorkflowCreationSession();
    let workflowRequests = 0;
    let navigations = 0;
    const options = {
      selectedMachineId: "machine-1",
      workflowName: "Created workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async () => {
        workflowRequests += 1;
        return { workflow_id: `workflow-${workflowRequests}` };
      },
      navigate: async () => {
        navigations += 1;
        if (navigations === 1) throw new Error("router failed");
      },
    };

    await assert.rejects(session.submit(options), WorkflowNavigationError);
    assert.equal(await session.submit(options), "workflow-1");
    assert.equal(workflowRequests, 1);
    assert.equal(navigations, 2);
  });

  test("reuses a confirmed machine after a page refresh", async () => {
    const checkpointStore = createMemoryCheckpointStore();
    let machineRequests = 0;
    let workflowRequests = 0;
    const workflowJson = JSON.stringify({ nodes: [], links: [] });
    const firstAttempt = {
      machineData: createMachineData("random-step-a"),
      workflowName: "Workflow 1",
      workflowJson,
      request: async ({ url }) => {
        if (url === "machine/serverless") {
          machineRequests += 1;
          return { id: "machine-1" };
        }

        workflowRequests += 1;
        if (workflowRequests === 1) throw new Error("invalid workflow");
        return { workflow_id: "workflow-1" };
      },
      navigate: async () => {},
      isDefinitiveFailure: (_error, resource) => resource === "workflow",
    };

    await assert.rejects(
      new WorkflowCreationSession(checkpointStore).submit(firstAttempt),
      /invalid workflow/,
    );
    assert.equal(
      await new WorkflowCreationSession(checkpointStore).submit({
        ...firstAttempt,
        machineData: createMachineData("random-step-b"),
        workflowName: "Fresh generated workflow",
      }),
      "workflow-1",
    );

    assert.equal(machineRequests, 1);
    assert.equal(workflowRequests, 2);
  });

  test("retries only navigation after a page refresh", async () => {
    const checkpointStore = createMemoryCheckpointStore();
    let workflowRequests = 0;
    let navigations = 0;
    const workflowJson = JSON.stringify({ nodes: [], links: [] });
    const firstAttempt = {
      selectedMachineId: "machine-1",
      workflowName: "Workflow 1",
      workflowJson,
      request: async () => {
        workflowRequests += 1;
        return { workflow_id: `workflow-${workflowRequests}` };
      },
      navigate: async () => {
        navigations += 1;
        if (navigations === 1) throw new Error("router failed");
      },
    };

    await assert.rejects(
      new WorkflowCreationSession(checkpointStore).submit(firstAttempt),
      WorkflowNavigationError,
    );
    assert.equal(
      await new WorkflowCreationSession(checkpointStore).submit({
        ...firstAttempt,
        workflowName: "Fresh generated workflow",
      }),
      "workflow-1",
    );

    assert.equal(workflowRequests, 1);
    assert.equal(navigations, 2);
    assert.equal(checkpointStore.load(), undefined);

    assert.equal(
      await new WorkflowCreationSession(checkpointStore).submit(firstAttempt),
      "workflow-2",
    );
    assert.equal(workflowRequests, 2);
  });

  test("starts a new request when the workflow payload changes", async () => {
    const session = new WorkflowCreationSession();
    const workflowBodies = [];
    const navigations = [];
    const firstAttempt = {
      selectedMachineId: "machine-1",
      workflowName: "Workflow 1",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async ({ init }) => {
        const body = JSON.parse(init.body);
        workflowBodies.push(body);
        return { workflow_id: `workflow-${workflowBodies.length}` };
      },
      navigate: async (workflowId) => {
        navigations.push(workflowId);
        if (navigations.length === 1) throw new Error("router failed");
      },
    };

    await assert.rejects(session.submit(firstAttempt), WorkflowNavigationError);
    const changedWorkflowJson = JSON.stringify({
      nodes: [{ id: 1 }],
      links: [],
    });
    assert.equal(
      await session.submit({
        ...firstAttempt,
        workflowName: "Workflow 2",
        workflowJson: changedWorkflowJson,
      }),
      "workflow-2",
    );

    assert.equal(workflowBodies.length, 2);
    assert.deepEqual(workflowBodies[1], {
      name: "Workflow 2",
      workflow_json: changedWorkflowJson,
      machine_id: "machine-1",
    });
    assert.deepEqual(navigations, ["workflow-1", "workflow-2"]);
  });

  test("blocks an unsafe retry after an ambiguous machine response", async () => {
    const session = new WorkflowCreationSession();
    let machineRequests = 0;
    const options = {
      machineData: { name: "Machine 1" },
      workflowName: "Ambiguous workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async () => {
        machineRequests += 1;
        throw new Error("network disconnected");
      },
      navigate: async () => {},
    };

    await assert.rejects(session.submit(options), /network disconnected/);
    await assert.rejects(
      session.submit(options),
      AmbiguousWorkflowCreationError,
    );
    assert.equal(machineRequests, 1);
  });

  test("blocks an unsafe retry after an ambiguous workflow response", async () => {
    const session = new WorkflowCreationSession();
    let workflowRequests = 0;
    const options = {
      selectedMachineId: "machine-1",
      workflowName: "Ambiguous workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async () => {
        workflowRequests += 1;
        throw new Error("network disconnected");
      },
      navigate: async () => {},
    };

    await assert.rejects(session.submit(options), /network disconnected/);
    await assert.rejects(
      session.submit(options),
      AmbiguousWorkflowCreationError,
    );
    assert.equal(workflowRequests, 1);
  });

  test("keeps ambiguous machine protection across a page refresh", async () => {
    const checkpointStore = createMemoryCheckpointStore();
    let machineRequests = 0;
    const options = {
      machineData: createMachineData("random-step-a"),
      workflowName: "Ambiguous workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async () => {
        machineRequests += 1;
        throw new Error("network disconnected");
      },
      navigate: async () => {},
    };

    await assert.rejects(
      new WorkflowCreationSession(checkpointStore).submit(options),
      /network disconnected/,
    );
    await assert.rejects(
      new WorkflowCreationSession(checkpointStore).submit({
        ...options,
        machineData: createMachineData("random-step-b"),
        workflowName: "Fresh generated name",
      }),
      AmbiguousWorkflowCreationError,
    );
    assert.equal(machineRequests, 1);
  });

  test("keeps ambiguous workflow protection across a page refresh", async () => {
    const checkpointStore = createMemoryCheckpointStore();
    let workflowRequests = 0;
    const options = {
      selectedMachineId: "machine-1",
      workflowName: "Ambiguous workflow",
      workflowJson: JSON.stringify({ nodes: [], links: [] }),
      request: async () => {
        workflowRequests += 1;
        throw new Error("network disconnected");
      },
      navigate: async () => {},
    };

    await assert.rejects(
      new WorkflowCreationSession(checkpointStore).submit(options),
      /network disconnected/,
    );
    await assert.rejects(
      new WorkflowCreationSession(checkpointStore).submit({
        ...options,
        workflowName: "Fresh generated name",
      }),
      AmbiguousWorkflowCreationError,
    );
    assert.equal(workflowRequests, 1);
  });
});
