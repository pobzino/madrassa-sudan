"use client";

import { prefersReducedMotion } from "../motion";

/**
 * Signature move effects: short (under 1s), transform and opacity only, drawn
 * in a fixed layer above the battle so they keep flying after the move itself
 * is gone (the server can answer before they land). Under reduced motion they
 * become a quick fade, with no particles.
 */

export type ShieldMotif = "orb" | "lanes" | "catch" | "runes" | "pairs" | "baskets" | "scroll" | "stamp";

interface Point {
  x: number;
  y: number;
}

const LAYER_ID = "battle-fx-layer";
const AMBER = "#F59E0B";

export const centerOf = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const reduced = () => prefersReducedMotion();

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

/** Remove every effect still in flight (the battle screen is closing). */
export function clearFx() {
  document.getElementById(LAYER_ID)?.remove();
}

/** Run keyframes on an effect element and remove it when done. */
function run(el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (typeof el.animate !== "function") {
    el.remove();
    return null;
  }
  const animation = el.animate(keyframes, { fill: "both", easing: "ease-out", ...options });
  const done = () => el.remove();
  animation.onfinish = done;
  animation.oncancel = done;
  return animation;
}

/** An absolutely placed effect element in the layer, centred on a point. */
function spawn(at: Point, size: number, style: Partial<CSSStyleDeclaration> = {}, text = ""): HTMLElement | null {
  const root = layer();
  if (!root) return null;
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute",
    left: `${at.x - size / 2}px`,
    top: `${at.y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    display: "grid",
    placeItems: "center",
    opacity: "0",
    ...style,
  });
  if (text) el.textContent = text;
  root.appendChild(el);
  return el;
}

/**
 * A copy of an on-screen element, at the same place and size, in the effects
 * layer (so it can fly off even if the move unmounts). Returns the copy and
 * the zoom it is drawn at (the desktop move is zoomed), for translate maths.
 */
function ghost(el: HTMLElement | null, hideOriginal: boolean): { el: HTMLElement; z: number; rect: DOMRect } | null {
  const root = layer();
  if (!root || !el) return null;
  const rect = el.getBoundingClientRect();
  const width = el.offsetWidth || rect.width;
  const z = width ? Math.round((rect.width / width) * 20) / 20 || 1 : 1;
  const computed = getComputedStyle(el);
  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  Object.assign(copy.style, {
    position: "absolute",
    insetInlineStart: "",
    right: "auto",
    bottom: "auto",
    left: `${rect.left / z}px`,
    top: `${rect.top / z}px`,
    width: `${width}px`,
    height: `${el.offsetHeight || rect.height / z}px`,
    margin: "0",
    translate: "none",
    zoom: String(z),
    fontFamily: computed.fontFamily,
    color: computed.color,
    pointerEvents: "none",
  });
  // Rotated pieces (rune stones) keep their tilt; the box above is the unrotated size.
  if (computed.rotate && computed.rotate !== "none") {
    copy.style.left = `${(rect.left + rect.width / 2) / z - width / 2}px`;
    copy.style.top = `${(rect.top + rect.height / 2) / z - (el.offsetHeight || rect.height) / 2}px`;
  }
  copy.dir = el.closest("[dir]")?.getAttribute("dir") ?? "ltr";
  root.appendChild(copy);
  if (hideOriginal) el.style.visibility = "hidden";
  return { el: copy, z, rect };
}

/** Flies a copy of an element from where it is to a point, then removes it. */
function flyGhost(el: HTMLElement | null, to: Point, options: { duration?: number; delay?: number; spin?: number; endScale?: number; hide?: boolean; charge?: boolean; arc?: number } = {}) {
  const g = ghost(el, options.hide ?? true);
  if (!g) return;
  if (reduced()) {
    run(g.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: options.delay });
    return;
  }
  const from = centerOf(g.rect);
  const dx = (to.x - from.x) / g.z;
  const dy = (to.y - from.y) / g.z;
  const spin = options.spin ?? 0;
  const end = options.endScale ?? 0.4;
  const arc = (options.arc ?? 0) / g.z;
  const frames: Keyframe[] = options.charge
    ? [
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        { transform: "translate(0, 0) scale(1.28) rotate(200deg)", opacity: 1, offset: 0.32, easing: "ease-in" },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(0.8) rotate(${200 + spin / 2}deg)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(${200 + spin}deg)`, opacity: 0 },
      ]
    : [
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(${(1 + end) / 2}) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(${spin}deg)`, opacity: 0.1 },
      ];
  run(g.el, frames, { duration: options.duration ?? 600, delay: options.delay, easing: "ease-in-out" });
}

/** Little dots (or stars) bursting out of a point. */
function burst(at: Point, options: { count?: number; radius?: number; color?: string; star?: boolean; delay?: number; size?: number } = {}) {
  if (reduced()) return;
  const count = options.count ?? 7;
  const radius = options.radius ?? 46;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.4;
    const size = options.size ?? (options.star ? 22 : 10);
    const el = spawn(at, size, options.star ? { color: options.color ?? "#FDE68A", fontSize: `${size}px`, lineHeight: "1", textShadow: "0 0 8px rgba(245,158,11,0.95)" } : { borderRadius: "50%", background: options.color ?? "#FDE68A", boxShadow: "0 0 8px rgba(253,230,138,0.9)" }, options.star ? "★" : "");
    if (!el) continue;
    run(el, [
      { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
      { transform: `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(angle) * radius * 1.3}px, ${Math.sin(angle) * radius * 1.3}px) scale(0.6)`, opacity: 0 },
    ], { duration: 520, delay: options.delay ?? 0 });
  }
}

/** A small squash-and-settle on a real element (a basket gulping, a label stamping, a counter bumping). */
export function squash(el: Element | null, strength: "bump" | "gulp" | "stamp" | "pulse" = "bump", delay = 0) {
  if (!el || typeof (el as HTMLElement).animate !== "function") return;
  if (reduced()) {
    (el as HTMLElement).animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 200, delay });
    return;
  }
  const frames: Record<typeof strength, Keyframe[]> = {
    bump: [{ transform: "scale(1)" }, { transform: "scale(1.3)", offset: 0.4 }, { transform: "scale(1)" }],
    gulp: [{ transform: "scale(1)" }, { transform: "scale(1.12, 0.82)", offset: 0.35 }, { transform: "scale(0.94, 1.1)", offset: 0.7 }, { transform: "scale(1)" }],
    stamp: [{ transform: "scale(1.6)", opacity: 0.3 }, { transform: "scale(0.82, 1.2)", opacity: 1, offset: 0.45 }, { transform: "scale(1.12, 0.9)", offset: 0.72 }, { transform: "scale(1)", opacity: 1 }],
    pulse: [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.45 }, { transform: "scale(1)" }],
  };
  (el as HTMLElement).animate(frames[strength], { duration: strength === "stamp" ? 380 : 320, delay, easing: "ease-out" });
}

/* ------------------------------------------------------------ per type */

/** choose_correct: the chosen orb charges (pulse + spin) and launches with a comet trail; the others pop like bubbles. */
export function orbLaunch(chosen: HTMLElement | null, others: Array<HTMLElement | null>, target: DOMRect | null) {
  others.forEach((el, i) => {
    if (!el || el.getAttribute("aria-hidden") === "true") return;
    const at = centerOf(el.getBoundingClientRect());
    if (reduced()) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
      return;
    }
    el.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.35)", opacity: 0.8, offset: 0.6 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 240, delay: i * 40, fill: "forwards", easing: "ease-out" });
    burst(at, { count: 6, radius: 34, color: "rgba(255,255,255,0.85)", delay: 120 + i * 40, size: 8 });
  });
  if (!chosen || !target) return;
  const from = centerOf(chosen.getBoundingClientRect());
  const to = centerOf(target);
  const size = chosen.getBoundingClientRect().width;
  flyGhost(chosen, to, { duration: 820, charge: true, spin: 360, endScale: 0.35, arc: 40 });
  if (reduced()) return;
  // The comet trail: fading copies of the orb's glow following the same path.
  for (let i = 1; i <= 4; i++) {
    const dot = spawn(from, size * (0.7 - i * 0.1), {
      borderRadius: "50%",
      background: "radial-gradient(circle, rgba(255,251,234,0.95), rgba(245,158,11,0.6) 55%, rgba(245,158,11,0) 75%)",
    });
    if (!dot) continue;
    run(dot, [
      { transform: "translate(0, 0)", opacity: 0 },
      { transform: "translate(0, 0)", opacity: 0, offset: 0.3 },
      { transform: `translate(${(to.x - from.x) * 0.5}px, ${(to.y - from.y) * 0.5 - 40}px)`, opacity: 0.75 - i * 0.12, offset: 0.62 },
      { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(0.4)`, opacity: 0 },
    ], { duration: 820, delay: i * 45, easing: "ease-in-out" });
  }
}

