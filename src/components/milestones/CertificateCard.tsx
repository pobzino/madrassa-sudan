"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Printer } from "lucide-react";
import { MadrassaLogo } from "@/components/illustrations";
import LearnerAvatarIcon from "@/components/learners/LearnerAvatarIcon";
import type { CertificateView, Lang } from "@/lib/milestones/types";
import { BOSS_NAMES, milestoneBlockWeeks } from "@/lib/milestones/rules";
import { FitBoss, FitOwl } from "./Characters";
import { MilestoneApiError, milestoneApi, type Fetcher } from "./api";
import { formatDate, formatNumber } from "./copy";

const COPY = {
  en: {
    title: "Certificate of Achievement",
    awardedTo: "Awarded to",
    beat: (boss: string) => `for defeating ${boss}`,
    bigChallenge: "in the Big Challenge",
    weeks: (subject: string, a: string, b: string) => `${subject}${subject ? " · " : ""}Weeks ${a}–${b}`,
    stars: (n: string) => `${n} of 3 stars`,
    print: "Print",
    bossBook: "Boss Book",
    back: "Back to lessons",
    loading: "Getting your certificate...",
    notFound: "We couldn't find this certificate.",
    error: "Something went wrong. Please try again.",
  },
  ar: {
    title: "شهادة إنجاز",
    awardedTo: "تُمنح إلى",
    beat: (boss: string) => `للفوز على ${boss}`,
    bigChallenge: "في التحدي الكبير",
    weeks: (subject: string, a: string, b: string) => `${subject}${subject ? " · " : ""}الأسابيع ${a}–${b}`,
    stars: (n: string) => `${n} من ٣ نجوم`,
    print: "طباعة",
    bossBook: "كتاب الوحوش",
    back: "العودة للدروس",
    loading: "نجهّز شهادتك...",
    notFound: "لم نجد هذه الشهادة.",
    error: "حدث خطأ. حاول مرة أخرى.",
  },
} as const;

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

/**
 * The printable certificate. Fetched WITHOUT the learner header: the server
 * authorises it by account ownership, so a parent can open the link from the
 * notification whichever child is active.
 */
