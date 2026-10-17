"use client";

import AmalLoading from "@/components/AmalLoading";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BossAlbum, BossBookResponse, BossSticker, Lang } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { FitBoss } from "./Characters";
import { MilestoneApiError, type Fetcher } from "./api";
import { formatDate, formatNumber } from "./copy";
import { BOSS_FACTS } from "./signatures";

const COPY = {
  en: {
    title: "Boss Book",
    sub: "Every boss you beat gives you a sticker.",
    progress: (earned: string, total: string) => `${earned} / ${total} stickers`,
    albumProgress: (earned: string, total: string) => `${earned} of ${total}`,
    starting: "Starting boss",
    weeks: (a: string, b: string) => `Weeks ${a}–${b}`,
    grand: "Grand Challenge",
    unknown: "???",
    lockedHint: (kind: "starting" | "boss" | "final", week: string) => (kind === "starting" ? "Meet it when you start the path" : kind === "final" ? "Beat it after your last week" : `Beat it after week ${week}`),
    metHint: (boss: string) => `Beat ${boss} to earn this sticker`,
    metStarting: (boss: string) => `Finish the battle with ${boss}`,
    earned: (date: string) => `Earned ${date}`,
    score: (correct: string, total: string) => `${correct} / ${total} at the start`,
    certificate: "Certificate",
    preview: "Preview",
    previewNote: "Stickers from your preview battles are shown here, but nothing is saved for a child.",
    loading: "Opening your Boss Book...",
    error: "We couldn't open the Boss Book. Please try again.",
    back: "Back to lessons",
    empty: "No bosses are ready yet. Keep learning!",
  },
  ar: {
    title: "كتاب الوحوش",
    sub: "كل وحش تهزمه يمنحك ملصقاً.",
    progress: (earned: string, total: string) => `${earned} / ${total} ملصقات`,
    albumProgress: (earned: string, total: string) => `${earned} من ${total}`,
    starting: "الوحش الأول",
    weeks: (a: string, b: string) => `الأسابيع ${a}–${b}`,
    grand: "التحدي الأكبر",
    unknown: "؟؟؟",
    lockedHint: (kind: "starting" | "boss" | "final", week: string) => (kind === "starting" ? "ستقابله عند بداية المسار" : kind === "final" ? "اهزمه بعد آخر أسبوع" : `اهزمه بعد الأسبوع ${week}`),
    metHint: (boss: string) => `اهزم ${boss} لتحصل على هذا الملصق`,
    metStarting: (boss: string) => `أكمل المعركة مع ${boss}`,
    earned: (date: string) => `حصلت عليه في ${date}`,
    score: (correct: string, total: string) => `${correct} / ${total} في البداية`,
    certificate: "الشهادة",
    preview: "معاينة",
    previewNote: "تظهر هنا ملصقات معارك المعاينة الخاصة بك، لكن لا يُحفظ شيء للطفل.",
    loading: "نفتح كتاب الوحوش...",
    error: "لم نتمكن من فتح كتاب الوحوش. حاول مرة أخرى.",
    back: "العودة للدروس",
    empty: "لا يوجد وحوش جاهزون بعد. واصل التعلّم!",
  },
} as const;

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";
/** A slight tilt per sticker, so the album looks stuck on by hand. */
const TILTS = [-4, 3, -2, 4, -3, 2];

