import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./milestone-fake-db";

const openai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/openai-client", () => ({
  AI_MODEL: "big-model",
  AI_MODEL_FAST: "fast-model",
  getOpenAIClient: () => ({ chat: { completions: { create: openai.create } } }),
}));

import {
  checkGeneratedItem,
  generateLessonItems,
  itemsSchema,
  tagPrompt,
  type LessonItemRequest,
} from "@/lib/server/milestones/item-generator";
import { mergeTags, verdictSchema, verifyItemsWithModel, type ItemVerifier } from "@/lib/server/milestones/item-verifier";
import {
  finishMilestonePool,
  generateMilestonePool,
  generateMilestonePoolLesson,
  placementDifficultyPlan,
  planMilestonePool,
  PLACEMENT_TITLES,
  samplePlacementLessons,
} from "@/lib/server/milestones/generate";
import { clearSkillCache, defaultSkillForLesson } from "@/lib/server/measurement/skills";
import { normaliseTags, tagItemsWithModel } from "@/lib/server/measurement/tagger";
import { INTERACTIONS } from "./milestone-fixtures";

type Row = Record<string, unknown>;

const SKILLS: Row[] = [
  ["math.counting-sequences", 10, true], ["math.money", 30, true], ["math.time", 60, true], ["math.general", 990, true],
].map(([key, order, assessable]) => ({
  skill_key: key, subject_key: "math", label_en: `L ${key}`, label_ar: "ع", family_label_en: `F ${key}`, family_label_ar: "ف",
  assessable, sort_order: order, is_active: true,
}));

const base = {
  interaction_options_ar: null, interaction_options_en: null, interaction_correct_index: null, interaction_true_false_answer: null,
  interaction_count_target: null, interaction_visual_emoji: null, interaction_items_ar: null, interaction_items_en: null,
  interaction_targets_ar: null, interaction_targets_en: null, interaction_solution_map: null, interaction_free_entry: null,
  interaction_expected_answer_ar: null, interaction_expected_answer_en: null,
};
const choice = (tag: string, extra: Row = {}) => ({
  ...base, interaction_type: "choose_correct", interaction_prompt_ar: `سؤال ${tag}`, interaction_prompt_en: `Item ${tag}`,
  interaction_options_ar: ["أ", "ب", "ج"], interaction_options_en: ["A", "B", "C"], interaction_correct_index: 1, ...extra,
});

beforeEach(() => {
  openai.create.mockReset();
  clearSkillCache();
});

describe("generator tags", () => {
  it("builds the schema per request: skill_key enum = the subject's assessable skills, difficulty 1-3, both required", () => {
    const schema = itemsSchema(["math.money", "math.time", "math.money"]);
    const item = schema.properties.items.items;
    expect(item.properties.skill_key).toEqual({ type: "string", enum: ["math.money", "math.time"] });
    expect(item.properties.difficulty).toEqual({ type: "integer", enum: [1, 2, 3] });
    expect(item.required).toContain("skill_key");
    expect(item.required).toContain("difficulty");
  });

  it("puts the skills, the default skill, the scale and the plan in the prompt", async () => {
    const request: LessonItemRequest = {
      content: "Coins", lessonTitleAr: "النقود", lessonTitleEn: "Money", subjectName: "Maths", gradeLevel: 1, types: ["choose_correct", "true_false", "choose_correct"],
      skills: [{ key: "math.money", label: "Money" }, { key: "math.time", label: "Time" }], defaultSkillKey: "math.money", difficultyPlan: [2, 3, 1],
    };
    expect(tagPrompt(request)).toContain("prefer math.money when it fits");
    openai.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ items: [] }) } }] });
    await generateLessonItems(request);
    const call = openai.create.mock.calls[0][0];
    const prompt = call.messages[1].content as string;
    expect(prompt).toContain("SKILLS (pick the one each item checks; prefer math.money when it fits)");
    expect(prompt).toContain("- math.time: Time");
    expect(prompt).toContain("1 = recall");
    expect(prompt).toContain("DIFFICULTY, IN ORDER: 2, 3, 1");
    expect(prompt).toContain("Make each item that hard.");
    expect(call.response_format.json_schema.schema.properties.items.items.properties.skill_key.enum).toEqual(["math.money", "math.time"]);
  });

  it("never drops an item for its tags: unknown skill -> default, bad difficulty -> null", () => {
    const context = { skillKeys: ["math.money", "math.time"], defaultSkillKey: "math.money" };
    expect(checkGeneratedItem(choice("1", { skill_key: "math.time", difficulty: 3 }), context)).toMatchObject({ skillKey: "math.time", difficulty: 3 });
    expect(checkGeneratedItem(choice("2", { skill_key: "math.nope", difficulty: 7 }), context)).toMatchObject({ skillKey: "math.money" });
    expect(checkGeneratedItem(choice("3", { difficulty: 7 }), context)).not.toHaveProperty("difficulty");
    expect(checkGeneratedItem(choice("4"), context)).toMatchObject({ interaction: { type: "choose_correct" }, skillKey: "math.money" });
    // A broken item is still dropped for being broken, not for its tags.
    expect(checkGeneratedItem({ ...choice("5"), interaction_correct_index: 9 }, context)).toHaveProperty("reason");
  });

  it("defaults a lesson to its curriculum skill when assessable, else <subject>.general", () => {
    const skills = SKILLS.map((row) => ({ skillKey: row.skill_key as string, subjectKey: "math" as const, labelEn: "", labelAr: "", familyLabelEn: "", familyLabelAr: "", assessable: row.assessable as boolean, sortOrder: 0 }));
    expect(defaultSkillForLesson({ subjectKey: "math", topicId: "money" }, skills, "math")).toBe("math.money");
    expect(defaultSkillForLesson({ subjectKey: "math", topicId: "probability" }, skills, "math")).toBe("math.general");
    expect(defaultSkillForLesson(null, skills, "math")).toBe("math.general");
    expect(defaultSkillForLesson({ subjectKey: "english", topicId: "speaking-communication" }, [], "english")).toBe("english.general");
  });
});

