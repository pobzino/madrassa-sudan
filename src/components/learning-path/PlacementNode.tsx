"use client";

import Link from "next/link";
import { FitBoss } from "@/components/milestones/Characters";
import { bossName, MILESTONE_COPY } from "@/components/milestones/copy";
import { usePrefetchBattle } from "@/components/milestones/usePrefetchBattle";
import type { TreePlacement } from "@/lib/lessons/useLearningPath";

/**
 * "Meet your first boss" at the start of the path, above week 1. A friendly
 * card, not a gate: week 1 is open whether or not it is played, and it is
 * never the owl's current step. Online only, like the Big Challenge.
 */
export function placementHref(placement: TreePlacement, isOnline: boolean): string | null {
  if (!placement.offered || !isOnline) return null;
  return `/milestones/${placement.id}/battle?boss=${placement.bossKey}`;
}

export default function PlacementNode({ placement, lang, isOnline, gated = false }: { placement: TreePlacement; lang: "ar" | "en"; isOnline: boolean; gated?: boolean }) {
  const t = MILESTONE_COPY[lang];
  const boss = bossName(placement.bossKey, lang, true);
  const { prefetchBattle } = usePrefetchBattle();
  const href = placementHref(placement, isOnline);

  if (placement.state === "completed") {
    return (
      <div className="flex justify-center pb-1 pt-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/90 py-1 pe-3.5 ps-1 font-fredoka text-[13px] font-bold text-[#005C22] shadow-sm ring-1 ring-emerald-100">
          <FitBoss bossKey={placement.bossKey} pose="happy" className="h-7 w-7" />
          {t.placementMetBadge(boss)}
        </span>
      </div>
    );
  }
  if (!placement.offered) return null;

  const warm = () => {
    if (href) prefetchBattle(placement.id, placement.bossKey);
  };
  return (
    <div className="flex justify-center px-2 pb-2 pt-3">
      <div
        className={`flex w-full max-w-[420px] items-center gap-3 rounded-[24px] border-2 border-amber-200 bg-[linear-gradient(180deg,#FFFBEB,#FEF3C7)] p-3 shadow-[0_5px_0_rgba(180,83,9,0.18)] ${isOnline ? "" : "opacity-70"}`}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
      >
        <FitBoss bossKey={placement.bossKey} pose={isOnline ? "happy" : "sleep"} className="h-[72px] w-[72px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-fredoka text-[18px] font-bold leading-tight text-[#9A3412]">{t.placementIntroTitle(boss)}</p>
          <p className="mt-0.5 font-fredoka text-[13px] font-semibold leading-snug text-[#78350F]">{!isOnline ? t.needsInternetTitle : gated ? t.placementGateSub : t.placementNodeSub}</p>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#2FB25A,#007229_55%,#005C22)] px-4 font-fredoka text-[16px] font-bold text-white shadow-[0_4px_0_#00451A]"
          >
            {t.placementPlay}
          </Link>
        )}
      </div>
    </div>
  );
}