/** true_false: the attack streaks in from one side through the lane you left; the owl dodge-rolls to the side you chose. */
export function dodgeRoll(owl: HTMLElement | null, chosen: DOMRect | null, other: DOMRect | null) {
  if (!chosen || !other) return;
  const side = centerOf(chosen).x < centerOf(other).x ? -1 : 1;
  if (owl && typeof owl.animate === "function") {
    if (reduced()) owl.animate([{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }], { duration: 250 });
    else {
      // Roll toward that side, but never off the screen's edge.
      const box = owl.getBoundingClientRect();
      const room = side < 0 ? box.left + box.width * 0.2 : window.innerWidth - box.right + box.width * 0.2;
      const reach = Math.max(14, Math.min(64, room));
      owl.animate([
        { transform: "translateX(0) rotate(0deg)" },
        { transform: `translateX(${side * reach}px) translateY(-14px) rotate(${side * 360}deg)`, offset: 0.55, easing: "ease-in-out" },
        { transform: `translateX(${side * reach * 0.8}px) rotate(${side * 360}deg)`, offset: 0.75 },
        { transform: `translateX(0) rotate(${side * 360}deg)` },
      ], { duration: 760, easing: "ease-out" });
    }
  }
  if (reduced()) return;
  // The whoosh: streaks racing through the lane the owl just left, from the far side.
  const c = centerOf(other);
  for (let i = 0; i < 4; i++) {
    const y = other.top + other.height * (0.22 + i * 0.18);
    const width = other.width * 0.9;
    const streak = spawn({ x: c.x, y }, 1, {
      width: `${width}px`,
      height: `${i % 2 ? 4 : 6}px`,
      left: `${c.x - width / 2}px`,
      borderRadius: "999px",
      background: `linear-gradient(${side < 0 ? 90 : 270}deg, rgba(255,255,255,0), rgba(255,255,255,0.95))`,
    });
    if (!streak) continue;
    run(streak, [
      { transform: `translateX(${-side * width}px) scaleX(0.3)`, opacity: 0 },
      { transform: "translateX(0) scaleX(1)", opacity: 1, offset: 0.5 },
      { transform: `translateX(${side * width}px) scaleX(0.4)`, opacity: 0 },
    ], { duration: 420, delay: i * 50, easing: "ease-in" });
  }
}

