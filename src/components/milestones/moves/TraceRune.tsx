"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RotateCcw, Sparkles, Undo2 } from "lucide-react";
import type { Lang } from "@/lib/milestones/types";
import type { TraceLetterTemplate } from "@/lib/interactions/trace-letter";
import { arrowPath, penAt, startMarkers, tracePath, useReducedMotion, useTraceDemo, useTracePad } from "@/components/interactions/tracePad";
import { formatNumber, MILESTONE_COPY } from "../copy";
import type { BattleMoveProps } from "./BattleMove";
import type { PublicInteraction } from "./contract";
import * as fx from "./fx";
import { runeIntoOwl } from "./runeFx";

/**
 * trace_letter: the Rune Spell. The letter glows as a big rune in the band
 * between the boss and the owl; "Watch me" draws it with a sparkle pen; the
 * child traces it with a finger, then casts it (attack: it flies into the
 * owl's wing and the owl throws it at the boss) or raises it as a rune shield
 * around the owl (block). Harf the Letter Dragon's signature
 * skin is dragon fire; every other boss gets the starlight skin.
 */

const COPY = {
  en: { watch: "Watch me", clear: "Start again", board: (letter: string) => `Trace ${letter} with your finger` },
  ar: { watch: "شاهدني", clear: "ابدأ من جديد", board: (letter: string) => `تتبّع ${letter} بإصبعك` },
} satisfies Record<Lang, unknown>;

interface Skin {
  backdrop: string;
  ring: string;
  track: string;
  glow: string;
  dash: string;
  ink: string;
  start: string;
  spell: string;
}

const STARLIGHT: Skin = {
  backdrop: "radial-gradient(circle at 50% 45%, rgba(255,251,234,0.32) 0%, rgba(110,231,183,0.18) 42%, rgba(6,78,59,0.55) 70%, rgba(6,78,59,0) 72%)",
  ring: "#A7F3D0",
  track: "rgba(209,250,229,0.42)",
  glow: "#34D399",
  dash: "#ECFDF5",
  ink: "#FDE047",
  start: "#047857",
  spell: "#FDE68A",
};

const DRAGON_FIRE: Skin = {
  backdrop: "radial-gradient(circle at 50% 45%, rgba(255,237,213,0.35) 0%, rgba(251,146,60,0.22) 40%, rgba(76,29,149,0.6) 70%, rgba(76,29,149,0) 72%)",
  ring: "#FDBA74",
  track: "rgba(254,215,170,0.42)",
  glow: "#FB923C",
  dash: "#FFF7ED",
  ink: "#FEF08A",
  start: "#7C2D12",
  spell: "#FDBA74",
};

