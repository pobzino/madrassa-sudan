import type { SVGProps } from "react";

/**
 * Amal's own icon set: the pictures the app used to borrow from platform
 * emoji, drawn in the brand's rounded two-tone style. Every icon is a 24-unit
 * square that scales with font size (1em) unless given a className, uses
 * `currentColor` for its main stroke and the brand palette for its fills, and
 * is decorative by default (aria-hidden) — pass `title` to make it meaningful.
 */
export type AmalIconProps = SVGProps<SVGSVGElement> & { title?: string };

const GREEN = "#007229";
const RED = "#D21034";
const AMBER = "#F59E0B";
const GOLD = "#FDE68A";
const INK = "#1a1a1a";

function Svg({ title, children, className, ...rest }: AmalIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={className}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** A cup with the Sudan-green ribbon: certificates, the Boss Book, wins. */
export const TrophyIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill={AMBER} stroke={INK} />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 0 5H7M17 6h2.5a2.5 2.5 0 0 1 0 5H17" stroke={INK} />
    <path d="M12 14v3" stroke={INK} />
    <path d="M8.5 20h7l-.8-3h-5.4l-.8 3Z" fill={GREEN} stroke={INK} />
    <path d="M10.4 8.6l1.6-1.3 1.6 1.3-.6-2 1.6-1.2h-2L12 3.5l-.6 1.9h-2l1.6 1.2-.6 2Z" fill={GOLD} stroke="none" />
  </Svg>
);

/** A five-point star, filled gold. */
export const StarIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8L12 3Z" fill={AMBER} stroke={INK} />
  </Svg>
);

/** Three sparkles: praise, "new", magic. */
export const SparkleIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" fill={GOLD} stroke={AMBER} />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" fill={GOLD} stroke={AMBER} strokeWidth={1.5} />
    <path d="M5 16l.6 1.6 1.6.6-1.6.6L5 20.4l-.6-1.6-1.6-.6 1.6-.6L5 16Z" fill={GOLD} stroke={AMBER} strokeWidth={1.5} />
  </Svg>
);

/** Confetti and a streamer: a celebration. */
export const PartyIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M5 20l3.5-9.5 6 6L5 20Z" fill={AMBER} stroke={INK} />
    <path d="M8.5 10.5c2-1.5 4.5-1 6 .5s2 4 .5 6" stroke={INK} />
    <circle cx="16" cy="5" r="1.4" fill={RED} stroke="none" />
    <circle cx="20" cy="9" r="1.2" fill={GREEN} stroke="none" />
    <circle cx="12" cy="4" r="1.1" fill={GREEN} stroke="none" />
    <path d="M18 3.5c-1 1.5-.5 3 1 3.5" stroke={RED} />
    <path d="M21 13c-1.2.4-1.5 1.6-1 2.5" stroke={AMBER} />
  </Svg>
);

/** A waving hand: hello, welcome. */
export const WaveIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M8 11.5V6a1.5 1.5 0 0 1 3 0v4M11 9.5V4.5a1.5 1.5 0 0 1 3 0v5M14 9.5V6a1.5 1.5 0 0 1 3 0v6M17 9.5a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.2-3.8L3.3 13a1.6 1.6 0 0 1 2.8-1.6L8 14" fill="#FBD5A6" stroke={INK} />
    <path d="M3.5 6.5c.5-1.5 1.7-2.6 3-3M2 9c.2-.9.6-1.7 1.1-2.4" stroke={AMBER} />
  </Svg>
);

/** A flexed arm: keep going, strength. */
export const StrongIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M6 20c-1.5-3 .5-8 3-9l2.5 2.5c1-2.5 3.5-4 6-4 2 0 3.5 1.5 3.5 3.5V20H6Z" fill="#FBD5A6" stroke={INK} />
    <path d="M9 11c-.5-2 .5-4 2-5l2 1c-.5 1.5-.5 3 .5 4" fill="#FBD5A6" stroke={INK} />
    <path d="M14.5 15.5a2.5 2.5 0 0 1 3.5 0" stroke={INK} />
  </Svg>
);

/** Clapping hands. */
export const ClapIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M8 21c-2.5 0-4.5-2-4.5-4.5V12l2-2 .5 3 .5-7a1.2 1.2 0 0 1 2.4 0l.3 5 .7-6.5a1.2 1.2 0 0 1 2.4.2L12 11l.8-5a1.2 1.2 0 0 1 2.3.4L14.5 12l1.2-3.2a1.1 1.1 0 0 1 2.1.6L16 16.5C15.5 19 13 21 10.5 21H8Z" fill="#FBD5A6" stroke={INK} />
    <path d="M19 6l1.5-1.5M20 9.5h2M17 3.5l.5-2" stroke={AMBER} />
  </Svg>
);