/** tap_to_count: a "+1" pops over the owl's shield as each one zips in. */
export function plusOne(owl: DOMRect | null, text = "+1") {
  if (!owl || reduced()) return;
  const el = spawn({ x: owl.left + owl.width * 0.72, y: owl.top + owl.height * 0.3 }, 60, {
    color: "#FDE68A",
    fontWeight: "700",
    fontSize: "30px",
    fontFamily: "var(--font-fredoka), system-ui, sans-serif",
    textShadow: "0 2px 0 rgba(0,0,0,0.45)",
  }, text);
  if (el) run(el, [
    { transform: "translateY(0) scale(0.5)", opacity: 0 },
    { transform: "translateY(-18px) scale(1.25)", opacity: 1, offset: 0.35 },
    { transform: "translateY(-44px) scale(1)", opacity: 0 },
  ], { duration: 640 });
}

/** tap_to_count confirm: the caught things fire as a volley (attack) from the owl at the boss. */
export function volley(glyph: string, count: number, from: DOMRect | null, to: DOMRect | null) {
  if (!from || !to || count <= 0 || reduced()) return;
  const a = { x: from.left + from.width * 0.7, y: from.top + from.height * 0.45 };
  const b = centerOf(to);
  const stagger = Math.min(60, 480 / count);
  for (let i = 0; i < count; i++) {
    const el = spawn(a, 40, { fontSize: "30px", lineHeight: "1", filter: "drop-shadow(0 0 8px rgba(253,230,138,0.9))" }, glyph);
    if (!el) continue;
    const wobble = ((i % 3) - 1) * 24;
    run(el, [
      { transform: "translate(0, 0) scale(0.5)", opacity: 0 },
      { transform: `translate(${(b.x - a.x) * 0.5}px, ${(b.y - a.y) * 0.5 - 60 + wobble}px) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${b.x - a.x + wobble}px, ${b.y - a.y}px) scale(0.6)`, opacity: 0.2 },
    ], { duration: 460, delay: i * stagger, easing: "ease-in-out" });
  }
}

