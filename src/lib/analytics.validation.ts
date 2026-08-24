import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_PROPERTY_KEYS,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "@/lib/analytics.shared";

const eventNames = new Set<string>(ANALYTICS_EVENT_NAMES);

export type AnalyticsPayload = {
  eventName: AnalyticsEventName;
  locale: "ar" | "en";
  path: string;
  properties: AnalyticsProperties;
};

export function parseAnalyticsPayload(value: unknown): AnalyticsPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  if (typeof input.eventName !== "string" || !eventNames.has(input.eventName)) return null;
  if (typeof input.path !== "string" || !input.path.startsWith("/") || input.path.length > 240) return null;

  const properties: AnalyticsProperties = {};
  if (input.properties && typeof input.properties === "object" && !Array.isArray(input.properties)) {
    for (const [key, propertyValue] of Object.entries(input.properties)) {
      if (!ANALYTICS_PROPERTY_KEYS.has(key)) continue;
      if (
        typeof propertyValue === "string" ||
        typeof propertyValue === "number" ||
        typeof propertyValue === "boolean"
      ) {
        properties[key] = typeof propertyValue === "string"
          ? propertyValue.slice(0, 80)
          : propertyValue;
      }
    }
  }

  return {
    eventName: input.eventName as AnalyticsEventName,
    locale: input.locale === "ar" ? "ar" : "en",
    path: input.path,
    properties,
  };
}
