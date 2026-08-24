export const ANALYTICS_EVENT_NAMES = [
  "language_change",
  "page_view",
  "sample_practice_complete",
  "sample_practice_start",
  "sample_question_answered",
  "signup_click",
  "signup_complete",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsProperties = Record<string, string | number | boolean>;

export const ANALYTICS_PROPERTY_KEYS = new Set([
  "correct",
  "role",
  "source",
  "target_language",
]);
