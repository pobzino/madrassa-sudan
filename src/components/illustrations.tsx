// Custom SVG illustrations for child-friendly design
// Style: Friendly Illustrated - rounded, colorful, with personality

// ============================================
// FLOATING DECORATIONS - Hero section elements
// Full color, playful, with motion cues
// ============================================

export const FloatingBook = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Book body */}
    <path
      d="M12 14c0-2 1.5-3.5 3.5-3.5h33c2 0 3.5 1.5 3.5 3.5v36c0 2-1.5 3.5-3.5 3.5h-33c-2 0-3.5-1.5-3.5-3.5V14z"
      fill="#8B5CF6"
    />
    {/* Pages */}
    <path
      d="M16 14h32v34c0 1-1 2-2 2H18c-1 0-2-1-2-2V14z"
      fill="#F5F3FF"
    />
    {/* Spine shadow */}
    <path d="M16 14h4v36h-4z" fill="#DDD6FE" />
    {/* Page lines */}
    <path d="M24 22h18M24 28h18M24 34h14M24 40h16" stroke="#C4B5FD" strokeWidth="2" strokeLinecap="round" />
    {/* Bookmark */}
    <path d="M40 10v12l-3-2-3 2V10" fill="#F43F5E" />
    {/* Sparkle */}
    <circle cx="52" cy="12" r="2" fill="#FBBF24" />
    <circle cx="56" cy="18" r="1.5" fill="#FBBF24" opacity="0.6" />
  </svg>
);

export const FloatingPencil = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Pencil body */}
    <rect x="18" y="8" width="14" height="40" rx="2" fill="#FBBF24" />
    {/* Wood/tip section */}
    <path d="M18 42h14l-7 14-7-14z" fill="#FDE68A" />
    {/* Graphite tip */}
    <path d="M23 50h4l-2 6-2-6z" fill="#374151" />
    {/* Metal band */}
    <rect x="18" y="8" width="14" height="6" rx="1" fill="#F59E0B" />
    {/* Eraser */}
    <rect x="18" y="2" width="14" height="8" rx="2" fill="#FDA4AF" />
    {/* Shine */}
    <rect x="20" y="16" width="3" height="20" rx="1" fill="#FEF3C7" opacity="0.6" />
    {/* Motion lines */}
    <path d="M10 20c-2-1-4 0-5 2M8 30c-2 0-4 1-4 3" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const FloatingTarget = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Outer ring */}
    <circle cx="32" cy="32" r="26" fill="#FEE2E2" stroke="#EF4444" strokeWidth="3" />
    {/* Middle ring */}
    <circle cx="32" cy="32" r="18" fill="#FECACA" stroke="#EF4444" strokeWidth="3" />
    {/* Inner ring */}
    <circle cx="32" cy="32" r="10" fill="#FCA5A5" stroke="#EF4444" strokeWidth="3" />
    {/* Bullseye */}
    <circle cx="32" cy="32" r="4" fill="#EF4444" />
    {/* Arrow */}
    <path d="M48 16L34 30" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
    <path d="M48 16l-6 1 5 5" fill="#F59E0B" />
    {/* Impact stars */}
    <path d="M38 26l2-4 2 4-4-2 4 2" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const FloatingStar = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Main star */}
    <path
      d="M32 6l6 14h15l-12 10 5 15-14-9-14 9 5-15L11 20h15l6-14z"
      fill="#FBBF24"
      stroke="#F59E0B"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* Face - happy eyes */}
    <circle cx="26" cy="26" r="2" fill="#92400E" />
    <circle cx="38" cy="26" r="2" fill="#92400E" />
    {/* Smile */}
    <path d="M28 32c0 3 2 5 4 5s4-2 4-5" stroke="#92400E" strokeWidth="2" strokeLinecap="round" />
    {/* Blush */}
    <circle cx="22" cy="30" r="3" fill="#FDBA74" opacity="0.5" />
    <circle cx="42" cy="30" r="3" fill="#FDBA74" opacity="0.5" />
    {/* Sparkles around */}
    <circle cx="10" cy="14" r="2" fill="#FDE68A" />
    <circle cx="54" cy="10" r="1.5" fill="#FDE68A" />
    <circle cx="52" cy="48" r="2" fill="#FDE68A" />
  </svg>
);

export const FloatingPalette = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Palette base */}
    <ellipse cx="32" cy="34" rx="26" ry="22" fill="#FDF4FF" stroke="#A855F7" strokeWidth="2.5" />
    {/* Thumb hole */}
    <ellipse cx="20" cy="40" rx="6" ry="5" fill="white" stroke="#A855F7" strokeWidth="2" />
    {/* Paint blobs with personality */}
    <circle cx="22" cy="24" r="6" fill="#EF4444" />
    <circle cx="36" cy="20" r="6" fill="#FBBF24" />
    <circle cx="48" cy="28" r="5" fill="#10B981" />
    <circle cx="46" cy="42" r="5" fill="#3B82F6" />
    <circle cx="32" cy="44" r="4" fill="#EC4899" />
    {/* Paint highlights */}
    <circle cx="20" cy="22" r="2" fill="#FCA5A5" />
    <circle cx="34" cy="18" r="2" fill="#FDE68A" />
    <circle cx="46" cy="26" r="1.5" fill="#6EE7B7" />
    {/* Brush */}
    <rect x="50" y="4" width="4" height="16" rx="2" fill="#92400E" />
    <path d="M50 20h4l-2 8-2-8z" fill="#D97706" />
    <rect x="50" y="2" width="4" height="4" rx="1" fill="#6B7280" />
  </svg>
);

