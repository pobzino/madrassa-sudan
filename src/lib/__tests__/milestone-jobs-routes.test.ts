import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./milestone-fake-db";

const IDS = {
  path: "10000000-0000-4000-8000-000000000002",
  admin: "10000000-0000-4000-8000-0000000000ad",
  teacher: "10000000-0000-4000-8000-0000000000bb",
  other: "10000000-0000-4000-8000-0000000000cc",
  lesson: "10000000-0000-4000-8000-0000000000e1",
};

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as { id: string } | null,
  teacherRole: null as string | null,
  fetch: vi.fn(),
  plan: vi.fn(),
  lesson: vi.fn(),
  finish: vi.fn(),
  oneShot: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user }, error: null }),
      getClaims: async () => ({ data: mocks.user ? { claims: { sub: mocks.user.id } } : null, error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ hasServiceRoleConfig: () => true, createServiceClient: () => mocks.admin }));
vi.mock("@/lib/server/teacher-lesson-access", () => ({ getTeacherRole: async () => mocks.teacherRole }));
vi.mock("@/lib/server/milestones/generate", () => ({
  planMilestonePool: mocks.plan,
  generateMilestonePoolLesson: mocks.lesson,
  finishMilestonePool: mocks.finish,
  generateMilestonePool: mocks.oneShot,
}));

import { POST as generateRoute } from "@/app/api/teacher/milestones/generate/route";
import { GET as statusRoute } from "@/app/api/teacher/milestones/generate/status/route";
import { POST as stepRoute } from "@/app/api/internal/milestones/generate-job/route";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const SITE = "https://offline-test--madrassasudan.netlify.app";

