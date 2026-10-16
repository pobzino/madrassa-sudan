import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./milestone-fake-db";
import { inverse } from "@/lib/server/milestones/interactions";
import { servedItem, type MilestonePoolQuestion } from "@/lib/server/milestones/present";
import { mcQuestion } from "./milestone-fixtures";

const IDS = {
  milestone: "10000000-0000-4000-8000-000000000001",
  path: "10000000-0000-4000-8000-000000000002",
  subject: "10000000-0000-4000-8000-000000000003",
  assignment: "10000000-0000-4000-8000-000000000004",
  learner: "10000000-0000-4000-8000-000000000005",
  parent: "10000000-0000-4000-8000-000000000006",
  stranger: "10000000-0000-4000-8000-000000000007",
};

const mocks = vi.hoisted(() => ({
  context: null as unknown,
  admin: null as unknown,
  tree: null as unknown,
  teacherRole: null as string | null,
  afterCallbacks: [] as Array<() => unknown>,
  notify: vi.fn(async () => ({ status: "sent" })),
  userClient: null as unknown,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcOverride: null as null | ((name: string) => { data: unknown; error: { message: string } | null } | null),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => unknown) => {
    mocks.afterCallbacks.push(callback);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.userClient ?? {} }));
vi.mock("@/lib/supabase/service", () => ({ hasServiceRoleConfig: () => true, createServiceClient: () => mocks.admin }));
vi.mock("@/lib/server/learner-context", () => ({
  getLearnerContextResult: async () => ({ context: mocks.context, response: null }),
}));
vi.mock("@/lib/server/learner-admin", () => ({
  createOwnedLearnerAdminClient: async () => ({ admin: mocks.admin, error: null }),
}));
vi.mock("@/lib/server/teacher-lesson-access", () => ({ getTeacherRole: async () => mocks.teacherRole }));
vi.mock("@/lib/lessons/useLearningPath", () => ({ loadSubjectLearningPath: async () => mocks.tree }));
vi.mock("@/lib/server/milestones/notify", () => ({ notifyMilestonePassed: mocks.notify }));

import { POST as startBattle, GET as getBattle } from "@/app/api/milestones/[id]/battle/route";
import { POST as answer } from "@/app/api/milestones/battles/[battleId]/answer/route";
import { POST as hint } from "@/app/api/milestones/[id]/battle/hint/route";
import { POST as submitHomework, PUT as saveDraft } from "@/app/api/homework/[id]/submit/route";
import { POST as retake } from "@/app/api/homework/[id]/retake/route";
import { GET as bossBook } from "@/app/api/milestones/boss-book/route";
import { POST as publish } from "@/app/api/teacher/milestones/[id]/publish/route";
import { POST as unpublish } from "@/app/api/teacher/milestones/[id]/unpublish/route";
import { mapMilestoneRpcError } from "@/lib/server/milestones/load";
import { BOSS_KEYS } from "@/lib/milestones/types";

type Row = Record<string, unknown>;

function poolQuestions(count: number): MilestonePoolQuestion[] {
  return Array.from({ length: count }, (_, i) =>
    mcQuestion({
      id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      assignment_id: IDS.assignment,
      source_lesson_id: `lesson-${i % 4}`,
      question_text_ar: `سؤال ${i}`,
      question_text_en: `Question ${i}`,
    }),
  );
}