/** A flame: a streak. */
export const FlameIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 2.5c1 3 4 4.5 5.5 8 1.4 3.4-.3 8.5-5.5 10.5C6.8 19 5.1 13.9 6.5 10.5c.6-1.5 1.6-2.6 2.7-3.5.2 1.6 1 2.8 2.3 3.5C10.6 7.8 10.8 4.8 12 2.5Z" fill={AMBER} stroke={RED} />
    <path d="M12 20c-2.2-1-3-3.3-2.3-5 .5-1.2 1.3-1.9 2.3-2.5 1 .6 1.8 1.3 2.3 2.5.7 1.7-.1 4-2.3 5Z" fill={GOLD} stroke="none" />
  </Svg>
);

/** An open book. */
export const BookIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 6.5c-1.6-1.3-4.2-1.8-8-1.5v13c3.8-.3 6.4.2 8 1.5 1.6-1.3 4.2-1.8 8-1.5V5c-3.8-.3-6.4.2-8 1.5Z" fill="#FFF8EC" stroke={INK} />
    <path d="M12 6.5v13" stroke={INK} />
    <path d="M6.5 8.5c1.2 0 2.3.2 3.3.6M6.5 11.5c1.2 0 2.3.2 3.3.6M14.2 9.1c1-.4 2.1-.6 3.3-.6M14.2 12.1c1-.4 2.1-.6 3.3-.6" stroke={GREEN} strokeWidth={1.5} />
  </Svg>
);

/** A pencil. */
export const PencilIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M4 20l1.2-4.6L15.6 5a2.2 2.2 0 0 1 3.1 0l.3.3a2.2 2.2 0 0 1 0 3.1L8.6 18.8 4 20Z" fill={AMBER} stroke={INK} />
    <path d="M14 6.6l3.4 3.4" stroke={INK} />
    <path d="M5.2 15.4l3.4 3.4" stroke={INK} />
    <path d="M4 20l1.2-4.6 3.4 3.4L4 20Z" fill="#FBD5A6" stroke={INK} />
  </Svg>
);

/** A letter in an envelope: a message to the family. */
export const LetterIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" fill="#FFF8EC" stroke={INK} />
    <path d="M3.5 7.5l8.5 6 8.5-6" stroke={INK} />
    <path d="M12 3.2l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 5.5l2.2-.3 1-2Z" fill={RED} stroke="none" />
  </Svg>
);

/** A light bulb: a hint or idea. */
export const BulbIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" fill={GOLD} stroke={INK} />
    <path d="M10 19h4M10.5 21.5h3" stroke={INK} />
    <path d="M10.2 9.5c.3-1 1-1.6 1.8-1.8" stroke="#fff" strokeWidth={1.5} />
  </Svg>
);

/** A green tick in a circle. */
export const CheckIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" fill={GREEN} stroke={GREEN} />
    <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth={2.6} />
  </Svg>
);

/** A red cross in a circle. */
export const CrossIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" fill={RED} stroke={RED} />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" strokeWidth={2.6} />
  </Svg>
);

/** A warning triangle. */
export const WarningIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 21.5 20h-19L12 3.5Z" fill={GOLD} stroke={AMBER} />
    <path d="M12 9.5v5M12 17.5v.5" stroke={INK} strokeWidth={2.4} />
  </Svg>
);

/** A lightning bolt: generate, fast. */
export const BoltIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M13 2.5 5 13.5h6l-1 8 9-11.5h-6l1-7.5Z" fill={AMBER} stroke={INK} />
  </Svg>
);

/** Two arrows in a circle: regenerate, refresh. */
export const RefreshIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" stroke={INK} />
    <path d="M17 3.5v3.3h-3.3M7 20.5v-3.3h3.3" stroke={INK} />
  </Svg>
);

/** A stopwatch: a clock running. */
export const TimerIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" fill="#FFF8EC" stroke={INK} />
    <path d="M12 9.5v4l2.5 1.5" stroke={RED} strokeWidth={2.4} />
    <path d="M10 3h4M12 3v3M18 6.5l1.5-1.5" stroke={INK} />
  </Svg>
);

/** A seedling: growth, a new skill. */
export const SproutIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 21v-8" stroke={GREEN} strokeWidth={2.4} />
    <path d="M12 13c0-3.5-2.5-6-6.5-6 0 3.8 2.6 6.3 6.5 6Z" fill="#4ADE80" stroke={GREEN} />
    <path d="M12 11c0-3 2.3-5.5 6-5.5 0 3.5-2.4 5.8-6 5.5Z" fill="#86EFAC" stroke={GREEN} />
    <path d="M8 21h8" stroke="#92400E" />
  </Svg>
);

/** A single leaf: a skill on the way. */
export const LeafIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5-13 14-13 0 9-5 14-14 13Z" fill="#86EFAC" stroke={GREEN} />
    <path d="M5 19c3-4 6-7 10-9" stroke={GREEN} />
  </Svg>
);

