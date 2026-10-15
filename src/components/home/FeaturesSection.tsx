"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { GamepadIcon, RobotIcon, TrophyIcon, VideoIcon } from "@/components/illustrations";
import { SectionScene } from "@/components/dashboard/DashboardScenes";
import { LivingOwl, type OwlMood } from "@/components/brand/LivingOwl";

type Feature = { title: string; desc: string; iconType: string };

const FeatureIcon = ({ type, className }: { type: string; className?: string }) => {
  switch (type) {
    case "video": return <VideoIcon className={className} />;
    case "robot": return <RobotIcon className={className} />;
    case "gamepad": return <GamepadIcon className={className} />;
    case "trophy": return <TrophyIcon className={className} />;
    default: return null;
  }
};

const TONES = [
  { chip: "bg-emerald-50 text-[#007229] ring-emerald-100", bar: "bg-[#007229]" },
  { chip: "bg-red-50 text-[#D21034] ring-red-100", bar: "bg-[#D21034]" },
  { chip: "bg-emerald-50 text-[#005C22] ring-emerald-100", bar: "bg-[#00913D]" },
  { chip: "bg-amber-50 text-amber-600 ring-amber-100", bar: "bg-amber-400" },
];

// What the owl does on each card it visits, and for how long (seconds).
const PERCH_ACTS: { mood: OwlMood; hold: number }[] = [
  { mood: "wave", hold: 1.9 },
  { mood: "curious", hold: 3.2 },
  { mood: "excited", hold: 1.6 },
  { mood: "party", hold: 5.2 },
];

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

/**
 * "Learn in a fun way", with an owl that tours the cards: it swoops in,
 * lands on each card (which lights up) to do a trick, rolls and flips
 * between them and flies off, then comes back for another tour. On desktop
 * it loops through the sky beside the heading and keeps to the lane above
 * the cards; with the cards in a grid it circles all of them, perching in
 * each card's empty corner beside the icon so it never sits on the words.
 */
