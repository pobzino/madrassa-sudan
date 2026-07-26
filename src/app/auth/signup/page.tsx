"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@/lib/database.types";
import { useLanguage } from "@/contexts/LanguageContext";
import { getAuthCallbackUrl } from "@/lib/site-url";

// Icons for role selection
const RoleIcons = {
  student: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  ),
  teacher: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  parent: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  email: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
};

const translations = {
  ar: {
    createAccount: "إنشاء حساب",
    joinSubtitle: "انضم إلى مدرسة آمال اليوم",
    fullNameLabel: "الاسم الكامل",
    fullNamePlaceholder: "أحمد محمد",
    emailLabel: "البريد الإلكتروني",
    emailLoginHint: "يُستخدم لتسجيل الدخول وتأكيد الحساب. الواتساب هو جهة التواصل الأساسية.",
    passwordLabel: "كلمة المرور",
    iAmA: "أنا...",
    student: "طالب",
    teacher: "معلم / متطوع",
    parent: "ولي أمر",
    parentDetailsTitle: "معلومات ولي الأمر",
    programmeTitle: "معلومات البرنامج",
    programmeDesc: "يغطي البرنامج الرياضيات واللغة الإنجليزية. يتعلم الأطفال عبر الموقع وحصص زوم عند الحاجة، باستخدام هاتف إن لم يتوفر جهاز آخر.",
    parentProfessionLabel: "المهنة / العمل",
    professionPlaceholder: "مثال: معلم، ممرض، عمل حر",
    whatsappLabel: "رقم الواتساب (جهة التواصل الأساسية)",
    whatsappPlaceholder: "+249...",
    eligibilityTitle: "أسئلة الأهلية",
    sudaneseDescentLabel: "هل أنت من أصل سوداني؟",
    affectedByWarLabel: "هل تأثر طفلك بالحرب في السودان؟",
    missedSchoolingLabel: "هل فات طفلك تعليم كثير؟",
    outOfSchoolLabel: "هل كان طفلك خارج المدرسة؟ اذكر المدة أو الظروف",
    outOfSchoolPlaceholder: "مثال: خارج المدرسة منذ ٦ أشهر بسبب النزوح",
    childrenLabel: "عدد الأطفال المؤهلين وأعمارهم",
    childrenPlaceholder: "مثال: طفلان، ٦ و٩ سنوات",
    accessLabel: "هل يستطيع الطفل استخدام الموقع أو حصص زوم؟",
    accessPlaceholder: "مثال: نعم، عبر هاتف ولي الأمر",
    teacherDetailsTitle: "معلومات المعلم / المتطوع",
    locationLabel: "الموقع (المدينة / الدولة)",
    educationLabel: "الخلفية التعليمية",
    educationPlaceholder: "المؤهل، الخبرة، المواد التي تعرفها",
    involvementLabel: "كيف تريد المساعدة؟",
    hoursLabel: "كم ساعة تقريباً في الأسبوع؟",
    hoursPlaceholder: "مثال: ٣-٥ ساعات",
    volunteerInfoDesc: "نستخدم هذه المعلومات لتوجيهك إلى التدريس، التقنية، المحتوى، العمليات، أو التواصل.",
    yes: "نعم",
    no: "لا",
    unsure: "لست متأكداً",
    involvementTeaching: "التدريس",
    involvementTech: "التقنية والمنصة",
    involvementContent: "المحتوى والفيديو",
    involvementOps: "العمليات",
    involvementOutreach: "التواصل",
    involvementOther: "أخرى",
    createAccountBtn: "إنشاء حساب",
    creatingAccount: "جاري إنشاء الحساب...",
    consentLabel: "أوافق على",
    termsLink: "شروط الخدمة",
    andText: "و",
    privacyLink: "سياسة الخصوصية",
    alreadyHaveAccount: "لديك حساب بالفعل؟",
    signIn: "تسجيل الدخول",
    checkEmail: "تحقق من بريدك الإلكتروني",
    sentConfirmation: "لقد أرسلنا رابط التأكيد إلى",
    resendConfirmation: "إعادة إرسال رسالة التأكيد",
    sendingConfirmation: "جاري الإرسال...",
    confirmationSent: "تم إرسال رسالة تأكيد جديدة. تحقق من البريد والرسائل غير المرغوب فيها.",
    resendHint: "إذا لم تصلك الرسالة خلال دقيقة، أعد الإرسال.",
    backToLogin: "العودة لتسجيل الدخول",
  },
  en: {
    createAccount: "Create Account",
    joinSubtitle: "Join Amal School today",
    fullNameLabel: "Full Name",
    fullNamePlaceholder: "Ahmed Mohamed",
    emailLabel: "Email Address",
    emailLoginHint: "Used for login and verification. WhatsApp remains the primary contact channel.",
    passwordLabel: "Password",
    iAmA: "I am a...",
    student: "Student",
    teacher: "Teacher / Volunteer",
    parent: "Parent",
    parentDetailsTitle: "Parent information",
    programmeTitle: "Programme information",
    programmeDesc: "The programme covers Maths and English. Children learn through the website and Zoom lessons where needed, using a phone if that is the device available.",
    parentProfessionLabel: "Profession / occupation",
    professionPlaceholder: "e.g. teacher, nurse, self-employed",
    whatsappLabel: "WhatsApp number (primary contact)",
    whatsappPlaceholder: "+249...",
    eligibilityTitle: "Eligibility questions",
    sudaneseDescentLabel: "Are you of Sudanese descent?",
    affectedByWarLabel: "Has your child been affected by the war in Sudan?",
    missedSchoolingLabel: "Has your child missed significant schooling?",
    outOfSchoolLabel: "Has your child been out of school? Duration / circumstances",
    outOfSchoolPlaceholder: "e.g. out of school for 6 months because of displacement",
    childrenLabel: "Number of eligible children and their ages",
    childrenPlaceholder: "e.g. 2 children, ages 6 and 9",
    accessLabel: "Can your child access the website or Zoom lessons?",
    accessPlaceholder: "e.g. Yes, using a parent's phone",
    teacherDetailsTitle: "Teacher / volunteer information",
    locationLabel: "Location (city / country)",
    educationLabel: "Educational background",
    educationPlaceholder: "Qualifications, experience, subjects you know",
    involvementLabel: "Where would you like to help?",
    hoursLabel: "Roughly how many hours per week?",
    hoursPlaceholder: "e.g. 3-5 hours",
    volunteerInfoDesc: "We use this to route you into teaching, tech, content, operations, or outreach.",
    yes: "Yes",
    no: "No",
    unsure: "Unsure",
    involvementTeaching: "Teaching",
    involvementTech: "Tech & platform",
    involvementContent: "Content & video",
    involvementOps: "Operations",
    involvementOutreach: "Outreach",
    involvementOther: "Other",
    createAccountBtn: "Create Account",
    creatingAccount: "Creating account...",
    consentLabel: "I agree to the",
    termsLink: "Terms of Service",
    andText: "and",
    privacyLink: "Privacy Policy",
    alreadyHaveAccount: "Already have an account?",
    signIn: "Sign In",
    checkEmail: "Check your email",
    sentConfirmation: "We've sent a confirmation link to",
    resendConfirmation: "Resend confirmation email",
    sendingConfirmation: "Sending...",
    confirmationSent: "A new confirmation email has been sent. Check your inbox and spam folder.",
    resendHint: "If you don't receive it within a minute, resend it.",
    backToLogin: "Back to Login",
  },
};