/** A circle of little rune ticks around the tablet. */
function RuneRing({ colour }: { colour: string }) {
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2), []);
  return (
    <g opacity={0.75}>
      <circle cx={50} cy={50} r={48} fill="none" stroke={colour} strokeWidth={0.8} strokeDasharray="0.6 2.2" />
      <circle cx={50} cy={50} r={45.5} fill="none" stroke={colour} strokeWidth={0.35} opacity={0.6} />
      {ticks.map((angle, i) => (
        <path
          key={i}
          d={`M${50 + Math.cos(angle) * 46.6} ${50 + Math.sin(angle) * 46.6}L${50 + Math.cos(angle) * (i % 3 ? 47.6 : 49.2)} ${50 + Math.sin(angle) * (i % 3 ? 47.6 : 49.2)}`}
          stroke={colour}
          strokeWidth={i % 3 ? 0.6 : 1.1}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

export default function TraceRune(props: BattleMoveProps & { interaction: Extract<PublicInteraction, { type: "trace_letter" }> }) {
  const { interaction, lang, turn, disabled, onSubmit, skin: signature, hintButton } = props;
  const t = MILESTONE_COPY[lang];
  const copy = COPY[lang];
  const skin = signature?.rune === "dragon" ? DRAGON_FIRE : STARLIGHT;
  const template: TraceLetterTemplate = useMemo(
    () => ({ letter: interaction.letter, strokes: interaction.guide.map((stroke) => ({ kind: stroke.kind, width: stroke.width, points: stroke.points })) }),
    [interaction]
  );
  const reducedMotion = useReducedMotion();
  const { demo, play, stop, playing } = useTraceDemo(template, reducedMotion);
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const pad = useTracePad({ strokes, onStrokes: setStrokes, disabled, onStrokeStart: stop });
  const runeRef = useRef<HTMLDivElement>(null);

  // The rune draws itself once, as soon as the move is playable (not while it
  // is hidden behind the boss's entrance). "Watch me" plays it again.
  const shown = useRef(false);
  const firstPlay = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (disabled || shown.current) return;
    shown.current = true;
    firstPlay.current = setTimeout(play, reducedMotion ? 0 : 350);
  }, [disabled, play, reducedMotion]);
  useEffect(() => () => {
    if (firstPlay.current) clearTimeout(firstPlay.current);
  }, []);

  // The lead-in only (BattleScene's combat timeline owns the rest): attack, the
  // rune flies into the owl's wing and the owl throws it at the boss; block,
  // the rune shield forms around the owl and the rune flies into it.
  const cast = (origin: DOMRect | null) => {
    if (!strokes.length) return;
    stop();
    const owl = props.catchTarget?.() ?? null;
    if (turn === "block") fx.formShield("rune", owl, interaction.letter);
    const wing = owl ? new DOMRect(owl.left + owl.width * 0.8 - owl.width * 0.15, owl.top + owl.height * 0.5 - owl.width * 0.15, owl.width * 0.3, owl.width * 0.3) : null;
    const target = turn === "attack" ? wing : owl ? new DOMRect(owl.left + owl.width * 0.25, owl.top + owl.height * 0.3, owl.width * 0.5, owl.width * 0.5) : null;
    const rune = runeRef.current;
    // A frame later, so the confirm's first frame is never held up.
    requestAnimationFrame(() => runeIntoOwl(rune, target, turn === "attack" ? skin.spell : skin.ring));
    onSubmit({ type: "trace_letter", strokes }, origin);
  };

  const pen = demo ? penAt(template.strokes[demo.stroke], demo.t) : null;
  const starts = startMarkers(template);
  const glowId = `rune-glow-${props.seed.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div className="flex h-full flex-col">
      <div data-layout="moves" className="ml-[var(--band-inset,0px)] flex h-[var(--band,210px)] shrink-0 items-center justify-center" dir="ltr">
        {/* Always square (the trace maps onto it): as tall as the band, or as wide as it can be. */}
        <div
          ref={runeRef}
          className="relative select-none [-webkit-touch-callout:none]"
          style={{ width: "min(100%, var(--band, 210px))", aspectRatio: "1 / 1" }}
        >
          <div data-rune-backdrop="" className="pointer-events-none absolute inset-[-4%] rounded-full motion-safe:animate-pulse [animation-duration:3.2s]" style={{ background: skin.backdrop }} aria-hidden="true" />
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={copy.board(interaction.letter)}
            className="relative block h-full w-full"
            style={{ touchAction: "none", cursor: disabled ? "default" : "crosshair", overflow: "visible" }}
            {...pad.handlers}
          >
            <defs>
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g data-rune-backdrop="">
              <RuneRing colour={skin.ring} />
            </g>
            {/* The glowing letter: a soft halo, the bright track, a dashed centre line and arrows. */}
            <g filter={`url(#${glowId})`}>
              {template.strokes.map((stroke, index) => (
                <path key={`halo-${index}`} d={tracePath(stroke.points)} fill="none" stroke={skin.glow} strokeOpacity={0.55} strokeWidth={Math.max(7, (stroke.width ?? 0.06) * 100 + 5)} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {template.strokes.map((stroke, index) => (
                <path key={`track-${index}`} d={tracePath(stroke.points)} fill="none" stroke={skin.track} strokeWidth={Math.max(5, (stroke.width ?? 0.06) * 100 + 1.5)} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
            {template.strokes.map((stroke, index) => (
              <path key={`dash-${index}`} d={tracePath(stroke.points)} fill="none" stroke={skin.dash} strokeOpacity={0.6} strokeWidth={0.9} strokeDasharray="1.4 2.6" strokeLinecap="round" />
            ))}
            {template.strokes.map((stroke, index) => {
              const arrow = arrowPath(stroke);
              return arrow ? <path key={`arrow-${index}`} d={arrow} fill="none" stroke={skin.dash} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" /> : null;
            })}
            {demo &&
              template.strokes.slice(0, demo.stroke + 1).map((stroke, index) => (
                <path
                  key={`demo-${index}`}
                  d={tracePath(stroke.points)}
                  pathLength={1}
                  fill="none"
                  stroke={skin.ink}
                  strokeOpacity={0.9}
                  strokeWidth={Math.max(3.4, (stroke.width ?? 0.06) * 100 * 0.55)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={index < demo.stroke ? undefined : `${Math.max(0.001, demo.t)} 1`}
                />
              ))}
            {/* The child's own strokes: bright magic ink. */}
            <g filter={`url(#${glowId})`}>
              {strokes.map((stroke, index) => (
                <path key={`ink-${index}`} d={tracePath(stroke)} fill="none" stroke={skin.ink} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {pad.current && <path d={tracePath(pad.current)} fill="none" stroke={skin.ink} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />}
            </g>
            {template.strokes.map((stroke, index) => (
              <g key={`start-${index}`} opacity={strokes.length > index ? 0.3 : 1}>
                <circle cx={starts[index][0] * 100} cy={starts[index][1] * 100} r={3.4} fill={skin.start} stroke="#FFFFFF" strokeWidth={0.9} />
                <text x={starts[index][0] * 100} y={starts[index][1] * 100 + 1.35} fill="#FFFFFF" textAnchor="middle" fontSize={3.9} fontWeight={700}>
                  {formatNumber(index + 1, lang)}
                </text>
              </g>
            ))}
            {pen && (
              <g transform={`translate(${pen[0] * 100} ${pen[1] * 100})`} aria-hidden="true">
                <circle r={5} fill="#FFFBEA" opacity={0.45} />
                <path d="M0 -4.4 L1.2 -1.2 L4.4 0 L1.2 1.2 L0 4.4 L-1.2 1.2 L-4.4 0 L-1.2 -1.2 Z" fill="#FDE68A" stroke="#FFFFFF" strokeWidth={0.6} />
              </g>
            )}
          </svg>
        </div>
      </div>
      <div data-layout="actions" className="mt-auto ml-[var(--actions-inset,0px)] flex h-[var(--actions,76px)] w-[calc(100%-var(--actions-inset,0px))] max-w-[620px] shrink-0 items-center gap-2.5 self-center">
        {hintButton}
        <RoundButton label={copy.watch} onClick={playing ? stop : play} disabled={disabled} highlight={playing}>
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </RoundButton>
        <RoundButton label={t.undo} onClick={pad.undo} disabled={disabled || strokes.length === 0} hideWhenDisabled>
          <Undo2 className="h-6 w-6 rtl:-scale-x-100" aria-hidden="true" />
        </RoundButton>
        <RoundButton label={copy.clear} onClick={pad.clear} disabled={disabled || strokes.length === 0} hideWhenDisabled>
          <RotateCcw className="h-6 w-6" aria-hidden="true" />
        </RoundButton>
        <CastButton lang={lang} block={turn === "block"} disabled={disabled || strokes.length === 0} onClick={cast} />
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, disabled, highlight, hideWhenDisabled, children }: { label: string; onClick: () => void; disabled?: boolean; highlight?: boolean; hideWhenDisabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-[min(56px,calc(var(--actions,76px)-8px))] w-[min(56px,calc(var(--actions,76px)-8px))] shrink-0 place-items-center rounded-full shadow-[0_4px_0_rgba(0,0,0,0.25)] transition-opacity ${highlight ? "bg-[#FDE68A] text-[#78350F]" : "bg-[#FFF8EC] text-[#007229]"} ${hideWhenDisabled ? "disabled:opacity-0" : "disabled:opacity-50"}`}
    >
      {children}
    </button>
  );
}

/** The one big button: Cast! (amber) on attack, Block! (green) on block — as the other moves. */
function CastButton({ lang, block, disabled, onClick }: { lang: Lang; block: boolean; disabled: boolean; onClick: (origin: DOMRect | null) => void }) {
  const t = MILESTONE_COPY[lang];
  const ref = useRef<HTMLButtonElement>(null);
  const colours = block
    ? "bg-[linear-gradient(180deg,#2FB25A_0%,#007229_55%,#005C22_100%)] text-white shadow-[0_6px_0_#00451A,inset_0_3px_0_rgba(255,255,255,0.35)] [text-shadow:0_2px_0_rgba(0,0,0,0.25)]"
    : "bg-[linear-gradient(180deg,#FDE68A_0%,#F59E0B_55%,#D97706_100%)] text-[#3B1D00] shadow-[0_6px_0_#92400E,inset_0_3px_0_rgba(255,255,255,0.5)]";
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={() => onClick(ref.current?.getBoundingClientRect() ?? null)}
      className={`h-[calc(var(--actions,76px)-8px)] min-w-0 flex-1 rounded-full text-[clamp(22px,calc(var(--actions,76px)*0.37),28px)] font-bold transition-transform active:translate-y-1 active:shadow-none disabled:bg-none disabled:bg-[#9CA3AF] disabled:text-white/90 disabled:shadow-[0_6px_0_#6B7280] disabled:[text-shadow:none] disabled:active:translate-y-0 ${colours}`}
    >
      {block ? t.block : t.cast}
    </button>
  );
}
