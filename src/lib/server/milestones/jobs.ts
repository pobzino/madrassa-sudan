import "server-only";

import { randomUUID } from "node:crypto";

// Boss generation as a background job: the row in milestone_generation_jobs,
// the hand-off to the Netlify background function, and the step the function
// drives through the internal route. See 20261018130000_milestone_generation_jobs.sql.

import type { MilestoneKind } from "@/lib/milestones/types";
import {
  finishMilestonePool,
  generateMilestonePoolLesson,
  planMilestonePool,
  type GenerateMilestonePoolResult,
  pollMilestoneLesson,
  startMilestoneLesson,
} from "@/lib/server/milestones/generate";
import { MilestoneRouteError, type MilestoneAdminClient } from "@/lib/server/milestones/load";

export const JOB_SECRET_HEADER = "x-milestone-job-secret";
export const BACKGROUND_FUNCTION_PATH = "/.netlify/functions/generate-milestone-background";
/**
 * A job is treated as dead when it stays queued this long without the function
 * picking it up (a plan step marks it running within seconds), or running this
 * long without a progress update (lessons report every 10-30 s).
 */
export const JOB_QUEUED_STALE_MS = 2 * 60 * 1000;
export const JOB_RUNNING_STALE_MS = 10 * 60 * 1000;

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface GenerationJobRow {
  id: string;
  path_id: string;
  kind: MilestoneKind;
  after_week_number: number;
  is_final?: boolean;
  pool_size: number;
  requested_by: string | null;
  status: JobStatus;
  progress_done: number;
  progress_total: number;
  message: string | null;
  warnings: string[];
  milestone_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface GenerationJobScope {
  pathId: string;
  kind: MilestoneKind;
  afterWeekNumber: number;
  /** The path's final boss (kind "milestone"; the plan sets the week). */
  final?: boolean;
  poolSize: number;
}

/** The secret the Next routes and the background function share (the slide job's; one secret per site). */
export function jobSecret(): string | null {
  return process.env.SLIDE_JOB_SECRET?.trim() || null;
}

/**
 * Whether a tap on Generate hands the work to the background function. Local
 * development (no Netlify functions) and tests run the generator inline.
 */
export function backgroundGenerationEnabled(requestUrl: string): boolean {
  if (process.env.MILESTONE_JOBS_INLINE === "1") return false;
  if (!jobSecret()) return false;
  let hostname = "";
  try {
    hostname = new URL(requestUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]" && !hostname.endsWith(".localhost");
}

export async function expireStaleJobs(admin: MilestoneAdminClient): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from("milestone_generation_jobs")
    .update({ status: "failed", message: "The background worker never picked this up. Try again; if it repeats, the job secret is not set on the site.", finished_at: now, updated_at: now })
    .eq("status", "queued")
    .lt("updated_at", new Date(Date.now() - JOB_QUEUED_STALE_MS).toISOString());
  await admin
    .from("milestone_generation_jobs")
    .update({ status: "failed", message: "Generation stopped before it finished. Try again.", finished_at: now, updated_at: now })
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - JOB_RUNNING_STALE_MS).toISOString());
}

