"use client";

import { useEffect, useRef, useState } from "react";
import LearnerAvatarIcon from "@/components/learners/LearnerAvatarIcon";
import type { LevelBand } from "@/lib/measurement/types";
import { Cell, StatTile, TableWrap, TD, TH, THN, Tip } from "./ImpactParts";
import { BAND_ORDER, bandLabel, formatDay, formatInt, suppressedHint, SUPPRESSED_MARK, type UiLang } from "./format";
import { CLASS_COPY } from "./classCopy";
import { scopeApi, type ClassProgressResponse, type ClassSubjectBands } from "./scopeApi";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Ordinal blue steps for the three bands (lightest still clears 2:1 on white). */
export const BAND_COLORS: Record<LevelBand, string> = { getting_started: "#86b6ef", on_the_way: "#3987e5", confident: "#1c5cab" };

/**
 * One class's progress for its teacher (or the school admin): class totals,
 * where the class is now per subject (bands), and each child's start -> now
 * band. Bands only, never scores. Small classes hide the totals.
 */
export default function ClassProgressView({ lang, cohortId, fetcher = (i, init) => fetch(i, init) }: { lang: UiLang; cohortId: string; fetcher?: Fetcher }) {
  const t = CLASS_COPY[lang];
  const [data, setData] = useState<ClassProgressResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const body = await scopeApi.classProgress(fetcherRef.current, cohortId);
        if (!cancelled) {
          setData(body);
          setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) setStatus((e as { status?: number }).status === 403 ? "forbidden" : "error");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [cohortId]);

  if (status === "loading") return <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-busy="true" />;
  if (status !== "ready" || !data) return <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">{CLASS_COPY[lang].errors.generic}</p>;

  const agg = data.aggregates;
  const small = agg.activeThisMonth === null;
  const subjectName = (s: { nameEn: string | null; nameAr: string | null }) => (lang === "ar" ? s.nameAr ?? s.nameEn : s.nameEn ?? s.nameAr) ?? "";
  return (
    <div className="space-y-5" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-gray-900">{t.classProgress}</h2>
        <p className="mb-4 mt-0.5 text-xs text-gray-500">{t.classProgressSub}</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile label={t.children}>{formatInt(agg.learners, lang)}</StatTile>
          <StatTile label={t.activeThisMonth}>
            <Cell value={agg.activeThisMonth} kind="int" lang={lang} suppressed={small} />
          </StatTile>
          <StatTile label={t.skillsThisMonth}>
            <Cell value={agg.skillsLearnedThisMonth} kind="int" lang={lang} suppressed={agg.skillsLearnedThisMonth === null} />
          </StatTile>
        </div>
        {small && <p className="mt-2 text-xs text-gray-500">{t.smallClass}</p>}
        {agg.subjects.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-xs font-semibold text-gray-700">{t.bandsBySubject}</p>
              <BandLegend lang={lang} />
            </div>
            <ul className="space-y-2.5">
              {agg.subjects.map((s) => (
                <li key={s.subjectId} className="grid grid-cols-[minmax(0,32%)_1fr] items-center gap-3">
                  <span className="truncate text-xs font-medium text-gray-800">{subjectName(s)}</span>
                  <BandBar subject={s} lang={lang} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        {data.children.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">{t.noChildren}</p>
        ) : (
          <TableWrap minWidth={560}>
            <thead>
              <tr className="border-b border-gray-200">
                <th className={TH}>{t.child}</th>
                <th className={TH}>{t.startToNow}</th>
                <th className={THN}>{t.skills}</th>
                <th className={THN}>{t.lastActive}</th>
              </tr>
            </thead>
            <tbody>
              {data.children.map((c) => (
                <tr key={c.learnerId} className="border-b border-gray-100 align-top last:border-0">
                  <td className={TD}>
                    <span className="flex items-center gap-2">
                      {c.avatar ? <LearnerAvatarIcon avatar={c.avatar} className="h-7 w-7 shrink-0" /> : <span className="h-7 w-7 shrink-0 rounded-full bg-gray-100" />}
                      <span className="font-medium text-gray-900">{c.name}</span>
                    </span>
                  </td>
                  <td className={TD}>
                    <ul className="space-y-1">
                      {c.subjects.map((s) => (
                        <li key={s.subjectId} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="w-24 shrink-0 truncate text-gray-500">{subjectName(s)}</span>
                          {s.baseline || s.current ? (
                            <>
                              <BandChip band={s.baseline} lang={lang} />
                              <span className="text-gray-300" aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>
                              <BandChip band={s.current} lang={lang} />
                            </>
                          ) : (
                            <span className="text-gray-400">{t.noBand}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={`${TD} text-end tabular-nums`}>{formatInt(c.skillsLearnedThisMonth, lang)}</td>
                  <td className={`${TD} whitespace-nowrap text-end text-xs text-gray-500`}>{c.lastActiveAt ? formatDay(c.lastActiveAt, lang) : t.never}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}

function BandChip({ band, lang }: { band: LevelBand | null; lang: UiLang }) {
  if (!band) return <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-400">·</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 font-medium text-gray-800 ring-1 ring-gray-200">
      <span className="h-2 w-2 rounded-full" style={{ background: BAND_COLORS[band] }} aria-hidden="true" />
      {bandLabel(band, lang)}
    </span>
  );
}

export function BandLegend({ lang }: { lang: UiLang }) {
  return (
    <span className="flex flex-wrap gap-3 text-[11px] text-gray-500">
      {BAND_ORDER.map((b) => (
        <span key={b} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLORS[b] }} aria-hidden="true" />
          {bandLabel(b, lang)}
        </span>
      ))}
    </span>
  );
}

/** A stacked bar of children per band, 2px gaps between segments; "—" when the class is small. */
function BandBar({ subject, lang }: { subject: ClassSubjectBands; lang: UiLang }) {
  if (!subject.bands) {
    return (
      <Tip label={suppressedHint(lang)}>
        <span className="cursor-help text-xs text-gray-400" aria-label={suppressedHint(lang)}>{SUPPRESSED_MARK}</span>
      </Tip>
    );
  }
  const bands = subject.bands;
  const present = BAND_ORDER.filter((b) => bands[b] > 0);
  if (present.length === 0) return <span className="text-xs text-gray-400">·</span>;
  return (
    <span className="flex h-4 w-full gap-[2px]" role="img" aria-label={BAND_ORDER.map((b) => `${bandLabel(b, lang)} ${formatInt(bands[b], lang)}`).join(", ")}>
      {present.map((b, i) => (
        <span key={b} className="flex h-full min-w-[6px]" style={{ flexGrow: bands[b], flexBasis: 0 }}>
          <Tip label={`${bandLabel(b, lang)}: ${formatInt(bands[b], lang)}`} className="h-full w-full">
            <span
              className="block h-full w-full"
              style={{
                background: BAND_COLORS[b],
                borderStartStartRadius: i === 0 ? 4 : 0,
                borderEndStartRadius: i === 0 ? 4 : 0,
                borderStartEndRadius: i === present.length - 1 ? 4 : 0,
                borderEndEndRadius: i === present.length - 1 ? 4 : 0,
              }}
            />
          </Tip>
        </span>
      ))}
    </span>
  );
}