/** A tree: a skill grown. */
export const TreeIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 5 12h3l-3 5h14l-3-5h3L12 2.5Z" fill="#4ADE80" stroke={GREEN} />
    <path d="M10.5 17h3v4.5h-3V17Z" fill="#92400E" stroke="#7C2D12" />
  </Svg>
);

/** A heart. */
export const HeartIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M12 20.5 4.5 13A4.3 4.3 0 0 1 10.6 6.9L12 8.3l1.4-1.4A4.3 4.3 0 0 1 19.5 13L12 20.5Z" fill={RED} stroke={RED} />
    <path d="M7.2 9.3c.4-1 1.1-1.6 2-1.9" stroke="#fff" strokeWidth={1.5} />
  </Svg>
);

/** A thumbs up. */
export const ThumbsUpIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z" fill={GREEN} stroke={INK} />
    <path d="M7 11l4.2-7.6a1.8 1.8 0 0 1 3.3 1.3L13.8 9H19a2 2 0 0 1 2 2.4l-1.4 6.8A2 2 0 0 1 17.6 20H7v-9Z" fill="#FBD5A6" stroke={INK} />
  </Svg>
);

/** A pointing hand: tap here. */
export const TapIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M10 13V5.5a1.5 1.5 0 0 1 3 0V11l3.6.7a2.5 2.5 0 0 1 2 2.8l-.7 4.1A3 3 0 0 1 15 21h-3.4a4 4 0 0 1-3.2-1.6L5.6 15.6A1.4 1.4 0 0 1 7.8 14L10 16v-3Z" fill="#FBD5A6" stroke={INK} />
    <path d="M8 4.5A4.5 4.5 0 0 1 14.5 3M7 7.5a3 3 0 0 1 1-2" stroke={AMBER} />
  </Svg>
);

/** A magnifying glass. */
export const SearchIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" fill="#E0F2FE" stroke={INK} />
    <path d="M15 15l5 5" stroke={INK} strokeWidth={2.6} />
    <path d="M7.5 9.5a3 3 0 0 1 2.5-2.5" stroke="#fff" strokeWidth={1.5} />
  </Svg>
);

/** A home. */
export const HomeIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M4 11 12 4l8 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5V11Z" fill="#FFF8EC" stroke={INK} />
    <path d="M10 21v-6h4v6" fill={GREEN} stroke={INK} />
  </Svg>
);

/** A graduation cap: Amowl's own. */
export const GradCapIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z" fill={GREEN} stroke={INK} />
    <path d="M6.5 11.5v4c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4" fill={INK} stroke={INK} />
    <path d="M20 10v5" stroke={AMBER} strokeWidth={2.2} />
    <circle cx="20" cy="16" r="1.3" fill={AMBER} stroke="none" />
  </Svg>
);

/** Numbers: the maths subject. */
export const NumbersIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="#DBEAFE" stroke={INK} />
    <path d="M7.5 15.5v-7l-1.5 1M12 8.5h3l-2.5 3.5a2 2 0 1 1-1.5 3.3M17.5 9.5h-1" stroke={INK} strokeWidth={1.8} />
  </Svg>
);

/** Letters: a language subject. */
export const LettersIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="#FCE7F3" stroke={INK} />
    <path d="M6.5 16l2.5-8 2.5 8M7.4 13.3h3.2M14 8v8h2.5a2 2 0 0 0 0-4H14h2a2 2 0 0 0 0-4h-2Z" stroke={INK} strokeWidth={1.8} />
  </Svg>
);

/** A microscope: science. */
export const ScienceIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <path d="M9 3.5 7 5.5l6 6 2-2-6-6Z" fill="#A5B4FC" stroke={INK} />
    <path d="M12 10a6 6 0 0 1 2.2 8.5M5 20.5h14M8 17.5h5" stroke={INK} />
    <circle cx="9.5" cy="14.5" r="1.3" fill={AMBER} stroke="none" />
  </Svg>
);

/** The Sudan flag as a small rounded tile (the Arabic language choice). */
export const SudanFlagIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#fff" stroke={INK} strokeWidth={1.5} />
    <path d="M3.5 5.5h17.5v4.2H3.5Z" fill={RED} stroke="none" />
    <path d="M3.5 14.3h17.5v4.2H3.5Z" fill={INK} stroke="none" />
    <path d="M3 6 11 12l-8 6V6Z" fill={GREEN} stroke="none" />
  </Svg>
);

/** The Union Jack as a small rounded tile (the English language choice). */
export const UkFlagIcon = (p: AmalIconProps) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" fill="#1D4ED8" stroke={INK} strokeWidth={1.5} />
    <path d="M3 6l18 12M21 6 3 18" stroke="#fff" strokeWidth={3} />
    <path d="M3 6l18 12M21 6 3 18" stroke={RED} strokeWidth={1.2} />
    <path d="M12 5.5v13M2.5 12h19" stroke="#fff" strokeWidth={4} />
    <path d="M12 5.5v13M2.5 12h19" stroke={RED} strokeWidth={2} />
  </Svg>
);
