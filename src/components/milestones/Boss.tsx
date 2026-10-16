import type { ReactNode } from "react";
import type { BossKey } from "@/lib/milestones/types";

/**
 * The Big Challenge bosses: round, cheeky cartoon giants a child beats with
 * right answers. Drawn as flat inline SVG on one shared body (after the owner's
 * Numbo design) so they read as one cast. Never scary: soft shapes, warm
 * colours, big eyes, blush, no teeth, claws or weapons.
 *
 *  - curious: the start, eyebrows up, holding a puzzle card
 *  - hit:     a star blast landed, "Ouch! Hee hee!" (squeezed giggle, sparkles)
 *  - cheeky:  after a wrong answer, a wink and a tongue-out grin
 *  - ko:      the final hit, cartoon knock-out (swirly eyes, stars round the head, a poof)
 *  - wave:    a kind wave ("see you soon"), used when the child runs out of tries
 *
 * `level` (afterWeekNumber / 4) adds friendly accessories: 2 a cap, 3 a cape,
 * 4+ a crown and sparkles. The parent sizes it (bigger from level 3).
 */
export type BossMood = "curious" | "hit" | "cheeky" | "dizzy" | "ko" | "wave" | "sleep";

const INK = "#1a1a1a";

interface Palette {
  main: string;
  dark: string;
  light: string;
  card: string;
  brow: string;
}

const PALETTES: Record<BossKey, Palette> = {
  number_giant: { main: "#8B7CF6", dark: "#6D5BD0", light: "#C9C0FF", card: "#F5A524", brow: "#4B3BA8" },
  word_dragon: { main: "#3FBFA0", dark: "#279C80", light: "#C2F0E2", card: "#FF9F68", brow: "#1D7560" },
  letter_camel: { main: "#E2AE6C", dark: "#C98A45", light: "#F7DDB5", card: "#E85D75", brow: "#8F5A26" },
  sprout_buddy: { main: "#C98B4E", dark: "#A86F37", light: "#EFC796", card: "#6CC24A", brow: "#7A4E22" },
  puzzle_owlet: { main: "#F29E4C", dark: "#D9822B", light: "#FFE3C2", card: "#5B9BF0", brow: "#A85E16" },
  letter_dragon: { main: "#E8604C", dark: "#C0432F", light: "#FFE1B3", card: "#007229", brow: "#8A2A1C" },
};

function Star({ x, y, s = 1, color = "#F5A524" }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <path
      d={`M${x} ${y - 9 * s} L${x + 2.6 * s} ${y - 2.6 * s} L${x + 9 * s} ${y} L${x + 2.6 * s} ${y + 2.6 * s} L${x} ${y + 9 * s} L${x - 2.6 * s} ${y + 2.6 * s} L${x - 9 * s} ${y} L${x - 2.6 * s} ${y - 2.6 * s}Z`}
      fill={color}
    />
  );
}

function OpenEye({ x, y, look = 3 }: { x: number; y: number; look?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={17} fill="#FFFFFF" />
      <circle cx={x + look} cy={y + 3} r={9} fill={INK} />
      <circle cx={x + look + 3} cy={y - 1} r={3} fill="#FFFFFF" />
    </g>
  );
}

