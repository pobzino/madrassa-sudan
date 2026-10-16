"use client";

import { useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { formatCell, type CellKind, type UiLang } from "./format";

/**
 * Small, dependency-free chart and table parts for the Impact page and the
 * funder report: plain HTML/CSS bars, one hue per job (blue = magnitude,
 * blue/red = growth up/down around a grey zero), recessive axes, values as
 * text tokens, a tooltip on every mark, and "—" for small groups.
 */
export const VIZ = {
  blue: "#2a78d6",
  blueLight: "#cde2fb",
  red: "#e34948",
  orange: "#eb6834",
  track: "#f0efec",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
} as const;

/** Sequential blue ramp (light -> dark) for heat cells; index by 0..1. */
const BLUE_RAMP = ["#e8f1fd", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
export function heatColor(value: number): { background: string; color: string } {
  const i = Math.max(0, Math.min(BLUE_RAMP.length - 1, Math.round(value * (BLUE_RAMP.length - 1))));
  return { background: BLUE_RAMP[i], color: i >= 4 ? "#ffffff" : VIZ.ink };
}

/** A tooltip on hover and keyboard focus. */
export function Tip({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <span className={`group relative inline-flex ${className}`} tabIndex={0} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full start-1/2 z-30 mb-1.5 hidden w-max max-w-[240px] -translate-x-1/2 whitespace-normal rounded-lg bg-gray-900 px-2.5 py-1.5 text-start text-xs font-medium leading-snug text-white shadow-lg group-hover:block group-focus:block rtl:translate-x-1/2"
      >
        {label}
      </span>
    </span>
  );
}

/** One number from the report, or "—" (small group) with its explanation. */
export function Cell({ value, kind, lang, suppressed = false, className = "" }: { value: number | null | undefined; kind: CellKind; lang: UiLang; suppressed?: boolean; className?: string }) {
  const cell = formatCell(value, kind, lang, suppressed);
  if (!cell.hint) return <span className={`tabular-nums ${className}`}>{cell.text}</span>;
  return (
    <Tip label={cell.hint}>
      <span className={`tabular-nums ${cell.suppressed ? "cursor-help text-gray-400" : "text-gray-400"} ${className}`} aria-label={cell.hint}>
        {cell.text}
      </span>
    </Tip>
  );
}

/** A report section with an "How is this measured?" toggle. */
export function Section({
  title,
  info,
  caveats,
  labels,
  action,
  children,
}: {
  title: string;
  info: string;
  caveats?: readonly string[];
  labels: { info: string; hideInfo: string; caveatsTitle: string };
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {open ? labels.hideInfo : labels.info}
        </button>
        <div className="flex-1" />
        {action}
      </div>
      {open && (
        <div id={id} className="mb-4 rounded-xl bg-gray-50 px-3.5 py-3 text-xs leading-relaxed text-gray-600">
          <p>{info}</p>
          {caveats && caveats.length > 0 && (
            <>
              <p className="mt-2 font-semibold text-gray-700">{labels.caveatsTitle}</p>
              <ul className="mt-1 list-disc space-y-0.5 ps-4">
                {caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-gray-950">{children}</p>
      {note && <p className="mt-0.5 text-[11px] text-gray-400">{note}</p>}
    </div>
  );
}

/**
 * A horizontal bar around zero: growth up (blue, towards the inline end) or
 * down (red). `max` is the absolute scale, shared by every row.
 */
export function DivergingBar({ value, max, label, tip }: { value: number | null; max: number; label: ReactNode; tip: ReactNode }) {
  const share = value === null || max <= 0 ? 0 : Math.min(1, Math.abs(value) / max);
  const up = (value ?? 0) >= 0;
  return (
    <Tip label={tip} className="w-full">
      <span className="flex w-full items-center gap-2">
        <span className="relative flex h-5 flex-1 items-center" aria-hidden="true">
          <span className="absolute inset-y-0 start-1/2 w-px bg-[#c3c2b7]" />
          {value !== null && share > 0 && (
            <span
              className="absolute h-3"
              style={{
                width: `${share * 50}%`,
                insetInlineStart: up ? "50%" : `${50 - share * 50}%`,
                background: up ? VIZ.blue : VIZ.red,
                borderStartStartRadius: up ? 0 : 4,
                borderEndStartRadius: up ? 0 : 4,
                borderStartEndRadius: up ? 4 : 0,
                borderEndEndRadius: up ? 4 : 0,
              }}
            />
          )}
        </span>
        <span className="w-20 shrink-0 text-end text-xs font-semibold text-gray-800">{label}</span>
      </span>
    </Tip>
  );
}

/** A single-hue bar from the start edge, 0..max. */
export function Bar({ value, max, color = VIZ.blue, tip, label }: { value: number | null; max: number; color?: string; tip: ReactNode; label: ReactNode }) {
  const share = value === null || max <= 0 ? 0 : Math.min(1, value / max);
  return (
    <Tip label={tip} className="w-full">
      <span className="flex w-full items-center gap-2">
        <span className="relative h-3 flex-1 rounded-e bg-[#f0efec]" aria-hidden="true">
          {share > 0 && <span className="absolute inset-y-0 start-0 rounded-e" style={{ width: `${share * 100}%`, background: color }} />}
        </span>
        <span className="w-14 shrink-0 text-end text-xs font-semibold text-gray-800">{label}</span>
      </span>
    </Tip>
  );
}

/** Median dot on a p25–p75 range, with an optional "planned" tick; 0..max. */
export function RangeDot({ p25, median, p75, expected, max, tip }: { p25: number | null; median: number | null; p75: number | null; expected?: number | null; max: number; tip: ReactNode }) {
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <Tip label={tip} className="w-full">
      <span className="relative block h-6 w-full" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px bg-[#e1e0d9]" />
        {p25 !== null && p75 !== null && (
          <span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full" style={{ insetInlineStart: at(p25), width: `calc(${at(p75)} - ${at(p25)})`, background: VIZ.blueLight }} />
        )}
        {expected !== null && expected !== undefined && (
          <span className="absolute top-0.5 h-5 w-0.5 rounded bg-gray-500" style={{ insetInlineStart: at(expected) }} />
        )}
        {median !== null && (
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white rtl:translate-x-1/2" style={{ insetInlineStart: at(median), background: VIZ.blue }} />
        )}
      </span>
    </Tip>
  );
}

/** Columns from a shared baseline, one per item, each with a tooltip; "—" stubs for hidden ones. */
export function Columns({
  items,
  height = 120,
  ariaLabel,
}: {
  items: Array<{ key: string; value: number | null; suppressed: boolean; tip: ReactNode; tick: string }>;
  height?: number;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  // About four dates along the axis (they fit on a phone), always the first and the last.
  const every = Math.max(1, Math.ceil((items.length - 1) / 3));
  const showTick = (index: number) => index % every === 0 || index === items.length - 1;
  return (
    <div role="group" aria-label={ariaLabel} className="w-full">
      <div className="flex items-end gap-[2px] border-b border-[#c3c2b7]" style={{ height }}>
        {items.map((item) => (
          <Tip key={item.key} label={item.tip} className="h-full min-w-0 flex-1 items-end justify-center">
            {item.suppressed ? (
              <span className="mb-0.5 block w-full max-w-[24px] rounded-t border border-dashed border-gray-300 bg-gray-50" style={{ height: 10 }} />
            ) : (
              <span
                className="block w-full max-w-[24px] rounded-t"
                style={{ height: Math.max(item.value ? 2 : 0, ((item.value ?? 0) / max) * (height - 6)), background: VIZ.blue }}
              />
            )}
          </Tip>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]" aria-hidden="true">
        {items.map((item, index) => (
          <span key={item.key} className="min-w-0 flex-1 whitespace-nowrap text-center text-[10px] text-[#898781]">
            {showTick(index) ? item.tick : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal-scroll wrapper for wide tables (the page itself never scrolls sideways). */
export function TableWrap({ children, minWidth = 560 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full text-start text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/** Header cells: text columns start-aligned, number columns end-aligned (THN), like their values. */
export const TH = "px-2 py-2 text-start text-xs font-medium text-gray-500 first:ps-0";
export const THN = "px-2 py-2 text-end text-xs font-medium text-gray-500 first:ps-0";
export const TD = "px-2 py-2 align-middle text-gray-800 first:ps-0";
