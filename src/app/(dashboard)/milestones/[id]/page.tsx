"use client";

// The Big Challenge intro: meet the boss, then play. See MilestoneIntro.
import { useParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import { useOffline } from "@/contexts/OfflineContext";
import MilestoneIntro from "@/components/milestones/MilestoneIntro";

export default function MilestoneIntroPage() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { fetchWithLearner } = useLearnerContext();
  const { isOnline } = useOffline();
  return <MilestoneIntro milestoneId={id} lang={language} fetcher={fetchWithLearner} isOnline={isOnline} />;
}
