"use client";

import { useEffect, useId, useRef } from "react";
import { gsap } from "gsap";
import { OWL_BODY, OWL_CAP_BAND, OWL_CAP_TOP, OWL_FACE } from "@/lib/brand-morph-paths";

export type OwlBadge = "math" | "english";

export type OwlMood = "idle" | "wave" | "read" | "excited" | "curious" | "flying" | "party" | "sudanese";

const BEAT = 60 / 112;
const PARTY_BEATS = 8;

type LivingOwlProps = {
  mood?: OwlMood;
  /** Where the owl looks when the pointer is quiet: -1..1 on each axis. */
  restGaze?: { x: number; y: number };
  /** Called when a performance (a dance or a look around) finishes. */
  onActEnd?: () => void;
  /** Draw the ground shadow under the feet. Turn off when the owl can fly away from it. */
  shadow?: boolean;
  /** A subject badge on the belly, like the Maths and English owls. */
  badge?: OwlBadge;
  className?: string;
};

// Eye whites are centred on these points; pupils travel around them.
const EYE_L = { x: 257, y: 305 };
const EYE_R = { x: 383, y: 305 };
const EYE_TOP = 305 - 66;
const LID_HEIGHT = 132;
const GAZE_X = 18;
const GAZE_Y = 20;
const DANCING = new Set<OwlMood>(["party", "sudanese"]);
// Moods that show happy closed eyes, so blinking is skipped.
const HAPPY_EYES = new Set<OwlMood>(["excited", "party", "sudanese"]);
// Wings hinge at the shoulders.
const SHOULDER_L = "182 318";
const SHOULDER_R = "458 318";

/**
 * The Amal owl, rigged from the same shapes as the brand mark so it can
 * breathe, blink, follow the pointer, react to what is on screen and dance.
 */
