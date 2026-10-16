/**
 * A learner is whoever is learning right now on a family account: the account
 * itself (its own profile), or one of its child profiles (no login of their
 * own). Shared by the server routes, the app and the offline player.
 */

/** Request header naming the active learner. Absent or the account's own id = the account itself. */
export const LEARNER_HEADER = "x-amal-learner";

/** Maximum number of child profiles. The account's own learner is additional. */
export const MAX_CHILD_PROFILES_PER_ACCOUNT = 8;
export const MAX_LEARNER_NAME_LENGTH = 60;
export const MIN_GRADE = 1;
export const MAX_GRADE = 12;

/** Animals a child picks so pre-readers can find their own tile. Kept in sync with profiles_avatar_check. */
export const LEARNER_AVATARS = [
  "cat",
  "dog",
  "lion",
  "elephant",
  "camel",
  "rabbit",
  "turtle",
  "fish",
  "bird",
  "monkey",
  "bear",
  "frog",
] as const;

/** New profile choices. Keep the legacy elephant value readable for profiles that already use it. */
export const LEARNER_AVATAR_CHOICES = LEARNER_AVATARS.filter((avatar) => avatar !== "elephant");

export type LearnerAvatar = (typeof LEARNER_AVATARS)[number];

export const LEARNER_AVATAR_LABELS: Record<LearnerAvatar, { en: string; ar: string }> = {
  cat: { en: "Cat", ar: "قطة" },
  dog: { en: "Dog", ar: "كلب" },
  lion: { en: "Lion", ar: "أسد" },
  elephant: { en: "Elephant", ar: "فيل" },
  camel: { en: "Camel", ar: "جمل" },
  rabbit: { en: "Rabbit", ar: "أرنب" },
  turtle: { en: "Turtle", ar: "سلحفاة" },
  fish: { en: "Fish", ar: "سمكة" },
  bird: { en: "Bird", ar: "عصفور" },
  monkey: { en: "Monkey", ar: "قرد" },
  bear: { en: "Bear", ar: "دب" },
  frog: { en: "Frog", ar: "ضفدع" },
};

export interface Learner {
  id: string;
  name: string;
  avatar: LearnerAvatar | null;
  gradeLevel: number | null;
  /** The account's own learner (can be renamed, never removed). */
  isSelf: boolean;
  /** A pending signup learner still needs a display name before progress opens. */
  needsSetup?: boolean;
}

/** A child the signup form mentioned who has no learner yet ("+ Add a child" is pre-filled with it). */
export interface SuggestedChild {
  name: string | null;
  age: number | null;
}

/** GET /api/learners */
export interface LearnersResponse {
  accountId: string;
  /** The account may create and manage child profiles (parents and approved admins). */
  canManageChildren?: boolean;
  /** True only for parent accounts; used to distinguish parent onboarding from admin access. */
  isParent?: boolean;
  /** Whether the account has room for another child profile. */
  canHaveChildren?: boolean;
  /** Whether the account learner still needs a display name. */
  needsSelfName?: boolean;
  /** The first child's age from signup, to pre-fill the naming step. */
  selfSuggestedAge: number | null;
  /** The account's own learner first, then children oldest-added first. */
  learners: Learner[];
  suggestedChildren?: SuggestedChild[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isLearnerAvatar(value: unknown): value is LearnerAvatar {
  return typeof value === "string" && (LEARNER_AVATARS as readonly string[]).includes(value);
}

/** A school grade for a child's age (6 → Grade 1), clamped to Grades 1–12. */
export function gradeFromAge(age: number): number {
  return Math.min(MAX_GRADE, Math.max(MIN_GRADE, Math.round(age) - 5));
}

/** The name to show for a learner profile: its learner name, else its full name. */
export function learnerDisplayName(profile: { full_name?: string | null; learner_name?: string | null }): string {
  return profile.learner_name?.trim() || profile.full_name?.trim() || "";
}
