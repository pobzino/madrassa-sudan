"use client";

import AmalLoading from "@/components/AmalLoading";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BOSS_KEYS, type BossBookEntry, type BossBookResponse, type Lang } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { FitBoss } from "./Characters";
import { MilestoneApiError, type Fetcher } from "./api";
import { formatDate, formatNumber } from "./copy";
import { BOSS_FACTS, BOSS_SUBJECTS } from "./signatures";

const COPY = {
  en: {
    title: "Boss Book",
    sub: "Every boss you beat joins your book.",
    unknown: "???",
    guards: (subject: string, weeks: string) => `Guards ${subject}${weeks}`,
    weeks: (a: string, b: string) => `, weeks ${a}–${b}`,
    beaten: (date: string) => `Beaten ${date}`,
    times: (n: string) => `${n} times`,
    certificate: "Certificate",
    loading: "Opening your Boss Book...",
    error: "We couldn't open the Boss Book. Please try again.",
    back: "Back to lessons",
  },
  ar: {
    title: "كتاب الوحوش",
    sub: "كل وحش تهزمه ينضم إلى كتابك.",
    unknown: "؟؟؟",
    guards: (subject: string, weeks: string) => `يحرس ${subject}${weeks}`,
    weeks: (a: string, b: string) => `، الأسابيع ${a}–${b}`,
    beaten: (date: string) => `هُزم في ${date}`,
    times: (n: string) => `${n} مرات`,
    certificate: "الشهادة",
    loading: "نفتح كتاب الوحوش...",
    error: "لم نتمكن من فتح كتاب الوحوش. حاول مرة أخرى.",
    back: "العودة للدروس",
  },
} as const;

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

/** The learner's Boss Book: beaten bosses in full colour, the rest as "???" silhouettes. */
export default function BossBook({ lang, fetcher }: { lang: Lang; fetcher: Fetcher }) {
  const t = COPY[lang];
  const [entries, setEntries] = useState<BossBookEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current("/api/milestones/boss-book", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new MilestoneApiError(response.status, "unknown", null);
        return (await response.json()) as BossBookResponse;
      })
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const font = { fontFamily: lang === "ar" ? "var(--font-cairo), var(--font-fredoka), sans-serif" : "var(--font-fredoka), system-ui, sans-serif" };
  // Beaten first, then met, then the rest, in a stable boss order.
  const ordered = entries
    ? [...entries].sort((a, b) => (b.beatenCount > 0 ? 2 : b.met ? 1 : 0) - (a.beatenCount > 0 ? 2 : a.met ? 1 : 0) || BOSS_KEYS.indexOf(a.bossKey) - BOSS_KEYS.indexOf(b.bossKey))
    : null;

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto w-full max-w-3xl px-4 py-6" style={font}>
      <header className="mb-5 text-center">
        <h1 className="text-[34px] font-bold leading-tight text-[#007229]">{t.title}</h1>
        <p className="mt-1 text-lg font-semibold text-gray-600">{t.sub}</p>
      </header>

      {!ordered ? (
        failed ? (
          <p className="py-16 text-center text-xl font-semibold text-gray-600">{t.error}</p>
        ) : (
          <AmalLoading message={t.loading} dir={lang === "ar" ? "rtl" : "ltr"} />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {ordered.map((entry) => {
            const beaten = entry.beatenCount > 0;
            const subject = entry.subject ? (lang === "ar" ? entry.subject.nameAr : entry.subject.nameEn) ?? BOSS_SUBJECTS[entry.bossKey][lang] : BOSS_SUBJECTS[entry.bossKey][lang];
            const weeks = entry.weeks ? t.weeks(formatNumber(entry.weeks.first, lang), formatNumber(entry.weeks.last, lang)) : "";
            return (
              <li key={entry.bossKey} id={entry.bossKey}>
                <div
                  className={`flex h-full flex-col items-center rounded-[24px] p-3 text-center ${
                    beaten ? "bg-[linear-gradient(180deg,#0B4A26,#08361C)] text-white shadow-[0_6px_0_#052814]" : "bg-[#EEF2EF] text-gray-600 shadow-[0_6px_0_#D5DDD7]"
                  }`}
                >
                  <div className={`relative grid aspect-square w-full max-w-[150px] place-items-center rounded-full ${beaten ? "bg-[radial-gradient(circle,#FDE68A_0%,rgba(253,230,138,0)_70%)]" : ""}`}>
                    <FitBoss
                      bossKey={entry.bossKey}
                      pose={beaten ? "ko" : entry.met ? "taunt" : "sleep"}
                      className={`h-full w-full ${beaten ? "" : entry.met ? "[filter:grayscale(0.7)_opacity(0.75)]" : "[filter:brightness(0)_opacity(0.22)]"}`}
                      title={beaten || entry.met ? BOSS_NAMES[entry.bossKey][lang] : undefined}
                    />
                  </div>
                  <p className={`mt-4 text-xl font-bold leading-tight ${beaten || entry.met ? "" : "tracking-widest"}`}>
                    {beaten || entry.met ? BOSS_NAMES[entry.bossKey][lang] : t.unknown}
                  </p>
                  {beaten ? (
                    <>
                      <p className="mt-1 text-sm font-semibold leading-snug text-[#D1FAE5]">{BOSS_FACTS[entry.bossKey][lang]}</p>
                      {entry.starsKept && (
                        <div className="mt-2 flex gap-0.5" role="img" aria-label={`${formatNumber(entry.starsKept, lang)} / ${formatNumber(3, lang)}`}>
                          {[1, 2, 3].map((n) => (
                            <svg key={n} viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                              <path d={STAR_PATH} fill={n <= (entry.starsKept ?? 0) ? "#F59E0B" : "none"} stroke={n <= (entry.starsKept ?? 0) ? "#F59E0B" : "rgba(255,255,255,0.5)"} strokeWidth={1.6} />
                            </svg>
                          ))}
                        </div>
                      )}
                      {entry.beatenAt && <p className="mt-1 text-xs font-semibold text-white/80">{t.beaten(formatDate(entry.beatenAt, lang))}</p>}
                      {entry.certificateId && (
                        <Link
                          href={`/certificates/${entry.certificateId}`}
                          className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#F59E0B] px-4 text-base font-bold text-[#3B1D00] shadow-[0_3px_0_#92400E]"
                        >
                          {t.certificate}
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-semibold leading-snug">{t.guards(subject, weeks)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 text-center">
        <Link href="/lessons" className="text-base font-semibold text-[#007229] underline-offset-4 hover:underline">
          {t.back}
        </Link>
      </div>
    </div>
  );
}
