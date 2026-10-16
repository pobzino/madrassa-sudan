// Shared between server routes and app UI. Owner: server builder. No server-only imports.
import type { LearnerAvatar } from "@/lib/learners/types";
import type { BilingualList, BilingualText, EnglishLetterCase, Interaction, InteractionAnswer, TraceLetterScript } from "@/lib/interactions/types";
import type { SlideInteractionHotspot } from "@/lib/slides.types";

export const MILESTONE_WEEKS_PER_BLOCK = 4;
export const MILESTONE_PASS_PERCENT = 75;
export const MILESTONE_DEFAULT_BATTLE_QUESTIONS = 12;
export const MILESTONE_MIN_BATTLE_QUESTIONS = 8;
export const MILESTONE_MAX_BATTLE_QUESTIONS = 16;
export const MILESTONE_DEFAULT_POOL_SIZE = 24;

export const BOSS_KEYS = ["number_giant", "word_dragon", "letter_camel", "sprout_buddy", "puzzle_owlet", "letter_dragon"] as const;
export type BossKey = (typeof BOSS_KEYS)[number];

export type MilestoneStatus = "draft" | "published";
// ---- added for measurement (phase 1) ----
export type MilestoneKind = "milestone" | "placement";

export type BattleStatus = "active" | "won" | "lost" | "abandoned" | "completed";          // + "completed" (placement only)
/** Learner-facing node state. "in_battle" = an active (resumable) battle exists. */
export type MilestoneLearnerState = "locked" | "available" | "in_battle" | "passed" | "completed"; // + "completed" (placement done)
export type BattleQuestionType = "multiple_choice" | "true_false" | "short_answer";
export type Lang = "ar" | "en";
/** Presentational turn: even question index = "attack" (the child strikes), odd = "block" (the boss throws, the child blocks). */
export type BattleTurn = "attack" | "block";
/** 1 while the boss has more than 50% health left, else 2. */
export type BattlePhase = 1 | 2;

/** Interaction types a battle can serve: all auto-gradable ones (no free_response / draw_answer). */
export const BATTLE_INTERACTION_TYPES = [
  "choose_correct", "true_false", "fill_missing_word", "tap_to_count",
  "match_pairs", "sequence_order", "sort_groups", "drag_drop_label",
  "trace_letter",
] as const;
export type BattleInteractionType = (typeof BATTLE_INTERACTION_TYPES)[number];

/**
 * An Interaction as the learner receives it: whitelisted fields only, every
 * answer key stripped, and every list in this battle's DISPLAY order (options,
 * items, targets/hotspots are shuffled per battle; answers are sent back as
 * InteractionAnswer using these display indexes and mapped back server-side).
 *  - choose_correct: no correct_index
 *  - true_false: no answer (True stays first)
 *  - fill_missing_word: no correct_index / expected_answer
 *  - tap_to_count: `catch_count` is how many to tap when the prompt doesn't
 *    ask for it ("Count 5 🍎!"); null when working the number out IS the
 *    question ("How many days are in a week? Tap that many ⭐!").
 *  - match_pairs: items and targets shuffled independently (no pair mapping)
 *  - sequence_order: items shuffled (never served in the correct order)
 *  - sort_groups: items and groups shuffled, no solution_map
 *  - drag_drop_label: labels and hotspots shuffled independently
 *  - trace_letter: the letter and its `guide` (the demo strokes the child
 *    watches and traces over). Not an answer key: tracing the shown letter IS
 *    the task; the server grades the strokes (shape, dots, stroke count).
 */
export type PublicInteraction =
  | { type: "choose_correct"; prompt: BilingualText; options: BilingualList }
  | { type: "true_false"; prompt: BilingualText }
  | { type: "fill_missing_word"; prompt: BilingualText; free_entry: boolean; options: BilingualList | null }
  | { type: "tap_to_count"; prompt: BilingualText; emoji: string; catch_count: number | null }
  | { type: "match_pairs"; prompt: BilingualText; items: BilingualList; targets: BilingualList }
  | { type: "sequence_order"; prompt: BilingualText; items: BilingualList }
  | { type: "sort_groups"; prompt: BilingualText; items: BilingualList; targets: BilingualList }
  | { type: "drag_drop_label"; prompt: BilingualText; image_url: string | null; labels: BilingualList; hotspots: SlideInteractionHotspot[] }
  | {
      type: "trace_letter";
      prompt: BilingualText;
      script: TraceLetterScript;
      letter: string;
      /** Arabic: always the isolated form; null for English. */
      form: "isolated" | null;
      /** English: capital or small; null for Arabic. */
      case: EnglishLetterCase | null;
      guide: TraceGuideStroke[];
    };

/** One stroke of a letter's guide, on a 0..1 box, in writing order and direction. */
export interface TraceGuideStroke {
  kind: "main" | "dot" | "hamza";
  width: number;
  points: [number, number][];
}

