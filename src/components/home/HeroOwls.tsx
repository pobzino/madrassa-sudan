"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Music2 } from "lucide-react";
import type { Language } from "@/contexts/LanguageContext";
import { LivingOwl, type OwlBadge, type OwlMood } from "@/components/brand/LivingOwl";
import { useOwlShow, type OwlAct } from "@/components/brand/useOwlShow";

const copy = {
  en: { dance: "Make the owl dance", bubble: "Let's dance!" },
  ar: { dance: "اجعل البومة ترقص", bubble: "يلا نرقص!" },
};

// Dance first, then fly, then a mix.
const OPENING: readonly OwlAct[] = ["sudanese", "fly"];
const ACTS: readonly OwlAct[] = ["fly", "sudanese", "party", "curious"];

// Maths owl, the main owl, English owl. Helpers trail the leader a beat behind.
const FLOCK: { badge?: OwlBadge; size: string; lag: number; offset: { x: number; y: number }; gaze: { x: number; y: number } }[] = [
  { badge: "math", size: "w-16 sm:w-28", lag: 0.22, offset: { x: -0.4, y: 0.18 }, gaze: { x: 0.6, y: -0.4 } },
  { size: "w-32 sm:w-52", lag: 0, offset: { x: 0, y: 0 }, gaze: { x: 0, y: -0.7 } },
  { badge: "english", size: "w-16 sm:w-28", lag: 0.4, offset: { x: 0.4, y: 0.18 }, gaze: { x: -0.6, y: -0.4 } },
];
const LEADER = 1;

type Box = { left: number; right: number; top: number; bottom: number };
type Rest = { x: number; y: number; w: number; h: number };
type Geometry = { w: number; h: number; text: Box; rests: Rest[] };
/** A point on the leader's path: where its feet are (x, y), its scale and tilt. */
type Waypoint = { x: number; y: number; s: number; r: number; d: number; ease: string; spin?: boolean; fromRest?: boolean };

/** The hero's size, a tight box around its text and buttons, and where each owl stands. */
function measure(hero: HTMLElement, slots: HTMLElement[]): Geometry {
  const origin = hero.getBoundingClientRect();
  const w = origin.width;
  const h = origin.height;
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  hero.querySelectorAll<HTMLElement>("[data-amal-hero-content] :is(h1, p, a)").forEach((el) => {
    let rect: DOMRect;
    if (el.tagName === "A") {
      rect = el.getBoundingClientRect();
    } else {
      // Measure the words, not the full-width block they sit in.
      const range = document.createRange();
      range.selectNodeContents(el);
      rect = range.getBoundingClientRect();
    }
    if (!rect.width) return;
    box.left = Math.min(box.left, rect.left - origin.left);
    box.right = Math.max(box.right, rect.right - origin.left);
    box.top = Math.min(box.top, rect.top - origin.top);
    box.bottom = Math.max(box.bottom, rect.bottom - origin.top);
  });
  const pad = 18;
  const text = Number.isFinite(box.left)
    ? { left: box.left - pad, right: box.right + pad, top: box.top - pad, bottom: box.bottom + pad }
    : { left: w * 0.15, right: w * 0.85, top: h * 0.1, bottom: h * 0.6 };
  const rests = slots.map((slot) => {
    const r = slot.getBoundingClientRect();
    return { x: r.left + r.width / 2 - origin.left, y: r.bottom - origin.top, w: r.width, h: r.height };
  });
  return { w, h, text, rests };
}

/**
 * The leader's path, routed around the text so the headline always stays
 * readable: up the open sky beside the text and over the top on wide
 * screens; below the buttons and off the screen's edges on narrow ones.
 */
