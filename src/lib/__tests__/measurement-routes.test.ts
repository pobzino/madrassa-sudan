import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./milestone-fake-db";
import { inverse } from "@/lib/server/milestones/interactions";
import { servedItem, type MilestonePoolQuestion } from "@/lib/server/milestones/present";
import { mcQuestion } from "./milestone-fixtures";

const IDS = {
  placement: "10000000-0000-4000-8000-0000000000a1",
  milestone: "10000000-0000-4000-8000-000000000001",
  path: "10000000-0000-4000-8000-000000000002",
  subject: "10000000-0000-4000-8000-000000000003",
  assignment: "10000000-0000-4000-8000-000000000004",
  learner: "10000000-0000-4000-8000-000000000005",
  parent: "10000000-0000-4000-8000-000000000006",
  cohort: "10000000-0000-4000-8000-000000000007",
  request: "10000000-0000-4000-8000-000000000008",
};

const mocks = vi.hoisted(() => ({
  context: null as unknown,
  contextResponse: null as Response | null,
  admin: null as unknown,
  tree: null as unknown,
  teacherRole: null as string | null,
  user: null as { id: string } | null,
  afterCallbacks: [] as Array<() => unknown>,
  notifyPlacement: vi.fn(async () => ({ status: "sent" })),
  notifyMilestone: vi.fn(async () => ({ status: "sent" })),
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcOverride: null as null | ((name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null } | null),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => {
    mocks.afterCallbacks.push(callback);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) } }),
}));
vi.mock("@/lib/supabase/service", () => ({ hasServiceRoleConfig: () => true, createServiceClient: () => mocks.admin }));
vi.mock("@/lib/server/learner-context", () => ({
  getLearnerContextResult: async () => (mocks.contextResponse ? { context: null, response: mocks.contextResponse } : { context: mocks.context, response: null }),
}));
vi.mock("@/lib/server/learner-admin", () => ({ createOwnedLearnerAdminClient: async () => ({ admin: mocks.admin, error: null }) }));
vi.mock("@/lib/server/teacher-lesson-access", () => ({ getTeacherRole: async () => mocks.teacherRole }));
vi.mock("@/lib/lessons/useLearningPath", () => ({ loadSubjectLearningPath: async () => mocks.tree }));
vi.mock("@/lib/server/measurement/notify", () => ({ notifyPlacementDone: mocks.notifyPlacement }));
vi.mock("@/lib/server/milestones/notify", () => ({ notifyMilestonePassed: mocks.notifyMilestone }));

import { GET as intro } from "@/app/api/milestones/[id]/route";
import { POST as startBattle } from "@/app/api/milestones/[id]/battle/route";
import { POST as hint } from "@/app/api/milestones/[id]/battle/hint/route";
import { POST as answer } from "@/app/api/milestones/battles/[battleId]/answer/route";
import { GET as bossBook } from "@/app/api/milestones/boss-book/route";
import { GET as teacherList } from "@/app/api/teacher/milestones/route";
import { GET as teacherDetail, PUT as teacherPut } from "@/app/api/teacher/milestones/[id]/route";
import { POST as generateRoute } from "@/app/api/teacher/milestones/generate/route";
import { POST as publishRoute } from "@/app/api/teacher/milestones/[id]/publish/route";
import { GET as impact } from "@/app/api/teacher/measurement/impact/route";
import { GET as scopes } from "@/app/api/teacher/measurement/scopes/route";
import { GET as exportRoute } from "@/app/api/admin/measurement/export/route";
import { GET as progress } from "@/app/api/measurement/progress/route";
import { POST as reset } from "@/app/api/teacher/measurement/placement/reset/route";
import { GET as learnerClasses } from "@/app/api/learners/[id]/classes/route";
import { POST as joinClass } from "@/app/api/learners/classes/join/route";
import { POST as leaveClass } from "@/app/api/learners/classes/leave/route";
import { GET as classProgress } from "@/app/api/teacher/cohorts/[id]/progress/route";
import { POST as decide } from "@/app/api/teacher/cohorts/[id]/requests/[requestId]/route";
import { GET as schoolOverview } from "@/app/api/school/overview/route";
import { mapMilestoneRpcError } from "@/lib/server/milestones/load";
import { clearSkillCache } from "@/lib/server/measurement/skills";
import { csvField, funderExportCsv, parseImpactQuery } from "@/lib/server/measurement/query";
import type { FunderExport } from "@/lib/measurement/types";

