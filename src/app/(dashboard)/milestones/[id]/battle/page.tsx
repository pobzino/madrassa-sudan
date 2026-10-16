"use client";

// The Big Challenge boss battle: a full-screen overlay over the dashboard
// (no chrome), online only, server-authoritative. See MilestoneBattle.
import { useParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import { useOffline } from "@/contexts/OfflineContext";
import MilestoneBattle from "@/components/milestones/MilestoneBattle";

export default function MilestoneBattlePage() {
  const { id } = useParams<{ id: string }>();
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
    />
  );
}
