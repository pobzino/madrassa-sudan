"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LeafIcon, PencilIcon, SproutIcon, StarIcon, TreeIcon } from "@/components/icons/AmalIcons";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { LevelBand } from "@/lib/measurement/types";
import { FitBoss } from "@/components/milestones/Characters";
import { bossName } from "@/components/milestones/copy";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { LearnerProgressResponse, LearnerProgressSummary, SkillChip, SubjectGrowth } from "@/lib/measurement/types";
import { bossForSubject } from "@/lib/milestones/rules";
import { BAND_ORDER, bandLabel, bandStep, chipLabel, chipOverflow, formatInt, moreLabel, type UiLang } from "./format";
import { PROGRESS_COPY } from "./impactCopy";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_CHIPS = 6;

/**
 * The family's view of a child's skills, under the Parent Summary: skills
 * learned this month (last 30 days), also practised, and per subject where
 * the child started and where they are now, as bands with icons. No scores,
 * no numbers other than counts of skills.
 */
export default function SkillsProgressCard({
  lang,
  fetcher,
  learnerName,
  learnerKey,
  self,
}: {
  lang: UiLang;
  fetcher: Fetcher;
  /** The active child's name ("" for a self account). */
  learnerName: string;
  /** Changes when the LearnerPicker switches child: reload. */
  learnerKey: string;
  /** The learner is the account itself (a self student): "you" wording. */
  self: boolean;
}) {
  const t = PROGRESS_COPY[lang];
  const [summary, setSummary] = useState<LearnerProgressSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetcherRef.current("/api/measurement/progress", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as LearnerProgressResponse;
        if (cancelled) return;
        setSummary(body.summary);
        setState("ready");
        trackAnalyticsEvent("progress_skills_view", {
          has_baseline: body.summary.subjects.some((s) => s.baseline !== null),
          skills_learned: body.summary.skillsLearned.length,
        });
      } catch {
        if (!cancelled) setState("error");
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [learnerKey]);

  // Nothing to say if the card can't load: the rest of the page still works.
  if (state === "error") return null;
  const name = learnerName.trim();
  const useYou = self || !name;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50 to-white shadow-sm" aria-busy={state === "loading"}>
      <div className="flex items-center gap-3 border-b border-amber-100 px-6 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100" aria-hidden="true"><StarIcon className="h-6 w-6" /></span>
        <h2 className="text-xl font-semibold font-fredoka text-gray-900">{useYou ? t.you : t.title(name)}</h2>
      </div>
      <div className="space-y-5 p-6">
        {state === "loading" || !summary ? (
          <div className="space-y-3" aria-label={t.loading}>
            <div className="h-5 w-48 animate-pulse rounded bg-amber-100" />
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 w-28 animate-pulse rounded-full bg-amber-100/70" />
              ))}
            </div>
          </div>
        ) : (
          <Body summary={summary} lang={lang} name={name} useYou={useYou} />
        )}
      </div>
    </section>
  );
}