/** A faithful-enough stand-in for the §1.4 RPCs. */
function rpcFor(tables: Record<string, Row[]>) {
  return async (name: string, args: Record<string, unknown>) => {
    mocks.rpcCalls.push({ name, args });
    const override = mocks.rpcOverride?.(name);
    if (override) return override;
    const battles = tables.milestone_battles;
    if (name === "start_milestone_battle") {
      const active = battles.find((b) => b.learner_id === args.p_learner_id && b.milestone_id === args.p_milestone_id && b.status === "active");
      if (active) return { data: { battle: active, resumed: true }, error: null };
      const ids = args.p_question_ids as string[];
      const required = Math.ceil((75 * ids.length) / 100);
      const attempts = battles.filter((b) => b.learner_id === args.p_learner_id && b.milestone_id === args.p_milestone_id).length;
      const battle: Row = {
        id: `30000000-0000-4000-8000-${String(battles.length + 1).padStart(12, "0")}`,
        milestone_id: args.p_milestone_id, assignment_id: IDS.assignment, learner_id: args.p_learner_id,
        attempt_number: attempts + 1, is_preview: args.p_preview, question_ids: ids, question_count: ids.length,
        required_correct: required, hearts_total: ids.length - required, correct_count: 0, wrong_count: 0, answered_count: 0,
        status: "active", started_at: new Date(Date.now() + battles.length).toISOString(), last_answer_at: null, finished_at: null,
        hint_used_question_index: null, hint_used_at: null,
      };
      battles.push(battle);
      return { data: { battle, resumed: false }, error: null };
    }
    if (name === "record_milestone_answer") {
      const battle = battles.find((b) => b.id === args.p_battle_id)!;
      const position = args.p_position as number;
      const certificate = () => tables.learner_certificates.find((c) => c.learner_id === battle.learner_id && c.milestone_id === battle.milestone_id);
      if (position < (battle.answered_count as number)) {
        const stored = tables.milestone_battle_answers.find((a) => a.battle_id === battle.id && a.position === position)!;
        return { data: { battle, is_correct: stored.is_correct, replay: true, certificate_id: certificate()?.id ?? null, first_pass: false }, error: null };
      }
      if (battle.status !== "active") return { data: null, error: { message: "battle_finished" } };
      if (position !== battle.answered_count) return { data: null, error: { message: "position_mismatch" } };
      tables.milestone_battle_answers.push({ id: `ans-${tables.milestone_battle_answers.length}`, battle_id: battle.id, position, is_correct: args.p_is_correct });
      battle.answered_count = position + 1;
      if (args.p_is_correct) battle.correct_count = (battle.correct_count as number) + 1;
      else battle.wrong_count = (battle.wrong_count as number) + 1;
      let firstPass = false;
      if ((battle.correct_count as number) >= (battle.required_correct as number)) {
        battle.status = "won";
        if (!battle.is_preview && !certificate()) {
          tables.learner_certificates.push({ id: "cert-1", learner_id: battle.learner_id, milestone_id: battle.milestone_id, stars: 3 });
          firstPass = true;
        }
      } else if ((battle.wrong_count as number) > (battle.hearts_total as number)) battle.status = "lost";
      return { data: { battle, is_correct: args.p_is_correct, replay: false, certificate_id: certificate()?.id ?? null, first_pass: firstPass }, error: null };
    }
    return { data: null, error: { message: "unknown rpc" } };
  };
}

function seed(poolSize = 10, battleSize = 8) {
  const tables: Record<string, Row[]> = {
    learning_path_milestones: [{
      id: IDS.milestone, path_id: IDS.path, after_week_number: 4, assignment_id: IDS.assignment, title_ar: "التحدي الكبير", title_en: "Big Challenge",
      status: "published", battle_question_count: battleSize, pass_percent: 75, boss_key: "number_giant",
    }],
    learning_paths: [{ id: IDS.path, subject_id: IDS.subject, is_published: true, title_ar: "مسار", title_en: "Path" }],
    learning_path_weeks: [1, 2, 3, 4].map((n) => ({ id: `week-${n}`, path_id: IDS.path, week_number: n })),
    learning_path_steps: [0, 1, 2, 3].map((i) => ({ week_id: `week-${i + 1}`, lesson_id: `lesson-${i}`, sequence: 1 })),
    lessons: [0, 1, 2, 3].map((i) => ({ id: `lesson-${i}`, title_ar: `درس ${i}`, title_en: `Lesson ${i}` })),
    subjects: [{ id: IDS.subject, name_ar: "الرياضيات", name_en: "Maths" }],
    lesson_slides: [],
    homework_questions: poolQuestions(poolSize) as unknown as Row[],
    milestone_battles: [],
    milestone_battle_answers: [],
    learner_certificates: [],
  };
  const { client } = createFakeDb(tables, rpcFor(tables));
  mocks.admin = client;
  return tables;
}

