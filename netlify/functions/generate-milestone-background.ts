// Boss generation (a Big Challenge or the starting boss) as a background job:
// up to 15 minutes, with no page open. The Next route creates the job row and
// calls this function with the shared job secret; this function drives the
// steps through /api/internal/milestones/generate-job (the app's own server
// code, which cannot be bundled here) and writes progress and the outcome to
// the job row with the service key. A failed job keeps its message for the page.

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { runMilestoneJob } from "../../src/lib/milestones/job-runner";

const SECRET_HEADER = "x-milestone-job-secret";
const STEP_PATH = "/api/internal/milestones/generate-job";
/** Each step is one Next request; the app's own caps keep a lesson well inside this. */
const STEP_TIMEOUT_MS = 40_000;

function secretsMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** The app origin this job may call back: the deploy's own URLs, never a body-supplied host elsewhere. */
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
    console.error(JSON.stringify({ event: "milestone_job", phase: "rejected", reason: secret ? "bad secret" : "SLIDE_JOB_SECRET not set" }));
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let payload: { jobId?: unknown; origin?: unknown } = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid payload" }) };
  }
  const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
  if (!jobId) return { statusCode: 400, body: JSON.stringify({ error: "jobId is required" }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { statusCode: 500, body: JSON.stringify({ error: "Missing Supabase configuration" }) };
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await db.from("milestone_generation_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
    if (error) console.error("Milestone job update failed:", jobId, error.message);
  };

  const requestedOrigin = typeof payload.origin === "string" ? payload.origin : "";
  const origin = allowedOrigin(requestedOrigin);
  if (!origin) {
    const message = `The background worker will not call back ${requestedOrigin || "an empty origin"} (known: ${[process.env.URL, process.env.DEPLOY_PRIME_URL].filter(Boolean).join(", ") || "none"}).`;
    console.error(JSON.stringify({ event: "milestone_job", jobId, phase: "failed", message }));
    await update({ status: "failed", message: message.slice(0, 1000), finished_at: new Date().toISOString() });
    return { statusCode: 400, body: JSON.stringify({ error: message }) };
  }

  const step = async (body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
    try {
      const response = await fetch(`${origin}${STEP_PATH}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ jobId, ...body }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.message || data.error || `step ${String(body.step)} answered ${response.status}`);
      return data;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error(`step ${String(body.step)} did not answer within ${STEP_TIMEOUT_MS / 1000} s`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const started = Date.now();
  console.log(JSON.stringify({ event: "milestone_job", jobId, phase: "start" }));
  try {
    await update({ status: "running" });
    const outcome = await runMilestoneJob({
      step,
      onProgress: (done, total) => update({ progress_done: done, progress_total: total }),
    });
    // The finish step marked the job done with the draft's id and warnings; add the lesson tally.
    if (outcome.lessonsFailed) {
      await update({ message: `${outcome.questionCount} questions saved as a draft. ${outcome.lessonsFailed} of ${outcome.lessonsPlanned} lessons gave none: ${outcome.lastLessonError}` });
    }
    console.log(JSON.stringify({ event: "milestone_job", jobId, phase: "done", ms: Date.now() - started, ...outcome }));
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "milestone_job", jobId, phase: "failed", ms: Date.now() - started, message }));
    await update({ status: "failed", message: message.slice(0, 1000), finished_at: new Date().toISOString() });
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
}