/** The Owl Hint, in display indexes. Never names the correct option of a choice. */
export interface OwlHint {
  /** choose_correct / fill_missing_word (choices): wrong options to hide. */
  hideOptionIds: number[];
  /**
   * match_pairs / sort_groups / drag_drop_label: one correct placement to lock
   * (itemIndex = item/label, targetIndex = target/group/hotspot).
   * sequence_order: the first item, placed in slot targetIndex = 0.
   */
  lockedPlacement: { itemIndex: number; targetIndex: number } | null;
}

export interface MilestoneSummary {
  id: string;
  pathId: string;
  subjectId: string;
  afterWeekNumber: number;          // 4, 8, 12...
  firstWeekNumber: number;          // afterWeekNumber - 3
  level: number;                    // afterWeekNumber / 4 -> boss looks tougher (1, 2, 3, 4+)
  titleAr: string;
  titleEn: string | null;
  bossKey: BossKey;
  questionCount: number;            // battle size N
  requiredCorrect: number;          // ceil(0.75 N)
  heartsTotal: number;              // N - requiredCorrect ("tries")
  /** Always set by the server; absent means "milestone". Placement: afterWeekNumber 0, firstWeekNumber 1, level 0. */
  kind?: MilestoneKind;
}

export interface BattleQuestion {
  position: number;                 // 0-based
  questionId: string;
  type: BattleInteractionType;
  interaction: PublicInteraction;   // what to render; display order, no answer keys
  instruction: string;              // localized task text (resolvePracticeQuestionPresentation)
  content: string | null;           // the word/number/sentence being assessed
  contentLanguage: Lang | null;
  answerLanguage: Lang;
  options: string[];                // localized choices in DISPLAY order (choose_correct, true_false, fill choices); [] otherwise
  numericAnswer: boolean;           // free-entry answer expecting digits -> number pad
  imageUrl: string | null;
  audioUrl: string | null;          // cached narration for the requested language, if any
  turn: BattleTurn;                 // position % 2 === 0 ? "attack" : "block" (grading unchanged)
}

export interface BattleState {
  battleId: string;
  milestoneId: string;
  attemptNumber: number;
  status: BattleStatus;
  preview: boolean;                 // staff try-out: no certificate, no notification
  questionCount: number;
  requiredCorrect: number;
  heartsTotal: number;
  heartsLeft: number;               // heartsTotal - wrongCount, never < 0
  correctCount: number;
  wrongCount: number;
  answeredCount: number;
  bossHpPercent: number;            // boss health remaining, 100 -> 0 (0 = boss defeated)
  question: BattleQuestion | null;  // current question; null once finished
  certificateId: string | null;
  combo: number;                    // current consecutive-correct streak (0 after a wrong answer)
  phase: BattlePhase;               // 1 while bossHpPercent > 50, else 2
  hintUsed: boolean;                // the one Owl Hint of this battle is spent
  hint: OwlHint | null;             // the hint applied to the CURRENT question (resume), else null
  kind?: MilestoneKind;
  /** Placement: false (no Owl Hint). Milestone: true. */
  hintAllowed?: boolean;
}

export interface StartBattleResponse { battle: BattleState; resumed: boolean }
export interface GetBattleResponse { battle: BattleState | null }

export interface AnswerRequest {
  position: number;
  /** Preferred: the answer in the served interaction's DISPLAY indexes. */
  answer?: InteractionAnswer;
  choiceIndex?: number;             // index into BattleQuestion.options (display order)
  text?: string;                    // short_answer, <= 200 chars
}

/** The ONLY grading info the client ever gets. Never contains the correct answer. */
export interface AnswerResult {
  correct: boolean;
  heartsLeft: number;
  bossHpPercent: number;
  finished: boolean;
  passed: boolean;                  // finished && won
  replay: boolean;                  // this position was already answered (idempotent retry)
  next: BattleQuestion | null;      // next question when !finished
  certificateId: string | null;     // when passed (and not preview)
  firstPass: boolean;               // certificate created by this answer -> parent notified
  stars: 1 | 2 | 3 | null;          // when passed
  combo: number;                    // consecutive-correct streak after this answer (0 after a wrong one)
  phase: BattlePhase;               // 1 while bossHpPercent > 50, else 2
  /** Placement: true. The UI reacts the same to every answer and never shows right/wrong. */
  neutral?: boolean;
  /** Placement, when finished: what to show the child. Null otherwise. */
  placement?: import("@/lib/measurement/types").PlacementOutcome | null;
}

/** POST /api/milestones/[id]/battle/hint: one Owl Hint per battle, for the current question. */
export interface HintRequest {
  position: number;                 // the current (unanswered) question
  lang?: Lang;
}
export interface HintResponse extends OwlHint {
  position: number;
}

export interface MilestoneIntroResponse {
  milestone: MilestoneSummary;
  subjectNameAr: string | null;
  subjectNameEn: string | null;
  state: MilestoneLearnerState;
  /** Why it is locked, for the "finish weeks 1-4 first" copy. */
  lockedReason: "block_incomplete" | null;
  activeBattle: { battleId: string; answeredCount: number; heartsLeft: number; bossHpPercent: number } | null;
  certificate: { id: string; awardedAt: string; stars: 1 | 2 | 3 } | null;
  attempts: number;
  /** The block's lessons in path order, for "Practise these lessons". */
  blockLessons: { lessonId: string; title: string; weekNumber: number }[];
  preview: boolean;
  kind?: MilestoneKind;
}

