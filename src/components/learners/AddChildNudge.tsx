"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import { OwlExcited } from "@/components/illustrations";
import { NudgeCard } from "@/components/pwa/InstallNudges";
import { hideAddChildNudge, readAddChildNudgeHiddenUntil, shouldShowAddChildNudge } from "@/lib/learners/add-child-nudge";

const COPY = {
  en: {
    title: "Who’s learning?",
    body: "Add your child so their lessons, Big Challenges and certificates are saved under their own name.",
    add: "Add a child",
  },
  ar: {
    title: "من سيتعلّم؟",
    body: "أضف طفلك لتُحفظ دروسه وتحدياته الكبيرة وشهاداته باسمه.",
    add: "أضف طفلًا",
  },
} as const;

/**
 * Asks a parent with no child profile yet to add one. Opens the same picker
 * as the learner switcher; "Hide" rests it for a few days.
 */
export function AddChildNudge() {
  const { language } = useLanguage();
  const { accountId, loading, isParent, canManageChildren, canHaveChildren, learners, openPicker } = useLearnerContext();
  // Mounted after the dashboard's data loads, so reading storage here can't upset hydration.
  const [hiddenUntil, setHiddenUntil] = useState<number | null>(() => (accountId ? readAddChildNudgeHiddenUntil(accountId) : null));
  const [now] = useState(() => Date.now());
  const t = COPY[language];

  if (!accountId) return null;
  if (!shouldShowAddChildNudge({ loading, isParent, canManageChildren, canHaveChildren, learners, hiddenUntil, now })) return null;

  return (
    <NudgeCard
      icon={<OwlExcited className="h-14 w-14 shrink-0" />}
      title={t.title}
      body={t.body}
      action={{ label: t.add, onClick: openPicker }}
      onHide={() => setHiddenUntil(hideAddChildNudge(accountId))}
    />
  );
}
