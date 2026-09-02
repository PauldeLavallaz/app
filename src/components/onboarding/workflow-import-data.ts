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

type CreationResource = "machine" | "workflow";

interface CreationApiRequest {
  init: {
    body: string;
    method: "POST";
  };
  url: "machine/serverless" | "workflow";
}

export interface WorkflowCreationOptions {
  isDefinitiveFailure?: (error: unknown, resource: CreationResource) => boolean;
  machineData?: unknown;
  navigate: (workflowId: string) => Promise<void>;
  onFinish?: () => void;
  onMachineCreated?: (machineId: string) => void;
  onStart?: () => void;
  onWorkflowCreated?: (workflowId: string) => void;
  request: (request: CreationApiRequest) => Promise<unknown>;
  selectedMachineId?: string;
  workflowApi?: string;
  workflowJson: unknown;
  workflowName: string;
}

export class AmbiguousWorkflowCreationError extends Error {
  constructor(resource: CreationResource) {
    super(
      `${resource === "machine" ? "Machine" : "Workflow"} creation may have succeeded. Refresh before retrying.`,
    );
    this.name = "AmbiguousWorkflowCreationError";
  }
}

export class WorkflowNavigationError extends Error {
  constructor() {
    super("Workflow created, but navigation failed. Try Finish again.");
    this.name = "WorkflowNavigationError";
  }
}

export class WorkflowCreationSession {
  private machineId?: string;
  private readonly submissionLock = new SubmissionLock();
  private uncertainResource?: CreationResource;
  private workflowId?: string;

  submit(options: WorkflowCreationOptions): Promise<string | undefined> {
    return this.submissionLock.run(async () => {
      options.onStart?.();
      try {
        return await this.submitOnce(options);
      } finally {
        options.onFinish?.();
      }
    });
  }

  private async submitOnce(options: WorkflowCreationOptions): Promise<string> {
    if (this.workflowId) {
      await this.navigate(options, this.workflowId);
      return this.workflowId;
    }

    if (this.uncertainResource) {
      throw new AmbiguousWorkflowCreationError(this.uncertainResource);
    }

    let machineId = this.machineId || options.selectedMachineId;

    if (!machineId && options.machineData !== undefined) {
      this.uncertainResource = "machine";
      try {
        const machine = await options.request({
          url: "machine/serverless",
          init: {
            method: "POST",
            body: JSON.stringify(options.machineData),
          },
        });
        const createdMachineId = getResponseId(machine, "id");
        if (!createdMachineId) {
          throw new AmbiguousWorkflowCreationError("machine");
        }

        this.machineId = createdMachineId;
        machineId = createdMachineId;
        this.uncertainResource = undefined;
        options.onMachineCreated?.(createdMachineId);
      } catch (error) {
        if (options.isDefinitiveFailure?.(error, "machine")) {
          this.uncertainResource = undefined;
        }
        throw error;
      }
    }

    const workflowData = buildWorkflowCreateData({
      name: options.workflowName,
      workflowJson: options.workflowJson,
      workflowApi: options.workflowApi,
      machineId,
    });

    this.uncertainResource = "workflow";
    try {
      const workflow = await options.request({
        url: "workflow",
        init: {
          method: "POST",
          body: JSON.stringify(workflowData),
        },
      });
      const createdWorkflowId = getResponseId(workflow, "workflow_id");
      if (!createdWorkflowId) {
        throw new AmbiguousWorkflowCreationError("workflow");
      }

      this.workflowId = createdWorkflowId;
      this.uncertainResource = undefined;
      options.onWorkflowCreated?.(createdWorkflowId);
    } catch (error) {
      if (options.isDefinitiveFailure?.(error, "workflow")) {
        this.uncertainResource = undefined;
      }
      throw error;
    }

    await this.navigate(options, this.workflowId);
    return this.workflowId;
  }

  private async navigate(
    options: WorkflowCreationOptions,
    workflowId: string,
  ): Promise<void> {
    try {
      await options.navigate(workflowId);
    } catch {
      throw new WorkflowNavigationError();
    }
  }
}

function getResponseId(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate ? candidate : undefined;
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
    json.workflow_api != null &&
    (!json.workflow_api ||
      typeof json.workflow_api !== "object" ||
      Array.isArray(json.workflow_api))
  ) {
    throw new Error(
      "Invalid workflow format: 'workflow_api' must be an object",
    );
  }

  return {
    environment:
      json.environment && Object.keys(json.environment).length > 0
        ? json.environment
        : undefined,
    importJson: text,
    workflowApi:
      json.workflow_api == null ? undefined : JSON.stringify(json.workflow_api),
    workflowJson: text,
  };
}
