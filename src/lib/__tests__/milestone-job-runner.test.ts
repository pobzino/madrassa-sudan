import { describe, expect, it, vi } from "vitest";
import { MILESTONE_JOB_LESSON_DEADLINE_MS, runMilestoneJob } from "@/lib/milestones/job-runner";

const lessons = [{ lessonId: "l1" }, { lessonId: "l2" }, { lessonId: "l3" }];
const noSleep = async () => {};

/** A stub server: each lesson starts, is "pending" for `pendingPolls` polls (handing out a verification id on the first), then done. */
function server(options: { pendingPolls?: number; failStart?: (lessonId: string, attempt: number) => Error | null; failPoll?: (lessonId: string) => Error | null } = {}) {
  const polls = new Map<string, number>();
  const starts = new Map<string, number>();
  const calls: Array<Record<string, unknown>> = [];
  const step = vi.fn(async (body: Record<string, unknown>) => {
    calls.push(body);
    if (body.step === "plan") return { lessons };
    if (body.step === "lesson-start") {
      const id = String(body.lesson_id);
      const attempt = starts.get(id) ?? 0;
      starts.set(id, attempt + 1);
      const error = options.failStart?.(id, attempt);
      if (error) throw error;
      polls.set(id, 0);
      return { lessonId: id, generation: `gen-${id}-${attempt}` };
    }
    if (body.step === "lesson-poll") {
      const id = String(body.lesson_id);
      const error = options.failPoll?.(id);
      if (error) throw error;
      const n = (polls.get(id) ?? 0) + 1;
      polls.set(id, n);
      if (n <= (options.pendingPolls ?? 1)) return { status: "pending", verification: n === 1 ? `ver-${id}` : body.verification };
      return { status: "done", result: { lessonId: id, kept: [1], dropped: [], signature: "s" } };
    }
    return { milestone: { id: "m1" }, questionCount: 9, warnings: ["Uneven difficulty mix"] };
  });
  return { step, calls };
}

describe("runMilestoneJob", () => {
  it("plans, starts and polls every lesson, carries the verification id, finishes with the results and reports progress", async () => {
    const { step, calls } = server({ pendingPolls: 2 });
    const progress: Array<[number, number]> = [];
    const outcome = await runMilestoneJob({ step, onProgress: (done, total) => void progress.push([done, total]), parallel: 2, sleep: noSleep });
    expect(outcome).toEqual({ milestoneId: "m1", questionCount: 9, warnings: ["Uneven difficulty mix"], lessonsPlanned: 3, lessonsFailed: 0, lastLessonError: "" });
    expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
    const finish = calls.find((call) => call.step === "finish") as { results: unknown[] };
    expect(finish.results.map((result) => (result as { lessonId: string }).lessonId)).toEqual(["l1", "l2", "l3"]);
    // Three polls per lesson: pending (verifier started), pending, done; the verifier's id rides along after the first.
    const l1Polls = calls.filter((call) => call.step === "lesson-poll" && call.lesson_id === "l1");
    expect(l1Polls).toHaveLength(3);
    expect(l1Polls.map((call) => call.verification)).toEqual([null, "ver-l1", "ver-l1"]);
  });

  it("retries a lesson once when starting it fails, and gives up after two failures", async () => {
    let l2Failures = 0;
    const { step, calls } = server({ failStart: (id) => (id === "l2" && l2Failures++ === 0 ? new Error("rate limited") : null) });
    const outcome = await runMilestoneJob({ step, sleep: noSleep });
    expect(outcome).toMatchObject({ lessonsFailed: 0, lastLessonError: "rate limited" });
    expect(calls.filter((call) => call.step === "lesson-start" && call.lesson_id === "l2")).toHaveLength(2);

    const { step: alwaysFails } = server({ failPoll: (id) => (id === "l3" ? new Error("The model did not finish (failed).") : null) });
    const partial = await runMilestoneJob({ step: alwaysFails, sleep: noSleep });
    expect(partial).toMatchObject({ milestoneId: "m1", lessonsFailed: 1, lastLessonError: "The model did not finish (failed)." });
  });

  it("gives up on a lesson that stays pending past the deadline", async () => {
    let clock = 0;
    const step = vi.fn(async (body: Record<string, unknown>) => {
      if (body.step === "plan") return { lessons: [{ lessonId: "l1" }] };
      if (body.step === "lesson-start") return { generation: "gen" };
      if (body.step === "lesson-poll") return { status: "pending", verification: null };
      throw new Error("finish should not run");
    });
    await expect(
      runMilestoneJob({
        step,
        sleep: async () => {
          clock += MILESTONE_JOB_LESSON_DEADLINE_MS / 2 + 1;
        },
        now: () => clock,
      }),
    ).rejects.toThrow("No lesson's questions came back. The AI did not finish this lesson within 7 minutes.");
  });

  it("fails with the last lesson error when every lesson failed, and names failed lessons when finishing fails", async () => {
    const { step: allFail } = server({ failStart: () => new Error("The AI (x) did not answer within 18 s.") });
    await expect(runMilestoneJob({ step: allFail, sleep: noSleep })).rejects.toThrow("No lesson's questions came back. The AI (x) did not answer within 18 s.");
    const finishFails = vi.fn(async (body: Record<string, unknown>) => {
      if (body.step === "plan") return { lessons };
      if (body.step === "lesson-start") {
        if (body.lesson_id === "l1") throw new Error("boom");
        return { generation: "g" };
      }
      if (body.step === "lesson-poll") return { status: "done", result: { lessonId: body.lesson_id } };
      throw new Error("Too few good questions were generated (6 of the 12 needed).");
    });
    await expect(runMilestoneJob({ step: finishFails, sleep: noSleep })).rejects.toThrow("Too few good questions were generated (6 of the 12 needed). 1 of 3 lessons failed: boom");
    await expect(runMilestoneJob({ step: async () => ({ lessons: [] }), sleep: noSleep })).rejects.toThrow("No lesson in these weeks has a recorded deck yet.");
  });
});