const unlockedTree = () => ({ pathId: IDS.path, weeks: [{ weekNumber: 4, state: "completed" }], milestones: [{ id: IDS.milestone, state: "available" }] });

function post(body: unknown) {
  return new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
const milestoneParams = { params: Promise.resolve({ id: IDS.milestone }) };
const battleParams = (battleId: string) => ({ params: Promise.resolve({ battleId }) });

/** The display index of the correct option for the battle's question at `position`. */
function correctChoice(tables: Record<string, Row[]>, battleId: string, position: number) {
  const battle = tables.milestone_battles.find((b) => b.id === battleId)!;
  const question = tables.homework_questions.find((q) => q.id === (battle.question_ids as string[])[position]) as unknown as MilestonePoolQuestion;
  const item = servedItem(question, battleId)!;
  return inverse(item.perms.options)[2];
}

beforeEach(() => {
  mocks.context = { accountId: IDS.parent, learnerId: IDS.learner, isSelf: false, learnerProfile: {}, accountProfile: {} };
  mocks.teacherRole = null;
  mocks.tree = unlockedTree();
  mocks.afterCallbacks.length = 0;
  mocks.notify.mockClear();
  mocks.userClient = null;
  mocks.rpcCalls.length = 0;
  mocks.rpcOverride = null;
});

describe("start battle", () => {
  it("returns 409 milestone_locked until the block is done", async () => {
    seed();
    mocks.tree = { pathId: IDS.path, weeks: [{ weekNumber: 4, state: "in_progress" }], milestones: [{ id: IDS.milestone, state: "locked" }] };
    const response = await startBattle(post({ lang: "en" }), milestoneParams);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "milestone_locked" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("starts, serves a key-free question, and resumes the same battle", async () => {
    const tables = seed();
    const first = await startBattle(post({ lang: "en" }), milestoneParams);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.resumed).toBe(false);
    expect(body.battle).toMatchObject({ questionCount: 8, requiredCorrect: 6, heartsTotal: 2, heartsLeft: 2, bossHpPercent: 100, phase: 1, combo: 0 });
    expect(body.battle.question.interaction.type).toBe("choose_correct");
    expect(JSON.stringify(body)).not.toMatch(/correct_answer|correct_option_index|correct_index|question_ids/);
    expect(tables.milestone_battles[0].question_ids).toHaveLength(8);

    const second = await startBattle(post({ lang: "en" }), milestoneParams);
    const resumed = await second.json();
    expect(resumed.resumed).toBe(true);
    expect(resumed.battle.battleId).toBe(body.battle.battleId);

    const current = await (await getBattle(new Request("http://localhost/x?lang=en"), milestoneParams)).json();
    expect(current.battle.battleId).toBe(body.battle.battleId);
  });

  it("lets staff preview a locked milestone", async () => {
    seed();
    mocks.context = { accountId: IDS.learner, learnerId: IDS.learner, isSelf: true, learnerProfile: {}, accountProfile: {} };
    mocks.teacherRole = "teacher";
    mocks.tree = { pathId: IDS.path, weeks: [], milestones: [{ id: IDS.milestone, state: "locked" }] };
    const response = await startBattle(post({}), milestoneParams);
    expect(response.status).toBe(200);
    expect((await response.json()).battle.preview).toBe(true);
  });
});

describe("answer", () => {
  async function started() {
    const tables = seed();
    const body = await (await startBattle(post({ lang: "en" }), milestoneParams)).json();
    return { tables, battleId: body.battle.battleId as string };
  }

  it("grades through the permutation and replays idempotently", async () => {
    const { tables, battleId } = await started();
    const choice = correctChoice(tables, battleId, 0);
    const result = await (await answer(post({ position: 0, choiceIndex: choice, lang: "en" }), battleParams(battleId))).json();
    expect(result).toMatchObject({ correct: true, replay: false, finished: false, combo: 1, phase: 1, heartsLeft: 2 });
    expect(result.next.position).toBe(1);
    expect(result.next.turn).toBe("block");
    expect(JSON.stringify(result)).not.toMatch(/correct_answer|correct_option_index|correct_index/);

    const replay = await (await answer(post({ position: 0, choiceIndex: (choice + 1) % 4 }), battleParams(battleId))).json();
    expect(replay).toMatchObject({ correct: true, replay: true });
    expect(tables.milestone_battle_answers).toHaveLength(1);
  });

  it("accepts the InteractionAnswer shape", async () => {
    const { tables, battleId } = await started();
    const choice = correctChoice(tables, battleId, 0);
    const result = await (await answer(post({ position: 0, answer: { type: "choose_correct", selected_index: choice } }), battleParams(battleId))).json();
    expect(result.correct).toBe(true);
  });

  it("returns 409 position_mismatch with the current battle", async () => {
    const { battleId } = await started();
    const response = await answer(post({ position: 3, choiceIndex: 0 }), battleParams(battleId));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("position_mismatch");
    expect(body.battle.answeredCount).toBe(0);
  });

  it("returns 400 invalid_answer without writing", async () => {
    const { tables, battleId } = await started();
    const response = await answer(post({ position: 0, choiceIndex: 7 }), battleParams(battleId));
    expect(response.status).toBe(400);
    expect(tables.milestone_battle_answers).toHaveLength(0);
  });

  it("hides another learner's battle", async () => {
    const { battleId } = await started();
    mocks.context = { accountId: IDS.stranger, learnerId: IDS.stranger, isSelf: true, learnerProfile: {}, accountProfile: {} };
    const response = await answer(post({ position: 0, choiceIndex: 0 }), battleParams(battleId));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "battle_not_found" });
  });

  it("notifies the family once, on the first pass only", async () => {
    const { tables, battleId } = await started();
    let last: Record<string, unknown> = {};
    for (let position = 0; position < 6; position += 1) {
      last = await (await answer(post({ position, choiceIndex: correctChoice(tables, battleId, position) }), battleParams(battleId))).json();
    }
    expect(last).toMatchObject({ finished: true, passed: true, firstPass: true, certificateId: "cert-1", stars: 3, combo: 6, phase: 2, next: null });
    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(mocks.admin, "cert-1");

    const replay = await (await answer(post({ position: 5, choiceIndex: 0 }), battleParams(battleId))).json();
    expect(replay).toMatchObject({ replay: true, firstPass: false, passed: true });
    expect(mocks.afterCallbacks).toHaveLength(1);

    const finished = await answer(post({ position: 6, choiceIndex: 0 }), battleParams(battleId));
    expect(finished.status).toBe(409);
    expect((await finished.json()).error).toBe("battle_finished");
  });

  it("resets the combo on a wrong answer", async () => {
    const { tables, battleId } = await started();
    await answer(post({ position: 0, choiceIndex: correctChoice(tables, battleId, 0) }), battleParams(battleId));
    const wrong = await (await answer(post({ position: 1, choiceIndex: (correctChoice(tables, battleId, 1) + 1) % 4 }), battleParams(battleId))).json();
    expect(wrong).toMatchObject({ correct: false, combo: 0, heartsLeft: 1 });
  });
});

