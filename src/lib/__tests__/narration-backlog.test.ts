import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./milestone-fake-db";

const mocks = vi.hoisted(() => ({ admin: null as unknown, user: null as { id: string } | null, teacherRole: null as string | null, fetch: vi.fn() }));
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

import { narrationBacklogSummary, runNarrationBatch } from "@/lib/server/narration-backlog";
import { questionNarration, type NarratableQuestion } from "@/lib/server/question-audio";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/narration/route";

type Row = Record<string, unknown>;
const q = (id: string, assignment_id: string, extra: Row = {}): Row => ({
  id, assignment_id, question_text_ar: `سؤال ${id}`, question_text_en: `Question ${id}`, instruction_ar: null, instruction_en: null,
  question_content: null, question_content_language: null, answer_language: null, options: ["1", "2"], options_ar: null, options_en: null,
  audio_url_ar: null, audio_url_en: null, audio_text_hash_ar: null, audio_text_hash_en: null, source_lesson_id: null, ...extra,
});

function seed() {
  const tables: Record<string, Row[]> = {
    homework_assignments: [
      { id: "a-practice", is_practice: true, is_milestone: false, is_published: true, lesson_id: "lesson-1" },
      { id: "a-boss", is_practice: false, is_milestone: true, is_published: true, lesson_id: null },
      { id: "a-draft", is_practice: true, is_milestone: false, is_published: false, lesson_id: "lesson-1" },
      { id: "a-other", is_practice: false, is_milestone: false, is_published: true, lesson_id: "lesson-1" },
    ],
    homework_questions: [
      q("p1", "a-practice"), q("p2", "a-practice"),
      q("b1", "a-boss", { source_lesson_id: "lesson-1" }),
      q("d1", "a-draft"), q("o1", "a-other"),
    ],
    lesson_slides: [{ lesson_id: "lesson-1", language_mode: "both" }],
  };
  const { client } = createFakeDb(tables);
  mocks.admin = client;
  return { tables, client };
}

beforeEach(() => {
  vi.stubEnv("SLIDE_JOB_SECRET", "job-secret");
  vi.stubEnv("ELEVENLABS_API_KEY", "el-key");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });
  mocks.user = { id: "admin-1" };
  mocks.teacherRole = "admin";
});

describe("narration backlog", () => {
  it("counts every published Practice and boss question in both languages, skipping drafts and other assignments", async () => {
    const { client } = seed();
    const summary = await narrationBacklogSummary(client as never);
    expect(summary.pairs).toBe(6);
    expect(summary.missing).toEqual({ battle: 2, practice: 4, ar: 3, en: 3, total: 6 });
    // a boss clip is the key line only: "Question b1" (11), not the options
    expect(summary.charsMissing).toBeGreaterThan(0);
  });

  it("voices bosses first, a few at a time, marks each row and shrinks the backlog; a cached clip is not billed", async () => {
    const { tables, client } = seed();
    const calls: Array<{ id: string; lang: string; promptOnly: boolean }> = [];
    const narrate = vi.fn(async (_admin: unknown, question: NarratableQuestion, lang: "ar" | "en", mode: unknown, options: { promptOnly: boolean }) => {
      calls.push({ id: question.id, lang, promptOnly: options.promptOnly });
      const { hash } = questionNarration(question, lang, mode as never, undefined, options.promptOnly);
      const row = tables.homework_questions.find((r) => r.id === question.id)!;
      row[`audio_url_${lang}`] = `https://cdn/${question.id}-${lang}.mp3`;
      row[`audio_text_hash_${lang}`] = hash;
      return { audioUrl: `https://cdn/${question.id}-${lang}.mp3`, cached: question.id === "p2" };
    });
    const first = await runNarrationBatch(client as never, 3, narrate as never);
    expect(first).toMatchObject({ done: 3, failed: 0, remaining: 3 });
    expect(calls.slice(0, 2).every((call) => call.id === "b1" && call.promptOnly)).toBe(true);
    expect(calls[2].promptOnly).toBe(false);
    const second = await runNarrationBatch(client as never, 10, narrate as never);
    expect(second).toMatchObject({ done: 3, failed: 0, remaining: 0 });
    expect(second.charsBilled).toBeLessThan(first.charsBilled + 100);
    expect((await narrationBacklogSummary(client as never)).missing.total).toBe(0);
  });

  it("keeps going past a failed clip and reports it", async () => {
    const { client } = seed();
    const narrate = vi.fn(async (_a: unknown, question: NarratableQuestion) =>
      question.id === "b1" ? { error: "quota exceeded", status: 402 } : { audioUrl: "u", cached: false });
    const result = await runNarrationBatch(client as never, 4, narrate as never);
    expect(result.failed).toBe(2);
    expect(result.done).toBe(2);
    expect(result.errors[0]).toContain("quota exceeded");
  });
});

describe("admin narration route", () => {
  it("is for approved admins only; GET reports the backlog, POST starts the worker with the secret", async () => {
    seed();
    mocks.fetch.mockImplementation(async (url: URL | string) =>
      String(url).includes("elevenlabs") ? { ok: true, json: async () => ({ character_count: 100, character_limit: 1000 }) } : { ok: true, status: 202 });
    const get = await adminGet();
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ backlog: { missing: { total: 6 } }, plan: { used: 100, limit: 1000 }, configured: true });
    const post = await adminPost(new Request("https://amalschool.org/api/admin/narration", { method: "POST" }));
    expect(post.status).toBe(202);
    const call = mocks.fetch.mock.calls.find(([url]) => String(url).includes("narrate-backlog-background")) as [URL, { headers: Record<string, string>; body: string }];
    expect(call[1].headers["x-milestone-job-secret"]).toBe("job-secret");
    expect(JSON.parse(call[1].body)).toEqual({ origin: "https://amalschool.org" });
    mocks.teacherRole = "teacher";
    expect((await adminGet()).status).toBe(403);
    mocks.user = null;
    expect((await adminGet()).status).toBe(401);
  });
});
