const posthogKey = process.env.VITE_PUBLIC_POSTHOG_KEY;

export const isAnalyticsConfigured = Boolean(
  posthogKey && posthogKey !== "phc_your_posthog_project_key_here",
);

let clientPromise: Promise<any | null> | null = null;

function scheduleIdle(callback: () => void) {
  if (typeof window === "undefined") return;

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 4000 });
    return;
  }

  globalThis.setTimeout(callback, 2500);
}

export function warmAnalyticsClient() {
  if (!isAnalyticsConfigured) return;
  scheduleIdle(() => {
    void getAnalyticsClient();
  });
}

export async function getAnalyticsClient() {
  if (!isAnalyticsConfigured || typeof window === "undefined") {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import("posthog-js").then(({ default: posthog }) => {
      posthog.init(posthogKey!, {
        api_host:
          process.env.VITE_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        capture_pageview: false,
        capture_pageleave: true,
        debug: process.env.NODE_ENV === "development",
        autocapture: {
          capture_copied_text: false,
        },
        session_recording: {
          maskAllInputs: true,
        },
        loaded: (client) => {
          if (process.env.NODE_ENV === "development") {
            console.log("PostHog loaded successfully");
          }
          return client;
        },
      });

      return posthog;
    });
  }

  return clientPromise;
}

export function captureAnalytics(
  eventName: string,
  properties?: Record<string, any>,
) {
  void getAnalyticsClient().then((posthog) => {
    posthog?.capture(eventName, properties);
  });
}

export function identifyAnalytics(
  userId?: string,
  properties?: Record<string, any>,
) {
  void getAnalyticsClient().then((posthog) => {
    posthog?.identify(userId, properties);
  });
}

export function setAnalyticsPersonProperties(properties: Record<string, any>) {
  void getAnalyticsClient().then((posthog) => {
    posthog?.setPersonProperties(properties);
  });
}

export function setAnalyticsPersonPropertiesForFlags(
  properties: Record<string, any>,
) {
  void getAnalyticsClient().then((posthog) => {
    posthog?.setPersonPropertiesForFlags(properties);
  });
}

export function resetAnalytics() {
  void getAnalyticsClient().then((posthog) => {
    posthog?.reset();
  });
}
