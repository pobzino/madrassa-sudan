"use client";

// Placeholder owl mascot for the Practice player. The SHAPE is a stand-in for
// the real brand asset — the reactions/animations are the deliverable and will
// transfer to final art (same mood API, same keyframes).

export type OwlMood = "idle" | "happy" | "sad" | "cheer";

interface PracticeOwlProps {
  mood: OwlMood;
  /** Bump to re-trigger the current mood's animation (e.g. per answer). */
  pulse?: number;
  className?: string;
}

export default function PracticeOwl({ mood, pulse = 0, className = "" }: PracticeOwlProps) {
  const animClass =
    mood === "happy" ? "owl-anim-happy" : mood === "sad" ? "owl-anim-sad" : mood === "cheer" ? "owl-anim-cheer" : "owl-anim-idle";

  return (
    <div key={`${mood}-${pulse}`} className={`${animClass} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-sm" role="img">
        {/* wings */}
        <ellipse className="owl-wing-l" cx="26" cy="74" rx="10" ry="20" fill="#E76F51" />
        <ellipse className="owl-wing-r" cx="94" cy="74" rx="10" ry="20" fill="#E76F51" />
        {/* body */}
        <ellipse cx="60" cy="72" rx="36" ry="40" fill="#F4A261" />
        <ellipse cx="60" cy="84" rx="24" ry="24" fill="#FCEBD5" />
        {/* ear tufts */}
        <path d="M32 40 L38 22 L48 36 Z" fill="#F4A261" />
        <path d="M88 40 L82 22 L72 36 Z" fill="#F4A261" />
        {/* feet */}
        <ellipse cx="48" cy="111" rx="7" ry="4" fill="#E76F51" />
        <ellipse cx="72" cy="111" rx="7" ry="4" fill="#E76F51" />

        {/* face */}
        {mood === "sad" ? (
          <g>
            {/* gently lidded eyes + soft brows — never harsh */}
            <path d="M36 52 q10 -8 20 0" stroke="#7A4419" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M64 52 q10 -8 20 0" stroke="#7A4419" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="46" cy="58" r="10" fill="white" />
            <circle cx="74" cy="58" r="10" fill="white" />
            <path d="M36 58 a10 10 0 0 0 20 0 Z" fill="#FCEBD5" opacity="0.9" />
            <path d="M64 58 a10 10 0 0 0 20 0 Z" fill="#FCEBD5" opacity="0.9" />
            <circle cx="46" cy="60" r="4" fill="#3D2410" />
            <circle cx="74" cy="60" r="4" fill="#3D2410" />
            {/* small round beak, tiny frown */}
            <path d="M55 70 L65 70 L60 79 Z" fill="#E9C46A" />
            <path d="M50 88 q10 -6 20 0" stroke="#D08C4A" strokeWidth="3" strokeLinecap="round" fill="none" transform="rotate(180 60 86)" />
          </g>
        ) : mood === "happy" || mood === "cheer" ? (
          <g>
            {/* closed happy arc eyes ^ ^ */}
            <path d="M36 58 q10 -12 20 0" stroke="#3D2410" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M64 58 q10 -12 20 0" stroke="#3D2410" strokeWidth="4" strokeLinecap="round" fill="none" />
            {/* blush */}
            <circle cx="36" cy="68" r="5" fill="#F28482" opacity="0.55" />
            <circle cx="84" cy="68" r="5" fill="#F28482" opacity="0.55" />
            {/* open beak */}
            <path d="M54 68 L66 68 L60 76 Z" fill="#E9C46A" />
            <path d="M55 76 q5 6 10 0" stroke="#D08C4A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>
        ) : (
          <g>
            {/* idle: big round eyes with blink */}
            <circle cx="46" cy="58" r="11" fill="white" />
            <circle cx="74" cy="58" r="11" fill="white" />
            <g className="owl-blink">
              <circle cx="46" cy="58" r="5" fill="#3D2410" />
              <circle cx="74" cy="58" r="5" fill="#3D2410" />
              <circle cx="48" cy="56" r="1.6" fill="white" />
              <circle cx="76" cy="56" r="1.6" fill="white" />
            </g>
            <path d="M55 69 L65 69 L60 78 Z" fill="#E9C46A" />
          </g>
        )}
      </svg>
    </div>
  );
}