/** sequence_order: a glowing link from one stone to the next (drawn in the move's own overlay). */
export function linkStones(overlay: HTMLElement | null, stones: Array<HTMLElement | null>, order: number[], animateLast: boolean) {
  if (!overlay) return;
  overlay.replaceChildren();
  const pos = (el: HTMLElement) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
  for (let i = 1; i < order.length; i++) {
    const a = stones[order[i - 1]];
    const b = stones[order[i]];
    if (!a || !b) continue;
    const p = pos(a);
    const q = pos(b);
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "absolute",
      left: `${p.x}px`,
      top: `${p.y - 4}px`,
      width: `${length}px`,
      height: "8px",
      borderRadius: "999px",
      transformOrigin: "0 50%",
      transform: `rotate(${Math.atan2(q.y - p.y, q.x - p.x)}rad)`,
      background: "linear-gradient(90deg, rgba(253,230,138,0.95), rgba(245,158,11,0.95))",
      boxShadow: "0 0 12px rgba(245,158,11,0.9)",
    });
    overlay.appendChild(line);
    if (animateLast && i === order.length - 1 && !reduced()) {
      line.animate([{ transform: `rotate(${Math.atan2(q.y - p.y, q.x - p.x)}rad) scaleX(0)` }, { transform: `rotate(${Math.atan2(q.y - p.y, q.x - p.x)}rad) scaleX(1)` }], { duration: 260, easing: "ease-out" });
    }
  }
}