function plan(g: Geometry, kind: "arrive" | "fly", mirror: boolean): Waypoint[] {
  const { w, h, text } = g;
  const lead = g.rests[LEADER];
  const far = 0.42;
  const sideRoom = Math.min(text.left, w - text.right);
  const wide = sideRoom >= lead.w * far * 1.8 + 16;
  // Lowest altitude that keeps an owl of scale `s` fully under the text.
  const under = (s: number) => Math.min(lead.y - 12, Math.max(text.bottom + 8 + lead.h * s, lead.y - lead.h * 0.7));
  const points: Waypoint[] = [];

  if (wide) {
    // Owls only change sides of the text below it, and only climb inside the
    // open sky beside it, so no leg of the path cuts across the words.
    const right = w - sideRoom / 2;
    const left = sideRoom / 2;
    const textMid = text.top + (text.bottom - text.top) * 0.55;
    const high = Math.max(lead.h * far + 10, text.top + (text.bottom - text.top) * 0.18);
    const topScale = Math.min(far, (text.top - 10) / lead.h);
    if (kind === "arrive") {
      points.push({ x: w + lead.w * 0.6, y: high, s: far, r: -14, d: 0, ease: "none" });
      points.push({ x: right, y: textMid, s: 0.55, r: -8, d: 1.0, ease: "sine.inOut" });
      points.push({ x: right, y: under(0.7), s: 0.7, r: -6, d: 0.6, ease: "sine.inOut" });
    } else {
      points.push({ x: lead.x + w * 0.04, y: lead.y - h * 0.1, s: 0.85, r: 6, d: 0.5, ease: "power2.out", fromRest: true });
      points.push({ x: right, y: under(0.7), s: 0.7, r: 8, d: 0.8, ease: "sine.inOut" });
      points.push({ x: right, y: textMid, s: 0.55, r: 10, d: 0.8, ease: "sine.inOut" });
      points.push({ x: right, y: high, s: far, r: 6, d: 0.8, ease: "sine.inOut" });
      if (topScale >= 0.2) {
        // There's sky above the headline: cross over the top, with room for the helpers.
        const topY = text.top - 6 - topScale * lead.h * 0.25;
        points.push({ x: right - sideRoom * 0.2, y: topY, s: topScale, r: -4, d: 0.6, ease: "sine.inOut" });
        points.push({ x: left + sideRoom * 0.2, y: topY, s: topScale, r: -8, d: 2.2, ease: "sine.inOut" });
        points.push({ x: left, y: high, s: far, r: -10, d: 0.9, ease: "sine.inOut", spin: true });
        points.push({ x: left, y: textMid, s: 0.55, r: -6, d: 0.8, ease: "sine.inOut" });
        points.push({ x: left, y: under(0.7), s: 0.7, r: -4, d: 0.7, ease: "sine.inOut" });
      } else {
        // No room above: loop on this side, then come home under the buttons.
        points.push({ x: right, y: high, s: far, r: -6, d: 0.9, ease: "sine.inOut", spin: true });
        points.push({ x: right, y: textMid, s: 0.55, r: -8, d: 0.8, ease: "sine.inOut" });
        points.push({ x: right, y: under(0.7), s: 0.7, r: -6, d: 0.7, ease: "sine.inOut" });
      }
    }
  } else {
    const low = under(0.55);
    if (kind === "arrive") {
      points.push({ x: w + lead.w, y: low, s: 0.5, r: -12, d: 0, ease: "none" });
      points.push({ x: w * 0.72, y: low, s: 0.62, r: -8, d: 0.9, ease: "sine.out" });
    } else {
      points.push({ x: lead.x + w * 0.05, y: Math.max(low, lead.y - h * 0.08), s: 0.8, r: 6, d: 0.45, ease: "power2.out", fromRest: true });
      points.push({ x: w + lead.w, y: low, s: 0.55, r: 12, d: 1.3, ease: "sine.in" });
      // Off one edge of the screen and back in from the other.
      points.push({ x: -lead.w, y: low, s: 0.55, r: -12, d: 0, ease: "none" });
      points.push({ x: w * 0.3, y: low, s: 0.62, r: -8, d: 1.2, ease: "sine.out", spin: true });
    }
  }
  points.push({ x: lead.x, y: lead.y, s: 1, r: 0, d: 0.85, ease: "power2.out" });

  return mirror ? points.map((p) => ({ ...p, x: w - p.x + (p.fromRest ? 2 * lead.x - w : 0), r: -p.r })) : points;
}

/**
 * The owl trio on the hero hills. They fly in and land when the page opens,
 * wave hello and watch the pointer. Every few seconds the main owl puts on a
 * show (dancing, looking around, or flying off with its two friends in tow),
 * and all three hop with excitement when a call to action is hovered.
 */
