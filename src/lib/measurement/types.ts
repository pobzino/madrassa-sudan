// Shared between server routes and app UI. Owner: server builder. No server-only imports.
import type { BattleInteractionType, MilestoneKind } from "@/lib/milestones/types";
import type { LearnerAvatar } from "@/lib/learners/types";

// ---------- skills and tags ----------
export type Difficulty = 1 | 2 | 3;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3];
export type TagSource = "model" | "model_disputed" | "teacher" | "backfill_lesson";
export type SkillSubjectKey = "math" | "english" | "arabic" | "science" | "islamic" | "social" | "general";

export interface SkillInfo {
  skillKey: string;            // "math.counting-sequences": stable, never renamed
  subjectKey: SkillSubjectKey;
  labelEn: string;             // staff wording
  labelAr: string;
  familyLabelEn: string;       // parent / child wording
  familyLabelAr: string;
  assessable: boolean;         // battle items may be tagged with it
  sortOrder: number;
}
export interface SkillListResponse { subjectId: string; subjectKey: SkillSubjectKey; skills: SkillInfo[] }

/** A skill as shown to a family. */
export interface SkillChip { skillKey: string; subjectId: string; familyLabelEn: string; familyLabelAr: string }

// ---------- levels ----------
export type LevelBand = "getting_started" | "on_the_way" | "confident";
/** level_score >= on_the_way -> "on_the_way"; >= confident -> "confident"; else "getting_started". */
export const LEVEL_BAND_MIN = { on_the_way: 40, confident: 70 } as const;

// ---------- constants (mirrored in SQL; change both or neither) ----------
export const MIN_CELL_SIZE = 5;
export const PLACEMENT_QUESTION_COUNT = 12;
export const PLACEMENT_DIFFICULTY_PLAN: readonly Difficulty[] = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
export const PLACEMENT_MIN_PER_DIFFICULTY = 3;
export const PLACEMENT_SOURCE_WEEKS = 12;        // pool comes from weeks 1..min(12, last week)
export const PLACEMENT_MAX_SOURCE_LESSONS = 12;  // lessons sampled evenly across those weeks
export const PLACEMENT_DEFAULT_POOL_SIZE = 30;
export const PLACEMENT_MAX_PRIOR_LESSONS = 3;    // offered (and a valid baseline) while <= 3 lessons of the path are done
export const SKILL_LEARNED_MIN_ITEMS = 2;
export const SKILL_LEARNED_MIN_RATE = 0.75;
export const SKILL_STUCK_MAX_RATE = 0.5;
export const PARENT_WINDOW_DAYS = 30;

// ---------- placement (child) ----------
export interface PlacementOutcome {
  /** Skills with >= 1 right answer and at least half right. No numbers are ever shown to the child. */
  knownSkills: SkillChip[];
  /** The other skills seen in this placement: "we'll learn these together". */
  growingSkills: SkillChip[];
}

// ---------- parent card + weekly digest ----------
export interface SubjectGrowth {
  subjectId: string;
  subjectNameAr: string | null;
  subjectNameEn: string | null;
  /** The placement result; valid = taken before more than PLACEMENT_MAX_PRIOR_LESSONS lessons. */
  baseline: { band: LevelBand; measuredAt: string; valid: boolean } | null;
  /** The latest Big Challenge first try. */
  current: { band: LevelBand; measuredAt: string; afterWeekNumber: number } | null;
  /** A published placement the child can still play for this subject. */
  placementMilestoneId: string | null;
  skillsLearnedSinceStart: number;
}
export interface LearnerProgressSummary {
  learnerId: string;
  windowStart: string;   // ISO, now - 30 days
  windowEnd: string;     // ISO, now
  skillsLearned: SkillChip[];
  skillsPractised: SkillChip[];
  subjects: SubjectGrowth[];
}
/** GET /api/measurement/progress (active learner via x-amal-learner). */
export interface LearnerProgressResponse { summary: LearnerProgressSummary }

// ---------- impact (staff) ----------
export type ImpactSplit = "none" | "grade_band" | "age_band" | "subject" | "mode";
export type GradeBand = "1-2" | "3-4" | "5-6" | "7+" | "unknown";
export type AgeBand = "3-6" | "7-8" | "9-10" | "11-12" | "13+" | "unknown";
export type LearningMode = "online" | "offline_heavy" | "mixed" | "unknown";

export interface ImpactQuery {
  from: string;                 // YYYY-MM-DD, inclusive (UTC)
  to: string;                   // YYYY-MM-DD, inclusive (UTC)
  subjectId: string | null;
  pathId: string | null;
  split: ImpactSplit;
}
/**
 * The learners a report covers (owner rule, school / class based): "all" (approved admins: every learner),
 * "school" (a school's classes; id null = all the viewer's schools), "class" (one class; id null = all the
 * viewer's classes). "own_paths" is kept for compatibility and no longer returned. Every path is in pathIds.
 */
