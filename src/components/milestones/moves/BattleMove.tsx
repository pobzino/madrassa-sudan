"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Check, Delete, Undo2, X } from "lucide-react";
import type { BattleTurn, Lang, OwlHint } from "@/lib/milestones/types";
import type { InteractionAnswer } from "@/lib/interactions/types";
import { formatNumber, MILESTONE_COPY } from "../copy";
import { play } from "../motion";
import type { SkinParts } from "../signatures";
import { MathText } from "../BattleParts";
import { pickList, pickText, type PublicInteraction } from "./contract";
import { layoutCatch, type CatchLayout } from "./catchLayout";
import * as fx from "./fx";

/** How many things the boss throws in a catch move (more than any count asked for). */
/** More than any count a battle asks for (1-12), so catching them all is never the answer. */
export const CATCH_ITEMS = 14;

/**
 * Every battle move is a shared Interaction re-skinned for the arena and laid
 * out IN it: the move fills the space between the owl (bottom corner) and the
 * boss. Calm for young children: at most four things to tap (catching
 * excepted), every target at least 64px, one confirm button only where the
 * move needs it, small round icon buttons for Undo. Bottom rows start past the
 * owl's corner (`ps-[32%]`).
 */
export interface BattleMoveProps {
  interaction: PublicInteraction;
  lang: Lang;
  turn: BattleTurn;
  /** The Owl hint on this question, if used: options to hide or a placement to lock. */
  hint: OwlHint | null;
  /** Free-entry answers that are digits get a number pad. */
  numeric: boolean;
  disabled: boolean;
  /** `origin` is where the move's star or shield launches from. */
  onSubmit: (answer: InteractionAnswer, origin: DOMRect | null) => void;
  /** Seed for stable layouts (the question id). */
  seed: string;
  /** The localized prompt (shown inside moves that own it). */
  prompt: string;
  /** The read-aloud button, for moves that show their own prompt. */
  speaker?: ReactNode;
  /** A boss's signature skin on this move (block turns). */
  skin?: SkinParts | null;
  /** Where caught things fly to (the owl). */
  catchTarget?: () => DOMRect | null;
  /** Where thrown things come from (the boss). */
  throwFrom?: () => DOMRect | null;
  /** The owl's box, for moves that move the owl itself (the dodge roll). */
  owlBox?: () => HTMLElement | null;
  /** The Owl hint icon button, first in the action row (when the hint fits). */
  hintButton?: ReactNode;
  /** Height of the targets band, between the boss's ledge and the owl's head (px). */
  bandHeight?: number;
  /** The band's left inset (px): beside the owl when a long question fills the space above it. */
  bandInset?: number;
  /** The band's width (px), for laying out its targets. */
  bandWidth?: number;
  /** The bottom action row's height (px). */
  actionsHeight?: number;
  /** The action row's left inset (px). */
  actionsInset?: number;
  /** Catch moves use the whole middle: how far above the band the field starts (px, up to the HUD). */
  catchRise?: number;
  /** Catch moves: what the scattered items must stay clear of (screen rects: boss, bubble, owl). */
  catchAvoid?: () => DOMRect[];
  /** Changes whenever those areas move or resize (the bubble's text, the HUD), to lay out again. */
  catchKey?: string;
}

/** Moves whose prompt lives inside the move itself (the spell scroll). */
export function moveOwnsPrompt(interaction: PublicInteraction): boolean {
  return interaction.type === "fill_missing_word";
}

export default function BattleMove(props: BattleMoveProps) {
  return (
    <div className="h-full" style={{ "--band": `${props.bandHeight ?? 210}px`, "--band-inset": `${props.bandInset ?? 0}px`, "--actions": `${props.actionsHeight ?? 76}px`, "--actions-inset": `${props.actionsInset ?? 0}px` } as CSSProperties}>
      <MoveBody {...props} />
    </div>
  );
}

function MoveBody(props: BattleMoveProps) {
  switch (props.interaction.type) {
    case "choose_correct":
      return <StarOrbs {...props} interaction={props.interaction} />;
    case "true_false":
      return <DodgeLanes {...props} />;
    case "tap_to_count":
      return <CatchCount {...props} interaction={props.interaction} />;
    case "sequence_order":
      return <RuneStones {...props} interaction={props.interaction} />;
    case "match_pairs":
    case "sort_groups":
    case "drag_drop_label":
      return <PlacePieces {...props} interaction={props.interaction} />;
    case "fill_missing_word":
      return <SpellScroll {...props} interaction={props.interaction} />;
  }
}

/* ------------------------------------------------------------- shared bits */

const ORB_STYLE = {
  background: "radial-gradient(circle at 34% 28%, #FFFBEA 0%, #FDE68A 20%, #F59E0B 58%, #D97706 100%)",
  boxShadow: "0 0 26px rgba(245,158,11,0.75), inset 0 -7px 14px rgba(146,64,14,0.35)",
} as const;

const STONE = "border-[3px] border-[#D6CFC2] bg-[#FFF8EC] text-[#1a1a1a] shadow-[0_5px_0_#A8A091]";

