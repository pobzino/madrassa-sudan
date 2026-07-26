/**
 * Progress bar shared by the Practice player HUD and the teacher progress
 * views. Matches the app's bar styling: gray-100 track, brand fill, fully
 * rounded, animated width.
 */
export default function ProgressBar({
  percent,
  tone = "brand",
  height = "md",
  className = "",
  label,
}: {
  percent: number;
  tone?: "brand" | "amber";
  height?: "sm" | "md" | "lg";
  className?: string;
  /** Accessible name, e.g. "Fractions — 60% watched". */
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const track = height === "sm" ? "h-1.5" : height === "lg" ? "h-4" : "h-2.5";

  return (
    <div
      className={`overflow-hidden rounded-full bg-gray-100 ${track} ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${
          tone === "amber" ? "bg-amber-500" : "bg-[var(--primary)]"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
