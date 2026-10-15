// Flat, solid two-colour icons in the same language as the owl mark: no
// outlines, no pastel fills. Colours come from --ic-1 (main shape) and
// --ic-2 (detail), so a card can flip them when it fills with colour.

const main = "var(--ic-1)";
const detail = "var(--ic-2)";

function LessonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <rect x="4" y="8" width="40" height="28" rx="7" fill={main} />
      <path d="M20.5 15.5v13l11-6.5z" fill={detail} />
      <rect x="17" y="39" width="14" height="4" rx="2" fill={main} />
    </svg>
  );
}

function PracticeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path d="M11 6h26a7 7 0 0 1 7 7v15a7 7 0 0 1-7 7H23l-10 8v-8h-2a7 7 0 0 1-7-7V13a7 7 0 0 1 7-7z" fill={main} />
      <path d="M15 20.5l5.5 5.5L33 13.5" fill="none" stroke={detail} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GamesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path d="M14 12h20c6.6 0 10 5.4 10 12.5V29c0 5-3 9-7.5 9-3.2 0-5-2.2-6.6-5H18.1c-1.6 2.8-3.4 5-6.6 5C7 38 4 34 4 29v-4.5C4 17.4 7.4 12 14 12z" fill={main} />
      <rect x="10" y="22" width="11" height="4" rx="2" fill={detail} />
      <rect x="13.5" y="18.5" width="4" height="11" rx="2" fill={detail} />
      <circle cx="32" cy="20.5" r="2.8" fill={detail} />
      <circle cx="37.5" cy="26" r="2.8" fill={detail} />
    </svg>
  );
}

function ProgressIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <rect x="5" y="28" width="9" height="15" rx="3" fill={main} />
      <rect x="19.5" y="20" width="9" height="23" rx="3" fill={main} />
      <rect x="34" y="12" width="9" height="31" rx="3" fill={main} />
      <rect x="35.5" y="1" width="3" height="11" rx="1.5" fill={detail} />
      <path d="M38.5 1.5l8 3.5-8 3.5z" fill={detail} />
    </svg>
  );
}

const ICONS: Record<string, (props: { className?: string }) => React.JSX.Element> = {
  video: LessonIcon,
  practice: PracticeIcon,
  gamepad: GamesIcon,
  progress: ProgressIcon,
};

// Literal class strings (so Tailwind generates them): resting colours, then
// white-and-brand once the card fills on hover or when the owl lands.
export const FEATURE_ICON_TONES: Record<string, string> = {
  video:
    "[--ic-1:#007229] [--ic-2:#F59E0B] group-hover:[--ic-1:#ffffff] group-hover:[--ic-2:#007229] group-data-[owl-visit=true]:[--ic-1:#ffffff] group-data-[owl-visit=true]:[--ic-2:#007229]",
  practice:
    "[--ic-1:#D21034] [--ic-2:#ffffff] group-hover:[--ic-1:#ffffff] group-hover:[--ic-2:#D21034] group-data-[owl-visit=true]:[--ic-1:#ffffff] group-data-[owl-visit=true]:[--ic-2:#D21034]",
  gamepad:
    "[--ic-1:#005C22] [--ic-2:#F59E0B] group-hover:[--ic-1:#ffffff] group-hover:[--ic-2:#005C22] group-data-[owl-visit=true]:[--ic-1:#ffffff] group-data-[owl-visit=true]:[--ic-2:#005C22]",
  progress:
    "[--ic-1:#F59E0B] [--ic-2:#007229] group-hover:[--ic-1:#ffffff] group-hover:[--ic-2:#c2410c] group-data-[owl-visit=true]:[--ic-1:#ffffff] group-data-[owl-visit=true]:[--ic-2:#c2410c]",
};

export function FeatureIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type];
  return Icon ? <Icon className={className} /> : null;
}