/** The learner's Boss Book: a sticker album, one page per path, one sticker per boss. */
export default function BossBook({ lang, fetcher }: { lang: Lang; fetcher: Fetcher }) {
  const t = COPY[lang];
  const [book, setBook] = useState<BossBookResponse | null>(null);
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
        if (!cancelled) setBook(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const font = { fontFamily: lang === "ar" ? "var(--font-cairo), var(--font-fredoka), sans-serif" : "var(--font-fredoka), system-ui, sans-serif" };
  const hasPreview = book?.albums.some((album) => album.stickers.some((sticker) => sticker.preview)) ?? false;

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="mx-auto w-full max-w-3xl px-4 py-6" style={font}>
      <header className="mb-5 text-center">
        <h1 className="text-[34px] font-bold leading-tight text-[#007229]">{t.title}</h1>
        <p className="mt-1 text-lg font-semibold text-gray-600">{t.sub}</p>
        {book && book.total > 0 && (
          <div className="mx-auto mt-3 max-w-xs">
            <p className="text-base font-bold text-[#B45309]">{t.progress(formatNumber(book.earned, lang), formatNumber(book.total, lang))}</p>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-[#E5E7EB]" role="progressbar" aria-valuemin={0} aria-valuemax={book.total} aria-valuenow={book.earned}>
              <div className="h-full rounded-full bg-[linear-gradient(180deg,#FDE68A,#F59E0B)] transition-[width] duration-500" style={{ width: `${(book.earned / book.total) * 100}%` }} />
            </div>
          </div>
        )}
      </header>

      {!book ? (
        failed ? (
          <p className="py-16 text-center text-xl font-semibold text-gray-600">{t.error}</p>
        ) : (
          <AmalLoading message={t.loading} dir={lang === "ar" ? "rtl" : "ltr"} />
        )
      ) : book.albums.length === 0 ? (
        <p className="py-16 text-center text-xl font-semibold text-gray-600">{t.empty}</p>
      ) : (
        <div className="space-y-6">
          {hasPreview && <p className="rounded-2xl bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-[#92400E]">{t.previewNote}</p>}
          {book.albums.map((album) => (
            <AlbumPage key={album.pathId} album={album} lang={lang} />
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/lessons" className="text-base font-semibold text-[#007229] underline-offset-4 hover:underline">
          {t.back}
        </Link>
      </div>
    </div>
  );
}

function AlbumPage({ album, lang }: { album: BossAlbum; lang: Lang }) {
  const t = COPY[lang];
  const title = (lang === "ar" ? album.titleAr : album.titleEn ?? album.titleAr) || (lang === "ar" ? album.subject?.nameAr : album.subject?.nameEn) || "";
  const earned = album.stickers.filter((sticker) => sticker.state === "earned").length;
  return (
    <section aria-label={title} className="rounded-[28px] bg-[#FFF8EC] p-4 shadow-[0_6px_0_#E9D8B4]">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-bold leading-tight text-[#7C2D12]">{title}</h2>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-[#B45309]">{t.albumProgress(formatNumber(earned, lang), formatNumber(album.stickers.length, lang))}</span>
      </header>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {album.stickers.map((sticker, index) => (
          <Sticker key={sticker.id} sticker={sticker} lang={lang} tilt={TILTS[index % TILTS.length]} />
        ))}
      </ul>
    </section>
  );
}

function Sticker({ sticker, lang, tilt }: { sticker: BossSticker; lang: Lang; tilt: number }) {
  const t = COPY[lang];
  const name = BOSS_NAMES[sticker.bossKey][lang];
  const earned = sticker.state === "earned";
  const met = sticker.state === "met";
  const where = sticker.kind === "starting" ? t.starting : sticker.kind === "final" ? t.grand : sticker.weeks ? t.weeks(formatNumber(sticker.weeks.first, lang), formatNumber(sticker.weeks.last, lang)) : "";
  const ring = !earned ? "border-[#CBD5D1]" : sticker.kind === "final" ? "border-[#F59E0B]" : sticker.kind === "starting" ? "border-[#94A3B8]" : "border-[#007229]";
  const pose = earned ? (sticker.kind === "starting" ? "happy" : "ko") : met ? "taunt" : "sleep";
  return (
    <li id={sticker.id} className="flex flex-col items-center text-center">
      <div
        className={`relative grid aspect-square w-full max-w-[150px] place-items-center rounded-full border-[6px] bg-white shadow-[0_5px_0_rgba(0,0,0,0.12)] ${ring} ${earned ? "" : "border-dashed"}`}
        style={{ transform: `rotate(${tilt}deg)` }}
      >
        {earned && sticker.kind === "final" && <span className="absolute inset-1 rounded-full bg-[radial-gradient(circle,#FDE68A_0%,rgba(253,230,138,0)_72%)]" aria-hidden="true" />}
        <FitBoss
          bossKey={sticker.bossKey}
          pose={pose}
          className={`h-[82%] w-[82%] ${earned ? "" : met ? "[filter:grayscale(0.8)_opacity(0.7)]" : "[filter:brightness(0)_opacity(0.18)]"}`}
          title={earned || met ? name : undefined}
        />
        {earned && sticker.kind === "final" && (
          <svg viewBox="0 0 100 60" className="absolute -top-3 left-1/2 w-10 -translate-x-1/2" aria-hidden="true">
            <path d="M8 50 L14 16 L34 34 L50 8 L66 34 L86 16 L92 50 Z" fill="#F59E0B" stroke="#B45309" strokeWidth="4" strokeLinejoin="round" />
            <rect x="8" y="46" width="84" height="10" rx="4" fill="#FBBF24" stroke="#B45309" strokeWidth="4" />
            <circle cx="50" cy="26" r="6" fill="#D21034" />
          </svg>
        )}
        {sticker.preview && <span className="absolute -bottom-2 rounded-full bg-[#7C2D12] px-2 py-0.5 text-[11px] font-bold text-white">{t.preview}</span>}
      </div>
      <p className={`mt-3 text-lg font-bold leading-tight ${earned ? "text-[#1a1a1a]" : met ? "text-gray-700" : "tracking-widest text-gray-500"}`}>{earned || met ? name : t.unknown}</p>
      <p className="text-xs font-bold uppercase tracking-wide text-[#B45309]">{where}</p>
      {earned ? (
        <>
          {sticker.stars && (
            <div className="mt-1 flex gap-0.5" role="img" aria-label={`${formatNumber(sticker.stars, lang)} / ${formatNumber(3, lang)}`}>
              {[1, 2, 3].map((n) => (
                <svg key={n} viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                  <path d={STAR_PATH} fill={n <= (sticker.stars ?? 0) ? "#F59E0B" : "none"} stroke={n <= (sticker.stars ?? 0) ? "#F59E0B" : "#CBD5D1"} strokeWidth={1.6} />
                </svg>
              ))}
            </div>
          )}
          {sticker.score && <p className="mt-1 text-sm font-semibold text-gray-700">{t.score(formatNumber(sticker.score.correct, lang), formatNumber(sticker.score.total, lang))}</p>}
          <p className="mt-1 text-sm font-semibold leading-snug text-gray-600">{BOSS_FACTS[sticker.bossKey][lang]}</p>
          {sticker.earnedAt && <p className="mt-1 text-xs font-semibold text-gray-500">{t.earned(formatDate(sticker.earnedAt, lang))}</p>}
          {sticker.certificateId && (
            <Link href={`/certificates/${sticker.certificateId}`} className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#F59E0B] px-4 text-base font-bold text-[#3B1D00] shadow-[0_3px_0_#92400E]">
              {t.certificate}
            </Link>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold leading-snug text-gray-600">
          {met ? (sticker.kind === "starting" ? t.metStarting(name) : t.metHint(name)) : t.lockedHint(sticker.kind, formatNumber(sticker.weeks?.last ?? 0, lang))}
        </p>
      )}
    </li>
  );
}