describe("verifier tags", () => {
  it("adds the blind difficulty and skill to the verdict schema and result", async () => {
    expect(verdictSchema(["math.money"]).properties.verdicts.items.properties.skill_key).toEqual({ type: "string", enum: ["math.money"] });
    openai.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ verdicts: [{ index: 0, child_answer: "B", matches_key: true, ambiguous: false, wrong_key: false, needs_picture: false, incomplete_prompt: false, too_hard: false, reason: "", difficulty: 2, skill_key: "math.money" }] }) } }],
    });
    const [verdict] = await verifyItemsWithModel({ items: [INTERACTIONS.choose_correct], lessonTitleEn: "L", subjectName: "Maths", gradeLevel: 1, skills: [{ key: "math.money", label: "Money" }] });
    expect(verdict).toMatchObject({ difficulty: 2, skillKey: "math.money", matchesKey: true, flags: [] });
  });

  it("mergeTags: verifier difficulty wins, generator skill kept, disputed on a skill clash or two steps apart", () => {
    expect(mergeTags({ skillKey: "math.money", difficulty: 1 }, { skillKey: "math.money", difficulty: 2 })).toEqual({ skillKey: "math.money", difficulty: 2, tagSource: "model" });
    expect(mergeTags({ skillKey: "math.money", difficulty: 2 }, { skillKey: "math.time", difficulty: 2 })).toEqual({ skillKey: "math.money", difficulty: 2, tagSource: "model_disputed" });
    expect(mergeTags({ skillKey: "math.money", difficulty: 1 }, { skillKey: "math.money", difficulty: 3 })).toEqual({ skillKey: "math.money", difficulty: 3, tagSource: "model_disputed" });
    expect(mergeTags({ skillKey: "math.money", difficulty: 3 }, null)).toEqual({ skillKey: "math.money", difficulty: 3, tagSource: "model" });
    expect(mergeTags({ skillKey: null, difficulty: null }, { difficulty: null, skillKey: null })).toEqual({ skillKey: null, difficulty: null, tagSource: "model" });
  });
});

describe("tagger", () => {
  it("batches by 20, keeps one valid tag per index, nulls unknown skills / bad difficulties", async () => {
    const items = Array.from({ length: 23 }, () => INTERACTIONS.true_false);
    const batches: number[] = [];
    const tags = await tagItemsWithModel(
      { items, subjectName: "Maths", gradeLevel: 1, skills: [{ key: "math.money", label: "Money" }] },
      async ({ items: batch }) => {
        batches.push(batch.length);
        return batch.map((_, index) => ({ index, skillKey: index === 0 ? "math.nope" : "math.money", difficulty: index === 1 ? (5 as never) : 2 }));
      },
    );
    expect(batches).toEqual([20, 3]);
    expect(tags).toHaveLength(23);
    expect(tags[0]).toEqual({ index: 0, skillKey: null, difficulty: 2 });
    expect(tags[1]).toEqual({ index: 1, skillKey: "math.money", difficulty: null });
    expect(tags[20]).toEqual({ index: 20, skillKey: null, difficulty: 2 });
    expect(normaliseTags([{ index: 0 }, { index: 0, skill_key: "math.money" }, { index: 9 }], 2, ["math.money"])).toEqual([{ index: 0, skillKey: null, difficulty: null }]);
  });
});

