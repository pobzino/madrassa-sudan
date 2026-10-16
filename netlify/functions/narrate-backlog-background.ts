// Drains the narration backlog (every published Practice and boss question,
// both languages) in the background: up to 15 minutes, batch after batch
// through /api/internal/narration/backlog. Started from the admin page.

import { timingSafeEqual } from "node:crypto";

const SECRET_HEADER = "x-milestone-job-secret";
const STEP_PATH = "/api/internal/narration/backlog";
const BATCH = 10;
const BUDGET_MS = 13 * 60 * 1000;

function secretsMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function allowedOrigin(requested: string): string | null {
  let origin: URL;
  try {
    origin = new URL(requested);
  } catch {
    return null;
  }
  if (origin.protocol !== "https:") return null;
  const known = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
  if (known.includes(origin.origin)) return origin.origin;
  const site = process.env.SITE_NAME;
  if (site && origin.hostname.endsWith(`--${site}.netlify.app`)) return origin.origin;
  return null;
}

export async function handler(event: { headers: Record<string, string | undefined>; body: string | null }) {
  const secret = process.env.SLIDE_JOB_SECRET?.trim() || "";
  const supplied = event.headers[SECRET_HEADER] || event.headers[SECRET_HEADER.toUpperCase()] || "";
  if (!secret || !secretsMatch(secret, supplied)) {
    console.error(JSON.stringify({ event: "narration_job", phase: "rejected" }));
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  let payload: { origin?: unknown } = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid payload" }) };
  }
  const origin = allowedOrigin(typeof payload.origin === "string" ? payload.origin : "");
  if (!origin) return { statusCode: 400, body: JSON.stringify({ error: "unknown origin" }) };

  const started = Date.now();
  let batches = 0;
  let done = 0;
  let failed = 0;
  let stalled = 0;
  console.log(JSON.stringify({ event: "narration_job", phase: "start" }));
  while (Date.now() - started < BUDGET_MS) {
    const response = await fetch(`${origin}${STEP_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ limit: BATCH }),
    }).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "narration_job", phase: "step_error", message: String(error) }));
      return null;
    });
    if (!response || !response.ok) {
      stalled += 1;
      if (stalled >= 3) break;
      continue;
    }
    const batch = (await response.json()) as { done: number; failed: number; remaining: number; errors?: string[] };
    batches += 1;
    done += batch.done;
    failed += batch.failed;
    console.log(JSON.stringify({ event: "narration_job", phase: "batch", batches, ...batch }));
    if (batch.remaining <= 0) break;
    // Nothing moved twice in a row (e.g. the key is out of quota): stop rather than loop.
    stalled = batch.done === 0 ? stalled + 1 : 0;
    if (stalled >= 2) break;
  }
  console.log(JSON.stringify({ event: "narration_job", phase: "end", batches, done, failed, ms: Date.now() - started }));
  return { statusCode: 200, body: JSON.stringify({ batches, done, failed }) };
}