export const FloatingRocket = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Rocket body */}
    <path
      d="M32 4c-8 8-12 20-12 28 0 4 2 8 4 10h16c2-2 4-6 4-10 0-8-4-20-12-28z"
      fill="#E0E7FF"
      stroke="#6366F1"
      strokeWidth="2.5"
    />
    {/* Rocket tip */}
    <path d="M32 4c-4 4-6 10-6 14h12c0-4-2-10-6-14z" fill="#6366F1" />
    {/* Window */}
    <circle cx="32" cy="26" r="6" fill="#06B6D4" stroke="#6366F1" strokeWidth="2" />
    <circle cx="30" cy="24" r="2" fill="#A5F3FC" />
    {/* Fins */}
    <path d="M20 36l-8 10 8-2" fill="#F43F5E" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M44 36l8 10-8-2" fill="#F43F5E" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" />
    {/* Flames */}
    <ellipse cx="32" cy="50" rx="6" ry="10" fill="#F59E0B" />
    <ellipse cx="32" cy="52" rx="4" ry="7" fill="#FBBF24" />
    <ellipse cx="32" cy="54" rx="2" ry="4" fill="#FEF3C7" />
    {/* Stars/trail */}
    <circle cx="18" cy="56" r="2" fill="#FBBF24" opacity="0.6" />
    <circle cx="46" cy="58" r="1.5" fill="#FBBF24" opacity="0.6" />
    <circle cx="24" cy="62" r="1" fill="#FBBF24" opacity="0.4" />
  </svg>
);

// ============================================
// FEATURE ICONS - Card icons with personality
// Full color, friendly, recognizable
// ============================================

export const VideoIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Screen */}
    <rect x="6" y="12" width="44" height="34" rx="4" fill="#EDE9FE" stroke="#8B5CF6" strokeWidth="2.5" />
    {/* Screen shine */}
    <rect x="10" y="16" width="8" height="3" rx="1" fill="#C4B5FD" />
    {/* Play button */}
    <path d="M26 22v14l12-7-12-7z" fill="#8B5CF6" />
    {/* Film reel camera */}
    <circle cx="54" cy="20" r="8" fill="#DDD6FE" stroke="#8B5CF6" strokeWidth="2" />
    <circle cx="54" cy="20" r="3" fill="#8B5CF6" />
    <circle cx="54" cy="38" r="6" fill="#DDD6FE" stroke="#8B5CF6" strokeWidth="2" />
    <circle cx="54" cy="38" r="2" fill="#8B5CF6" />
    {/* Connection */}
    <path d="M50 24v10" stroke="#8B5CF6" strokeWidth="2" />
    {/* Sparkle */}
    <path d="M14 50l2-3 2 3-3-1 3 1" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const RobotIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Head */}
    <rect x="14" y="18" width="36" height="30" rx="6" fill="#CFFAFE" stroke="#06B6D4" strokeWidth="2.5" />
    {/* Antenna */}
    <path d="M32 6v12" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="32" cy="6" r="4" fill="#F43F5E" />
    <circle cx="32" cy="6" r="2" fill="#FDA4AF" />
    {/* Eyes - friendly */}
    <ellipse cx="24" cy="32" rx="5" ry="6" fill="white" stroke="#06B6D4" strokeWidth="2" />
    <ellipse cx="40" cy="32" rx="5" ry="6" fill="white" stroke="#06B6D4" strokeWidth="2" />
    <circle cx="25" cy="31" r="3" fill="#1E3A5F" />
    <circle cx="41" cy="31" r="3" fill="#1E3A5F" />
    <circle cx="26" cy="30" r="1" fill="white" />
    <circle cx="42" cy="30" r="1" fill="white" />
    {/* Happy smile */}
    <path d="M26 42c0 3 3 5 6 5s6-2 6-5" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
    {/* Cheeks */}
    <circle cx="18" cy="38" r="3" fill="#FBCFE8" opacity="0.6" />
    <circle cx="46" cy="38" r="3" fill="#FBCFE8" opacity="0.6" />
    {/* Ears */}
    <rect x="6" y="28" width="8" height="12" rx="2" fill="#A5F3FC" stroke="#06B6D4" strokeWidth="2" />
    <rect x="50" y="28" width="8" height="12" rx="2" fill="#A5F3FC" stroke="#06B6D4" strokeWidth="2" />
    {/* Body hint */}
    <path d="M24 48v8h16v-8" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ============================================
// OWL MASCOT SYSTEM - Animated poses
// Colors: Sudan flag - Red #D21034, Green #007229, White, Black
// ============================================

// Base owl - static
export const OwlTutorIcon = ({
  className = "",
}: {
  className?: string;
}) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Ear tufts */}
    <ellipse cx="14" cy="18" rx="5" ry="7" fill="#a01028" />
    <ellipse cx="50" cy="18" rx="5" ry="7" fill="#a01028" />

    {/* Main body */}
    <ellipse cx="32" cy="38" rx="24" ry="24" fill="#D21034" />

    {/* Facial disc */}
    <ellipse cx="32" cy="34" rx="18" ry="14" fill="#E8334F" />

    {/* Belly */}
    <ellipse cx="32" cy="52" rx="12" ry="8" fill="#FFF5F5" />

    {/* Eyes */}
    <ellipse cx="23" cy="32" rx="8" ry="9" fill="white" />
    <ellipse cx="41" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="25" cy="32" r="5" fill="#000000" />
    <circle cx="27" cy="30" r="2" fill="white" />
    <circle cx="39" cy="32" r="5" fill="#000000" />
    <circle cx="41" cy="30" r="2" fill="white" />

    {/* Beak */}
    <ellipse cx="32" cy="42" rx="4" ry="3" fill="#F59E0B" />
    <path d="M28 42 Q32 48 36 42" fill="#E08A05" />

    {/* Graduation cap - band */}
    <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />

    {/* Mortarboard top */}
    <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
    <path d="M8 12l24 8 24-8" stroke="#005C22" strokeWidth="1" fill="none" />

    {/* Button */}
    <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />

    {/* Tassel */}
    <path d="M32 10 Q40 14 44 22" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <ellipse cx="45" cy="24" rx="3" ry="4" fill="#F59E0B" />

    {/* Feet */}
    <ellipse cx="24" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
    <ellipse cx="40" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
  </svg>
);

