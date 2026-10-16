"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import type { BossKey } from "@/lib/milestones/types";
import { rememberBoss, startBattleEarly, warmBattle } from "./prefetch";

const battleHref = (milestoneId: string, bossKey?: BossKey | null) => `/milestones/${milestoneId}/battle${bossKey ? `?boss=${bossKey}` : ""}`;

/**
 * For the learning path, so tapping Battle!/Continue opens the fight at once:
 *  - `prefetchBattle(id, bossKey)` when the boss node is selected: prefetches
 *    the battle route and warms its data (never starts an attempt);
 *  - `startBattle(id)` on the tap itself (optional): starts or resumes the
 *    battle while the route changes.
 */
export function usePrefetchBattle() {
  const router = useRouter();
  const { language } = useLanguage();
  const { fetchWithLearner } = useLearnerContext();

  const prefetchBattle = useCallback(
    (milestoneId: string, bossKey?: BossKey | null) => {
      if (bossKey) rememberBoss(milestoneId, bossKey);
      router.prefetch(battleHref(milestoneId, bossKey));
      warmBattle(fetchWithLearner, milestoneId, language);
    },
    [fetchWithLearner, language, router]
  );

  const startBattle = useCallback(
    (milestoneId: string) => {
      void startBattleEarly(fetchWithLearner, milestoneId, language).catch(() => undefined);
    },
    [fetchWithLearner, language]
  );

  return { prefetchBattle, startBattle };
}
