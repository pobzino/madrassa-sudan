import { describe, expect, it, vi } from "vitest";
import { runMilestoneJob } from "@/lib/milestones/job-runner";

const lessons = [{ lessonId: "l1" }, { lessonId: "l2" }, { lessonId: "l3" }];

describe("runMilestoneJob", () => {
  it("plans, runs every lesson (retrying once), finishes with the signed results and reports progress", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let l2Failures = 0;
    const step = vi.fn(async (body: Record<string, unknown>) => {
      calls.push(body);
      if (body.step === "plan") return { lessons };
      if (body.step === "lesson") {
        if (body.lesson_id === "l2" && l2Failures++ === 0) throw new Error("The AI (x) did not answer within 18 s.");
        return { lessonId: body.lesson_id, kept: [1], dropped: [], signature: "s" };
      }
      return { milestone: { id: "m1" }, questionCount: 9, warnings: ["Uneven difficulty mix"] };
    });
    const progress: Array<[number, number]> = [];
    const outcome = await runMilestoneJob({ step, onProgress: (done, total) => void progress.push([done, total]), parallel: 2 });
    expect(outcome).toEqual({ milestoneId: "m1", questionCount: 9, warnings: ["Uneven difficulty mix"], lessonsPlanned: 3, lessonsFailed: 0, lastLessonError: "The AI (x) did not answer within 18 s." });
    expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
    const finish = calls.find((call) => call.step === "finish") as { results: unknown[] };
    expect(finish.results.map((result) => (result as { lessonId: string }).lessonId)).toEqual(["l1", "l2", "l3"]);
    expect(calls.filter((call) => call.step === "lesson")).toHaveLength(4); // l2 twice
  });

  it("gives up on a lesson after two failures and still finishes with the rest", async () => {
    const step = vi.fn(async (body: Record<string, unknown>) => {
      if (body.step === "plan") return { lessons };
      if (body.step === "lesson") {
        if (body.lesson_id === "l3") throw new Error("rate limited");
        return { lessonId: body.lesson_id, kept: [1], dropped: [], signature: "s" };
      }
      expect((body.results as unknown[]).filter(Boolean)).toHaveLength(2);
      return { milestone: { id: "m1" }, questionCount: 6, warnings: [] };
    });
    const outcome = await runMilestoneJob({ step });
    expect(outcome).toMatchObject({ milestoneId: "m1", lessonsFailed: 1, lastLessonError: "rate limited" });
  });

  it("fails with the last lesson error when every lesson failed, and names failed lessons when finishing fails", async () => {
    const allFail = vi.fn(async (body: Record<string, unknown>) => {
      if (body.step === "plan") return { lessons };
      throw new Error("The AI (x) did not answer within 18 s.");
    });
    await expect(runMilestoneJob({ step: allFail })).rejects.toThrow("No lesson's questions came back. The AI (x) did not answer within 18 s.");
    const finishFails = vi.fn(async (body: Record<string, unknown>) => {
      if (body.step === "plan") return { lessons };
      if (body.step === "lesson") {
        if (body.lesson_id === "l1") throw new Error("boom");
        return { lessonId: body.lesson_id };
      }
      throw new Error("Too few good questions were generated (6 of the 12 needed).");
    });
    await expect(runMilestoneJob({ step: finishFails })).rejects.toThrow("Too few good questions were generated (6 of the 12 needed). 1 of 3 lessons failed: boom");
    await expect(runMilestoneJob({ step: async () => ({ lessons: [] }) })).rejects.toThrow("No lesson in these weeks has a recorded deck yet.");
  });
});
