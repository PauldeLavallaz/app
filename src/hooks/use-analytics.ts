import { useCallback } from "react";
import {
  captureAnalytics,
  getAnalyticsClient,
  identifyAnalytics,
  isAnalyticsConfigured,
  resetAnalytics,
  setAnalyticsPersonProperties,
  setAnalyticsPersonPropertiesForFlags,
} from "@/lib/analytics-client";

/**
 * Custom hook for PostHog analytics with safe fallbacks
 * This hook provides a safe interface to PostHog analytics that gracefully handles
 * cases where PostHog is not initialized (e.g., when VITE_PUBLIC_POSTHOG_KEY is not set)
 */
export function useAnalytics() {
  const isEnabled = isAnalyticsConfigured;

  const track = useCallback(
    (eventName: string, properties?: Record<string, any>) => {
      if (!isEnabled) return;
      captureAnalytics(eventName, properties);
    },
    [isEnabled],
  );

  const identify = useCallback(
    (userId: string, properties?: Record<string, any>) => {
      if (!isEnabled) return;
      identifyAnalytics(userId, properties);
    },
    [isEnabled],
  );

  const setPersonPropertiesSafe = useCallback(
    (properties: Record<string, any>) => {
      if (!isEnabled) return;
      setAnalyticsPersonProperties(properties);
    },
    [isEnabled],
  );

  const setPersonPropertiesForFlagsSafe = useCallback(
    (properties: Record<string, any>) => {
      if (!isEnabled) return;
      setAnalyticsPersonPropertiesForFlags(properties);
    },
    [isEnabled],
  );

  const reset = useCallback(() => {
    if (!isEnabled) return;
    resetAnalytics();
  }, [isEnabled]);

  const isFeatureEnabled = useCallback(
    (flagKey: string, defaultValue = false) => {
      if (!isEnabled) return defaultValue;
      void getAnalyticsClient().then((posthog) =>
        posthog?.isFeatureEnabled(flagKey),
      );
      return defaultValue;
    },
    [isEnabled],
  );

  const getFeatureFlag = useCallback(
    (flagKey: string, defaultValue?: any) => {
      if (!isEnabled) return defaultValue;
      void getAnalyticsClient().then((posthog) =>
        posthog?.getFeatureFlag(flagKey),
      );
      return defaultValue;
    },
    [isEnabled],
  );

  return {
    track,
    identify,
    setPersonProperties: setPersonPropertiesSafe,
    setPersonPropertiesForFlags: setPersonPropertiesForFlagsSafe,
    reset,
    isFeatureEnabled,
    getFeatureFlag,
    isEnabled,
    posthog: null,
  };
}
