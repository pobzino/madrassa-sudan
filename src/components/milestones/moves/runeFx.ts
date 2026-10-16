"use client";

import { prefersReducedMotion } from "../motion";

/**
 * The Rune Spell's effects (trace_letter): the traced rune lights up, lifts
 * off and flies at the boss, or turns into a glowing rune shield in front of
 * the owl. Same fixed layer as fx.ts (so clearFx removes these too), transform
 * and opacity only, under a second; reduced motion gets a quick fade.
 */

const LAYER_ID = "battle-fx-layer";

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

/** A lit copy of the traced rune, at its place on screen, in the effects layer. */
function litCopy(rune: HTMLElement, colour: string) {
  const root = layer();
  if (!root) return null;
  const rect = rune.getBoundingClientRect();
  const copy = rune.cloneNode(true) as HTMLElement;
  copy.removeAttribute("data-layout");
  Object.assign(copy.style, {
    position: "absolute",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zoom: "1",
    pointerEvents: "none",
    filter: `brightness(1.35) drop-shadow(0 0 14px ${colour}) drop-shadow(0 0 4px #FFFFFF)`,
  });
  // Only the letter flies: the tablet behind it stays (and fades) with the move.
  copy.querySelectorAll("[data-rune-backdrop]").forEach((node) => node.remove());
  root.appendChild(copy);
  return { copy, rect };
}

function sparkles(x: number, y: number, colour: string, count = 8, radius = 60, delay = 0) {
  const root = layer();
  if (!root) return;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.3;
    const el = document.createElement("div");
    Object.assign(el.style, { position: "absolute", left: `${x - 9}px`, top: `${y - 9}px`, width: "18px", height: "18px", color: colour, fontSize: "18px", lineHeight: "1", textAlign: "center", textShadow: `0 0 8px ${colour}`, opacity: "0" });
    el.textContent = "✦";
    root.appendChild(el);
    run(el, [
      { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
      { transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(angle) * radius * 1.3}px, ${Math.sin(angle) * radius * 1.3}px) scale(0.5)`, opacity: 0 },
    ], { duration: 520, delay });
  }
}

/** Attack: the rune glows, lifts off and flies at the boss as a spell. */
export function castRune(rune: HTMLElement | null, target: DOMRect | null, colour = "#FDE68A") {
  if (!rune) return;
  const lit = litCopy(rune, colour);
  if (!lit) return;
  rune.style.visibility = "hidden";
  if (prefersReducedMotion() || !target) {
    run(lit.copy, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 });
    return;
  }
  const from = { x: lit.rect.left + lit.rect.width / 2, y: lit.rect.top + lit.rect.height / 2 };
  const to = { x: target.left + target.width * 0.45, y: target.top + target.height * 0.45 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  run(lit.copy, [
    { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
    { transform: "translate(0, -22px) scale(1.12) rotate(-4deg)", opacity: 1, offset: 0.3, easing: "ease-in" },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(0.7) rotate(8deg)`, opacity: 1, offset: 0.68 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.32) rotate(16deg)`, opacity: 0.15 },
  ], { duration: 880, easing: "ease-in-out" });
  sparkles(from.x, from.y, colour, 7, 70);
  sparkles(to.x, to.y, colour, 9, 64, 760);
}

/** Block: the rune becomes a glowing rune shield in front of the owl. */
export function shieldRune(rune: HTMLElement | null, owl: DOMRect | null, colour = "#A7F3D0") {
  if (!rune) return;
  const lit = litCopy(rune, colour);
  if (!lit) return;
  rune.style.visibility = "hidden";
  if (prefersReducedMotion() || !owl) {
    run(lit.copy, [{ opacity: 1 }, { opacity: 0.9, offset: 0.4 }, { opacity: 0 }], { duration: 480 });
    return;
  }
  const size = owl.width * 0.95;
  const at = { x: owl.left + owl.width * 0.92, y: owl.top + owl.height * 0.45 };
  const from = { x: lit.rect.left + lit.rect.width / 2, y: lit.rect.top + lit.rect.height / 2 };
  const scale = size / Math.max(1, lit.rect.width);
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  // A ring of light around it, as the rune locks into place.
  const root = layer();
  if (root) {
    const ring = document.createElement("div");
    Object.assign(ring.style, {
      position: "absolute",
      left: `${at.x - size / 2}px`,
      top: `${at.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      border: `5px solid ${colour}`,
      background: `radial-gradient(circle, rgba(255,255,255,0) 50%, ${colour}55 72%, ${colour}88)`,
      boxShadow: `0 0 26px ${colour}`,
      opacity: "0",
    });
    root.appendChild(ring);
    run(ring, [
      { transform: "scale(0.3)", opacity: 0 },
      { transform: "scale(1.1)", opacity: 1, offset: 0.4 },
      { transform: "scale(1)", opacity: 1, offset: 0.55 },
      { transform: "scale(1)", opacity: 1, offset: 0.85 },
      { transform: "scale(1.15)", opacity: 0 },
    ], { duration: 1000, delay: 180 });
  }
  run(lit.copy, [
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale * 0.8})`, opacity: 1, offset: 0.45, easing: "ease-out" },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale * 0.8})`, opacity: 1, offset: 0.85 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale * 0.9})`, opacity: 0 },
  ], { duration: 1150, easing: "ease-in-out" });
  sparkles(at.x, at.y, colour, 8, size * 0.6, 420);
}