export function HeroOwls({ language, excited }: { language: Language; excited: boolean }) {
  const txt = copy[language];
  const [phase, setPhase] = useState<"arriving" | "greeting" | "ready">("arriving");
  const [flight, setFlight] = useState<OwlMood[]>(["flying", "flying", "flying"]);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const owlRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // Arrive from the side the reader starts on; read once so a language switch doesn't replay it.
  const fromLeft = useRef(language === "ar");
  const { ref, act, finish, perform } = useOwlShow<HTMLDivElement>({
    acts: ACTS,
    opening: OPENING,
    firstDelay: 1200,
    paused: phase !== "ready",
  });

  const setOwlMood = (index: number, mood: OwlMood) =>
    setFlight((current) => current.map((m, i) => (i === index ? mood : m)));

  /** Builds one flight for the whole flock. Resolves its timeline's callbacks to state. */
  const flyFlock = (kind: "arrive" | "fly", mirror: boolean, onDone: () => void) => {
    const slots = slotRefs.current;
    const owls = owlRefs.current;
    const shadows = shadowRefs.current;
    const hero = slots[LEADER]?.closest("section");
    if (!hero || slots.some((s) => !s) || owls.some((o) => !o) || shadows.some((s) => !s)) return null;
    const geometry = measure(hero, slots as HTMLElement[]);
    const points = plan(geometry, kind, mirror);
    const lead = geometry.rests[LEADER];
    const starts: number[] = [];
    let total = 0;
    for (const p of points) {
      starts.push(total);
      total += p.d;
    }

    const tl = gsap.timeline({ onComplete: onDone, delay: kind === "arrive" ? 0.25 : 0 });
    owls.forEach((owl, i) => {
      const shadow = shadows[i]!;
      const rest = geometry.rests[i];
      const { lag, offset } = FLOCK[i];
      const begin = kind === "fly" ? 0.2 : 0;
      let spun = 0;
      gsap.set(owl, { transformOrigin: "50% 100%" });
      gsap.set(shadow, { transformOrigin: "50% 50%" });

      if (kind === "fly") tl.to(owl, { scaleY: 0.88, duration: 0.2, ease: "power2.in" }, lag);
      else tl.set(shadow, { opacity: 0 }, 0);
      tl.call(() => setOwlMood(i, "flying"), [], begin + lag);
      // No shadow while airborne: it fades during the crouch, before lift-off.
      if (kind === "fly") tl.to(shadow, { opacity: 0, duration: 0.18 }, lag);

      points.forEach((p, k) => {
        const last = k === points.length - 1;
        let tx: number;
        let ty: number;
        if (last) {
          tx = rest.x;
          ty = rest.y;
        } else if (p.fromRest) {
          tx = rest.x + (p.x - lead.x);
          ty = rest.y + (p.y - lead.y);
        } else {
          tx = p.x + offset.x * p.s * lead.w;
          ty = p.y + offset.y * p.s * lead.h;
        }
        if (p.spin) spun -= 360;
        const vars = { x: tx - rest.x, y: ty - rest.y, scale: p.s, rotation: p.r + spun };
        const at = begin + starts[k] + lag;
        if (p.d === 0) tl.set(owl, { ...vars, opacity: 1 }, at);
        else tl.to(owl, { ...vars, duration: p.d, ease: p.ease }, at);
      });

      const landed = begin + total + lag;
      tl.fromTo(shadow, { scale: 0.6 }, { scale: 1, opacity: 1, duration: 0.15 }, landed - 0.05)
        .call(() => setOwlMood(i, "idle"), [], landed - 0.12)
        .set(owl, { rotation: 0 }, landed)
        .to(owl, { scaleY: 0.88, duration: 0.12, ease: "power2.out" }, landed)
        .to(owl, { scaleY: 1, duration: 0.45, ease: "elastic.out(1, 0.5)" }, landed + 0.12);
    });
    return tl;
  };

  // Arrival: the trio swoops in, lands one after another, and waves hello.
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(owlRefs.current, { opacity: 1 });
        gsap.timeline().call(() => setPhase("ready"));
        return;
      }
      const tl = flyFlock("arrive", fromLeft.current, () => {
        setPhase("greeting");
        gsap.delayedCall(1.9, () => setPhase("ready"));
      });
      if (!tl) {
        gsap.set(owlRefs.current, { opacity: 1 });
        gsap.timeline().call(() => setPhase("ready"));
      }
    });
    return () => ctx.revert();
    // Runs once on mount; flyFlock only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The flock flight act.
  useEffect(() => {
    if (act !== "fly") return;
    const ctx = gsap.context(() => {
      const tl = flyFlock("fly", Math.random() < 0.5, finish);
      if (!tl) gsap.delayedCall(0, finish);
    });
    return () => ctx.revert();
    // flyFlock only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, finish]);

  const moodFor = (index: number): OwlMood => {
    if (phase === "arriving" || act === "fly") return flight[index];
    if (phase === "greeting") return "wave";
    if (act === "party") return "party";
    if (act === "sudanese") return index === LEADER ? "sudanese" : "excited";
    if (act === "curious") return index === LEADER ? "curious" : "idle";
    return excited ? "excited" : "idle";
  };

  return (
    <div ref={ref} className="absolute bottom-[22px] left-1/2 z-[5] flex -translate-x-1/2 items-end gap-3 sm:gap-12">
      {FLOCK.map((owl, i) => {
        const leader = i === LEADER;
        const body = (
          <LivingOwl
            mood={moodFor(i)}
            restGaze={owl.gaze}
            badge={owl.badge}
            onActEnd={leader ? finish : undefined}
            shadow={false}
            className="w-full"
          />
        );
        return (
          <div
            key={i}
            ref={(node) => {
              slotRefs.current[i] = node;
            }}
            className={`relative ${owl.size}`}
            aria-hidden={leader ? undefined : true}
          >
            <span
              ref={(node) => {
                shadowRefs.current[i] = node;
              }}
              aria-hidden
              className="absolute bottom-[3%] left-[25.5%] h-[5.5%] w-[49%] rounded-[50%] bg-black/15"
            />
            {/* Hidden until the arrival flight places it, so it never pops in at rest first. */}
            <div
              ref={(node) => {
                owlRefs.current[i] = node;
              }}
              className="relative opacity-0"
            >
              {leader && (act === "sudanese" || act === "party") && (
                <p
                  aria-hidden
                  className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 animate-[hiw-pop_.3s_ease-out_both] whitespace-nowrap rounded-2xl bg-white px-3.5 py-1.5 font-fredoka text-base font-semibold text-[#D21034] shadow-lg"
                >
                  {txt.bubble} <Music2 className="inline h-4 w-4" />
                  <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white" />
                </p>
              )}
              {leader ? (
                <button
                  type="button"
                  onClick={() => perform("sudanese")}
                  aria-label={txt.dance}
                  className="block w-full cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007229]"
                >
                  {body}
                </button>
              ) : (
                body
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
