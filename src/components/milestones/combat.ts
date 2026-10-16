"use client";

import { gsap } from "gsap";
import type { BossHandle, OwlHandle } from "@/components/characters";
import { prefersReducedMotion } from "./motion";

/**
 * The battle's game feel: one fixed, fast timeline per move that never waits
 * visibly on the network.
 *
 *   confirm ─ wind-up (~150ms) ─ flight (~350ms) ─ contact
 *
 * The answer request starts at confirm and normally lands during the flight.
 * If it hasn't when the projectile arrives, the projectile charges at the
 * target (orbiting, spinning, glowing, crackling) and resolves the moment the
 * answer lands. Outcomes take ~400ms:
 *  - attack hit: hit-stop, tint flash on the boss, sparks at the contact
 *    point, screen shake, the HP bar's chunk breaks off, a big "Pow!" there;
 *  - attack miss: the star whiffs past with a whoosh; "Nearly!" at the owl;
 *  - block right: it smashes into the owl's dome (crack ring, sparks,
 *    "Blocked!"), bounces back and hits the boss;
 *  - block wrong: it breaks the dome and bonks the owl.
 *
 * Imperative (Web Animations + a few DOM nodes in the arena's effects layer)
 * so React never re-renders mid-flight. Reduced motion: no shake, no
 * hit-stop, no particles; things simply fade in and out where they happen.
 */

export type Turn = "attack" | "block";

export interface CombatRefs {
  /** The positioned arena (effects are drawn in a layer inside it). */
  arena: () => HTMLElement | null;
  owlBox: () => HTMLElement | null;
  bossBox: () => HTMLElement | null;
  owl: () => OwlHandle | null;
  boss: () => BossHandle | null;
  /** The layer that shakes. */
  shell: () => HTMLElement | null;
  /** The boss's HP bar track (its chunk breaks off on a hit). */
  hpBar: () => HTMLElement | null;
  /** The boss's own projectile, drawn where it holds it (block turns): its art and place. */
  bossProjectile: () => HTMLElement | null;
}

export interface CombatSizes {
  owlSize: number;
  bossSize: number;
  desktop: boolean;
}

export interface Outcome {
  correct: boolean;
  /** A Super Star hit or the knockout: bigger everything. */
  big: boolean;
  knockout: boolean;
  /** HP before and after (percent), for the chunk that breaks off. */
  hpFrom: number;
  hpTo: number;
  /** "Pow!", "Super Pow!", "K.O.!", "Blocked!" … */
  text: string;
  /** "Nearly!" (attack miss) or "Bonk!" (block miss). */
  missText: string;
}

export interface StartOptions {
  /** How long the wind-up takes (a dodge roll is its own wind-up). */
  windupMs?: number;
  /** The owl's own wind-up is already playing (the dodge roll). */
  skipOwlWindup?: boolean;
  /** "Hngh!" for the boss's wind-up. */
  effort?: string;
  /** Called when the outcome has played (show "Nearly!"'s next step then, not before). */
  onSettled?: () => void;
  /** Called when the hit lands on the boss (update the HP bar then). */
  onImpact?: () => void;
}

interface Point {
  x: number;
  y: number;
}

const WINDUP_MS = 130;
const FLIGHT_MS = 330;
const HIT_STOP_MS = 80;
const STAR = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

type Phase = "windup" | "flight" | "waiting" | "resolving" | "done";

interface Run {
  turn: Turn;
  phase: Phase;
  options: StartOptions;
  projectile: HTMLElement | null;
  /** Where the projectile is drawn (its left/top): the contact point. */
  contact: Point;
  from: Point;
  dome: HTMLElement | null;
  outcome: Outcome | null;
  anims: Animation[];
  timers: number[];
  crackle: number | null;
  big: boolean;
}

export class Combat {
  private run: Run | null = null;
  private layerEl: HTMLElement | null = null;

  constructor(
    private refs: CombatRefs,
    private sizes: () => CombatSizes
  ) {}

  /* ---------------------------------------------------------------- public */