export default function CertificateCard({ certificateId, lang, fetcher }: { certificateId: string; lang: Lang; fetcher: Fetcher }) {
  const t = COPY[lang];
  const [view, setView] = useState<CertificateView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    milestoneApi
      .certificate(fetcher, certificateId)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        setState("ready");
      })
      .catch((error) => {
        if (!cancelled) setState(error instanceof MilestoneApiError && error.status === 404 ? "not_found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId, fetcher]);

  const font = { fontFamily: lang === "ar" ? "var(--font-cairo), var(--font-fredoka), sans-serif" : "var(--font-fredoka), system-ui, sans-serif" };

  if (state !== "ready" || !view) {
    return (
      <div dir={lang === "ar" ? "rtl" : "ltr"} className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center" style={font}>
        <FitOwl pose={state === "loading" ? "think" : "wrong"} className="h-32 w-32" />
        <p className="text-xl font-semibold text-gray-700" role={state === "loading" ? "status" : undefined}>
          {state === "loading" ? t.loading : state === "not_found" ? t.notFound : t.error}
        </p>
        {state !== "loading" && (
          <Link href="/lessons" className="font-semibold text-[#007229] underline-offset-4 hover:underline">
            {t.back}
          </Link>
        )}
      </div>
    );
  }

  const subject = (lang === "ar" ? view.subjectNameAr : view.subjectNameEn) ?? "";
  const weeks = milestoneBlockWeeks(view.afterWeekNumber);
  const bossFull = BOSS_NAMES[view.bossKey][lang];

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10" style={font}>
      {/* Print only the certificate, on one page. */}
      <style>{`@media print {
        @page { size: A4 landscape; margin: 12mm; }
        body * { visibility: hidden !important; }
        #amal-certificate, #amal-certificate * { visibility: visible !important; }
        #amal-certificate { position: fixed; inset: 0; margin: auto; box-shadow: none !important; }
      }`}</style>

      <article
        id="amal-certificate"
        className="relative overflow-hidden rounded-[28px] border-[6px] border-[#F59E0B] bg-[#FFFBF2] p-6 text-center text-[#1a1a1a] shadow-[0_10px_30px_rgba(0,0,0,0.12)] sm:p-10"
      >
        {/* Sudan-flag ribbon and a Nubian zigzag border */}
        <div className="absolute inset-x-0 top-0 flex h-2" aria-hidden="true">
          <span className="flex-1 bg-[#D21034]" />
          <span className="flex-1 bg-white" />
          <span className="flex-1 bg-[#1a1a1a]" />
          <span className="flex-1 bg-[#007229]" />
        </div>
        <svg className="absolute inset-x-0 bottom-0 h-4 w-full" viewBox="0 0 400 16" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 20 }, (_, i) => (
            <path key={i} d={`M${i * 20} 16 L${i * 20 + 10} 2 L${i * 20 + 20} 16Z`} fill={["#007229", "#F59E0B", "#D21034"][i % 3]} />
          ))}
        </svg>

        <div className="flex justify-center">
          <MadrassaLogo size="sm" />
        </div>
        <h1 className="mt-3 text-[clamp(28px,6vw,40px)] font-bold leading-tight text-[#007229]">{t.title}</h1>
        <p className="mt-3 text-lg font-semibold text-gray-600">{t.awardedTo}</p>
        <div className="mt-2 flex items-center justify-center gap-3">
          {view.learnerAvatar && <LearnerAvatarIcon avatar={view.learnerAvatar} className="h-16 w-16" />}
          <p className="text-[clamp(30px,7vw,46px)] font-bold leading-tight">{view.learnerName}</p>
        </div>
        <p className="mt-2 text-xl font-semibold">
          {t.beat(bossFull)} <span className="text-gray-600">{t.bigChallenge}</span>
        </p>
        <p className="mt-1 text-base font-semibold text-[#B45309]">
          {t.weeks(subject, formatNumber(weeks[0], lang), formatNumber(weeks[weeks.length - 1], lang))}
        </p>

        <div className="mt-4 flex items-end justify-center gap-2" aria-hidden="true">
          <FitOwl pose="cheer" className="h-28 w-28" />
          <FitBoss bossKey={view.bossKey} pose="ko" className="h-32 w-32" />
        </div>

        <div className="mt-3 flex justify-center gap-1" role="img" aria-label={t.stars(formatNumber(view.stars, lang))}>
          {[1, 2, 3].map((n) => (
            <svg key={n} viewBox="0 0 24 24" className="h-10 w-10" aria-hidden="true">
              <path d={STAR_PATH} fill={n <= view.stars ? "#F59E0B" : "none"} stroke={n <= view.stars ? "#F59E0B" : "#D6CFC2"} strokeWidth={1.6} strokeLinejoin="round" />
            </svg>
          ))}
        </div>
        <p className="mt-2 pb-3 text-base font-semibold text-gray-600">{formatDate(view.awardedAt, lang)}</p>
      </article>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#2FB25A_0%,#007229_55%,#005C22_100%)] px-6 text-xl font-bold text-white shadow-[0_5px_0_#00451A]"
        >
          <Printer className="h-6 w-6" aria-hidden="true" />
          {t.print}
        </button>
        <Link href="/boss-book" className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#F59E0B] bg-white px-6 text-xl font-bold text-[#B45309]">
          <BookOpen className="h-6 w-6" aria-hidden="true" />
          {t.bossBook}
        </Link>
      </div>
      <div className="mt-3 text-center print:hidden">
        <Link href="/lessons" className="text-base font-semibold text-[#007229] underline-offset-4 hover:underline">
          {t.back}
        </Link>
      </div>
    </div>
  );
}
