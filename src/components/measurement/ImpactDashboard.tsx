"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeftRight, ArrowUp, Dot, EqualApproximately, FileText, type LucideIcon } from "lucide-react";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  MIN_CELL_SIZE,
  type ImpactReport,
  type ImpactResponse,
  type ImpactSplit,
  type ItemFlag,
  type ItemQaRow,
} from "@/lib/measurement/types";
import { Bar, Cell, Columns, DivergingBar, heatColor, RangeDot, Section, StatTile, TableWrap, TD, TH, THN, Tip, VIZ } from "./ImpactParts";
import { formatCell, formatDay, formatInt, groupLabel, median, presetRange, weightedRate, type UiLang } from "./format";
import { IMPACT_COPY } from "./impactCopy";
import { CLASS_COPY } from "./classCopy";
import { scopeApi, scopeParam, type ImpactScopeOption, type ImpactScope } from "./scopeApi";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const PRESETS = [4, 12, 26] as const;
const SPLITS: readonly ImpactSplit[] = ["none", "grade_band", "age_band", "subject", "mode"];
const FLAGS: readonly ItemFlag[] = ["too_hard", "too_easy", "not_discriminating", "difficulty_mismatch", "low_n"];

/** "all" first, then the split's bands in the order the report gives them. */
function byGroup<T extends { group: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.group === "all" ? -1 : b.group === "all" ? 1 : 0));
}

export function impactQueryString(q: { weeks: number; subjectId: string | null; split: ImpactSplit; scope?: string | null }, now = new Date()): string {
  const { from, to } = presetRange(q.weeks, now);
  const params = new URLSearchParams({ from, to, split: q.split });
  if (q.subjectId) params.set("subject_id", q.subjectId);
  if (q.scope) params.set("scope", q.scope);
  return params.toString();
}

/**
 * The Impact page body: filters, then every section of the report. One fetch
 * per filter change (debounced). Admins see every path; teachers see the
 * paths they authored (the server decides the scope).
 */