describe("owl hint", () => {
  it("hides two wrong options once per battle", async () => {
    const tables = seed();
    const battleId = (await (await startBattle(post({}), milestoneParams)).json()).battle.battleId;
    const first = await hint(post({ position: 0 }), milestoneParams);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.hideOptionIds).toHaveLength(2);
    expect(body.hideOptionIds).not.toContain(correctChoice(tables, battleId, 0));
    expect(await (await hint(post({ position: 0 }), milestoneParams)).json()).toEqual(body);

    const state = await (await getBattle(new Request("http://localhost/x"), milestoneParams)).json();
    expect(state.battle).toMatchObject({ hintUsed: true, hint: { hideOptionIds: body.hideOptionIds } });

    await answer(post({ position: 0, choiceIndex: correctChoice(tables, battleId, 0) }), battleParams(battleId));
    const again = await hint(post({ position: 1 }), milestoneParams);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("hint_used");
  });
});

describe("boss book", () => {
  it("lists every boss from the learner's own certificates and battles only", async () => {
    const tables = seed();
    tables.learner_certificates.push(
      { id: "cert-a", learner_id: IDS.learner, boss_key: "number_giant", subject_id: IDS.subject, after_week_number: 4, stars: 2, awarded_at: "2026-10-01T00:00:00Z" },
      { id: "cert-b", learner_id: IDS.learner, boss_key: "number_giant", subject_id: IDS.subject, after_week_number: 8, stars: 3, awarded_at: "2026-10-09T00:00:00Z" },
      { id: "cert-x", learner_id: IDS.stranger, boss_key: "word_dragon", subject_id: IDS.subject, after_week_number: 4, stars: 3, awarded_at: "2026-10-02T00:00:00Z" },
    );
    tables.milestone_battles.push(
      { id: "b-1", learner_id: IDS.learner, milestone_id: IDS.milestone, is_preview: false, started_at: "2026-10-01T00:00:00Z" },
      { id: "b-x", learner_id: IDS.stranger, milestone_id: "other", is_preview: false, started_at: "2026-10-01T00:00:00Z" },
    );
    const { entries } = await (await bossBook(new Request("http://localhost/x"))).json();
    expect(entries.map((entry: { bossKey: string }) => entry.bossKey)).toEqual([...BOSS_KEYS]);
    const numbo = entries.find((entry: { bossKey: string }) => entry.bossKey === "number_giant");
    expect(numbo).toMatchObject({
      met: true, beatenAt: "2026-10-01T00:00:00Z", starsKept: 3, certificateId: "cert-b", beatenCount: 2,
      subject: { id: IDS.subject, nameEn: "Maths" }, weeks: { first: 5, last: 8 },
    });
    const wordy = entries.find((entry: { bossKey: string }) => entry.bossKey === "word_dragon");
    expect(wordy).toMatchObject({ met: false, beatenAt: null, certificateId: null, beatenCount: 0 });
  });
});