function SwirlEye({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={17} fill="#FFFFFF" />
      <path
        d={`M${x} ${y} a2.5 2.5 0 0 1 5 0 a5 5 0 0 1 -10 0 a7.5 7.5 0 0 1 15 0 a10 10 0 0 1 -20 0`}
        fill="none"
        stroke={INK}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Phase 2: the boss powers up, rosy-red and puffed up, but still a cartoon. */
const POWERED: Palette = { main: "#EF6F8C", dark: "#CF4F70", light: "#FFC9D5", card: "#F5A524", brow: "#8E2443" };

function Face({ mood, p, powered }: { mood: BossMood; p: Palette; powered: boolean }) {
  const blushBig = mood === "hit" || mood === "cheeky";
  if (powered && mood === "curious") {
    // "Now I'm REALLY grumpy!": brows down, cheeks puffed, a pout. Not scary.
    return (
      <g>
        <ellipse cx={55} cy={124} rx={14} ry={9} fill="#FF9FB2" />
        <ellipse cx={145} cy={124} rx={14} ry={9} fill="#FF9FB2" />
        <OpenEye x={76} y={102} look={2} />
        <OpenEye x={124} y={102} look={-2} />
        <path d="M60 78 L90 88" stroke={p.brow} strokeWidth={5} fill="none" strokeLinecap="round" />
        <path d="M140 78 L110 88" stroke={p.brow} strokeWidth={5} fill="none" strokeLinecap="round" />
        <path d="M88 130 Q100 120 112 130" stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx={55} cy={124} rx={blushBig ? 13 : 11} ry={blushBig ? 8 : 7} fill="#FF9FB2" opacity={0.85} />
      <ellipse cx={145} cy={124} rx={blushBig ? 13 : 11} ry={blushBig ? 8 : 7} fill="#FF9FB2" opacity={0.85} />
      {mood === "curious" && (
        <>
          <OpenEye x={76} y={100} />
          <OpenEye x={124} y={100} />
          <path d="M62 76 Q76 68 90 76" stroke={p.brow} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M112 79 Q124 77 138 79" stroke={p.brow} strokeWidth={4} fill="none" strokeLinecap="round" />
          <ellipse cx={100} cy={126} rx={7} ry={6} fill={INK} />
        </>
      )}
      {mood === "hit" && (
        <>
          {/* "Ouch! Hee hee!": eyes squeezed shut in a giggle */}
          <path d="M62 96 L84 102 L62 108" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M138 96 L116 102 L138 108" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M82 116 Q100 144 118 116 Z" fill={INK} />
          <ellipse cx={100} cy={128} rx={8} ry={5} fill="#FF7A90" />
        </>
      )}
      {mood === "cheeky" && (
        <>
          <path d="M62 104 Q76 90 90 104" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
          <OpenEye x={124} y={100} look={-2} />
          <path d="M112 79 Q124 72 138 78" stroke={p.brow} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M84 120 Q100 134 118 118" stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <path d="M100 127 Q101 138 108 137 Q113 135 110 125Z" fill="#FF7A90" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        </>
      )}
      {mood === "sleep" && (
        <>
          <path d="M62 102 Q76 112 90 102" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M110 102 Q124 112 138 102" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
          <ellipse cx={100} cy={128} rx={6} ry={4} fill={INK} />
        </>
      )}
      {(mood === "ko" || mood === "dizzy") && (
        <>
          <SwirlEye x={76} y={100} />
          <SwirlEye x={124} y={100} />
          <path d="M84 126 q4 -6 8 0 q4 6 8 0 q4 -6 8 0 q4 6 8 0" stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {mood === "wave" && (
        <>
          <OpenEye x={76} y={102} look={1} />
          <OpenEye x={124} y={102} look={1} />
          <path d="M62 80 Q76 76 90 82" stroke={p.brow} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M110 82 Q124 76 138 80" stroke={p.brow} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M86 124 Q100 136 114 124" stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/** The little puzzle card each boss holds: its subject at a glance. */
function CardGlyph({ bossKey, mood }: { bossKey: BossKey; mood: BossMood }) {
  const text = (value: string, size = 26) => (
    <text x={100} y={163} textAnchor="middle" fontSize={size} fontWeight={800} fill={INK} fontFamily="system-ui, sans-serif">
      {value}
    </text>
  );
  switch (bossKey) {
    case "number_giant":
      return text(mood === "curious" ? "?" : "7");
    case "word_dragon":
      return text("Aa", 20);
    case "letter_dragon":
      return <text x={100} y={163} textAnchor="middle" fontSize={24} fontWeight={800} fill="#FFFFFF" fontFamily="system-ui, sans-serif">ب</text>;
    case "letter_camel":
      return text("ح", 26);
    case "sprout_buddy":
      return <path d="M100 168 V152 M100 156 C92 146 84 148 84 152 C90 158 96 158 100 156Z M100 152 C108 142 116 144 116 148 C110 154 104 154 100 152Z" stroke="#2F7A1F" strokeWidth={2.5} fill="#E8FFD9" strokeLinejoin="round" />;
    case "puzzle_owlet":
    default:
      return <path d="M88 147 h7 a5 5 0 1 1 10 0 h7 v7 a5 5 0 1 0 0 10 v6 h-24Z" fill="#FFFFFF" stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
  }
}

/** What sits on and around each boss's head and body. */
function Features({ bossKey, p, layer }: { bossKey: BossKey; p: Palette; layer: "back" | "front" }) {
  if (bossKey === "number_giant") {
    return layer === "back" ? (
      <>
        <circle cx={44} cy={68} r={17} fill={p.dark} />
        <circle cx={156} cy={68} r={17} fill={p.dark} />
        <circle cx={44} cy={68} r={8} fill={p.light} />
        <circle cx={156} cy={68} r={8} fill={p.light} />
        <path d="M100 52 C 90 30, 116 22, 110 38" fill="none" stroke={p.dark} strokeWidth={7} strokeLinecap="round" />
      </>
    ) : null;
  }
  if (bossKey === "word_dragon" || bossKey === "letter_dragon") {
    return layer === "back" ? (
      <>
        <path d="M34 98 C6 72 -2 104 6 126 C18 116 28 120 34 128Z" fill={p.light} stroke={p.dark} strokeWidth={3} strokeLinejoin="round" />
        <path d="M166 98 C194 72 202 104 194 126 C182 116 172 120 166 128Z" fill={p.light} stroke={p.dark} strokeWidth={3} strokeLinejoin="round" />
        <path d="M76 56 L84 32 L94 52Z M94 50 L102 26 L110 50Z M108 52 L118 32 L124 56Z" fill="#FFB547" stroke="#FFB547" strokeWidth={6} strokeLinejoin="round" />
      </>
    ) : (
      <>
        <circle cx={93} cy={115} r={2} fill={p.dark} />
        <circle cx={107} cy={115} r={2} fill={p.dark} />
      </>
    );
  }
  if (bossKey === "letter_camel") {
    return layer === "back" ? (
      <>
        <ellipse cx={46} cy={62} rx={11} ry={18} transform="rotate(-35 46 62)" fill={p.dark} />
        <ellipse cx={154} cy={62} rx={11} ry={18} transform="rotate(35 154 62)" fill={p.dark} />
        <circle cx={88} cy={52} r={10} fill="#B9783A" />
        <circle cx={100} cy={46} r={11} fill="#B9783A" />
        <circle cx={112} cy={52} r={10} fill="#B9783A" />
      </>
    ) : (
      <ellipse cx={100} cy={124} rx={30} ry={17} fill={p.light} opacity={0.9} />
    );
  }
  if (bossKey === "sprout_buddy") {
    return layer === "back" ? (
      <>
        <path d="M100 52 L100 22" stroke="#4CAF50" strokeWidth={7} strokeLinecap="round" />
        <path d="M100 30 C86 10 62 14 58 28 C72 40 90 40 100 30Z" fill="#7ED957" stroke="#4CAF50" strokeWidth={3} strokeLinejoin="round" />
        <path d="M100 26 C114 6 138 10 142 24 C128 36 110 36 100 26Z" fill="#5CC23A" stroke="#4CAF50" strokeWidth={3} strokeLinejoin="round" />
      </>
    ) : (
      <>
        <circle cx={48} cy={92} r={3.5} fill={p.dark} />
        <circle cx={154} cy={150} r={3} fill={p.dark} />
        <circle cx={146} cy={84} r={2.5} fill={p.dark} />
      </>
    );
  }
  // puzzle_owlet
  return layer === "back" ? (
    <>
      <path d="M46 70 L40 34 L72 56Z" fill={p.dark} stroke={p.dark} strokeWidth={6} strokeLinejoin="round" />
      <path d="M154 70 L160 34 L128 56Z" fill={p.dark} stroke={p.dark} strokeWidth={6} strokeLinejoin="round" />
    </>
  ) : (
    <>
      <circle cx={76} cy={100} r={24} fill={p.light} />
      <circle cx={124} cy={100} r={24} fill={p.light} />
      <path d="M94 110 L100 102 L106 110 L100 116Z" fill="#F5B700" stroke="#F5B700" strokeWidth={3} strokeLinejoin="round" />
    </>
  );
}

function Cape() {
  return <path d="M58 86 C36 128 28 168 24 192 L176 192 C172 168 164 128 142 86 Z" fill="#F26D8F" stroke="#D9547A" strokeWidth={3} strokeLinejoin="round" />;
}

function Cap({ y }: { y: number }) {
  const x = 100;
  return (
    <g transform={`rotate(-8 ${x} ${y})`}>
      <path d={`M${x - 18} ${y - 2} Q${x} ${y + 8} ${x + 18} ${y - 2} L${x + 16} ${y - 12} L${x - 16} ${y - 12}Z`} fill="#3A4766" />
      <path d={`M${x - 34} ${y - 12} L${x} ${y - 25} L${x + 34} ${y - 12} L${x} ${y}Z`} fill="#4A5A80" stroke="#3A4766" strokeWidth={2} strokeLinejoin="round" />
      <path d={`M${x} ${y - 12} Q${x + 20} ${y - 10} ${x + 24} ${y + 6}`} fill="none" stroke="#F5A524" strokeWidth={3} strokeLinecap="round" />
      <circle cx={x + 24} cy={y + 8} r={4} fill="#F5A524" />
    </g>
  );
}

function Crown({ y }: { y: number }) {
  const x = 100;
  return (
    <g>
      <path
        d={`M${x - 28} ${y + 2} L${x - 31} ${y - 20} L${x - 15} ${y - 8} L${x} ${y - 28} L${x + 15} ${y - 8} L${x + 31} ${y - 20} L${x + 28} ${y + 2}Z`}
        fill="#FFC83D"
        stroke="#E8A317"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <circle cx={x} cy={y - 6} r={3.5} fill="#F26D8F" />
      <circle cx={x - 16} cy={y - 3} r={2.6} fill="#5BC8F5" />
      <circle cx={x + 16} cy={y - 3} r={2.6} fill="#7ED957" />
    </g>
  );
}

/** Head top per boss, where a cap or crown sits. */
const HEAD_TOP: Record<BossKey, number> = {
  number_giant: 52,
  word_dragon: 50,
  letter_camel: 48,
  sprout_buddy: 50,
  puzzle_owlet: 50,
  letter_dragon: 50,
};

export interface BossProps {
  bossKey: BossKey;
  level: number;
  mood: BossMood;
  /** Accessible name (the boss's name). Decorative when omitted. */
  title?: string;
  /** Allow the knock-out stars to spin (off under reduced motion). */
  animate?: boolean;
  /** Phase 2 (health at or below half): powered up. */
  powered?: boolean;
  className?: string;
}

export default function Boss({ bossKey, level, mood, title, animate = true, powered = false, className = "" }: BossProps) {
  const p = powered && mood !== "ko" ? { ...POWERED, card: PALETTES[bossKey].card } : PALETTES[bossKey];
  const top = HEAD_TOP[bossKey];
  const hasCape = level >= 3;
  const hasCrown = level >= 4;
  const hasCap = level >= 2 && !hasCrown;
  const waving = mood === "wave";
  let extras: ReactNode = null;
  if (mood === "hit") {
    extras = (
      <g>
        <Star x={26} y={44} />
        <Star x={172} y={36} />
        <Star x={150} y={12} s={0.6} />
      </g>
    );
  } else if (mood === "sleep") {
    extras = (
      <g fill="#FFFFFF" fontFamily="system-ui, sans-serif" fontWeight={800} opacity={0.9}>
        <text x={150} y={52} fontSize={22}>z</text>
        <text x={166} y={34} fontSize={16}>z</text>
      </g>
    );
  } else if (mood === "ko") {
    extras = (
      <>
        {/* stars circling the head, and a little poof at the feet */}
        <g>
          <ellipse cx={100} cy={top - 6} rx={46} ry={11} fill="none" stroke="#F5A524" strokeWidth={2} strokeDasharray="4 6" opacity={0.6} />
          <g>
            <Star x={54} y={top - 6} s={0.9} />
            <Star x={100} y={top - 17} s={0.75} />
            <Star x={146} y={top - 6} s={0.9} />
            {animate && (
              <animateTransform attributeName="transform" type="rotate" from={`0 100 ${top - 6}`} to={`360 100 ${top - 6}`} dur="0.9s" repeatCount="2" />
            )}
          </g>
        </g>
        <g fill="#FFFFFF" stroke="#E7DCCB" strokeWidth={2}>
          <circle cx={30} cy={180} r={12} />
          <circle cx={46} cy={188} r={9} />
          <circle cx={170} cy={180} r={12} />
          <circle cx={154} cy={188} r={9} />
        </g>
      </>
    );
  }
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      overflow="visible"
    >
      <ellipse cx={100} cy={190} rx={62} ry={7} fill={INK} opacity={0.12} />
      {hasCape && <Cape />}
      <Features bossKey={bossKey} p={p} layer="back" />
      {(bossKey === "word_dragon" || bossKey === "letter_dragon") && <path d="M150 172 Q182 176 190 152 L198 160 L186 166" fill="none" stroke={p.main} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />}
      <g transform={mood === "ko" ? "rotate(-6 100 150)" : undefined}>
        <ellipse cx={100} cy={118} rx={76} ry={70} fill={p.main} />
        <ellipse cx={100} cy={148} rx={44} ry={33} fill={p.light} />
        <ellipse cx={66} cy={184} rx={20} ry={9} fill={p.dark} />
        <ellipse cx={134} cy={184} rx={20} ry={9} fill={p.dark} />
        <Features bossKey={bossKey} p={p} layer="front" />
        <Face mood={mood} p={p} powered={powered} />
        {/* the puzzle card, held up with both hands (one waves instead) */}
        <rect x={80} y={137} width={40} height={36} rx={9} fill={p.card} transform={mood === "hit" ? "rotate(-8 100 156)" : undefined} />
        <g transform={mood === "hit" ? "rotate(-8 100 156)" : undefined}>
          <CardGlyph bossKey={bossKey} mood={mood} />
        </g>
        <ellipse cx={78} cy={153} rx={11} ry={9} fill={p.dark} />
        {waving ? (
          <>
            <ellipse cx={176} cy={86} rx={12} ry={10} fill={p.dark} />
            <path d="M184 64 q7 -3 10 2" stroke={p.dark} strokeWidth={3} fill="none" strokeLinecap="round" />
            <path d="M190 76 q6 0 7 5" stroke={p.dark} strokeWidth={3} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <ellipse cx={122} cy={153} rx={11} ry={9} fill={p.dark} />
        )}
        {hasCap && <Cap y={top} />}
        {hasCrown && <Crown y={top - 2} />}
      </g>
      {hasCrown && (
        <g>
          <Star x={20} y={70} s={0.7} />
          <Star x={182} y={120} s={0.6} />
        </g>
      )}
      {powered && mood !== "ko" && (
        <g fill="#FFFFFF" stroke="#F3C4CF" strokeWidth={2} opacity={0.95}>
          {/* little huffs of steam: powered up */}
          <circle cx={30} cy={40} r={8} />
          <circle cx={20} cy={30} r={5} />
          <circle cx={170} cy={40} r={8} />
          <circle cx={180} cy={30} r={5} />
        </g>
      )}
      {extras}
    </svg>
  );
}
