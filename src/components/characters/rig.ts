import { gsap } from "gsap";
import type { CharacterCue, PlayOptions } from "./types";

/**
 * A tiny rig for flat SVG characters.
 *
 * A character is an SVG built from named groups (`data-part="armL"`), each
 * with an explicit pivot in SVG units. Several groups may share a name (a
 * head drawn partly behind the body and partly in front of it); they then
 * move as one. Variants (`data-variant="mouth:smile"`) are shapes swapped in
 * and out, and effects (`data-fx="stars"`) are shown or hidden by poses.
 *
 *  - A pose is per-part transforms plus which eye/mouth/brow variant shows.
 *  - An action is a GSAP timeline over the parts.
 *  - Each pose has an idle loop (breathing, blinking, glancing, extras).
 *
 * Only transforms and opacity are animated in loops, so a cheap phone keeps
 * 60fps. Colour tweens happen once (the Phase 2 power-up), never in loops.
 *
 * Wrapping groups: `move` takes the action-only motion (jumps, recoils,
 * shakes, the entrance drop) and `root` the pose-level placement, so the two
 * never fight over the same transform.
 */

export interface PartVars {
  x?: number;
  y?: number;
  rotation?: number | string;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
}

export type EyeVariant = "open" | "happy" | "spiral" | "closed" | "squeeze";
export type MouthVariant = "closed" | "smile" | "open" | "o" | "laugh" | "grumpy" | "wavy" | "smirk";
export type BrowSet = "neutral" | "up" | "grumpy" | "worried" | "cheeky" | "focus";
export type FxName = "trail" | "stars" | "steam" | "zzz" | "sparkles" | "shield" | "blush" | "brows" | "think";

export interface PoseSpec {
  parts?: Record<string, PartVars>;
  eyes?: EyeVariant;
  /** 0 = eyes wide open, 1 = lids shut (only for open eyes). */
  lids?: number;
  mouth?: MouthVariant;
  brows?: BrowSet;
  /** Where the pupils look, -1..1 on each axis. */
  gaze?: readonly [number, number];
  tint?: "normal" | "powered";
  fx?: readonly FxName[];
}

export interface RigSpec {
  kind: "boss" | "owl";
  pivots: Record<string, readonly [number, number]>;
  poses: Record<string, PoseSpec>;
  brows: Record<BrowSet, readonly [PartVars, PartVars]>;
  /** How far pupils travel, in SVG units. */
  gazeRange: readonly [number, number];
  /** +1 when the opponent is to the right, -1 when to the left. */
  facing: 1 | -1;
  /** Distance scale: 1 for a 200-unit boss box. */
  unit: number;
  /** Stars circle the head on this ellipse (head coordinates). */
  orbit: { cx: number; cy: number; rx: number; ry: number };
  /** `data-tint` keys: [normal colour, powered colour]. */
  tints?: Record<string, readonly [string, string]>;
  /** Where a thrown prop flies, relative to the hand. */
  propFly?: { x: number; y: number; rotation: number };
  mouthFallback?: Partial<Record<MouthVariant, MouthVariant>>;
  eyeFallback?: Partial<Record<EyeVariant, EyeVariant>>;
}

const IDENTITY = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/** Parts that poses drive directly; everything else is handled by name. */
const SPECIAL = new Set([
  "move",
  "prop",
  "flash",
  "shadow",
  "browL",
  "browR",
  "pupilL",
  "pupilR",
  "lidL",
  "lidR",
  "spiralL",
  "spiralR",
  "orb",
]);

/** The pose an action ends on, used for the reduced-motion crossfade. */
const KEY_POSE: Record<string, string> = {
  taunt: "taunt",
  windup: "windup",
  throw: "throw",
  hit: "hit",
  dizzy: "dizzy",
  ko: "ko",
  powered: "powered",
  happy: "happy",
  victory: "happy",
  sleep: "sleep",
  fire: "_fire",
  block: "block",
  cheer: "cheer",
  wrong: "wrong",
  think: "think",
};

const TALK_SEQUENCE: MouthVariant[] = ["open", "o", "closed", "laugh", "o", "open", "closed", "smile"];

type Anim = gsap.core.Animation;

interface Running {
  tl: gsap.core.Timeline;
  resolve: () => void;
}

export interface RigOptions {
  onCue?: (cue: CharacterCue) => void;
}

export class Rig {
  private readonly svg: SVGSVGElement;
  private readonly spec: RigSpec;
  private readonly cache = new Map<string, Element[]>();
  private readonly animParts: string[];
  private readonly onCue?: (cue: CharacterCue) => void;
  private readonly media: MediaQueryList | null;
  private pose: string;
  private reduced: boolean;
  private hiddenTab = false;
  private destroyed = false;
  private idle: Anim[] = [];
  private glowAnims: Anim[] = [];
  private glowOn = false;
  private settle: gsap.core.Timeline | null = null;
  private action: Running | null = null;
  private blinkRun: Running | null = null;
  private talkRun: Running | null = null;
  private tint: "normal" | "powered" = "normal";
  /** The mouth the face should show when not talking. */
  private mouthState: MouthVariant = "smile";
  private lidState = 0;

  constructor(svg: SVGSVGElement, spec: RigSpec, initialPose: string, options: RigOptions = {}) {
    this.svg = svg;
    this.spec = spec;
    this.onCue = options.onCue;
    this.pose = spec.poses[initialPose] ? initialPose : "idle";
    this.animParts = Object.keys(spec.pivots).filter((name) => !SPECIAL.has(name));

    // Effects scale about their own centres; named parts then get their explicit pivots.
    const fx = ["stars", "steam", "zzz", "sparkles", "dust", "think", "trail"].flatMap((name) => this.fxEls(name));
    if (fx.length) gsap.set(fx, { transformOrigin: "50% 50%" });
    for (const [name, [x, y]] of Object.entries(spec.pivots)) {
      const els = this.q(name);
      if (els.length) gsap.set(els, { svgOrigin: `${x} ${y}` });
    }
    // Lids render hidden so the server HTML never shows shut eyes; from here they open by scale.
    const lids = this.q("lidL").concat(this.q("lidR"));
    if (lids.length) gsap.set(lids, { scaleY: 0, opacity: 1 });

    this.media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.reduced = this.media?.matches ?? false;
    this.media?.addEventListener("change", this.onMotionChange);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.hiddenTab = document.hidden;

    const tl = gsap.timeline();
    this.addPose(tl, this.pose, 0, "none", 0, true);
    tl.progress(1).kill();
    this.startIdle();
  }