export interface CertificateView {
  id: string;
  learnerId: string;
  learnerName: string;
  learnerAvatar: LearnerAvatar | null;
  subjectId: string | null;
  subjectNameAr: string | null;
  subjectNameEn: string | null;
  titleAr: string;
  titleEn: string | null;
  afterWeekNumber: number;
  level: number;
  bossKey: BossKey;
  stars: 1 | 2 | 3;
  scorePercent: number;
  awardedAt: string;
}
export interface CertificateListResponse { certificates: CertificateView[] }

/** GET /api/milestones/boss-book: one entry per BOSS_KEYS boss, for the active learner only. */
export interface BossBookEntry {
  bossKey: BossKey;
  /** The learner has played at least one (non-preview) battle against this boss, or beaten it. */
  met: boolean;
  /** When this boss was first beaten (first certificate), else null. */
  beatenAt: string | null;
  /** Best stars kept across this boss's certificates, else null. */
  starsKept: 1 | 2 | 3 | null;
  /** The certificate with the best stars (earliest on a tie), else null. */
  certificateId: string | null;
  /** Times beaten: one per certificate (different subjects / blocks). */
  beatenCount: number;
  /** Subject of that certificate, or of the latest battle when only met. */
  subject: { id: string | null; nameAr: string | null; nameEn: string | null } | null;
  /** Weeks covered by that certificate / battle, e.g. { first: 1, last: 4 }. */
  weeks: { first: number; last: number } | null;
}
export interface BossBookResponse { entries: BossBookEntry[] }

export type MilestoneErrorCode =
  | "unauthorized" | "learner_forbidden" | "milestone_not_found" | "milestone_locked"
  | "milestone_unpublished" | "battle_not_found" | "battle_finished" | "position_mismatch"
  | "invalid_answer" | "pool_too_small" | "unpublish_first" | "use_battle"
  | "generation_failed" | "block_incomplete" | "service_unavailable"
  | "hint_used" | "hint_unavailable" | "publish_forbidden"
  | "placement_done" | "pool_unbalanced";
export interface MilestoneError { error: MilestoneErrorCode; message?: string; battle?: BattleState }

// ---- teacher / admin ----
export interface TeacherMilestoneQuestion {
  id?: string;                      // absent = new (draft only)
  /** "interaction" when the item is a full Interaction (then `interaction` is authoritative). */
  question_type: BattleQuestionType | "interaction";
  /** The item with its answer key (staff only). Legacy MC/TF/short rows have null. */
  interaction: Interaction | null;
  question_text_ar: string;
  question_text_en: string | null;
  instruction_ar: string | null;
  instruction_en: string | null;
  question_content: string | null;
  question_content_language: Lang | null;
  answer_language: Lang | null;
  options_ar: string[];
  options_en: string[];
  correct_option_index: number | null;  // MC/TF
  correct_answer: string;               // MC/TF: = options_ar[correct_option_index]; short: the answer
  source_lesson_id: string | null;
  display_order: number;
  skill_key?: string | null;                         // absent on PUT = keep stored value
  difficulty?: 1 | 2 | 3 | null;
  tag_source?: "model" | "model_disputed" | "teacher" | "backfill_lesson" | null;  // read-only (server sets "teacher" when a tag changes)
}
export interface TeacherMilestoneRow {
  id: string;
  pathId: string;
  afterWeekNumber: number;
  status: MilestoneStatus;
  assignmentId: string;
  titleAr: string;
  titleEn: string | null;
  bossKey: BossKey;
  battleQuestionCount: number;
  poolSize: number;
  autoGradableCount: number;
  generatedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  activeBattles: number;
  certificates: number;
  kind?: MilestoneKind;
  /** Gradable items per tagged difficulty; untagged counted under "none". */
  difficultyCounts?: { d1: number; d2: number; d3: number; none: number };
}
export interface TeacherMilestoneBlock {
  afterWeekNumber: number;
  weekNumbers: number[];            // [k-3..k] that exist
  lessonCount: number;
  lessonsWithContent: number;       // lessons with a sim deck (AI source)
  milestone: TeacherMilestoneRow | null;
}
export interface TeacherMilestoneListResponse {
  pathId: string | null;
  blocks: TeacherMilestoneBlock[];
  /** The path's placement ("Meet your first boss"), or null when not created. */
  placement?: TeacherMilestoneRow | null;
}
export interface TeacherMilestoneDetail { milestone: TeacherMilestoneRow; questions: TeacherMilestoneQuestion[];
  lessons: { id: string; title: string; weekNumber: number }[];
  /** The subject's skills, for the tag dropdown. */
  skills?: import("@/lib/measurement/types").SkillInfo[];
}
export interface TeacherMilestoneUpdate {
  titleAr?: string; titleEn?: string | null; battleQuestionCount?: number; bossKey?: BossKey;
  questions?: TeacherMilestoneQuestion[];   // full replacement; when published: same ids only (text edits)
}
