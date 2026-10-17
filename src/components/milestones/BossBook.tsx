"use client";

import AmalLoading from "@/components/AmalLoading";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { BossAlbum, BossBookResponse, BossSticker, Lang } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { FitBoss } from "./Characters";
import { MilestoneApiError, type Fetcher } from "./api";
import { bossName, formatDate, formatNumber } from "./copy";
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
    subjects: "Subjects",
    close: "Close",
    details: (boss: string) => `About ${boss}`,
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
    subjects: "المواد",
    close: "إغلاق",
    details: (boss: string) => `عن ${boss}`,
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
  const [tab, setTab] = useState<string | null>(null);
  const [open, setOpen] = useState<BossSticker | null>(null);
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
        if (cancelled) return;
        setBook(data);
        // Opened from a path node's link: show that sticker's album and scroll to it.
        const anchor = window.location.hash.slice(1);
        const target = anchor ? data.albums.find((album) => album.stickers.some((sticker) => sticker.id === anchor)) : null;
        if (target) {
          setTab(target.pathId);
          window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: "center" }), 50);
        }
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

  // One tab per subject. The first open goes to the album the page's #anchor points at,
  // else the first album with progress, else the first album.
  const albums = useMemo(() => book?.albums ?? [], [book]);
  const activeId = tab && albums.some((album) => album.pathId === tab) ? tab : defaultAlbum(albums);
  const active = albums.find((album) => album.pathId === activeId) ?? null;

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
      ) : book.albums.length === 0 || !active ? (
        <p className="py-16 text-center text-xl font-semibold text-gray-600">{t.empty}</p>
      ) : (
        <div className="space-y-4">
          {hasPreview && <p className="rounded-2xl bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-[#92400E]">{t.previewNote}</p>}
          {book.albums.length > 1 && (
            <div role="tablist" aria-label={t.subjects} className="flex gap-2 overflow-x-auto pb-1">
              {book.albums.map((album) => {
                const selected = album.pathId === active.pathId;
                const earned = album.stickers.filter((sticker) => sticker.state === "earned").length;
                return (
                  <button
                    key={album.pathId}
                    type="button"
                    role="tab"
                    id={`tab-${album.pathId}`}
                    aria-selected={selected}
                    aria-controls={`album-${album.pathId}`}
                    onClick={() => setTab(album.pathId)}
                    className={`flex min-h-12 shrink-0 items-center gap-2 rounded-full px-5 text-lg font-bold transition-colors ${
                      selected ? "bg-[#007229] text-white shadow-[0_4px_0_#052814]" : "bg-white text-[#7C2D12] shadow-[0_4px_0_#E9D8B4]"
                    }`}
                  >
                    {albumTitle(album, lang)}
                    <span className={`rounded-full px-2 py-0.5 text-sm ${selected ? "bg-white/20" : "bg-[#FFF8EC] text-[#B45309]"}`}>
                      {formatNumber(earned, lang)}/{formatNumber(album.stickers.length, lang)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <AlbumPage key={active.pathId} album={active} lang={lang} onOpen={setOpen} />
        </div>
      )}
      {open && <StickerSheet sticker={open} lang={lang} onClose={() => setOpen(null)} />}

      <div className="mt-6 text-center">
        <Link href="/lessons" className="text-base font-semibold text-[#007229] underline-offset-4 hover:underline">
          {t.back}
        </Link>
      </div>
    </div>
  );
}

/** The tab and page title: the subject's name, else the path's title. */
function albumTitle(album: BossAlbum, lang: Lang): string {
  const subject = lang === "ar" ? album.subject?.nameAr : album.subject?.nameEn ?? album.subject?.nameAr;
  return subject || (lang === "ar" ? album.titleAr : album.titleEn ?? album.titleAr) || "";
}

/** The album to open first: the first with any progress, else the first. */
function defaultAlbum(albums: BossAlbum[]): string | null {
  return (albums.find((album) => album.stickers.some((sticker) => sticker.state !== "locked")) ?? albums[0])?.pathId ?? null;
}

function AlbumPage({ album, lang, onOpen }: { album: BossAlbum; lang: Lang; onOpen: (sticker: BossSticker) => void }) {
  const t = COPY[lang];
  const title = albumTitle(album, lang);
  const earned = album.stickers.filter((sticker) => sticker.state === "earned").length;
  return (
    <section id={`album-${album.pathId}`} role="tabpanel" aria-labelledby={`tab-${album.pathId}`} className="rounded-[28px] bg-[#FFF8EC] p-4 shadow-[0_6px_0_#E9D8B4]">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-bold leading-tight text-[#7C2D12]">{title}</h2>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-[#B45309]">{t.albumProgress(formatNumber(earned, lang), formatNumber(album.stickers.length, lang))}</span>
      </header>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {album.stickers.map((sticker, index) => (
          <Sticker key={sticker.id} sticker={sticker} lang={lang} tilt={TILTS[index % TILTS.length]} onOpen={() => onOpen(sticker)} />
        ))}
      </ul>
    </section>
  );
}

/** What a sticker is for, in a few words: "Starting boss", "Weeks 1–4", "Grand Challenge". */
function stickerWhere(sticker: BossSticker, lang: Lang): string {
  const t = COPY[lang];
  if (sticker.kind === "starting") return t.starting;
  if (sticker.kind === "final") return t.grand;
  return sticker.weeks ? t.weeks(formatNumber(sticker.weeks.first, lang), formatNumber(sticker.weeks.last, lang)) : "";
}

function Stars({ stars, lang, size = "h-5 w-5" }: { stars: 1 | 2 | 3; lang: Lang; size?: string }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${formatNumber(stars, lang)} / ${formatNumber(3, lang)}`}>
      {[1, 2, 3].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={size} aria-hidden="true">
          <path d={STAR_PATH} fill={n <= stars ? "#F59E0B" : "none"} stroke={n <= stars ? "#F59E0B" : "#CBD5D1"} strokeWidth={1.6} />
        </svg>
      ))}
    </div>
  );
}

/** The round sticker itself: the boss, a ring that says earned / met / locked, the crown on a Grand Challenge. */
function StickerArt({ sticker, lang, tilt = 0, className = "" }: { sticker: BossSticker; lang: Lang; tilt?: number; className?: string }) {
  const t = COPY[lang];
  const name = BOSS_NAMES[sticker.bossKey][lang];
  const earned = sticker.state === "earned";
  const met = sticker.state === "met";
  const ring = !earned ? "border-[#CBD5D1]" : sticker.kind === "final" ? "border-[#F59E0B]" : sticker.kind === "starting" ? "border-[#94A3B8]" : "border-[#007229]";
  const pose = earned ? (sticker.kind === "starting" ? "happy" : "ko") : met ? "taunt" : "sleep";
  return (
    <div
      className={`relative grid aspect-square place-items-center rounded-full border-[6px] bg-white shadow-[0_5px_0_rgba(0,0,0,0.12)] ${ring} ${earned ? "" : "border-dashed"} ${className}`}
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
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
  );
}

/** In the album: the sticker, its name, where it lives and its stars. Tap for the rest. */
function Sticker({ sticker, lang, tilt, onOpen }: { sticker: BossSticker; lang: Lang; tilt: number; onOpen: () => void }) {
  const t = COPY[lang];
  const name = BOSS_NAMES[sticker.bossKey][lang];
  const known = sticker.state !== "locked";
  return (
    <li id={sticker.id}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${known ? name : t.unknown}, ${stickerWhere(sticker, lang)}`}
        className="flex w-full flex-col items-center rounded-[20px] p-1 text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 active:scale-95 motion-safe:transition-transform"
      >
        <StickerArt sticker={sticker} lang={lang} tilt={tilt} className="w-full max-w-[150px]" />
        <span className={`mt-3 line-clamp-1 text-base font-bold leading-tight ${known ? "text-[#1a1a1a]" : "tracking-widest text-gray-500"}`}>{known ? bossName(sticker.bossKey, lang, true) : t.unknown}</span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-[#B45309]">{stickerWhere(sticker, lang)}</span>
        {sticker.stars && <span className="mt-1"><Stars stars={sticker.stars} lang={lang} /></span>}
      </button>
    </li>
  );
}

/** The card behind a tapped sticker: the full name, where it lives, score, stars, the boss's fact, when it was earned, the certificate. */
function StickerSheet({ sticker, lang, onClose }: { sticker: BossSticker; lang: Lang; onClose: () => void }) {
  const t = COPY[lang];
  const name = BOSS_NAMES[sticker.bossKey][lang];
  const earned = sticker.state === "earned";
  const met = sticker.state === "met";
  const known = earned || met;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.details(known ? name : t.unknown)}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-sm rounded-[28px] bg-[#FFF8EC] px-5 pb-6 pt-14 text-center shadow-2xl motion-safe:animate-pop-in"
      >
        <button type="button" onClick={onClose} aria-label={t.close} className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white text-[#7C2D12] shadow">
          <X className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
        </button>
        <StickerArt sticker={sticker} lang={lang} className="mx-auto w-40" />
        <p className={`mt-4 text-2xl font-bold leading-tight ${known ? "text-[#1a1a1a]" : "tracking-widest text-gray-500"}`}>{known ? name : t.unknown}</p>
        <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[#B45309]">{stickerWhere(sticker, lang)}</p>
        {earned ? (
          <>
            {sticker.stars && <div className="mt-3 flex justify-center"><Stars stars={sticker.stars} lang={lang} size="h-8 w-8" /></div>}
            {sticker.score && <p className="mt-2 text-lg font-bold text-[#007229]">{t.score(formatNumber(sticker.score.correct, lang), formatNumber(sticker.score.total, lang))}</p>}
            <p className="mt-3 text-base font-semibold leading-snug text-gray-700">{BOSS_FACTS[sticker.bossKey][lang]}</p>
            {sticker.earnedAt && <p className="mt-2 text-sm font-semibold text-gray-500">{t.earned(formatDate(sticker.earnedAt, lang))}</p>}
            {sticker.preview && <p className="mt-2 text-sm font-semibold text-[#92400E]">{t.previewNote}</p>}
            {sticker.certificateId && (
              <Link href={`/certificates/${sticker.certificateId}`} className="mt-4 inline-flex min-h-12 items-center rounded-full bg-[#F59E0B] px-6 text-lg font-bold text-[#3B1D00] shadow-[0_3px_0_#92400E]">
                {t.certificate}
              </Link>
            )}
          </>
        ) : (
          <p className="mt-3 text-base font-semibold leading-snug text-gray-700">
            {met ? (sticker.kind === "starting" ? t.metStarting(name) : t.metHint(name)) : t.lockedHint(sticker.kind, formatNumber(sticker.weeks?.last ?? 0, lang))}
          </p>
        )}
      </div>
    </div>
  );
}