describe("generic homework routes refuse milestones", () => {
  function userClientWith(assignment: Row) {
    const { client } = createFakeDb({ homework_assignments: [assignment], homework_submissions: [] });
    mocks.userClient = { ...client, auth: { getUser: async () => ({ data: { user: { id: IDS.parent } }, error: null }) } };
  }
  const assignment = { id: IDS.assignment, is_milestone: true, is_published: true, cohort_id: null, homework_questions: [] };
  const params = { params: Promise.resolve({ id: IDS.assignment }) };

  it("submit POST and PUT return 409 use_battle", async () => {
    seed();
    userClientWith(assignment);
    const body = { answers: [] };
    const submitted = await submitHomework(post(body) as never, params);
    expect(submitted.status).toBe(409);
    expect(await submitted.json()).toEqual({ error: "use_battle" });
    const drafted = await saveDraft(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) }) as never, params);
    expect(drafted.status).toBe(409);
  });

  it("retake returns 409 use_battle", async () => {
    seed();
    userClientWith(assignment);
    const response = await retake(post({}) as never, params);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "use_battle" });
  });
});

describe("database errors and checks", () => {
  it("maps every RPC error token to its code and status", () => {
    const cases: Array<[string, string, number]> = [
      ["milestone_locked", "milestone_locked", 409],
      ["publish_forbidden", "publish_forbidden", 403],
      ["battle_not_found", "battle_not_found", 404],
      ["invalid_answer: a verdict is required", "invalid_answer", 400],
      ["position_mismatch: expected 3", "position_mismatch", 409],
      ["pool_too_small: 5 auto-gradable questions, 8 needed", "pool_too_small", 422],
      ["milestone_unpublished", "milestone_unpublished", 404],
      ["something else", "service_unavailable", 500],
    ];
    for (const [message, code, status] of cases) {
      expect(mapMilestoneRpcError({ message })).toMatchObject({ code, status });
    }
    expect(mapMilestoneRpcError({ message: "milestone_locked" }, { lang: "en", afterWeekNumber: 8 }).message)
      .toBe("Finish weeks 5–8 first, then come back for the Big Challenge!");
    expect(mapMilestoneRpcError({ message: "milestone_locked" }, { lang: "ar", afterWeekNumber: 4 }).message)
      .toBe("أكمل الأسابيع ١–٤ أولاً، ثم عُد إلى التحدي الكبير!");
  });

  it("turns the database's milestone_locked floor into a kind 409", async () => {
    seed();
    mocks.rpcOverride = (name) => (name === "start_milestone_battle" ? { data: null, error: { message: "milestone_locked" } } : null);
    const response = await startBattle(post({ lang: "en" }), milestoneParams);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "milestone_locked", message: "Finish weeks 1–4 first, then come back for the Big Challenge!" });
  });

  it("gives the server's locked check the same kind message", async () => {
    seed();
    mocks.tree = { pathId: IDS.path, weeks: [], milestones: [{ id: IDS.milestone, state: "locked" }] };
    const body = await (await startBattle(post({ lang: "ar" }), milestoneParams)).json();
    expect(body).toEqual({ error: "milestone_locked", message: "أكمل الأسابيع ١–٤ أولاً، ثم عُد إلى التحدي الكبير!" });
  });

  it("passes the canonical InteractionAnswer to record_milestone_answer", async () => {
    const tables = seed();
    const battleId = (await (await startBattle(post({}), milestoneParams)).json()).battle.battleId;
    const display = correctChoice(tables, battleId, 0);
    await answer(post({ position: 0, choiceIndex: display }), battleParams(battleId));
    const call = mocks.rpcCalls.find((item) => item.name === "record_milestone_answer")!;
    expect(Object.keys(call.args).sort()).toEqual(["p_answer", "p_battle_id", "p_choice_index", "p_is_correct", "p_position", "p_response_text"]);
    expect(call.args).toMatchObject({
      p_battle_id: battleId, p_position: 0, p_choice_index: 2, p_response_text: null, p_is_correct: true,
      p_answer: { type: "choose_correct", selected_index: 2 },
    });
  });
});

