export interface ParsedWorkflowImport<
  TEnvironment extends Record<string, unknown>,
> {
  environment?: TEnvironment;
  importJson: string;
  workflowApi?: string;
  workflowJson: string;
}

export interface WorkflowCreateData {
  machine_id?: string;
  name: string;
  workflow_api?: string;
  workflow_json: string;
}

export function buildWorkflowCreateData({
  machineId,
  name,
  workflowApi,
  workflowJson,
}: {
  machineId?: string;
  name: string;
  workflowApi?: string;
  workflowJson: unknown;
}): WorkflowCreateData {
  const serializedWorkflow =
    typeof workflowJson === "string"
      ? workflowJson
      : JSON.stringify(workflowJson);

  if (!serializedWorkflow) {
    throw new Error("Workflow JSON is required");
  }

  JSON.parse(serializedWorkflow);

  return {
    name,
    workflow_json: serializedWorkflow,
    ...(workflowApi && { workflow_api: workflowApi }),
    ...(machineId && { machine_id: machineId }),
  };
}

export class SubmissionLock {
  private pending = false;

  async run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (this.pending) return undefined;

    this.pending = true;
    try {
      return await operation();
    } finally {
      this.pending = false;
    }
  }
}

export function parseWorkflowImport<
  TEnvironment extends Record<string, unknown> = Record<string, unknown>,
>(text: string): ParsedWorkflowImport<TEnvironment> {
  const parsedJson: unknown = JSON.parse(text);

  if (
    !parsedJson ||
    typeof parsedJson !== "object" ||
    Array.isArray(parsedJson)
  ) {
    throw new Error("Invalid workflow format: expected a JSON object");
  }

  const json = parsedJson as {
    environment?: TEnvironment;
    links?: unknown;
    nodes?: unknown;
    workflow_api?: unknown;
  };

  if (!Array.isArray(json.nodes) || !Array.isArray(json.links)) {
    throw new Error(
      "Invalid workflow format: 'nodes' and 'links' must be arrays",
    );
  }

  if (
    json.environment !== undefined &&
    (!json.environment ||
      typeof json.environment !== "object" ||
      Array.isArray(json.environment))
  ) {
    throw new Error("Invalid workflow format: 'environment' must be an object");
  }

  if (
    json.workflow_api !== undefined &&
    (!json.workflow_api ||
      typeof json.workflow_api !== "object" ||
      Array.isArray(json.workflow_api))
  ) {
    throw new Error(
      "Invalid workflow format: 'workflow_api' must be an object",
    );
  }

  return {
    environment: json.environment,
    importJson: text,
    workflowApi:
      json.workflow_api === undefined
        ? undefined
        : JSON.stringify(json.workflow_api),
    workflowJson: text,
  };
}
