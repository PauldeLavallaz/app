import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { isApiError } from "@/lib/api-error";
import type { Machine, MachineListItem } from "@/types/machine";

const BATCH_SIZE = 20;

const ACTIVE_MACHINE_STATUSES = new Set([
  "building",
  "pending",
  "queued",
  "not-started",
  "starting",
  "running",
]);

function hasActiveMachineWork(items?: Array<{ status?: string }>) {
  return items?.some((item) => ACTIVE_MACHINE_STATUSES.has(item.status ?? ""));
}

// NOTE: consider refactoring to use options object as input
export function useMachines(
  debouncedSearchValue?: string,
  batchSize: number = BATCH_SIZE,
  limit?: number,
  include_has_workflows?: boolean,
  is_workspace = false,
  is_self_hosted = false,
  is_docker = false,
  include_docker_command_steps = false,
) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useInfiniteQuery<MachineListItem[]>({
    queryKey: ["machines"],
    meta: {
      limit: limit ?? batchSize,
      offset: 0,
      params: {
        search: debouncedSearchValue ?? "",
        is_deleted: false,
        include_has_workflows: include_has_workflows ?? false,
        is_docker,
        is_workspace,
        is_self_hosted,
        include_docker_command_steps,
      },
    },
    queryKeyHashFn: (queryKey) =>
      [
        ...queryKey,
        authScopeKey,
        debouncedSearchValue ?? "",
        batchSize,
        limit ?? "",
        include_has_workflows ?? false,
        is_workspace,
        is_self_hosted,
        is_docker,
        include_docker_command_steps,
      ].toString(),
    getNextPageParam: (lastPage, allPages) => {
      return lastPage?.length === batchSize
        ? allPages?.length * batchSize
        : undefined;
    },
    initialPageParam: 0,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? [];
      return pages.some((page) => hasActiveMachineWork(page)) ? 5_000 : false;
    },
  });
}

export function useMachinesAll() {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useQuery<MachineListItem[]>({
    queryKey: ["machines", "all"],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
    refetchInterval: (query) =>
      hasActiveMachineWork(query.state.data) ? 5_000 : false,
  });
}

export function useMachine(machine_id?: string) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useQuery<Machine>({
    enabled: !!machine_id,
    queryKey: ["machine", machine_id],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
  });
}

export function useMachineEvents(machine_id: string) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useQuery<any[]>({
    queryKey: ["machine", machine_id, "events"],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
    refetchInterval: 15_000,
  });
}

export function useMachineVersions(machine_id: string) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useInfiniteQuery<any[]>({
    queryKey: ["machine", "serverless", machine_id, "versions"],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
    meta: {
      limit: BATCH_SIZE,
      offset: 0,
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage?.length === BATCH_SIZE
        ? allPages?.length * BATCH_SIZE
        : undefined;
    },
    enabled: !!machine_id,
    initialPageParam: 0,
    refetchInterval: (query) =>
      hasActiveMachineWork(query.state.data?.pages?.flat()) ? 5_000 : false,
  });
}

export function useMachineVersionsAll(machine_id: string) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useQuery<any[]>({
    queryKey: ["machine", "serverless", machine_id, "versions", "all"],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
    refetchInterval: (query) =>
      hasActiveMachineWork(query.state.data) ? 5_000 : false,
    enabled: !!machine_id,
  });
}

export function useMachineVersion(
  machine_id: string,
  machine_version_id: string,
) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useQuery<any>({
    enabled: !!machine_id && !!machine_version_id,
    queryKey: [
      "machine",
      "serverless",
      machine_id,
      "versions",
      machine_version_id,
    ],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
    refetchInterval: (query) =>
      ACTIVE_MACHINE_STATUSES.has(query.state.data?.status ?? "")
        ? 5_000
        : false,
  });
}