type Row = Record<string, unknown>;

function placementPool(): MilestonePoolQuestion[] {
  return Array.from({ length: 15 }, (_, i) => ({
    ...mcQuestion({
      id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      assignment_id: IDS.assignment,
      source_lesson_id: `lesson-${i % 4}`,
      question_text_ar: `سؤال ${i}`,
      question_text_en: `Question ${i}`,
    }),
    skill_key: ["math.money", "math.time", "math.counting-sequences"][i % 3],
    difficulty: (Math.floor(i / 5) + 1),
  }));
}

/** start / record for both kinds, close to the SQL. */
function rpcFor(tables: Record<string, Row[]>) {
  return async (name: string, args: Record<string, unknown>) => {
    mocks.rpcCalls.push({ name, args });
    const override = mocks.rpcOverride?.(name, args);
    if (override) return override;
    const battles = tables.milestone_battles;
    if (name === "start_milestone_battle") {
      const milestone = tables.learning_path_milestones.find((m) => m.id === args.p_milestone_id)!;
      const active = battles.find((b) => b.learner_id === args.p_learner_id && b.milestone_id === args.p_milestone_id && b.status === "active");
      if (active) return { data: { battle: active, resumed: true }, error: null };
      const placement = milestone.kind === "placement";
      if (placement && battles.some((b) => b.learner_id === args.p_learner_id && b.milestone_id === args.p_milestone_id && b.status === "completed" && !b.superseded_at && !b.is_preview)) {
        return { data: null, error: { message: "placement_done" } };
      }
      const ids = args.p_question_ids as string[];
      const required = placement ? 0 : Math.ceil((75 * ids.length) / 100);
      const battle: Row = {
        id: `30000000-0000-4000-8000-${String(battles.length + 1).padStart(12, "0")}`, milestone_id: args.p_milestone_id, assignment_id: IDS.assignment,
        learner_id: args.p_learner_id, attempt_number: battles.length + 1, is_preview: args.p_preview, question_ids: ids, question_count: ids.length,
        required_correct: required, hearts_total: ids.length - required, correct_count: 0, wrong_count: 0, answered_count: 0, status: "active",
        started_at: new Date().toISOString(), last_answer_at: null, finished_at: null, hint_used_question_index: null, hint_used_at: null,
        kind: placement ? "placement" : "milestone", superseded_at: null,
      };
      battles.push(battle);
      return { data: { battle, resumed: false }, error: null };
    }
    if (name === "record_milestone_answer") {
      const battle = battles.find((b) => b.id === args.p_battle_id)!;
      const position = args.p_position as number;
      const skills = () => [{ skill_key: "math.money", family_label_en: "Money", family_label_ar: "النقود", answered: 4, correct: 3 }, { skill_key: "math.time", family_label_en: "Telling the time", family_label_ar: "قراءة الوقت", answered: 4, correct: 1 }];
      if (position < (battle.answered_count as number)) {
        const stored = tables.milestone_battle_answers.find((a) => a.battle_id === battle.id && a.position === position)!;
        return { data: { battle, is_correct: stored.is_correct, replay: true, certificate_id: null, first_pass: false, placement_skills: battle.status === "completed" ? skills() : null, placement_first: false }, error: null };
      }
      if (battle.status !== "active") return { data: null, error: { message: "battle_finished" } };
      tables.milestone_battle_answers.push({ battle_id: battle.id, position, is_correct: args.p_is_correct });
      battle.answered_count = position + 1;
      if (args.p_is_correct) battle.correct_count = (battle.correct_count as number) + 1;
      else battle.wrong_count = (battle.wrong_count as number) + 1;
      if (battle.kind === "placement") {
        if ((battle.answered_count as number) >= (battle.question_count as number)) battle.status = "completed";
        const done = battle.status === "completed";
        const first = done && !battles.some((b) => b !== battle && b.milestone_id === battle.milestone_id && b.learner_id === battle.learner_id && b.status === "completed");
        return { data: { battle, is_correct: args.p_is_correct, replay: false, certificate_id: null, first_pass: false, placement_skills: done ? skills() : null, placement_first: first }, error: null };
      }
      if ((battle.correct_count as number) >= (battle.required_correct as number)) battle.status = "won";
      else if ((battle.wrong_count as number) > (battle.hearts_total as number)) battle.status = "lost";
      return { data: { battle, is_correct: args.p_is_correct, replay: false, certificate_id: null, first_pass: false, placement_skills: null, placement_first: false }, error: null };
    }
    if (name === "measurement_refresh_tags") return { data: 0, error: null };
    return { data: null, error: { message: `unknown rpc ${name}` } };
  };
}