describe("retag", () => {
  it("tags untagged rows, never overwrites teacher tags, keeps a lesson skill and marks the dispute, then refreshes", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const q = (id: string, extra: Row) => ({ id, assignment_id: "asg", display_order: 1, question_type: "long_answer", interaction: INTERACTIONS.true_false, question_text_ar: "x", question_text_en: "x", ...extra });
    const tables: Record<string, Row[]> = {
      homework_questions: [
        q("q1", { skill_key: null, difficulty: null, tag_source: null }),
        q("q2", { skill_key: "math.money", difficulty: null, tag_source: "backfill_lesson" }),
        q("q3", { skill_key: "math.time", difficulty: null, tag_source: "teacher" }),
        q("q4", { skill_key: "math.money", difficulty: 2, tag_source: "model" }),
      ],
      learning_paths: [{ id: "path-1", subject_id: "subject-1" }],
      subjects: [{ id: "subject-1", name_ar: "الرياضيات", name_en: "Maths" }],
      lessons: [{ id: "l", subject_id: "subject-1", grade_level: 2 }],
      curriculum_skills: SKILLS,
    };
    const { client } = createFakeDb(tables, rpc as never);
    const { retagMilestone } = await import("@/lib/server/measurement/retag");
    const seen: number[] = [];
    const result = await retagMilestone(client as never, { id: "m-1", path_id: "path-1", assignment_id: "asg" } as never, "untagged", async ({ items }) => {
      seen.push(items.length);
      return items.map((_, index) => ({ index, skillKey: "math.time", difficulty: 3 as const }));
    });
    expect(seen).toEqual([2]);
    expect(result).toEqual({ tagged: 2, disputed: 1, unchanged: 2 });
    expect(tables.homework_questions[0]).toMatchObject({ skill_key: "math.time", difficulty: 3, tag_source: "model" });
    expect(tables.homework_questions[1]).toMatchObject({ skill_key: "math.money", difficulty: 3, tag_source: "model_disputed" });
    expect(tables.homework_questions[2]).toMatchObject({ skill_key: "math.time", difficulty: null, tag_source: "teacher" });
    expect(rpc).toHaveBeenCalledWith("measurement_refresh_tags", { p_milestone_id: "m-1" });
  });
});

