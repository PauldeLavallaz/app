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

export function resolveWorkflowJsonUpdate(
  currentWorkflowJson: string | undefined,
  update: { importJson?: string; workflowJson?: string },
): string | undefined {
  if (Object.hasOwn(update, "workflowJson") && update.workflowJson) {
    return update.workflowJson;
  }
  if (Object.hasOwn(update, "importJson")) return update.importJson;
  if (Object.hasOwn(update, "workflowJson")) return update.workflowJson;
  return currentWorkflowJson;
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

  isPending(): boolean {
    return this.pending;
  }

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
      `${resource === "machine" ? "Machine" : "Workflow"} creation status is unknown. Check your Machines or Workflows list; if it does not appear, contact support before retrying.`,
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

  startNewMachineAttempt(): boolean {
    if (this.submissionLock.isPending()) return false;

    const phase = this.loadCheckpoint()?.phase;
    if (
      phase === "machine-pending" ||
      phase === "workflow-pending" ||
      phase === "workflow-created"
    ) {
      return false;
    }

    this.clearCheckpoint();
    return true;
  }

  private async submitOnce(options: WorkflowCreationOptions): Promise<string> {
    const identity = getCreationIdentity(options);
    const preparedAttempt = this.prepareAttempt(options);

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
      } catch (error) {
        if (options.isDefinitiveFailure?.(error, "machine")) {
          this.clearCheckpoint();
          throw error;
        }
        if (error instanceof AmbiguousWorkflowCreationError) throw error;
        throw new AmbiguousWorkflowCreationError("machine");
      }

      options.onMachineCreated?.(machineId);
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
        throw error;
      }
      if (error instanceof AmbiguousWorkflowCreationError) throw error;
      throw new AmbiguousWorkflowCreationError("workflow");
    }

    const workflowId = this.checkpoint?.workflowId;
    if (!workflowId) {
      throw new AmbiguousWorkflowCreationError("workflow");
    }

    options.onWorkflowCreated?.(workflowId);
    await this.navigate(options, workflowId);
    this.clearStoredCheckpoint();
    return workflowId;
  }

  private prepareAttempt(options: WorkflowCreationOptions): {
    machineFingerprint?: string;
    machineId?: string;
    workflowId?: string;
  } {
    const checkpoint = this.loadCheckpoint();
    if (!checkpoint) return {};

    const sameSelectedMachine =
      options.machineData === undefined &&
      !!checkpoint.machineId &&
      checkpoint.machineId === options.selectedMachineId;
    if (checkpoint.phase === "machine-pending") {
      throw new AmbiguousWorkflowCreationError("machine");
    }

    if (checkpoint.phase === "workflow-pending") {
      throw new AmbiguousWorkflowCreationError("workflow");
    }

    if (checkpoint.phase === "workflow-created") {
      if (!checkpoint.workflowId) {
        throw new AmbiguousWorkflowCreationError("workflow");
      }
      return {
        machineFingerprint: checkpoint.machineFingerprint,
        machineId: checkpoint.machineId,
        workflowId: checkpoint.workflowId,
      };
    }

    if (checkpoint.phase === "machine-created") {
      if (
        checkpoint.machineId &&
        (options.machineData !== undefined || sameSelectedMachine)
      ) {
        return {
          machineFingerprint: checkpoint.machineFingerprint,
          machineId: checkpoint.machineId,
        };
      }
      this.clearCheckpoint();
      return {};
    }

    return {};
  }

  private loadCheckpoint(): WorkflowCreationCheckpoint | undefined {
    if (!this.checkpointStore) return this.checkpoint;

    let storedCheckpoint: unknown;
    try {
      storedCheckpoint = this.checkpointStore.load();
    } catch {
      return this.checkpoint;
    }
    if (isWorkflowCreationCheckpoint(storedCheckpoint)) {
      this.checkpoint = storedCheckpoint;
      return storedCheckpoint;
    }

    if (storedCheckpoint === undefined || storedCheckpoint === null) {
      return this.checkpoint;
    }

    this.clearCheckpoint();
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
  const machineData = normalizeMachineData(options.machineData);

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

function normalizeMachineData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const machineData = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "name"),
  );
  const dockerCommandSteps = machineData.docker_command_steps;
  if (
    !dockerCommandSteps ||
    typeof dockerCommandSteps !== "object" ||
    Array.isArray(dockerCommandSteps)
  ) {
    return machineData;
  }

  const steps = (dockerCommandSteps as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return machineData;

  machineData.docker_command_steps = {
    ...dockerCommandSteps,
    steps: steps.map(normalizeDockerStep),
  };
  return machineData;
}

function normalizeDockerStep(step: unknown): unknown {
  if (!step || typeof step !== "object" || Array.isArray(step)) return step;

  const dockerStep = step as Record<string, unknown>;
  const data = dockerStep.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { type: dockerStep.type, data };
  }

  const record = data as Record<string, unknown>;
  if (dockerStep.type === "custom-node") {
    return {
      type: dockerStep.type,
      data: {
        files: record.files,
        hash: record.hash,
        install_type: record.install_type,
        name: record.name,
        pip: record.pip,
        url: record.url,
      },
    };
  }

  if (dockerStep.type === "custom-node-manager") {
    return {
      type: dockerStep.type,
      data: {
        node_id: record.node_id,
        version: record.version,
      },
    };
  }

  return { type: dockerStep.type, data };
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