  /** The child confirmed: wind up and throw at once. */
  start(turn: Turn, options: StartOptions = {}) {
    this.finishRun();
    const layer = this.layer();
    if (!layer) return;
    const run: Run = {
      turn,
      phase: "windup",
      options,
      projectile: null,
      contact: { x: 0, y: 0 },
      from: { x: 0, y: 0 },
      dome: null,
      outcome: null,
      anims: [],
      timers: [],
      crackle: null,
      big: false,
    };
    this.run = run;
    const windup = options.windupMs ?? WINDUP_MS;
    if (turn === "attack") {
      run.from = this.owlWing();
      run.contact = this.bossContact();
      if (!options.skipOwlWindup) this.owlWindup(run, windup);
    } else {
      // The owl's dome goes up at once; the boss winds up and throws.
      run.dome = this.dome(run);
      void this.refs.owl()?.play("block");
      run.from = this.bossHands();
      run.contact = this.domeContact(run.from);
      this.bossWindup(run, windup, options.effort ?? "Hngh!");
    }
    // The throw is scheduled on the animation clock, not a timer, so a busy
    // main thread can't make it late.
    this.launch(run, windup);
  }

  /** The server answered. Resolves now if the projectile is waiting, else when it arrives. */
  resolve(turn: Turn, outcome: Outcome) {
    let run = this.run;
    if (!run || run.phase === "done" || run.phase === "resolving") {
      // A resync (no confirm on this screen): play the whole move.
      this.start(turn);
      run = this.run;
      if (!run) return;
    }
    run.outcome = outcome;
    run.big = outcome.big;
    if (run.phase === "waiting") this.land(run);
  }

  /** The answer never got through: let the throw fizzle out. */
  abort() {
    const run = this.run;
    if (!run || run.phase === "resolving" || run.phase === "done") return;
    this.stopCrackle(run);
    run.timers.forEach((id) => window.clearTimeout(id));
    run.anims.forEach((a) => a.cancel());
    for (const el of [run.projectile, run.dome]) if (el) this.fadeOut(el, 220);
    run.phase = "done";
    this.run = null;
  }

  dispose() {
    this.finishRun();
    this.layerEl?.remove();
    this.layerEl = null;
    gsap.globalTimeline.resume();
  }

  /* ------------------------------------------------------------- geometry */

