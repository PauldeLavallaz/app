import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";

const BATCH_SIZE = 20;

export function useWorkflowList(
  debouncedSearchValue: string,
  user_ids = "", // format: "user_xxxxxx,user_yyyyyy"
  machine_id = "", // format: just one machine uuid
  limit: number = BATCH_SIZE,
) {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useInfiniteQuery<any[]>({
    queryKey: ["workflows"],
    queryKeyHashFn: (queryKey) => {
      return [
        ...queryKey,
        authScopeKey,
        debouncedSearchValue,
        limit,
        user_ids,
        machine_id,
      ].join(",");
    },
    meta: {
      limit: limit,
      offset: 0,
      params: {
        search: debouncedSearchValue ?? "",
        user_ids: user_ids,
        machine_id: machine_id,
      },
    },
    getNextPageParam: (lastPage, allPages) => {
      // Check if lastPage is defined and has a length property
      if (
        lastPage &&
        Array.isArray(lastPage) &&
        lastPage.length === BATCH_SIZE
      ) {
        return allPages.length * BATCH_SIZE;
      }
      return undefined;
    },
    initialPageParam: 0,
  });
}

export function useWorkflowsAll() {
  const { orgId, userId } = useAuth();
  const authScopeKey = `${orgId ?? "personal"}:${userId ?? "anonymous"}`;

  return useQuery<any[]>({
    queryKey: ["workflows", "all"],
    queryKeyHashFn: (queryKey) => [...queryKey, authScopeKey].join(","),
    refetchInterval: 5000,
  });
}

export interface FeaturedWorkflow {
  description: string;
  share_slug: string; // this is the url
  workflow: {
    cover_image: string;
    id: string;
    name: string;
    workflow: any; // this is a object json
  };
}

export function useFeaturedWorkflows() {
  return useQuery<FeaturedWorkflow[]>({
    queryKey: ["deployments", "featured"],
  });
}