type YesNoAnswer = "" | "yes" | "no" | "unsure";
type InvolvementArea = "teaching" | "tech_platform" | "content_video" | "operations" | "outreach" | "other";

function getInitialSignupRole(): UserRole {
  if (typeof window === "undefined") {
    return "student";
  }

  const requestedRole = new URLSearchParams(window.location.search).get("role");
  return requestedRole === "teacher" || requestedRole === "parent" ? requestedRole : "student";
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>(() => getInitialSignupRole());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [parentProfession, setParentProfession] = useState("");
  const [parentWhatsapp, setParentWhatsapp] = useState("");
  const [sudaneseDescent, setSudaneseDescent] = useState<YesNoAnswer>("");
  const [affectedByWar, setAffectedByWar] = useState<YesNoAnswer>("");
  const [missedSchooling, setMissedSchooling] = useState<YesNoAnswer>("");
  const [outOfSchoolDetails, setOutOfSchoolDetails] = useState("");
  const [eligibleChildren, setEligibleChildren] = useState("");
  const [accessLogistics, setAccessLogistics] = useState("");
  const [teacherWhatsapp, setTeacherWhatsapp] = useState("");
  const [teacherLocation, setTeacherLocation] = useState("");
  const [educationalBackground, setEducationalBackground] = useState("");
  const [involvementAreas, setInvolvementAreas] = useState<InvolvementArea[]>([]);
  const [weeklyHours, setWeeklyHours] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];

  const roleOptions = [
    { id: "student" as UserRole, label: t.student, icon: RoleIcons.student },
    { id: "teacher" as UserRole, label: t.teacher, icon: RoleIcons.teacher },
    { id: "parent" as UserRole, label: t.parent, icon: RoleIcons.parent },
  ];

  const yesNoOptions: Array<{ value: Exclude<YesNoAnswer, "">; label: string }> = [
    { value: "yes", label: t.yes },
    { value: "no", label: t.no },
    { value: "unsure", label: t.unsure },
  ];

  const involvementOptions: Array<{ value: InvolvementArea; label: string }> = [
    { value: "teaching", label: t.involvementTeaching },
    { value: "tech_platform", label: t.involvementTech },
    { value: "content_video", label: t.involvementContent },
    { value: "operations", label: t.involvementOps },
    { value: "outreach", label: t.involvementOutreach },
    { value: "other", label: t.involvementOther },
  ];

  const toggleInvolvementArea = (area: InvolvementArea) => {
    setInvolvementAreas((prev) =>
      prev.includes(area)
        ? prev.filter((item) => item !== area)
        : [...prev, area]
    );
  };

  const getRedirectUrl = () => (
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : getAuthCallbackUrl()
  );

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResendError(null);
    setResendMessage(null);

    if (role === "teacher" && involvementAreas.length === 0) {
      setError(
        language === "ar"
          ? "اختر مجالاً واحداً على الأقل للمساعدة."
          : "Choose at least one area where you would like to help."
      );
      setLoading(false);
      return;
    }

    const parentDetails =
      role === "parent"
        ? {
            profession: parentProfession.trim(),
            whatsapp_number: parentWhatsapp.trim(),
            eligibility: {
              sudanese_descent: sudaneseDescent,
              child_affected_by_war: affectedByWar,
              child_missed_significant_schooling: missedSchooling,
              out_of_school_details: outOfSchoolDetails.trim(),
            },
            eligible_children: eligibleChildren.trim(),
            access_logistics: accessLogistics.trim(),
            programme_acknowledged: true,
          }
        : null;

    const teacherDetails =
      role === "teacher"
        ? {
            whatsapp_number: teacherWhatsapp.trim(),
            location: teacherLocation.trim(),
            educational_background: educationalBackground.trim(),
            involvement_areas: involvementAreas,
            weekly_hours: weeklyHours.trim(),
          }
        : null;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
        data: {
          full_name: fullName,
          role: role,
          preferred_language: language,
          phone: role === "parent" ? parentWhatsapp.trim() : role === "teacher" ? teacherWhatsapp.trim() : null,
          signup_details: {
            role,
            parent: parentDetails,
            teacher_volunteer: teacherDetails,
          },
          consent_given_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.session) {
      // Email confirmation is disabled — user is signed in immediately.
      router.push("/dashboard");
      router.refresh();
    } else {
      setSuccess(true);
    }
  };

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    setResendError(null);
    setResendMessage(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: getRedirectUrl() },
    });

    if (error) {
      setResendError(error.message);
    } else {
      setResendMessage(t.confirmationSent);
    }

    setResendLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />
        <div className="max-w-md w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center relative z-10 animate-fade-up">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            {RoleIcons.email}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.checkEmail}</h2>
          <p className="text-gray-600 mb-6">
            {t.sentConfirmation} <br />
            <span className="font-semibold text-gray-900" dir="ltr">{email}</span>
          </p>
          <p className="text-sm text-gray-500 mb-4">{t.resendHint}</p>
          {resendError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">
              {resendError}
            </div>
          )}
          {resendMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm mb-4">
              {resendMessage}
            </div>
          )}
          <button
            type="button"
            onClick={handleResendConfirmation}
            disabled={resendLoading}
            className="w-full mb-3 inline-flex items-center justify-center px-6 py-3 border border-[var(--primary)] text-[var(--primary)] font-semibold rounded-xl hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resendLoading ? t.sendingConfirmation : t.resendConfirmation}
          </button>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-6 py-3 bg-[var(--primary)] text-white font-semibold rounded-xl hover:bg-[var(--primary-light)] transition-colors shadow-lg shadow-green-900/20"
          >
            {t.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden py-12">
      {/* Grid Background */}
      <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />

      <div className="max-w-2xl w-full mx-4 bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-12 relative z-10 animate-fade-up">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.createAccount}</h1>
          <p className="text-gray-500">{t.joinSubtitle}</p>
        </div>

        <form className="space-y-6" onSubmit={handleSignup}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.fullNameLabel}
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder={t.fullNamePlaceholder}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.emailLabel}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder="name@example.com"
                dir="ltr"
                style={{ textAlign: "left" }}
              />
              {(role === "parent" || role === "teacher") && (
                <p className="mt-1.5 text-xs text-gray-500">{t.emailLoginHint}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.passwordLabel}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:bg-white transition-all"
                placeholder="••••••••"
                dir="ltr"
                style={{ textAlign: "left" }}
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.iAmA}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {roleOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRole(option.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-sm transition-all ${
                      role === option.id
                        ? "bg-green-50 border-[var(--primary)] text-[var(--primary)] ring-1 ring-[var(--primary)]"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`mb-1 ${role === option.id ? "text-[var(--primary)]" : "text-gray-400"}`}>{option.icon}</span>
                    <span className="font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {role === "parent" && (
              <div className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">{t.parentDetailsTitle}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">{t.programmeDesc}</p>
                </div>

                <div>
                  <label htmlFor="parentProfession" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.parentProfessionLabel}
                  </label>
                  <input
                    id="parentProfession"
                    type="text"
                    value={parentProfession}
                    onChange={(e) => setParentProfession(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    placeholder={t.professionPlaceholder}
                  />
                </div>

                <div>
                  <label htmlFor="parentWhatsapp" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.whatsappLabel}
                  </label>
                  <input
                    id="parentWhatsapp"
                    type="tel"
                    required
                    value={parentWhatsapp}
                    onChange={(e) => setParentWhatsapp(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    placeholder={t.whatsappPlaceholder}
                    dir="ltr"
                    style={{ textAlign: "left" }}
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-900">{t.eligibilityTitle}</h3>
                  {[
                    { id: "sudaneseDescent", label: t.sudaneseDescentLabel, value: sudaneseDescent, setter: setSudaneseDescent },
                    { id: "affectedByWar", label: t.affectedByWarLabel, value: affectedByWar, setter: setAffectedByWar },
                    { id: "missedSchooling", label: t.missedSchoolingLabel, value: missedSchooling, setter: setMissedSchooling },
                  ].map((field) => (
                    <label key={field.id} htmlFor={field.id} className="block">
                      <span className="block text-sm font-semibold text-gray-700 mb-1.5">{field.label}</span>
                      <select
                        id={field.id}
                        required
                        value={field.value}
                        onChange={(e) => field.setter(e.target.value as YesNoAnswer)}
                        className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                      >
                        <option value="">{language === "ar" ? "اختر" : "Select"}</option>
                        {yesNoOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div>
                  <label htmlFor="outOfSchoolDetails" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.outOfSchoolLabel}
                  </label>
                  <textarea
                    id="outOfSchoolDetails"
                    rows={3}
                    value={outOfSchoolDetails}
                    onChange={(e) => setOutOfSchoolDetails(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all resize-none"
                    placeholder={t.outOfSchoolPlaceholder}
                  />
                </div>

                <div>
                  <label htmlFor="eligibleChildren" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.childrenLabel}
                  </label>
                  <input
                    id="eligibleChildren"
                    type="text"
                    required
                    value={eligibleChildren}
                    onChange={(e) => setEligibleChildren(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    placeholder={t.childrenPlaceholder}
                  />
                </div>

                <div>
                  <label htmlFor="accessLogistics" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.accessLabel}
                  </label>
                  <textarea
                    id="accessLogistics"
                    rows={3}
                    required
                    value={accessLogistics}
                    onChange={(e) => setAccessLogistics(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all resize-none"
                    placeholder={t.accessPlaceholder}
                  />
                </div>
              </div>
            )}

            {role === "teacher" && (
              <div className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">{t.teacherDetailsTitle}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-blue-800">{t.volunteerInfoDesc}</p>
                </div>

                <div>
                  <label htmlFor="teacherWhatsapp" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.whatsappLabel}
                  </label>
                  <input
                    id="teacherWhatsapp"
                    type="tel"
                    required
                    value={teacherWhatsapp}
                    onChange={(e) => setTeacherWhatsapp(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    placeholder={t.whatsappPlaceholder}
                    dir="ltr"
                    style={{ textAlign: "left" }}
                  />
                </div>

                <div>
                  <label htmlFor="teacherLocation" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.locationLabel}
                  </label>
                  <input
                    id="teacherLocation"
                    type="text"
                    required
                    value={teacherLocation}
                    onChange={(e) => setTeacherLocation(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    placeholder={language === "ar" ? "القاهرة، مصر" : "Cairo, Egypt"}
                  />
                </div>

                <div>
                  <label htmlFor="educationalBackground" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.educationLabel}
                  </label>
                  <textarea
                    id="educationalBackground"
                    rows={3}
                    required
                    value={educationalBackground}
                    onChange={(e) => setEducationalBackground(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all resize-none"
                    placeholder={t.educationPlaceholder}
                  />
                </div>

                <div>
                  <span className="block text-sm font-semibold text-gray-700 mb-2">{t.involvementLabel}</span>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {involvementOptions.map((option) => {
                      const checked = involvementAreas.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            checked
                              ? "border-[var(--primary)] bg-emerald-50 text-[var(--primary)]"
                              : "border-gray-200 bg-white text-gray-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleInvolvementArea(option.value)}
                            className="h-4 w-4 rounded border-gray-300 accent-[var(--primary)]"
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="weeklyHours" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {t.hoursLabel}
                  </label>
                  <input
                    id="weeklyHours"
                    type="text"
                    required
                    value={weeklyHours}
                    onChange={(e) => setWeeklyHours(e.target.value)}
                    className="block w-full px-4 py-3 bg-white border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                    placeholder={t.hoursPlaceholder}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Consent Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => setConsentGiven(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer accent-[var(--primary)]"
            />
            <span className="text-sm text-gray-600 leading-snug">
              {t.consentLabel}{" "}
              <Link href="/terms" target="_blank" className="text-[var(--primary)] font-medium underline hover:text-[var(--primary-light)]">
                {t.termsLink}
              </Link>{" "}
              {t.andText}{" "}
              <Link href="/privacy" target="_blank" className="text-[var(--primary)] font-medium underline hover:text-[var(--primary-light)]">
                {t.privacyLink}
              </Link>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !consentGiven}
            className="w-full py-3.5 px-4 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-semibold rounded-xl shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>{t.creatingAccount}</span>
              </>
            ) : (
              t.createAccountBtn
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            {t.alreadyHaveAccount}{" "}
            <Link href="/auth/login" className="font-semibold text-[var(--primary)] hover:underline">
              {t.signIn}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