export default function ImpactDashboard({ lang, fetcher = (i, init) => fetch(i, init), isAdmin }: { lang: UiLang; fetcher?: Fetcher; isAdmin: boolean }) {
  const t = IMPACT_COPY[lang];
  const [weeks, setWeeks] = useState<(typeof PRESETS)[number]>(12);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [split, setSplit] = useState<ImpactSplit>("none");
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [flag, setFlag] = useState<ItemFlag | null>(null);
  const [attempt, setAttempt] = useState(0);
  // What this viewer may switch between (admin: all / a school / a class; school admin: school / its classes; teacher: their classes).
  const [scopes, setScopes] = useState<ImpactScopeOption[] | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    scopeApi
      .impactScopes(fetcherRef.current)
      .then((body) => {
        if (cancelled) return;
        setScopes(body.options);
        if (body.options[0]) setScope((current) => current ?? scopeParam(body.options[0]));
      })
      .catch(() => {
        // No switcher (an older server): the report keeps its default scope.
        if (!cancelled) setScopes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = impactQueryString({ weeks, subjectId, split, scope });
  useEffect(() => {
    if (scopes === null) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetcherRef.current(`/api/teacher/measurement/impact?${query}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setStatus("forbidden");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as ImpactResponse;
        if (cancelled) return;
        setReport(body.report);
        setStatus("ready");
        trackAnalyticsEvent("impact_view", { split: body.report.query.split });
      } catch {
        if (!cancelled) setStatus("error");
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, attempt, scopes]);

  const subjectName = useCallback(
    (id: string) => {
      const s = report?.subjects.find((x) => x.id === id);
      return (lang === "ar" ? s?.nameAr ?? s?.nameEn : s?.nameEn ?? s?.nameAr) ?? null;
    },
    [lang, report]
  );
  const bossLabel = useCallback(
    (milestoneId: string, afterWeekNumber: number, subject: string) => {
      const b = report?.bossLabels.find((x) => x.milestoneId === milestoneId);
      const title = (lang === "ar" ? b?.titleAr : b?.titleEn ?? b?.titleAr) ?? "";
      return { main: `${subjectName(subject) ?? ""} · ${t.afterWeek(afterWeekNumber)}`, sub: title };
    },
    [lang, report, subjectName, t]
  );
  const g = (group: string) => groupLabel(group, report?.query.split ?? split, lang, subjectName);
  const showGroups = (report?.query.split ?? "none") !== "none";
  const sectionLabels = { info: t.info, hideInfo: t.hideInfo, caveatsTitle: t.caveatsTitle };
  const caveats = t.caveats;

  const tc = CLASS_COPY[lang];
  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      {scopes && scopes.length > 1 && (
        <label className="text-xs font-medium text-gray-500">
          <span className="mb-1 block">{tc.showing}</span>
          <select
            value={scope ?? ""}
            onChange={(e) => setScope(e.target.value)}
            className="h-9 max-w-[260px] rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-800"
          >
            {scopes.map((o) => (
              <option key={scopeParam(o)} value={scopeParam(o)}>
                {o.kind === "all" ? t.scopeAll : `${o.kind === "school" ? tc.scopeSchool : tc.scopeClass} · ${o.label}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">{t.range}</p>
        <div className="inline-flex rounded-lg bg-gray-100 p-1" role="radiogroup" aria-label={t.range}>
          {PRESETS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={weeks === w}
              onClick={() => setWeeks(w)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${weeks === w ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t.weeks(w)}
            </button>
          ))}
        </div>
      </div>
      <label className="text-xs font-medium text-gray-500">
        <span className="mb-1 block">{t.subject}</span>
        <select
          value={subjectId ?? ""}
          onChange={(e) => setSubjectId(e.target.value || null)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-800"
        >
          <option value="">{t.allSubjects}</option>
          {(report?.subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {(lang === "ar" ? s.nameAr ?? s.nameEn : s.nameEn ?? s.nameAr) ?? s.id}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-gray-500">
        <span className="mb-1 block">{t.split}</span>
        <select value={split} onChange={(e) => setSplit(e.target.value as ImpactSplit)} className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-800">
          {SPLITS.map((s) => (
            <option key={s} value={s}>
              {t.splits[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
      </div>
      {scopes?.some((o) => o.kind === "school") && (
        <Link href="/teacher/school" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          {CLASS_COPY[lang].schoolOverview}
        </Link>
      )}
      {isAdmin && (
        <Link href="/admin/impact/report" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <FileText className="h-4 w-4" aria-hidden="true" />
          {t.funderReport}
        </Link>
      )}
    </div>
  );

  if (status === "forbidden") {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {header}
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">{t.forbidden}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      {header}
      {filters}
      {report && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${report.scope.kind === "all" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}>
            {scopeBanner(report.scope as ImpactScope, lang, scopes)}
          </span>
          <span className="text-gray-500">{t.smallGroups(formatInt(report.minCellSize ?? MIN_CELL_SIZE, lang))}</span>
          <span className="text-gray-400">· {t.generated(formatDay(report.generatedAt, lang))}</span>
        </div>
      )}
      {report?.scope.kind === "own_paths" && report.scope.pathIds.length === 0 && (
        <p className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">{t.scopeOwnNone}</p>
      )}

      {status === "error" && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          <span className="flex-1">{t.failed}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-red-700 ring-1 ring-red-200">
            {t.retry}
          </button>
        </div>
      )}
      {status === "loading" && !report && (
        <div className="space-y-4" aria-busy="true" aria-label={t.loading}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      )}

      {report && (
        <div className={`space-y-5 transition-opacity ${status === "loading" ? "opacity-60" : ""}`} aria-busy={status === "loading"}>
          <Headline report={report} lang={lang} labels={sectionLabels} />
          <Growth report={report} lang={lang} g={g} showGroups={showGroups} subjectName={subjectName} labels={sectionLabels} caveats={caveats} />
          <Bosses report={report} lang={lang} g={g} showGroups={showGroups} bossLabel={bossLabel} labels={sectionLabels} caveats={caveats} />
          <StuckSkills report={report} lang={lang} g={g} showGroups={showGroups} labels={sectionLabels} />
          <Pace report={report} lang={lang} g={g} showGroups={showGroups} bossLabel={bossLabel} labels={sectionLabels} />
          <Engagement report={report} lang={lang} g={g} labels={sectionLabels} caveats={caveats} />
          <Retention report={report} lang={lang} g={g} showGroups={showGroups} labels={sectionLabels} />
          <Coverage report={report} lang={lang} g={g} showGroups={showGroups} subjectName={subjectName} labels={sectionLabels} />
          <QuestionQuality report={report} lang={lang} flag={flag} setFlag={setFlag} labels={sectionLabels} caveats={caveats} />
        </div>
      )}
    </div>
  );
}

/** "All learners", "Your learning paths", or the school / class shown. */
export function scopeBanner(scope: ImpactScope, lang: UiLang, options: ImpactScopeOption[] | null): string {
  const t = IMPACT_COPY[lang];
  const tc = CLASS_COPY[lang];
  if (scope.kind === "all") return t.scopeAll;
  if (scope.kind === "own_paths") return t.scopeOwn;
  const label = ("label" in scope && scope.label) || ("id" in scope && options?.find((o) => o.kind === scope.kind && o.id === scope.id)?.label) || "";
  return `${scope.kind === "school" ? tc.scopeSchool : tc.scopeClass}${label ? ` · ${label}` : ""}`;
}

type Labels = { info: string; hideInfo: string; caveatsTitle: string };
interface SectionProps {
  report: ImpactReport;
  lang: UiLang;
  labels: Labels;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-gray-400">{children}</p>;
}

function Headline({ report, lang, labels }: SectionProps) {
  const t = IMPACT_COPY[lang];
  const engagement = report.engagement.rows.find((r) => r.group === "all");
  // The server's overall first-try row when it sends one; else pooled over the published bosses.
  const overall = report.bossesOverall?.find((b) => b.group === "all");
  const firstTry = overall ? overall.firstTryPassRate : weightedRate(report.bosses.filter((b) => b.group === "all"), (b) => b.firstTryPassRate);
  const growth = median(
    report.growth.skills.filter((s) => s.group === "all" && !s.suppressed && s.matchedGrowthPp !== null).map((s) => s.matchedGrowthPp as number)
  );
  return (
    <Section title={t.glance} info={t.tilesInfo} labels={labels}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t.tiles.active}>
          <Cell value={engagement?.activeLearners} kind="int" lang={lang} suppressed={engagement?.suppressed} />
        </StatTile>
        <StatTile label={t.tiles.lessonsPerWeek}>
          <Cell value={engagement?.lessonsPerActiveWeek} kind="decimal" lang={lang} suppressed={engagement?.suppressed} />
        </StatTile>
        <StatTile label={t.tiles.firstTry}>
          <Cell value={firstTry} kind="rate" lang={lang} suppressed={overall?.suppressed} />
        </StatTile>
        <StatTile label={t.tiles.growth}>
          <Cell value={growth} kind="points" lang={lang} />
        </StatTile>
      </div>
    </Section>
  );
}

interface GroupedProps extends SectionProps {
  g: (group: string) => string;
  showGroups: boolean;
}

function GroupCell({ show, row, g }: { show: boolean; row: { group: string }; g: (group: string) => string }) {
  if (!show) return null;
  return <td className={`${TD} whitespace-nowrap text-xs ${row.group === "all" ? "font-semibold" : "text-gray-600"}`}>{g(row.group)}</td>;
}

function Growth({ report, lang, labels, g, showGroups, subjectName, caveats }: GroupedProps & { subjectName: (id: string) => string | null; caveats: readonly string[] }) {
  const t = IMPACT_COPY[lang];
  const subjects = byGroup(report.growth.subjects);
  const skills = report.growth.skills;
  const max = Math.max(10, ...skills.map((s) => Math.abs(s.matchedGrowthPp ?? 0)));
  const bySubject = new Map<string, typeof skills>();
  for (const s of skills) bySubject.set(s.subjectId, [...(bySubject.get(s.subjectId) ?? []), s]);
  return (
    <Section title={t.growthTitle} info={t.growthInfo} caveats={caveats.slice(1, 3)} labels={labels}>
      {subjects.length === 0 && skills.length === 0 ? (
        <Empty>{t.noGrowth}</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjects
              .filter((r) => r.group === "all" || showGroups)
              .map((r) => (
                <div key={`${r.subjectId}:${r.group}`} className="rounded-xl border border-gray-200 p-3.5">
                  <p className="text-xs font-medium text-gray-500">
                    {subjectName(r.subjectId)}
                    {showGroups && r.group !== "all" ? ` · ${g(r.group)}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">{t.baselineToLatest}</p>
                  <p className="mt-0.5 flex items-baseline gap-1.5 text-xl font-bold text-gray-950">
                    <Cell value={r.medianBaselineScore} kind="score" lang={lang} suppressed={r.suppressed} />
                    <span className="text-base font-normal text-gray-400" aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>
                    <Cell value={r.medianLatestScore} kind="score" lang={lang} suppressed={r.suppressed} />
                    <span className="ms-auto text-sm font-semibold text-gray-700">
                      <Cell value={r.medianGrowth} kind="points" lang={lang} suppressed={r.suppressed} />
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    <Cell value={r.improvedShare} kind="rate" lang={lang} suppressed={r.suppressed} /> {t.improved} ·{" "}
                    <Cell value={r.learners} kind="int" lang={lang} suppressed={r.suppressed} /> {t.learnersCol}
                  </p>
                </div>
              ))}
          </div>
          {[...bySubject.entries()].map(([subject, rows]) => {
            const keys = [...new Set(rows.map((r) => r.skillKey))];
            return (
              <div key={subject}>
                <p className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-700">
                  <span>{subjectName(subject)}</span>
                  <span className="font-medium text-gray-400">{t.matchedGrowth}</span>
                </p>
                <ul className="divide-y divide-gray-100">
                  {keys.map((key) =>
                    byGroup(rows.filter((r) => r.skillKey === key))
                      .filter((r) => r.group === "all" || showGroups)
                      .map((r) => {
                        const label = lang === "ar" ? r.labelAr : r.labelEn;
                        const tip = r.suppressed
                          ? formatCell(null, "points", lang, true).hint
                          : `${label}${showGroups ? ` · ${g(r.group)}` : ""}: ${t.matchedGrowth} ${formatCell(r.matchedGrowthPp, "points", lang).text}; ${t.rawGrowth} ${formatCell(r.growthPp, "points", lang).text}; ${t.baselineRate} ${formatCell(r.baselineRate, "rate", lang).text} → ${t.latestRate} ${formatCell(r.latestRate, "rate", lang).text}; ${formatCell(r.learners, "int", lang).text} ${t.learnersCol}`;
                        return (
                          <li key={`${key}:${r.group}`} className="grid grid-cols-[minmax(0,40%)_1fr] items-center gap-2 py-1.5 sm:grid-cols-[minmax(0,32%)_1fr]">
                            <span className={`truncate text-xs ${r.group === "all" ? "font-medium text-gray-800" : "ps-3 text-gray-500"}`} title={label}>
                              {r.group === "all" ? label : g(r.group)}
                            </span>
                            <DivergingBar
                              value={r.suppressed ? null : r.matchedGrowthPp}
                              max={max}
                              tip={tip}
                              label={<Cell value={r.matchedGrowthPp} kind="points" lang={lang} suppressed={r.suppressed} />}
                            />
                          </li>
                        );
                      })
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

type BossLabel = (milestoneId: string, afterWeekNumber: number, subjectId: string) => { main: string; sub: string };

function Bosses({ report, lang, labels, g, showGroups, bossLabel, caveats }: GroupedProps & { bossLabel: BossLabel; caveats: readonly string[] }) {
  const t = IMPACT_COPY[lang];
  const rows = [...report.bosses]
    .filter((r) => r.group === "all" || showGroups)
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.afterWeekNumber - b.afterWeekNumber || (a.group === "all" ? -1 : b.group === "all" ? 1 : 0));
  return (
    <Section title={t.bossesTitle} info={t.bossesInfo} caveats={caveats.slice(0, 1)} labels={labels}>
      {rows.length === 0 ? (
        <Empty>{t.empty}</Empty>
      ) : (
        <TableWrap minWidth={showGroups ? 720 : 620}>
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>{t.boss}</th>
              {showGroups && <th className={TH}>{t.groupCol}</th>}
              <th className={THN}>{t.firstTry}</th>
              <th className={THN}>{t.eventual}</th>
              <th className={THN}>{t.attempts}</th>
              <th className={THN}>{t.firstScore}</th>
              <th className={THN}>{t.stuck}</th>
              <th className={THN}>{t.learnersCol}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const label = bossLabel(r.milestoneId, r.afterWeekNumber, r.subjectId);
              return (
                <tr key={`${r.milestoneId}:${r.group}`} className="border-b border-gray-100 last:border-0">
                  <td className={TD}>
                    {r.group === "all" || !showGroups ? (
                      <>
                        <span className="block text-sm font-medium text-gray-900">{label.main}</span>
                        {label.sub && <span className="block text-xs text-gray-500">{label.sub}</span>}
                      </>
                    ) : null}
                  </td>
                  <GroupCell show={showGroups} row={r} g={g} />
                  <td className={`${TD} text-end`}><Cell value={r.firstTryPassRate} kind="rate" lang={lang} suppressed={r.suppressed} /></td>
                  <td className={`${TD} text-end`}><Cell value={r.eventualPassRate} kind="rate" lang={lang} suppressed={r.suppressed} /></td>
                  <td className={`${TD} text-end`}><Cell value={r.medianAttemptsToPass} kind="decimal" lang={lang} suppressed={r.suppressed} /></td>
                  <td className={`${TD} text-end`}><Cell value={r.medianFirstTryScore} kind="score" lang={lang} suppressed={r.suppressed} /></td>
                  <td className={`${TD} text-end`}><Cell value={r.stuckLearners} kind="int" lang={lang} suppressed={r.suppressed} /></td>
                  <td className={`${TD} text-end text-gray-500`}><Cell value={r.learners} kind="int" lang={lang} suppressed={r.suppressed} /></td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </Section>
  );
}

function StuckSkills({ report, lang, labels, g, showGroups }: GroupedProps) {
  const t = IMPACT_COPY[lang];
  const keys = [...new Set(report.stuckSkills.map((r) => `${r.subjectId}|${r.skillKey}`))];
  return (
    <Section title={t.stuckTitle} info={t.stuckInfo} labels={labels}>
      {keys.length === 0 ? (
        <Empty>{t.empty}</Empty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {keys.map((key) =>
            byGroup(report.stuckSkills.filter((r) => `${r.subjectId}|${r.skillKey}` === key))
              .filter((r) => r.group === "all" || showGroups)
              .map((r) => {
                const label = lang === "ar" ? r.labelAr : r.labelEn;
                const tip = r.suppressed
                  ? formatCell(null, "rate", lang, true).hint
                  : `${label}${showGroups ? ` · ${g(r.group)}` : ""}: ${t.stuckRate} ${formatCell(r.stuckRate, "rate", lang).text}; ${t.firstTryRate} ${formatCell(r.firstTryRate, "rate", lang).text}; ${formatCell(r.learners, "int", lang).text} ${t.learnersCol}`;
                return (
                  <li key={`${key}:${r.group}`} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[minmax(0,32%)_1fr_auto]">
                    <span className={`truncate text-xs ${r.group === "all" ? "font-medium text-gray-800" : "ps-3 text-gray-500"}`} title={label}>
                      {r.group === "all" ? label : g(r.group)}
                    </span>
                    <Bar value={r.suppressed ? null : r.stuckRate} max={1} color={VIZ.orange} tip={tip} label={<Cell value={r.stuckRate} kind="rate" lang={lang} suppressed={r.suppressed} />} />
                    <span className="hidden w-36 whitespace-nowrap text-end text-[11px] text-gray-500 sm:block">
                      {t.firstTryRate} <Cell value={r.firstTryRate} kind="rate" lang={lang} suppressed={r.suppressed} />
                    </span>
                  </li>
                );
              })
          )}
        </ul>
      )}
    </Section>
  );
}

function Pace({ report, lang, labels, g, showGroups, bossLabel }: GroupedProps & { bossLabel: BossLabel }) {
  const t = IMPACT_COPY[lang];
  const rows = [...report.pace]
    .filter((r) => r.group === "all" || showGroups)
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.afterWeekNumber - b.afterWeekNumber || (a.group === "all" ? -1 : b.group === "all" ? 1 : 0));
  const max = Math.max(4, ...rows.map((r) => Math.max(r.expectedWeeks, r.p75WeeksToPass ?? 0))) * 1.15;
  return (
    <Section title={t.paceTitle} info={t.paceInfo} labels={labels}>
      {rows.length === 0 ? (
        <Empty>{t.empty}</Empty>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => {
              const label = bossLabel(r.milestoneId, r.afterWeekNumber, r.subjectId);
              const tip = r.suppressed
                ? formatCell(null, "weeks", lang, true).hint
                : `${label.main}${showGroups ? ` · ${g(r.group)}` : ""}: ${t.medianWeeks} ${formatCell(r.medianWeeksToPass, "weeks", lang).text} (${formatCell(r.p25WeeksToPass, "weeks", lang).text}–${formatCell(r.p75WeeksToPass, "weeks", lang).text}); ${t.expected} ${formatCell(r.expectedWeeks, "weeks", lang).text}`;
              return (
                <li key={`${r.milestoneId}:${r.group}`} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[minmax(0,32%)_1fr_auto]">
                  <span className={`truncate text-xs ${r.group === "all" ? "font-medium text-gray-800" : "ps-3 text-gray-500"}`}>{r.group === "all" ? label.main : g(r.group)}</span>
                  <RangeDot p25={r.suppressed ? null : r.p25WeeksToPass} median={r.suppressed ? null : r.medianWeeksToPass} p75={r.suppressed ? null : r.p75WeeksToPass} expected={r.expectedWeeks} max={max} tip={tip} />
                  <span className="w-16 text-end text-xs font-semibold text-gray-800">
                    <Cell value={r.medianWeeksToPass} kind="weeks" lang={lang} suppressed={r.suppressed} />
                  </span>
                </li>
              );
            })}
          </ul>
          <PaceKey lang={lang} />
        </>
      )}
    </Section>
  );
}

function PaceKey({ lang }: { lang: UiLang }) {
  const t = IMPACT_COPY[lang];
  return (
    <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: VIZ.blue }} />{t.medianWeeks}</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-5 rounded-full" style={{ background: VIZ.blueLight }} />25–75%</span>
      <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 rounded bg-gray-500" />{t.expected}</span>
    </p>
  );
}

function Engagement({ report, lang, labels, g, caveats }: SectionProps & { g: (group: string) => string; caveats: readonly string[] }) {
  const t = IMPACT_COPY[lang];
  const weeks = report.engagement.weeks;
  const rows = byGroup(report.engagement.rows);
  const max = Math.max(4, ...rows.map((r) => r.p75ActiveWeeks ?? 0)) * 1.15;
  return (
    <Section title={t.engagementTitle} info={t.engagementInfo} caveats={caveats.slice(3, 4)} labels={labels}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-700">{t.activePerWeek}</p>
          {weeks.length === 0 ? (
            <Empty>{t.empty}</Empty>
          ) : (
            <Columns
              ariaLabel={t.activePerWeek}
              items={weeks.map((w) => ({
                key: w.weekStart,
                value: w.suppressed ? null : w.activeLearners,
                suppressed: w.suppressed,
                tick: formatDay(w.weekStart, lang),
                tip: w.suppressed
                  ? `${formatDay(w.weekStart, lang)}: ${formatCell(null, "int", lang, true).hint}`
                  : `${formatDay(w.weekStart, lang)}: ${formatCell(w.activeLearners, "int", lang).text} ${t.learnersCol} · ${formatCell(w.completions, "int", lang).text} ${t.completions}`,
              }))}
            />
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-700">{t.activeWeeks}</p>
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.group} className="grid grid-cols-[minmax(0,34%)_1fr_auto] items-center gap-2 py-1.5">
                <span className={`truncate text-xs ${r.group === "all" ? "font-medium text-gray-800" : "text-gray-500"}`}>{g(r.group)}</span>
                <RangeDot
                  p25={r.suppressed ? null : r.p25ActiveWeeks}
                  median={r.suppressed ? null : r.medianActiveWeeks}
                  p75={r.suppressed ? null : r.p75ActiveWeeks}
                  max={max}
                  tip={
                    r.suppressed
                      ? formatCell(null, "int", lang, true).hint
                      : `${g(r.group)}: ${formatCell(r.medianActiveWeeks, "decimal", lang).text} (${formatCell(r.p25ActiveWeeks, "decimal", lang).text}–${formatCell(r.p75ActiveWeeks, "decimal", lang).text}) · ${formatCell(r.lessonsPerActiveWeek, "decimal", lang).text} ${t.tiles.lessonsPerWeek} · ${formatCell(r.activeLearners, "int", lang).text} ${t.tiles.active}`
                  }
                />
                <span className="w-10 text-end text-xs font-semibold text-gray-800">
                  <Cell value={r.medianActiveWeeks} kind="decimal" lang={lang} suppressed={r.suppressed} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Retention({ report, lang, labels, g, showGroups }: GroupedProps) {
  const t = IMPACT_COPY[lang];
  const rows = [...report.retention]
    .filter((r) => r.group === "all" || showGroups)
    .sort((a, b) => a.cohortStart.localeCompare(b.cohortStart) || (a.group === "all" ? -1 : b.group === "all" ? 1 : 0));
  const keys = ["week1", "week2", "week4", "week8", "week12"] as const;
  return (
    <Section title={t.retentionTitle} info={t.retentionInfo} labels={labels}>
      {rows.length === 0 ? (
        <Empty>{t.empty}</Empty>
      ) : (
        <TableWrap minWidth={showGroups ? 600 : 520}>
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>{t.cohort}</th>
              {showGroups && <th className={TH}>{t.groupCol}</th>}
              <th className={THN}>{t.learnersCol}</th>
              {keys.map((k) => (
                <th key={k} className={`${THN} !text-center`}>{t.weekN(Number(k.slice(4)))}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.cohortStart}:${r.group}`}>
                <td className={`${TD} whitespace-nowrap text-xs`}>{r.group === "all" || !showGroups ? formatDay(r.cohortStart, lang) : ""}</td>
                <GroupCell show={showGroups} row={r} g={g} />
                <td className={`${TD} text-end text-xs text-gray-500`}><Cell value={r.learners} kind="int" lang={lang} suppressed={r.suppressed} /></td>
                {keys.map((k) => {
                  const v = r[k];
                  if (r.suppressed) {
                    return (
                      <td key={k} className="p-0.5 text-center">
                        <span className="block rounded bg-gray-50 py-1.5 text-xs"><Cell value={null} kind="rate" lang={lang} suppressed /></span>
                      </td>
                    );
                  }
                  if (v === null) return <td key={k} className="p-0.5" />;
                  const color = heatColor(v);
                  return (
                    <td key={k} className="p-0.5 text-center">
                      <Tip label={`${formatDay(r.cohortStart, lang)} · ${t.weekN(Number(k.slice(4)))}: ${formatCell(v, "rate", lang).text}`} className="w-full">
                        <span className="block w-full rounded py-1.5 text-xs font-semibold tabular-nums" style={color}>
                          {formatCell(v, "rate", lang).text}
                        </span>
                      </Tip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Section>
  );
}

function Coverage({ report, lang, labels, g, showGroups, subjectName }: GroupedProps & { subjectName: (id: string) => string | null }) {
  const t = IMPACT_COPY[lang];
  const rows = [...report.placement]
    .filter((r) => r.group === "all" || showGroups)
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId) || (a.group === "all" ? -1 : b.group === "all" ? 1 : 0));
  // Late placements (everyone may play once): shown when the server reports them.
  const hasLate = rows.some((r) => r.lateBaselines !== undefined);
  return (
    <Section title={t.placementTitle} info={t.placementInfo} labels={labels}>
      {rows.length === 0 ? (
        <Empty>{t.empty}</Empty>
      ) : (
        <TableWrap minWidth={showGroups ? 560 : 460}>
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>{t.subject}</th>
              {showGroups && <th className={TH}>{t.groupCol}</th>}
              <th className={THN}>{t.started}</th>
              <th className={THN}>{t.met}</th>
              <th className={THN}>{t.valid}</th>
              {hasLate && <th className={THN}>{t.late}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.subjectId}:${r.group}`} className="border-b border-gray-100 last:border-0">
                <td className={`${TD} text-sm`}>{r.group === "all" || !showGroups ? subjectName(r.subjectId) : ""}</td>
                <GroupCell show={showGroups} row={r} g={g} />
                <td className={`${TD} text-end`}><Cell value={r.startedPath} kind="int" lang={lang} suppressed={r.suppressed} /></td>
                <td className={`${TD} text-end`}>
                  <Cell value={r.placementsCompleted} kind="int" lang={lang} suppressed={r.suppressed} />
                  {!r.suppressed && r.startedPath ? <span className="ms-1 text-xs text-gray-400">({formatCell((r.placementsCompleted ?? 0) / r.startedPath, "rate", lang).text})</span> : null}
                </td>
                <td className={`${TD} text-end`}><Cell value={r.validBaselines} kind="int" lang={lang} suppressed={r.suppressed} /></td>
                {hasLate && <td className={`${TD} text-end`}><Cell value={r.lateBaselines ?? null} kind="int" lang={lang} suppressed={r.suppressed} /></td>}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Section>
  );
}

const FLAG_STYLE: Record<ItemFlag, { icon: LucideIcon; className: string }> = {
  too_hard: { icon: ArrowUp, className: "bg-red-50 text-red-800 ring-red-200" },
  too_easy: { icon: ArrowDown, className: "bg-amber-50 text-amber-800 ring-amber-200" },
  not_discriminating: { icon: EqualApproximately, className: "bg-orange-50 text-orange-800 ring-orange-200" },
  difficulty_mismatch: { icon: ArrowLeftRight, className: "bg-violet-50 text-violet-800 ring-violet-200" },
  low_n: { icon: Dot, className: "bg-gray-50 text-gray-600 ring-gray-200" },
};

function FlagIcon({ flag, className }: { flag: ItemFlag; className: string }) {
  const Icon = FLAG_STYLE[flag].icon;
  return <Icon className={className} aria-hidden="true" />;
}

function QuestionQuality({ report, lang, labels, flag, setFlag, caveats }: SectionProps & { flag: ItemFlag | null; setFlag: (f: ItemFlag | null) => void; caveats: readonly string[] }) {
  const t = IMPACT_COPY[lang];
  const skillLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of [...report.growth.skills, ...report.stuckSkills]) map.set(s.skillKey, lang === "ar" ? s.labelAr : s.labelEn);
    return map;
  }, [lang, report]);
  const counts = new Map<ItemFlag, number>();
  for (const item of report.itemQa) for (const f of item.flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  const items: ItemQaRow[] = flag ? report.itemQa.filter((i) => i.flags.includes(flag)) : report.itemQa;
  return (
    <Section title={t.qaTitle} info={t.qaInfo} caveats={caveats.slice(0, 1)} labels={labels}>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t.flags}>
        <button type="button" role="radio" aria-checked={flag === null} onClick={() => setFlag(null)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${flag === null ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-600 ring-gray-200"}`}>
          {t.allFlags} · {formatInt(report.itemQa.length, lang)}
        </button>
        {FLAGS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={flag === f}
            onClick={() => setFlag(flag === f ? null : f)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${flag === f ? "bg-gray-900 text-white ring-gray-900" : FLAG_STYLE[f].className}`}
          >
            <FlagIcon flag={f} className="h-3 w-3" />
            {t.flagLabels[f]} · {formatInt(counts.get(f) ?? 0, lang)}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <Empty>{t.noItems}</Empty>
      ) : (
        <TableWrap minWidth={820}>
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>{t.question}</th>
              <th className={TH}>{t.skill}</th>
              <th className={TH}>{t.difficulty}</th>
              <th className={THN}>{t.pValue}</th>
              <th className={THN}>{t.discrimination}</th>
              <th className={THN}>{t.responses}</th>
              <th className={TH}>{t.flags}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.questionId} className="border-b border-gray-100 last:border-0">
                <td className={`${TD} max-w-[280px]`}>
                  <span className="line-clamp-2 text-xs text-gray-800" dir="auto">{item.promptPreview}</span>
                  {item.kind === "placement" && <span className="mt-0.5 inline-block rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{t.placementKind}</span>}
                </td>
                <td className={`${TD} max-w-[160px] truncate text-xs text-gray-600`}>{item.skillKey ? skillLabel.get(item.skillKey) ?? item.skillKey : "·"}</td>
                <td className={`${TD} text-xs text-gray-600`}>{item.difficulty ? t.difficultyLabels[item.difficulty] : "·"}</td>
                <td className={`${TD} text-end text-xs`}><Cell value={item.pValue} kind="decimal2" lang={lang} suppressed={item.suppressed} /></td>
                <td className={`${TD} text-end text-xs`}><Cell value={item.discrimination} kind="decimal2" lang={lang} suppressed={item.suppressed} /></td>
                <td className={`${TD} text-end text-xs text-gray-500`}><Cell value={item.responses} kind="int" lang={lang} suppressed={item.suppressed} /></td>
                <td className={TD}>
                  <span className="flex flex-wrap gap-1">
                    {item.flags.map((f) => (
                      <span key={f} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${FLAG_STYLE[f].className}`}>
                        <FlagIcon flag={f} className="h-2.5 w-2.5" />
                        {t.flagLabels[f]}
                      </span>
                    ))}
                  </span>
                </td>
                <td className={`${TD} text-end`}>
                  <Link href={`/teacher/milestones/${item.milestoneId}`} className="text-xs font-semibold text-emerald-700 hover:underline">
                    {t.openItem}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Section>
  );
}