  // ─── Public API ────────────────────────────────────────────────────────

  setPose(name: string) {
    if (this.destroyed || !this.spec.poses[name] || name === this.pose) return;
    this.pose = name;
    // A running action settles into the new pose when it ends.
    if (this.action) return;
    this.returnToPose();
  }

  play(action: string, options: PlayOptions = {}): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (action === "blink") return this.runBlink();
    if (action === "talk") return this.runTalk(options.durationMs ?? 1600);

    return new Promise<void>((resolve) => {
      this.finishAction();
      this.stopIdle();
      this.settle?.kill();
      this.settle = null;
      const tl = this.reduced ? this.buildReduced(action) : this.buildAction(action);
      const running: Running = { tl, resolve };
      this.action = running;
      tl.eventCallback("onComplete", () => {
        if (this.action !== running) return;
        this.action = null;
        resolve();
        this.returnToPose();
      });
      if (this.hiddenTab) tl.progress(1);
    });
  }

  /** The owl's "your turn" aura: fades in and gently pulses (static under reduced motion). */
  setGlow(on: boolean) {
    if (this.destroyed || on === this.glowOn) return;
    this.glowOn = on;
    const aura = this.q("aura");
    if (!aura.length) return;
    for (const anim of this.glowAnims) anim.kill();
    this.glowAnims = [];
    if (!on) {
      this.glowAnims.push(gsap.to(aura, { opacity: 0, scale: 0.9, duration: this.reduced ? 0 : 0.35, ease: "power2.out" }));
      return;
    }
    if (this.reduced) {
      gsap.set(aura, { opacity: 0.85, scale: 1 });
      return;
    }
    const tl = gsap.timeline();
    tl.fromTo(aura, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }).to(aura, {
      opacity: 0.6,
      scale: 1.08,
      duration: 1.1,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    if (this.hiddenTab) tl.pause();
    this.glowAnims.push(tl);
  }

  /** Total length of an action in seconds (for tests and the dev gallery). */
  measure(action: string): number {
    if (action === "talk") return 1.6;
    if (action === "blink") return 0.2;
    const tl = this.reduced ? this.buildReduced(action, true) : this.buildAction(action, true);
    const d = tl.duration();
    tl.kill();
    return d;
  }

  destroy() {
    this.destroyed = true;
    this.media?.removeEventListener("change", this.onMotionChange);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stopIdle();
    this.settle?.kill();
    for (const anim of this.glowAnims) anim.kill();
    for (const run of [this.action, this.blinkRun, this.talkRun]) {
      if (run) {
        run.tl.kill();
        run.resolve();
      }
    }
    this.action = this.blinkRun = this.talkRun = null;
    gsap.killTweensOf(this.svg.querySelectorAll("[data-part],[data-variant],[data-fx],[data-fx] > *,[data-tint],[data-tint-stroke]"));
  }

  // ─── Lookup helpers ────────────────────────────────────────────────────

  private q(name: string): Element[] {
    let els = this.cache.get(name);
    if (!els) {
      els = Array.from(this.svg.querySelectorAll(`[data-part="${name}"]`));
      this.cache.set(name, els);
    }
    return els;
  }

  private fxEls(name?: string): Element[] {
    const key = `fx:${name ?? "*"}`;
    let els = this.cache.get(key);
    if (!els) {
      els = Array.from(this.svg.querySelectorAll(name ? `[data-fx="${name}"] > *` : "[data-fx] > *"));
      this.cache.set(key, els);
    }
    return els;
  }

  private fxGroup(name: FxName): Element[] {
    return Array.from(this.svg.querySelectorAll(`[data-fx="${name}"]`));
  }

  private has(name: string) {
    return this.q(name).length > 0;
  }

  private to(tl: gsap.core.Timeline, name: string, vars: gsap.TweenVars, position?: gsap.Position) {
    const els = this.q(name);
    if (els.length) tl.to(els, vars, position);
  }

  private cue(tl: gsap.core.Timeline, cue: CharacterCue, position?: gsap.Position) {
    tl.call(() => this.onCue?.(cue), undefined, position);
  }

  // ─── Variants ──────────────────────────────────────────────────────────

  private showVariant(group: "eyes" | "mouth", variant: string) {
    const fallback = group === "mouth" ? this.spec.mouthFallback : this.spec.eyeFallback;
    let chosen = variant;
    if (!this.svg.querySelector(`[data-variant="${group}:${chosen}"]`)) {
      chosen = (fallback as Record<string, string> | undefined)?.[variant] ?? (group === "mouth" ? "closed" : "open");
    }
    let all = this.cache.get(`variant:${group}`);
    if (!all) {
      all = Array.from(this.svg.querySelectorAll(`[data-variant^="${group}:"]`));
      this.cache.set(`variant:${group}`, all);
    }
    all.forEach((el) => {
      const on = el.getAttribute("data-variant") === `${group}:${chosen}`;
      gsap.set(el, { autoAlpha: on ? 1 : 0 });
    });
  }

  private setMouth(variant: MouthVariant, fromTalk = false) {
    if (!fromTalk) this.mouthState = variant;
    if (this.talkRun && !fromTalk) return;
    this.showVariant("mouth", variant);
  }

  private setFx(list: readonly FxName[] | undefined) {
    const on = new Set(list ?? []);
    this.svg.querySelectorAll("[data-fx]").forEach((el) => {
      gsap.set(el, { autoAlpha: on.has(el.getAttribute("data-fx") as FxName) ? 1 : 0 });
    });
    if (on.has("stars")) this.placeStars(0, 1);
  }

  private placeStars(angle: number, spread: number) {
    const { cx, cy, rx, ry } = this.spec.orbit;
    const stars = this.fxEls("stars");
    stars.forEach((star, i) => {
      const a = angle + (i * Math.PI * 2) / stars.length;
      gsap.set(star, {
        x: cx + Math.cos(a) * rx * spread,
        y: cy + Math.sin(a) * ry * spread,
        scale: 0.78 + 0.22 * Math.sin(a),
      });
    });
  }

  // ─── Poses ─────────────────────────────────────────────────────────────

  /** A pose, with the Phase 2 look layered on while the boss is powered up. */
  private poseSpec(name: string): PoseSpec {
    const base = this.spec.poses[name] ?? this.spec.poses.idle;
    if (this.pose !== "powered" || name === "powered" || name === "ko" || name === "sleep" || this.spec.kind !== "boss") {
      return base;
    }
    const powered = this.spec.poses.powered;
    const rootBase = base.parts?.root ?? {};
    const rootPow = powered.parts?.root ?? {};
    const sx = (rootPow.scaleX ?? rootPow.scale ?? 1) * (rootBase.scaleX ?? rootBase.scale ?? 1);
    const sy = (rootPow.scaleY ?? rootPow.scale ?? 1) * (rootBase.scaleY ?? rootBase.scale ?? 1);
    return {
      ...base,
      brows: base.brows === "neutral" || !base.brows ? "grumpy" : base.brows,
      mouth: base.mouth === "smile" ? "grumpy" : base.mouth,
      fx: Array.from(new Set([...(base.fx ?? []), "steam" as FxName])),
      parts: { ...base.parts, root: { ...rootBase, scale: undefined, scaleX: sx, scaleY: sy } },
    };
  }

  private tintFor(name: string, settling: boolean): "normal" | "powered" | null {
    if (name === "powered") return "powered";
    if (settling) return this.pose === "powered" && name !== "ko" && name !== "sleep" ? "powered" : "normal";
    if (name === "ko" || name === "sleep") return "normal";
    return null;
  }

  /**
   * Adds tweens that carry every part to a pose. `settling` marks the move
   * into the held pose (it may change colour); actions pass false.
   */
  private addPose(
    tl: gsap.core.Timeline,
    name: string,
    duration: number,
    ease: string,
    position: gsap.Position,
    settling = false,
  ) {
    const pose = this.poseSpec(name);
    tl.addLabel(`pose-${name}`, position);
    const at = `pose-${name}`;
    for (const part of this.animParts) {
      const v: PartVars = { ...pose.parts?.[part] };
      const target = { ...IDENTITY, ...v };
      if (v.scale !== undefined) {
        target.scaleX = v.scale;
        target.scaleY = v.scale;
      }
      delete (target as PartVars).scale;
      this.to(tl, part, { ...target, duration, ease }, at);
    }
    const browSet = this.spec.brows[pose.brows ?? "neutral"];
    this.to(tl, "browL", { ...IDENTITY, ...browSet[0], duration, ease }, at);
    this.to(tl, "browR", { ...IDENTITY, ...browSet[1], duration, ease }, at);

    const [gx, gy] = pose.gaze ?? [0, 0];
    const [rx, ry] = this.spec.gazeRange;
    this.to(tl, "pupilL", { x: gx * rx, y: gy * ry, duration: Math.max(duration, 0.0001), ease: "power2.out" }, at);
    this.to(tl, "pupilR", { x: gx * rx, y: gy * ry, duration: Math.max(duration, 0.0001), ease: "power2.out" }, at);

    const lids = pose.lids ?? 0;
    tl.call(() => (this.lidState = lids), undefined, at);
    this.to(tl, "lidL", { scaleY: lids, duration, ease }, at);
    this.to(tl, "lidR", { scaleY: lids, duration, ease }, at);

    const eyes = pose.eyes ?? "open";
    const mouth = pose.mouth ?? "smile";
    const fx = pose.fx;
    tl.call(
      () => {
        this.showVariant("eyes", eyes);
        this.setMouth(mouth);
        this.setFx(fx);
      },
      undefined,
      at,
    );

    const tint = this.tintFor(name, settling);
    if (tint) this.addTint(tl, tint, settling && duration > 0 ? 0.5 : duration, at);
  }

  private addTint(tl: gsap.core.Timeline, tint: "normal" | "powered", duration: number, position: gsap.Position) {
    const tints = this.spec.tints;
    if (!tints) return;
    tl.call(() => (this.tint = tint), undefined, position);
    const index = tint === "powered" ? 1 : 0;
    for (const [key, colours] of Object.entries(tints)) {
      const fills = this.svg.querySelectorAll(`[data-tint="${key}"]`);
      const strokes = this.svg.querySelectorAll(`[data-tint-stroke="${key}"]`);
      if (fills.length) tl.to(fills, { fill: colours[index], duration, ease: "power1.inOut" }, position);
      if (strokes.length) tl.to(strokes, { stroke: colours[index], duration, ease: "power1.inOut" }, position);
    }
  }

  private returnToPose() {
    if (this.destroyed) return;
    this.stopIdle();
    this.settle?.kill();
    const tl = gsap.timeline({ onComplete: () => this.startIdle() });
    // Reset the action-only parts.
    this.to(tl, "move", { ...IDENTITY, duration: this.reduced ? 0 : 0.3, ease: "power2.out" }, 0);
    this.to(tl, "shadow", { scaleX: 1, scaleY: 1, opacity: 1, duration: this.reduced ? 0 : 0.3 }, 0);
    this.to(tl, "prop", { ...IDENTITY, autoAlpha: 1, duration: 0 }, 0);
    this.to(tl, "flash", { opacity: 0, duration: 0 }, 0);
    this.to(tl, "orb", { autoAlpha: 0, duration: 0 }, 0);
    if (this.reduced) {
      this.addPose(tl, this.pose, 0, "none", 0, true);
    } else {
      this.addPose(tl, this.pose, 0.38, "power2.out", 0, true);
    }
    this.settle = tl;
  }

  private finishAction() {
    const run = this.action;
    if (!run) return;
    this.action = null;
    run.tl.kill();
    run.resolve();
  }

  // ─── Overlays: blink and talk ──────────────────────────────────────────

  private runBlink(): Promise<void> {
    return new Promise((resolve) => {
      if (this.blinkRun) {
        this.blinkRun.tl.kill();
        this.blinkRun.resolve();
      }
      const lids = this.q("lidL").concat(this.q("lidR"));
      const tl = gsap.timeline();
      if (!this.reduced && lids.length) {
        tl.to(lids, { scaleY: 1, duration: 0.07, ease: "power2.in" }).to(lids, {
          scaleY: () => this.lidState,
          duration: 0.12,
          ease: "power2.out",
        });
      } else {
        tl.to({}, { duration: 0.1 });
      }
      const run: Running = { tl, resolve };
      this.blinkRun = run;
      tl.eventCallback("onComplete", () => {
        if (this.blinkRun === run) this.blinkRun = null;
        resolve();
      });
    });
  }

  private runTalk(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.talkRun) {
        this.talkRun.tl.kill();
        this.talkRun.resolve();
        this.talkRun = null;
      }
      const seconds = Math.max(0.1, ms / 1000);
      const tl = gsap.timeline();
      if (this.reduced) {
        tl.call(() => this.setMouth("open", true));
        tl.to({}, { duration: seconds });
      } else {
        let t = 0;
        let i = Math.floor(Math.random() * 4);
        while (t < seconds - 0.08) {
          const variant = TALK_SEQUENCE[i % TALK_SEQUENCE.length];
          tl.call(() => this.setMouth(variant, true), undefined, t);
          t += 0.085 + ((i * 37) % 7) * 0.012;
          i += 1;
        }
        // A little nod now and then sells the speech.
        if (this.has("head")) {
          const nods = Math.max(1, Math.floor(seconds / 0.55));
          for (let n = 0; n < nods; n += 1) {
            tl.to(this.q("head"), { y: `+=${1.6 * this.spec.unit}`, duration: 0.14, ease: "sine.inOut", yoyo: true, repeat: 1 }, n * 0.55 + 0.05);
          }
        }
        tl.to({}, { duration: seconds }, 0);
      }
      const run: Running = { tl, resolve };
      this.talkRun = run;
      tl.eventCallback("onComplete", () => {
        if (this.talkRun === run) this.talkRun = null;
        this.showVariant("mouth", this.mouthState);
        resolve();
      });
    });
  }

  // ─── Idle loops ────────────────────────────────────────────────────────

  private stopIdle() {
    for (const anim of this.idle) anim.kill();
    this.idle = [];
  }

  private keep<T extends Anim>(anim: T): T {
    this.idle.push(anim);
    if (this.hiddenTab) anim.pause();
    return anim;
  }

  private startIdle() {
    this.stopIdle();
    if (this.destroyed || this.reduced) return;
    const name = this.pose;
    const pose = this.poseSpec(name);
    const u = this.spec.unit;
    const owl = this.spec.kind === "owl";
    const powered = this.pose === "powered";

    // Breathing: a squash-stretch on the body, from wherever the pose left it.
    const body = this.q("body");
    if (body.length) {
      const sx = pose.parts?.body?.scaleX ?? pose.parts?.body?.scale ?? 1;
      const sy = pose.parts?.body?.scaleY ?? pose.parts?.body?.scale ?? 1;
      const period = name === "sleep" ? 2.2 : powered ? 0.62 : name === "happy" || name === "cheer" ? 0.5 : 1.5;
      this.keep(
        gsap.to(body, { scaleY: sy * 1.035, scaleX: sx * 0.982, duration: period, ease: "sine.inOut", yoyo: true, repeat: -1 }),
      );
    }

    // Tails, tufts and tassels sway; offset so they never move in lockstep.
    for (const [part, amount, period] of [
      ["tail", 5, 1.3],
      ["tuft", 7, 1.1],
      ["tassel", 9, 1.05],
      ["leaf", 6, 1.6],
      ["earL", -5, 1.9],
      ["earR", 5, 2.1],
      ["flapL", -8, 0.9],
      ["flapR", 8, 0.95],
    ] as const) {
      if (!this.has(part)) continue;
      const base = deg(pose.parts?.[part]?.rotation);
      this.keep(gsap.to(this.q(part), { rotation: base + amount, duration: period, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    }

    const eyesOpen = (pose.eyes ?? "open") === "open";
    if (eyesOpen && (pose.lids ?? 0) < 0.9) this.scheduleBlink();
    if (name === "idle" || name === "powered" || name === "taunt") this.scheduleGlance(pose);

    // The owl bobs gently on its toes while it waits.
    if (owl && (name === "idle" || name === "think" || name === "wrong" || name === "block")) {
      this.keep(gsap.to(this.q("move"), { y: -1.6, duration: 0.85, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    }

    switch (name) {
      case "taunt": {
        const arm = owl ? "wingL" : "armL";
        const base = deg(pose.parts?.[arm]?.rotation);
        this.keep(gsap.to(this.q(arm), { rotation: base + 14, duration: 0.32, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        const head = deg(pose.parts?.head?.rotation);
        this.keep(gsap.to(this.q("head"), { rotation: head + 4, duration: 0.64, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        break;
      }
      case "windup":
        this.keep(gsap.to(this.q("move"), { x: 1.2 * u, duration: 0.05, ease: "none", yoyo: true, repeat: -1 }));
        break;
      case "hit":
        this.keep(gsap.to(this.q("move"), { x: 0.8 * u, duration: 0.06, ease: "none", yoyo: true, repeat: -1, repeatDelay: 0.5 }));
        break;
      case "dizzy":
      case "ko":
        this.orbitStars(name === "ko" ? 2.4 : 1.4);
        this.spinSpirals(name === "ko" ? 2.2 : 1.1);
        if (name === "dizzy") {
          this.keep(gsap.fromTo(this.q("move"), { rotation: -5 }, { rotation: 5, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        }
        break;
      case "powered":
        this.loopSteam();
        this.keep(
          gsap
            .timeline({ repeat: -1, repeatDelay: 1.8, delay: 1.2 })
            .to(this.q("move"), { x: 1 * u, duration: 0.045, ease: "none", yoyo: true, repeat: 9 }),
        );
        break;
      case "happy":
      case "cheer": {
        this.keep(gsap.to(this.q("move"), { y: -7 * u, duration: 0.25, ease: "power1.out", yoyo: true, repeat: -1 }));
        for (const [arm, sign] of owl ? ([["wingL", 1], ["wingR", -1]] as const) : ([["armL", 1], ["armR", -1]] as const)) {
          const base = deg(pose.parts?.[arm]?.rotation);
          this.keep(gsap.to(this.q(arm), { rotation: base + 16 * sign, duration: 0.25, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        }
        this.twinkle();
        break;
      }
      case "sleep":
        this.loopZzz();
        break;
      case "think": {
        const head = deg(pose.parts?.head?.rotation);
        this.keep(gsap.to(this.q("head"), { rotation: head - 4, duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        this.keep(gsap.to(this.fxEls("think"), { y: -2, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        break;
      }
      case "wrong":
        this.keep(gsap.fromTo(this.q("move"), { rotation: -1.5 }, { rotation: 1.5, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        break;
      case "block":
        this.keep(gsap.to(this.q("shieldGlow"), { opacity: 0.25, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 }));
        break;
    }
  }

  private scheduleBlink() {
    const next = () => {
      if (Math.random() < 0.2) {
        this.runBlink().then(() => this.runBlink());
      } else {
        void this.runBlink();
      }
      this.keep(gsap.delayedCall(2.2 + Math.random() * 3.2, next));
    };
    this.keep(gsap.delayedCall(1 + Math.random() * 2, next));
  }

  private scheduleGlance(pose: PoseSpec) {
    const [rx, ry] = this.spec.gazeRange;
    const [gx, gy] = pose.gaze ?? [0, 0];
    const pupils = this.q("pupilL").concat(this.q("pupilR"));
    if (!pupils.length) return;
    const look = () => {
      const tx = gsap.utils.random(-1, 1);
      const ty = gsap.utils.random(-0.6, 0.5);
      const tl = gsap.timeline();
      tl.to(pupils, { x: tx * rx, y: ty * ry, duration: 0.22, ease: "power3.out" })
        .to(pupils, { x: gx * rx, y: gy * ry, duration: 0.3, ease: "power2.inOut" }, `+=${0.6 + Math.random() * 0.8}`);
      this.keep(tl);
      this.keep(gsap.delayedCall(3 + Math.random() * 3.5, look));
    };
    this.keep(gsap.delayedCall(2 + Math.random() * 2, look));
  }

  private orbitStars(period: number) {
    if (!this.fxEls("stars").length) return;
    const proxy = { a: 0 };
    this.keep(
      gsap.to(proxy, {
        a: Math.PI * 2,
        duration: period,
        ease: "none",
        repeat: -1,
        onUpdate: () => this.placeStars(proxy.a, 1),
      }),
    );
  }

  private spinSpirals(period: number) {
    const spirals = this.q("spiralL").concat(this.q("spiralR"));
    if (spirals.length) this.keep(gsap.to(spirals, { rotation: "+=360", duration: period, ease: "none", repeat: -1 }));
  }

  private loopSteam() {
    const puffs = this.fxEls("steam");
    puffs.forEach((puff, i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      this.keep(
        gsap.fromTo(
          puff,
          { y: 0, x: 0, scale: 0.4, opacity: 0.95 },
          { y: -22 * this.spec.unit, x: dir * 8 * this.spec.unit, scale: 1.25, opacity: 0, duration: 1.1, ease: "power1.out", repeat: -1, delay: i * 0.55 },
        ),
      );
    });
  }

  private loopZzz() {
    const zs = this.fxEls("zzz");
    zs.forEach((z, i) => {
      this.keep(
        gsap.fromTo(
          z,
          { y: 8 * this.spec.unit, x: 0, scale: 0.5, opacity: 0 },
          {
            keyframes: [
              { opacity: 1, scale: 0.9, y: 0, duration: 0.6, ease: "power1.out" },
              { opacity: 0, scale: 1.15, y: -16 * this.spec.unit, x: 6 * this.spec.unit, duration: 1.2, ease: "sine.in" },
            ],
            repeat: -1,
            delay: i * 0.6,
          },
        ),
      );
    });
  }

  private twinkle() {
    const sparkles = this.fxEls("sparkles");
    sparkles.forEach((s, i) => {
      this.keep(gsap.fromTo(s, { scale: 0.4, rotation: 0 }, { scale: 1.1, rotation: 45, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * 0.22 }));
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────────

  private buildReduced(action: string, paused = false): gsap.core.Timeline {
    const key = KEY_POSE[action] ?? this.pose;
    const tl = gsap.timeline({ paused });
    const root = this.q("root");
    tl.to(root, { opacity: 0.4, duration: 0.08, ease: "none" });
    this.addPose(tl, key, 0, "none", 0.08);
    tl.to(root, { opacity: 1, duration: 0.1, ease: "none" }, 0.08);
    if (action === "hit" || action === "ko") this.cue(tl, "impact", 0.08);
    if (action === "throw" || action === "fire") this.cue(tl, "release", 0.08);
    if (action === "land") this.cue(tl, "land", 0.08);
    if (action === "block") this.cue(tl, "shield", 0.08);
    return tl;
  }

  private buildAction(action: string, paused = false): gsap.core.Timeline {
    const tl = gsap.timeline({ paused });
    const u = this.spec.unit;
    const f = this.spec.facing;
    const owl = this.spec.kind === "owl";
    const poseHas = (name: string) => Boolean(this.spec.poses[name]);

    const squash = (pos: gsap.Position, sx: number, sy: number, duration = 0.08, ease = "power2.out") =>
      this.to(tl, "body", { scaleX: sx, scaleY: sy, duration, ease }, pos);

    switch (action) {
      case "idle": {
        squash(0, 1.06, 0.94, 0.1);
        this.addPose(tl, "idle", 0.4, "elastic.out(1, 0.5)", 0.1);
        break;
      }

      case "taunt": {
        squash(0, 1.08, 0.9, 0.14, "power2.in");
        tl.addLabel("pop", 0.14);
        this.addPose(tl, "taunt", 0.34, "back.out(2.2)", "pop");
        this.to(tl, "move", { y: -10 * u, duration: 0.16, ease: "power2.out" }, "pop");
        this.to(tl, "move", { y: 0, duration: 0.18, ease: "power2.in" }, "pop+=0.16");
        const arm = owl ? "wingL" : "armL";
        const base = deg(this.spec.poses.taunt?.parts?.[arm]?.rotation);
        this.to(tl, arm, { rotation: base + 20, duration: 0.13, ease: "sine.inOut", yoyo: true, repeat: 5 }, "pop+=0.36");
        const head = deg(this.spec.poses.taunt?.parts?.head?.rotation);
        this.to(tl, "head", { rotation: head + 6, duration: 0.2, ease: "sine.inOut", yoyo: true, repeat: 3 }, "pop+=0.36");
        ["laugh", "open", "laugh", "open", "laugh"].forEach((m, i) =>
          tl.call(() => this.setMouth(m as MouthVariant), undefined, `pop+=${0.36 + i * 0.16}`),
        );
        tl.to({}, { duration: 0.1 });
        break;
      }

      case "windup": {
        squash(0, 1.05, 0.95, 0.12, "power2.in");
        this.addPose(tl, "windup", 0.42, "power2.out", 0.1);
        this.to(tl, "move", { x: 1.5 * u, duration: 0.045, ease: "none", yoyo: true, repeat: 7 }, ">");
        break;
      }

      case "throw":
      case "fire": {
        const wind = action === "fire" ? "_fireWind" : "windup";
        const release = action === "fire" ? "_fire" : "throw";
        this.addPose(tl, wind, 0.26, "power2.out", 0);
        tl.addLabel("snap", 0.4);
        this.addPose(tl, release, 0.13, "power4.out", "snap");
        this.to(tl, "move", { x: f * 8 * u, duration: 0.13, ease: "power3.out" }, "snap");
        this.cue(tl, "release", "snap+=0.05");
        const fly = this.spec.propFly ?? { x: f * 70, y: 20, rotation: f * 200 };
        if (this.has("prop")) {
          this.to(tl, "prop", { x: fly.x, y: fly.y, rotation: fly.rotation, scale: 0.5, duration: 0.34, ease: "power1.in" }, "snap+=0.05");
          this.to(tl, "prop", { autoAlpha: 0, duration: 0.12 }, "snap+=0.27");
        }
        if (this.has("orb")) {
          // The star pops out at the wing tip, squashes as it lets go, then
          // stretches along its flight with a short sparkle trail.
          this.to(tl, "orb", { autoAlpha: 1, x: 0, y: 0, scaleX: 0.3, scaleY: 0.3, rotation: 0, duration: 0 }, "snap");
          this.to(tl, "orb", { scaleX: 1.45, scaleY: 0.65, duration: 0.06, ease: "power2.out" }, "snap");
          this.to(tl, "orb", { scaleX: 0.9, scaleY: 1.15, duration: 0.08, ease: "power2.in" }, "snap+=0.06");
          this.to(tl, "orb", { x: fly.x, y: fly.y, rotation: fly.rotation, duration: 0.32, ease: "power1.in" }, "snap+=0.06");
          this.to(tl, "orb", { scaleX: 1.2, scaleY: 1.2, duration: 0.24, ease: "none" }, "snap+=0.14");
          this.to(tl, "orb", { autoAlpha: 0, duration: 0.08 }, "snap+=0.32");
          const trail = this.fxEls("trail");
          if (trail.length) {
            tl.set(this.fxGroup("trail"), { autoAlpha: 1 }, "snap+=0.06");
            trail.forEach((dot, i) => {
              const lag = 0.035 * (i + 1);
              tl.fromTo(
                dot,
                { x: 0, y: 0, scale: 1 - i * 0.2, opacity: 0.95 },
                { x: fly.x * 0.9, y: fly.y * 0.9, scale: 0.2, opacity: 0, duration: 0.32, ease: "power1.in", immediateRender: false },
                `snap+=${0.06 + lag}`,
              );
            });
            tl.set(this.fxGroup("trail"), { autoAlpha: 0 }, "snap+=0.5");
          }
        }
        this.to(tl, "move", { x: 0, duration: 0.4, ease: "power2.inOut" }, "snap+=0.2");
        squash("snap", 0.94, 1.06, 0.1);
        squash("snap+=0.12", 1, 1, 0.3, "elastic.out(1, 0.5)");
        if (this.has("prop")) {
          this.to(tl, "prop", { x: 0, y: 0, rotation: 0, scale: 0, duration: 0 }, "snap+=0.5");
          this.to(tl, "prop", { autoAlpha: 1, scale: 1, duration: 0.28, ease: "back.out(3)" }, "snap+=0.52");
        } else {
          tl.to({}, { duration: 0.35 }, "snap+=0.2");
        }
        break;
      }

      case "hit": {
        this.cue(tl, "impact", 0);
        this.addPose(tl, "hit", 0, "none", 0);
        squash(0, 1.26, 0.76, 0.07);
        this.to(tl, "flash", { opacity: 0.85, duration: 0.04 }, 0);
        this.to(tl, "flash", { opacity: 0, duration: 0.24 }, 0.07);
        // A clear recoil: knocked back and leaning away, then a wobbly recovery.
        this.to(tl, "move", { x: -f * 14 * u, y: 2 * u, rotation: -f * 13, duration: 0.1, ease: "power3.out" }, 0);
        this.to(tl, "move", { x: -f * 11 * u, rotation: -f * 10, duration: 0.14, ease: "sine.out" }, 0.1);
        this.to(tl, "move", { x: 0, y: 0, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" }, 0.24);
        const hitBody = this.poseSpec("hit").parts?.body ?? {};
        squash(0.08, hitBody.scaleX ?? 1, hitBody.scaleY ?? 1, 0.5, "elastic.out(1, 0.35)");
        this.burstStars(tl, 0.02);
        break;
      }

      case "dizzy": {
        this.addPose(tl, "dizzy", 0.28, "back.out(2)", 0);
        const proxy = { a: 0 };
        tl.to(proxy, { a: Math.PI * 4, duration: 1.7, ease: "none", onUpdate: () => this.placeStars(proxy.a, 1) }, 0);
        const spirals = this.q("spiralL").concat(this.q("spiralR"));
        if (spirals.length) tl.to(spirals, { rotation: "+=720", duration: 1.7, ease: "none" }, 0);
        this.to(tl, "move", { rotation: 7, duration: 0.28, ease: "sine.inOut", yoyo: true, repeat: 5 }, 0);
        this.to(tl, "move", { rotation: 0, duration: 0.15 }, 1.68);
        break;
      }

      case "ko": {
        this.cue(tl, "impact", 0);
        this.addPose(tl, "hit", 0, "none", 0);
        squash(0, 1.22, 0.78, 0.06);
        this.to(tl, "flash", { opacity: 0.9, duration: 0.04 }, 0);
        this.to(tl, "flash", { opacity: 0, duration: 0.3 }, 0.08);
        this.to(tl, "move", { x: -f * 20 * u, rotation: -f * 6, duration: 0.12, ease: "power2.out" }, 0);
        squash(0.1, 1, 1, 0.16);
        // The topple: hang for a beat, then flop over and bounce.
        this.addPose(tl, "ko", 0.42, "power2.in", 0.3);
        this.to(tl, "move", { x: 0, rotation: 0, duration: 0.42, ease: "power2.in" }, 0.3);
        squash(0.72, 1.16, 0.82, 0.07);
        this.to(tl, "move", { y: -9 * u, duration: 0.14, ease: "power2.out" }, 0.74);
        this.to(tl, "move", { y: 0, duration: 0.14, ease: "power2.in" }, 0.88);
        const koBody = this.poseSpec("ko").parts?.body ?? {};
        squash(0.8, koBody.scaleX ?? 1, koBody.scaleY ?? 1, 0.4, "elastic.out(1, 0.4)");
        const proxy = { a: 0 };
        tl.to(proxy, { a: Math.PI * 3, duration: 1.2, ease: "power1.out", onUpdate: () => this.placeStars(proxy.a, Math.min(1, proxy.a / 2)) }, 0.72);
        const spirals = this.q("spiralL").concat(this.q("spiralR"));
        if (spirals.length) tl.to(spirals, { rotation: "+=540", duration: 1.2, ease: "power1.out" }, 0.72);
        break;
      }

      case "powered": {
        squash(0, 1.1, 0.88, 0.2, "power2.in");
        this.addPose(tl, "idle", 0.2, "power2.in", 0);
        tl.call(() => {
          this.setMouth("grumpy");
        }, undefined, 0.15);
        this.to(tl, "browL", { ...this.spec.brows.grumpy[0], duration: 0.15 }, 0.15);
        this.to(tl, "browR", { ...this.spec.brows.grumpy[1], duration: 0.15 }, 0.15);
        const target = this.spec.poses.powered?.parts?.root ?? {};
        const top = target.scale ?? target.scaleX ?? 1.12;
        [0, 1, 2].forEach((step) => {
          const at = 0.25 + step * 0.22;
          this.to(tl, "root", { scale: 1 + ((top - 1) * (step + 1)) / 3, duration: 0.14, ease: "back.out(3)" }, at);
          this.to(tl, "move", { x: (step % 2 ? 2 : -2) * u, duration: 0.035, ease: "none", yoyo: true, repeat: 3 }, at);
        });
        this.addTint(tl, "powered", 0.55, 0.25);
        tl.call(() => this.setFx(["steam"]), undefined, 0.6);
        this.fxEls("steam").forEach((puff, i) => {
          tl.fromTo(puff, { y: 0, x: 0, scale: 0.3, opacity: 1 }, { y: -26 * u, x: (i % 2 ? 10 : -10) * u, scale: 1.4, opacity: 0, duration: 0.7, ease: "power2.out" }, 0.62 + i * 0.08);
        });
        squash(0.92, 1, 1, 0.3, "elastic.out(1, 0.45)");
        this.addPose(tl, "powered", 0.3, "back.out(2)", 0.92);
        break;
      }

      case "happy":
      case "cheer":
      case "victory": {
        const hops = action === "victory" ? 2 : 1;
        const pose = poseHas(action === "cheer" ? "cheer" : "happy") ? (action === "cheer" ? "cheer" : "happy") : "idle";
        let t = 0;
        for (let h = 0; h < hops; h += 1) {
          squash(t, 1.1, 0.88, 0.12, "power2.in");
          this.addPose(tl, pose, 0.24, "back.out(2)", t + 0.12);
          squash(t + 0.12, 0.9, 1.12, 0.12);
          this.to(tl, "move", { y: -30 * u, duration: 0.26, ease: "power2.out" }, t + 0.12);
          this.to(tl, "shadow", { scale: 0.7, opacity: 0.6, duration: 0.26, ease: "power2.out" }, t + 0.12);
          squash(t + 0.24, 1, 1, 0.14);
          if (h === 1) this.to(tl, "root", { scaleX: -1, duration: 0.14, ease: "power1.in", yoyo: true, repeat: 1 }, t + 0.14);
          this.to(tl, "move", { y: 0, duration: 0.22, ease: "power2.in" }, t + 0.38);
          this.to(tl, "shadow", { scale: 1, opacity: 1, duration: 0.22, ease: "power2.in" }, t + 0.38);
          squash(t + 0.6, 1.14, 0.86, 0.06);
          squash(t + 0.66, 1, 1, 0.34, "elastic.out(1, 0.45)");
          t += 0.66;
        }
        if (this.fxEls("sparkles").length) {
          tl.fromTo(this.fxEls("sparkles"), { scale: 0, rotation: -45 }, { scale: 1, rotation: 0, duration: 0.3, ease: "back.out(3)", stagger: 0.06 }, 0.2);
        }
        if (owl) this.cue(tl, "land", t);
        tl.to({}, { duration: 0.2 }, t + 0.2);
        break;
      }

      case "land": {
        // Go off stage now, not on the next tick, so the resting pose never flashes first.
        if (!paused) gsap.set(this.q("move"), { y: -280 * u });
        this.addPose(tl, this.pose === "sleep" ? "sleep" : "idle", 0, "none", 0);
        tl.call(() => this.setMouth("o"), undefined, 0);
        this.to(tl, "browL", { ...this.spec.brows.up[0], duration: 0 }, 0);
        this.to(tl, "browR", { ...this.spec.brows.up[1], duration: 0 }, 0);
        this.to(tl, "move", { y: -280 * u, x: 0, rotation: 0, duration: 0 }, 0);
        this.to(tl, "shadow", { scale: 0.2, opacity: 0.2, duration: 0 }, 0);
        squash(0, 0.86, 1.2, 0);
        this.to(tl, "move", { y: 0, duration: 0.42, ease: "power3.in" }, 0.05);
        this.to(tl, "shadow", { scale: 1, opacity: 1, duration: 0.42, ease: "power3.in" }, 0.05);
        this.cue(tl, "land", 0.47);
        squash(0.47, 1.28, 0.72, 0.07);
        this.dustBurst(tl, 0.47);
        squash(0.54, 1, 1, 0.65, "elastic.out(1, 0.32)");
        tl.call(() => this.setMouth("smile"), undefined, 0.7);
        this.to(tl, "browL", { ...IDENTITY, duration: 0.2 }, 0.7);
        this.to(tl, "browR", { ...IDENTITY, duration: 0.2 }, 0.7);
        const pupils = this.q("pupilL").concat(this.q("pupilR"));
        if (pupils.length) {
          const [rx] = this.spec.gazeRange;
          tl.to(pupils, { x: -rx, duration: 0.16, ease: "power3.out" }, 0.9)
            .to(pupils, { x: rx, duration: 0.2, ease: "power3.inOut" }, 1.25)
            .to(pupils, { x: 0, duration: 0.2, ease: "power2.out" }, 1.6);
        }
        tl.to({}, { duration: 0.05 }, 1.8);
        break;
      }

      case "sleep": {
        // A big yawn and stretch, then nodding off.
        squash(0, 0.94, 1.08, 0.4, "sine.inOut");
        tl.call(() => this.setMouth("o"), undefined, 0.05);
        const lids = this.q("lidL").concat(this.q("lidR"));
        if (lids.length) tl.to(lids, { scaleY: 0.6, duration: 0.3 }, 0.05);
        this.to(tl, "armL", { rotation: 150, duration: 0.4, ease: "power2.out" }, 0.05);
        this.to(tl, "armR", { rotation: -150, duration: 0.4, ease: "power2.out" }, 0.05);
        this.to(tl, "head", { rotation: -4, y: -3 * u, duration: 0.4, ease: "power2.out" }, 0.05);
        squash(0.6, 1, 1, 0.3);
        this.addPose(tl, "sleep", 0.7, "sine.inOut", 0.6);
        break;
      }

      case "block": {
        const shield = this.q("shield");
        if (shield.length) {
          tl.set(shield, { autoAlpha: 1, scale: 0, y: 8 * u }, 0);
          tl.to(shield, { scale: 1.15, y: 0, duration: 0.16, ease: "back.out(2.5)" }, 0.02);
          tl.to(shield, { scale: 1, duration: 0.12, ease: "power2.out" }, 0.18);
        }
        this.addPose(tl, "block", 0.18, "back.out(2)", 0);
        this.cue(tl, "shield", 0.16);
        // Brace as the blow lands on the shield.
        this.to(tl, "move", { x: -f * 3 * u, duration: 0.06, ease: "power2.out" }, 0.34);
        this.to(tl, "move", { x: 0, duration: 0.3, ease: "elastic.out(1, 0.4)" }, 0.4);
        squash(0.34, 1.06, 0.94, 0.06);
        squash(0.4, 1, 1, 0.3, "elastic.out(1, 0.4)");
        tl.to({}, { duration: 0.1 }, 0.7);
        break;
      }

      case "wrong": {
        tl.call(() => this.setMouth("o"), undefined, 0);
        this.to(tl, "browL", { ...this.spec.brows.worried[0], duration: 0.12 }, 0);
        this.to(tl, "browR", { ...this.spec.brows.worried[1], duration: 0.12 }, 0);
        tl.call(() => this.setFx(["brows"]), undefined, 0);
        [8, -6, 4, -2, 0].forEach((r, i) => this.to(tl, "move", { rotation: r, duration: 0.12, ease: "sine.inOut" }, i * 0.12));
        squash(0, 1.05, 0.95, 0.1);
        squash(0.1, 1, 1, 0.3, "elastic.out(1, 0.5)");
        this.addPose(tl, "wrong", 0.3, "back.out(2)", 0.62);
        this.to(tl, "head", { y: 1.5 * u, duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" }, 0.95);
        break;
      }

      case "think": {
        this.addPose(tl, "think", 0.42, "back.out(1.8)", 0);
        tl.to({}, { duration: 0.25 }, 0.42);
        break;
      }

      default:
        this.addPose(tl, this.pose, 0.3, "power2.out", 0);
    }
    return tl;
  }

  private burstStars(tl: gsap.core.Timeline, position: number) {
    const stars = this.fxEls("stars");
    const groups = this.fxGroup("stars");
    if (!stars.length) return;
    const { cx, cy, rx, ry } = this.spec.orbit;
    tl.set(groups, { autoAlpha: 1 }, position);
    stars.forEach((star, i) => {
      const a = -Math.PI / 2 + (i - (stars.length - 1) / 2) * 0.9;
      tl.fromTo(
        star,
        { x: cx, y: cy + ry, scale: 0.2, rotation: 0, opacity: 1 },
        { x: cx + Math.cos(a) * rx * 1.1, y: cy + Math.sin(a) * ry * 2.2, scale: 1, rotation: 90, duration: 0.35, ease: "power2.out" },
        position,
      );
      tl.to(star, { opacity: 0, scale: 0.6, duration: 0.2 }, position + 0.38);
    });
    tl.set(stars, { opacity: 1 }, position + 0.6);
    tl.call(() => this.setFx(this.poseSpec("hit").fx), undefined, position + 0.6);
  }

  private dustBurst(tl: gsap.core.Timeline, position: number) {
    const puffs = this.fxEls("dust");
    const group = this.svg.querySelectorAll('[data-fx="dust"]');
    if (!puffs.length) return;
    tl.set(group, { autoAlpha: 1 }, position);
    puffs.forEach((puff, i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      const far = i < 2 ? 1 : 1.7;
      tl.fromTo(
        puff,
        { x: 0, y: 0, scale: 0.3, opacity: 1 },
        { x: dir * 22 * far * this.spec.unit, y: -6 * this.spec.unit, scale: 1.3, opacity: 0, duration: 0.55, ease: "power2.out" },
        position,
      );
    });
    tl.set(group, { autoAlpha: 0 }, position + 0.6);
  }

  // ─── Environment ───────────────────────────────────────────────────────

  private onMotionChange = (event: MediaQueryListEvent) => {
    this.reduced = event.matches;
    if (this.reduced) {
      this.stopIdle();
    } else if (!this.action) {
      this.startIdle();
    }
  };

  private onVisibility = () => {
    this.hiddenTab = document.hidden;
    for (const anim of this.idle.concat(this.glowAnims)) {
      if (this.hiddenTab) anim.pause();
      else anim.resume();
    }
  };
}

/** A pose rotation as a number (directional strings like "30_ccw" keep their angle). */
function deg(value: number | string | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value) || 0;
}