function Body({ summary, lang, name, useYou }: { summary: LearnerProgressSummary; lang: UiLang; name: string; useYou: boolean }) {
  const t = PROGRESS_COPY[lang];
  const growth = summary.subjects.filter((s) => s.baseline || s.current || s.placementMilestoneId);
  const empty = summary.skillsLearned.length === 0 && summary.skillsPractised.length === 0 && growth.every((s) => !s.baseline && !s.current);
  const invites = summary.subjects.filter((s) => s.placementMilestoneId);
  return (
    <>
      {empty && <p className="text-base text-gray-600">{useYou ? t.emptySelf : t.empty(name)}</p>}
      {summary.skillsLearned.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-amber-800">{t.learned}</h3>
          <Chips chips={summary.skillsLearned} lang={lang} tone="learned" />
        </div>
      )}
      {summary.skillsPractised.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-600">{t.practised}</h3>
          <Chips chips={summary.skillsPractised} lang={lang} tone="practised" />
        </div>
      )}
      {growth.some((s) => s.baseline || s.current) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{useYou ? t.sinceStartSelf : t.sinceStart(name)}</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {growth
              .filter((s) => s.baseline || s.current)
              .map((s) => (
                <SubjectJourney key={s.subjectId} subject={s} lang={lang} />
              ))}
          </ul>
        </div>
      )}
      {invites.map((s) => {
        const boss = bossName(bossForSubject(s.subjectNameEn, s.subjectNameAr), lang, true);
        return (
          <Link
            key={s.subjectId}
            href={`/milestones/${s.placementMilestoneId}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-emerald-100 bg-emerald-50/60 p-3 transition-colors hover:border-emerald-200"
          >
            <FitBoss bossKey={bossForSubject(s.subjectNameEn, s.subjectNameAr)} pose="happy" className="h-14 w-14 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-emerald-700">{lang === "ar" ? s.subjectNameAr ?? s.subjectNameEn : s.subjectNameEn ?? s.subjectNameAr}</span>
              <span className="block font-fredoka text-base font-semibold text-gray-900">{useYou ? t.meetBossSelf(boss) : t.meetBoss(boss, name)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-[#007229] px-3.5 py-1.5 font-fredoka text-sm font-bold text-white">{t.play}</span>
          </Link>
        );
      })}
    </>
  );
}

function Chips({ chips, lang, tone }: { chips: SkillChip[]; lang: UiLang; tone: "learned" | "practised" }) {
  const { shown, more } = chipOverflow(chips, MAX_CHIPS);
  const [open, setOpen] = useState(false);
  const list = open ? chips : shown;
  return (
    <ul className="flex flex-wrap gap-2">
      {list.map((chip) => (
        <li
          key={`${chip.subjectId}:${chip.skillKey}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
            tone === "learned" ? "bg-amber-100 text-amber-900" : "bg-white text-gray-700 ring-1 ring-gray-200"
          }`}
        >
          {tone === "learned" ? <StarIcon className="h-4 w-4" /> : <PencilIcon className="h-4 w-4" />}
          {chipLabel(chip, lang)}
        </li>
      ))}
      {more > 0 && !open && (
        <li>
          <button type="button" onClick={() => setOpen(true)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100">
            {moreLabel(more, lang)}
          </button>
        </li>
      )}
    </ul>
  );
}

/** "Getting started → On the way", with three little steps. No numbers. */
function SubjectJourney({ subject, lang }: { subject: SubjectGrowth; lang: UiLang }) {
  const t = PROGRESS_COPY[lang];
  const name = (lang === "ar" ? subject.subjectNameAr ?? subject.subjectNameEn : subject.subjectNameEn ?? subject.subjectNameAr) ?? "";
  const from = subject.baseline?.band ?? null;
  const to = subject.current?.band ?? null;
  const reached = to ?? from;
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-amber-100">
      <p className="text-sm font-semibold text-gray-900">{name}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 font-fredoka text-base font-semibold text-gray-800">
        {from && (
          <span className="inline-flex items-center gap-1">
            <BandIcon band={from} />
            {bandLabel(from, lang)}
          </span>
        )}
        {from && to && <Arrow className="h-4 w-4 text-gray-400" aria-hidden="true" />}
        {to && (
          <span className="inline-flex items-center gap-1 text-emerald-800">
            <BandIcon band={to} />
            {bandLabel(to, lang)}
          </span>
        )}
      </p>
      {reached && (
        <div className="mt-2 flex gap-1" role="img" aria-label={from && to ? `${bandLabel(from, lang)} → ${bandLabel(to, lang)}` : bandLabel(reached, lang)}>
          {BAND_ORDER.map((band) => (
            <span key={band} className={`h-2 flex-1 rounded-full ${bandStep(band) <= bandStep(reached) ? "bg-emerald-500" : "bg-gray-100"}`} />
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">
        {subject.skillsLearnedSinceStart > 0 && t.skillsSinceStart(formatInt(subject.skillsLearnedSinceStart, lang))}
        {subject.baseline && !subject.baseline.valid && <span className="ms-1 text-gray-400">· {t.lateNote}</span>}
      </p>
    </li>
  );
}

/** The growth meter's three steps: a sprout, a leaf, a tree. */
function BandIcon({ band }: { band: LevelBand }) {
  const className = "h-[1.1em] w-[1.1em] shrink-0";
  if (band === "confident") return <TreeIcon className={className} />;
  if (band === "on_the_way") return <LeafIcon className={className} />;
  return <SproutIcon className={className} />;
}