// Logo component - owl + text like Duolingo
// Uses Fredoka font (playful, rounded) - must be loaded in layout
export const MadrassaLogo = ({
  className = "",
  size = "md"
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) => {
  const sizes = {
    sm: { icon: "w-8 h-8", text: "text-xl", gap: "gap-1.5" },
    md: { icon: "w-10 h-10", text: "text-2xl", gap: "gap-2" },
    lg: { icon: "w-14 h-14", text: "text-4xl", gap: "gap-3" }
  };

  return (
    <div className={`flex items-center ${sizes[size].gap} ${className}`}>
      <OwlTutorIcon className={sizes[size].icon} />
      <span className={`font-fredoka font-semibold ${sizes[size].text} tracking-tight text-[#007229]`}>
        madrassa
      </span>
    </div>
  );
};

// Waving owl - for greetings and welcome screens
export const OwlWaving = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 72 64" fill="none">
    <style>{`
      @keyframes wave-arm {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-30deg); }
      }
      .owl-arm-wave { transform-origin: 12px 38px; animation: wave-arm 0.5s ease-in-out infinite; }
    `}</style>

    {/* Ear tufts */}
    <ellipse cx="18" cy="18" rx="5" ry="7" fill="#a01028" />
    <ellipse cx="54" cy="18" rx="5" ry="7" fill="#a01028" />

    {/* Main body - shifted right to make room for arm */}
    <ellipse cx="36" cy="38" rx="24" ry="24" fill="#D21034" />

    {/* Facial disc */}
    <ellipse cx="36" cy="34" rx="18" ry="14" fill="#E8334F" />

    {/* Belly */}
    <ellipse cx="36" cy="52" rx="12" ry="8" fill="#FFF5F5" />

    {/* Waving wing - small wing on left side */}
    <g className="owl-arm-wave">
      <ellipse cx="8" cy="36" rx="6" ry="10" fill="#a01028" />
      <ellipse cx="6" cy="32" rx="3" ry="4" fill="#E8334F" />
    </g>

    {/* Happy eyes */}
    <ellipse cx="27" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="29" cy="32" r="5" fill="#000000" />
    <circle cx="31" cy="30" r="2" fill="white" />

    <ellipse cx="45" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="43" cy="32" r="5" fill="#000000" />
    <circle cx="45" cy="30" r="2" fill="white" />

    {/* Beak */}
    <ellipse cx="36" cy="42" rx="4" ry="3" fill="#F59E0B" />

    {/* Graduation cap */}
    <path d="M16 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
    <path d="M12 12l24-6 24 6-24 8-24-8z" fill="#007229" />
    <circle cx="36" cy="10" r="2.5" fill="#1a1a1a" />
    <path d="M36 10 Q44 14 48 22" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <ellipse cx="49" cy="24" rx="3" ry="4" fill="#F59E0B" />

    {/* Feet */}
    <ellipse cx="28" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
    <ellipse cx="44" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
  </svg>
);

// Celebrating owl - for achievements and correct answers
export const OwlCelebrating = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <style>{`
      @keyframes bounce {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-4px) scale(1.05); }
      }
      @keyframes sparkle {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }
      .owl-celebrate { animation: bounce 0.5s ease-in-out infinite; }
      .sparkle { animation: sparkle 0.6s ease-in-out infinite; }
      .sparkle-delay { animation-delay: 0.2s; }
    `}</style>

    {/* Sparkles */}
    <circle className="sparkle" cx="8" cy="10" r="2" fill="#F59E0B" />
    <circle className="sparkle sparkle-delay" cx="56" cy="8" r="2.5" fill="#F59E0B" />
    <circle className="sparkle" cx="4" cy="30" r="1.5" fill="#F59E0B" />
    <circle className="sparkle sparkle-delay" cx="60" cy="28" r="2" fill="#F59E0B" />

    <g className="owl-celebrate">
      {/* Ear tufts */}
      <ellipse cx="14" cy="18" rx="5" ry="7" fill="#a01028" />
      <ellipse cx="50" cy="18" rx="5" ry="7" fill="#a01028" />

      {/* Main body */}
      <ellipse cx="32" cy="38" rx="24" ry="24" fill="#D21034" />

      {/* Facial disc */}
      <ellipse cx="32" cy="34" rx="18" ry="14" fill="#E8334F" />

      {/* Belly */}
      <ellipse cx="32" cy="52" rx="12" ry="8" fill="#FFF5F5" />

      {/* Happy squinty eyes */}
      <path d="M16 32 Q23 26 30 32" stroke="#000" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M34 32 Q41 26 48 32" stroke="#000" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Beak */}
      <ellipse cx="32" cy="42" rx="4" ry="3" fill="#F59E0B" />

      {/* Graduation cap */}
      <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
      <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
      <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />
      <path d="M32 10 Q40 14 44 22" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <ellipse cx="45" cy="24" rx="3" ry="4" fill="#F59E0B" />

      {/* Feet */}
      <ellipse cx="24" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
      <ellipse cx="40" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
    </g>
  </svg>
);

