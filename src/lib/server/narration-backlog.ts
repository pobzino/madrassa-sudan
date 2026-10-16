import "server-only";

// Every question a child can hear, voiced ahead of time: the published
// Practice questions (full text, both languages) and the published boss
// pools (the key line only, both languages). A clip is made once and kept in
// storage; the backlog is whatever has no current clip. The admin page starts
// it; a Netlify background function drains it through the internal route.

import type { LessonLanguageMode } from "@/lib/practice-language";
import { languageModeForLesson, type MilestoneAdminClient } from "@/lib/server/milestones/load";
import {
  cachedNarrationUrl,
  NARRATION_QUESTION_COLUMNS,
  narrateQuestion,
  questionNarration,
  type NarratableQuestion,
  type NarrationResult,
} from "@/lib/server/question-audio";

export type NarrationLang = "ar" | "en";
export type NarrationKind = "battle" | "practice";

export interface NarrationBacklogItem {
  questionId: string;
  lang: NarrationLang;
  kind: NarrationKind;
  /** Characters ElevenLabs will bill for this clip. */
  chars: number;
}

export interface NarrationBacklogSummary {
  /** Question × language pairs in scope. */
  pairs: number;
  missing: { battle: number; practice: number; ar: number; en: number; total: number };
  /** Characters still to be billed for the missing clips. */
  charsMissing: number;
}

type Narrator = (
  admin: MilestoneAdminClient,
  question: NarratableQuestion,
  language: NarrationLang,
  languageMode: LessonLanguageMode,
  options: { promptOnly: boolean; reuseStoredVariant: boolean },
) => Promise<NarrationResult>;

type AssignmentRow = { id: string; is_practice: boolean | null; is_milestone: boolean | null; lesson_id: string | null };
type QuestionRow = NarratableQuestion & { assignment_id: string; source_lesson_id?: string | null };

interface LoadedItem extends NarrationBacklogItem {
  question: QuestionRow;
  languageMode: LessonLanguageMode;
}

async function loadScope(admin: MilestoneAdminClient): Promise<{ items: LoadedItem[]; pairs: number }> {
  const { data: assignments } = await admin
    .from("homework_assignments")
    .select("id, is_practice, is_milestone, lesson_id")
    .eq("is_published", true)
    .or("is_practice.eq.true,is_milestone.eq.true")
    .returns<AssignmentRow[]>();
  const byAssignment = new Map((assignments ?? []).map((a) => [a.id, a]));
  if (!byAssignment.size) return { items: [], pairs: 0 };

  const { data: questions } = await admin
    .from("homework_questions")
    .select(`${NARRATION_QUESTION_COLUMNS}, source_lesson_id`)
    .in("assignment_id", [...byAssignment.keys()])
    .returns<QuestionRow[]>();

  // One language-mode lookup per lesson (the same rule the play routes use).
  const lessonIds = new Set<string>();
  for (const question of questions ?? []) {
    const assignment = byAssignment.get(question.assignment_id);
    const lessonId = assignment?.is_milestone ? question.source_lesson_id : assignment?.lesson_id;
    if (lessonId) lessonIds.add(lessonId);
  }
  const modes = new Map<string, LessonLanguageMode>();
  await Promise.all([...lessonIds].map(async (lessonId) => modes.set(lessonId, await languageModeForLesson(admin, lessonId))));

  const items: LoadedItem[] = [];
  let pairs = 0;
  for (const question of questions ?? []) {
    const assignment = byAssignment.get(question.assignment_id);
    if (!assignment) continue;
    const kind: NarrationKind = assignment.is_milestone ? "battle" : "practice";
    const lessonId = kind === "battle" ? question.source_lesson_id : assignment.lesson_id;
    const languageMode = (lessonId && modes.get(lessonId)) || "both";
    for (const lang of ["ar", "en"] as const) {
      pairs += 1;
      const { text, hash } = questionNarration(question, lang, languageMode, undefined, kind === "battle");
      if (!text.trim()) continue;
      if (cachedNarrationUrl(question, lang, hash)) continue;
      items.push({ questionId: question.id, lang, kind, chars: text.length, question, languageMode });
    }
  }
  // Battles first (children meet them with no other voice), then Practice.
  items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "battle" ? -1 : 1));
  return { items, pairs };
}

function summarise(items: NarrationBacklogItem[], pairs: number): NarrationBacklogSummary {
  const missing = { battle: 0, practice: 0, ar: 0, en: 0, total: items.length };
  let charsMissing = 0;
  for (const item of items) {
    missing[item.kind] += 1;
    missing[item.lang] += 1;
    charsMissing += item.chars;
  }
  return { pairs, missing, charsMissing };
}

export async function narrationBacklogSummary(admin: MilestoneAdminClient): Promise<NarrationBacklogSummary> {
  const { items, pairs } = await loadScope(admin);
  return summarise(items, pairs);
}

export interface NarrationBatchResult {
  done: number;
  failed: number;
  /** Pairs still missing after this batch (an estimate: failed ones are counted). */
  remaining: number;
  charsBilled: number;
  errors: string[];
}

/** Voices up to `limit` missing pairs, a few at a time (ElevenLabs allows a handful of concurrent requests). */
export async function runNarrationBatch(
  admin: MilestoneAdminClient,
  limit = 10,
  narrate: Narrator = narrateQuestion,
  parallel = 3,
): Promise<NarrationBatchResult> {
  const { items } = await loadScope(admin);
  const batch = items.slice(0, Math.max(1, Math.min(limit, 20)));
  const result: NarrationBatchResult = { done: 0, failed: 0, remaining: items.length, charsBilled: 0, errors: [] };
  let next = 0;
  const worker = async () => {
    while (next < batch.length) {
      const item = batch[next];
      next += 1;
      try {
        const outcome = await narrate(admin, item.question, item.lang, item.languageMode, { promptOnly: item.kind === "battle", reuseStoredVariant: true });
        if ("error" in outcome) throw new Error(outcome.error);
        result.done += 1;
        if (!outcome.cached) result.charsBilled += item.chars;
      } catch (error) {
        result.failed += 1;
        if (result.errors.length < 3) result.errors.push(`${item.kind} ${item.questionId} ${item.lang}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, batch.length) }, worker));
  result.remaining = items.length - result.done;
  console.log(JSON.stringify({ event: "narration_batch", ...result, errors: result.errors.slice(0, 1) }));
  return result;
}
