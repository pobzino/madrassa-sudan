"use client";

// Learning impact for staff: admins see every path, teachers the paths they
// authored (the server scopes the report). See ImpactDashboard.
import ImpactDashboard from "@/components/measurement/ImpactDashboard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

export default function TeacherImpactPage() {
  const { loading, profile } = useTeacherGuard();
  const { language } = useLanguage();
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }
  return (
    <div dir={language === "ar" ? "rtl" : "ltr"}>
      <ImpactDashboard lang={language} isAdmin={profile?.role === "admin"} />
    </div>
  );
}