describe("placement generation", () => {
  const lessonsN = 16;
  function seed(weeks = 8) {
    const lessons = Array.from({ length: lessonsN }, (_, i) => `lesson-${i}`);
    const topics = ["counting-sequences", "money", "time", "probability"];
    const tables: Record<string, Row[]> = {
      learning_paths: [{ id: "path-1", subject_id: "subject-1" }],
      learning_path_milestones: [],
      learning_path_weeks: Array.from({ length: weeks }, (_, n) => ({ id: `week-${n + 1}`, path_id: "path-1", week_number: n + 1 })),
      learning_path_steps: lessons.map((lesson, i) => ({ week_id: `week-${Math.min(weeks, Math.floor(i / 2) + 1)}`, lesson_id: lesson, sequence: i % 2 })),
      lessons: lessons.map((id, i) => ({ id, title_ar: `درس ${i}`, title_en: `Lesson ${i}`, grade_level: 1, curriculum_topic: { subjectKey: "math", topicId: topics[i % 4] } })),
      subjects: [{ id: "subject-1", name_ar: "الرياضيات", name_en: "Maths" }],
      curriculum_skills: SKILLS,
      lesson_sims: lessons.map((lesson_id) => ({ lesson_id, recorded_at: "2026-10-01", deck_snapshot: [{ id: "s1", type: "content", title_en: "Adding", body_en: "Two plus two is four.", title_ar: "الجمع", body_ar: "اثنان زائد اثنان أربعة." }] })),
      homework_assignments: [],
      homework_questions: [],
      milestone_battles: [],
    };
    return { tables, client: createFakeDb(tables).client };
  }
  const passAll: ItemVerifier = async ({ items }) => items.map((_, index) => ({ index, childAnswer: "B", matchesKey: true, flags: [], reason: "" }));
  // Items tagged as the plan asked (difficulty = plan[k]) and with the lesson's default skill.
  const byPlan = vi.fn(async (request: LessonItemRequest) =>
    request.types.map((_, k) => choice(`${request.lessonTitleEn}-${k}`, { skill_key: request.defaultSkillKey, difficulty: request.difficultyPlan?.[k] ?? 2 })));

  it("samples up to 12 lessons evenly over the path, preferring new skills", () => {
    const lessons = Array.from({ length: 24 }, (_, i) => ({ lessonId: `l${i}`, skillKey: `s${Math.floor(i / 6)}` }));
    const picked = samplePlacementLessons(lessons);
    expect(picked).toHaveLength(12);
    expect(new Set(picked.map((lesson) => lesson.skillKey)).size).toBe(4);
    expect(picked[0].lessonId).toBe("l0");
    expect(samplePlacementLessons(lessons.slice(0, 5))).toHaveLength(5);
  });

  it("rotates the difficulty plan [1,2,3] by lesson", () => {
    expect(placementDifficultyPlan(0, 5)).toEqual([1, 2, 3, 1, 2]);
    expect(placementDifficultyPlan(1, 3)).toEqual([2, 3, 1]);
    expect(placementDifficultyPlan(2, 3)).toEqual([3, 1, 2]);
  });

  it("writes a draft placement: kind, week 0, 12 questions, titles, tags, <= 3 items per lesson, <= 30 in all", async () => {
    const { tables, client } = seed();
    byPlan.mockClear();
    const result = await generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 99, poolSize: 24, actorId: "t", kind: "placement", generate: byPlan, verify: passAll });
    expect(byPlan).toHaveBeenCalledTimes(12);
    const requests = byPlan.mock.calls.map(([request]) => request);
    expect(requests[0].difficultyPlan).toEqual([1, 2, 3, 1, 2]);
    expect(requests[1].difficultyPlan?.slice(0, 3)).toEqual([2, 3, 1]);
    expect(requests[0].skills?.map((skill) => skill.key)).toEqual(["math.counting-sequences", "math.money", "math.time", "math.general"]);
    expect(tables.learning_path_milestones[0]).toMatchObject({ kind: "placement", after_week_number: 0, battle_question_count: 12, status: "draft", ...{ title_en: PLACEMENT_TITLES.titleEn, title_ar: PLACEMENT_TITLES.titleAr }, boss_key: "number_giant" });
    expect(tables.homework_assignments[0]).toMatchObject({ is_milestone: true, title_en: "Meet your first boss!" });
    const questions = tables.homework_questions;
    expect(questions.length).toBe(result.questionCount);
    expect(questions.length).toBeLessThanOrEqual(30);
    const perLesson = new Map<string, number>();
    for (const q of questions) perLesson.set(q.source_lesson_id as string, (perLesson.get(q.source_lesson_id as string) ?? 0) + 1);
    expect(Math.max(...perLesson.values())).toBeLessThanOrEqual(3);
    for (const d of [1, 2, 3]) expect(questions.filter((q) => q.difficulty === d).length).toBeGreaterThanOrEqual(3);
    expect(questions.every((q) => typeof q.skill_key === "string" && q.tag_source === "model" && q.tagged_at)).toBe(true);
    // lessons tagged with their curriculum skill (probability is not a seeded skill -> math.general)
    expect(new Set(questions.map((q) => q.skill_key))).toEqual(new Set(["math.counting-sequences", "math.money", "math.time", "math.general"]));
  });

  it("fails with generation_failed unless >= 12 items and >= 3 per difficulty", async () => {
    const { client } = seed();
    const allEasy = vi.fn(async (request: LessonItemRequest) => request.types.map((_, k) => choice(`${request.lessonTitleEn}-${k}`, { difficulty: 1 })));
    await expect(generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 0, poolSize: 24, actorId: "t", kind: "placement", generate: allEasy, verify: passAll }))
      .rejects.toMatchObject({ code: "generation_failed" });
  });

  it("needs at least one week; a Big Challenge still needs its four", async () => {
    const empty = seed(0);
    await expect(generateMilestonePool({ admin: empty.client as never, pathId: "path-1", afterWeekNumber: 0, poolSize: 24, actorId: "t", kind: "placement", generate: byPlan, verify: passAll }))
      .rejects.toMatchObject({ code: "block_incomplete" });
    const { tables, client } = seed();
    await generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 4, poolSize: 24, actorId: "t", generate: byPlan, verify: passAll });
    expect(tables.learning_path_milestones[0]).toMatchObject({ kind: "milestone", after_week_number: 4 });
    // Big Challenge items are tagged too, with no difficulty plan
    expect(byPlan.mock.calls.at(-1)?.[0].difficultyPlan).toBeUndefined();
  });

  it("stores the verifier's difficulty and marks disputes", async () => {
    const { tables, client } = seed();
    const hardVerifier: ItemVerifier = async ({ items }) => items.map((_, index) => ({ index, childAnswer: "B", matchesKey: true, flags: [], reason: "", difficulty: 3, skillKey: "math.time" }));
    const mixed = vi.fn(async (request: LessonItemRequest) => request.types.map((_, k) => choice(`${request.lessonTitleEn}-${k}`, { skill_key: "math.money", difficulty: 1 })));
    await generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 4, poolSize: 24, actorId: "t", generate: mixed, verify: hardVerifier });
    expect(tables.homework_questions.every((q) => q.difficulty === 3 && q.tag_source === "model_disputed" && q.skill_key === "math.money")).toBe(true);
  });

  describe("as short steps (plan, lesson, finish)", () => {
    const scope = (client: unknown) => ({ admin: client as never, pathId: "path-1", afterWeekNumber: 0, poolSize: 24, kind: "placement" as const });
    beforeEach(() => vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret"));

    it("writes the same placement draft as the one-request form", async () => {
      const one = seed();
      await generateMilestonePool({ ...scope(one.client), actorId: "t", generate: byPlan, verify: passAll });
      const steps = seed();
      const plan = await planMilestonePool(scope(steps.client));
      expect(plan.lessons).toHaveLength(12);
      const results = await Promise.all(plan.lessons.map(({ lessonId }) =>
        generateMilestonePoolLesson({ ...scope(steps.client), lessonId, generate: byPlan, verify: passAll })));
      // the results survive the trip through the browser
      const result = await finishMilestonePool({ ...scope(steps.client), actorId: "t", results: JSON.parse(JSON.stringify(results)) });
      const strip = (rows: Row[]) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "assignment_id", "tagged_at"].includes(key))));
      expect(strip(steps.tables.homework_questions)).toEqual(strip(one.tables.homework_questions));
      expect(result.questionCount).toBe(one.tables.homework_questions.length);
      expect(steps.tables.learning_path_milestones[0]).toMatchObject({ kind: "placement", status: "draft" });
    });

    it("drops a lesson whose result was changed or is unsigned, and a missing lesson counts as skipped", async () => {
      const { tables, client } = seed();
      const plan = await planMilestonePool(scope(client));
      const results = await Promise.all(plan.lessons.map(({ lessonId }) =>
        generateMilestonePoolLesson({ ...scope(client), lessonId, generate: byPlan, verify: passAll })));
      const forged = JSON.parse(JSON.stringify(results));
      forged[0].kept[0].interaction.prompt = { en: "Forged", ar: "مزور" };
      delete forged[1].signature;
      forged[2] = null;
      const result = await finishMilestonePool({ ...scope(client), actorId: "t", results: forged });
      const lessonsUsed = new Set(tables.homework_questions.map((q) => q.source_lesson_id));
      for (const index of [0, 1, 2]) {
        expect(lessonsUsed.has(plan.lessons[index].lessonId)).toBe(false);
        expect(result.skippedLessons).toContain(plan.lessons[index].lessonId);
      }
      expect(tables.homework_questions.some((q) => q.interaction_prompt_en === "Forged")).toBe(false);
    });

    it("refuses a lesson outside the block, and a signature from another block", async () => {
      const { client } = seed();
      await expect(generateMilestonePoolLesson({ ...scope(client), lessonId: "not-a-lesson", generate: byPlan, verify: passAll }))
        .rejects.toMatchObject({ code: "block_incomplete" });
      const plan = await planMilestonePool(scope(client));
      const signed = await generateMilestonePoolLesson({ ...scope(client), lessonId: plan.lessons[0].lessonId, generate: byPlan, verify: passAll });
      const other = seed();
      await expect(finishMilestonePool({ ...scope(other.client), pathId: "path-1", afterWeekNumber: 4, kind: "milestone", actorId: "t", results: [signed] }))
        .rejects.toMatchObject({ code: "generation_failed" });
    });
  });
});
