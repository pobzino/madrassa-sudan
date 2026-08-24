"use client";

import type { AnalyticsEventName, AnalyticsProperties } from "@/lib/analytics.shared";
import { extractAnalyticsAttribution } from "@/lib/analytics.metadata";

const analyticsEnabled =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";

const ATTRIBUTION_STORAGE_KEY = "amal_analytics_attribution";

function getAttribution(): AnalyticsProperties {
  if (typeof window === "undefined") return {};

  const current = extractAnalyticsAttribution(
    window.location.href,
    document.referrer,
    window.location.hostname,
  );
  const hasCampaignOrReferrer = current.utm_source || current.referrer_domain;

  try {
    if (hasCampaignOrReferrer) {
      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(current));
      return current;
    }

    const stored = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AnalyticsProperties;
      return parsed && typeof parsed === "object" ? parsed : current;
    }
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }

  return current;
}

export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {}
) {
  if (!analyticsEnabled || typeof window === "undefined") return;

  const body = JSON.stringify({
    eventName,
    locale: document.documentElement.lang === "ar" ? "ar" : "en",
    path: window.location.pathname,
    properties: {
      ...getAttribution(),
      ...properties,
    },
  });

  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt learning or navigation.
  });
}
