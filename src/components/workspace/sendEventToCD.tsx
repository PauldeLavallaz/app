// import { useWorkflowStore } from "@/repo/components/ui/custom/workspace/Workspace";

import { useWorkflowStore } from "./Workspace";

export function reloadIframe() {
  const iframe = document.getElementById(
    "workspace-iframe",
  ) as HTMLIFrameElement;
  if (iframe) {
    iframe.src = iframe.src;
  }
}

export function sendEventToCD(event: string, data?: any) {
  const iframe = document.getElementById(
    "workspace-iframe",
  ) as HTMLIFrameElement;
  if (iframe?.contentWindow) {
    // console.log(event);
    iframe.contentWindow.postMessage(
      JSON.stringify({ type: event, data }),
      "*",
    );
  }
}

export function sendInetrnalEventToCD(data?: any) {
  const iframe = document.getElementById(
    "workspace-iframe",
  ) as HTMLIFrameElement;
  if (iframe?.contentWindow) {
    // console.log(event);
    iframe.contentWindow.postMessage({ internal: data }, "*");
  }
}

type LiteGraphLink = [
  number | string,
  number | string,
  number,
  number | string,
  number,
  string?,
];

function cloneWorkflow<T>(workflow: T): T {
  if (!workflow || typeof workflow !== "object") return workflow;

  if (typeof structuredClone === "function") {
    return structuredClone(workflow);
  }

  return JSON.parse(JSON.stringify(workflow));
}

function linkKey(linkId: number | string | null | undefined) {
  return linkId == null ? null : String(linkId);
}

export function sanitizeWorkflowGraph<T>(workflowJson: T): T {
  if (!workflowJson || typeof workflowJson !== "object") return workflowJson;

  const workflow = cloneWorkflow(workflowJson) as any;
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.links)) {
    return workflow as T;
  }

  const linkById = new Map<string, LiteGraphLink>();
  const sourceByLink = new Map<
    string,
    { nodeId: number | string; slot: number; type?: string }
  >();
  const nodeById = new Map<string, any>();

  for (const node of workflow.nodes) {
    const nodeId = linkKey(node?.id);
    if (nodeId) nodeById.set(nodeId, node);

    for (const [slot, output] of (node?.outputs ?? []).entries()) {
      for (const linkId of output?.links ?? []) {
        const key = linkKey(linkId);
        if (!key) continue;
        sourceByLink.set(key, {
          nodeId: node.id,
          slot,
          type: output?.type,
        });
      }
    }
  }

  for (const link of workflow.links) {
    if (!Array.isArray(link) || link.length < 5) continue;
    const key = linkKey(link[0]);
    if (!key) continue;
    linkById.set(key, link as LiteGraphLink);
  }

  for (const node of workflow.nodes) {
    for (const [slot, input] of (node?.inputs ?? []).entries()) {
      const key = linkKey(input?.link);
      if (!key) continue;

      const link = linkById.get(key);
      const source = sourceByLink.get(key);
      const sourceNodeId = source?.nodeId ?? link?.[1];
      const sourceSlot = source?.slot ?? link?.[2] ?? 0;

      if (sourceNodeId == null) {
        input.link = null;
        continue;
      }

      const normalizedLink: LiteGraphLink = link ?? [
        input.link,
        sourceNodeId,
        sourceSlot,
        node.id,
        slot,
        input?.type,
      ];

      normalizedLink[1] = sourceNodeId;
      normalizedLink[2] = sourceSlot;
      normalizedLink[3] = node.id;
      normalizedLink[4] = slot;
      normalizedLink[5] = normalizedLink[5] ?? input?.type ?? source?.type;

      linkById.set(key, normalizedLink);

      const sourceNode = nodeById.get(String(sourceNodeId));
      const sourceOutput = sourceNode?.outputs?.[sourceSlot];
      if (sourceOutput) {
        sourceOutput.links = Array.from(
          new Set([...(sourceOutput.links ?? []), input.link]),
        );
      }
    }
  }

  workflow.links = Array.from(linkById.values());
  return workflow as T;
}

export function sendWorkflow(workflow_json: any) {
  const state = useWorkflowStore.getState();
  const sanitizedWorkflow = sanitizeWorkflowGraph(workflow_json);
  sendEventToCD("graph_load", sanitizedWorkflow);
  state.setWorkflow(sanitizedWorkflow);
  state.setHasChanged(false);
  return sanitizedWorkflow;
}
