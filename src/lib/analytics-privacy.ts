/**
 * Keeps personal data that travels in URLs out of analytics. Some pages
 * carry it in the query string (the email-confirmation page gets
 * `?email=…`), and PostHog sends the full address with every event as
 * `$current_url` and friends. Analytics only needs the page, so every
 * URL-valued property loses its query string and hash before sending.
 */

// $current_url, $initial_current_url, $session_entry_url, $referrer,
// $initial_referrer, $session_entry_referrer, …
const URL_PROPERTY = /(?:url|referrer)$/i;

/** `value` without its query string and hash, when it is an absolute http(s) URL; otherwise unchanged. */
export function withoutQuery(value: unknown): unknown {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function stripProperties(properties: Record<string, unknown> | undefined) {
  if (!properties || typeof properties !== "object") return;
  for (const key of Object.keys(properties)) {
    if (URL_PROPERTY.test(key)) properties[key] = withoutQuery(properties[key]);
  }
}

/**
 * PostHog `before_send`: removes query strings and hashes from URL
 * properties (also in `$set` / `$set_once`). Always returns the event —
 * returning null would drop it.
 */
export function stripUrlQueries<
  T extends { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> },
>(event: T): T {
  if (!event) return event;
  stripProperties(event.properties);
  stripProperties(event.$set);
  stripProperties(event.$set_once);
  return event;
}