/** Chunky carved stones (sequence_order), each a slightly different shape. */
const RUNE_STONE =
  "border-[4px] border-[#A8A29E] bg-[linear-gradient(160deg,#FAFAF9,#D6D3D1_75%)] text-[#1a1a1a] shadow-[0_8px_0_#57534E,inset_0_3px_0_rgba(255,255,255,0.6)]";
const RUNE_SHAPES = ["42% 58% 52% 48% / 46% 40% 60% 54%", "56% 44% 46% 54% / 52% 58% 42% 48%", "48% 52% 60% 40% / 40% 52% 48% 60%", "60% 40% 44% 56% / 56% 46% 54% 44%"];

/** The move's targets: the band between the boss and the owl. */
const BAND = "h-[var(--band,210px)] shrink-0 ml-[var(--band-inset,0px)]";
/** The bottom row: small round icons (hint, undo), then the one big button. */
/** The bottom row; never wider than a comfortable reach, centred in the space it has. */
const ACTION_ROW = "mt-auto ml-[var(--actions-inset,0px)] flex h-[var(--actions,76px)] w-[calc(100%-var(--actions-inset,0px))] max-w-[620px] shrink-0 items-center gap-2.5 self-center";

function rectOf(element: Element | null): DOMRect | null {
  return element ? element.getBoundingClientRect() : null;
}

/**
 * Every signature effect leads INTO the owl: the pieces gather at its wing,
 * and the owl's throw (combat.ts) carries them to the boss. On block turns
 * the shield forms around the owl in the move's motif.
 */
function aimOf(props: Pick<BattleMoveProps, "turn" | "throwFrom" | "catchTarget">, motif: fx.ShieldMotif, glyph?: string): DOMRect | null {
  const owl = props.catchTarget?.() ?? null;
  if (props.turn === "block") fx.formShield(motif, owl, glyph);
  if (!owl) return null;
  const size = owl.width * 0.3;
  return new DOMRect(owl.left + owl.width * 0.8 - size / 2, owl.top + owl.height * 0.5 - size / 2, size, size);
}

type ConfirmKind = "fire" | "block" | "cast";

function ConfirmButton({ kind, lang, disabled, onClick }: { kind: ConfirmKind; lang: Lang; disabled: boolean; onClick: (origin: DOMRect | null) => void }) {
  const t = MILESTONE_COPY[lang];
  const ref = useRef<HTMLButtonElement>(null);
  // Chunky and glossy: a top highlight and a darker bottom edge. Block is brand
  // green with white text; Fire and Cast are amber with dark text (white on
  // amber is too faint to read).
  const colours =
    kind === "block"
      ? "bg-[linear-gradient(180deg,#2FB25A_0%,#007229_55%,#005C22_100%)] text-white shadow-[0_6px_0_#00451A,inset_0_3px_0_rgba(255,255,255,0.35)] [text-shadow:0_2px_0_rgba(0,0,0,0.25)]"
      : "bg-[linear-gradient(180deg,#FDE68A_0%,#F59E0B_55%,#D97706_100%)] text-[#3B1D00] shadow-[0_6px_0_#92400E,inset_0_3px_0_rgba(255,255,255,0.5)]";
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={() => onClick(rectOf(ref.current))}
      className={`h-[calc(var(--actions,76px)-8px)] min-w-0 flex-1 rounded-full text-[clamp(22px,calc(var(--actions,76px)*0.37),28px)] font-bold transition-transform active:translate-y-1 active:shadow-none disabled:bg-none disabled:bg-[#9CA3AF] disabled:text-white/90 disabled:shadow-[0_6px_0_#6B7280] disabled:[text-shadow:none] disabled:active:translate-y-0 ${colours}`}
    >
      {kind === "fire" ? t.fire : kind === "block" ? t.block : t.cast}
    </button>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-[min(56px,calc(var(--actions,76px)-8px))] w-[min(56px,calc(var(--actions,76px)-8px))] shrink-0 place-items-center rounded-full bg-[#FFF8EC] text-[#007229] shadow-[0_4px_0_rgba(0,0,0,0.25)] disabled:opacity-0"
    >
      {children}
    </button>
  );
}

/**
 * Drag an element onto a `[data-slot]` (or tap the slot instead). Plain
 * pointer events, so it works with touch, pen and mouse.
 */
function useDragPiece(onDrop: (slot: string) => void, disabled: boolean) {
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return;
      start.current = { x: event.clientX, y: event.clientY, dragging: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [disabled]
  );
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    const el = event.currentTarget;
    if (!s) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.dragging && Math.hypot(dx, dy) > 8) {
      s.dragging = true;
      el.style.pointerEvents = "none";
      el.style.zIndex = "30";
    }
    if (s.dragging) el.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
  }, []);
  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      const el = event.currentTarget;
      start.current = null;
      if (!s || !s.dragging) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot]");
      el.style.transform = "";
      el.style.pointerEvents = "";
      el.style.zIndex = "";
      if (target?.dataset.slot) onDrop(target.dataset.slot);
    },
    [onDrop]
  );
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}

