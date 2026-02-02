"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import type { Profile } from "@/lib/database.types";

const translations = {
  ar: {
    settings: "الإعدادات",
    profile: "الملف الشخصي",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    phonePlaceholder: "أدخل رقم هاتفك",
    gradeLevel: "المستوى الدراسي",
    selectGrade: "اختر المستوى",
    preferences: "التفضيلات",
    language: "اللغة",
    arabic: "العربية",
    english: "English",
    security: "الأمان",
    changePassword: "تغيير كلمة المرور",
    currentPassword: "كلمة المرور الحالية",
    newPassword: "كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور",
    updatePassword: "تحديث كلمة المرور",
    dangerZone: "منطقة الخطر",
    deleteAccount: "حذف الحساب",
    deleteWarning: "سيتم حذف جميع بياناتك بشكل دائم. هذا الإجراء لا يمكن التراجع عنه.",
    save: "حفظ التغييرات",
    saving: "جاري الحفظ...",
    saved: "تم الحفظ بنجاح!",
    error: "حدث خطأ",
    back: "العودة",
    loading: "جاري التحميل...",
    passwordMismatch: "كلمات المرور غير متطابقة",
    passwordTooShort: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    passwordUpdated: "تم تحديث كلمة المرور بنجاح",
    role: "نوع الحساب",
    student: "طالب",
    teacher: "معلم",
    parent: "ولي أمر",
    admin: "مدير",
    memberSince: "عضو منذ",
  },
  en: {
    settings: "Settings",
    profile: "Profile",
    fullName: "Full Name",
    email: "Email",
    phone: "Phone Number",
    phonePlaceholder: "Enter your phone number",
    gradeLevel: "Grade Level",
    selectGrade: "Select Grade",
    preferences: "Preferences",
    language: "Language",
    arabic: "العربية",
    english: "English",
    security: "Security",
    changePassword: "Change Password",
    currentPassword: "Current Password",
    newPassword: "New Password",
    confirmPassword: "Confirm Password",
    updatePassword: "Update Password",
    dangerZone: "Danger Zone",
    deleteAccount: "Delete Account",
    deleteWarning: "All your data will be permanently deleted. This action cannot be undone.",
    save: "Save Changes",
    saving: "Saving...",
    saved: "Saved successfully!",
    error: "An error occurred",
    back: "Back",
    loading: "Loading...",
    passwordMismatch: "Passwords do not match",
    passwordTooShort: "Password must be at least 6 characters",
    passwordUpdated: "Password updated successfully",
    role: "Account Type",
    student: "Student",
    teacher: "Teacher",
    parent: "Parent",
    admin: "Admin",
    memberSince: "Member since",
  },
};

// Icons
const Icons = {
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  user: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  settings: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  globe: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  ),
  lock: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  trash: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gradeLevel, setGradeLevel] = useState<number | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const router = useRouter();
  const supabase = createClient();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setEmail(user.email || "");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name);
        setPhone(profileData.phone || "");
        setGradeLevel(profileData.grade_level);
      }

      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  const handleSaveProfile = async () => {
    if (!profile) return;

    setSaving(true);
    setSaveMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        grade_level: gradeLevel,
        preferred_language: language,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      setSaveMessage({ type: "error", text: t.error });
    } else {
      setSaveMessage({ type: "success", text: t.saved });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: t.passwordTooShort });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: t.passwordMismatch });
      return;
    }

    setUpdatingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setUpdatingPassword(false);

    if (error) {
      setPasswordMessage({ type: "error", text: error.message });
    } else {
      setPasswordMessage({ type: "success", text: t.passwordUpdated });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordMessage(null), 3000);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "student":
        return t.student;
      case "teacher":
        return t.teacher;
      case "parent":
        return t.parent;
      case "admin":
        return t.admin;
      default:
        return role;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br bg-[#007229] flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 animate-bounce shadow-lg">
                م
              </div>
              <p className="text-gray-500">{t.loading}</p>
            </div>
          </div>
        ) : (
        <>
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white shadow-lg">
              {Icons.settings}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t.settings}</h1>
          </div>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#007229] flex items-center justify-center">
                  {Icons.user}
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{t.profile}</h2>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Avatar and basic info */}
              <div className="flex items-center gap-4 pb-5 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br bg-[#007229] flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                  {fullName.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{fullName}</p>
                  <p className="text-sm text-gray-500">{email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 bg-emerald-100 text-[#007229] text-xs font-medium rounded-full">
                      {profile && getRoleLabel(profile.role)}
                    </span>
                    {profile && (
                      <span className="text-xs text-gray-400">
                        {t.memberSince} {formatDate(profile.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.fullName}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.email}
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                  dir="ltr"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.phone}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  dir="ltr"
                />
              </div>

              {/* Grade Level (for students) */}
              {profile?.role === "student" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t.gradeLevel}
                  </label>
                  <select
                    value={gradeLevel || ""}
                    onChange={(e) => setGradeLevel(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">{t.selectGrade}</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
                      <option key={grade} value={grade}>
                        {language === "ar" ? `الصف ${grade}` : `Grade ${grade}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Save Button */}
              <div className="pt-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>{t.saving}</span>
                    </>
                  ) : (
                    t.save
                  )}
                </button>

                {saveMessage && (
                  <div className={`mt-3 p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
                    saveMessage.type === "success"
                      ? "bg-emerald-100 text-[#007229]"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {saveMessage.type === "success" && Icons.check}
                    {saveMessage.text}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  {Icons.globe}
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{t.preferences}</h2>
              </div>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t.language}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setLanguage("ar")}
                  className={`flex-1 py-3 px-4 rounded-xl border font-medium transition-all ${
                    language === "ar"
                      ? "bg-[#007229]/10 border-emerald-500 text-[#007229]"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t.arabic}
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`flex-1 py-3 px-4 rounded-xl border font-medium transition-all ${
                    language === "en"
                      ? "bg-[#007229]/10 border-emerald-500 text-[#007229]"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t.english}
                </button>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  {Icons.lock}
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{t.security}</h2>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <h3 className="font-medium text-gray-900">{t.changePassword}</h3>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.newPassword}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  dir="ltr"
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t.confirmPassword}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  dir="ltr"
                />
              </div>

              <button
                onClick={handleUpdatePassword}
                disabled={updatingPassword || !newPassword || !confirmPassword}
                className="w-full py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {updatingPassword ? t.saving : t.updatePassword}
              </button>

              {passwordMessage && (
                <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
                  passwordMessage.type === "success"
                    ? "bg-emerald-100 text-[#007229]"
                    : "bg-red-100 text-red-700"
                }`}>
                  {passwordMessage.type === "success" && Icons.check}
                  {passwordMessage.text}
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
            <div className="p-6 border-b border-red-100 bg-red-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  {Icons.trash}
                </div>
                <h2 className="text-lg font-semibold text-red-900">{t.dangerZone}</h2>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">{t.deleteWarning}</p>
              <button
                className="px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
                onClick={() => {
                  // Would implement delete account flow
                  alert("This feature is not yet implemented");
                }}
              >
                {t.deleteAccount}
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