function seed() {
  const tables: Record<string, Row[]> = {
    learning_path_milestones: [
      { id: IDS.placement, path_id: IDS.path, after_week_number: 0, kind: "placement", assignment_id: IDS.assignment, title_ar: "تعرّف على أوّل زعيم!", title_en: "Meet your first boss!", status: "published", battle_question_count: 12, pass_percent: 75, boss_key: "number_giant" },
    ],
    learning_paths: [{ id: IDS.path, subject_id: IDS.subject, is_published: true, title_ar: "مسار", title_en: "Path", created_by: "author-teacher" }],
    learning_path_weeks: [1, 2, 3, 4].map((n) => ({ id: `week-${n}`, path_id: IDS.path, week_number: n, learning_path_steps: [{ lesson_id: `lesson-${n - 1}` }] })),
    learning_path_steps: [0, 1, 2, 3].map((i) => ({ week_id: `week-${i + 1}`, lesson_id: `lesson-${i}`, sequence: 1 })),
    lessons: [0, 1, 2, 3].map((i) => ({ id: `lesson-${i}`, title_ar: `درس ${i}`, title_en: `Lesson ${i}` })),
    subjects: [{ id: IDS.subject, name_ar: "الرياضيات", name_en: "Maths" }],
    curriculum_skills: ["math.money", "math.time", "math.counting-sequences"].map((key, i) => ({
      skill_key: key, subject_key: "math", label_en: key, label_ar: key, family_label_en: key, family_label_ar: key, assessable: true, sort_order: i, is_active: true,
    })).concat([{ skill_key: "english.speaking-communication", subject_key: "math", label_en: "x", label_ar: "x", family_label_en: "x", family_label_ar: "x", assessable: false, sort_order: 9, is_active: true }]),
    lesson_slides: [],
    homework_questions: placementPool() as unknown as Row[],
    homework_assignments: [{ id: IDS.assignment, total_points: 15 }],
    milestone_battles: [],
    milestone_battle_answers: [],
    learner_certificates: [],
  };
  const { client } = createFakeDb(tables, rpcFor(tables));
  mocks.admin = client;
  return tables;
}

