import type { AnalyticsProperties } from "@/lib/analytics.shared";

export type AnalyticsSection = "admin" | "auth" | "public" | "student" | "teacher" | "other";

export function classifyAnalyticsSection(path: string): AnalyticsSection {
  if (path === "/" || path === "/sample-lesson" || path === "/privacy" || path === "/terms" || path === "/tutor") {
    return "public";
  }
  if (path.startsWith("/auth/")) return "auth";
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/teacher" || path.startsWith("/teacher/")) return "teacher";
  if (
    path === "/dashboard" ||
    path.startsWith("/lessons") ||
    path.startsWith("/practice") ||
    path.startsWith("/homework") ||
    path.startsWith("/progress") ||
    path.startsWith("/diagnostic") ||
    path.startsWith("/settings") ||
    path.startsWith("/exploration-lab")
  ) {
    return "student";
  }
  return "other";
}

export function extractAnalyticsAttribution(
  pageUrl: string,
  referrer: string,
  currentHost: string,
): AnalyticsProperties {
  const properties: AnalyticsProperties = {};

  try {
    const url = new URL(pageUrl);
    const source = url.searchParams.get("utm_source")?.trim();
    const medium = url.searchParams.get("utm_medium")?.trim();
    const campaign = url.searchParams.get("utm_campaign")?.trim();
    if (source) properties.utm_source = source.slice(0, 80);
    if (medium) properties.utm_medium = medium.slice(0, 80);
    if (campaign) properties.utm_campaign = campaign.slice(0, 80);
  } catch {
    // Invalid URLs have no attribution metadata.
  }

  if (referrer) {
    try {
      const referrerHost = new URL(referrer).hostname.toLowerCase();
      if (referrerHost && referrerHost !== currentHost.toLowerCase()) {
        properties.referrer_domain = referrerHost.slice(0, 80);
      }
    } catch {
      // Never retain malformed or full referrer values.
    }
  }

  properties.acquisition_source =
    (properties.utm_source as string | undefined) ||
    (properties.referrer_domain as string | undefined) ||
    "direct";

  return properties;
}
