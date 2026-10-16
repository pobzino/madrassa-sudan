"use client";

// The learner's Boss Book: the Big Challenge bosses they have beaten.
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import BossBook from "@/components/milestones/BossBook";

export default function BossBookPage() {
  const { language } = useLanguage();
  const { fetchWithLearner } = useLearnerContext();
  return <BossBook lang={language} fetcher={fetchWithLearner} />;
}
