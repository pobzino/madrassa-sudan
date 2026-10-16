// Shared between server routes and app UI. Owner: server builder. No server-only imports.
import type { LearnerAvatar } from "@/lib/learners/types";

export const MILESTONE_WEEKS_PER_BLOCK = 4;
export const MILESTONE_PASS_PERCENT = 75;
export const MILESTONE_DEFAULT_BATTLE_QUESTIONS = 12;
export const MILESTONE_MIN_BATTLE_QUESTIONS = 8;
export const MILESTONE_MAX_BATTLE_QUESTIONS = 16;
export const MILESTONE_DEFAULT_POOL_SIZE = 24;

export const BOSS_KEYS = ["number_giant", "word_dragon", "letter_camel", "sprout_buddy", "puzzle_owlet"] as const;
export type BossKey = (typeof BOSS_KEYS)[number];

export type MilestoneStatus = "draft" | "published";
export type BattleStatus = "active" | "won" | "lost" | "abandoned";
/** Learner-facing node state. "in_battle" = an active (resumable) battle exists. */
export type MilestoneLearnerState = "locked" | "available" | "in_battle" | "passed";
export type BattleQuestionType = "multiple_choice" | "true_false" | "short_answer";
export type Lang = "ar" | "en";

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
}

export interface BattleQuestion {
  position: number;                 // 0-based
  questionId: string;
  type: BattleQuestionType;
  instruction: string;              // localized task text (resolvePracticeQuestionPresentation)
  content: string | null;           // the word/number/sentence being assessed
  contentLanguage: Lang | null;
  answerLanguage: Lang;
  options: string[];                // DISPLAY order (per-battle permutation); [] for short_answer
  numericAnswer: boolean;           // short_answer expecting digits -> number pad
  imageUrl: string | null;
  audioUrl: string | null;          // cached narration for the requested language, if any
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
  bossHpPercent: number;            // 100 -> 0 ("puzzle meter"; 0 = boss won over)
  question: BattleQuestion | null;  // current question; null once finished
  certificateId: string | null;
}

export interface StartBattleResponse { battle: BattleState; resumed: boolean }
export interface GetBattleResponse { battle: BattleState | null }

export interface AnswerRequest {
  position: number;
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

export type MilestoneErrorCode =
  | "unauthorized" | "learner_forbidden" | "milestone_not_found" | "milestone_locked"
  | "milestone_unpublished" | "battle_not_found" | "battle_finished" | "position_mismatch"
  | "invalid_answer" | "pool_too_small" | "unpublish_first" | "use_battle"
  | "generation_failed" | "block_incomplete" | "service_unavailable";
export interface MilestoneError { error: MilestoneErrorCode; message?: string; battle?: BattleState }

// ---- teacher / admin ----
export interface TeacherMilestoneQuestion {
  id?: string;                      // absent = new (draft only)
  question_type: BattleQuestionType;
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
}
export interface TeacherMilestoneBlock {
  afterWeekNumber: number;
  weekNumbers: number[];            // [k-3..k] that exist
  lessonCount: number;
  lessonsWithContent: number;       // lessons with a sim deck (AI source)
  milestone: TeacherMilestoneRow | null;
}
export interface TeacherMilestoneListResponse { pathId: string | null; blocks: TeacherMilestoneBlock[] }
export interface TeacherMilestoneDetail { milestone: TeacherMilestoneRow; questions: TeacherMilestoneQuestion[];
  lessons: { id: string; title: string; weekNumber: number }[] }
export interface TeacherMilestoneUpdate {
  titleAr?: string; titleEn?: string | null; battleQuestionCount?: number; bossKey?: BossKey;
  questions?: TeacherMilestoneQuestion[];   // full replacement; when published: same ids only (text edits)
}
