// Custom SVG illustrations for child-friendly design
// Playful, colorful shapes without emojis

export const FloatingBook = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none">
    <rect x="10" y="12" width="40" height="36" rx="3" fill="#8B5CF6" />
    <rect x="14" y="16" width="32" height="28" rx="2" fill="#C4B5FD" />
    <line x1="30" y1="16" x2="30" y2="44" stroke="#8B5CF6" strokeWidth="2" />
    <path d="M18 22h8M18 28h8M18 34h8" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
    <path d="M34 22h8M34 28h8M34 34h8" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const FloatingPencil = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none">
    <rect x="20" y="8" width="12" height="40" rx="2" fill="#F59E0B" transform="rotate(15 26 28)" />
    <polygon points="26,52 22,48 30,48" fill="#FCD34D" transform="rotate(15 26 50)" />
    <rect x="20" y="8" width="12" height="8" rx="1" fill="#FBBF24" transform="rotate(15 26 12)" />
    <circle cx="26" cy="50" r="2" fill="#374151" transform="rotate(15 26 50)" />
  </svg>
);

export const FloatingTarget = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none">
    <circle cx="30" cy="30" r="24" fill="#FEE2E2" stroke="#EF4444" strokeWidth="3" />
    <circle cx="30" cy="30" r="16" fill="#FECACA" stroke="#EF4444" strokeWidth="3" />
    <circle cx="30" cy="30" r="8" fill="#EF4444" />
    <circle cx="30" cy="30" r="3" fill="#FEE2E2" />
  </svg>
);

export const FloatingStar = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none">
    <path
      d="M30 8L35.5 23.5H52L38.5 33L44 48L30 38L16 48L21.5 33L8 23.5H24.5L30 8Z"
      fill="#FBBF24"
      stroke="#F59E0B"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const FloatingPalette = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none">
    <ellipse cx="30" cy="32" rx="22" ry="18" fill="#E0E7FF" stroke="#6366F1" strokeWidth="2" />
    <circle cx="20" cy="26" r="5" fill="#EF4444" />
    <circle cx="32" cy="22" r="5" fill="#FBBF24" />
    <circle cx="42" cy="30" r="5" fill="#10B981" />
    <circle cx="36" cy="40" r="5" fill="#3B82F6" />
    <ellipse cx="22" cy="38" rx="6" ry="5" fill="#E0E7FF" stroke="#6366F1" strokeWidth="1" />
  </svg>
);

export const FloatingRocket = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 60 60" fill="none">
    <ellipse cx="30" cy="28" rx="10" ry="18" fill="#E0E7FF" stroke="#6366F1" strokeWidth="2" />
    <ellipse cx="30" cy="20" rx="6" ry="8" fill="#6366F1" />
    <circle cx="30" cy="28" r="4" fill="#06B6D4" />
    <path d="M20 35L16 42L24 38" fill="#EF4444" />
    <path d="M40 35L44 42L36 38" fill="#EF4444" />
    <path d="M26 46L30 56L34 46" fill="#F59E0B" />
    <path d="M28 46L30 52L32 46" fill="#FBBF24" />
  </svg>
);

// Feature icons
export const VideoIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <rect x="6" y="14" width="42" height="36" rx="4" fill="currentColor" opacity="0.2" />
    <rect x="6" y="14" width="42" height="36" rx="4" stroke="currentColor" strokeWidth="3" />
    <polygon points="26,24 26,42 40,33" fill="currentColor" />
    <path d="M52 22L58 18V46L52 42" fill="currentColor" opacity="0.6" />
  </svg>
);

export const RobotIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <rect x="14" y="20" width="36" height="32" rx="6" fill="currentColor" opacity="0.2" />
    <rect x="14" y="20" width="36" height="32" rx="6" stroke="currentColor" strokeWidth="3" />
    <circle cx="26" cy="34" r="5" fill="currentColor" />
    <circle cx="38" cy="34" r="5" fill="currentColor" />
    <path d="M24 44h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M32 8v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="8" r="4" fill="currentColor" />
    <path d="M8 32h6M50 32h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const GamepadIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <rect x="6" y="18" width="52" height="32" rx="8" fill="currentColor" opacity="0.2" />
    <rect x="6" y="18" width="52" height="32" rx="8" stroke="currentColor" strokeWidth="3" />
    <circle cx="20" cy="34" r="6" stroke="currentColor" strokeWidth="2" />
    <path d="M20 30v8M16 34h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="40" cy="30" r="3" fill="currentColor" />
    <circle cx="48" cy="34" r="3" fill="currentColor" />
    <circle cx="44" cy="38" r="3" fill="currentColor" />
  </svg>
);

