"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  GamepadIcon,
  TrophyIcon,
  VideoIcon,
} from "@/components/illustrations";
import { SudanFlagToAmalOwl } from "@/components/brand/SudanFlagToAmalOwl";

gsap.registerPlugin(ScrollTrigger);

type PortalStep = {
  num: string;
  title: string;
};

type OwlLessonPortalProps = {
  isRtl: boolean;
  label: string;
  title: string;
  subtitle: string;
  steps: PortalStep[];
};

const cardStyles = [
  { color: "#007229", surface: "#F0FDF4", rotate: -8 },
  { color: "#F59E0B", surface: "#FFFBEB", rotate: 1 },
  { color: "#D21034", surface: "#FEF2F2", rotate: 9 },
];
const cardIcons = [VideoIcon, GamepadIcon, TrophyIcon];

/**
 * A cinematic bridge into the real lesson section. It uses the actual Amal
 * brand mark as page architecture: lesson cards sit behind the mascot, the
 * owl rises to meet the learner, and its body becomes the next section.
 */
export function OwlLessonPortal({
  isRtl,
  label,
  title,
  subtitle,
  steps,
}: OwlLessonPortalProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!track || !stage) return;

    const media = gsap.matchMedia();
    media.add({ reduceMotion: "(prefers-reduced-motion: reduce)", animate: "(prefers-reduced-motion: no-preference)" }, (context) => {
      const owl = stage.querySelector<HTMLElement>("[data-portal-owl]");
      const portal = stage.querySelector<HTMLElement>("[data-portal-window]");
      const story = stage.querySelector<HTMLElement>("[data-portal-story]");
      const cards = gsap.utils.toArray<HTMLElement>("[data-portal-card]", stage);
      const eyes = stage.querySelector<SVGElement>("[data-owl-eyes]");
      const tassel = stage.querySelector<SVGElement>("[data-owl-tassel]");

      if (!owl || !portal || !story) return;

      const cardX = (index: number) => {
        const spread = Math.min(window.innerWidth * (window.innerWidth < 640 ? 0.27 : 0.25), 310);
        const positions = [-spread, 0, spread];
        return positions[isRtl ? 2 - index : index];
      };
      const cardRotation = (index: number) =>
        cardStyles[isRtl ? 2 - index : index].rotate;

      if (context.conditions?.reduceMotion) {
        gsap.set(stage, { backgroundColor: "#FEF2F2" });
        gsap.set(owl, { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set(cards, {
          autoAlpha: 1,
          x: cardX,
          y: (index) => (index === 1 ? -20 : 8),
          rotation: cardRotation,
          scale: 1,
        });
        gsap.set(story, { autoAlpha: 1, y: 0 });
        gsap.set(portal, { autoAlpha: 0 });
        return;
      }

      gsap.set(owl, {
        y: () => Math.min(window.innerHeight * 0.18, 160),
        scale: 1,
        transformOrigin: "50% 55%",
      });
      gsap.set(cards, {
        autoAlpha: 1,
        x: cardX,
        y: 64,
        rotation: cardRotation,
        scale: 0.82,
      });
      gsap.set(story, { autoAlpha: 0, y: 42, scale: 0.96 });
      gsap.set(portal, { autoAlpha: 0, scale: 0.18 });
      gsap.set(eyes, { transformOrigin: "center center" });
      gsap.set(tassel, { transformOrigin: "320px 126px" });

      gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: track,
          start: () => `top top+=${window.innerWidth < 640 ? 56 : 64}`,
          end: "bottom bottom",
          scrub: 0.7,
          invalidateOnRefresh: true,
        },
      })
        .to(cards, {
          autoAlpha: 1,
          x: cardX,
          y: (index) => (index === 1 ? -24 : 8),
          rotation: cardRotation,
          scale: 1,
          stagger: 0.03,
          duration: 0.2,
          ease: "back.out(1.15)",
        }, 0)
        .to(owl, {
          y: 0,
          duration: 0.3,
          ease: "power3.out",
        }, 0.06)
        .to(eyes, { scaleY: 0.06, duration: 0.025, ease: "power2.in" }, 0.29)
        .to(eyes, { scaleY: 1, duration: 0.04, ease: "power2.out" }, 0.315)
        .to(tassel, { rotation: 10, duration: 0.14, ease: "sine.inOut" }, 0.22)
        .to(tassel, { rotation: -4, duration: 0.13, ease: "sine.inOut" }, 0.36)
        .to(cards, {
          autoAlpha: 0,
          y: (index) => -120 - index * 20,
          scale: 1.04,
          duration: 0.18,
        }, 0.43)
        .to(stage, { backgroundColor: "#D21034", duration: 0.22 }, 0.46)
        .to(owl, {
          scale: () => (window.innerWidth < 640 ? 2.45 : 2.15),
          y: () => -window.innerHeight * 0.38,
          duration: 0.3,
          ease: "power2.in",
        }, 0.44)
        .to(owl, { autoAlpha: 0, duration: 0.1 }, 0.57)
        .to(story, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.16,
          ease: "power2.out",
        }, 0.62)
        // Hold the heading through the handoff, avoiding a blank pinned screen.
        .to(story, { autoAlpha: 1, duration: 0.3 }, 0.78);
    }, stage);

    return () => media.revert();
  }, [isRtl]);

  return (
    <section
      id="sims"
      className="relative isolate scroll-mt-14 bg-[#007229] sm:scroll-mt-16"
      aria-label={title}
      data-owl-lesson-portal
    >
      <div className="sr-only">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div ref={trackRef} data-portal-track className="relative h-[240svh] sm:h-[260svh]">
        <div
          ref={stageRef}
          data-portal-stage
          className="sticky top-14 mx-auto h-[calc(100svh-3.5rem)] max-w-[100rem] overflow-hidden border-x-[10px] border-[#007229] bg-[#FEF2F2] sm:top-16 sm:h-[calc(100svh-4rem)] sm:border-x-[18px]"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-55"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(circle at 14% 18%, rgba(210,16,52,.12) 0 4px, transparent 5px), radial-gradient(circle at 86% 22%, rgba(0,114,41,.14) 0 3px, transparent 4px), radial-gradient(circle at 72% 68%, rgba(245,158,11,.16) 0 3px, transparent 4px)",
              backgroundSize: "150px 150px, 190px 190px, 110px 110px",
            }}
          />

          <div className="absolute left-1/2 top-[17%] z-10 sm:top-[15%]" aria-hidden="true">
            {steps.slice(0, 3).map((step, index) => {
              const Icon = cardIcons[index];
              const style = cardStyles[index];

              return (
                <div
                  key={`${step.num}-${step.title}`}
                  data-portal-card
                  className="absolute left-0 top-0 w-[clamp(8.8rem,22vw,14.5rem)] -translate-x-1/2 overflow-hidden rounded-[1.6rem] border border-slate-900/10 bg-white p-3.5 shadow-[0_22px_0_rgba(0,92,34,.12),0_34px_70px_rgba(15,23,42,.17)] sm:rounded-[2rem] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
                      style={{ backgroundColor: style.surface, color: style.color }}
                    >
                      <Icon className="h-7 w-7 sm:h-9 sm:w-9" />
                    </span>
                    <span className="font-fredoka text-[0.65rem] font-bold tracking-[0.14em] text-slate-400 sm:text-xs">
                      {step.num.padStart(2, "0")}
                    </span>
                  </div>
                  <span className="mt-5 block h-1.5 w-10 rounded-full" style={{ backgroundColor: style.color }} />
                  <span className="mt-2.5 block text-xs font-extrabold leading-snug text-slate-900 sm:text-base">
                    {step.title}
                  </span>
                  <span className="mt-4 block h-2 w-[78%] rounded-full bg-slate-100" />
                  <span className="mt-2 block h-2 w-[56%] rounded-full bg-slate-100" />
                </div>
              );
            })}
          </div>

          <div
            data-portal-owl
            className="pointer-events-none absolute bottom-[-4%] left-1/2 z-20 w-[150vw] max-w-none -translate-x-1/2 will-change-transform sm:bottom-[-34%] sm:w-[min(92vw,64rem)]"
            aria-hidden="true"
          >
            <SudanFlagToAmalOwl
              animated={false}
              markOnly
              showReplay={false}
              className="w-full drop-shadow-[0_36px_32px_rgba(83,8,22,.22)]"
            />
          </div>

          <div
            data-portal-story
            className="pointer-events-none absolute inset-x-4 top-1/2 z-30 -translate-y-1/2 text-center text-white"
            aria-hidden="true"
          >
            <p className="font-fredoka text-xs font-bold tracking-[0.16em] text-white/75 sm:text-sm">
              {label}
            </p>
            <h2 className="mx-auto mt-3 max-w-4xl font-fredoka text-4xl font-semibold leading-[0.98] text-balance sm:text-6xl lg:text-7xl">
              {title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-relaxed text-white/85 sm:text-lg">
              {subtitle}
            </p>
          </div>

          <div
            data-portal-window
            className="pointer-events-none absolute left-1/2 top-[83%] z-40 aspect-square w-[16vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#F0FDF4_64%,#ECFDF5_100%)] will-change-transform"
            aria-hidden="true"
          />

        </div>
      </div>
    </section>
  );
}
