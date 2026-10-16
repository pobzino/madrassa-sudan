/**
 * Public types for the Big Challenge characters (rigged SVG bosses and the
 * Amal owl). The battle screen codes against these, so keep them stable.
 */

/** Same union as `BossKey` in the milestone types; kept here so the characters have no app imports. */
export type BossKey =
  | "number_giant"
  | "letter_dragon"
  | "word_dragon"
  | "letter_camel"
  | "sprout_buddy"
  | "puzzle_owlet";

export const BOSS_KEYS: readonly BossKey[] = [
  "number_giant",
  "letter_dragon",
  "word_dragon",
  "letter_camel",
  "sprout_buddy",
  "puzzle_owlet",
];

/** A held state. Each pose has its own idle loop (breathing, blinking, and so on). */
export type Pose = "idle" | "taunt" | "windup" | "throw" | "hit" | "dizzy" | "ko" | "powered" | "happy" | "sleep";

export const POSES: readonly Pose[] = ["idle", "taunt", "windup", "throw", "hit", "dizzy", "ko", "powered", "happy", "sleep"];

/** A one-shot performance. `play()` resolves when it ends; the character then eases back to its current pose. */
export type BossAction =
  | "idle"
  | "blink"
  | "talk"
  | "taunt"
  | "windup"
  | "throw"
  | "hit"
  | "dizzy"
  | "ko"
  | "powered"
  | "happy"
  | "victory"
  | "land"
  | "sleep";

export const BOSS_ACTIONS: readonly BossAction[] = [
  "land",
  "idle",
  "blink",
  "talk",
  "taunt",
  "windup",
  "throw",
  "hit",
  "dizzy",
  "ko",
  "powered",
  "happy",
  "victory",
  "sleep",
];

export type OwlPose = "idle" | "cheer" | "think" | "wrong" | "block";

export const OWL_POSES: readonly OwlPose[] = ["idle", "cheer", "think", "wrong", "block"];

export type OwlAction = "idle" | "blink" | "talk" | "fire" | "block" | "cheer" | "wrong" | "think" | "land";

export const OWL_ACTIONS: readonly OwlAction[] = ["land", "idle", "blink", "talk", "fire", "block", "cheer", "wrong", "think"];

export interface PlayOptions {
  /** For `talk`: how long the mouth flaps, in ms (match the read-aloud clip). Default 1600. */
  durationMs?: number;
}

/**
 * Moments inside an action the battle screen may want to sync to:
 *  - `release`: a boss throw or owl fire lets go of its projectile
 *  - `impact`:  a hit or ko lands (shake the screen here)
 *  - `land`:    an entrance touches the ground
 *  - `shield`:  the owl's shield is up
 */
export type CharacterCue = "release" | "impact" | "land" | "shield";

export interface CharacterHandle<A extends string> {
  /** Runs a one-shot action. Resolves when it ends; the character then returns to its current pose's idle. */
  play(action: A, options?: PlayOptions): Promise<void>;
}

export type BossHandle = CharacterHandle<BossAction>;
export type OwlHandle = CharacterHandle<OwlAction>;