  private layer(): HTMLElement | null {
    const arena = this.refs.arena();
    if (!arena) return null;
    if (this.layerEl && this.layerEl.parentElement === arena) return this.layerEl;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "absolute", inset: "0", zIndex: "8", pointerEvents: "none", overflow: "visible" });
    arena.appendChild(el);
    this.layerEl = el;
    return el;
  }

  /** A rect relative to the arena. */
  private local(el: HTMLElement | null) {
    const arena = this.refs.arena()?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (!arena || !r) return null;
    return { left: r.left - arena.left, top: r.top - arena.top, width: r.width, height: r.height };
  }

  private owlRect() {
    return this.local(this.refs.owlBox()) ?? { left: 0, top: 0, width: 100, height: 100 };
  }

  private bossRect() {
    return this.local(this.refs.bossBox()) ?? { left: 200, top: 0, width: 100, height: 100 };
  }

  /** The owl's wing tip, on the boss's side. */
  private owlWing(): Point {
    const r = this.owlRect();
    return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.5 };
  }

  private owlCenter(): Point {
    const r = this.owlRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.56 };
  }

  /** A character's page point (from the rig) in the arena's coordinates. */
  private fromPage(p: { x: number; y: number } | null | undefined): Point | null {
    const arena = this.refs.arena()?.getBoundingClientRect();
    if (!p || !arena) return null;
    return { x: p.x - window.scrollX - arena.left, y: p.y - window.scrollY - arena.top };
  }

  /** Where an attack hits: the rig's impact point (it follows the pose), else the boss's chest. */
  private bossContact(): Point {
    const rig = this.fromPage(this.refs.boss()?.impactPoint?.());
    if (rig) return rig;
    const r = this.bossRect();
    return { x: r.left + r.width * 0.46, y: r.top + r.height * 0.52 };
  }

  /** The boss's throwing hand (the rig's launch point), else where it holds its projectile. */
  private bossHands(): Point {
    const rig = this.fromPage(this.refs.boss()?.launchPoint?.());
    if (rig) return rig;
    const held = this.local(this.refs.bossProjectile());
    if (held) return { x: held.left + held.width / 2, y: held.top + held.height / 2 };
    const r = this.bossRect();
    return { x: r.left + r.width * 0.22, y: r.top + r.height * 0.5 };
  }

  private domeRadius() {
    return this.sizes().owlSize * 0.7;
  }

  /** The point on the dome facing the throw. */
  private domeContact(from: Point): Point {
    const c = this.owlCenter();
    const dx = from.x - c.x;
    const dy = from.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const r = this.domeRadius();
    return { x: c.x + (dx / len) * r, y: c.y + (dy / len) * r };
  }

  private projectileSize(big: boolean) {
    const { owlSize, desktop } = this.sizes();
    // About half the owl's height on a phone; about its head on a desktop.
    return Math.round(owlSize * (desktop ? 0.42 : 0.55) * (big ? 1.2 : 1));
  }

  private shakePx(big: boolean) {
    const w = this.refs.arena()?.clientWidth ?? 400;
    return Math.max(3, Math.min(12, w * 0.007)) * (big ? 1.6 : 1);
  }

  /* -------------------------------------------------------------- helpers */

  private el(at: Point, size: number, style: Partial<CSSStyleDeclaration> = {}, html = ""): HTMLElement | null {
    const layer = this.layer();
    if (!layer) return null;
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      left: `${at.x - size / 2}px`,
      top: `${at.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      display: "grid",
      placeItems: "center",
      ...style,
    });
    if (html) el.innerHTML = html;
    layer.appendChild(el);
    return el;
  }

  /** A one-shot effect that removes its element when done. */
  private once(el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    if (!el || typeof el.animate !== "function") {
      el?.remove();
      return null;
    }
    const a = el.animate(keyframes, { fill: "both", easing: "ease-out", ...options });
    a.onfinish = () => el.remove();
    a.oncancel = () => el.remove();
    return a;
  }

  private fadeOut(el: HTMLElement, ms: number) {
    this.once(el, [{ opacity: getComputedStyle(el).opacity || "1" }, { opacity: 0 }], { duration: ms });
  }

  private track(run: Run, a: Animation | null | undefined) {
    if (a) run.anims.push(a);
    return a ?? null;
  }

  private reduced() {
    return prefersReducedMotion();
  }

  /** Big, bouncy text at a point (the contact point, or over the owl). */
  private pop(at: Point, text: string, scale: "big" | "normal" | "small", color = "#FDE68A") {
    const { owlSize, desktop } = this.sizes();
    const base = desktop ? owlSize * 0.3 : Math.max(40, owlSize * 0.3);
    const size = Math.round(base * (scale === "big" ? 1.3 : scale === "small" ? 0.55 : 1));
    const el = this.el({ x: at.x, y: at.y - size * 0.6 }, 10, {
      width: "auto",
      height: "auto",
      left: `${at.x}px`,
      top: `${at.y - size * 0.6}px`,
      whiteSpace: "nowrap",
      color,
      fontSize: `${size}px`,
      fontWeight: "700",
      lineHeight: "1",
      fontFamily: "var(--font-fredoka), var(--font-cairo), system-ui, sans-serif",
      textShadow: `0 ${Math.max(3, size * 0.07)}px 0 rgba(0,0,0,0.45), 0 0 ${size * 0.3}px rgba(245,158,11,0.6)`,
      zIndex: "3",
    });
    if (!el) return;
    el.textContent = text;
    if (this.reduced()) {
      this.once(el, [{ transform: "translate(-50%, -50%)", opacity: 0 }, { transform: "translate(-50%, -50%)", opacity: 1, offset: 0.2 }, { transform: "translate(-50%, -50%)", opacity: 1, offset: 0.75 }, { transform: "translate(-50%, -50%)", opacity: 0 }], { duration: 600 });
      return;
    }
    this.once(el, [
      { transform: "translate(-50%, -50%) scale(0.3) rotate(-10deg)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(1.35) rotate(-6deg)", opacity: 1, offset: 0.16 },
      { transform: "translate(-50%, -50%) scale(0.95) rotate(-6deg)", opacity: 1, offset: 0.3 },
      { transform: "translate(-50%, -60%) scale(1) rotate(-6deg)", opacity: 1, offset: 0.72 },
      { transform: "translate(-50%, -85%) scale(1) rotate(-6deg)", opacity: 0 },
    ], { duration: 600 });
  }

  /** Sparks (and stars, for big hits) bursting from a point. */
  private sparks(at: Point, count: number, radius: number, colors = ["#FDE68A", "#FFFFFF", "#F59E0B"]) {
    if (this.reduced()) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = radius * (0.6 + Math.random() * 0.6);
      const star = i % 3 === 0;
      const size = star ? radius * 0.32 : radius * (0.1 + Math.random() * 0.08);
      const el = this.el(at, size, star
        ? { color: colors[0], fontSize: `${size}px`, lineHeight: "1", textShadow: "0 0 8px rgba(245,158,11,0.95)" }
        : { borderRadius: "50%", background: colors[i % colors.length], boxShadow: `0 0 ${size}px ${colors[0]}` }, star ? "★" : "");
      this.once(el, [
        { transform: "translate(0, 0) scale(1.2)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.9)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(angle) * dist * 1.25}px, ${Math.sin(angle) * dist * 1.25 + radius * 0.3}px) scale(0.3)`, opacity: 0 },
      ], { duration: 460, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" });
    }
  }

  private shake(big: boolean) {
    if (this.reduced()) return;
    const s = this.shakePx(big);
    this.refs.shell()?.animate([
      { transform: "translate(0, 0)" },
      { transform: `translate(${-s}px, ${s * 0.6}px)` },
      { transform: `translate(${s * 0.9}px, ${-s * 0.5}px)` },
      { transform: `translate(${-s * 0.6}px, ${-s * 0.3}px)` },
      { transform: `translate(${s * 0.4}px, ${s * 0.3}px)` },
      { transform: "translate(0, 0)" },
    ], { duration: big ? 200 : 140, easing: "linear" });
  }

  /** Freeze both characters (and our effects) for a beat at the moment of contact. */
  private hitStop(run: Run, then: () => void) {
    if (this.reduced()) {
      then();
      return;
    }
    gsap.globalTimeline.pause();
    run.anims.forEach((a) => a.playState === "running" && a.pause());
    run.timers.push(
      window.setTimeout(() => {
        gsap.globalTimeline.resume();
        run.anims.forEach((a) => a.playState === "paused" && a.play());
        then();
      }, HIT_STOP_MS)
    );
  }

  /** An additive glow over a character (a tint, not a white box). */
  private flash(box: HTMLElement | null, color: string, strength = 1) {
    if (!box) return;
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      inset: "12% 10% 6%",
      borderRadius: "50%",
      pointerEvents: "none",
      background: `radial-gradient(ellipse at 50% 55%, ${color} 0%, ${color.replace(/[\d.]+\)$/, "0.35)")} 45%, rgba(0,0,0,0) 70%)`,
      mixBlendMode: "screen",
      zIndex: "2",
    });
    box.appendChild(el);
    this.once(el, [{ opacity: 0 }, { opacity: Math.min(0.75, 0.55 * strength), offset: 0.18 }, { opacity: 0 }], { duration: 200 });
  }

  /** The lost part of the boss's HP bar breaks off and falls. */
  private chunk(hpFrom: number, hpTo: number) {
    const bar = this.refs.hpBar();
    const arena = this.refs.arena();
    const layer = this.layer();
    if (!bar || !arena || !layer || hpFrom <= hpTo) return;
    const a = arena.getBoundingClientRect();
    const r = bar.getBoundingClientRect();
    const left = r.left - a.left + (r.width * hpTo) / 100;
    const width = Math.max(4, (r.width * (hpFrom - hpTo)) / 100);
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute",
      left: `${left}px`,
      top: `${r.top - a.top}px`,
      width: `${width}px`,
      height: `${r.height}px`,
      borderRadius: "4px",
      background: "linear-gradient(180deg,#F05A73,#D21034 60%,#A01028)",
      boxShadow: "0 0 10px rgba(255,255,255,0.7)",
      zIndex: "4",
    });
    layer.appendChild(el);
    if (this.reduced()) {
      this.once(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      return;
    }
    this.once(el, [
      { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${width * 0.2}px, -6px) rotate(-8deg)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${width * 0.5 + 10}px, 70px) rotate(28deg)`, opacity: 0 },
    ], { duration: 650, easing: "cubic-bezier(0.5, 0, 0.8, 0.6)" });
  }

  /* ------------------------------------------------------------- the beats */

  private owlWindup(run: Run, ms: number) {
    const owl = this.refs.owlBox();
    if (!owl || this.reduced()) return;
    owl.style.transformOrigin = "50% 90%";
    // Pull back, then throw: lean away, then lunge at the boss.
    this.track(run, owl.animate([
      { transform: "translate(0, 0) rotate(0deg) scale(1, 1)" },
      { transform: "translate(-13%, 3%) rotate(-18deg) scale(0.9, 1.1)", offset: ms / (ms + 260), easing: "cubic-bezier(0.2, 0, 0.2, 1)" },
      { transform: "translate(14%, -4%) rotate(14deg) scale(1.1, 0.92)", offset: (ms + 70) / (ms + 260), easing: "ease-out" },
      { transform: "translate(0, 0) rotate(0deg) scale(1, 1)" },
    ], { duration: ms + 260 }));
  }

  private bossWindup(run: Run, ms: number, effort: string) {
    const boss = this.refs.bossBox();
    void this.refs.boss()?.play("throw");
    if (!boss) return;
    // A warm glow behind the boss as it charges.
    this.flash(boss, "rgba(255,170,80,0.85)", 0.6);
    const hands = this.bossHands();
    // (the decorations wait a frame, so the first frame of the move is never late)
    requestAnimationFrame(() => this.pop({ x: hands.x, y: hands.y - this.sizes().bossSize * 0.25 }, effort, "small", "#FFFFFF"));
    if (this.reduced()) return;
    boss.style.transformOrigin = "50% 94%";
    this.track(run, boss.animate([
      { transform: "translate(0, 0) rotate(0deg)" },
      { transform: "translate(4%, 0) rotate(8deg) scale(1.02, 0.98)", offset: ms / (ms + 280), easing: "cubic-bezier(0.2, 0, 0.2, 1)" },
      { transform: "translate(-6%, 0) rotate(-7deg) scale(0.98, 1.03)", offset: (ms + 80) / (ms + 280), easing: "ease-out" },
      { transform: "translate(0, 0) rotate(0deg)" },
    ], { duration: ms + 280 }));
  }

  private dome(run: Run): HTMLElement | null {
    const c = this.owlCenter();
    const d = this.domeRadius() * 2;
    const el = this.el(c, d, {
      borderRadius: "50%",
      border: "4px solid rgba(167,243,208,0.9)",
      background: "radial-gradient(circle at 42% 34%, rgba(255,255,255,0.35) 0 8%, rgba(255,255,255,0) 22%), radial-gradient(circle, rgba(110,231,183,0.08) 0 55%, rgba(110,231,183,0.32) 72%, rgba(167,243,208,0.55) 100%)",
      boxShadow: "0 0 30px rgba(110,231,183,0.55), inset 0 0 24px rgba(167,243,208,0.45)",
      zIndex: "1",
    });
    if (!el) return null;
    this.track(run, el.animate(
      this.reduced()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: "scale(0.3)", opacity: 0 },
            { transform: "scale(1.07)", opacity: 1, offset: 0.65 },
            { transform: "scale(1)", opacity: 1 },
          ],
      { duration: 220, fill: "both", easing: "ease-out" }
    ));
    return el;
  }

  /** The projectile leaves the owl's wing (or the boss's hands) and flies. */
  private launch(run: Run, windup: number) {
    if (this.run !== run) return;
    const size = this.projectileSize(false);
    const isAttack = run.turn === "attack";
    const held = isAttack ? null : this.refs.bossProjectile();
    const art = isAttack
      ? `<div style="position:absolute;inset:-35%;border-radius:50%;background:radial-gradient(circle,rgba(255,251,234,0.95),rgba(253,230,138,0.55) 35%,rgba(245,158,11,0) 70%)"></div><svg viewBox="0 0 24 24" style="position:relative;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 0 ${Math.round(size * 0.12)}px rgba(245,158,11,0.95))"><path d="${STAR}" fill="#FDE68A" stroke="#F59E0B" stroke-width="1.4" stroke-linejoin="round"/></svg>`
      : `<div style="position:absolute;inset:-25%;border-radius:50%;background:radial-gradient(circle,rgba(255,200,120,0.6),rgba(255,140,60,0) 70%)"></div><div style="position:relative;width:100%;height:100%;display:grid;place-items:center">${held?.innerHTML ?? ""}</div>`;
    if (held) held.style.visibility = "hidden";
    const el = this.el(run.contact, size, { zIndex: "2" }, art);
    if (!el) return;
    // Scale the boss's art to the projectile's size.
    const inner = el.lastElementChild as HTMLElement | null;
    if (inner && !isAttack && held) {
      const s = size / Math.max(held.offsetWidth, held.offsetHeight, 1);
      inner.style.transform = `scale(${s})`;
    }
    run.projectile = el;
    const dx = run.from.x - run.contact.x;
    const dy = run.from.y - run.contact.y;
    const lift = Math.min(160, Math.hypot(dx, dy) * 0.22);
    // One animation from the confirm: in the hand (block) or popping out at
    // the wing (attack) during the wind-up, then the flight.
    const total = windup + FLIGHT_MS;
    const w = windup / total;
    const ease = "cubic-bezier(0.35, 0.1, 0.75, 1)";
    const flight = this.reduced()
      ? el.animate([{ opacity: 0 }, { opacity: 0, offset: w }, { opacity: 1 }], { duration: total, fill: "both" })
      : el.animate(
          isAttack
            ? [
                { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0)`, opacity: 0 },
                { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0)`, opacity: 0, offset: w * 0.45 },
                { transform: `translate(${dx}px, ${dy}px) rotate(-40deg) scale(0.9)`, opacity: 1, offset: w, easing: ease },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) rotate(300deg) scale(1)`, opacity: 1, offset: w + (1 - w) * 0.5, easing: ease },
                { transform: "translate(0px, 0px) rotate(620deg) scale(1.08)", opacity: 1 },
              ]
            : [
                { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0.85)`, opacity: 1 },
                { transform: `translate(${dx + size * 0.25}px, ${dy - size * 0.15}px) rotate(25deg) scale(0.95)`, opacity: 1, offset: w, easing: ease },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) rotate(-300deg) scale(1)`, opacity: 1, offset: w + (1 - w) * 0.5, easing: ease },
                { transform: "translate(0px, 0px) rotate(-620deg) scale(1.08)", opacity: 1 },
              ],
          { duration: total, fill: "both" }
        );
    this.track(run, flight);
    // A short trail of glow behind it (a frame later: the throw itself goes first).
    if (!this.reduced()) requestAnimationFrame(() => {
      for (let i = 1; i <= 4; i++) {
        const dot = this.el(run.contact, size * (0.7 - i * 0.1), {
          borderRadius: "50%",
          background: isAttack ? "radial-gradient(circle, rgba(255,251,234,0.9), rgba(245,158,11,0.5) 55%, rgba(245,158,11,0) 72%)" : "radial-gradient(circle, rgba(255,220,180,0.8), rgba(255,140,60,0.4) 55%, rgba(255,140,60,0) 72%)",
          zIndex: "1",
        });
        this.once(dot, [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px)`, opacity: 0.8 - i * 0.15, offset: 0.5 },
          { transform: "translate(0, 0) scale(0.6)", opacity: 0 },
        ], { duration: FLIGHT_MS, delay: windup + i * 28, easing: ease });
      }
    });
    run.timers.push(window.setTimeout(() => {
      if (run.phase === "windup") run.phase = "flight";
    }, windup));
    flight.onfinish = () => {
      if (this.run !== run) return;
      if (run.outcome) this.land(run);
      else this.wait(run);
    };
  }

  /** No answer yet: the projectile charges at the target (never freezes). */
  private wait(run: Run) {
    run.phase = "waiting";
    const el = run.projectile;
    if (!el) return;
    const r = this.projectileSize(false) * (run.turn === "attack" ? 0.22 : 0.14);
    if (!this.reduced()) {
      this.track(run, el.animate([
        { transform: `rotate(0deg) translateX(${r}px) rotate(0deg) scale(1.05)` },
        { transform: `rotate(180deg) translateX(${r}px) rotate(-180deg) scale(1.18)` },
        { transform: `rotate(360deg) translateX(${r}px) rotate(-360deg) scale(1.05)` },
      ], { duration: 420, iterations: Infinity, easing: "linear" }));
      const glow = el.firstElementChild as HTMLElement | null;
      if (glow) this.track(run, glow.animate([{ opacity: 0.6, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1.25)" }, { opacity: 0.6, transform: "scale(0.9)" }], { duration: 300, iterations: Infinity }));
      run.crackle = window.setInterval(() => this.sparks(run.contact, 3, this.projectileSize(false) * 0.7, ["#FFFFFF", "#FDE68A"]), 150);
    }
    if (run.turn === "block" && run.dome && !this.reduced()) {
      this.track(run, run.dome.animate([{ transform: "scale(1)" }, { transform: "scale(0.97, 1.02)" }, { transform: "scale(1)" }], { duration: 200, iterations: Infinity }));
    }
  }

  private stopCrackle(run: Run) {
    if (run.crackle !== null) window.clearInterval(run.crackle);
    run.crackle = null;
  }

  /** Freeze the projectile where it is (from whatever animation it's in). */
  private settle(run: Run) {
    this.stopCrackle(run);
    run.anims.forEach((a) => {
      try {
        a.commitStyles();
      } catch {
        // detached
      }
      a.cancel();
    });
    run.anims = [];
  }

  /** The projectile reaches the target with the answer known. */
  private land(run: Run) {
    const outcome = run.outcome;
    if (!outcome || this.run !== run) return;
    run.phase = "resolving";
    this.settle(run);
    if (run.turn === "attack") {
      if (outcome.correct) this.attackHit(run, outcome);
      else this.attackMiss(run, outcome);
    } else if (outcome.correct) this.blockHit(run, outcome);
    else this.blockMiss(run, outcome);
  }

  /** The hit on the boss: hit-stop, tint, sparks, shake, HP chunk, "Pow!". */
  private impactOnBoss(run: Run, at: Point, outcome: Outcome, withText: boolean) {
    const { bossSize } = this.sizes();
    // The rig tints the boss's silhouette (the face stays crisp).
    void this.refs.boss()?.flash?.("#FFF1C2");
    // The word pops at the contact point the instant it hits; the cast freezes for a beat.
    if (withText) this.pop(at, outcome.text, outcome.big ? "big" : "normal");
    this.hitStop(run, () => {
      void this.refs.boss()?.play(outcome.knockout ? "ko" : "hit");
      this.sparks(at, outcome.big ? 18 : 12, bossSize * (outcome.big ? 0.6 : 0.45));
      this.shake(outcome.big);
      this.chunk(outcome.hpFrom, outcome.hpTo);
      run.options.onImpact?.();
    });
  }

  private attackHit(run: Run, outcome: Outcome) {
    const el = run.projectile;
    if (el) this.once(el, [{ transform: el.style.transform || "none", opacity: 1 }, { transform: "scale(1.6)", opacity: 0 }], { duration: 120 });
    this.impactOnBoss(run, run.contact, outcome, true);
    void this.refs.owl()?.play("cheer");
    this.done(run, 700);
  }

  private attackMiss(run: Run, outcome: Outcome) {
    const el = run.projectile;
    const { bossSize } = this.sizes();
    const past = { x: (run.contact.x - run.from.x) * 0.35 + bossSize * 0.15, y: -bossSize * 0.75 };
    if (el)
      this.once(el, this.reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
        { transform: el.style.transform || "none", opacity: 1 },
        { transform: `translate(${past.x}px, ${past.y}px) rotate(900deg) scale(0.7)`, opacity: 0 },
      ], { duration: 380, easing: "ease-out" });
    // the whoosh
    if (!this.reduced()) {
      for (let i = 0; i < 3; i++) {
        const w = bossSize * 0.7;
        const streak = this.el({ x: run.contact.x, y: run.contact.y - bossSize * (0.25 + i * 0.12) }, 1, {
          width: `${w}px`,
          height: `${4 + (i % 2) * 2}px`,
          left: `${run.contact.x - w / 2}px`,
          borderRadius: "999px",
          background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9))",
          transform: "rotate(-30deg)",
        });
        this.once(streak, [{ opacity: 0, transform: "rotate(-30deg) translateX(-40%) scaleX(0.3)" }, { opacity: 1, transform: "rotate(-30deg) translateX(0) scaleX(1)", offset: 0.4 }, { opacity: 0, transform: "rotate(-30deg) translateX(50%) scaleX(0.4)" }], { duration: 360, delay: i * 40 });
      }
    }
    void this.refs.boss()?.play("taunt");
    void this.refs.owl()?.play("wrong");
    const o = this.owlRect();
    this.pop({ x: o.left + o.width * 0.5, y: o.top + o.height * 0.05 }, outcome.missText, "small", "#FFFFFF");
    this.done(run, 500);
  }

  private blockHit(run: Run, outcome: Outcome) {
    const el = run.projectile;
    const dome = run.dome;
    const at = run.contact;
    const { owlSize } = this.sizes();
    this.pop(at, outcome.text, outcome.big ? "big" : "normal", "#FFFFFF");
    this.hitStop(run, () => {
      // crack ring + sparks at the contact point, the dome flashes and rings
      const ring = this.el(at, owlSize * 0.5, { borderRadius: "50%", border: "5px solid rgba(255,255,255,0.95)", boxShadow: "0 0 16px rgba(167,243,208,0.9)", zIndex: "3" });
      this.once(ring, this.reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "scale(0.2)", opacity: 1 }, { transform: "scale(1.6)", opacity: 0 }], { duration: 320 });
      if (!this.reduced()) {
        for (let i = 0; i < 5; i++) {
          const len = owlSize * (0.18 + (i % 2) * 0.08);
          const crack = this.el(at, 1, { width: `${len}px`, height: "3px", left: `${at.x}px`, top: `${at.y}px`, background: "rgba(255,255,255,0.95)", transformOrigin: "0 50%", zIndex: "3" });
          const angle = (i / 5) * 360 + 20;
          this.once(crack, [{ transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1 }, { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.35 }, { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 0 }], { duration: 380 });
        }
      }
      this.sparks(at, 12, owlSize * 0.45, ["#FFFFFF", "#A7F3D0", "#FDE68A"]);
      this.shake(false);
      if (dome) this.track(run, dome.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.06)", opacity: 1, offset: 0.25 }, { transform: "scale(1)", opacity: 1 }], { duration: 260 }));
      // it bounces back and hits the boss
      const target = this.bossContact();
      if (el) {
        const dx = target.x - at.x;
        const dy = target.y - at.y;
        const back = el.animate(this.reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
          { transform: "translate(0, 0) rotate(0deg) scale(1)" },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - owlSize * 0.5}px) rotate(400deg) scale(0.9)`, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) rotate(800deg) scale(0.8)` },
        ], { duration: 340, fill: "both", easing: "cubic-bezier(0.3, 0.1, 0.7, 1)" });
        back.onfinish = () => {
          el.remove();
          if (this.run !== run && this.run) return;
          this.impactOnBoss(run, target, outcome, false);
        };
      } else this.impactOnBoss(run, target, outcome, false);
      if (dome) this.timer(run, () => this.fadeOut(dome, 260), 420);
    });
    this.done(run, 1100);
  }

  private blockMiss(run: Run, outcome: Outcome) {
    const el = run.projectile;
    const dome = run.dome;
    const c = this.owlCenter();
    const { owlSize } = this.sizes();
    // the dome shatters
    if (dome) {
      const d = this.domeRadius();
      if (!this.reduced()) {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const shard = this.el({ x: c.x + Math.cos(angle) * d * 0.8, y: c.y + Math.sin(angle) * d * 0.8 }, d * 0.35, {
            background: "linear-gradient(135deg, rgba(167,243,208,0.8), rgba(110,231,183,0.2))",
            clipPath: "polygon(50% 0, 100% 70%, 20% 100%)",
          });
          this.once(shard, [{ transform: `rotate(${i * 45}deg)`, opacity: 1 }, { transform: `translate(${Math.cos(angle) * d * 0.7}px, ${Math.sin(angle) * d * 0.7 + d * 0.5}px) rotate(${i * 45 + 140}deg) scale(0.5)`, opacity: 0 }], { duration: 480, easing: "ease-out" });
        }
      }
      this.fadeOut(dome, 160);
    }
    if (el) {
      const dx = c.x - run.contact.x;
      const dy = c.y - run.contact.y;
      this.once(el, this.reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx + owlSize * 0.2}px, ${dy + owlSize * 0.5}px) rotate(200deg) scale(0.6)`, opacity: 0 },
      ], { duration: 420, easing: "ease-in" });
    }
    this.timer(run, () => {
      void this.refs.owl()?.play("wrong");
      this.flash(this.refs.owlBox(), "rgba(255,200,200,0.9)", 0.8);
      this.sparks(c, 8, owlSize * 0.35, ["#FFFFFF", "#FCA5A5"]);
      this.shake(false);
      const o = this.owlRect();
      this.pop({ x: o.left + o.width * 0.5, y: o.top + o.height * 0.08 }, outcome.missText, "normal", "#FFFFFF");
    }, 110);
    this.done(run, 600);
  }

  private timer(run: Run, fn: () => void, ms: number) {
    run.timers.push(window.setTimeout(fn, ms));
  }

  private done(run: Run, ms: number) {
    this.timer(run, () => {
      if (this.run === run) this.run = null;
      run.options.onSettled?.();
      run.phase = "done";
      run.dome?.remove();
      const held = this.refs.bossProjectile();
      if (held) held.style.visibility = "";
    }, ms);
  }

  private finishRun() {
    const run = this.run;
    if (!run) return;
    this.stopCrackle(run);
    run.timers.forEach((id) => window.clearTimeout(id));
    run.anims.forEach((a) => a.cancel());
    run.projectile?.remove();
    run.dome?.remove();
    gsap.globalTimeline.resume();
    this.run = null;
  }
}