/* ------------------------------ choose_correct: star orbs circling the owl */

/** Orbs floating in a zigzag across the band between the owl and the boss (never touching). */
function orbArc(count: number, narrow = false): Array<{ x: number; y: number }> {
  // A narrow band (beside the owl): a plain 2 x 2 grid, so no two orbs touch.
  if (narrow && count > 2) return [{ x: 27, y: 26 }, { x: 73, y: 26 }, { x: 27, y: 74 }, { x: 73, y: 74 }].slice(0, count);
  if (count <= 2) return [{ x: 30, y: 50 }, { x: 70, y: 50 }];
  if (count === 3) return [{ x: 20, y: 30 }, { x: 50, y: 72 }, { x: 80, y: 30 }];
  return [{ x: 20, y: 25 }, { x: 80, y: 25 }, { x: 36, y: 76 }, { x: 64, y: 76 }];
}

function StarOrbs(props: BattleMoveProps & { interaction: Extract<PublicInteraction, { type: "choose_correct" }> }) {
  const { interaction, lang, hint, disabled, onSubmit, hintButton } = props;
  const options = pickList(interaction.options, lang).slice(0, 4);
  const hidden = hint?.hideOptionIds ?? [];
  const round = options.every((option) => option.trim().length <= 9);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const spots = orbArc(options.length, (props.bandWidth ?? 400) < 280);
  // The chosen orb charges and launches with a comet trail; the others pop.
  const choose = (index: number) => {
    const origin = rectOf(refs.current[index]);
    fx.orbLaunch(refs.current[index], refs.current.filter((_, i) => i !== index), aimOf(props, "orb"));
    onSubmit({ type: "choose_correct", selected_index: index }, origin);
  };

  // The orbs drift in from the owl.
  useLayoutEffect(() => {
    const animations = refs.current.map((el, i) =>
      play(el, [{ scale: "0.2", opacity: 0 }, { scale: "1", opacity: 1 }], {
        duration: 420,
        delay: 80 * i,
        easing: "cubic-bezier(0.34, 1.4, 0.64, 1)",
        fill: "backwards",
      })
    );
    return () => animations.forEach((a) => a?.cancel());
  }, []);

  if (!round) {
    // Longer answers: glowing pills stacked in the open space past the owl.
    return (
      <div className="flex h-full flex-col">
       <div data-layout="moves" className={`${BAND} flex flex-col justify-center gap-2`}>
        {options.map((option, index) => {
          const gone = hidden.includes(index);
          return (
            <button
              key={index}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              disabled={disabled || gone}
              aria-hidden={gone || undefined}
              onClick={() => choose(index)}
              className={`min-h-14 w-full rounded-full px-5 py-1.5 text-start text-[21px] font-semibold leading-snug text-[#1a1a1a] transition-[opacity,scale] duration-300 active:scale-95 ${gone ? "scale-50 opacity-0" : ""}`}
              style={ORB_STYLE}
            >
              <span className="break-words [unicode-bidi:plaintext]">{option}</span>
            </button>
          );
        })}
       </div>
       <div data-layout="actions" className={ACTION_ROW}>{hintButton}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
     <div data-layout="moves" className={`relative ${BAND}`}>
      {options.map((option, index) => {
        const gone = hidden.includes(index);
        const spot = spots[index];
        return (
          <button
            key={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            disabled={disabled || gone}
            aria-hidden={gone || undefined}
            onClick={() => choose(index)}
            className={`absolute grid aspect-square h-[clamp(52px,calc(var(--band)*0.44),100px)] -translate-y-1/2 place-items-center rounded-full text-[clamp(30px,5dvh,40px)] font-bold text-[#1a1a1a] transition-[opacity,scale] duration-300 active:scale-95 ltr:-translate-x-1/2 rtl:translate-x-1/2 ${gone ? "scale-50 opacity-0" : ""}`}
            style={{ ...ORB_STYLE, insetInlineStart: `${spot.x}%`, top: `${spot.y}%` }}
          >
            <span className="pointer-events-none absolute start-[20%] top-[16%] h-3 w-3 rounded-full bg-white/80" aria-hidden="true" />
            <span className="break-words [unicode-bidi:plaintext]">{option}</span>
          </button>
        );
      })}
     </div>
     <div data-layout="actions" className={ACTION_ROW}>{hintButton}</div>
    </div>
  );
}

/* ------------------------------------------- true_false: dodge left/right */

function DodgeLanes(props: BattleMoveProps) {
  const { lang, disabled, onSubmit } = props;
  const t = MILESTONE_COPY[lang];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const swipe = useRef<{ x: number } | null>(null);
  const choose = (value: boolean) => {
    if (disabled) return;
    const chosen = rectOf(refs.current[value ? 0 : 1]);
    // The attack streaks through the lane you left; the owl dodge-rolls your way.
    fx.dodgeRoll(props.owlBox?.() ?? null, chosen, rectOf(refs.current[value ? 1 : 0]));
    if (props.turn === "block") aimOf(props, "lanes");
    onSubmit({ type: "true_false", value }, chosen);
  };
  // Swipe toward a lane to dodge into it. The "True" lane is on the start side.
  const onPointerDown = (event: ReactPointerEvent) => {
    swipe.current = { x: event.clientX };
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = event.clientX - s.x;
    if (Math.abs(dx) < 50) return;
    choose(lang === "ar" ? dx > 0 : dx < 0);
  };
  return (
    <div data-layout="moves" className={`grid grid-cols-2 items-center gap-5 px-1 ${BAND}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: "pan-y" }}>
      {[true, false].map((value) => (
        <button
          key={String(value)}
          ref={(element) => {
            refs.current[value ? 0 : 1] = element;
          }}
          type="button"
          disabled={disabled}
          onClick={() => choose(value)}
          className={`flex h-[clamp(130px,21dvh,190px)] flex-col items-center justify-center gap-2 rounded-[30px] border-4 text-white transition-transform active:scale-95 ${
            value ? "border-[#4ADE80]/70 bg-[#007229]/85" : "border-[#FCA5A5]/70 bg-[#D21034]/85"
          }`}
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95" aria-hidden="true">
            {value ? <Check className="h-10 w-10 text-[#007229]" strokeWidth={3.5} /> : <X className="h-10 w-10 text-[#D21034]" strokeWidth={3.5} />}
          </span>
          <span className="text-[28px] font-bold">{value ? t.trueLabel : t.falseLabel}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------- tap_to_count: the boss throws them; catch for the owl */

/** The CSS zoom an element is drawn at (screen px per layout px). */
function zoomOf(element: HTMLElement): number {
  const width = element.offsetWidth;
  if (!width) return 1;
  const z = element.getBoundingClientRect().width / width;
  // Only whole zoom steps matter here, not a transform in flight.
  return Number.isFinite(z) && z > 0.5 && z < 3 ? Math.round(z * 20) / 20 : 1;
}

function CatchCount({ interaction, lang, turn, disabled, onSubmit, seed, skin, catchTarget, throwFrom, hintButton, catchRise = 0, catchAvoid, catchKey = "" }: BattleMoveProps & { interaction: Extract<PublicInteraction, { type: "tap_to_count" }> }) {
  const t = MILESTONE_COPY[lang];
  // More than any count asked for: the prompt says how many to tap.
  const total = CATCH_ITEMS;
  const goal = interaction.catch_count;
  const [caught, setCaught] = useState<number[]>([]);
  const fieldRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<CatchLayout | null>(null);

  // Lay the bubbles out over the whole field, clear of the owl and its platform.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const measure = () => {
      const box = field.getBoundingClientRect();
      // Screen rects -> the field's own (unzoomed) pixels: the desktop move is zoomed.
      const z = zoomOf(field);
      const width = box.width / z;
      const height = box.height / z;
      const margin = 6;
      const local = (r: { left: number; top: number; right: number; bottom: number }) => ({
        left: (r.left - box.left) / z - margin,
        top: (r.top - box.top) / z - margin,
        right: (r.right - box.left) / z + margin,
        bottom: (r.bottom - box.top) / z + margin,
      });
      const exclude = (catchAvoid?.() ?? []).map(local);
      // The owl keeps everything under it clear too: its platform.
      const owl = catchTarget?.();
      if (owl) exclude.push({ ...local({ left: owl.left, top: owl.top + owl.height * 0.08, right: owl.right, bottom: owl.bottom }), bottom: height + 1 });
      setLayout(layoutCatch({ count: total, width, height, exclude, seed }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, catchRise, catchKey]);

  // They tumble in from the boss and land where they lie.
  const laidOut = layout !== null;
  useLayoutEffect(() => {
    if (!laidOut) return;
    const from = throwFrom?.();
    const items = Array.from(fieldRef.current?.querySelectorAll<HTMLElement>("[data-thrown]") ?? []);
    const animations = items.map((el, i) => {
      const box = el.getBoundingClientRect();
      const z = zoomOf(el);
      const dx = from ? (from.left + from.width / 2 - (box.left + box.width / 2)) / z : 0;
      const dy = from ? (from.top + from.height / 2 - (box.top + box.height / 2)) / z : -200;
      return play(el, [
        { transform: `translate(${dx}px, ${dy}px) rotate(-200deg) scale(0.4)`, opacity: 0 },
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
      ], { duration: 560, delay: i * 55, easing: "cubic-bezier(0.3, 1.25, 0.6, 1)", fill: "backwards" });
    });
    return () => animations.forEach((a) => a?.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidOut, seed]);

  const catchOne = (index: number, element: HTMLElement) => {
    if (disabled || caught.includes(index)) return;
    const from = element.getBoundingClientRect();
    const to = catchTarget?.();
    const z = zoomOf(element);
    const animation = to
      ? play(element, [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${(to.left + to.width / 2 - (from.left + from.width / 2)) / z}px, ${(to.top + to.height / 2 - (from.top + from.height / 2)) / z}px) scale(0.35)`, opacity: 0.2 },
        ], { duration: 420, easing: "ease-in", fill: "forwards" })
      : null;
    // It zips into the owl's shield: "+1", and the counter bumps.
    const done = () => {
      setCaught((current) => [...current, index]);
      fx.plusOne(catchTarget?.() ?? null);
      fx.squash(counterRef.current, "bump");
    };
    if (animation) animation.onfinish = done;
    else done();
  };
  const fire = (origin: DOMRect | null) => {
    // Everything caught fires as a volley (or rings the owl as its shield).
    aimOf({ turn, throwFrom, catchTarget }, "catch", interaction.emoji || "⭐");
    // They ride along with the owl's throw.
    if (turn === "attack") fx.volley(interaction.emoji || "⭐", caught.length, catchTarget?.() ?? null, throwFrom?.() ?? null);
    onSubmit({ type: "tap_to_count", count: caught.length }, origin);
  };

  const glyph = interaction.emoji || "⭐";
  const size = layout?.size ?? 64;
  return (
    <div className="relative flex h-full flex-col">
      {/* the whole middle of the arena, from under the HUD down to the action row */}
      <div ref={fieldRef} className="pointer-events-none absolute inset-x-0" style={{ top: -catchRise, bottom: "var(--actions, 76px)" }}>
        {layout?.points.map((point, index) =>
          caught.includes(index) ? null : (
            <button
              key={index}
              type="button"
              data-thrown="" data-layout="moves"
              disabled={disabled}
              onClick={(event) => catchOne(index, event.currentTarget)}
              aria-label={glyph}
              className={`pointer-events-auto absolute grid place-items-center leading-none active:scale-90 ${
                skin?.thrown === "die"
                  ? "rounded-full border-2 border-[#FDE68A]/70 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.55),rgba(253,224,71,0.22)_50%,rgba(245,158,11,0.3))] shadow-[0_0_20px_rgba(252,211,77,0.6),inset_0_0_12px_rgba(255,255,255,0.25)]"
                  : skin?.thrown === "seed"
                    ? "rounded-[50%] bg-[radial-gradient(circle_at_35%_30%,#E8B880,#A86F37)]"
                    : "rounded-full border-2 border-white/45 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.38),rgba(110,231,183,0.14)_55%,rgba(16,185,129,0.2))] shadow-[0_0_18px_rgba(110,231,183,0.5),inset_0_0_12px_rgba(255,255,255,0.18)]"
              }`}
              style={{ left: point.x, top: point.y, width: size, height: size, fontSize: Math.round(size * 0.46) }}
            >
              <span aria-hidden="true">{glyph}</span>
            </button>
          )
        )}
      </div>
      <div data-layout="actions" className={ACTION_ROW}>
        {hintButton}
        <IconButton label={t.undo} onClick={() => setCaught((current) => current.slice(0, -1))} disabled={disabled || caught.length === 0}>
          <Undo2 className="h-6 w-6" aria-hidden="true" />
        </IconButton>
        <div ref={counterRef} className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-[#FFF8EC] px-3.5 text-[#1a1a1a] shadow-[0_4px_0_rgba(0,0,0,0.25)]" aria-live="polite">
          <span className="text-[18px] font-bold leading-none">{t.caught}</span>
          <span className="text-[24px] font-bold leading-none">{formatNumber(caught.length, lang)}</span>
          {goal != null && <span className="text-[16px] font-bold leading-none text-[#6B7280]">/ {formatNumber(goal, lang)}</span>}
        </div>
        <ConfirmButton kind={turn === "attack" ? "fire" : "block"} lang={lang} disabled={disabled || caught.length === 0} onClick={fire} />
      </div>
    </div>
  );
}

/* --------------------------------- sequence_order: rune stones in order */

function RuneStones(props: BattleMoveProps & { interaction: Extract<PublicInteraction, { type: "sequence_order" }> }) {
  const { interaction, lang, hint, disabled, onSubmit, skin, hintButton } = props;
  const t = MILESTONE_COPY[lang];
  const items = pickList(interaction.items, lang);
  // The Owl hint lights the first stone for you.
  const locked = hint?.lockedPlacement ? [hint.lockedPlacement.itemIndex] : [];
  const [picked, setPicked] = useState<number[]>([]);
  const order = [...locked, ...picked.filter((index) => !locked.includes(index))];
  const complete = order.length === items.length && items.length > 0;
  const stones = useRef<Array<HTMLButtonElement | null>>([]);
  const links = useRef<HTMLDivElement>(null);
  // A glowing line links each lit stone to the one before it.
  const orderKey = order.join(",");
  useLayoutEffect(() => {
    fx.linkStones(links.current, stones.current, orderKey ? orderKey.split(",").map(Number) : [], true);
  }, [orderKey]);
  const pick = (index: number) => {
    fx.squash(stones.current[index], "pulse");
    setPicked((current) => [...current, index]);
  };
  const cast = (origin: DOMRect | null) => {
    // The chain flashes in order and fires a beam.
    fx.chainBeam(stones.current, order, aimOf(props, "runes"));
    onSubmit({ type: "sequence_order", order }, origin);
  };
  return (
    <div className="flex h-full flex-col">
      <div data-layout="moves" className={`flex items-center ${BAND}`}>
        <div className={`relative grid w-full gap-x-6 gap-y-7 px-2 ${items.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}>
          <div ref={links} className="pointer-events-none absolute inset-0" aria-hidden="true" />
          {items.map((item, index) => {
            const place = order.indexOf(index);
            const lit = place >= 0;
            return (
              <button
                key={index}
                ref={(element) => {
                  stones.current[index] = element;
                }}
                type="button"
                disabled={disabled || lit}
                onClick={() => pick(index)}
                className={`relative min-h-[84px] px-3 py-3 text-[30px] font-bold leading-snug transition-[scale,opacity] active:scale-95 ${skin?.piece ?? RUNE_STONE} ${lit ? "ring-4 ring-[#F59E0B] ring-offset-2 ring-offset-transparent" : ""}`}
                style={{ rotate: `${[-5, 4, 3, -4, 5, -3][index % 6]}deg`, translate: `0 ${index % 2 ? 10 : -6}px`, borderRadius: RUNE_SHAPES[index % RUNE_SHAPES.length] }}
              >
                <span className="break-words [unicode-bidi:plaintext]">{item}</span>
                {lit && (
                  <span className="absolute -end-2 -top-3 grid h-9 w-9 place-items-center rounded-full bg-[#F59E0B] text-xl font-bold text-[#1a1a1a] shadow-[0_0_12px_rgba(245,158,11,0.9)] [text-shadow:none]">
                    {formatNumber(place + 1, lang)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div data-layout="actions" className={ACTION_ROW}>
        {hintButton}
        <IconButton label={t.undo} onClick={() => setPicked((current) => current.slice(0, -1))} disabled={disabled || picked.length === 0}>
          <Undo2 className="h-6 w-6" aria-hidden="true" />
        </IconButton>
        <ConfirmButton kind="cast" lang={lang} disabled={disabled || !complete} onClick={cast} />
      </div>
    </div>
  );
}

/* ------------- match_pairs / sort_groups / drag_drop_label: one piece at a time */

function PlacePieces(props: BattleMoveProps & { interaction: Extract<PublicInteraction, { type: "match_pairs" | "sort_groups" | "drag_drop_label" }> }) {
  const { interaction, lang, turn, hint, disabled, onSubmit, skin, hintButton } = props;
  const t = MILESTONE_COPY[lang];
  const pieceRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pieces = pickList(interaction.type === "drag_drop_label" ? interaction.labels : interaction.items, lang);
  const slots = interaction.type === "drag_drop_label" ? interaction.hotspots.map((_, i) => String(i + 1)) : pickList(interaction.targets, lang);
  const oneEach = interaction.type !== "sort_groups";
  // The Owl hint locks one correct placement in for you.
  const lockedPiece = hint?.lockedPlacement ?? null;
  // Placements in the order they were made: [pieceIndex, slotIndex].
  const [made, setMade] = useState<Array<[number, number]>>([]);
  const all: Array<[number, number]> = lockedPiece ? [[lockedPiece.itemIndex, lockedPiece.targetIndex], ...made] : made;
  const slotOf = new Map(all);
  const current = pieces.findIndex((_, index) => !slotOf.has(index));
  const hasCurrent = current >= 0;
  const complete = !hasCurrent && pieces.length > 0;
  const slotTaken = (slot: number) => oneEach && [...slotOf.values()].includes(slot);

  const place = (slot: number) => {
    if (disabled || !hasCurrent || slotTaken(slot)) return;
    // Matches snap in with a spark; sorted things fly into a basket that gulps
    // them; labels stamp onto the picture.
    const target = slotRefs.current[slot];
    if (interaction.type === "sort_groups") fx.intoBasket(pieceRef.current, target);
    else {
      fx.flyInto(pieceRef.current, target, 0.5);
      window.setTimeout(() => (interaction.type === "match_pairs" ? fx.snapSpark(slotRefs.current[slot]) : fx.stampLabel(slotRefs.current[slot])), 260);
    }
    setMade((list) => [...list, [current, slot]]);
  };
  const confirm = (origin: DOMRect | null) => {
    const filled = [...new Set(all.map(([, slot]) => slot))].sort((a, b) => a - b).map((slot) => slotRefs.current[slot]);
    const aim = aimOf(props, interaction.type === "match_pairs" ? "pairs" : interaction.type === "sort_groups" ? "baskets" : "stamp");
    if (interaction.type === "match_pairs") fx.pairsFly(filled, aim);
    else if (interaction.type === "sort_groups") fx.basketsBurst(filled);
    else fx.labelsFire(filled, turn === "attack" ? aim : null);
    onSubmit(answer(), origin);
  };
  const drag = useDragPiece((slot) => place(Number(slot)), disabled || !hasCurrent);

  const answer = (): InteractionAnswer =>
    interaction.type === "drag_drop_label"
      ? { type: "drag_drop_label", placements: all.map(([label, hotspot]) => ({ label_index: label, hotspot_index: hotspot })) }
      : { type: interaction.type, placements: all.map(([item, target]) => ({ item_index: item, target_index: target })) };
  const piecesIn = (slot: number) => all.filter(([, s]) => s === slot).map(([piece]) => piece);

  return (
    <div className="flex h-full flex-col">
      <div data-layout="moves" className={`flex flex-col justify-center gap-4 ${BAND}`}>
        {/* the piece to place right now: drag it, or tap where it goes */}
        <div className="flex min-h-[72px] items-center justify-center">
          {hasCurrent ? (
            <div
              key={current}
              ref={pieceRef}
              {...drag}
              className={`min-h-16 min-w-[140px] max-w-full cursor-grab touch-none select-none rounded-[20px] px-5 py-3 text-center text-[26px] font-bold leading-snug motion-safe:animate-pop-in ${skin?.piece ?? STONE}`}
            >
              <span className="[unicode-bidi:plaintext]">{pieces[current]}</span>
            </div>
          ) : null}
        </div>

        {interaction.type === "drag_drop_label" && interaction.image_url ? (
          <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[22px] bg-white/90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={interaction.image_url} alt="" className="block max-h-[150px] w-full object-contain" />
            {interaction.hotspots.map((spot, index) => {
              const label = piecesIn(index)[0];
              return (
                <button
                  key={index}
                  ref={(element) => {
                    slotRefs.current[index] = element;
                  }}
                  type="button"
                  data-slot={index}
                  disabled={disabled || !hasCurrent || slotTaken(index)}
                  onClick={() => place(index)}
                  aria-label={label !== undefined ? pieces[label] : formatNumber(index + 1, lang)}
                  className={`absolute grid min-h-16 min-w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 px-2 text-lg font-bold ${
                    label !== undefined ? "border-[#F59E0B] bg-[#4B4540] text-[#FDE68A]" : "border-dashed border-white bg-[#007229]/80 text-white"
                  }`}
                  style={{ left: `${spot.x_percent}%`, top: `${spot.y_percent}%` }}
                >
                  {label !== undefined ? pieces[label] : formatNumber(index + 1, lang)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, slots.length))}, minmax(0, 1fr))` }}>
            {slots.slice(0, 4).map((slot, index) => {
              const inside = piecesIn(index);
              return (
                <button
                  key={index}
                  ref={(element) => {
                    slotRefs.current[index] = element;
                  }}
                  type="button"
                  data-slot={index}
                  disabled={disabled || !hasCurrent || slotTaken(index)}
                  onClick={() => place(index)}
                  className={`flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-[22px] px-1.5 py-2 transition-transform active:scale-95 ${
                    inside.length
                      ? skin?.slotFilled ?? "border-4 border-[#F59E0B] bg-[#007229] text-white"
                      : skin?.slot ?? "border-4 border-dashed border-white/80 bg-[#007229]/70 text-white"
                  }`}
                >
                  <span className="text-[22px] font-bold leading-tight [unicode-bidi:plaintext]">{slot}</span>
                  {inside.length > 0 && (
                    <span className="flex flex-wrap justify-center gap-1">
                      {inside.map((piece) => (
                        <span key={piece} className="rounded-full bg-[#4B4540] px-2.5 py-0.5 text-base font-bold text-[#FDE68A]">
                          {pieces[piece]}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div data-layout="actions" className={ACTION_ROW}>
        {hintButton}
        <IconButton label={t.undo} onClick={() => setMade((list) => list.slice(0, -1))} disabled={disabled || made.length === 0}>
          <Undo2 className="h-6 w-6" aria-hidden="true" />
        </IconButton>
        <ConfirmButton kind={turn === "attack" ? "fire" : "block"} lang={lang} disabled={disabled || !complete} onClick={confirm} />
      </div>
    </div>
  );
}

/* ---------------------- fill_missing_word: drop the letter into the spell scroll */

const BLANK = /_{2,}|…|\.{3}/;

/** A tile you can tap, or drag onto the scroll's blank. */
function DragTile({ disabled, pressed, hiddenTile, onPick, className, children }: { disabled: boolean; pressed: boolean; hiddenTile: boolean; onPick: (tile?: HTMLElement) => void; className: string; children: ReactNode }) {
  const drag = useDragPiece(() => onPick(), disabled);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      aria-hidden={hiddenTile || undefined}
      onClick={(event) => onPick(event.currentTarget)}
      {...drag}
      className={`touch-none select-none ${className}`}
    >
      {children}
    </button>
  );
}

function SpellScroll(props: BattleMoveProps & { interaction: Extract<PublicInteraction, { type: "fill_missing_word" }> }) {
  const { interaction, lang, hint, numeric, disabled, onSubmit, prompt: promptText, speaker, skin, hintButton } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = MILESTONE_COPY[lang];
  const prompt = promptText || pickText(interaction.prompt, lang);
  const options = pickList(interaction.options, lang).slice(0, 4);
  const hidden = hint?.hideOptionIds ?? [];
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const blankRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (chosen !== null) play(blankRef.current, [{ transform: "scale(0.6)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 380 });
  }, [chosen]);

  const free = interaction.free_entry || options.length === 0;
  const fill = free ? typed : chosen !== null ? options[chosen] : "";
  const [before, after] = BLANK.test(prompt) ? prompt.split(BLANK, 2) : [prompt, ""];
  const ready = free ? typed.trim().length > 0 : chosen !== null;
  const submit = (origin: DOMRect | null) => {
    // The scroll glows, rolls up into a spell and flies.
    fx.scrollSpell(scrollRef.current, aimOf(props, "scroll"));
    onSubmit(free ? { type: "fill_missing_word", text: typed.trim().slice(0, 200) } : { type: "fill_missing_word", selected_index: chosen ?? -1 }, origin);
  };

  return (
    <div className="flex h-full flex-col">
      <div data-layout="moves" className={`flex flex-col justify-center gap-4 ${BAND}`}>
        {/* the spell scroll */}
        <div ref={scrollRef} className="relative mx-2 rounded-[18px] bg-[#FEF3C7] px-5 pb-4 pt-5 text-[#1a1a1a] shadow-[0_6px_0_#D6B77A]">
          <span className="absolute inset-y-2 -start-2 w-4 rounded-full bg-[#E9C98B]" aria-hidden="true" />
          <span className="absolute inset-y-2 -end-2 w-4 rounded-full bg-[#E9C98B]" aria-hidden="true" />
          {speaker && <div className="absolute -top-5 end-3">{speaker}</div>}
          <p className="text-center text-[clamp(24px,4dvh,30px)] font-bold leading-snug [unicode-bidi:plaintext]">
            <MathText text={before} />
            <span
              ref={blankRef}
              data-slot="blank"
              className={`mx-1 inline-flex min-h-12 min-w-[72px] items-center justify-center rounded-[14px] border-4 px-2 align-middle ${
                fill ? "border-[#D97706] bg-white text-[#B45309]" : "border-dashed border-[#D97706]/70 bg-white/60 text-transparent"
              }`}
            >
              {fill || "?"}
            </span>
            <MathText text={after} />
          </p>
        </div>

        {free ? (
          numeric ? (
            <MiniPad value={typed} onChange={setTyped} lang={lang} disabled={disabled} />
          ) : (
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={disabled}
              maxLength={200}
              aria-label={t.typeAnswer}
              placeholder={t.typeAnswer}
              dir="auto"
              className="mx-2 h-16 rounded-[22px] border-4 border-[#FDE68A] bg-white px-4 text-center text-[28px] font-bold text-[#1a1a1a] outline-none focus:border-[#F59E0B]"
            />
          )
        ) : (
          <div className="grid grid-cols-4 gap-3 px-1">
            {options.map((option, index) => {
              const gone = hidden.includes(index);
              return (
                <DragTile
                  key={index}
                  disabled={disabled || gone}
                  pressed={chosen === index}
                  hiddenTile={gone}
                  onPick={(tile) => {
                    // The word flies into the gap.
                    if (tile) fx.flyInto(tile, blankRef.current);
                    setChosen(index);
                  }}
                  className={`min-h-16 rounded-[18px] px-1 text-[clamp(22px,3.6dvh,30px)] font-bold transition-[transform,opacity] active:scale-95 ${skin?.piece ?? STONE} ${
                    chosen === index ? "ring-4 ring-[#F59E0B]" : ""
                  } ${gone ? "scale-50 opacity-0" : ""}`}
                >
                  <span className="break-words [unicode-bidi:plaintext]">{option}</span>
                </DragTile>
              );
            })}
          </div>
        )}
      </div>
      <div data-layout="actions" className={ACTION_ROW}>
        {hintButton}
        <ConfirmButton kind="cast" lang={lang} disabled={disabled || !ready} onClick={submit} />
      </div>
    </div>
  );
}

/** A compact number pad for spell answers that are numbers. */
function MiniPad({ value, onChange, lang, disabled }: { value: string; onChange: (next: string) => void; lang: Lang; disabled: boolean }) {
  const t = MILESTONE_COPY[lang];
  const label = (digit: string) => (lang === "ar" ? formatNumber(Number(digit), "ar") : digit);
  const key = "grid h-[clamp(52px,7dvh,64px)] place-items-center rounded-[18px] bg-white/95 text-[28px] font-bold text-[#1a1a1a] shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-1 active:shadow-none disabled:opacity-40";
  return (
    <div className="grid grid-cols-6 gap-2 px-1" dir="ltr">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
        <button key={digit} type="button" className={key} disabled={disabled || value.length >= 6} onClick={() => onChange(value + digit)}>
          {label(digit)}
        </button>
      ))}
      <button type="button" className={`${key} col-span-2`} disabled={disabled || !value} onClick={() => onChange(value.slice(0, -1))} aria-label={t.deleteDigit}>
        <Delete className="h-7 w-7" aria-hidden="true" />
      </button>
    </div>
  );
}