function seed() {
  const tables: Record<string, Row[]> = {
    learning_paths: [{ id: IDS.path, subject_id: "s", created_by: IDS.teacher, is_published: true }],
    milestone_generation_jobs: [],
  };
  const { client } = createFakeDb(tables);
  mocks.admin = client;
  return tables;
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const stepReq = (body: unknown, bearer = "job-secret") =>
  new NextRequest(`${SITE}/api/internal/milestones/generate-job`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` } });

beforeEach(() => {
  vi.stubEnv("SLIDE_JOB_SECRET", "job-secret");
  vi.stubEnv("MILESTONE_JOBS_INLINE", "");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 202 });
  mocks.plan.mockReset().mockResolvedValue({ lessons: [{ lessonId: IDS.lesson, titleEn: "L", titleAr: "د" }], skippedLessons: [] });
  mocks.lesson.mockReset().mockResolvedValue({ lessonId: IDS.lesson, kept: [], dropped: [], signature: "sig" });
  mocks.finish.mockReset().mockResolvedValue({ milestoneId: "m-new", assignmentId: "a", questionCount: 12, skippedLessons: [], droppedItems: [], warnings: ["Uneven difficulty mix"] });
  mocks.oneShot.mockReset().mockResolvedValue({ milestoneId: "m-inline", assignmentId: "a", questionCount: 12, skippedLessons: [], droppedItems: [], warnings: [] });
  mocks.user = { id: IDS.admin };
  mocks.teacherRole = "admin";
});

describe("generate as a background job", () => {
  it("on a deployed site creates a queued job, hands it to the background function with the secret, and answers 202", async () => {
    const tables = seed();
    const res = await generateRoute(post(`${SITE}/api/teacher/milestones/generate`, { path_id: IDS.path, kind: "placement" }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(tables.milestone_generation_jobs).toHaveLength(1);
    const job = tables.milestone_generation_jobs[0];
    expect(job).toMatchObject({ id: body.jobId, path_id: IDS.path, kind: "placement", after_week_number: 0, status: "queued", requested_by: IDS.admin });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, { headers: Record<string, string>; body: string }];
    expect(String(url)).toBe(`${SITE}/.netlify/functions/generate-milestone-background`);
    expect(init.headers["x-milestone-job-secret"]).toBe("job-secret");
    expect(JSON.parse(init.body)).toEqual({ jobId: body.jobId, origin: SITE });
    expect(mocks.oneShot).not.toHaveBeenCalled();
  });

  it("refuses a second job for the same boss while one is queued or running", async () => {
    seed();
    expect((await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, kind: "placement" }))).status).toBe(202);
    const again = await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, kind: "placement" }));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "job_running" });
    // a different boss is fine
    expect((await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, after_week_number: 4 }))).status).toBe(202);
  });

  it("marks the job failed and answers 502 when the background function cannot be reached", async () => {
    const tables = seed();
    mocks.fetch.mockResolvedValue({ ok: false, status: 500 });
    const res = await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, kind: "placement" }));
    expect(res.status).toBe(502);
    expect(tables.milestone_generation_jobs[0]).toMatchObject({ status: "failed", message: "The background worker answered 500." });
  });

  it("runs inline (no job) on localhost or when MILESTONE_JOBS_INLINE=1", async () => {
    const tables = seed();
    mocks.oneShot.mockResolvedValue({ milestoneId: "m-inline", assignmentId: "a", questionCount: 12, skippedLessons: [], droppedItems: [], warnings: [] });
    // the one-shot result needs a milestone row for teacherMilestoneRow; the route loads it by id
    tables.learning_path_milestones = [{ id: "m-inline", path_id: IDS.path, after_week_number: 0, kind: "placement", status: "draft", assignment_id: "a", title_ar: "", title_en: "", battle_question_count: 12, boss_key: "x" }];
    tables.homework_questions = [];
    tables.milestone_battles = [];
    tables.learner_certificates = [];
    const local = await generateRoute(post("http://localhost/x", { path_id: IDS.path, kind: "placement" }));
    expect(local.status).not.toBe(202);
    expect(mocks.oneShot).toHaveBeenCalledTimes(1);
    expect(tables.milestone_generation_jobs).toHaveLength(0);
    vi.stubEnv("MILESTONE_JOBS_INLINE", "1");
    await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, kind: "placement" }));
    expect(mocks.oneShot).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("job status", () => {
  it("is readable by its requester and any approved admin, not by another teacher; validates the id", async () => {
    const tables = seed();
    mocks.user = { id: IDS.teacher };
    mocks.teacherRole = "teacher";
    const created = await (await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, kind: "placement" }))).json();
    tables.milestone_generation_jobs[0].progress_done = 3;
    tables.milestone_generation_jobs[0].progress_total = 12;
    const mine = await statusRoute(new Request(`${SITE}/s?job=${created.jobId}`));
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ jobId: created.jobId, status: "queued", progressDone: 3, progressTotal: 12, kind: "placement", afterWeekNumber: 0, warnings: [] });
    mocks.user = { id: IDS.other };
    expect((await statusRoute(new Request(`${SITE}/s?job=${created.jobId}`))).status).toBe(404);
    mocks.user = { id: IDS.admin };
    mocks.teacherRole = "admin";
    expect((await statusRoute(new Request(`${SITE}/s?job=${created.jobId}`))).status).toBe(200);
    expect((await statusRoute(new Request(`${SITE}/s?job=nope`))).status).toBe(400);
    mocks.user = null;
    expect((await statusRoute(new Request(`${SITE}/s?job=${created.jobId}`))).status).toBe(401);
  });
});

describe("internal step route", () => {
  async function queuedJob() {
    const tables = seed();
    const created = await (await generateRoute(post(`${SITE}/x`, { path_id: IDS.path, kind: "placement" }))).json();
    return { tables, jobId: created.jobId as string };
  }

  it("needs the job secret", async () => {
    const { jobId } = await queuedJob();
    expect((await stepRoute(stepReq({ jobId, step: "plan" }, "wrong"))).status).toBe(401);
    expect((await stepRoute(new NextRequest(`${SITE}/i`, { method: "POST", body: JSON.stringify({ jobId, step: "plan" }) }))).status).toBe(401);
  });

  it("plan marks the job running with the lesson count; lesson runs with the job's scope; finish marks it done with the draft and warnings", async () => {
    const { tables, jobId } = await queuedJob();
    const plan = await stepRoute(stepReq({ jobId, step: "plan" }));
    expect(plan.status).toBe(200);
    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({ pathId: IDS.path, kind: "placement", afterWeekNumber: 0 }));
    expect(tables.milestone_generation_jobs[0]).toMatchObject({ status: "running", progress_total: 1, progress_done: 0 });

    const lesson = await stepRoute(stepReq({ jobId, step: "lesson", lesson_id: IDS.lesson }));
    expect(lesson.status).toBe(200);
    expect(mocks.lesson).toHaveBeenCalledWith(expect.objectContaining({ pathId: IDS.path, lessonId: IDS.lesson }));

    const finish = await stepRoute(stepReq({ jobId, step: "finish", results: [await lesson.json()] }));
    expect(finish.status).toBe(200);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ actorId: IDS.admin, results: [expect.objectContaining({ signature: "sig" })] }));
    expect(tables.milestone_generation_jobs[0]).toMatchObject({ status: "done", milestone_id: "m-new", warnings: ["Uneven difficulty mix"], message: "12 questions saved as a draft." });
    expect(tables.milestone_generation_jobs[0].finished_at).toBeTruthy();
    // a finished job takes no more steps
    expect((await stepRoute(stepReq({ jobId, step: "plan" }))).status).toBe(409);
  });

  it("reports a step's failure with its message and leaves the job to the function to mark", async () => {
    const { tables, jobId } = await queuedJob();
    mocks.lesson.mockRejectedValue(Object.assign(new Error("The AI (gpt-5.6-luna) did not answer within 18 s."), { code: "ai_timeout" }));
    const res = await stepRoute(stepReq({ jobId, step: "lesson", lesson_id: IDS.lesson }));
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ error: "generation_failed", message: "The AI (gpt-5.6-luna) did not answer within 18 s." });
    expect(tables.milestone_generation_jobs[0].status).toBe("queued");
  });
});