export interface ImpactScope { kind: "all" | "own_paths" | "school" | "class"; pathIds: string[]; id?: string | null; label?: string | null }

/** `group` is "all" or a band of the split. A suppressed row has `learners` and every number null. */
export interface ImpactRowBase { group: string; learners: number | null; suppressed: boolean }

export interface SkillGrowthRow extends ImpactRowBase {
  subjectId: string; skillKey: string; labelEn: string; labelAr: string;
  baselineRate: number | null; latestRate: number | null;     // 0..1
  growthPp: number | null; matchedGrowthPp: number | null;     // percentage points
}
export interface SubjectGrowthRow extends ImpactRowBase {
  subjectId: string;
  medianBaselineScore: number | null; medianLatestScore: number | null; // 0..100
  medianGrowth: number | null; improvedShare: number | null;            // points; 0..1
}
export interface BossRow extends ImpactRowBase {
  milestoneId: string; pathId: string; subjectId: string; afterWeekNumber: number;
  firstTryPassRate: number | null; eventualPassRate: number | null;
  medianAttemptsToPass: number | null; medianFirstTryScore: number | null;
  stuckLearners: number | null;
}
export interface StuckSkillRow extends ImpactRowBase {
  subjectId: string; skillKey: string; labelEn: string; labelAr: string;
  firstTryRate: number | null; stuckRate: number | null;
}
export type ItemFlag = "too_hard" | "too_easy" | "not_discriminating" | "difficulty_mismatch" | "low_n";
export interface ItemQaRow {
  questionId: string; milestoneId: string; kind: MilestoneKind;
  skillKey: string | null; difficulty: Difficulty | null; interactionType: BattleInteractionType | null;
  promptPreview: string;
  responses: number | null; learners: number | null;
  pValue: number | null; discrimination: number | null;
  flags: ItemFlag[]; suppressed: boolean;
}
export interface EngagementRow extends ImpactRowBase {
  activeLearners: number | null; completions: number | null;
  lessonsPerActiveWeek: number | null;
  medianActiveWeeks: number | null; p25ActiveWeeks: number | null; p75ActiveWeeks: number | null;
}
export interface EngagementWeek { weekStart: string; activeLearners: number | null; completions: number | null; suppressed: boolean }
export interface RetentionRow extends ImpactRowBase {
  cohortStart: string;    // week start (impact) or YYYY-MM (export)
  week1: number | null; week2: number | null; week4: number | null; week8: number | null; week12: number | null;
}
export interface PaceRow extends ImpactRowBase {
  milestoneId: string; subjectId: string; afterWeekNumber: number; expectedWeeks: number;
  medianWeeksToPass: number | null; p25WeeksToPass: number | null; p75WeeksToPass: number | null;
}
export interface PlacementCoverageRow extends ImpactRowBase {
  subjectId: string;
  startedPath: number | null; placementsCompleted: number | null; validBaselines: number | null;
  /** Owner rule: anyone may play the placement once; after more than PLACEMENT_MAX_PRIOR_LESSONS lessons it is "late" (shown to the family, never a baseline). */
  lateBaselines?: number | null;
}
/** First tries across every boss of the scope (the headline tile). */
export interface BossOverallRow extends ImpactRowBase { firstTryPassRate: number | null; medianFirstTryScore: number | null }
export interface ImpactReport {
  generatedAt: string;
  query: ImpactQuery;
  scope: ImpactScope;
  minCellSize: number;
  subjects: Array<{ id: string; nameAr: string | null; nameEn: string | null }>;
  bossLabels: Array<{ milestoneId: string; subjectId: string; afterWeekNumber: number; titleEn: string | null; titleAr: string }>;
  growth: { skills: SkillGrowthRow[]; subjects: SubjectGrowthRow[] };
  bosses: BossRow[];
  stuckSkills: StuckSkillRow[];
  itemQa: ItemQaRow[];
  engagement: { rows: EngagementRow[]; weeks: EngagementWeek[] };
  retention: RetentionRow[];
  pace: PaceRow[];
  placement: PlacementCoverageRow[];
  bossesOverall?: BossOverallRow[];
}
/** GET /api/teacher/measurement/impact?...&scope=all|school:<id>|class:<id> */
export interface ImpactResponse { report: ImpactReport }

// ---------- funder export (admin) ----------
export interface FunderTable {
  id: "reach" | "engagement" | "growth_subject" | "growth_skill" | "bosses" | "retention" | "mode";
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number | boolean | null>>;   // a suppressed cell is null; every row has `suppressed`
  footnotes: string[];
}
export interface FunderExport {
  generatedAt: string;
  period: { from: string; to: string };
  minCellSize: number;
  definitionsVersion: "measurement-v1";
  tables: FunderTable[];
  notes: string[];
}
/** GET /api/admin/measurement/export?format=json */
export interface FunderExportResponse { export: FunderExport }