/** sequence_order confirm: the chain flashes in order, then a beam fires from the last stone. */
export function chainBeam(stones: Array<HTMLElement | null>, order: number[], target: DOMRect | null) {
  const stagger = Math.min(90, 420 / Math.max(1, order.length));
  order.forEach((index, i) => squash(stones[index], "pulse", i * stagger));
  const last = stones[order[order.length - 1]];
  if (!last || !target || reduced()) return;
  const a = centerOf(last.getBoundingClientRect());
  const b = centerOf(target);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const beam = spawn(a, 1, {
    left: `${a.x}px`,
    top: `${a.y - 7}px`,
    width: `${length}px`,
    height: "14px",
    borderRadius: "999px",
    transformOrigin: "0 50%",
    background: "linear-gradient(90deg, rgba(255,251,234,1), rgba(253,230,138,0.95) 40%, rgba(245,158,11,0.9))",
    boxShadow: "0 0 18px rgba(245,158,11,0.95)",
  });
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (beam) run(beam, [
    { transform: `rotate(${angle}rad) scaleX(0)`, opacity: 1 },
    { transform: `rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: 0.4 },
    { transform: `rotate(${angle}rad) scaleX(1) scaleY(0.2)`, opacity: 0 },
  ], { duration: 520, delay: order.length * stagger, easing: "ease-out" });
}

/** match_pairs: a matched piece snaps into its slot with a spark. */
export function snapSpark(slot: HTMLElement | null) {
  if (!slot) return;
  squash(slot, "pulse");
  burst(centerOf(slot.getBoundingClientRect()), { count: 8, radius: 40 });
}

/** match_pairs confirm: each matched pair flies off together. */
export function pairsFly(slots: Array<HTMLElement | null>, target: DOMRect | null) {
  if (!target) return;
  const to = centerOf(target);
  slots.forEach((slot, i) => flyGhost(slot, to, { duration: 600, delay: i * 80, endScale: 0.35, arc: 50, hide: false, spin: i % 2 ? 20 : -20 }));
}

/** sort_groups: the piece flies into its basket, which gulps it. */
export function intoBasket(piece: HTMLElement | null, basket: HTMLElement | null) {
  if (!basket) return;
  if (piece) flyGhost(piece, centerOf(basket.getBoundingClientRect()), { duration: 300, endScale: 0.4, hide: false });
  squash(basket, "gulp", reduced() ? 0 : 230);
}

/** sort_groups confirm: full baskets burst into stars. */
export function basketsBurst(baskets: Array<HTMLElement | null>) {
  baskets.forEach((basket, i) => {
    if (!basket) return;
    squash(basket, "bump", i * 70);
    burst(centerOf(basket.getBoundingClientRect()), { count: 7, radius: 60, star: true, delay: 120 + i * 70 });
  });
}

/** A piece flies into its place (a word into the gap, a match into its slot, a label onto the picture). */
export function flyInto(piece: HTMLElement | null, place: HTMLElement | null, endScale = 0.7) {
  if (!piece || !place) return;
  flyGhost(piece, centerOf(place.getBoundingClientRect()), { duration: 320, endScale, hide: false });
}

/** fill_missing_word confirm: the scroll glows, rolls up into a spell and flies. */
export function scrollSpell(scroll: HTMLElement | null, target: DOMRect | null) {
  const g = ghost(scroll, true);
  if (!g) return;
  if (reduced() || !target) {
    run(g.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    return;
  }
  g.el.style.boxShadow = "0 0 36px 10px rgba(253,230,138,0.85), 0 6px 0 #D6B77A";
  const from = centerOf(g.rect);
  const to = centerOf(target);
  const dx = (to.x - from.x) / g.z;
  const dy = (to.y - from.y) / g.z;
  run(g.el, [
    { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
    { transform: "translate(0, 0) scale(1.05, 1.05)", opacity: 1, offset: 0.18 },
    { transform: "translate(0, 0) scale(0.5, 0.12)", opacity: 1, offset: 0.45, easing: "ease-in" },
    { transform: `translate(${dx}px, ${dy}px) scale(0.12, 0.1) rotate(540deg)`, opacity: 0.1 },
  ], { duration: 900, easing: "ease-out" });
  // a glowing spell ball where the scroll rolled up, flying along with it
  const ball = spawn(from, 46, { borderRadius: "50%", background: "radial-gradient(circle, #FFFBEA, #FDE68A 45%, rgba(245,158,11,0) 72%)" });
  if (ball) run(ball, [
    { transform: "translate(0, 0) scale(0.2)", opacity: 0 },
    { transform: "translate(0, 0) scale(1.2)", opacity: 1, offset: 0.45 },
    { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(0.6)`, opacity: 0.2 },
  ], { duration: 900, easing: "ease-in-out" });
}

/** drag_drop_label: the label stamps onto the picture. */
export function stampLabel(spot: HTMLElement | null) {
  if (!spot) return;
  squash(spot, "stamp");
  burst(centerOf(spot.getBoundingClientRect()), { count: 6, radius: 30, color: "rgba(255,255,255,0.9)", delay: 160, size: 8 });
}

/** drag_drop_label confirm: every stamped label flashes, then fires a star. */
export function labelsFire(spots: Array<HTMLElement | null>, target: DOMRect | null) {
  spots.forEach((spot, i) => {
    if (!spot) return;
    squash(spot, "pulse", i * 70);
    burst(centerOf(spot.getBoundingClientRect()), { count: 5, radius: 28, star: true, delay: i * 70, size: 18 });
  });
  if (target) pairsFly(spots, target);
}

/* --------------------------------------------------------- block shields */