export const TrophyIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M18 12h28v20c0 8-6 14-14 14s-14-6-14-14V12z" fill="currentColor" opacity="0.2" />
    <path d="M18 12h28v20c0 8-6 14-14 14s-14-6-14-14V12z" stroke="currentColor" strokeWidth="3" />
    <path d="M18 16H10c0 8 4 12 8 12" stroke="currentColor" strokeWidth="3" />
    <path d="M46 16h8c0 8-4 12-8 12" stroke="currentColor" strokeWidth="3" />
    <rect x="26" y="46" width="12" height="6" fill="currentColor" />
    <rect x="22" y="52" width="20" height="4" rx="1" fill="currentColor" />
    <path d="M28 22l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Subject icons
export const MathIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <rect x="8" y="8" width="48" height="48" rx="4" fill="currentColor" opacity="0.15" />
    <path d="M20 20v24M32 32h-24M44 20l-8 24M36 24l16 16M52 24l-16 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const ScienceIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M24 8h16v16l10 28c1 3-1 6-4 6H18c-3 0-5-3-4-6l10-28V8z" fill="currentColor" opacity="0.2" />
    <path d="M24 8h16v16l10 28c1 3-1 6-4 6H18c-3 0-5-3-4-6l10-28V8z" stroke="currentColor" strokeWidth="3" />
    <path d="M24 8h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="28" cy="42" r="4" fill="currentColor" />
    <circle cx="38" cy="46" r="3" fill="currentColor" />
    <circle cx="32" cy="36" r="2" fill="currentColor" />
  </svg>
);

export const ArabicIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <rect x="10" y="10" width="44" height="44" rx="4" fill="currentColor" opacity="0.15" />
    <text x="32" y="42" textAnchor="middle" fontSize="28" fontWeight="bold" fill="currentColor">ع</text>
  </svg>
);

export const GlobeIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="24" fill="currentColor" opacity="0.2" />
    <circle cx="32" cy="32" r="24" stroke="currentColor" strokeWidth="3" />
    <ellipse cx="32" cy="32" rx="10" ry="24" stroke="currentColor" strokeWidth="2" />
    <path d="M8 32h48M12 20h40M12 44h40" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const MoonStarIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M44 12c-14 2-24 14-24 28 0 2 0 4 .5 6C12 42 6 34 6 24 6 12 16 2 28 2c6 0 12 2 16 6z" fill="currentColor" opacity="0.2" />
    <path d="M44 12c-14 2-24 14-24 28 0 2 0 4 .5 6C12 42 6 34 6 24 6 12 16 2 28 2c6 0 12 2 16 6z" stroke="currentColor" strokeWidth="3" />
    <path d="M48 28l3 6h7l-5 4 2 7-7-4-7 4 2-7-5-4h7l3-6z" fill="currentColor" />
  </svg>
);

export const MapIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M8 14l16-6v42l-16 6V14z" fill="currentColor" opacity="0.3" />
    <path d="M24 8l16 6v42l-16-6V8z" fill="currentColor" opacity="0.2" />
    <path d="M40 14l16-6v42l-16 6V14z" fill="currentColor" opacity="0.3" />
    <path d="M8 14l16-6 16 6 16-6v42l-16 6-16-6-16 6V14z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="24" cy="30" r="4" fill="currentColor" />
  </svg>
);

// How it works icons
export const SparkleIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M32 4l4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12z" fill="currentColor" />
    <path d="M16 36l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="currentColor" opacity="0.6" />
    <path d="M48 32l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="currentColor" opacity="0.6" />
  </svg>
);

