import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./milestone-fake-db";

vi.mock("server-only", () => ({}));

import { generateMilestonePool, milestoneTitles } from "@/lib/server/milestones/generate";
import { ITEM_TYPE_MIX, itemTypesForLesson, toGeneratedInteraction, type LessonItemRequest } from "@/lib/server/milestones/item-generator";
import { battleInteractionFor } from "@/lib/server/milestones/interactions";

type Row = Record<string, unknown>;

/** Flat interaction_* items, one per requested type, as the model would return them. */
function fakeItems(request: LessonItemRequest): unknown[] {
  const base = {
    interaction_options_ar: null, interaction_options_en: null, interaction_correct_index: null, interaction_true_false_answer: null,
    interaction_count_target: null, interaction_visual_emoji: null, interaction_items_ar: null, interaction_items_en: null,
    interaction_targets_ar: null, interaction_targets_en: null, interaction_solution_map: null, interaction_free_entry: null,
    interaction_expected_answer_ar: null, interaction_expected_answer_en: null,
  };
  return request.types.map((type, i) => {
    const tag = `${request.lessonTitleEn} ${i}`;
    const prompt = { interaction_type: type, interaction_prompt_ar: `سؤال ${tag}`, interaction_prompt_en: `Item ${tag}` };
    switch (type) {
      case "choose_correct":
        return { ...base, ...prompt, interaction_options_ar: ["أ", "ب", "ج"], interaction_options_en: ["A", "B", "C"], interaction_correct_index: 1 };
      case "true_false":
        return { ...base, ...prompt, interaction_prompt_en: `Statement ${tag}.`, interaction_true_false_answer: true };
      case "fill_missing_word":
        return { ...base, ...prompt, interaction_free_entry: false, interaction_options_ar: ["قط", "كلب"], interaction_options_en: ["cat", "dog"], interaction_correct_index: 0 };
      case "tap_to_count":
        return { ...base, ...prompt, interaction_count_target: 4, interaction_visual_emoji: "🍎" };
      case "match_pairs":
        return { ...base, ...prompt, interaction_items_ar: ["١", "٢"], interaction_items_en: ["1", "2"], interaction_targets_ar: ["واحد", "اثنان"], interaction_targets_en: ["one", "two"] };
      case "sequence_order":
        return { ...base, ...prompt, interaction_items_ar: ["أ", "ب", "ج"], interaction_items_en: ["a", "b", "c"] };
      case "sort_groups":
        return { ...base, ...prompt, interaction_items_ar: ["٢", "٣"], interaction_items_en: ["2", "3"], interaction_targets_ar: ["زوجي", "فردي"], interaction_targets_en: ["even", "odd"], interaction_solution_map: [0, 1] };
    }
  });
}

function seed() {
  const lessons = Array.from({ length: 8 }, (_, i) => `lesson-${i}`);
  const tables: Record<string, Row[]> = {
    learning_paths: [{ id: "path-1", subject_id: "subject-1" }],
    learning_path_milestones: [],
    learning_path_weeks: [1, 2, 3, 4].map((n) => ({ id: `week-${n}`, path_id: "path-1", week_number: n })),
    learning_path_steps: lessons.map((lesson, i) => ({ week_id: `week-${Math.floor(i / 2) + 1}`, lesson_id: lesson, sequence: i % 2 })),
    lessons: lessons.map((id, i) => ({ id, title_ar: `درس ${i}`, title_en: `Lesson ${i}`, grade_level: 2 })),
    subjects: [{ id: "subject-1", name_ar: "الرياضيات", name_en: "Maths" }],
    lesson_sims: lessons.slice(0, 7).map((lesson_id) => ({
      lesson_id, recorded_at: "2026-10-01", deck_snapshot: [{ id: "s1", type: "content", title_en: "Adding", body_en: "Two plus two is four.", title_ar: "الجمع", body_ar: "اثنان زائد اثنان أربعة." }],
    })),
    homework_assignments: [],
    homework_questions: [],
    milestone_battles: [],
  };
  return { tables, client: createFakeDb(tables).client };
}

describe("item mix", () => {
  it("rotates every generated type across a block's lessons", () => {
    const all = Array.from({ length: 8 }, (_, lesson) => itemTypesForLesson(lesson, 3)).flat();
    expect(new Set(all)).toEqual(new Set(ITEM_TYPE_MIX));
    expect(ITEM_TYPE_MIX).not.toContain("drag_drop_label");
  });

  it("turns flat items into validated interactions and drops broken ones", () => {
    const [good] = fakeItems({ content: "", lessonTitleAr: "", lessonTitleEn: "L", subjectName: "", gradeLevel: 1, types: ["match_pairs"] });
    expect(toGeneratedInteraction(good)).toMatchObject({ type: "match_pairs" });
    expect(toGeneratedInteraction({ ...(good as object), interaction_targets_en: ["one"] })).toBeNull();
    expect(toGeneratedInteraction({ ...(good as object), interaction_type: "draw_answer" })).toBeNull();
  });
});

describe("generateMilestonePool", () => {
  it("writes a draft milestone whose pool mixes interaction types, with keys only in the jsonb", async () => {
    const { tables, client } = seed();
    const generate = vi.fn(async (request: LessonItemRequest) => fakeItems(request));
    const result = await generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 4, poolSize: 24, actorId: "teacher-1", generate });

    expect(generate).toHaveBeenCalledTimes(7);
    expect(result.skippedLessons).toEqual(["lesson-7"]);
    expect(tables.homework_assignments[0]).toMatchObject({ is_milestone: true, cohort_id: null, is_practice: false, is_published: false, passing_score: 75, title_en: milestoneTitles(4).titleEn });
    expect(tables.learning_path_milestones[0]).toMatchObject({ status: "draft", boss_key: "number_giant", battle_question_count: 12 });
    const questions = tables.homework_questions;
    expect(questions.length).toBe(result.questionCount);
    expect(new Set(questions.map((q) => (q.interaction as { type: string }).type)).size).toBeGreaterThanOrEqual(6);
    expect(questions.every((q) => battleInteractionFor(q as never) !== null)).toBe(true);
    expect(questions.find((q) => (q.interaction as { type: string }).type === "match_pairs")).toMatchObject({ question_type: "long_answer", correct_answer: null });
    expect(milestoneTitles(4).titleAr).toBe("التحدي الكبير: الأسابيع ١–٤");
  });

  it("refuses to regenerate a published milestone, and needs all four weeks", async () => {
    const { tables, client } = seed();
    tables.learning_path_milestones.push({ id: "m-1", path_id: "path-1", after_week_number: 4, assignment_id: "a-1", status: "published" });
    await expect(generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 4, poolSize: 24, actorId: "t", generate: async () => [] }))
      .rejects.toMatchObject({ code: "unpublish_first", status: 409 });
    tables.learning_path_milestones.length = 0;
    tables.learning_path_weeks.pop();
    await expect(generateMilestonePool({ admin: client as never, pathId: "path-1", afterWeekNumber: 4, poolSize: 24, actorId: "t", generate: async () => [] }))
      .rejects.toMatchObject({ code: "block_incomplete", status: 400 });
  });
});
