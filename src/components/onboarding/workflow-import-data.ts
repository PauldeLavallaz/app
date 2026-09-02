export interface ParsedWorkflowImport<
  TEnvironment extends Record<string, unknown>,
> {
  environment?: TEnvironment;
  importJson: string;
  workflowApi?: string;
  workflowJson: string;
}

export function parseWorkflowImport<
  TEnvironment extends Record<string, unknown> = Record<string, unknown>,
>(text: string): ParsedWorkflowImport<TEnvironment> {
  const json = JSON.parse(text) as {
    environment?: TEnvironment;
    links?: unknown;
    nodes?: unknown;
    workflow_api?: unknown;
  };

  if (!json.environment && (!json.nodes || !json.links)) {
    throw new Error("Invalid workflow format: missing 'nodes' or 'links' keys");
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