function post(body: unknown) {
  return new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
const placementParams = { params: Promise.resolve({ id: IDS.placement }) };
const battleParams = (battleId: string) => ({ params: Promise.resolve({ battleId }) });
function correctChoice(tables: Record<string, Row[]>, battleId: string, position: number) {
  const battle = tables.milestone_battles.find((b) => b.id === battleId)!;
  const question = tables.homework_questions.find((q) => q.id === (battle.question_ids as string[])[position]) as unknown as MilestonePoolQuestion;
  return inverse(servedItem(question, battleId)!.perms.options)[2];
}
function asStaff(userId: string, role: "teacher" | "admin") {
  mocks.teacherRole = role;
  mocks.user = { id: userId };
}

beforeEach(() => {
  mocks.context = { accountId: IDS.parent, learnerId: IDS.learner, isSelf: false, learnerProfile: {}, accountProfile: {} };
  mocks.contextResponse = null;
  mocks.teacherRole = null;
  mocks.user = { id: IDS.parent };
  mocks.tree = { pathId: IDS.path, weeks: [{ weekNumber: 4, state: "in_progress" }], milestones: [] };
  mocks.afterCallbacks.length = 0;
  mocks.notifyPlacement.mockClear();
  mocks.notifyMilestone.mockClear();
  mocks.rpcCalls.length = 0;
  mocks.rpcOverride = null;
  clearSkillCache();
});

describe("placement play", () => {
  it("intro: available, never locked, no block lessons or certificate", async () => {
    seed();
    const body = await (await intro(new Request("http://localhost/x?lang=en"), placementParams)).json();
    expect(body).toMatchObject({ state: "available", lockedReason: null, certificate: null, blockLessons: [], kind: "placement" });
    expect(body.milestone).toMatchObject({ kind: "placement", afterWeekNumber: 0, firstWeekNumber: 1, level: 0, requiredCorrect: 0, heartsTotal: 12 });
  });

  it("starts without the lock (weeks not done), drawing 4 easy / 4 medium / 4 hard", async () => {
    const tables = seed();
    const response = await startBattle(post({ lang: "en" }), placementParams);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.battle).toMatchObject({ kind: "placement", hintAllowed: false, requiredCorrect: 0, heartsTotal: 12, heartsLeft: 12, bossHpPercent: 100, combo: 0 });
    const ids = tables.milestone_battles[0].question_ids as string[];
    const difficulty = (id: string) => (tables.homework_questions.find((q) => q.id === id) as { difficulty: number }).difficulty;
    expect(ids.map(difficulty)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it("a second start after completing -> 409 placement_done with the kind copy", async () => {
    const tables = seed();
    tables.milestone_battles.push({ id: "b-done", learner_id: IDS.learner, milestone_id: IDS.placement, status: "completed", is_preview: false, superseded_at: null, kind: "placement" });
    const response = await startBattle(post({ lang: "en" }), placementParams);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "placement_done", message: "You've already met Numbo the Number Giant! Keep going on your path." });
    const ar = await (await startBattle(post({ lang: "ar" }), placementParams)).json();
    expect(ar.message).toBe("لقد تعرّفت على نُمبو عملاق الأرقام! تابع رحلتك.");
    const state = await (await intro(new Request("http://localhost/x"), placementParams)).json();
    expect(state.state).toBe("completed");
  });

  it("the Owl Hint on a placement -> 409 hint_unavailable, nothing written", async () => {
    const tables = seed();
    await startBattle(post({}), placementParams);
    const response = await hint(post({ position: 0 }), placementParams);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("hint_unavailable");
    expect(tables.milestone_battles[0].hint_used_question_index).toBeNull();
  });

  it("answers are neutral; the 12th finishes with the outcome, no stars / certificate; the note is scheduled once", async () => {
    const tables = seed();
    const battleId = (await (await startBattle(post({ lang: "en" }), placementParams)).json()).battle.battleId as string;
    let last: Record<string, unknown> = {};
    for (let position = 0; position < 12; position += 1) {
      const choice = position % 2 === 0 ? correctChoice(tables, battleId, position) : (correctChoice(tables, battleId, position) + 1) % 4;
      last = await (await answer(post({ position, choiceIndex: choice, lang: "en" }), battleParams(battleId))).json();
      if (position === 5) expect(last).toMatchObject({ neutral: true, finished: false, combo: 0, heartsLeft: 12, bossHpPercent: 50, placement: null });
    }
    expect(last).toMatchObject({ finished: true, passed: false, neutral: true, stars: null, certificateId: null, firstPass: true, next: null, bossHpPercent: 0 });
    expect(last.placement).toEqual({
      knownSkills: [{ skillKey: "math.money", subjectId: IDS.subject, familyLabelEn: "Money", familyLabelAr: "النقود" }],
      growingSkills: [{ skillKey: "math.time", subjectId: IDS.subject, familyLabelEn: "Telling the time", familyLabelAr: "قراءة الوقت" }],
    });
    expect(JSON.stringify(last)).not.toMatch(/correct_answer|answered|score/);
    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();
    expect(mocks.notifyPlacement).toHaveBeenCalledWith(mocks.admin, battleId);
    expect(mocks.notifyMilestone).not.toHaveBeenCalled();

    const replay = await (await answer(post({ position: 11, choiceIndex: 0 }), battleParams(battleId))).json();
    expect(replay).toMatchObject({ replay: true, firstPass: false, finished: true });
    expect(replay.placement.knownSkills).toHaveLength(1);
    expect(mocks.afterCallbacks).toHaveLength(1);
  });

  it("is left out of the Boss Book", async () => {
    const tables = seed();
    tables.milestone_battles.push({ id: "b-1", learner_id: IDS.learner, milestone_id: IDS.placement, is_preview: false, started_at: "2026-10-01T00:00:00Z", kind: "placement" });
    const { entries } = await (await bossBook(new Request("http://localhost/x"))).json();
    expect(entries.find((entry: { bossKey: string }) => entry.bossKey === "number_giant")).toMatchObject({ met: false });
  });

  it("maps the new RPC tokens", () => {
    expect(mapMilestoneRpcError({ message: "placement_done" }, { lang: "en", bossKey: "word_dragon" })).toMatchObject({ code: "placement_done", status: 409, message: "You've already met Wordy the Word Dragon! Keep going on your path." });
    expect(mapMilestoneRpcError({ message: "pool_unbalanced: easy 5, medium 8, hard 2" })).toMatchObject({ code: "pool_unbalanced", status: 422 });
  });
});

describe("teacher authoring", () => {
  it("lists the placement apart from the blocks, with difficulty counts", async () => {
    seed();
    asStaff("author-teacher", "teacher");
    const body = await (await teacherList(new Request(`http://localhost/x?subject_id=${IDS.subject}`))).json();
    expect(body.blocks.every((block: { milestone: unknown }) => block.milestone === null)).toBe(true);
    expect(body.placement).toMatchObject({ id: IDS.placement, kind: "placement", difficultyCounts: { d1: 5, d2: 5, d3: 5, none: 0 } });
  });

  it("detail carries skills and tags; a tag edit becomes a teacher tag and refreshes measurement", async () => {
    const tables = seed();
    asStaff("author-teacher", "teacher");
    const detail = await (await teacherDetail(new Request("http://localhost/x"), placementParams)).json();
    expect(detail.skills.map((skill: { skillKey: string }) => skill.skillKey)).toEqual(["math.money", "math.time", "math.counting-sequences"]);
    expect(detail.questions[0]).toMatchObject({ skill_key: "math.money", difficulty: 1 });
    const questions = detail.questions.map((q: Row, i: number) => (i === 0 ? { ...q, skill_key: "math.time", difficulty: 3 } : q));
    const response = await teacherPut(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ questions }) }), placementParams);
    expect(response.status).toBe(200);
    expect(tables.homework_questions[0]).toMatchObject({ skill_key: "math.time", difficulty: 3, tag_source: "teacher" });
    expect(tables.homework_questions[1].tag_source).toBeUndefined();
    expect(mocks.rpcCalls.filter((call) => call.name === "measurement_refresh_tags")).toEqual([{ name: "measurement_refresh_tags", args: { p_milestone_id: IDS.placement } }]);
  });

  it("rejects an unknown or non-assessable skill, and a placement size other than 12", async () => {
    seed();
    asStaff("author-teacher", "teacher");
    const detail = await (await teacherDetail(new Request("http://localhost/x"), placementParams)).json();
    for (const skill of ["math.nope", "english.speaking-communication"]) {
      const questions = detail.questions.map((q: Row, i: number) => (i === 0 ? { ...q, skill_key: skill } : q));
      const response = await teacherPut(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ questions }) }), placementParams);
      expect(response.status).toBe(400);
    }
    const bad = await teacherPut(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify({ battleQuestionCount: 10 }) }), placementParams);
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toBe("A starting boss always has 12 questions.");
  });

  it("generate accepts kind placement (week forced to 0) and still requires a week for a Big Challenge", async () => {
    seed();
    asStaff("some-admin", "admin");
    const noWeek = await generateRoute(post({ path_id: IDS.path }));
    expect(noWeek.status).toBe(400);
    const zeroWeek = await generateRoute(post({ path_id: IDS.path, after_week_number: 0 }));
    expect(zeroWeek.status).toBe(400);
    // a placement request passes validation (and then fails on the existing published placement)
    const placement = await generateRoute(post({ path_id: IDS.path, kind: "placement", after_week_number: 8 }));
    expect(placement.status).toBe(409);
    expect((await placement.json()).error).toBe("unpublish_first");
  });

  it("publish maps pool_unbalanced to 422 with the copy", async () => {
    seed();
    asStaff("some-admin", "admin");
    mocks.rpcOverride = (name) => (name === "publish_milestone" ? { data: null, error: { message: "pool_unbalanced: easy 5, medium 8, hard 2" } } : null);
    const response = await publishRoute(post({}), placementParams);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "pool_unbalanced", message: "A starting boss needs at least 3 easy, 3 medium and 3 hard questions." });
  });
});

