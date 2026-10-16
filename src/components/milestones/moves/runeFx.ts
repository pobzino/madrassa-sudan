"use client";

import { prefersReducedMotion } from "../motion";

/**
 * The Rune Spell's lead-in (trace_letter). On confirm the traced rune lights
 * up, lifts off and flies into the owl's wing (attack: the owl's throw in
 * combat.ts carries it on to the boss) or into the owl's rune shield (block:
 * fx.formShield("rune") rings the owl). Same fixed layer as fx.ts, so clearFx
 * removes these too; transform and opacity only; within ~260ms so the owl's
 * throw follows at once. Reduced motion: a quick fade.
 */

const LAYER_ID = "battle-fx-layer";
/** As fx.ts: lead-ins reach the owl this fast. */
const LEAD_MS = 200;

function layer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(LAYER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = LAYER_ID;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", inset: "0", zIndex: "70", pointerEvents: "none", overflow: "hidden" });
    document.body.appendChild(el);
  }
  return el;
}

function run(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  if (typeof el.animate !== "function") {
    el.remove();
    return;
  }
  const animation = el.animate(keyframes, { fill: "both", easing: "ease-out", ...options });
  animation.onfinish = () => el.remove();
  animation.oncancel = () => el.remove();
}

/** A lit copy of the traced rune (the letter and the child's ink only), where it is on screen. */
function litCopy(rune: HTMLElement, colour: string) {
  const root = layer();
  if (!root) return null;
  const rect = rune.getBoundingClientRect();
  const copy = rune.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-layout");
  copy.querySelectorAll("[data-rune-backdrop]").forEach((node) => node.remove());
  Object.assign(copy.style, {
    position: "absolute",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zoom: "1",
    pointerEvents: "none",
    filter: `brightness(1.4) drop-shadow(0 0 12px ${colour}) drop-shadow(0 0 3px #FFFFFF)`,
  });
  root.appendChild(copy);
  rune.style.visibility = "hidden";
  return { copy, rect };
}

function sparkles(x: number, y: number, colour: string, radius: number) {
  const root = layer();
  if (!root) return;
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + 0.3;
    const el = document.createElement("div");
    Object.assign(el.style, { position: "absolute", left: `${x - 9}px`, top: `${y - 9}px`, width: "18px", height: "18px", color: colour, fontSize: "18px", lineHeight: "1", textAlign: "center", textShadow: `0 0 8px ${colour}`, opacity: "0" });
    el.textContent = "✦";
    root.appendChild(el);
    run(el, [
      { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
      { transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(angle) * radius * 1.25}px, ${Math.sin(angle) * radius * 1.25}px) scale(0.5)`, opacity: 0 },
    ], { duration: 420 });
  }
}

/** The rune lifts off and flies into `target` (the owl's wing, or the owl inside its shield). */
export function runeIntoOwl(rune: HTMLElement | null, target: DOMRect | null, colour: string) {
  if (!rune) return;
  const lit = litCopy(rune, colour);
  if (!lit) return;
  if (prefersReducedMotion() || !target) {
    run(lit.copy, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    return;
  }
  const from = { x: lit.rect.left + lit.rect.width / 2, y: lit.rect.top + lit.rect.height / 2 };
  const to = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
  const end = Math.max(0.12, Math.min(0.6, target.width / Math.max(1, lit.rect.width)));
  run(lit.copy, [
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: "translate(0, -14px) scale(1.08)", opacity: 1, offset: 0.25, easing: "ease-in" },
    { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${end}) rotate(10deg)`, opacity: 0.2 },
  ], { duration: LEAD_MS + 60 });
  sparkles(from.x, from.y, colour, Math.min(80, lit.rect.width * 0.35));
}