// Thinking owl - for loading states
export const OwlThinking = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 70 64" fill="none">
    <style>{`
      @keyframes think-dots {
        0%, 80%, 100% { opacity: 0; transform: translateY(0); }
        40% { opacity: 1; transform: translateY(-3px); }
      }
      .think-dot-1 { animation: think-dots 1.4s ease-in-out infinite; }
      .think-dot-2 { animation: think-dots 1.4s ease-in-out 0.2s infinite; }
      .think-dot-3 { animation: think-dots 1.4s ease-in-out 0.4s infinite; }
    `}</style>

    {/* Thinking dots */}
    <circle className="think-dot-1" cx="54" cy="14" r="2.5" fill="#007229" />
    <circle className="think-dot-2" cx="59" cy="9" r="3" fill="#007229" />
    <circle className="think-dot-3" cx="65" cy="4" r="3.5" fill="#007229" />

    {/* Ear tufts */}
    <ellipse cx="14" cy="18" rx="5" ry="7" fill="#a01028" />
    <ellipse cx="50" cy="18" rx="5" ry="7" fill="#a01028" />

    {/* Main body */}
    <ellipse cx="32" cy="38" rx="24" ry="24" fill="#D21034" />

    {/* Facial disc */}
    <ellipse cx="32" cy="34" rx="18" ry="14" fill="#E8334F" />

    {/* Belly */}
    <ellipse cx="32" cy="52" rx="12" ry="8" fill="#FFF5F5" />

    {/* Eyes looking up */}
    <ellipse cx="23" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="25" cy="28" r="5" fill="#000000" />
    <circle cx="27" cy="26" r="2" fill="white" />

    <ellipse cx="41" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="39" cy="28" r="5" fill="#000000" />
    <circle cx="41" cy="26" r="2" fill="white" />

    {/* Beak - neutral */}
    <ellipse cx="32" cy="42" rx="4" ry="3" fill="#F59E0B" />
    <path d="M28 42 Q32 46 36 42" fill="#E08A05" />

    {/* Graduation cap */}
    <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
    <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
    <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />
    <path d="M32 10 Q40 14 44 22" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <ellipse cx="45" cy="24" rx="3" ry="4" fill="#F59E0B" />

    {/* Feet */}
    <ellipse cx="24" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
    <ellipse cx="40" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
  </svg>
);

// Sad owl - for wrong answers or errors
export const OwlSad = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Ear tufts - droopy */}
    <ellipse cx="12" cy="20" rx="5" ry="6" fill="#a01028" transform="rotate(-15 12 20)" />
    <ellipse cx="52" cy="20" rx="5" ry="6" fill="#a01028" transform="rotate(15 52 20)" />

    {/* Main body */}
    <ellipse cx="32" cy="38" rx="24" ry="24" fill="#D21034" />

    {/* Facial disc */}
    <ellipse cx="32" cy="34" rx="18" ry="14" fill="#E8334F" />

    {/* Belly */}
    <ellipse cx="32" cy="52" rx="12" ry="8" fill="#FFF5F5" />

    {/* Sad eyes */}
    <ellipse cx="23" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="25" cy="34" r="5" fill="#000000" />
    <circle cx="27" cy="32" r="2" fill="white" />
    {/* Sad eyebrow */}
    <path d="M16 26 L30 30" stroke="#a01028" strokeWidth="2" strokeLinecap="round" />

    <ellipse cx="41" cy="32" rx="8" ry="9" fill="white" />
    <circle cx="39" cy="34" r="5" fill="#000000" />
    <circle cx="41" cy="32" r="2" fill="white" />
    {/* Sad eyebrow */}
    <path d="M48 26 L34 30" stroke="#a01028" strokeWidth="2" strokeLinecap="round" />

    {/* Beak */}
    <ellipse cx="32" cy="42" rx="4" ry="3" fill="#F59E0B" />

    {/* Graduation cap - tilted */}
    <g transform="rotate(-8 32 16)">
      <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
      <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
      <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />
      <path d="M32 10 Q40 14 44 22" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <ellipse cx="45" cy="24" rx="3" ry="4" fill="#F59E0B" />
    </g>

    {/* Feet */}
    <ellipse cx="24" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
    <ellipse cx="40" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
  </svg>
);

// ============================================
// NAV ICONS - Colorful sidebar navigation icons
// ============================================

export const HomeNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    {/* House body */}
    <path d="M4 10L12 4L20 10V20C20 20.5 19.5 21 19 21H5C4.5 21 4 20.5 4 20V10Z" fill="#007229" />
    {/* Roof */}
    <path d="M2 11L12 3L22 11" stroke="#005C22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    {/* Door */}
    <rect x="9" y="13" width="6" height="8" rx="0.5" fill="#F59E0B" />
    {/* Window */}
    <rect x="6" y="12" width="3" height="3" rx="0.5" fill="#FEF3C7" />
    <rect x="15" y="12" width="3" height="3" rx="0.5" fill="#FEF3C7" />
    {/* Door knob */}
    <circle cx="14" cy="17" r="0.75" fill="#D97706" />
  </svg>
);

export const BookNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    {/* Book cover */}
    <path d="M4 4C4 3 5 2 6 2H18C19 2 20 3 20 4V20C20 21 19 22 18 22H6C5 22 4 21 4 20V4Z" fill="#D21034" />
    {/* Pages */}
    <path d="M6 4H18V20H6V4Z" fill="#FFF5F5" />
    {/* Spine */}
    <rect x="4" y="2" width="3" height="20" fill="#a01028" />
    {/* Page lines */}
    <path d="M9 8H16M9 11H16M9 14H13" stroke="#D21034" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    {/* Bookmark */}
    <path d="M14 2V7L15.5 5.5L17 7V2" fill="#F59E0B" />
  </svg>
);

export const ClipboardNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    {/* Clipboard body */}
    <rect x="4" y="4" width="16" height="18" rx="2" fill="#F59E0B" />
    {/* Paper */}
    <rect x="6" y="6" width="12" height="14" rx="1" fill="white" />
    {/* Clip */}
    <rect x="8" y="2" width="8" height="4" rx="1" fill="#D97706" />
    <rect x="10" y="1" width="4" height="3" rx="0.5" fill="#92400E" />
    {/* Checkboxes */}
    <rect x="8" y="9" width="3" height="3" rx="0.5" fill="#007229" />
    <path d="M8.5 10.5L9.5 11.5L11 9.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="8" y="14" width="3" height="3" rx="0.5" fill="#007229" />
    <path d="M8.5 15.5L9.5 16.5L11 14.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    {/* Lines */}
    <path d="M13 10H16M13 15H15" stroke="#D97706" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
  </svg>
);

export const UsersNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    {/* Back person */}
    <circle cx="17" cy="7" r="3" fill="#00913D" />
    <path d="M13 21V19C13 17 14.5 15 17 15C19.5 15 21 17 21 19V21" fill="#00913D" />
    {/* Front person */}
    <circle cx="9" cy="8" r="4" fill="#D21034" />
    <path d="M3 21V19C3 16 5.5 14 9 14C12.5 14 15 16 15 19V21" fill="#D21034" />
  </svg>
);

