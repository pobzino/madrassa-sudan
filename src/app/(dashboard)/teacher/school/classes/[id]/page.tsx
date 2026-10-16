"use client";

// One class of the school, for its school admin (the progress route checks access).
import Link from "next/link";
import { useParams } from "next/navigation";
import ClassProgressView from "@/components/measurement/ClassProgressView";
import { CLASS_COPY } from "@/components/measurement/classCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

export default function SchoolClassPage() {
  const { loading } = useTeacherGuard();
  const { language } = useLanguage();
  const { id } = useParams<{ id: string }>();
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6" dir={language === "ar" ? "rtl" : "ltr"}>
      <Link href="/teacher/school" className="text-sm font-medium text-emerald-700 hover:underline">
        {language === "ar" ? "→ " : "← "}
        {CLASS_COPY[language].schoolOverview}
      </Link>
      <ClassProgressView lang={language} cohortId={id} />
    </div>
  );
}
