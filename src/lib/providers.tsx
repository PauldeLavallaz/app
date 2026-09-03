import { useAuth, useOrganization, useUser } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react";
import { lazy, Suspense, useEffect } from "react";
import { GlobalErrorDialog } from "@/components/global-error-dialog";
import { api } from "./api";
import { isApiError } from "./api-error";
import {
  identifyAnalytics,
  isAnalyticsConfigured,
  setAnalyticsPersonPropertiesForFlags,
  warmAnalyticsClient,
} from "./analytics-client";
import { useAuthStore } from "./auth-store";

const ReactQueryDevtools =
  process.env.NODE_ENV === "production"
    ? null
    : lazy(() =>
        import("@tanstack/react-query-devtools").then((module) => ({
          default: module.ReactQueryDevtools,
        })),
      );

function PostHogUserIdentify() {
  const auth = useAuth();
  const { user, isSignedIn } = useUser();
  const { organization } = useOrganization();

  useEffect(() => {
    if (!isAnalyticsConfigured) return;

    setAnalyticsPersonPropertiesForFlags({
      org_id: organization?.id ?? null,
      org_name: organization?.name ?? null,
    });
  }, [organization?.id]);

  useEffect(() => {
    if (!isAnalyticsConfigured) return;

    const userProperties = {
      email: user?.primaryEmailAddress?.emailAddress,
      name: user?.fullName,
      org_id: organization?.id ?? null,
      org_name: organization?.name ?? null,
    };
    identifyAnalytics(auth.userId || undefined, userProperties || undefined);
  }, [auth.userId, isSignedIn, organization?.id]);

  return <></>;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count: number, error: Error) => {
        if (isApiError(error) && error.status === 403) return false;
        if (isApiError(error) && error.status === 404) return false;
        if (error.message.includes("403")) return false;

        if (error.message.includes("Waiting for auth to be online")) {
          return true;
        }

        // console.log(count, error);
        return count < 2;
      },
      queryFn: async ({ queryKey, pageParam, meta }) => {
        if (meta?.method === "POST") {
          return await api({
            url: queryKey.join("/"),
            params: meta?.params as Record<string, any> | undefined,
            init: {
              method: "POST",
              body: JSON.stringify(meta?.body),
            },
          });
        }

        let finalQuery = "";

        if (meta?.params && Object.values(meta.params).some(Array.isArray)) {
          const queryString = Object.entries(meta.params)
            .flatMap(([key, value]) => {
              if (value === undefined) return []; // Skip undefined values
              return Array.isArray(value)
                ? value.map(
                    (v) =>
                      `${encodeURIComponent(key)}=${encodeURIComponent(v)}`,
                  )
                : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            })
            .filter(Boolean) // Remove any empty strings that might result from the flatMap
            .join("&");

          finalQuery = queryString;
          const offset = pageParam !== undefined ? pageParam : meta?.offset;
          finalQuery = `offset=${offset}&${queryString}`;
          if (meta?.limit) {
            finalQuery = `limit=${meta.limit}&${finalQuery}`;
          }

          return await api({
            url: queryKey.join("/"),
            params: finalQuery,
          });
        }

        return await api({
          url: queryKey.join("/"),
          params: meta
            ? {
                offset: pageParam !== undefined ? pageParam : meta?.offset,
                limit: meta?.limit,
                ...(meta?.params || {}),
              }
            : undefined,
        });
      },
    },
    // mutations: {

    // },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const { getToken, orgId, sessionId, userId } = useAuth();

  useEffect(() => {
    warmAnalyticsClient();
  }, []);

  useEffect(() => {
    // console.log("sessionId", sessionId);
    useAuthStore.setState({
      fetchToken: getToken,
      token: null,
    });

    getToken().then((token) => {
      useAuthStore.setState({
        token: token,
      });
    });
  }, [getToken, orgId, sessionId, userId]);

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        {ReactQueryDevtools && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        )}
        <PostHogUserIdentify />
        <GlobalErrorDialog />
        {children}
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
