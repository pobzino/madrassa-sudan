import { OwlThinking } from "@/components/illustrations";

/**
 * The app's one loading state: the thinking owl, a short friendly line and
 * three bouncing green dots, on the app's light background. Used while the
 * learner space loads and by every Big Challenge screen.
 */
export default function AmalLoading({
  message,
  dir,
  fullScreen = false,
  className = "",
}: {
  message: string;
  dir?: "rtl" | "ltr";
  /** Cover the screen (above the dashboard chrome), for full-screen pages. */
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center ${
        fullScreen ? "fixed inset-0 z-[60] bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5" : "min-h-[40vh]"
      } ${className}`}
      role="status"
      aria-live="polite"
      dir={dir}
    >
      <OwlThinking className="mb-3 h-20 w-20" />
      <p className="font-fredoka text-lg font-bold text-gray-800">{message}</p>
      <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="h-2 w-2 animate-bounce rounded-full bg-[#007229]" style={{ animationDelay: `${dot * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}
