"use client";

// School admins: every class in their school (the server checks the school_admins row).
import SchoolOverview from "@/components/measurement/SchoolOverview";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

export default function SchoolOverviewPage() {
  const { loading } = useTeacherGuard();
  const { language } = useLanguage();
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }
  return <SchoolOverview lang={language} />;
}
