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
  if (workflowApi) JSON.parse(workflowApi);

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
      `${resource === "machine" ? "Machine" : "Workflow"} creation status is unknown. Check your Machines or Workflows list before starting a new attempt.`,
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

type WorkflowCreationPhase =
  | "machine-pending"
  | "machine-created"
  | "workflow-pending"
  | "workflow-created";

export interface WorkflowCreationCheckpoint {
  machineFingerprint: string;
  machineId?: string;
  phase: WorkflowCreationPhase;
  workflowFingerprint: string;
  workflowId?: string;
}

export interface WorkflowCreationCheckpointStore {
  clear: () => void;
  load: () => unknown;
  save: (checkpoint: WorkflowCreationCheckpoint) => void;
}

interface WorkflowCreationIdentity {
  machineFingerprint: string;
  workflowFingerprint: string;
}

export class WorkflowCreationSession {
  private checkpoint?: WorkflowCreationCheckpoint;
  private readonly submissionLock = new SubmissionLock();

  constructor(
    private readonly checkpointStore?: WorkflowCreationCheckpointStore,
  ) {}

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
    const identity = getCreationIdentity(options);
    const preparedAttempt = this.prepareAttempt(identity, options);

    if (preparedAttempt.workflowId) {
      await this.navigate(options, preparedAttempt.workflowId);
      this.clearStoredCheckpoint();
      return preparedAttempt.workflowId;
    }

    let machineId = preparedAttempt.machineId || options.selectedMachineId;
    let machineFingerprint =
      preparedAttempt.machineFingerprint || identity.machineFingerprint;

    if (!machineId && options.machineData !== undefined) {
      this.persistCheckpoint({
        ...identity,
        phase: "machine-pending",
      });
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

        machineId = createdMachineId;
        machineFingerprint = identity.machineFingerprint;
        this.persistCheckpoint({
          ...identity,
          machineId,
          phase: "machine-created",
        });
        options.onMachineCreated?.(createdMachineId);
      } catch (error) {
        if (options.isDefinitiveFailure?.(error, "machine")) {
          this.clearCheckpoint();
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

    this.persistCheckpoint({
      machineFingerprint,
      machineId,
      phase: "workflow-pending",
      workflowFingerprint: identity.workflowFingerprint,
    });
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

      this.persistCheckpoint({
        machineFingerprint,
        machineId,
        phase: "workflow-created",
        workflowFingerprint: identity.workflowFingerprint,
        workflowId: createdWorkflowId,
      });
      options.onWorkflowCreated?.(createdWorkflowId);
    } catch (error) {
      if (options.isDefinitiveFailure?.(error, "workflow")) {
        if (machineId) {
          this.persistCheckpoint({
            machineFingerprint,
            machineId,
            phase: "machine-created",
            workflowFingerprint: identity.workflowFingerprint,
          });
        } else {
          this.clearCheckpoint();
        }
      }
      throw error;
    }

    const workflowId = this.checkpoint?.workflowId;
    if (!workflowId) {
      throw new AmbiguousWorkflowCreationError("workflow");
    }

    await this.navigate(options, workflowId);
    this.clearStoredCheckpoint();
    return workflowId;
  }

  private prepareAttempt(
    identity: WorkflowCreationIdentity,
    options: WorkflowCreationOptions,
  ): {
    machineFingerprint?: string;
    machineId?: string;
    workflowId?: string;
  } {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return {};

    const sameMachine =
      checkpoint.machineFingerprint === identity.machineFingerprint ||
      (options.machineData === undefined &&
        !!checkpoint.machineId &&
        checkpoint.machineId === options.selectedMachineId);
    const sameWorkflow =
      checkpoint.workflowFingerprint === identity.workflowFingerprint;

    if (checkpoint.phase === "machine-pending") {
      if (checkpoint.machineFingerprint === identity.machineFingerprint) {
        throw new AmbiguousWorkflowCreationError("machine");
      }
      this.clearCheckpoint();
      return {};
    }

    if (checkpoint.phase === "machine-created") {
      if (sameMachine && checkpoint.machineId) {
        return {
          machineFingerprint: checkpoint.machineFingerprint,
          machineId: checkpoint.machineId,
        };
      }
      this.clearCheckpoint();
      return {};
    }

    if (sameMachine && sameWorkflow) {
      if (checkpoint.phase === "workflow-pending") {
        throw new AmbiguousWorkflowCreationError("workflow");
      }
      if (checkpoint.workflowId) {
        return {
          machineFingerprint: checkpoint.machineFingerprint,
          machineId: checkpoint.machineId,
          workflowId: checkpoint.workflowId,
        };
      }
    }

    if (sameMachine && checkpoint.machineId) {
      this.persistCheckpoint({
        machineFingerprint: checkpoint.machineFingerprint,
        machineId: checkpoint.machineId,
        phase: "machine-created",
        workflowFingerprint: identity.workflowFingerprint,
      });
      return {
        machineFingerprint: checkpoint.machineFingerprint,
        machineId: checkpoint.machineId,
      };
    }

    this.clearCheckpoint();
    return {};
  }

  private loadCheckpoint(): WorkflowCreationCheckpoint | undefined {
    if (this.checkpoint) return this.checkpoint;

    let storedCheckpoint: unknown;
    try {
      storedCheckpoint = this.checkpointStore?.load();
    } catch {
      this.clearStoredCheckpoint();
      return undefined;
    }
    if (isWorkflowCreationCheckpoint(storedCheckpoint)) {
      this.checkpoint = storedCheckpoint;
      return storedCheckpoint;
    }

    this.clearStoredCheckpoint();
    return undefined;
  }

  private persistCheckpoint(checkpoint: WorkflowCreationCheckpoint): void {
    this.checkpoint = checkpoint;
    try {
      this.checkpointStore?.save(checkpoint);
    } catch {
      // In-memory protection remains active if browser storage is unavailable.
    }
  }

  private clearCheckpoint(): void {
    this.checkpoint = undefined;
    this.clearStoredCheckpoint();
  }

  private clearStoredCheckpoint(): void {
    try {
      this.checkpointStore?.clear();
    } catch {
      // Browser storage is an extra safety layer, not a submission dependency.
    }
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

function getCreationIdentity(
  options: WorkflowCreationOptions,
): WorkflowCreationIdentity {
  const machineData =
    options.machineData &&
    typeof options.machineData === "object" &&
    !Array.isArray(options.machineData)
      ? Object.fromEntries(
          Object.entries(options.machineData).filter(([key]) => key !== "name"),
        )
      : options.machineData;

  return {
    machineFingerprint: fingerprint(
      JSON.stringify({
        machineData,
        selectedMachineId: options.selectedMachineId,
      }),
    ),
    workflowFingerprint: fingerprint(
      JSON.stringify({
        workflowApi: options.workflowApi,
        workflowJson: options.workflowJson,
      }),
    ),
  };
}

function fingerprint(value: string): string {
  let first = 2166136261;
  let second = 5381;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }

  return `${value.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
}

function isWorkflowCreationCheckpoint(
  value: unknown,
): value is WorkflowCreationCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const checkpoint = value as Record<string, unknown>;
  return (
    typeof checkpoint.machineFingerprint === "string" &&
    typeof checkpoint.workflowFingerprint === "string" &&
    [
      "machine-pending",
      "machine-created",
      "workflow-pending",
      "workflow-created",
    ].includes(checkpoint.phase as string) &&
    (checkpoint.machineId === undefined ||
      typeof checkpoint.machineId === "string") &&
    (checkpoint.workflowId === undefined ||
      typeof checkpoint.workflowId === "string")
  );
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
