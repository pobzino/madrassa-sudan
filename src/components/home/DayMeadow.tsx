import type { CSSProperties } from "react";
import { CloudBand, FlyingBirds } from "@/components/dashboard/DashboardScenes";

/** The bright sky behind the whole section, matching the hero. */
export function DaySky() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ background: "linear-gradient(180deg, #e4efff 0%, #eef0fb 30%, #eef6ee 65%, #dcefdd 100%)" }}
    />
  );
}

const PATH = "M40 150C160 140 220 136 250 132S520 90 720 96S1040 128 1190 120S1380 104 1420 100";
// Where the three step flags stand on the front hill's path (in its 1440×180 units).
const FLAGS = [
  { x: 250, y: 132 },
  { x: 720, y: 96 },
  { x: 1190, y: 120 },
];
// Trees on the middle hill (in its 1440×220 units), drawn as HTML so they keep their shape.
const TREES = [
  { x: 180, y: 96, size: 30 },
  { x: 250, y: 88, size: 22 },
  { x: 900, y: 132, size: 28 },
  { x: 975, y: 136, size: 20 },
  { x: 1060, y: 134, size: 26 },
  { x: 1300, y: 110, size: 22 },
];
const BUTTERFLIES = [
  { className: "left-[8%] top-[52%]", color: "#f7a1b6", delay: "0s", duration: "18s" },
  { className: "left-[46%] top-[62%]", color: "#ffce85", delay: "6s", duration: "22s" },
  { className: "right-[30%] top-[48%] hidden lg:block", color: "#a9c8f5", delay: "11s", duration: "26s" },
];

const parallax = (amount: number): CSSProperties => ({
  transform: `translateX(calc(var(--hiw-progress, 0) * ${-amount}%))`,
});

/**
 * The sunny meadow inside the pinned stage: sun, clouds and birds, rolling
 * hills that drift as you scroll (as if walking along them), a learning path
 * whose flags light up step by step, butterflies, and bursts of colour on
 * the final step.
 */
export function DayMeadow({ active, celebrate }: { active: number; celebrate: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sun: beside the device on phones (the step text sits above it), top right on desktop. */}
      <svg className="anim-sun absolute right-[5%] top-[36%] h-14 w-14 lg:right-[8%] lg:top-[8%] lg:h-20 lg:w-20" viewBox="0 0 64 64">
        <g stroke="#ffd23f" strokeWidth="3" strokeLinecap="round">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return (
              <line
                key={i}
                x1={(32 + Math.cos(a) * 24).toFixed(2)}
                y1={(32 + Math.sin(a) * 24).toFixed(2)}
                x2={(32 + Math.cos(a) * 31).toFixed(2)}
                y2={(32 + Math.sin(a) * 31).toFixed(2)}
              />
            );
          })}
        </g>
        <circle cx="32" cy="32" r="20" fill="#ffe16b" />
      </svg>
      <CloudBand opacity={0.85} />
      <FlyingBirds color="#8a93a6" />

      {celebrate && (
        <>
          {/* Kept clear of the text: beside the device on phones, above it on desktop. */}
          <Burst className="right-[2%] top-[46%] lg:right-[24%] lg:top-[3%]" color="#F59E0B" delay={0} />
          <Burst className="right-[14%] top-[60%] lg:right-[2%] lg:top-[24%]" color="#EC4899" delay={0.55} />
          <Burst className="hidden lg:right-[40%] lg:top-[10%] lg:block" color="#00913D" delay={1.1} />
        </>
      )}

      {/* Far hills. */}
      <svg className="absolute bottom-0 left-[-10%] h-[42%] w-[120%]" viewBox="0 0 1440 300" preserveAspectRatio="none" style={parallax(3)}>
        <path d="M0 150C200 80 380 90 560 140S920 210 1100 150 1360 70 1440 110V300H0Z" fill="#d6ecd9" />
      </svg>
      {/* Middle hills with trees. */}
      <div className="absolute bottom-0 left-[-10%] h-[30%] w-[120%]" style={parallax(6)}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 220" preserveAspectRatio="none">
          <path d="M0 120C240 60 440 70 700 118S1180 170 1440 96V220H0Z" fill="#bfe0c6" />
        </svg>
        {TREES.map((tree) => (
          <svg
            key={tree.x}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${(tree.x / 1440) * 100}%`, top: `${(tree.y / 220) * 100}%`, width: tree.size, height: tree.size * 1.5 }}
            viewBox="0 0 40 60"
          >
            <rect x="17" y="30" width="6" height="30" rx="3" fill="#b78b5e" />
            <circle cx="20" cy="20" r="19" fill="#74c08d" />
            <circle cx="12" cy="26" r="11" fill="#84cb9d" />
            <circle cx="28" cy="26" r="11" fill="#84cb9d" />
          </svg>
        ))}
      </div>
      {/* Front hill with the learning path and its step flags. */}
      <div className="absolute bottom-0 left-[-10%] h-[20%] w-[120%]" style={parallax(10)}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 180" preserveAspectRatio="none">
          <path d="M0 90C260 40 520 60 760 92S1220 130 1440 70V180H0Z" fill="#aed7b6" />
          {/* The path and flags are desktop-only; on smaller screens they peek out awkwardly from behind the device. */}
          <g className="hidden lg:inline">
            <path
              d={PATH}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.9"
              strokeWidth="4"
              strokeDasharray="2 12"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={PATH}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              vectorEffect="non-scaling-stroke"
              style={{ strokeDashoffset: "calc(1 - var(--hiw-progress, 0))" }}
            />
          </g>
        </svg>
        {FLAGS.map((flag, i) => {
          const reached = i <= active;
          return (
            <svg
              key={i}
              className="absolute hidden h-12 w-9 origin-bottom -translate-x-[3px] -translate-y-full transition-[scale] duration-500 lg:block"
              style={{
                left: `${(flag.x / 1440) * 100}%`,
                top: `${(flag.y / 180) * 100}%`,
                scale: reached ? "1.12" : "1",
              }}
              viewBox="0 0 36 48"
            >
              <rect x="1" y="2" width="4" height="46" rx="2" fill={reached ? "#b45309" : "#9ca3af"} />
              <path d="M5 3L33 12L5 21Z" fill={reached ? "#F59E0B" : "#ffffff"} />
            </svg>
          );
        })}
      </div>

      {BUTTERFLIES.map((butterfly, i) => (
        <svg
          key={i}
          className={`anim-butterfly absolute h-7 w-7 ${butterfly.className}`}
          style={{ animationDelay: butterfly.delay, animationDuration: butterfly.duration }}
          viewBox="0 0 32 32"
          fill={butterfly.color}
        >
          <ellipse cx="11" cy="12" rx="7" ry="9" />
          <ellipse cx="21" cy="12" rx="7" ry="9" />
          <ellipse cx="11" cy="22" rx="6" ry="7" />
          <ellipse cx="21" cy="22" rx="6" ry="7" />
          <rect x="15" y="9" width="2" height="16" rx="1" fill="#6b5b4a" />
        </svg>
      ))}
    </div>
  );
}

function Burst({ className, color, delay }: { className: string; color: string; delay: number }) {
  return (
    <div className={`absolute h-28 w-28 ${className}`}>
      <div
        className="absolute inset-0 animate-[hiw-burst_1.8s_ease-out_infinite] opacity-0 motion-reduce:hidden"
        style={{ animationDelay: `${delay}s` }}
      >
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-[4px] w-7 origin-left rounded-full"
            style={{ background: color, transform: `rotate(${(i * 360) / 14}deg) translateX(14px)` }}
          />
        ))}
      </div>
    </div>
  );
}