/** Creates the queued row. Rejects with job_running when one is already queued / running for this boss. */
export async function createGenerationJob(
  admin: MilestoneAdminClient,
  scope: GenerationJobScope,
  requestedBy: string,
): Promise<GenerationJobRow> {
  await expireStaleJobs(admin);
  // A friendlier answer than the unique index's error (which still guards the race).
  const { data: active } = await admin
    .from("milestone_generation_jobs")
    .select("id")
    .eq("path_id", scope.pathId)
    .eq("kind", scope.kind)
    .eq("after_week_number", scope.afterWeekNumber)
    .eq("is_final", scope.final === true)
    .in("status", ["queued", "running"])
    .limit(1);
  if (Array.isArray(active) && active.length) {
    throw new MilestoneRouteError("job_running", 409, "This boss is already being generated. Wait for it to finish.");
  }
  const { data, error } = await admin
    .from("milestone_generation_jobs")
    .insert({
      id: randomUUID(),
      path_id: scope.pathId,
      kind: scope.kind,
      after_week_number: scope.afterWeekNumber,
      is_final: scope.final === true,
      pool_size: scope.poolSize,
      requested_by: requestedBy,
      status: "queued",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) {
    const message = String(error?.message ?? "");
    if (error?.code === "23505" || /milestone_generation_jobs_one_active|duplicate key/i.test(message)) {
      throw new MilestoneRouteError("job_running", 409, "This boss is already being generated. Wait for it to finish.");
    }
    throw new Error(message || "Could not create the generation job");
  }
  return data as GenerationJobRow;
}

export async function loadGenerationJob(admin: MilestoneAdminClient, jobId: string): Promise<GenerationJobRow | null> {
  const { data } = await admin.from("milestone_generation_jobs").select("*").eq("id", jobId).maybeSingle();
  return (data as GenerationJobRow | null) ?? null;
}

export async function updateGenerationJob(
  admin: MilestoneAdminClient,
  jobId: string,
  patch: Partial<Pick<GenerationJobRow, "status" | "progress_done" | "progress_total" | "message" | "warnings" | "milestone_id" | "finished_at">>,
): Promise<void> {
  const { error } = await admin
    .from("milestone_generation_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

/**
 * Hands the job to the Netlify background function. Background functions
 * answer 202 at once; the fetch is capped so this route never waits on the
 * work itself. Rejects with a message when the function could not be reached.
 */
export async function enqueueGenerationJob(requestUrl: string, jobId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const secret = jobSecret();
  if (!secret) throw new Error("Background generation is not configured on this server.");
  const origin = new URL(requestUrl).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(new URL(BACKGROUND_FUNCTION_PATH, origin), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", [JOB_SECRET_HEADER]: secret },
      body: JSON.stringify({ jobId, origin }),
    });
    if (!response.ok) throw new Error(`The background worker answered ${response.status}.`);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      // Netlify acknowledged late; the worker usually has the job by now and the page polls either way.
      console.warn("Milestone job enqueue timed out; assuming the worker took it", jobId);
      return;
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

export type GenerationStepBody =
  | { step: "plan" }
  | { step: "lesson"; lesson_id: string }
  | { step: "lesson-start"; lesson_id: string }
  | { step: "lesson-poll"; lesson_id: string; generation: string; verification?: string | null }
  | { step: "finish"; results: unknown[] };

/**
 * One step of a job, run with the job's own scope and requester (the internal
 * route calls this for the background function). Progress is the function's
 * to record; "finish" marks the job done here so the outcome and the draft land together.
 */
export async function runGenerationStep(admin: MilestoneAdminClient, job: GenerationJobRow, body: GenerationStepBody): Promise<unknown> {
  const scope = { admin, pathId: job.path_id, afterWeekNumber: job.after_week_number, kind: job.kind, final: job.is_final === true, poolSize: job.pool_size };
  if (body.step === "plan") {
    const plan = await planMilestonePool(scope);
    await updateGenerationJob(admin, job.id, { status: "running", progress_done: 0, progress_total: plan.lessons.length });
    return plan;
  }
  if (body.step === "lesson") {
    return generateMilestonePoolLesson({ ...scope, lessonId: body.lesson_id });
  }
  // The background path: the model works on OpenAI's side between these two short steps.
  if (body.step === "lesson-start") {
    return startMilestoneLesson({ ...scope, lessonId: body.lesson_id });
  }
  if (body.step === "lesson-poll") {
    return pollMilestoneLesson({ ...scope, lessonId: body.lesson_id, generation: body.generation, verification: body.verification ?? null });
  }
  const result: GenerateMilestonePoolResult = await finishMilestonePool({
    ...scope,
    actorId: job.requested_by ?? "",
    results: body.results as never,
  });
  await updateGenerationJob(admin, job.id, {
    status: "done",
    milestone_id: result.milestoneId,
    warnings: result.warnings,
    message: `${result.questionCount} questions saved as a draft.`,
    finished_at: new Date().toISOString(),
  });
  return { milestone: { id: result.milestoneId }, questionCount: result.questionCount, warnings: result.warnings, skippedLessons: result.skippedLessons };
}
