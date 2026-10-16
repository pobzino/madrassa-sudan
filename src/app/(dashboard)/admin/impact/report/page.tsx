"use client";

// The admin-only funder report (printable, CSV / JSON). The export route
// re-checks that the caller is an approved admin.
import FunderReport from "@/components/measurement/FunderReport";
import { IMPACT_COPY } from "@/components/measurement/impactCopy";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

export default function FunderReportPage() {
  const { loading, profile } = useTeacherGuard();
  const { language } = useLanguage();
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }
  if (profile?.role !== "admin") {
    return <p className="mx-auto max-w-xl p-6 text-sm text-gray-600">{IMPACT_COPY[language].adminOnly}</p>;
  }
  return <FunderReport lang={language} />;
}
