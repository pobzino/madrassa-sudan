export type HomeStats = {
  signups: number;
  lessonsCompleted: number;
  practiceAttempts: number;
  /** True when the numbers are fresh counts, false when they are fallback minimums. */
  live: boolean;
};

export function isHomeStats(value: unknown): value is HomeStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return (
    typeof stats.signups === "number" &&
    typeof stats.lessonsCompleted === "number" &&
    typeof stats.practiceAttempts === "number" &&
    typeof stats.live === "boolean"
  );
}

// Round down to a friendly "680+" style figure so the claim is never overstated.
export function roundDownStat(value: number) {
  if (value >= 1000) return Math.floor(value / 100) * 100;
  return Math.floor(value / 10) * 10;
}

export function statNumberFormat(language: "ar" | "en") {
  return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-GB");
}