describe("impact, export, progress, reset", () => {
  it("impact: 401 anonymous, 403 when the database refuses, 400 on a bad query, the caller as the actor", async () => {
    seed();
    mocks.user = null;
    expect((await impact(new Request("http://localhost/x"))).status).toBe(401);
    mocks.user = { id: IDS.parent };
    mocks.rpcOverride = (name) => (name === "measurement_impact" ? { data: null, error: { message: "impact_forbidden" } } : null);
    const forbidden = await impact(new Request("http://localhost/x"));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "impact_forbidden" });
    for (const query of ["from=2026-13-01", "split=country", "subject_id=nope", "scope=class:42", "from=2026-01-01&to=2026-01-02x", "to=2999-01-01"]) {
      expect((await impact(new Request(`http://localhost/x?${query}`))).status).toBe(400);
    }
    mocks.user = { id: "teacher-1" };
    mocks.rpcOverride = (name) => (name === "measurement_impact" ? { data: { scope: { kind: "class" } }, error: null } : null);
    const ok = await impact(new Request(`http://localhost/x?split=age_band&scope=class:${IDS.cohort}&subject_id=${IDS.subject}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    const call = mocks.rpcCalls.filter((item) => item.name === "measurement_impact").at(-1)!;
    expect(call.args).toMatchObject({ p_actor: "teacher-1", p_split: "age_band", p_scope: `class:${IDS.cohort}`, p_subject_id: IDS.subject, p_path_id: null, p_min_cell: 5 });
  });

  it("parses the default window: the last 84 days", () => {
    const parsed = parseImpactQuery(new URLSearchParams(), new Date("2026-10-16T12:00:00Z"));
    expect(parsed).toEqual({ ok: true, query: { from: "2026-07-25", to: "2026-10-16", subjectId: null, pathId: null, split: "none", scope: "all" } });
    expect(parseImpactQuery(new URLSearchParams("from=2025-01-01&to=2026-10-16"), new Date("2026-10-16T12:00:00Z")).ok).toBe(false);
  });

  it("export: admin only; CSV with a BOM, RFC 4180 quoting, Arabic, and no uuid", async () => {
    const tables = seed();
    tables.profiles = [{ id: "teacher-1", role: "teacher", is_approved: true }, { id: "admin-1", role: "admin", is_approved: true }];
    mocks.user = { id: "teacher-1" };
    expect((await exportRoute(new Request("http://localhost/x?format=csv"))).status).toBe(403);
    const sample: FunderExport = {
      generatedAt: "2026-10-16T00:00:00Z", period: { from: "2026-07-25", to: "2026-10-16" }, minCellSize: 5, definitionsVersion: "measurement-v1", notes: [],
      tables: [{ id: "reach", title: "Reach", footnotes: [], columns: [{ key: "subject", label: "Subject" }, { key: "learners_active", label: "Children" }],
        rows: [{ group: "Maths, \"core\"", subject: "الرياضيات, أساسي", learners_active: 12, suppressed: false }, { group: "English", subject: "English", learners_active: null, suppressed: true }] }],
    };
    mocks.user = { id: "admin-1" };
    mocks.rpcOverride = (name) => (name === "measurement_funder_export" ? { data: sample, error: null } : null);
    const response = await exportRoute(new Request("http://localhost/x?format=csv&from=2026-07-25&to=2026-10-16"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="amal-impact-2026-07-25-2026-10-16.csv"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('reach,"Maths, ""core""",subject,"الرياضيات, أساسي",false');
    expect(text).toContain("reach,English,learners_active,,true");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(funderExportCsv({ ...sample, tables: [] }).split("\r\n")[0]).toBe("﻿table_id,group,column,value,suppressed");
    const json = await (await exportRoute(new Request("http://localhost/x"))).json();
    expect(json.export.definitionsVersion).toBe("measurement-v1");
  });

  it("progress: the active learner only (a foreign x-amal-learner is refused upstream), one RPC", async () => {
    seed();
    mocks.contextResponse = Response.json({ error: "learner_forbidden" }, { status: 403 });
    expect((await progress(new Request("http://localhost/x"))).status).toBe(403);
    mocks.contextResponse = null;
    mocks.rpcOverride = (name, args) => (name === "measurement_learner_summaries"
      ? { data: [{ learnerId: (args.p_learner_ids as string[])[0], windowStart: "a", windowEnd: "b", skillsLearned: [], skillsPractised: [], subjects: [] }], error: null }
      : null);
    const response = await progress(new Request("http://localhost/x"));
    expect(response.status).toBe(200);
    expect((await response.json()).summary.learnerId).toBe(IDS.learner);
    expect(mocks.rpcCalls).toEqual([{ name: "measurement_learner_summaries", args: { p_learner_ids: [IDS.learner] } }]);
  });

  it("reset: 400 on a bad body, 403 reset_forbidden, 404 milestone_not_found, ok", async () => {
    seed();
    asStaff("teacher-1", "teacher");
    const body = { learnerId: IDS.learner, milestoneId: IDS.placement, reason: "moved up" };
    expect((await reset(post({ ...body, reason: "x" }))).status).toBe(400);
    mocks.rpcOverride = (name) => (name === "reset_placement" ? { data: null, error: { message: "reset_forbidden" } } : null);
    expect((await reset(post(body))).status).toBe(403);
    mocks.rpcOverride = (name) => (name === "reset_placement" ? { data: null, error: { message: "milestone_not_found" } } : null);
    expect((await reset(post(body))).status).toBe(404);
    mocks.rpcOverride = (name) => (name === "reset_placement" ? { data: { reset_at: "2026-10-16T10:00:00Z" }, error: null } : null);
    expect(await (await reset(post(body))).json()).toEqual({ ok: true, resetAt: "2026-10-16T10:00:00Z" });
    expect(mocks.rpcCalls.at(-1)).toEqual({ name: "reset_placement", args: { p_milestone_id: IDS.placement, p_learner_id: IDS.learner, p_actor: "teacher-1", p_reason: "moved up" } });
  });
});

describe("schools and classes", () => {
  it("every route needs a signed-in caller", async () => {
    seed();
    mocks.user = null;
    const results = await Promise.all([
      learnerClasses(new Request("http://localhost/x"), { params: Promise.resolve({ id: IDS.learner }) }),
      joinClass(post({ code: "abcd1234", learnerId: IDS.learner })),
      leaveClass(post({ cohortId: IDS.cohort, learnerId: IDS.learner })),
      classProgress(new Request("http://localhost/x"), { params: Promise.resolve({ id: IDS.cohort }) }),
      decide(post({ decision: "approve" }), { params: Promise.resolve({ id: IDS.cohort, requestId: IDS.request }) }),
      schoolOverview(new Request("http://localhost/x")),
      scopes(),
    ]);
    expect(results.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
  });

  it("join passes the caller as the actor and maps invalid_code / already_member / learner_forbidden", async () => {
    seed();
    mocks.rpcOverride = (name, args) => (name === "enrol_learner_in_class"
      ? args.p_code === "BAD" ? { data: null, error: { message: "invalid_code" } }
        : args.p_code === "TWICE" ? { data: null, error: { message: "already_member" } }
          : args.p_learner === "10000000-0000-4000-8000-0000000000ff" ? { data: null, error: { message: "learner_forbidden" } }
            : { data: { cohortId: IDS.cohort, name: "Class 1", status: "pending", requestId: IDS.request }, error: null }
      : null);
    expect(await (await joinClass(post({ code: "ab cd 12", learnerId: IDS.learner }))).json()).toEqual({ cohortId: IDS.cohort, name: "Class 1", status: "pending" });
    expect(mocks.rpcCalls[0]).toEqual({ name: "enrol_learner_in_class", args: { p_actor: IDS.parent, p_learner: IDS.learner, p_code: "ab cd 12" } });
    expect((await joinClass(post({ code: "BAD", learnerId: IDS.learner }))).status).toBe(400);
    expect((await joinClass(post({ code: "TWICE", learnerId: IDS.learner }))).status).toBe(409);
    const foreign = await joinClass(post({ code: "OK", learnerId: "10000000-0000-4000-8000-0000000000ff" }));
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ error: "learner_forbidden" });
  });

  it("leave, classes, class progress, decisions, school overview and scopes are one RPC each with the caller as actor", async () => {
    seed();
    mocks.rpcOverride = (name) => ({ data: name === "leave_class" ? { ok: true } : { name }, error: null });
    expect(await (await leaveClass(post({ cohortId: IDS.cohort, learnerId: IDS.learner }))).json()).toEqual({ ok: true });
    await learnerClasses(new Request("http://localhost/x"), { params: Promise.resolve({ id: IDS.learner }) });
    await classProgress(new Request("http://localhost/x"), { params: Promise.resolve({ id: IDS.cohort }) });
    await decide(post({ decision: "decline" }), { params: Promise.resolve({ id: IDS.cohort, requestId: IDS.request }) });
    await schoolOverview(new Request(`http://localhost/x?school_id=${IDS.cohort}`));
    await scopes();
    expect(mocks.rpcCalls).toEqual([
      { name: "leave_class", args: { p_actor: IDS.parent, p_learner: IDS.learner, p_cohort: IDS.cohort } },
      { name: "learner_classes", args: { p_actor: IDS.parent, p_learner: IDS.learner } },
      { name: "measurement_class_progress", args: { p_actor: IDS.parent, p_cohort: IDS.cohort } },
      { name: "decide_class_request", args: { p_actor: IDS.parent, p_cohort: IDS.cohort, p_request: IDS.request, p_decision: "decline" } },
      { name: "measurement_school_overview", args: { p_actor: IDS.parent, p_school: IDS.cohort } },
      { name: "measurement_scope_options", args: { p_actor: IDS.parent } },
    ]);
  });

  it("maps the database's refusals", async () => {
    seed();
    mocks.rpcOverride = (name) => ({
      data: null,
      error: { message: name === "measurement_class_progress" ? "impact_forbidden" : name === "decide_class_request" ? "class_forbidden" : name === "leave_class" ? "not_found" : "learner_forbidden" },
    });
    expect((await classProgress(new Request("http://localhost/x"), { params: Promise.resolve({ id: IDS.cohort }) })).status).toBe(403);
    expect((await decide(post({ decision: "approve" }), { params: Promise.resolve({ id: IDS.cohort, requestId: IDS.request }) })).status).toBe(403);
    expect((await leaveClass(post({ cohortId: IDS.cohort, learnerId: IDS.learner }))).status).toBe(404);
    expect((await learnerClasses(new Request("http://localhost/x"), { params: Promise.resolve({ id: IDS.learner }) })).status).toBe(403);
    expect((await decide(post({ decision: "maybe" }), { params: Promise.resolve({ id: IDS.cohort, requestId: IDS.request }) })).status).toBe(400);
    expect((await schoolOverview(new Request("http://localhost/x?school_id=nope"))).status).toBe(400);
  });
});