export const ChartNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    {/* Bars */}
    <rect x="3" y="14" width="4" height="8" rx="1" fill="#007229" />
    <rect x="10" y="8" width="4" height="14" rx="1" fill="#D21034" />
    <rect x="17" y="4" width="4" height="18" rx="1" fill="#F59E0B" />
    {/* Growth arrow */}
    <path d="M5 12L12 6L19 2" stroke="#005C22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 2H19V6" stroke="#005C22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SettingsNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    {/* Gear outer */}
    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" fill="#007229" />
    {/* Gear teeth */}
    <path d="M19.4 15C19.1 15.6 19.2 16.3 19.6 16.8L19.7 16.9C20 17.2 20.2 17.7 20.2 18.2C20.2 18.7 20 19.2 19.7 19.5C19.4 19.8 18.9 20 18.4 20C17.9 20 17.4 19.8 17.1 19.5L17 19.4C16.5 19 15.8 18.9 15.2 19.2C14.6 19.5 14.2 20.1 14.2 20.8V21C14.2 22.1 13.3 23 12.2 23H11.8C10.7 23 9.8 22.1 9.8 21V20.8C9.8 20.1 9.4 19.5 8.8 19.2C8.2 18.9 7.5 19 7 19.4L6.9 19.5C6.6 19.8 6.1 20 5.6 20C5.1 20 4.6 19.8 4.3 19.5C4 19.2 3.8 18.7 3.8 18.2C3.8 17.7 4 17.2 4.3 16.9L4.4 16.8C4.8 16.3 4.9 15.6 4.6 15C4.3 14.4 3.7 14 3 14H2.8C1.7 14 0.8 13.1 0.8 12V11.6C0.8 10.5 1.7 9.6 2.8 9.6H3C3.7 9.6 4.3 9.2 4.6 8.6C4.9 8 4.8 7.3 4.4 6.8L4.3 6.7C4 6.4 3.8 5.9 3.8 5.4C3.8 4.9 4 4.4 4.3 4.1C4.6 3.8 5.1 3.6 5.6 3.6C6.1 3.6 6.6 3.8 6.9 4.1L7 4.2C7.5 4.6 8.2 4.7 8.8 4.4C9.4 4.1 9.8 3.5 9.8 2.8V2.6C9.8 1.5 10.7 0.6 11.8 0.6H12.2C13.3 0.6 14.2 1.5 14.2 2.6V2.8C14.2 3.5 14.6 4.1 15.2 4.4C15.8 4.7 16.5 4.6 17 4.2L17.1 4.1C17.4 3.8 17.9 3.6 18.4 3.6C18.9 3.6 19.4 3.8 19.7 4.1C20 4.4 20.2 4.9 20.2 5.4C20.2 5.9 20 6.4 19.7 6.7L19.6 6.8C19.2 7.3 19.1 8 19.4 8.6C19.7 9.2 20.3 9.6 21 9.6H21.2C22.3 9.6 23.2 10.5 23.2 11.6V12C23.2 13.1 22.3 14 21.2 14H21C20.3 14 19.7 14.4 19.4 15Z" fill="#00913D" />
  </svg>
);

export const GamepadIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Controller body */}
    <path
      d="M8 26c0-4 3-7 7-7h34c4 0 7 3 7 7v12c0 8-6 14-14 14H22c-8 0-14-6-14-14V26z"
      fill="#D1FAE5"
      stroke="#10B981"
      strokeWidth="2.5"
    />
    {/* D-pad */}
    <rect x="14" y="28" width="6" height="14" rx="1" fill="#10B981" />
    <rect x="11" y="31" width="12" height="6" rx="1" fill="#10B981" />
    {/* Buttons */}
    <circle cx="44" cy="28" r="4" fill="#EF4444" />
    <circle cx="52" cy="34" r="4" fill="#3B82F6" />
    <circle cx="44" cy="40" r="4" fill="#FBBF24" />
    <circle cx="36" cy="34" r="4" fill="#10B981" />
    {/* Button shines */}
    <circle cx="43" cy="27" r="1.5" fill="#FCA5A5" />
    <circle cx="51" cy="33" r="1.5" fill="#93C5FD" />
    {/* Center buttons */}
    <rect x="26" y="32" width="4" height="6" rx="1" fill="#6EE7B7" />
    {/* Face on screen/center */}
    <circle cx="32" cy="26" r="1" fill="#065F46" />
    <circle cx="36" cy="26" r="1" fill="#065F46" />
    <path d="M32 29c0 1 2 2 2 2s2-1 2-2" stroke="#065F46" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

export const TrophyIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Cup body */}
    <path
      d="M18 10h28v18c0 10-6 16-14 16s-14-6-14-16V10z"
      fill="#FEF3C7"
      stroke="#F59E0B"
      strokeWidth="2.5"
    />
    {/* Left handle */}
    <path d="M18 14H12c-2 0-4 2-4 4v4c0 6 4 10 10 10" stroke="#F59E0B" strokeWidth="2.5" fill="#FEF3C7" />
    {/* Right handle */}
    <path d="M46 14h6c2 0 4 2 4 4v4c0 6-4 10-10 10" stroke="#F59E0B" strokeWidth="2.5" fill="#FEF3C7" />
    {/* Shine */}
    <path d="M24 16v10M28 14v8" stroke="#FDE68A" strokeWidth="2" strokeLinecap="round" />
    {/* Star on cup */}
    <path d="M32 22l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" fill="#F59E0B" />
    {/* Stem */}
    <rect x="28" y="44" width="8" height="6" fill="#F59E0B" />
    {/* Base */}
    <rect x="22" y="50" width="20" height="6" rx="2" fill="#F59E0B" />
    <rect x="24" y="52" width="16" height="2" rx="1" fill="#FDE68A" />
    {/* Sparkles */}
    <circle cx="12" cy="8" r="2" fill="#FBBF24" />
    <circle cx="52" cy="6" r="1.5" fill="#FBBF24" />
    <circle cx="56" cy="12" r="1" fill="#FBBF24" />
    {/* Confetti */}
    <rect x="8" cy="14" width="3" height="3" rx="0.5" fill="#F43F5E" transform="rotate(20 8 14)" />
    <rect x="54" y="18" width="3" height="3" rx="0.5" fill="#8B5CF6" transform="rotate(-15 54 18)" />
  </svg>
);

