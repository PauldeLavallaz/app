import {
  sanitizeWorkflowGraph,
  sendEventToCD,
} from "@/components/workspace/sendEventToCD";
import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import { callServerPromise } from "@/lib/call-server-promise";
import type { Options } from "nuqs";
import { customInputNodes } from "./customInputNodes";

const getPromptWithTimeout = async ({
  timeoutMs = 5000,
  endpoint,
}: {
  timeoutMs?: number;
  endpoint?: string;
}) => {
  if (!endpoint) return;
  const getPrompt = new Promise<any>((resolve, reject) => {
    const eventListener = (event: any) => {
      // console.log(event.origin, endpoint, event.data);
      if (event.origin !== endpoint) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "cd_plugin_onGetPrompt") {
          window.removeEventListener("message", eventListener, {
            capture: true,
          });
          resolve(data.data);
        }
      } catch (error) {
        console.error("Error parsing prompt:", error);
        reject(error);
      }
    };
    window.addEventListener("message", eventListener, {
      capture: true,
    });
    sendEventToCD("get_prompt");
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("Timeout: Failed to get prompt")),
      timeoutMs,
    );
  });
  console.log("getPrompt", getPrompt);
  return Promise.race([getPrompt, timeoutPromise]);
};

// Create a Set for faster lookup of custom input node types
const customInputNodeTypes = new Set(Object.keys(customInputNodes));

/**
 * Merges _meta data from current workflow_api into new workflow_api based on matching input_id values
 * Only processes custom input nodes for better performance
 * @param newWorkflowApi - The new workflow_api JSON string
 * @param currentWorkflowApi - The current workflow_api JSON string to merge meta data from
 * @returns The merged workflow_api JSON string
 */
const mergeMetaData = (newWorkflowApi: any, currentWorkflowApi?: any): any => {
  if (!currentWorkflowApi) {
    return newWorkflowApi;
  }

  try {
    // Create a map of input_id to _meta data from current workflow_api
    // Only process custom input nodes for better performance
    const inputIdToMetaMap = new Map<string, any>();

    for (const [nodeId, nodeData] of Object.entries(currentWorkflowApi)) {
      if (
        nodeData &&
        typeof nodeData === "object" &&
        "class_type" in nodeData &&
        "inputs" in nodeData
      ) {
        const classType = (nodeData as any).class_type;

        // Only process custom input nodes
        if (!customInputNodeTypes.has(classType)) {
          continue;
        }

        const inputId = (nodeData as any).inputs?.input_id;
        if (inputId && (nodeData as any)._meta) {
          // Extract only the specific _meta fields we want to preserve
          const metaData: any = {};
          const currentMeta = (nodeData as any)._meta;

          if (currentMeta.cd_group_name !== undefined) {
            metaData.cd_group_name = currentMeta.cd_group_name;
          }
          if (currentMeta.cd_input_order !== undefined) {
            metaData.cd_input_order = currentMeta.cd_input_order;
          }
          if (currentMeta.cd_input_group_id !== undefined) {
            metaData.cd_input_group_id = currentMeta.cd_input_group_id;
          }
          if (currentMeta.cd_group_collapsed !== undefined) {
            metaData.cd_group_collapsed = currentMeta.cd_group_collapsed;
          }

          if (Object.keys(metaData).length > 0) {
            inputIdToMetaMap.set(inputId, metaData);
          }
        }
      }
    }

    // Merge _meta data into new workflow_api
    // Only process custom input nodes for better performance
    for (const [nodeId, nodeData] of Object.entries(newWorkflowApi)) {
      if (
        nodeData &&
        typeof nodeData === "object" &&
        "class_type" in nodeData &&
        "inputs" in nodeData
      ) {
        const classType = (nodeData as any).class_type;

        // Only process custom input nodes
        if (!customInputNodeTypes.has(classType)) {
          continue;
        }

        const inputId = (nodeData as any).inputs?.input_id;
        if (inputId && inputIdToMetaMap.has(inputId)) {
          const metaData = inputIdToMetaMap.get(inputId);
          if (!(nodeData as any)._meta) {
            (nodeData as any)._meta = {};
          }
          // Merge the specific _meta fields, preserving any existing ones
          Object.assign((nodeData as any)._meta, metaData);
        }
      }
    }

    return newWorkflowApi;
  } catch (error) {
    console.error("Error merging meta data:", error);
    return newWorkflowApi;
  }
};