// ---------- staff actions ----------
/** POST /api/teacher/measurement/placement/reset */
export interface PlacementResetRequest { learnerId: string; milestoneId: string; reason: string }
export interface PlacementResetResponse { ok: true; resetAt: string }
/** POST /api/teacher/milestones/[id]/retag */
export interface RetagRequest { scope: "untagged" | "all" }
export interface RetagResponse { tagged: number; disputed: number; unchanged: number }

export type MeasurementErrorCode =
  | "unauthorized" | "impact_forbidden" | "invalid_query" | "learner_forbidden"
  | "reset_forbidden" | "not_found" | "service_unavailable"
  | "invalid_code" | "already_member" | "class_forbidden";
export interface MeasurementError { error: MeasurementErrorCode; message?: string }

// ---------- schools and classes (owner rule: progress visibility is school / class based) ----------
// Who may see a child's progress: the owning parent (or the adult self account) and approved admins
// always; approved teachers only for approved, active members of their own classes; approved school
// admins for classes in their school. Children in no class: admins + family only. Enforced by the server
// (public.can_view_learner_progress); the app only asks. Aggregates suppress groups < MIN_CELL_SIZE;
// a teacher's own named class roster is not suppressed.

// parent / adult self: a child's classes
export type ClassMembershipStatus = "pending" | "active";
export interface LearnerClass {
  cohortId: string;
  name: string;
  schoolName: string | null;
  teacherNames: string[];
  status: ClassMembershipStatus;
  joinedAt: string | null;
}
/** GET /api/learners/[learnerId]/classes (owner parent or adult self). */
export interface LearnerClassesResponse { classes: LearnerClass[] }
/** POST /api/learners/classes/join: only the family enrols a child (pending until the teacher approves). */
export interface JoinClassRequest { code: string; learnerId: string }
export interface JoinClassResponse { cohortId: string; name: string; status: ClassMembershipStatus }
/** POST /api/learners/classes/leave: access stops at once. Response { ok: true }. */
export interface LeaveClassRequest { cohortId: string; learnerId: string }
export type ClassErrorCode = "invalid_code" | "already_member" | "learner_forbidden" | "not_found" | "unauthorized" | "service_unavailable";

// teacher: one class's progress
export interface ClassSubjectBands {
  subjectId: string;
  nameEn: string | null;
  nameAr: string | null;
  /** Children per current band; null when the class has fewer than MIN_CELL_SIZE children with a band. */
  bands: Record<LevelBand, number> | null;
}
export interface ClassChildProgress {
  learnerId: string;
  name: string;
  avatar: LearnerAvatar | null;
  subjects: Array<{ subjectId: string; nameEn: string | null; nameAr: string | null; baseline: LevelBand | null; current: LevelBand | null }>;
  skillsLearnedThisMonth: number;
  lastActiveAt: string | null;
}
/** GET /api/teacher/cohorts/[id]/progress (the class's approved teachers, its school's admins, approved admins). */
export interface ClassProgressResponse {
  cohort: { id: string; name: string; schoolName: string | null };
  /** Whole-class figures; each is null when fewer than MIN_CELL_SIZE children (small-group rule). */
  aggregates: { learners: number; activeThisMonth: number | null; skillsLearnedThisMonth: number | null; subjects: ClassSubjectBands[] };
  children: ClassChildProgress[];
  /** Join requests waiting for the teacher (also shown on the class's Students tab). */
  pending?: Array<{ requestId: string; learnerId: string; childName: string; parentName: string | null; requestedAt: string }>;
}
/** POST /api/teacher/cohorts/[id]/requests/[requestId] (a class teacher or an approved admin). */
export interface ClassRequestDecision { decision: "approve" | "decline" }
export interface ClassRequestDecisionResponse { requestId: string; status: "active" | "declined" }

// school admin: overview
export interface SchoolClassRow {
  cohortId: string;
  name: string;
  teacherNames: string[];
  learners: number | null;
  activeThisMonth: number | null;
  /** Median growth (level points) from starting boss to latest Big Challenge. */
  medianGrowth: number | null;
  suppressed: boolean;
}
/** GET /api/school/overview[?school_id=] (approved school admins; approved admins pass school_id). */
export interface SchoolOverviewResponse {
  school: { id: string; name: string };
  /** School-wide totals (small-group rule applies). */
  totals?: { classes: number; learners: number | null; activeThisMonth: number | null; suppressed: boolean };
  classes: SchoolClassRow[];
}

// impact scope switcher
export interface ImpactScopeOption { kind: "all" | "school" | "class"; id: string | null; label: string }
/** GET /api/teacher/measurement/scopes: what this viewer may switch between. */
export interface ImpactScopesResponse { options: ImpactScopeOption[] }
/** The impact query's `scope` param: "all", "school:<id>" or "class:<id>". */
export function scopeParam(option: Pick<ImpactScopeOption, "kind" | "id">): string {
  return option.kind === "all" || !option.id ? "all" : `${option.kind}:${option.id}`;
}