// ============================================
// SUBJECT ICONS - Standardized, clean, friendly
// Consistent 64x64, 2.5px strokes, rounded
// ============================================

export const MathIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Calculator body */}
    <rect x="12" y="6" width="40" height="52" rx="6" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2.5" />
    {/* Screen */}
    <rect x="18" y="12" width="28" height="12" rx="2" fill="#1E3A8A" />
    <text x="40" y="21" fill="#60A5FA" fontSize="10" fontFamily="monospace">123</text>
    {/* Buttons */}
    <circle cx="24" cy="34" r="4" fill="#3B82F6" />
    <circle cx="36" cy="34" r="4" fill="#3B82F6" />
    <circle cx="24" cy="46" r="4" fill="#3B82F6" />
    <circle cx="36" cy="46" r="4" fill="#3B82F6" />
    <rect x="44" y="30" width="4" height="20" rx="2" fill="#F59E0B" />
    {/* Plus and equals symbols */}
    <path d="M22 34h4M24 32v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M34 33h4M34 35h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const ScienceIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Flask body */}
    <path
      d="M24 6h16v14l12 30c1 3-1 6-4 6H16c-3 0-5-3-4-6l12-30V6z"
      fill="#D1FAE5"
      stroke="#10B981"
      strokeWidth="2.5"
    />
    {/* Flask neck */}
    <path d="M24 6h16" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
    <rect x="22" y="4" width="20" height="4" rx="1" fill="#10B981" />
    {/* Liquid */}
    <path d="M18 40c4-2 10 2 14 0s10 2 14 0l2 10c0 2-2 4-4 4H16c-2 0-4-2-4-4l2-10z" fill="#10B981" opacity="0.4" />
    {/* Bubbles with faces */}
    <circle cx="26" cy="44" r="4" fill="#6EE7B7" />
    <circle cx="25" cy="43" r="1" fill="#065F46" />
    <circle cx="28" cy="43" r="1" fill="#065F46" />
    <path d="M25 46c.5.5 1.5.5 2 0" stroke="#065F46" strokeWidth="0.75" strokeLinecap="round" />
    <circle cx="36" cy="48" r="3" fill="#6EE7B7" />
    <circle cx="42" cy="42" r="2" fill="#A7F3D0" />
    {/* Rising bubbles */}
    <circle cx="30" cy="32" r="2" fill="#A7F3D0" />
    <circle cx="34" cy="28" r="1.5" fill="#A7F3D0" />
    <circle cx="28" cy="24" r="1" fill="#D1FAE5" />
  </svg>
);

export const ArabicIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Book base */}
    <rect x="8" y="8" width="48" height="48" rx="6" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2.5" />
    {/* Pages */}
    <path d="M14 14h36v36H14z" fill="#FFFBEB" />
    {/* Arabic letter ع (Ain) - stylized path */}
    <path
      d="M32 20c-6 0-10 4-10 8 0 6 8 8 12 8 2 0 6-1 6-4s-4-4-8-4c-2 0-4 1-4 3s3 4 8 3"
      stroke="#F59E0B"
      strokeWidth="3.5"
      strokeLinecap="round"
      fill="none"
    />
    {/* Decorative dots */}
    <circle cx="24" cy="44" r="2" fill="#FBBF24" />
    <circle cx="32" cy="46" r="2" fill="#FBBF24" />
    <circle cx="40" cy="44" r="2" fill="#FBBF24" />
    {/* Corner decoration */}
    <path d="M46 14l-8 8M46 22l-4 4" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const GlobeIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Globe */}
    <circle cx="32" cy="32" r="26" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2.5" />
    {/* Continents (simplified) */}
    <ellipse cx="26" cy="24" rx="8" ry="6" fill="#10B981" />
    <ellipse cx="38" cy="22" rx="6" ry="4" fill="#10B981" />
    <ellipse cx="24" cy="38" rx="6" ry="8" fill="#10B981" />
    <ellipse cx="40" cy="40" rx="8" ry="6" fill="#10B981" />
    {/* Grid lines */}
    <ellipse cx="32" cy="32" rx="10" ry="26" stroke="#93C5FD" strokeWidth="1.5" fill="none" />
    <path d="M6 32h52" stroke="#93C5FD" strokeWidth="1.5" />
    <path d="M10 20h44M10 44h44" stroke="#93C5FD" strokeWidth="1" strokeDasharray="2 2" />
    {/* Shine */}
    <ellipse cx="22" cy="18" rx="6" ry="4" fill="white" opacity="0.4" />
    {/* Tiny plane */}
    <path d="M48 16l4-2-2 4-2-2z" fill="#F43F5E" />
  </svg>
);

export const MoonStarIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Background glow */}
    <circle cx="28" cy="32" r="24" fill="#EFF6FF" />
    {/* Crescent moon */}
    <path
      d="M40 10c-12 2-20 12-20 24s8 22 20 24c-2 1-4 1-6 1-14 0-26-12-26-26S20 7 34 7c2 0 4 0 6 1z"
      fill="#FBBF24"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    {/* Moon face */}
    <circle cx="24" cy="28" r="1.5" fill="#92400E" />
    <circle cx="22" cy="36" r="1.5" fill="#92400E" />
    <path d="M20 32c1 2 3 3 5 2" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
    {/* Star */}
    <path
      d="M50 22l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6l3-6z"
      fill="#FBBF24"
      stroke="#F59E0B"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Small stars */}
    <circle cx="44" cy="12" r="2" fill="#FDE68A" />
    <circle cx="56" cy="40" r="1.5" fill="#FDE68A" />
    <circle cx="48" cy="48" r="2" fill="#FDE68A" />
  </svg>
);

