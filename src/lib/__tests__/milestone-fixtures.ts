import type { BattleInteraction } from "@/lib/server/milestones/interactions";
import type { MilestoneBattleRow, MilestonePoolQuestion } from "@/lib/server/milestones/present";

export const BATTLE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const BATTLE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** A legacy multiple-choice row (no interaction jsonb). */
export function mcQuestion(overrides: Partial<MilestonePoolQuestion> = {}): MilestonePoolQuestion {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    assignment_id: "asg-1",
    question_type: "multiple_choice",
    question_text_ar: "كم يساوي ٣ + ٤؟",
    question_text_en: "What is 3 + 4?",
    instruction_ar: "اختر الإجابة الصحيحة",
    instruction_en: "Choose the right answer",
    question_content: "3 + 4",
    question_content_language: "en",
    answer_language: "en",
    options: ["5", "6", "7", "8"],
    options_ar: ["5", "6", "7", "8"],
    options_en: ["5", "6", "7", "8"],
    correct_answer: "7",
    correct_option_index: 2,
    source_lesson_id: "lesson-1",
    display_order: 1,
    interaction: null,
    audio_url_ar: null,
    audio_url_en: null,
    audio_text_hash_ar: null,
    audio_text_hash_en: null,
    ...overrides,
  };
}

export function tfQuestion(overrides: Partial<MilestonePoolQuestion> = {}): MilestonePoolQuestion {
  return mcQuestion({
    id: "22222222-2222-4222-8222-222222222222",
    question_type: "true_false",
    question_text_ar: "العدد ١٠ أكبر من ٥.",
    question_text_en: "10 is greater than 5.",
    question_content: null,
    options: ["صحيح", "خطأ"],
    options_ar: ["صحيح", "خطأ"],
    options_en: ["True", "False"],
    correct_answer: "true",
    correct_option_index: 0,
    ...overrides,
  });
}

export function shortQuestion(overrides: Partial<MilestonePoolQuestion> = {}): MilestonePoolQuestion {
  return mcQuestion({
    id: "33333333-3333-4333-8333-333333333333",
    question_type: "short_answer",
    question_text_ar: "كم يساوي ٦ + ٦؟",
    question_text_en: "What is 6 + 6?",
    question_content: "6 + 6",
    options: null,
    options_ar: null,
    options_en: null,
    correct_answer: "12",
    correct_option_index: null,
    ...overrides,
  });
}

const prompt = (en: string, ar: string) => ({ en, ar });
const list = (en: string[], ar: string[] = en) => ({ en, ar });

/** One canonical Interaction per battle type, with its answer key. */
export const INTERACTIONS = {
  choose_correct: { type: "choose_correct", prompt: prompt("Which is a fruit?", "أيّها فاكهة؟"), options: list(["Apple", "Chair", "Shoe", "Cup"], ["تفاحة", "كرسي", "حذاء", "كوب"]), correct_index: 0 },
  true_false: { type: "true_false", prompt: prompt("A cat has four legs.", "للقطة أربع أرجل."), answer: true },
  fill_missing_word: { type: "fill_missing_word", prompt: prompt("The sun is ___.", "الشمس ___."), free_entry: false, options: list(["hot", "cold", "wet"], ["حارّة", "باردة", "مبلّلة"]), correct_index: 0 },
  tap_to_count: { type: "tap_to_count", prompt: prompt("How many days are in a week? Tap that many stars.", "كم يوماً في الأسبوع؟ اضغط نجمة لكل يوم."), target: 7, emoji: "⭐" },
  match_pairs: { type: "match_pairs", prompt: prompt("Match the numbers.", "طابق الأعداد."), items: list(["one", "two", "three", "four"]), targets: list(["1", "2", "3", "4"]) },
  sequence_order: { type: "sequence_order", prompt: prompt("Put in order.", "رتّب."), items: list(["first", "second", "third", "fourth"]) },
  sort_groups: { type: "sort_groups", prompt: prompt("Sort them.", "صنّفها."), items: list(["2", "3", "4", "5", "6"]), targets: list(["even", "odd"], ["زوجي", "فردي"]), solution_map: [0, 1, 0, 1, 0] },
  drag_drop_label: {
    type: "drag_drop_label",
    prompt: prompt("Label the plant.", "سمِّ أجزاء النبتة."),
    image_url: "https://cdn.test/plant.png",
    labels: list(["leaf", "stem", "root"], ["ورقة", "ساق", "جذر"]),
    hotspots: [{ x_percent: 50, y_percent: 10 }, { x_percent: 50, y_percent: 50 }, { x_percent: 50, y_percent: 90 }],
  },
  trace_letter: { type: "trace_letter", prompt: prompt("Trace the letter baa ب!", "تتبّع حرف الباء ب!"), config: { script: "ar", letter: "ب", form: "isolated" } },
} satisfies { [K in BattleInteraction["type"]]: Extract<BattleInteraction, { type: K }> };

/** A pool row that stores an Interaction in its jsonb column. */
export function interactionQuestion(interaction: BattleInteraction, id = `q-${interaction.type}`): MilestonePoolQuestion {
  return mcQuestion({
    id,
    question_type: "long_answer",
    question_text_ar: interaction.prompt.ar,
    question_text_en: interaction.prompt.en,
    instruction_ar: interaction.prompt.ar,
    instruction_en: interaction.prompt.en,
    question_content: null,
    answer_language: null,
    options: null,
    options_ar: null,
    options_en: null,
    correct_answer: null,
    correct_option_index: null,
    interaction,
  });
}

export function battleRow(overrides: Partial<MilestoneBattleRow> = {}): MilestoneBattleRow {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    milestone_id: "88888888-8888-4888-8888-888888888888",
    assignment_id: "asg-1",
    learner_id: "learner-1",
    attempt_number: 1,
    is_preview: false,
    question_ids: Array.from({ length: 12 }, (_, i) => `q-${i}`),
    question_count: 12,
    required_correct: 9,
    hearts_total: 3,
    correct_count: 0,
    wrong_count: 0,
    answered_count: 0,
    status: "active",
    started_at: "2026-10-16T10:00:00Z",
    last_answer_at: null,
    finished_at: null,
    hint_used_question_index: null,
    hint_used_at: null,
    ...overrides,
  };
}