async function createNewWorkflowVersion(data: {
  workflow_data: {
    workflow: string;
    workflow_api: string;
  };
  user_id: string;
  workflow_id: string;
  comment?: string;
  machine_id?: string;
  machine_version_id?: string;
  comfyui_snapshot?: string;
}) {
  return api({
    url: `workflow/${data.workflow_id}/version`,
    init: {
      method: "POST",
      body: JSON.stringify({
        workflow: data.workflow_data.workflow,
        workflow_api: data.workflow_data.workflow_api,
        comment: data.comment,
        machine_id: data.machine_id,
        machine_version_id: data.machine_version_id,
        comfyui_snapshot: data.comfyui_snapshot,
      }),
    },
  });
}

interface Props {
  query: UseInfiniteQueryResult<InfiniteData<any[], unknown>, Error>;
  comment?: string;
  userId: string | null | undefined;
  workflowId?: string | null;
  setVersion: (
    value: number | ((old: number) => number | null) | null,
    options?: Options,
  ) => Promise<URLSearchParams>;
  sessionId: string | undefined;
  is_fluid_machine: boolean;
  comfyui_snapshot_loading: boolean;
  endpoint?: string;
  machine_id?: string;
  machine_version_id?: string;
  comfyui_snapshot?: string;
  snapshotAction: "CREATE_AND_COMMIT" | "COMMIT_ONLY";
  setOpen: (b: boolean) => void;
  workflow_api?: string;
}

export const serverAction = async ({
  comment,
  query,
  userId,
  workflowId,
  setVersion,
  sessionId,
  is_fluid_machine,
  comfyui_snapshot_loading,
  endpoint,
  machine_id,
  machine_version_id,
  comfyui_snapshot,
  snapshotAction,
  setOpen,
  workflow_api,
}: Props) => {
  if (!userId) return;
  if (!workflowId) return;
  if (comfyui_snapshot_loading && is_fluid_machine) return;

  try {
    const prompt = await getPromptWithTimeout({ endpoint });
    if (!prompt?.workflow || !prompt?.output) {
      throw new Error("Prompt response did not include workflow data");
    }

    const sanitizedWorkflow = sanitizeWorkflowGraph(prompt.workflow);
    const mergedWorkflowApi = mergeMetaData(prompt.output, workflow_api);

    let new_machine_vesion_id: string | undefined = machine_version_id;
    if (snapshotAction === "CREATE_AND_COMMIT" && sessionId) {
      const snapshot_data = await callServerPromise(
        api({
          url: `session/${sessionId}/snapshot`,
          init: {
            method: "POST",
          },
        }),
        {
          loadingText: "Saving snapshot...",
        },
      );
      new_machine_vesion_id = snapshot_data.version_id;
    }

    if (is_fluid_machine && !new_machine_vesion_id) {
      toast.error("Does't have a machine version id");
      return;
    }

    console.log("mergedWorkflowApi", mergedWorkflowApi);

    const result = await callServerPromise(
      createNewWorkflowVersion({
        comment,
        machine_id,
        user_id: userId,
        workflow_id: workflowId,
        machine_version_id: new_machine_vesion_id,
        comfyui_snapshot: comfyui_snapshot,
        workflow_data: {
          workflow: sanitizedWorkflow,
          workflow_api: mergedWorkflowApi, // Use merged workflow_api instead of prompt.output
        },
      }),
      {
        loadingText: "Creating a new version",
      },
    );

    await query.refetch();
    setOpen(false);

    if (result?.version !== undefined) {
      setTimeout(() => {
        setVersion(result.version);
      }, 100);
    }
  } catch (error) {
    console.error("Error getting prompt:", error);
    toast.error("Failed to get prompt. Please try again.");
    return;
  }
};
