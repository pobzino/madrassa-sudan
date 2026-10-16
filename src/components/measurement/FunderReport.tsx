"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { MadrassaLogo } from "@/components/illustrations";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { FunderExport, FunderExportResponse, FunderTable } from "@/lib/measurement/types";
import { Tip } from "./ImpactParts";
import { formatInt, formatMonth, formatRate, presetRange, suppressedHint, SUPPRESSED_MARK, type UiLang } from "./format";
import { IMPACT_COPY } from "./impactCopy";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const PERIODS = [13, 26, 52] as const;
const PERIOD_LABELS: Record<(typeof PERIODS)[number], { en: string; ar: string }> = {
  13: { en: "3 months", ar: "٣ أشهر" },
  26: { en: "6 months", ar: "٦ أشهر" },
  52: { en: "12 months", ar: "١٢ شهراً" },
};

/** How a funder-table cell reads: rates (0..1 in *_rate / *_share columns) as %, months as "Oct 2026". */
export function funderCellText(key: string, value: string | number | boolean | null, lang: UiLang): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No";
  if (typeof value === "number") {
    if (/(rate|share|retention|week\d+)$/i.test(key) && value >= 0 && value <= 1) return formatRate(value, lang);
    return Number.isInteger(value) ? formatInt(value, lang) : new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-GB", { maximumFractionDigits: 1 }).format(value);
  }
  if (/^\d{4}-\d{2}$/.test(value)) return formatMonth(value, lang);
  return value;
}

/**
 * The admin-only funder report: the export's tables, printable on A4 (Print /
 * Save as PDF), plus CSV and JSON downloads. Anonymous aggregates only.
 */
export default function FunderReport({ lang, fetcher = (i, init) => fetch(i, init) }: { lang: UiLang; fetcher?: Fetcher }) {
  const t = IMPACT_COPY[lang];
  const [weeks, setWeeks] = useState<(typeof PERIODS)[number]>(26);
  const [data, setData] = useState<FunderExport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const { from, to } = presetRange(weeks);
  const base = `/api/admin/measurement/export?from=${from}&to=${to}`;

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetcherRef.current(`${base}&format=json`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) return setStatus("forbidden");
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as FunderExportResponse;
        if (!cancelled) {
          setData(body.export);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [base]);

  const downloadJson = () => {
    if (!data) return;
    trackAnalyticsEvent("impact_export", { format: "json" });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amal-impact-${data.period.from}-${data.period.to}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div id="funder-report" className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 print:max-w-none print:p-0" dir={lang === "ar" ? "rtl" : "ltr"}>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #funder-report, #funder-report * { visibility: visible !important; }
          #funder-report { position: absolute; inset: 0 auto auto 0; width: 100%; }
          #funder-report section { break-inside: avoid; box-shadow: none !important; }
        }
      `}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/teacher/impact" className="text-sm font-medium text-emerald-700 hover:underline">{t.backToImpact}</Link>
        <div className="flex-1" />
        <div className="inline-flex rounded-lg bg-gray-100 p-1" role="radiogroup" aria-label={t.period}>
          {PERIODS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={weeks === w}
              onClick={() => setWeeks(w)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${weeks === w ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {PERIOD_LABELS[w][lang]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <a
          href={`${base}&format=csv`}
          download
          onClick={() => trackAnalyticsEvent("impact_export", { format: "csv" })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t.downloadCsv}
        </a>
        <button type="button" onClick={downloadJson} disabled={!data} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" />
          {t.downloadJson}
        </button>
        <button
          type="button"
          onClick={() => {
            trackAnalyticsEvent("impact_export", { format: "pdf" });
            window.print();
          }}
          disabled={!data}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t.print}
        </button>
      </div>

      <header className="flex flex-wrap items-center gap-4 border-b border-gray-200 pb-4">
        <MadrassaLogo size="sm" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t.funderTitle}</h1>
          <p className="text-sm text-gray-500">{t.funderSubtitle}</p>
        </div>
        {data && (
          <dl className="text-xs text-gray-600">
            <div className="flex gap-1.5"><dt className="font-semibold">{t.period}:</dt><dd>{formatMonth(data.period.from, lang)} – {formatMonth(data.period.to, lang)}</dd></div>
            <div className="flex gap-1.5"><dt className="font-semibold">{t.definitions(data.definitionsVersion)}</dt></div>
            <div>{t.smallGroups(formatInt(data.minCellSize, lang))}</div>
          </dl>
        )}
      </header>

      {status === "forbidden" && <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">{t.adminOnly}</p>}
      {status === "error" && <p className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">{t.failed}</p>}
      {status === "loading" && !data && <div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-busy="true" aria-label={t.loading} />}

      {data && (
        <div className={`space-y-5 ${status === "loading" ? "opacity-60" : ""}`}>
          {data.tables.map((table) => (
            <FunderTableView key={table.id} table={table} lang={lang} />
          ))}
          {data.notes.length > 0 && (
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">{t.notes}</h2>
              <ol className="list-decimal space-y-1 ps-5 text-xs leading-relaxed text-gray-600">
                {data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function FunderTableView({ table, lang }: { table: FunderTable; lang: UiLang }) {
  const columns = table.columns.filter((c) => c.key !== "suppressed");
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{table.title}</h2>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full text-sm" style={{ minWidth: Math.max(420, columns.length * 110) }}>
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((c, i) => (
                <th key={c.key} className={`px-2 py-2 text-xs font-medium text-gray-500 first:ps-0 ${i === 0 ? "text-start" : "text-end"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="border-b border-gray-100 last:border-0">
                {columns.map((c, i) => {
                  const text = funderCellText(c.key, row[c.key] ?? null, lang);
                  return (
                    <td key={c.key} className={`px-2 py-2 tabular-nums first:ps-0 ${i === 0 ? "text-start text-gray-900" : "text-end text-gray-800"}`}>
                      {text === null ? (
                        <Tip label={suppressedHint(lang)}>
                          <span className="cursor-help text-gray-400" aria-label={suppressedHint(lang)}>{SUPPRESSED_MARK}</span>
                        </Tip>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.footnotes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-gray-500">
          {table.footnotes.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