/** Block turns: the shield forms in front of the owl in the move's own motif. */
export function formShield(motif: ShieldMotif, owl: DOMRect | null, glyph = "⭐") {
  if (!owl) return;
  const size = Math.round(owl.width * 0.95);
  const at = { x: owl.left + owl.width * 0.92, y: owl.top + owl.height * 0.45 };
  const root = spawn(at, size, { zIndex: "1" });
  if (!root) return;
  const part = (style: Partial<CSSStyleDeclaration>, text = "") => {
    const el = document.createElement("div");
    Object.assign(el.style, { position: "absolute", display: "grid", placeItems: "center", ...style });
    if (text) el.textContent = text;
    root.appendChild(el);
    return el;
  };
  const ring = (style: Partial<CSSStyleDeclaration>) => part({ inset: "0", borderRadius: "50%", ...style });
  switch (motif) {
    case "orb":
      ring({ border: `6px solid ${AMBER}`, background: "radial-gradient(circle, rgba(255,251,234,0) 45%, rgba(253,230,138,0.45) 70%, rgba(245,158,11,0.55))", boxShadow: "0 0 24px rgba(245,158,11,0.9)" });
      break;
    case "lanes":
      ring({ borderTop: "8px solid #4ADE80", borderLeft: "8px solid #4ADE80", borderBottom: "8px solid #F87171", borderRight: "8px solid #F87171", transform: "rotate(45deg)", boxShadow: "0 0 18px rgba(255,255,255,0.6)" });
      break;
    case "catch":
      ring({ border: "3px solid rgba(110,231,183,0.8)", boxShadow: "0 0 18px rgba(110,231,183,0.7)" });
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        part({ left: `${50 + Math.cos(angle) * 46}%`, top: `${50 + Math.sin(angle) * 46}%`, width: "28px", height: "28px", margin: "-14px", fontSize: "22px", lineHeight: "1" }, glyph);
      }
      break;
    case "runes":
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + ((i - 2) / 4) * Math.PI * 0.9;
        part({ left: `${50 + Math.cos(angle + Math.PI / 2) * 42}%`, top: `${50 + Math.sin(angle + Math.PI / 2) * 42}%`, width: "30px", height: "36px", margin: "-18px -15px", borderRadius: "40% 55% 45% 50%", background: "linear-gradient(160deg,#FAFAF9,#D6D3D1)", border: "3px solid #F59E0B", boxShadow: "0 0 12px rgba(245,158,11,0.9)" });
      }
      break;
    case "pairs": {
      const half = (left: boolean) => part({ top: "0", bottom: "0", [left ? "left" : "right"]: "0", width: "50%", borderRadius: left ? "999px 0 0 999px" : "0 999px 999px 0", background: left ? "rgba(0,114,41,0.55)" : "rgba(245,158,11,0.55)", border: `5px solid ${left ? "#4ADE80" : AMBER}` } as Partial<CSSStyleDeclaration>);
      const l = half(true);
      const r = half(false);
      if (!reduced()) {
        l.animate([{ transform: "translateX(-40%)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-in", fill: "both" });
        r.animate([{ transform: "translateX(40%)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-in", fill: "both" });
      }
      break;
    }
    case "baskets":
      ring({ border: "6px solid #A16207", background: "repeating-linear-gradient(45deg, rgba(202,138,4,0.55) 0 8px, rgba(161,98,7,0.55) 8px 16px)", boxShadow: "0 0 16px rgba(253,224,71,0.6)" });
      break;
    case "scroll":
      ring({ border: `5px dashed ${AMBER}`, background: "radial-gradient(circle, rgba(254,243,199,0.65), rgba(254,243,199,0.15) 70%)", boxShadow: "0 0 22px rgba(253,230,138,0.9)" });
      part({ inset: "0", color: "#B45309", fontSize: `${Math.round(size * 0.4)}px`, lineHeight: "1" }, "✦");
      break;
    case "stamp":
      part({ inset: "6%", background: AMBER, clipPath: "polygon(50% 0,61% 12%,77% 7%,79% 23%,95% 28%,88% 43%,100% 55%,86% 64%,90% 80%,73% 81%,65% 96%,50% 87%,35% 96%,27% 81%,10% 80%,14% 64%,0 55%,12% 43%,5% 28%,21% 23%,23% 7%,39% 12%)", boxShadow: "0 0 18px rgba(245,158,11,0.9)" });
      part({ inset: "0", color: "#3B1D00", fontSize: `${Math.round(size * 0.32)}px`, fontWeight: "700", lineHeight: "1" }, "✓");
      break;
  }
  if (reduced()) {
    run(root, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 450 });
    return;
  }
  run(root, [
    { transform: "scale(0.2) rotate(-30deg)", opacity: 0 },
    { transform: "scale(1.12) rotate(6deg)", opacity: 1, offset: 0.3 },
    { transform: "scale(1) rotate(0deg)", opacity: 1, offset: 0.45 },
    { transform: "scale(1)", opacity: 1, offset: 0.78 },
    { transform: "scale(1.15)", opacity: 0 },
  ], { duration: 950, easing: "ease-out" });
}
