"use client";

// The Big Challenge boss battle: a full-screen overlay over the dashboard
// (no chrome), online only, server-authoritative. See MilestoneBattle.
import { useParams, useSearchParams } from "next/navigation";
import { BOSS_KEYS, type BossKey } from "@/lib/milestones/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import { useOffline } from "@/contexts/OfflineContext";
import MilestoneBattle from "@/components/milestones/MilestoneBattle";

export default function MilestoneBattlePage() {
  const { id } = useParams<{ id: string }>();
  // The path link names the boss, so the loading line (if any) is the right one.
  const boss = useSearchParams().get("boss");
  const bossHint = boss && (BOSS_KEYS as readonly string[]).includes(boss) ? (boss as BossKey) : null;
  const { language } = useLanguage();
  const { fetchWithLearner, activeLearner } = useLearnerContext();
  const { isOnline } = useOffline();
  return (
    <MilestoneBattle
      milestoneId={id}
      lang={language}
      fetcher={fetchWithLearner}
      isOnline={isOnline}
      learner={activeLearner ? { name: activeLearner.name, avatar: activeLearner.avatar } : null}
      bossHint={bossHint}
    />
  );
}
