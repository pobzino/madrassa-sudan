/**
 * Small progress bar shared by the progress surfaces (teacher student lists,
 * lesson cards). Matches the app's existing bar styling: gray-100 track, brand
 * fill, fully rounded, animated width.
 */
export default function ProgressBar({
  percent,
  tone = "brand",
  height = "md",
  className = "",
  label,
}: {
  percent: number;
  /** brand = watched/on track, amber = partially through, gray = untouched. */
  tone?: "brand" | "amber" | "gray";
  height?: "sm" | "md";
  className?: string;
  /** Accessible name, e.g. "Fractions — 60% watched". */
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const fill =
    tone === "amber" ? "bg-amber-500" : tone === "gray" ? "bg-gray-300" : "bg-[var(--primary)]";

  return (
    <div
      className={`overflow-hidden rounded-full bg-gray-100 ${height === "sm" ? "h-1.5" : "h-2.5"} ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full ${fill} transition-[width] duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
