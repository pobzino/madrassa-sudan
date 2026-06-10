"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { OwlExcited } from "@/components/illustrations";
import type {
  SubjectLearningPath,
  TreeWeek,
  TreeStep,
} from "@/lib/lessons/useLearningPath";

const translations = {
  ar: { startTest: "ابدأ الاختبار", retake: "أعد المحاولة", passed: "ناجح", passMark: "80% للنجاح", open: "افتح", test: "اختبار" },
  en: { startTest: "Start test", retake: "Retake", passed: "Passed", passMark: "80% to pass", open: "Open", test: "Test" },
};

type TreeNode =
  | { kind: "lesson"; id: string; step: TreeStep }
  | { kind: "test"; id: string; week: TreeWeek };

// Cleaner serpentine: 2 nodes per row, generous spacing. Flows across a row,
// curves down, then back — "horizontal, then down". The diamond test node marks
// the end of each week, so no separate week chips are needed. The width is
// measured at runtime so the path spans the full container.
const PER_ROW = 2;
const ROW_H = 170;
const TOP = 110;
const BOTTOM = 64;

const LockIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);
const CheckIcon = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const StarIcon = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);
const PlayIcon = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const PencilIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
  </svg>
);

function NodeDisc({ node, isCurrent }: { node: TreeNode; isCurrent: boolean }) {
  if (node.kind === "lesson") {
    const { state } = node.step;
    const completed = state === "completed";
    const locked = state === "locked";
    return (
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md border-b-4 transition-transform ${
          completed
            ? "bg-emerald-500 border-emerald-700 text-white"
            : locked
              ? "bg-gray-200 border-gray-300 text-gray-400"
              : "bg-[#007229] border-[#005C22] text-white hover:scale-110"
        } ${isCurrent ? "ring-4 ring-[#007229]/30" : ""}`}
      >
        {completed ? <CheckIcon /> : locked ? <LockIcon /> : <PlayIcon className="w-7 h-7 ml-0.5" />}
      </div>
    );
  }
  const s = node.week.testState;
  const passed = s === "passed";
  const failed = s === "failed";
  const locked = s === "locked";
  return (
    <div
      className={`w-16 h-16 rounded-2xl rotate-45 flex items-center justify-center shadow-md border-b-4 transition-transform ${
        passed
          ? "bg-amber-400 border-amber-600 text-white"
          : failed
            ? "bg-red-500 border-red-700 text-white hover:scale-110"
            : locked
              ? "bg-gray-200 border-gray-300 text-gray-400"
              : "bg-amber-400 border-amber-600 text-white hover:scale-110"
      } ${isCurrent ? "ring-4 ring-amber-300/50" : ""}`}
    >
      <span className="-rotate-45">{passed ? <StarIcon /> : locked ? <LockIcon /> : <PencilIcon />}</span>
    </div>
  );
}

/**
 * Smooth (Catmull-Rom) curve through all points → rounded serpentine turns.
 * `reach` caps how far each control point can extend from its node. Without it,
 * the tangent at a U-turn (computed from the far-apart neighbours) flings the
 * control point hundreds of px past the node, so the curve overshoots the SVG
 * bounds and gets clipped ("cut" road). Capping keeps turns tight + on-screen.
 */
function smoothPath(pts: { x: number; y: number }[], reach: number): string {
  if (pts.length < 2) return "";
  const cap = (v: number) => Math.max(-reach, Math.min(reach, v));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + cap((p2.x - p0.x) / 6);
    const c1y = p1.y + cap((p2.y - p0.y) / 6);
    const c2x = p2.x - cap((p3.x - p1.x) / 6);
    const c2y = p2.y - cap((p3.y - p1.y) / 6);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function LearningPathTree({
  path,
  language,
  currentStepId,
}: {
  path: SubjectLearningPath;
  language: "ar" | "en";
  currentStepId?: string | null;
}) {
  const t = translations[language];
  const current = currentStepId ?? path.currentStepId;

  // The owl follows the tapped node; until the student taps, it sits on the
  // current progress node. A tap selects a node (owl glides there) and reveals
  // an Open button — it does not navigate immediately, so the owl can glide
  // backward to a re-selected earlier lesson.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The node the owl is gliding FROM (set when the student taps a new node).
  const [fromId, setFromId] = useState<string | null>(null);
  const selId = selectedId ?? current;

  // Measure the container so the path spans its full width responsively.
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 880);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const W = width;
  // Derive the layout from the label width so node labels always stay on-screen
  // and never overlap, from phone widths up to desktop.
  const labelWidth = Math.min(180, Math.max(96, W * 0.42));
  const LEFT = labelWidth / 2 + 10; // keep edge-column labels fully inside
  const COL_GAP = (W - 2 * LEFT) / (PER_ROW - 1);

  const nodes: TreeNode[] = [];
  for (const week of path.weeks) {
    for (const step of week.steps) nodes.push({ kind: "lesson", id: step.id, step });
    if (week.testAssignmentId) nodes.push({ kind: "test", id: `test-${week.id}`, week });
  }

  const placed = nodes.map((node, i) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    const leftToRight = row % 2 === 0;
    const x = LEFT + (leftToRight ? col : PER_ROW - 1 - col) * COL_GAP;
    const y = TOP + row * ROW_H;
    return { node, x, y };
  });

  const rows = Math.max(1, Math.ceil(nodes.length / PER_ROW));
  const totalH = TOP + (rows - 1) * ROW_H + BOTTOM;
  // Cap the turn radius so curves stay inside the node insets (and thus on-screen).
  const turnReach = Math.min(80, Math.max(28, LEFT - 8));
  const d = smoothPath(placed.map((p) => ({ x: p.x, y: p.y })), turnReach);

  // Glide offset: from wherever the owl was (previously selected node, or the
  // node before the current one on first load) to the selected node. A CSS
  // keyframe animates from this offset to zero; the owl's `key` replays it.
  const selIndex = placed.findIndex((p) => p.node.id === selId);
  // On first load there's no explicit "from", so glide from the node before the
  // current one (a forward entrance); after a tap, fromId is the prior selection.
  const fromNodeId = fromId ?? (selIndex > 0 ? placed[selIndex - 1].node.id : null);
  const fromPlaced = fromNodeId ? placed.find((p) => p.node.id === fromNodeId) ?? null : null;
  const selPlaced = selIndex >= 0 ? placed[selIndex] : null;
  const owlDx = fromPlaced && selPlaced ? fromPlaced.x - selPlaced.x : 0;
  const owlDy = fromPlaced && selPlaced ? fromPlaced.y - selPlaced.y : 0;

  const labelFor = (node: TreeNode) => {
    if (node.kind === "lesson") {
      return { title: node.step.title, sub: null as string | null, muted: node.step.state === "locked" };
    }
    const s = node.week.testState;
    return {
      title: t.test,
      sub: s === "locked" || s === "passed" ? null : t.passMark,
      muted: s === "locked",
    };
  };
  // Call-to-action shown on the selected node to actually open the lesson/test.
  const ctaFor = (node: TreeNode): string => {
    if (node.kind === "lesson") return t.open;
    if (node.week.testState === "failed") return t.retake;
    if (node.week.testState === "passed") return t.open;
    return t.startTest;
  };
  const hrefFor = (node: TreeNode): string | null => {
    if (node.kind === "lesson") {
      return node.step.state === "locked" ? null : `/lessons/${node.step.lessonId}`;
    }
    return node.week.testState === "locked" || !node.week.testAssignmentId
      ? null
      : `/homework/${node.week.testAssignmentId}`;
  };

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: totalH }}>
      <div className="relative w-full" style={{ height: totalH }}>
        {/* The winding road */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={W}
          height={totalH}
          viewBox={`0 0 ${W} ${totalH}`}
          fill="none"
        >
          <path d={d} stroke="#eef0f2" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} stroke="#d9dde2" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 13" />
        </svg>

        {placed.map(({ node, x, y }) => {
          const isSelected = selId === node.id;
          const label = labelFor(node);
          const href = hrefFor(node);

          return (
            <div key={node.id} className="absolute" style={{ left: x, top: y }}>
              {/* Owl rides the selected node — glides in from where it was */}
              {isSelected && (
                <div
                  key={selId ?? "owl"}
                  className="absolute left-1/2 -top-[58px] z-10 pointer-events-none"
                  style={
                    {
                      transform: "translateX(-50%)",
                      "--owl-dx": `${owlDx}px`,
                      "--owl-dy": `${owlDy}px`,
                      animation: "owl-glide 1900ms cubic-bezier(0.33, 0, 0.2, 1)",
                    } as CSSProperties
                  }
                >
                  <div className="animate-bounce">
                    <OwlExcited className="w-14 h-14 drop-shadow-md" />
                  </div>
                </div>
              )}
              {/* Disc — tap to select (owl glides here); locked nodes inert */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                {href ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFromId(selId);
                      setSelectedId(node.id);
                    }}
                    aria-label={label.title}
                  >
                    <NodeDisc node={node} isCurrent={isSelected} />
                  </button>
                ) : (
                  <NodeDisc node={node} isCurrent={isSelected} />
                )}
              </div>
              {/* Label below (+ Open CTA on the selected node) */}
              <div className="absolute left-1/2 -translate-x-1/2 top-[40px] text-center" style={{ width: labelWidth }}>
                <p
                  className={`text-[11px] font-medium font-fredoka leading-tight line-clamp-2 ${
                    label.muted ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {label.title}
                </p>
                {label.sub && <p className="text-[10px] font-medium text-amber-500">{label.sub}</p>}
                {isSelected && href && (
                  <Link
                    href={href}
                    className="mt-1.5 inline-block px-3.5 py-1 rounded-full bg-[#007229] text-white text-[11px] font-bold font-fredoka shadow-sm hover:bg-[#005C22] transition-colors animate-pop-in"
                  >
                    {ctaFor(node)}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