export const BookOpenIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M32 14c-6-4-14-6-22-4v36c8-2 16 0 22 4 6-4 14-6 22-4V10c-8-2-16 0-22 4z" fill="currentColor" opacity="0.2" />
    <path d="M32 14c-6-4-14-6-22-4v36c8-2 16 0 22 4 6-4 14-6 22-4V10c-8-2-16 0-22 4z" stroke="currentColor" strokeWidth="3" />
    <path d="M32 14v36" stroke="currentColor" strokeWidth="2" />
    <path d="M16 22h8M16 30h8M16 38h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M40 22h8M40 30h8M40 38h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const RocketLaunchIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <ellipse cx="36" cy="24" rx="14" ry="20" fill="currentColor" opacity="0.2" transform="rotate(45 36 24)" />
    <ellipse cx="36" cy="24" rx="14" ry="20" stroke="currentColor" strokeWidth="3" transform="rotate(45 36 24)" />
    <circle cx="36" cy="24" r="6" fill="currentColor" />
    <path d="M18 46l-8 10 14-4" fill="currentColor" opacity="0.6" />
    <path d="M46 36l10 8-4-14" fill="currentColor" opacity="0.6" />
    <path d="M8 48l8 8 6-6-8-8-6 6z" fill="currentColor" />
  </svg>
);

// Additional decorative icons
export const LightningIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M36 4L16 36h14L26 60 48 26H34L36 4z" fill="currentColor" />
  </svg>
);

export const LightbulbIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M32 6c-12 0-20 10-20 20 0 8 4 14 10 18v6c0 2 2 4 4 4h12c2 0 4-2 4-4v-6c6-4 10-10 10-18 0-10-8-20-20-20z" fill="currentColor" opacity="0.2" />
    <path d="M32 6c-12 0-20 10-20 20 0 8 4 14 10 18v6c0 2 2 4 4 4h12c2 0 4-2 4-4v-6c6-4 10-10 10-18 0-10-8-20-20-20z" stroke="currentColor" strokeWidth="3" />
    <path d="M26 54h12M26 58h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M32 16v10M26 22l6 4 6-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const GraduationCapIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M32 8L4 22l28 14 28-14L32 8z" fill="currentColor" opacity="0.3" />
    <path d="M32 8L4 22l28 14 28-14L32 8z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    <path d="M12 28v16c0 4 8 8 20 8s20-4 20-8V28" stroke="currentColor" strokeWidth="3" />
    <path d="M56 22v20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="56" cy="46" r="4" fill="currentColor" />
  </svg>
);

export const BackpackIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <rect x="14" y="16" width="36" height="40" rx="6" fill="currentColor" opacity="0.2" />
    <rect x="14" y="16" width="36" height="40" rx="6" stroke="currentColor" strokeWidth="3" />
    <path d="M24 16c0-6 4-10 8-10s8 4 8 10" stroke="currentColor" strokeWidth="3" />
    <rect x="20" y="28" width="24" height="14" rx="3" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="2" />
    <path d="M28 28v14M36 28v14" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const TeacherIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="18" r="12" fill="currentColor" opacity="0.2" />
    <circle cx="32" cy="18" r="12" stroke="currentColor" strokeWidth="3" />
    <path d="M14 58c0-12 8-20 18-20s18 8 18 20" fill="currentColor" opacity="0.2" />
    <path d="M14 58c0-12 8-20 18-20s18 8 18 20" stroke="currentColor" strokeWidth="3" />
    <path d="M32 38v10" stroke="currentColor" strokeWidth="3" />
    <circle cx="28" cy="16" r="2" fill="currentColor" />
    <circle cx="36" cy="16" r="2" fill="currentColor" />
    <path d="M28 22c0 2 2 4 4 4s4-2 4-4" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const QuestionIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.15" />
    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="3" />
    <path d="M24 24c0-6 4-10 8-10s8 4 8 10c0 4-4 6-8 8v4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32" cy="48" r="3" fill="currentColor" />
  </svg>
);

export const PlayIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.2" />
    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="3" />
    <path d="M26 20v24l20-12-20-12z" fill="currentColor" />
  </svg>
);

export const CelebrationIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <path d="M32 8l2 8 8 2-8 2-2 8-2-8-8-2 8-2 2-8z" fill="#FBBF24" />
    <path d="M16 24l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#F472B6" />
    <path d="M48 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#34D399" />
    <path d="M20 44l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#60A5FA" />
    <path d="M44 40l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" fill="#A78BFA" />
  </svg>
);

export const CheckCircleIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="26" fill="currentColor" opacity="0.2" />
    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="3" />
    <path d="M20 32l8 8 16-16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