export function LivingOwl({ mood = "idle", restGaze = { x: 0.6, y: 0 }, onActEnd, shadow = true, badge, className = "" }: LivingOwlProps) {
  const root = useRef<SVGSVGElement>(null);
  const restGazeRef = useRef(restGaze);
  const moodRef = useRef(mood);
  const onActEndRef = useRef(onActEnd);
  // 0 = eyes open, 1 = fully closed. Blinks and moods both drive this.
  const lid = useRef({ v: 0 });
  const ids = useId().replace(/:/g, "");
  const clipL = `owl-eye-l-${ids}`;
  const clipR = `owl-eye-r-${ids}`;

  useEffect(() => {
    restGazeRef.current = restGaze;
    onActEndRef.current = onActEnd;
  });

  const applyLids = () => {
    const svg = root.current;
    if (!svg) return;
    const h = lid.current.v * LID_HEIGHT;
    svg.querySelectorAll<SVGRectElement>("[data-owl-lid]").forEach((rect) => rect.setAttribute("height", String(h)));
    // Closed eyes hide the eyeballs too; otherwise their edge shows as a faint ring around the lid.
    svg.querySelector("[data-owl-eyeballs]")?.setAttribute("opacity", lid.current.v > 0.96 ? "0" : "1");
  };

  /**
   * Swaps between open eyes and happy closed ^ ^ eyes in one frame. Fading
   * one into the other showed the arcs and the eyelid edge at the same time.
   */
  const setHappy = (on: boolean) => {
    const svg = root.current;
    if (!svg) return;
    gsap.killTweensOf(lid.current);
    lid.current.v = on ? 1 : 0;
    applyLids();
    gsap.set(svg.querySelectorAll("[data-owl-happy]"), { opacity: on ? 1 : 0 });
  };

  // Idle life: breathing, tassel, blinking and gaze.
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const q = gsap.utils.selector(svg);
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to(q("[data-owl-breath]"), {
        scaleY: 1.022,
        scaleX: 0.992,
        svgOrigin: "320 512",
        duration: 1.7,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
      gsap.to(q("[data-owl-tassel]"), {
        rotation: 6,
        svgOrigin: "320 126",
        duration: 2.1,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });

      let blinkTimer = 0;
      const blink = () => {
        // Only blink from fully open eyes, and never on top of another lid change.
        if (!HAPPY_EYES.has(moodRef.current) && lid.current.v === 0 && !gsap.isTweening(lid.current)) {
          const tl = gsap.timeline({ onComplete: () => setHappy(HAPPY_EYES.has(moodRef.current)) });
          tl.to(lid.current, { v: 1, duration: 0.07, ease: "power2.in", onUpdate: applyLids })
            .to(lid.current, { v: 0, duration: 0.12, ease: "power2.out", onUpdate: applyLids });
          if (Math.random() < 0.22) {
            tl.to(lid.current, { v: 1, duration: 0.06, ease: "power2.in", onUpdate: applyLids }, "+=0.08")
              .to(lid.current, { v: 0, duration: 0.12, ease: "power2.out", onUpdate: applyLids });
          }
        }
        blinkTimer = window.setTimeout(blink, 2200 + Math.random() * 3600);
      };
      blinkTimer = window.setTimeout(blink, 1400);

      const pupils = q("[data-owl-pupils]");
      const toX = gsap.quickTo(pupils, "x", { duration: 0.45, ease: "power3.out" });
      const toY = gsap.quickTo(pupils, "y", { duration: 0.45, ease: "power3.out" });
      let lastPointer = 0;
      let glanceTimer = 0;
      const lookAt = (nx: number, ny: number) => {
        toX(gsap.utils.clamp(-1, 1, nx) * GAZE_X);
        toY(gsap.utils.clamp(-1, 1, ny) * GAZE_Y);
      };

      const onPointer = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        lastPointer = performance.now();
        const box = svg.getBoundingClientRect();
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height * 0.42);
        const reach = Math.max(260, box.width * 1.4);
        lookAt(dx / reach, dy / reach);
      };

      // With no mouse (phones) or a quiet mouse, the owl glances around and
      // keeps coming back to whatever it is meant to be looking at.
      const glance = () => {
        if (performance.now() - lastPointer > 2600) {
          const rest = restGazeRef.current;
          const wander = Math.random() < 0.35;
          lookAt(
            wander ? rest.x + (Math.random() - 0.5) * 1.2 : rest.x,
            wander ? rest.y + (Math.random() - 0.5) * 0.9 : rest.y,
          );
        }
        glanceTimer = window.setTimeout(glance, 1400 + Math.random() * 2200);
      };
      glance();

      window.addEventListener("pointermove", onPointer, { passive: true });
      return () => {
        window.removeEventListener("pointermove", onPointer);
        window.clearTimeout(blinkTimer);
        window.clearTimeout(glanceTimer);
      };
    });

    media.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(q("[data-owl-pupils]"), { x: restGazeRef.current.x * GAZE_X, y: restGazeRef.current.y * GAZE_Y });
    });

    return () => media.revert();
    // setHappy and applyLids only touch refs, so it is safe to leave them out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Moods: each one is a short performance that settles into a held pose.
  useEffect(() => {
    moodRef.current = mood;
    const svg = root.current;
    if (!svg) return;
    const q = gsap.utils.selector(svg);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const d = reduce ? 0 : 1;
    const head = q("[data-owl-head]");
    const wingL = q("[data-owl-wing-left]");
    const wingR = q("[data-owl-wing-right]");
    const beak = q("[data-owl-beak-lower]");
    const hop = q("[data-owl-hop]");
    const confetti = q("[data-owl-confetti] > *");

    const ctx = gsap.context(() => {
      gsap.set(head, { svgOrigin: "320 340" });
      gsap.set(wingL, { svgOrigin: SHOULDER_L });
      gsap.set(wingR, { svgOrigin: SHOULDER_R });
      gsap.set(beak, { svgOrigin: "320 371" });
      gsap.set(hop, { svgOrigin: "320 524" });

      const settle = { duration: 0.45 * d, ease: "power2.out" };
      const pose = (p: { head?: number; headX?: number; wingL?: number; wingR?: number; beak?: number; happy?: boolean }) => {
        gsap.to(head, { rotation: p.head ?? 0, x: p.headX ?? 0, ...settle });
        gsap.to(wingL, { rotation: p.wingL ?? 0, ...settle });
        gsap.to(wingR, { rotation: p.wingR ?? 0, ...settle });
        gsap.to(beak, { scaleY: p.beak ?? 1, ...settle });
        gsap.to(hop, { y: 0, rotation: 0, ...settle });
        setHappy(!!p.happy);
      };

      const burst = () => {
        if (reduce) return;
        gsap.fromTo(
          confetti,
          { x: 0, y: 0, rotation: 0, opacity: 1, scale: 0.4 },
          {
            x: () => gsap.utils.random(-240, 240),
            y: () => gsap.utils.random(-270, -90),
            rotation: () => gsap.utils.random(-260, 260),
            scale: 1,
            duration: 0.9,
            ease: "power3.out",
            stagger: 0.012,
          },
        );
        gsap.to(confetti, { opacity: 0, y: "+=130", duration: 0.7, ease: "power1.in", delay: 0.85, stagger: 0.01 });
      };

      if (mood === "wave") {
        pose({ head: 7, wingR: -14, beak: 1.2 });
        gsap.timeline()
          .to(wingR, { rotation: -118, duration: 0.35 * d, ease: "back.out(1.6)" })
          .to(wingR, { rotation: -92, duration: 0.22 * d, ease: "sine.inOut", repeat: reduce ? 0 : 5, yoyo: true })
          .to(wingR, { rotation: -14, duration: 0.5 * d, ease: "power2.inOut" });
      } else if (mood === "read") {
        pose({ head: -6, wingR: -26 });
      } else if (mood === "excited") {
        // Can't sit still: little hops and fluttering wings until the mood changes.
        pose({ head: 5, wingL: 40, wingR: -40, beak: 1.4, happy: true });
        if (!reduce) {
          gsap.to(hop, { y: -14, duration: 0.24, ease: "power1.out", repeat: -1, yoyo: true, delay: 0.2 });
          gsap.fromTo(wingL, { rotation: 40 }, { rotation: 74, duration: 0.13, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 0.2 });
          gsap.fromTo(wingR, { rotation: -40 }, { rotation: -74, duration: 0.13, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 0.2 });
        }
      } else if (mood === "curious") {
        // "Hm?" A look to one side, then the other, then a happy double hop.
        const finish = () => onActEndRef.current?.();
        if (reduce) {
          pose({ head: 10 });
          gsap.delayedCall(1.2, finish);
          return;
        }
        pose({ head: 0 });
        gsap.timeline({ onComplete: finish })
          .to(head, { rotation: -14, x: -8, duration: 0.35, ease: "back.out(2)" }, 0.2)
          .to(wingL, { rotation: 18, duration: 0.3, ease: "power2.out" }, 0.2)
          .to({}, { duration: 0.7 })
          .to(head, { rotation: 14, x: 8, duration: 0.45, ease: "back.out(2)" })
          .to(wingL, { rotation: 0, duration: 0.3 }, "<")
          .to(wingR, { rotation: -18, duration: 0.3, ease: "power2.out" }, "<")
          .to({}, { duration: 0.7 })
          .add(() => {
            setHappy(true);
          })
          .to(head, { rotation: 0, x: 0, duration: 0.3, ease: "power2.out" })
          .to(wingR, { rotation: 0, duration: 0.3 }, "<")
          .to(hop, { y: -26, duration: 0.2, ease: "power2.out" })
          .to(hop, { y: 0, duration: 0.24, ease: "bounce.out" })
          .to(hop, { y: -18, duration: 0.18, ease: "power2.out" })
          .to(hop, { y: 0, duration: 0.22, ease: "bounce.out" })
          .add(() => {
            setHappy(false);
          }, "+=0.35")
          .to({}, { duration: 0.3 });
      } else if (mood === "flying") {
        // Big steady wingbeats, body leaning into the flight.
        pose({ head: -4, beak: 1.15 });
        if (!reduce) {
          gsap.fromTo(wingL, { rotation: 60 }, { rotation: 132, duration: 0.17, ease: "sine.inOut", repeat: -1, yoyo: true });
          gsap.fromTo(wingR, { rotation: -60 }, { rotation: -132, duration: 0.17, ease: "sine.inOut", repeat: -1, yoyo: true });
          gsap.to(hop, { y: -10, duration: 0.17, ease: "sine.inOut", repeat: -1, yoyo: true });
        }
      } else if (DANCING.has(mood)) {
        const finish = () => onActEndRef.current?.();
        if (reduce) {
          // A still celebratory pose instead of a routine.
          pose({ head: 6, wingL: 30, wingR: -138, beak: 1.4, happy: true });
          gsap.delayedCall(1.2, finish);
          return;
        }
        setHappy(true);
        gsap.to(beak, { scaleY: 1.45, duration: 0.2 });
        burst();
        const tl = gsap.timeline({ onComplete: finish });
        if (mood === "party") partyRoutine(tl, { hop, head, wingL, wingR });
        else sudaneseRoutine(tl, { hop, head, wingL, wingR }, setHappy);
        // Land in a proud pose.
        tl.to(hop, { y: 0, rotation: 0, duration: BEAT * 0.5, ease: "power2.out" })
          .to(head, { rotation: 8, x: 0, duration: BEAT * 0.5, ease: "power2.out" }, "<")
          .to(wingL, { rotation: 28, duration: BEAT * 0.5, ease: "back.out(2)" }, "<")
          .to(wingR, { rotation: -138, duration: BEAT * 0.5, ease: "back.out(2)" }, "<")
          .add(() => {
            setHappy(true);
          }, "<")
          .to({}, { duration: BEAT });
      } else {
        pose({});
      }
    }, svg);

    // Kill without reverting so the next mood starts from the current pose.
    return () => ctx.kill();
    // setHappy only touches refs, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  const confettiColors = ["#007229", "#F59E0B", "#D21034", "#FFFFFF", "#00913D", "#FBBF24"];

  return (
    <svg ref={root} viewBox="60 60 520 500" className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={clipL}>
          <ellipse cx={EYE_L.x} cy={EYE_L.y} rx="57" ry="65" />
        </clipPath>
        <clipPath id={clipR}>
          <ellipse cx={EYE_R.x} cy={EYE_R.y} rx="57" ry="65" />
        </clipPath>
      </defs>

      {/* Fades rather than popping, so an owl that lands or takes off looks grounded. */}
      <ellipse cx="320" cy="534" rx="128" ry="14" fill="#000" opacity={shadow ? 0.14 : 0} style={{ transition: "opacity 0.2s ease" }} />

      <g data-owl-confetti>
        {Array.from({ length: 22 }, (_, i) => (
          <rect
            key={i}
            x={314}
            y={250}
            width={i % 3 === 0 ? 14 : 10}
            height={i % 3 === 0 ? 8 : 16}
            rx="3"
            fill={confettiColors[i % confettiColors.length]}
            opacity="0"
          />
        ))}
      </g>

      <g data-owl-hop>
        <ellipse cx="264" cy="509" rx="30" ry="18" fill="#F59E0B" />
        <ellipse cx="376" cy="509" rx="30" ry="18" fill="#F59E0B" />

        <g data-owl-breath>
          <g data-owl-wing-left>
            <path d="M190 300C150 318 132 382 150 440C160 470 186 470 196 440Z" fill="#A01028" />
          </g>
          <g data-owl-wing-right>
            <path d="M450 300C490 318 508 382 490 440C480 470 454 470 444 440Z" fill="#A01028" />
          </g>

          <path d={OWL_BODY} fill="#D21034" />
          <ellipse cx="320" cy="438" rx="86" ry="59" fill="#FFF5F5" />
          {badge === "math" && (
            <text x="320" y="468" textAnchor="middle" fontSize="66" fontWeight="700" fill="#007229" fontFamily="var(--font-fredoka), Fredoka, sans-serif">
              123
            </text>
          )}
          {badge === "english" && (
            <g>
              <rect x="276" y="414" width="88" height="60" rx="9" fill="#007229" />
              <rect x="284" y="421" width="72" height="46" rx="5" fill="#FFF5F5" />
              <path d="M320 421V467" stroke="#007229" strokeWidth="5" />
            </g>
          )}

          <g data-owl-head>
            <ellipse cx="190" cy="205" rx="36" ry="49" fill="#A01028" />
            <ellipse cx="450" cy="205" rx="36" ry="49" fill="#A01028" />
            <path d={OWL_FACE} fill="#E8334F" />

            <g data-owl-eyeballs>
              <ellipse cx={EYE_L.x} cy={EYE_L.y} rx="57" ry="65" fill="#FFFFFF" />
              <ellipse cx={EYE_R.x} cy={EYE_R.y} rx="57" ry="65" fill="#FFFFFF" />
              <g data-owl-pupils>
                <circle cx={EYE_L.x + 12} cy={EYE_L.y + 1} r="36" fill="#000000" />
                <circle cx={EYE_R.x + 12} cy={EYE_R.y + 1} r="36" fill="#000000" />
                <circle cx={EYE_L.x + 27} cy={EYE_L.y - 18} r="13" fill="#FFFFFF" />
                <circle cx={EYE_R.x + 27} cy={EYE_R.y - 18} r="13" fill="#FFFFFF" />
              </g>
            </g>

            {/* Eyelids close from the top, clipped to each eye. */}
            {[
              { eye: EYE_L, clip: clipL },
              { eye: EYE_R, clip: clipR },
            ].map(({ eye, clip }) => (
              <g key={clip} clipPath={`url(#${clip})`}>
                <rect data-owl-lid x={eye.x - 60} y={EYE_TOP} width="120" height="0" fill="#E8334F" />
              </g>
            ))}

            <g data-owl-happy opacity="0" fill="none" stroke="#171717" strokeWidth="15" strokeLinecap="round">
              <path d="M222 322Q257 268 292 322" />
              <path d="M348 322Q383 268 418 322" />
            </g>

            <ellipse cx="320" cy="371" rx="28" ry="22" fill="#F59E0B" />
            <path data-owl-beak-lower d="M292 371Q320 412 348 371" fill="#E08A05" />

            <path d={OWL_CAP_BAND} fill="#171717" />
            <path d={OWL_CAP_TOP} fill="#007229" />
            <g data-owl-tassel>
              <circle cx="320" cy="126" r="17" fill="#171717" />
              <path d="M320 126Q372 144 394 205" fill="none" stroke="#F59E0B" strokeWidth="14" strokeLinecap="round" />
              <ellipse cx="400" cy="222" rx="19" ry="25" fill="#F59E0B" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

type Parts = { hop: Element[]; head: Element[]; wingL: Element[]; wingR: Element[] };

// Bouncy celebration: sway on the feet, alternate wings, hop on every beat.
function partyRoutine(tl: gsap.core.Timeline, { hop, head, wingL, wingR }: Parts) {
  for (let beat = 0; beat < PARTY_BEATS; beat++) {
    const at = beat * BEAT;
    const left = beat % 2 === 0;
    tl.to(hop, { y: -22, rotation: left ? -8 : 8, duration: BEAT * 0.4, ease: "power2.out" }, at)
      .to(hop, { y: 0, duration: BEAT * 0.6, ease: "bounce.out" }, at + BEAT * 0.4)
      .to(wingL, { rotation: left ? 140 : 24, duration: BEAT * 0.45, ease: "back.out(2)" }, at)
      .to(wingR, { rotation: left ? -24 : -140, duration: BEAT * 0.45, ease: "back.out(2)" }, at)
      .to(head, { rotation: left ? -7 : 7, duration: BEAT * 0.5, ease: "sine.inOut" }, at);
  }
}

/**
 * Moves inspired by Sudanese wedding dancing:
 * 1. one arm raised high, snapping, bouncing on the beat;
 * 2. the pigeon dance (رقصة الحمامة): wings spread, chest proud, the neck
 *    sliding side to side;
 * 3. a quick shoulder shimmy to finish.
 */
function sudaneseRoutine(
  tl: gsap.core.Timeline,
  { hop, head, wingL, wingR }: Parts,
  setHappy: (on: boolean) => void,
) {
  // 1. Raised-arm bounce: right wing up for four beats, then the left.
  for (let beat = 0; beat < 8; beat++) {
    const at = beat * BEAT;
    const rightUp = beat < 4;
    tl.to(hop, { y: -16, rotation: rightUp ? 3 : -3, duration: BEAT * 0.35, ease: "power2.out" }, at)
      .to(hop, { y: 0, duration: BEAT * 0.65, ease: "power2.in" }, at + BEAT * 0.35)
      .to(head, { rotation: rightUp ? 7 : -7, duration: BEAT * 0.25, ease: "power2.out" }, at)
      .to(head, { rotation: rightUp ? 2 : -2, duration: BEAT * 0.5, ease: "sine.inOut" }, at + BEAT * 0.25)
      // Snapping fingers: a quick shake of the raised wing on each half beat.
      .to(rightUp ? wingR : wingL, { rotation: rightUp ? -146 : 146, duration: BEAT * 0.18, ease: "power2.out" }, at)
      .to(rightUp ? wingR : wingL, { rotation: rightUp ? -128 : 128, duration: BEAT * 0.32, ease: "sine.inOut" }, at + BEAT * 0.18)
      .to(rightUp ? wingR : wingL, { rotation: rightUp ? -146 : 146, duration: BEAT * 0.18, ease: "power2.out" }, at + BEAT * 0.5)
      .to(rightUp ? wingR : wingL, { rotation: rightUp ? -128 : 128, duration: BEAT * 0.32, ease: "sine.inOut" }, at + BEAT * 0.68)
      .to(rightUp ? wingL : wingR, { rotation: rightUp ? 22 : -22, duration: BEAT * 0.4, ease: "power2.out" }, at);
  }

  // 2. Pigeon dance: wings out wide, eyes wide open, neck slides.
  const pigeon = 8 * BEAT;
  tl.add(() => {
    setHappy(false);
  }, pigeon)
    .to(wingL, { rotation: 84, duration: BEAT * 0.6, ease: "back.out(1.4)" }, pigeon)
    .to(wingR, { rotation: -84, duration: BEAT * 0.6, ease: "back.out(1.4)" }, pigeon)
    .to(hop, { rotation: -3, y: -4, duration: BEAT * 0.6, ease: "sine.out" }, pigeon);
  for (let beat = 0; beat < 8; beat++) {
    const at = pigeon + beat * BEAT;
    const toLeft = beat % 2 === 0;
    tl.to(head, { x: toLeft ? -18 : 18, rotation: 0, duration: BEAT * 0.9, ease: "sine.inOut" }, at)
      .to(hop, { y: -10, duration: BEAT * 0.5, ease: "sine.out" }, at)
      .to(hop, { y: -2, duration: BEAT * 0.5, ease: "sine.in" }, at + BEAT * 0.5)
      // Wing tips flutter like a dove's.
      .to(wingL, { rotation: 78, duration: BEAT * 0.25, ease: "sine.inOut", yoyo: true, repeat: 1 }, at + BEAT * 0.5)
      .to(wingR, { rotation: -78, duration: BEAT * 0.25, ease: "sine.inOut", yoyo: true, repeat: 1 }, at + BEAT * 0.5);
    if (beat % 2 === 1) tl.to(hop, { rotation: beat % 4 === 1 ? 4 : -4, duration: BEAT, ease: "sine.inOut" }, at);
  }

  // 3. Shoulder shimmy.
  const shimmy = 16 * BEAT;
  tl.add(() => {
    setHappy(true);
  }, shimmy)
    .to(head, { x: 0, duration: BEAT * 0.3, ease: "power2.out" }, shimmy)
    .to(hop, { rotation: 0, duration: BEAT * 0.3, ease: "power2.out" }, shimmy);
  for (let half = 0; half < 10; half++) {
    const at = shimmy + half * BEAT * 0.5;
    const up = half % 2 === 0;
    tl.to(wingL, { rotation: up ? 34 : 12, duration: BEAT * 0.25, ease: "power1.inOut" }, at)
      .to(wingR, { rotation: up ? -12 : -34, duration: BEAT * 0.25, ease: "power1.inOut" }, at)
      .to(hop, { y: up ? -7 : 0, duration: BEAT * 0.25, ease: "power1.out" }, at)
      .to(head, { rotation: up ? 4 : -4, duration: BEAT * 0.25, ease: "power1.inOut" }, at);
  }
}
