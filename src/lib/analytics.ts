"use client";

import type { AnalyticsEventName, AnalyticsProperties } from "@/lib/analytics.shared";

const analyticsEnabled =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";

export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {}
) {
  if (!analyticsEnabled || typeof window === "undefined") return;

  const body = JSON.stringify({
    eventName,
    locale: document.documentElement.lang === "ar" ? "ar" : "en",
    path: window.location.pathname,
    properties,
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