export const MapIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Map folds */}
    <path d="M8 12l16-4v44l-16 4V12z" fill="#FECACA" stroke="#F43F5E" strokeWidth="2" strokeLinejoin="round" />
    <path d="M24 8l16 6v44l-16-6V8z" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round" />
    <path d="M40 14l16-6v44l-16 6V14z" fill="#D1FAE5" stroke="#10B981" strokeWidth="2" strokeLinejoin="round" />
    {/* Dotted path */}
    <path d="M16 24c4 4 8-2 12 4s8-2 12 4 8 0 10 4" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 4" />
    {/* Location pin */}
    <path d="M32 20c-4 0-7 3-7 7 0 5 7 11 7 11s7-6 7-11c0-4-3-7-7-7z" fill="#EF4444" stroke="#DC2626" strokeWidth="1.5" />
    <circle cx="32" cy="26" r="3" fill="white" />
    {/* X marks the spot */}
    <path d="M44 42l4 4m0-4l-4 4" stroke="#92400E" strokeWidth="2" strokeLinecap="round" />
    {/* Compass rose hint */}
    <circle cx="16" cy="44" r="6" fill="white" stroke="#6B7280" strokeWidth="1.5" />
    <path d="M16 40v8M12 44h8" stroke="#6B7280" strokeWidth="1.5" />
    <path d="M16 40l1 2-1-2z" fill="#EF4444" />
  </svg>
);

// ============================================
// STEP/PROCESS ICONS - How it works section
// ============================================

export const SparkleIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Main sparkle */}
    <path
      d="M32 4l5 14 14 5-14 5-5 14-5-14-14-5 14-5 5-14z"
      fill="currentColor"
      opacity="0.9"
    />
    {/* Secondary sparkles */}
    <path
      d="M14 40l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8z"
      fill="currentColor"
      opacity="0.6"
    />
    <path
      d="M48 36l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"
      fill="currentColor"
      opacity="0.6"
    />
    {/* Tiny dots */}
    <circle cx="50" cy="14" r="2" fill="currentColor" opacity="0.4" />
    <circle cx="10" cy="20" r="1.5" fill="currentColor" opacity="0.4" />
  </svg>
);

export const BookOpenIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Left page */}
    <path
      d="M32 14c-6-4-14-6-22-4v34c8-2 16 0 22 4V14z"
      fill="currentColor"
      opacity="0.15"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Right page */}
    <path
      d="M32 14c6-4 14-6 22-4v34c-8-2-16 0-22 4V14z"
      fill="currentColor"
      opacity="0.15"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Spine */}
    <path d="M32 14v34" stroke="currentColor" strokeWidth="2" />
    {/* Page lines left */}
    <path d="M16 20h10M16 26h10M16 32h8M16 38h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    {/* Page lines right */}
    <path d="M38 20h10M38 26h10M38 32h8M38 38h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
  </svg>
);

export const RocketLaunchIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Rocket body */}
    <path
      d="M32 8c-6 6-10 16-10 24 0 4 2 6 4 8h12c2-2 4-4 4-8 0-8-4-18-10-24z"
      fill="currentColor"
      opacity="0.2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    {/* Rocket tip */}
    <path d="M32 8c-4 4-6 10-6 12h12c0-2-2-8-6-12z" fill="currentColor" />
    {/* Window */}
    <circle cx="32" cy="26" r="5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="2" />
    {/* Fins */}
    <path d="M22 34l-6 8 6-2" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M42 34l6 8-6-2" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    {/* Flames */}
    <path d="M28 42c0 4-2 10 4 14 6-4 4-10 4-14" fill="currentColor" opacity="0.4" />
    <path d="M30 42c0 3-1 7 2 10 3-3 2-7 2-10" fill="currentColor" opacity="0.6" />
    {/* Motion lines */}
    <path d="M14 18l-6-2M50 18l6-2M12 28H6M52 28h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
  </svg>
);

// ============================================
// DECORATIVE & MISC ICONS - Standardized
// ============================================

export const LightningIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path
      d="M36 4L14 34h16L26 60 50 28H34L36 4z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const LightbulbIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Bulb */}
    <path
      d="M32 6c-11 0-18 9-18 18 0 7 4 12 8 16v6c0 2 2 4 4 4h12c2 0 4-2 4-4v-6c4-4 8-9 8-16 0-9-7-18-18-18z"
      fill="currentColor"
      opacity="0.2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    {/* Filament */}
    <path d="M28 24c0 4 2 6 4 8s4 4 4 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M36 24c0 4-2 6-4 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    {/* Base rings */}
    <path d="M26 50h12M26 54h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* Light rays */}
    <path d="M32 0v4M52 12l-3 2M12 12l3 2M56 32h-4M8 32h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
  </svg>
);

export const GraduationCapIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Cap top */}
    <path
      d="M32 8L4 22l28 14 28-14L32 8z"
      fill="currentColor"
      opacity="0.3"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Cap bottom */}
    <path
      d="M14 28v14c0 4 8 8 18 8s18-4 18-8V28"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    {/* Tassel string */}
    <path d="M54 22v18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* Tassel */}
    <circle cx="54" cy="42" r="3" fill="currentColor" />
    <path d="M54 45v6" stroke="currentColor" strokeWidth="2" />
    <path d="M52 51h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const BackpackIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Main body */}
    <rect x="14" y="18" width="36" height="38" rx="6" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2.5" />
    {/* Top handle/straps */}
    <path d="M24 18c0-6 4-10 8-10s8 4 8 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* Front pocket */}
    <rect x="20" y="32" width="24" height="16" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" />
    {/* Zipper */}
    <path d="M32 32v16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
    {/* Pocket flap line */}
    <path d="M22 36h20" stroke="currentColor" strokeWidth="1.5" />
    {/* Side straps */}
    <rect x="10" y="24" width="4" height="20" rx="2" fill="currentColor" opacity="0.4" />
    <rect x="50" y="24" width="4" height="20" rx="2" fill="currentColor" opacity="0.4" />
  </svg>
);

