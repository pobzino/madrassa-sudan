"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import {
  FLAG_BLACK,
  FLAG_GREEN,
  FLAG_RED,
  FLAG_WHITE,
  OWL_BODY,
  OWL_CAP_BAND,
  OWL_CAP_TOP,
  OWL_FACE,
} from "@/lib/brand-morph-paths";

gsap.registerPlugin(MorphSVGPlugin);

type SudanFlagToAmalOwlProps = {
  className?: string;
  loop?: boolean;
  markOnly?: boolean;
  onComplete?: () => void;
  showReplay?: boolean;
};

/**
 * Brand-motion mark: the four shapes of the Sudanese flag become the four
 * structural shapes of the Amal owl. Extra facial details resolve only after
 * the flag geometry is visibly on its way to becoming the mascot.
 */
export function SudanFlagToAmalOwl({
  className = "",
  loop = false,
  markOnly = false,
  onComplete,
  showReplay = true,
}: SudanFlagToAmalOwlProps) {
  const scope = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    if (!scope.current) return;

    let reducedMotionTimer: number | null = null;
    let completionFrame: number | null = null;

    // Run consumers on the next frame so any animation they create belongs to
    // their own lifecycle, not this morph's GSAP context. Otherwise unmounting
    // the completed morph can revert a shared-element handoff in the parent.
    const notifyComplete = () => {
      completionFrame = window.requestAnimationFrame(() => onComplete?.());
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const context = gsap.context(() => {
      if (prefersReducedMotion) {
        gsap.set("[data-flag-outline]", { opacity: 0 });
        gsap.set("[data-morph-body]", {
          attr: { d: OWL_BODY },
          fill: "#D21034",
        });
        gsap.set("[data-morph-face]", {
          attr: { d: OWL_FACE },
          fill: "#E8334F",
        });
        gsap.set("[data-morph-band]", { attr: { d: OWL_CAP_BAND } });
        gsap.set("[data-morph-cap]", { attr: { d: OWL_CAP_TOP } });
        gsap.set("[data-owl-feature], [data-wordmark]", {
          opacity: 1,
          scale: 1,
          y: 0,
        });
        reducedMotionTimer = window.setTimeout(notifyComplete, 900);
        return;
      }

      const tl = gsap.timeline({
        paused: true,
        repeat: loop ? -1 : 0,
        repeatDelay: loop ? 1.4 : 0,
        onComplete: loop ? undefined : notifyComplete,
      });

      tl.set("[data-morph-body]", {
        attr: { d: FLAG_RED },
        fill: "#D21034",
      })
        .set("[data-morph-face]", {
          attr: { d: FLAG_WHITE },
          fill: "#FFFFFF",
        })
        .set("[data-morph-band]", { attr: { d: FLAG_BLACK } })
        .set("[data-morph-cap]", { attr: { d: FLAG_GREEN } })
        .set("[data-flag-outline]", { opacity: 0 })
        .set("[data-morph-shapes]", {
          opacity: 1,
          scale: 1,
          transformOrigin: "50% 50%",
        })
        .set("[data-owl-feature]", {
          opacity: 0,
          scale: 0.82,
          transformOrigin: "50% 50%",
        })
        .set("[data-wordmark]", { opacity: 0, y: 18 })
        .to(
          "[data-morph-body]",
          {
            morphSVG: { shape: OWL_BODY, map: "position" },
            duration: 1.55,
            ease: "power3.inOut",
          },
          0.12,
        )
        .to(
          "[data-morph-face]",
          {
            morphSVG: { shape: OWL_FACE, map: "position" },
            fill: "#E8334F",
            duration: 1.55,
            ease: "power3.inOut",
          },
          0.12,
        )
        .to(
          "[data-morph-band]",
          {
            morphSVG: { shape: OWL_CAP_BAND, map: "position" },
            duration: 1.55,
            ease: "power3.inOut",
          },
          0.12,
        )
        .to(
          "[data-morph-cap]",
          {
            morphSVG: { shape: OWL_CAP_TOP, map: "position" },
            duration: 1.55,
            ease: "power3.inOut",
          },
          0.12,
        )
        .to(
          "[data-owl-feature]",
          {
            opacity: 1,
            scale: 1,
            duration: 0.42,
            stagger: 0.035,
            ease: "power2.out",
          },
          1.64,
        )
        .to(
          "[data-wordmark]",
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "power2.out",
          },
          2.04,
        );

      timeline.current = tl;
      tl.play(0);
    }, scope);

    return () => {
      if (reducedMotionTimer !== null) {
        window.clearTimeout(reducedMotionTimer);
      }
      if (completionFrame !== null) {
        window.cancelAnimationFrame(completionFrame);
      }
      timeline.current = null;
      context.revert();
    };
  }, [loop, onComplete]);

  return (
    <div ref={scope} className={`flex flex-col items-center ${className}`}>
      <svg
        data-final-mark
        viewBox={markOnly ? "80 80 480 480" : "0 0 640 640"}
        className={`h-auto w-full ${markOnly ? "overflow-hidden" : "overflow-visible"}`}
        role="img"
        aria-labelledby="amal-morph-title amal-morph-description"
      >
        <title id="amal-morph-title">Sudanese flag morphing into the Amal owl</title>
        <desc id="amal-morph-description">
          The red, white, black, and green shapes of Sudan&apos;s flag transform
          into the Amal School owl mascot.
        </desc>

        <rect
          data-flag-outline
          opacity="0"
          x="80"
          y="200"
          width="480"
          height="240"
          rx="3"
          fill="none"
          stroke="#07162F"
          strokeWidth="4"
        />

        <g data-amal-owl-graphic>
          {/* Ear tufts appear behind the body as the flag resolves. */}
          <g data-owl-feature opacity="0">
            <ellipse cx="190" cy="205" rx="36" ry="49" fill="#A01028" />
            <ellipse cx="450" cy="205" rx="36" ry="49" fill="#A01028" />
          </g>

          {/* These are the four physical flag shapes that perform the morph. */}
          <g data-morph-shapes opacity="1">
            <path data-morph-body d={FLAG_RED} fill="#D21034" />
            <path data-morph-face d={FLAG_WHITE} fill="#FFFFFF" />
            <path data-morph-band d={FLAG_BLACK} fill="#171717" />
            <path data-morph-cap d={FLAG_GREEN} fill="#007229" />
          </g>

          <g data-owl-feature opacity="0">
            <ellipse cx="320" cy="438" rx="86" ry="59" fill="#FFF5F5" />
          </g>

          <g data-owl-feature opacity="0">
            <ellipse cx="257" cy="305" rx="57" ry="65" fill="#FFFFFF" />
            <ellipse cx="383" cy="305" rx="57" ry="65" fill="#FFFFFF" />
          </g>
          <g data-owl-feature opacity="0">
            <circle cx="272" cy="306" r="36" fill="#000000" />
            <circle cx="368" cy="306" r="36" fill="#000000" />
            <circle cx="287" cy="287" r="13" fill="#FFFFFF" />
            <circle cx="383" cy="287" r="13" fill="#FFFFFF" />
          </g>

          <g data-owl-feature opacity="0">
            <ellipse cx="320" cy="371" rx="28" ry="22" fill="#F59E0B" />
            <path d="M292 371Q320 412 348 371" fill="#E08A05" />
          </g>

          <g data-owl-feature opacity="0">
            <circle cx="320" cy="126" r="17" fill="#171717" />
            <path
              d="M320 126Q372 144 394 205"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <ellipse cx="400" cy="222" rx="19" ry="25" fill="#F59E0B" />
          </g>

          <g data-owl-feature opacity="0">
            <ellipse cx="264" cy="509" rx="30" ry="18" fill="#F59E0B" />
            <ellipse cx="376" cy="509" rx="30" ry="18" fill="#F59E0B" />
          </g>
        </g>

        <text
          data-wordmark
          visibility={markOnly ? "hidden" : undefined}
          x="320"
          y="598"
          textAnchor="middle"
          fill="#007229"
          fontFamily="var(--font-fredoka), Fredoka, sans-serif"
          fontSize="64"
          fontWeight="600"
          letterSpacing="-2"
          opacity="0"
        >
          amal school
        </text>
      </svg>

      {showReplay ? (
        <button
          type="button"
          onClick={() => timeline.current?.restart()}
          className="-mt-2 rounded-full bg-[#007229] px-5 py-2.5 font-fredoka text-sm font-semibold text-white shadow-lg shadow-[#007229]/20 transition hover:-translate-y-0.5 hover:bg-[#005C22] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007229]"
        >
          Replay morph
        </button>
      ) : null}
    </div>
  );
}