describe("publish and unpublish", () => {
  function staffAs(userId: string, role: "teacher" | "admin") {
    mocks.teacherRole = role;
    mocks.userClient = { auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } };
  }
  const params = { params: Promise.resolve({ id: IDS.milestone }) };
  const publishedRow = (tables: Record<string, Row[]>) => {
    mocks.rpcOverride = (name) => (name.endsWith("publish_milestone") ? { data: tables.learning_path_milestones[0], error: null } : null);
  };

  it("refuses an approved teacher who did not build the path, before calling the database", async () => {
    const tables = seed();
    tables.learning_paths[0].created_by = "author-teacher";
    staffAs("other-teacher", "teacher");
    for (const route of [publish, unpublish]) {
      const response = await route(post({}), params);
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe("publish_forbidden");
    }
    expect(mocks.rpcCalls).toHaveLength(0);
  });

  it("lets the path's author and approved admins publish", async () => {
    const tables = seed();
    tables.learning_paths[0].created_by = "author-teacher";
    publishedRow(tables);
    staffAs("author-teacher", "teacher");
    expect((await publish(post({}), params)).status).toBe(200);
    staffAs("some-admin", "admin");
    expect((await unpublish(post({}), params)).status).toBe(200);
    expect(mocks.rpcCalls.map((call) => [call.name, call.args.p_actor])).toEqual([
      ["publish_milestone", "author-teacher"],
      ["unpublish_milestone", "some-admin"],
    ]);
  });

  it("maps the database's own publish_forbidden to a clean 403", async () => {
    const tables = seed();
    tables.learning_paths[0].created_by = "author-teacher";
    staffAs("author-teacher", "teacher");
    mocks.rpcOverride = () => ({ data: null, error: { message: "publish_forbidden" } });
    const response = await publish(post({}), params);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("publish_forbidden");
  });

  it("maps pool_too_small to 422", async () => {
    seed();
    staffAs("some-admin", "admin");
    mocks.rpcOverride = () => ({ data: null, error: { message: "pool_too_small: 5 auto-gradable questions, 8 needed" } });
    expect((await publish(post({}), params)).status).toBe(422);
  });
});
