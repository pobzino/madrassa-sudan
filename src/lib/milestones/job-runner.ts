// The order of work for one boss-generation job: plan, then each lesson's
// questions, then finish (writes the draft). A lesson is started on OpenAI's
// side ("lesson-start") and polled ("lesson-poll") until it settles, so the
// model may think for minutes while every server request stays short.
// Plain code with no server imports: the Netlify background function runs it
// against the app's internal step route, and tests run it against a stub.

export interface MilestoneJobStep {
  /** One step: resolves to the route's JSON, rejects with an Error whose message names the cause. */
  (body: Record<string, unknown>): Promise<unknown>;
}

export interface MilestoneJobOutcome {
  milestoneId: string | null;
  questionCount: number;
  warnings: string[];
  lessonsPlanned: number;
  lessonsFailed: number;
  /** The last lesson failure's message, for the final report. */
  lastLessonError: string;
}

/** Lessons in flight at once (each is a background response on OpenAI's side). */
export const MILESTONE_JOB_PARALLEL_LESSONS = 6;
/** How often a lesson is polled, and how long one lesson may take before it is retried. */
export const MILESTONE_JOB_POLL_MS = 4_000;
export const MILESTONE_JOB_LESSON_DEADLINE_MS = 7 * 60 * 1000;

type PollReply = { status?: "pending" | "done"; verification?: string | null; result?: unknown };

export async function runMilestoneJob({
  step,
  onProgress,
  parallel = MILESTONE_JOB_PARALLEL_LESSONS,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}: {
  step: MilestoneJobStep;
  /** Called after each lesson finishes (succeeded or gave up). */
  onProgress?: (done: number, total: number) => Promise<void> | void;
  parallel?: number;
  /** Injected in tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<MilestoneJobOutcome> {
  const plan = (await step({ step: "plan" })) as { lessons?: Array<{ lessonId: string }> };
  const lessons = Array.isArray(plan.lessons) ? plan.lessons : [];
  if (!lessons.length) throw new Error("No lesson in these weeks has a recorded deck yet.");
  await onProgress?.(0, lessons.length);

  /** One attempt at a lesson: start it, then poll until it settles or the deadline passes. */
  const runLesson = async (lessonId: string): Promise<unknown> => {
    const started = (await step({ step: "lesson-start", lesson_id: lessonId })) as { generation?: string };
    if (!started.generation) throw new Error("The writer did not start.");
    const deadline = now() + MILESTONE_JOB_LESSON_DEADLINE_MS;
    let verification: string | null = null;
    for (;;) {
      await sleep(MILESTONE_JOB_POLL_MS);
      const reply = (await step({ step: "lesson-poll", lesson_id: lessonId, generation: started.generation, verification })) as PollReply;
      if (reply.status === "done") return reply.result ?? null;
      if (reply.verification) verification = reply.verification;
      if (now() > deadline) throw new Error(`The AI did not finish this lesson within ${Math.round(MILESTONE_JOB_LESSON_DEADLINE_MS / 60000)} minutes.`);
    }
  };

  const results: unknown[] = new Array(lessons.length).fill(null);
  let done = 0;
  let next = 0;
  let lastLessonError = "";
  const worker = async () => {
    while (next < lessons.length) {
      const index = next;
      next += 1;
      // One retry; a lesson that still fails is skipped, like the server does.
      for (let attempt = 0; attempt < 2 && results[index] === null; attempt += 1) {
        try {
          results[index] = await runLesson(lessons[index].lessonId);
        } catch (error) {
          lastLessonError = error instanceof Error ? error.message : String(error);
        }
      }
      done += 1;
      await onProgress?.(done, lessons.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, lessons.length)) }, worker));

  const failed = results.filter((result) => result === null).length;
  if (failed === lessons.length) throw new Error(`No lesson's questions came back. ${lastLessonError}`.trim());

  let saved: { milestone?: { id?: string }; warnings?: string[]; questionCount?: number };
  try {
    saved = (await step({ step: "finish", results })) as typeof saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Saving the draft failed.";
    throw new Error(failed ? `${message} ${failed} of ${lessons.length} lessons failed: ${lastLessonError}` : message);
  }
  return {
    milestoneId: saved.milestone?.id ?? null,
    questionCount: saved.questionCount ?? 0,
    warnings: Array.isArray(saved.warnings) ? saved.warnings : [],
    lessonsPlanned: lessons.length,
    lessonsFailed: failed,
    lastLessonError,
  };
}