export function FeaturesSection({
  title,
  highlight,
  items,
  isRtl,
}: {
  title: string;
  highlight: string;
  items: Feature[];
  isRtl: boolean;
}) {
  const [mood, setMood] = useState<OwlMood>("flying");
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const owlRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rtlRef = useRef(isRtl);

  useEffect(() => {
    rtlRef.current = isRtl;
  }, [isRtl]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const heading = headingRef.current;
    const owl = owlRef.current;
    if (!inView || !stage || !heading || !owl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = cardRefs.current.filter((card): card is HTMLDivElement => !!card);
    const visit = (card: HTMLDivElement | undefined, on: boolean) => card?.setAttribute("data-owl-visit", on ? "true" : "false");
    let tour: gsap.core.Timeline | null = null;
    let restTimer = 0;

    const buildTour = () => {
      const origin = stage.getBoundingClientRect();
      const rel = (r: DOMRect): Box => ({
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: r.top - origin.top,
        bottom: r.bottom - origin.top,
        width: r.width,
        height: r.height,
      });
      const range = document.createRange();
      range.selectNodeContents(heading);
      const head = rel(range.getBoundingClientRect());
      const boxes = cards.map((card) => rel(card.getBoundingClientRect()));
      if (!boxes.length) return null;

      const rowTop = Math.min(...boxes.map((b) => b.top));
      const multiRow = boxes.some((b) => Math.abs(b.top - rowTop) > 4);
      if (multiRow) return buildGridTour(origin.width, boxes, rowTop);
      // One row (desktop): only the lane above the cards is clear to land in.
      let perches = boxes
        .map((box, i) => ({ box, card: cards[i] }))
        .filter(({ box }) => Math.abs(box.top - rowTop) < 4)
        .sort((a, b) => a.box.left - b.box.left);
      if (rtlRef.current) perches = perches.reverse();

      const ow = owl.offsetWidth;
      const oh = owl.offsetHeight;
      const lane = rowTop - head.bottom;
      // Shrink the owl if the lane is tight, so it never touches the heading.
      const s = Math.max(0.5, Math.min(1, (lane - 24) / oh));
      const w = origin.width;
      const skim = rowTop - 14; // feet height while flying along the lane
      // Transform origin is the centre, so place the owl by where its feet go.
      const at = (fx: number, fy: number) => ({ x: fx - ow / 2, y: fy - (oh * s) / 2 - oh / 2 });
      const from = rtlRef.current ? w + ow : -ow - 40;
      const exit = rtlRef.current ? -ow - 40 : w + ow;

      const tl = gsap.timeline();
      tl.set(owl, { ...at(from, skim), scale: s, rotation: 0, opacity: 1, transformOrigin: "50% 50%" }).call(() => setMood("flying"));

      // A loop-the-loop in the open sky beside the heading, when there's room.
      const radius = Math.min(48, head.height * 0.9);
      const sideRoom = rtlRef.current ? w - head.right : head.left;
      if (sideRoom > 2 * radius + ow * s + 24) {
        const cx = rtlRef.current ? head.right + sideRoom / 2 : sideRoom / 2;
        const cy = Math.max(radius + (oh * s) / 2 + 4, head.top + head.height / 2);
        const centre = (x: number, y: number) => ({ x: x - ow / 2, y: y - oh / 2 });
        tl.to(owl, { ...centre(cx, cy + radius), rotation: 0, duration: 1.0, ease: "sine.out" });
        const spin = { a: 0 };
        const dir = rtlRef.current ? -1 : 1;
        tl.to(spin, {
          a: 1,
          duration: 1.2,
          ease: "sine.inOut",
          onUpdate: () => {
            const theta = Math.PI / 2 - dir * spin.a * Math.PI * 2;
            gsap.set(owl, { ...centre(cx + radius * Math.cos(theta), cy + radius * Math.sin(theta)), rotation: -dir * spin.a * 360 });
          },
        });
        tl.set(owl, { rotation: 0 });
      }

      perches.forEach(({ box, card }, k) => {
        const act = PERCH_ACTS[k % PERCH_ACTS.length];
        const fx = box.left + box.width * (rtlRef.current ? 0.28 : 0.72);
        // Cards lift 6px when visited, so land a touch higher to stay on the edge.
        const perchY = box.top - 6;
        const trick = k % 2 === 0 ? "roll" : "flip";
        tl.to(owl, {
          ...at(fx, skim),
          duration: k === 0 ? 0.9 : 0.75,
          ease: "sine.inOut",
          rotation: trick === "roll" ? `+=${rtlRef.current ? -360 : 360}` : 0,
        });
        if (trick === "flip") {
          tl.to(owl, { scaleX: -s, duration: 0.18, ease: "power1.in" }, "<0.15").to(owl, { scaleX: s, duration: 0.18, ease: "power1.out" }, ">");
        }
        tl.set(owl, { rotation: 0 })
          .to(owl, { ...at(fx, perchY), duration: 0.22, ease: "power2.in" })
          .call(() => {
            visit(card, true);
            setMood(act.mood);
          })
          .to(owl, { scaleY: s * 0.88, duration: 0.1, ease: "power2.out" })
          .to(owl, { scaleY: s, duration: 0.35, ease: "elastic.out(1, 0.5)" })
          .to({}, { duration: act.hold })
          .call(() => {
            visit(card, false);
            setMood("flying");
          })
          .to(owl, { ...at(fx, skim), duration: 0.22, ease: "power2.out" });
      });

      // Exit with one more roll.
      tl.to(owl, { ...at(exit, skim), rotation: rtlRef.current ? -360 : 360, duration: 1.1, ease: "sine.in" })
        .set(owl, { opacity: 0, rotation: 0 });
      return tl;
    };

    /**
     * Cards in a grid (phones and tablets): fly a circuit round all of them
     * (across, down, back, up) and perch in each card's empty top corner
     * beside its icon, so the owl never sits on the words.
     */
    const buildGridTour = (w: number, boxes: Box[], rowTop: number) => {
      const rtl = rtlRef.current;
      const ow = owl.offsetWidth;
      const oh = owl.offsetHeight;
      const chip = cards[0]?.querySelector<HTMLElement>("[data-feature-chip]");
      const chipTop = chip?.offsetTop ?? 16;
      const chipH = chip?.offsetHeight ?? 44;
      const s = Math.max(0.5, Math.min(1, (chipH + 10) / oh));
      const at = (fx: number, fy: number) => ({ x: fx - ow / 2, y: fy - (oh * s) / 2 - oh / 2 });

      const rows = new Map<number, { box: Box; card: HTMLDivElement }[]>();
      boxes.forEach((box, i) => {
        const key = Math.round(box.top);
        rows.set(key, [...(rows.get(key) ?? []), { box, card: cards[i] }]);
      });
      // Clockwise in LTR (anticlockwise in RTL): along the top row, then back along the next.
      const ordered = [...rows.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([, row], r) => {
          const sorted = row.sort((a, b) => a.box.left - b.box.left);
          const forwards = rtl ? sorted.reverse() : sorted;
          return r % 2 === 0 ? forwards : forwards.reverse();
        });

      const inset = 14;
      const perch = (box: Box) => ({
        x: rtl ? box.left + inset + (ow * s) / 2 : box.right - inset - (ow * s) / 2,
        // Feet on the line of the icon; cards lift 6px when visited.
        y: box.top + chipTop + chipH - 6,
      });
      const skim = rowTop - 14;
      const first = perch(ordered[0].box);

      const tl = gsap.timeline();
      tl.set(owl, { ...at(rtl ? -ow : w + ow, skim), scale: s, rotation: 0, opacity: 1, transformOrigin: "50% 50%" })
        .call(() => setMood("flying"))
        .to(owl, { ...at(first.x, skim), rotation: rtl ? 360 : -360, duration: 0.9, ease: "sine.inOut" })
        .set(owl, { rotation: 0 });

      let previous = { x: first.x, y: skim };
      ordered.forEach(({ box, card }, k) => {
        const act = PERCH_ACTS[k % PERCH_ACTS.length];
        const spot = perch(box);
        const vertical = Math.abs(spot.y - previous.y) > Math.abs(spot.x - previous.x);
        // Barrel rolls across, flips up and down; quick legs over the cards.
        tl.to(owl, {
          ...at(spot.x, spot.y),
          duration: k === 0 ? 0.35 : 0.6,
          ease: k === 0 ? "power2.in" : "sine.inOut",
          rotation: !vertical && k > 0 ? `+=${spot.x > previous.x ? 360 : -360}` : 0,
        });
        if (vertical) {
          tl.to(owl, { scaleX: -s, duration: 0.15, ease: "power1.in" }, "<0.15").to(owl, { scaleX: s, duration: 0.15, ease: "power1.out" }, ">");
        }
        tl.set(owl, { rotation: 0 })
          .call(() => {
            visit(card, true);
            setMood(act.mood);
          })
          .to(owl, { scaleY: s * 0.88, duration: 0.1, ease: "power2.out" })
          .to(owl, { scaleY: s, duration: 0.35, ease: "elastic.out(1, 0.5)" })
          .to({}, { duration: act.hold })
          .call(() => {
            visit(card, false);
            setMood("flying");
          });
        previous = spot;
      });

      // Back up to the lane and away.
      tl.to(owl, { ...at(first.x, skim), duration: 0.7, ease: "sine.inOut" })
        .to(owl, { ...at(rtl ? w + ow : -ow, skim), rotation: rtl ? 360 : -360, duration: 0.9, ease: "sine.in" })
        .set(owl, { opacity: 0, rotation: 0 });
      return tl;
    };

    const run = () => {
      tour = buildTour();
      tour?.eventCallback("onComplete", () => {
        restTimer = window.setTimeout(run, 6000 + Math.random() * 4000);
      });
    };
    const startTimer = window.setTimeout(run, 500);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(restTimer);
      tour?.kill();
      gsap.set(owl, { opacity: 0 });
      cards.forEach((card) => visit(card, false));
    };
  }, [inView]);

  return (
    <section ref={sectionRef} id="features" className="relative overflow-hidden py-12 sm:py-20">
      <SectionScene sky="linear-gradient(180deg,#eef5ff 0%,#eef7ef 100%)" hill="#dcefdd" hill2="#cbe9d1" clouds />

      <div ref={stageRef} className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        {/* Leaves a lane above the cards for the owl to land in. */}
        <div className="mb-16 text-center sm:mb-28">
          <h2 ref={headingRef} className="inline font-fredoka text-3xl font-semibold text-gray-900 sm:text-4xl md:text-5xl">
            {title} <span className="text-[#007229]">{highlight}</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {items.map((feature, i) => {
            const tone = TONES[i % TONES.length];
            return (
              <div
                key={i}
                ref={(node) => {
                  cardRefs.current[i] = node;
                }}
                data-owl-visit="false"
                className="group relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl data-[owl-visit=true]:-translate-y-1.5 data-[owl-visit=true]:shadow-xl data-[owl-visit=true]:ring-2 data-[owl-visit=true]:ring-amber-300 sm:rounded-3xl sm:p-7"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 ${tone.bar} origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 group-data-[owl-visit=true]:scale-x-100 rtl:origin-right`}
                />
                <div
                  data-feature-chip
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-data-[owl-visit=true]:-rotate-6 group-data-[owl-visit=true]:scale-110 sm:mb-6 sm:h-14 sm:w-14 sm:rounded-2xl ${tone.chip}`}
                >
                  <FeatureIcon type={feature.iconType} className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
                <h3 className="mb-1 font-fredoka text-base font-semibold text-gray-900 sm:mb-2 sm:text-xl">{feature.title}</h3>
                <p className="line-clamp-4 text-xs leading-relaxed text-gray-600 sm:line-clamp-none sm:text-base">{feature.desc}</p>
              </div>
            );
          })}
        </div>

        <div ref={owlRef} aria-hidden className="pointer-events-none absolute left-0 top-0 z-20 w-14 opacity-0 sm:w-20">
          <LivingOwl mood={mood} restGaze={{ x: 0, y: 0.4 }} shadow={false} className="w-full" />
        </div>
      </div>
    </section>
  );
}
