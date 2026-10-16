"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cell, StatTile, TableWrap, TD, TH, THN } from "./ImpactParts";
import { formatInt, type UiLang } from "./format";
import { CLASS_COPY } from "./classCopy";
import { scopeApi, type SchoolOverviewResponse } from "./scopeApi";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** A school admin's view across the school's classes (aggregates only, small groups hidden). */
export default function SchoolOverview({ lang, fetcher = (i, init) => fetch(i, init) }: { lang: UiLang; fetcher?: Fetcher }) {
  const t = CLASS_COPY[lang];
  const [data, setData] = useState<SchoolOverviewResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const body = await scopeApi.schoolOverview(fetcherRef.current);
        if (!cancelled) {
          setData(body);
          setStatus("ready");
        }
      } catch (e) {
        const code = (e as { status?: number }).status;
        if (!cancelled) setStatus(code === 403 || code === 401 ? "forbidden" : "error");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{data ? `${t.schoolTitle} · ${data.school.name}` : t.schoolTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.schoolSub}</p>
        </div>
        <Link href="/teacher/impact" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          {lang === "ar" ? "أثر التعلّم" : "Learning impact"}
        </Link>
      </div>
      {status === "loading" && <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-busy="true" />}
      {status === "forbidden" && <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">{t.notSchoolAdmin}</p>}
      {status === "error" && <p className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">{t.errors.generic}</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatTile label={t.classes}>{formatInt(data.totals?.classes ?? data.classes.length, lang)}</StatTile>
            <StatTile label={t.children}>
              <Cell value={data.totals?.learners ?? null} kind="int" lang={lang} suppressed={data.totals?.suppressed} />
            </StatTile>
            <StatTile label={t.activeThisMonth}>
              <Cell value={data.totals?.activeThisMonth ?? null} kind="int" lang={lang} suppressed={data.totals?.suppressed} />
            </StatTile>
          </div>
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
            <TableWrap minWidth={620}>
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={TH}>{t.className}</th>
                  <th className={TH}>{t.teachers}</th>
                  <th className={THN}>{t.children}</th>
                  <th className={THN}>{t.activeThisMonth}</th>
                  <th className={THN}>{t.growth}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.cohortId} className="border-b border-gray-100 last:border-0">
                    <td className={`${TD} font-medium text-gray-900`}>{c.name}</td>
                    <td className={`${TD} text-xs text-gray-600`}>{c.teacherNames.join(", ") || "·"}</td>
                    <td className={`${TD} text-end`}><Cell value={c.learners} kind="int" lang={lang} suppressed={c.suppressed} /></td>
                    <td className={`${TD} text-end`}><Cell value={c.activeThisMonth} kind="int" lang={lang} suppressed={c.suppressed} /></td>
                    <td className={`${TD} text-end`}><Cell value={c.medianGrowth} kind="points" lang={lang} suppressed={c.suppressed} /></td>
                    <td className={`${TD} text-end`}>
                      <Link href={`/teacher/school/classes/${c.cohortId}`} className="text-xs font-semibold text-emerald-700 hover:underline">{t.open}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </section>
        </>
      )}
    </div>
  );
}
