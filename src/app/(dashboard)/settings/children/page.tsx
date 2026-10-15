"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLearnerContext } from "@/contexts/LearnerContext";
import LearnerPicker from "@/components/learners/LearnerPicker";

export default function MyChildrenPage() {
  const { language } = useLanguage();
  const { learners, accountId, canHaveChildren, needsSelfName, suggestedChildren, refresh, setActiveLearner, isParent } = useLearnerContext();
  const isRtl = language === "ar";

  if (!isParent) {
    return <main className="mx-auto max-w-3xl px-5 py-10" dir={isRtl ? "rtl" : "ltr"}>
      <p className="mb-5 rounded-2xl bg-gray-50 p-5 text-gray-700">{language === "ar" ? "إدارة ملفات الأطفال متاحة لحسابات أولياء الأمور فقط." : "Child profiles are available to parent accounts."}</p>
      <Link href="/settings" className="font-bold text-[#007229]">{language === "ar" ? "العودة إلى الإعدادات" : "Back to Settings"}</Link>
    </main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link href="/settings" className="rounded-xl px-3 py-2 text-sm font-bold text-[#007229] hover:bg-[#007229]/5">← {language === "ar" ? "الإعدادات" : "Settings"}</Link>
      </div>
      <LearnerPicker
        learners={learners}
        accountId={accountId}
        canHaveChildren={canHaveChildren}
        needsSelfName={needsSelfName}
        suggestedChildren={suggestedChildren}
        language={language}
        dismissible={false}
        onClose={() => undefined}
        onSelect={setActiveLearner}
        onUpdated={refresh}
        manageMode
      />
    </main>
  );
}