export const TeacherIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Head */}
    <circle cx="32" cy="18" r="12" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2.5" />
    {/* Hair */}
    <path d="M22 14c0-6 4-10 10-10s10 4 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    {/* Eyes */}
    <circle cx="28" cy="18" r="2" fill="currentColor" />
    <circle cx="36" cy="18" r="2" fill="currentColor" />
    {/* Smile */}
    <path d="M28 24c0 2 2 3 4 3s4-1 4-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    {/* Body */}
    <path
      d="M18 56c0-10 6-18 14-18s14 8 14 18"
      fill="currentColor"
      opacity="0.2"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    {/* Collar/tie */}
    <path d="M32 38l-4 8h8l-4-8z" fill="currentColor" />
  </svg>
);

export const QuestionIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Circle */}
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2.5" />
    {/* Question mark */}
    <path
      d="M24 22c0-6 4-8 8-8s8 2 8 8c0 4-4 6-8 8v4"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle cx="32" cy="46" r="3" fill="currentColor" />
  </svg>
);

export const PlayIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Circle */}
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2.5" />
    {/* Play triangle */}
    <path d="M26 20v24l20-12-20-12z" fill="currentColor" />
  </svg>
);

export const CelebrationIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    {/* Main star burst */}
    <path d="M32 8l3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10z" fill="#FBBF24" />
    {/* Colored confetti */}
    <path d="M16 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#F472B6" />
    <path d="M48 16l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#34D399" />
    <path d="M18 44l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" fill="#60A5FA" />
    <path d="M46 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" fill="#A78BFA" />
    {/* Extra dots */}
    <circle cx="40" cy="28" r="2" fill="#F43F5E" />
    <circle cx="24" cy="36" r="2" fill="#06B6D4" />
    <circle cx="52" cy="32" r="1.5" fill="#FBBF24" />
    <circle cx="12" cy="32" r="1.5" fill="#10B981" />
  </svg>
);

export const CheckCircleIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2.5" />
    <path d="M20 32l8 8 16-16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ============================================
// CONFETTI CELEBRATION - Animated confetti burst
// Use for achievements, completed lessons, etc.
// ============================================

export const Confetti = ({
  active = true,
  duration = 3000,
  onComplete
}: {
  active?: boolean;
  duration?: number;
  onComplete?: () => void;
}) => {
  // Sudan flag colors + complementary celebration colors
  const colors = ['#D21034', '#007229', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6'];

  // Generate confetti pieces
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    rotation: Math.random() * 360,
    size: 8 + Math.random() * 8,
    shape: i % 3, // 0 = circle, 1 = square, 2 = rectangle
  }));

  // Handle completion callback
  if (typeof window !== 'undefined' && onComplete) {
    setTimeout(onComplete, duration);
  }

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes confetti-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-15px); }
          75% { transform: translateX(15px); }
        }
        .confetti-piece {
          position: absolute;
          top: -20px;
          animation: confetti-fall 3s ease-out forwards, confetti-shake 0.5s ease-in-out infinite;
        }
      `}</style>
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            width: piece.shape === 2 ? piece.size * 0.5 : piece.size,
            height: piece.shape === 2 ? piece.size * 1.5 : piece.size,
            backgroundColor: piece.color,
            borderRadius: piece.shape === 0 ? '50%' : '2px',
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
};

// Simpler confetti burst for inline use
export const ConfettiBurst = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <style>{`
      @keyframes burst-pop {
        0% { transform: scale(0) rotate(0deg); opacity: 0; }
        50% { transform: scale(1.2) rotate(180deg); opacity: 1; }
        100% { transform: scale(1) rotate(360deg); opacity: 1; }
      }
      @keyframes twinkle {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .burst-piece { animation: burst-pop 0.6s ease-out forwards; }
      .burst-twinkle { animation: twinkle 0.8s ease-in-out infinite; }
    `}</style>
    {/* Center burst */}
    <circle className="burst-piece" cx="32" cy="32" r="4" fill="#F59E0B" style={{ animationDelay: '0s' }} />
    {/* Radiating pieces - Sudan colors */}
    <circle className="burst-piece burst-twinkle" cx="32" cy="12" r="3" fill="#D21034" style={{ animationDelay: '0.1s' }} />
    <circle className="burst-piece burst-twinkle" cx="52" cy="22" r="3" fill="#007229" style={{ animationDelay: '0.15s' }} />
    <circle className="burst-piece burst-twinkle" cx="52" cy="42" r="3" fill="#F59E0B" style={{ animationDelay: '0.2s' }} />
    <circle className="burst-piece burst-twinkle" cx="32" cy="52" r="3" fill="#D21034" style={{ animationDelay: '0.25s' }} />
    <circle className="burst-piece burst-twinkle" cx="12" cy="42" r="3" fill="#007229" style={{ animationDelay: '0.3s' }} />
    <circle className="burst-piece burst-twinkle" cx="12" cy="22" r="3" fill="#F59E0B" style={{ animationDelay: '0.35s' }} />
    {/* Stars */}
    <path className="burst-piece" d="M20 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="#EC4899" style={{ animationDelay: '0.2s' }} />
    <path className="burst-piece" d="M48 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="#3B82F6" style={{ animationDelay: '0.25s' }} />
    <path className="burst-piece" d="M56 32l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="#8B5CF6" style={{ animationDelay: '0.3s' }} />
    <path className="burst-piece" d="M8 32l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="#EC4899" style={{ animationDelay: '0.35s' }} />
    {/* Small dots */}
    <circle className="burst-piece" cx="42" cy="14" r="2" fill="#3B82F6" style={{ animationDelay: '0.4s' }} />
    <circle className="burst-piece" cx="22" cy="14" r="2" fill="#8B5CF6" style={{ animationDelay: '0.45s' }} />
    <circle className="burst-piece" cx="22" cy="50" r="2" fill="#EC4899" style={{ animationDelay: '0.5s' }} />
    <circle className="burst-piece" cx="42" cy="50" r="2" fill="#3B82F6" style={{ animationDelay: '0.55s' }} />
  </svg>
);
