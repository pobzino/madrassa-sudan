"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import {
  FloatingBook,
  FloatingPencil,
  FloatingTarget,
  FloatingStar,
  FloatingPalette,
  FloatingRocket,
  VideoIcon,
  RobotIcon,
  GamepadIcon,
  TrophyIcon,
  MathIcon,
  ScienceIcon,
  ArabicIcon,
  MadrassaLogo,
  GlobeIcon,
  MoonStarIcon,
  MapIcon,
  SparkleIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  LightningIcon,
  LightbulbIcon,
  GraduationCapIcon,
  BackpackIcon,
  TeacherIcon,
  QuestionIcon,
  PlayIcon,
  CelebrationIcon,
} from "@/components/illustrations";

// Helper function to render feature icons
const FeatureIcon = ({ type, className }: { type: string; className?: string }) => {
  switch (type) {
    case "video": return <VideoIcon className={className} />;
    case "robot": return <RobotIcon className={className} />;
    case "gamepad": return <GamepadIcon className={className} />;
    case "trophy": return <TrophyIcon className={className} />;
    default: return null;
  }
};

// Helper function to render subject icons
const SubjectIcon = ({ type, className }: { type: string; className?: string }) => {
  switch (type) {
    case "math": return <MathIcon className={className} />;
    case "science": return <ScienceIcon className={className} />;
    case "arabic": return <ArabicIcon className={className} />;
    case "globe": return <GlobeIcon className={className} />;
    case "moonstar": return <MoonStarIcon className={className} />;
    case "map": return <MapIcon className={className} />;
    default: return null;
  }
};

// Helper function to render how it works icons
const StepIcon = ({ type, className }: { type: string; className?: string }) => {
  switch (type) {
    case "sparkle": return <SparkleIcon className={className} />;
    case "bookopen": return <BookOpenIcon className={className} />;
    case "rocketlaunch": return <RocketLaunchIcon className={className} />;
    default: return null;
  }
};

export default function Home() {
  const { language, setLanguage, isRtl } = useLanguage();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [simPhase, setSimPhase] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const user = await getCachedUser(supabase);
      setIsAuthenticated(!!user);
    }
    checkAuth();
  }, [supabase]);

  useEffect(() => {
    const timer = setInterval(() => setSimPhase((p) => (p + 1) % 3), 3000);
    return () => clearInterval(timer);
  }, []);

  const t = {
    ar: {
      nav: { features: "المميزات", howItWorks: "كيف يعمل", teachers: "للمعلمين", faq: "الأسئلة" },
      login: "تسجيل الدخول",
      getStarted: "ابدأ الآن",
      goToDashboard: "لوحة التحكم",
      hero: {
        title1: "أفضل مكان",
        titleHighlight1: "للتعلم",
        titleAnd: "و",
        titleHighlight2: "اللعب",
        title2: "لأطفال السودان",
        subtitle: "منصة تعليمية مجانية ممتعة مع دروس تفاعلية، معلم ذكي، ومنهج سوداني معتمد",
        cta1: "ابدأ مجاناً",
        cta2: "شاهد كيف يعمل",
      },
      features: {
        label: "مميزاتنا التفاعلية",
        title: "تعلم بطريقة",
        titleHighlight: "ممتعة",
        items: [
          { title: "دروس ممتعة", desc: "فيديوهات تفاعلية مع رسوم متحركة تجعل التعلم مغامرة", color: "from-[#007229] to-[#00913D]", iconType: "video" },
          { title: "المعلم الذكي", desc: "صديقك الذكي الذي يساعدك على فهم أي سؤال بالعربية", color: "from-[#D21034] to-[#E8334F]", iconType: "robot" },
          { title: "الألعاب التعليمية", desc: "اختبارات وتحديات ممتعة تجعلك تتعلم وأنت تلعب", color: "from-[#005C22] to-[#007229]", iconType: "gamepad" },
          { title: "شهادات وجوائز", desc: "اجمع النقاط واحصل على شهادات وشارات تقدير", color: "from-amber-500 to-orange-600", iconType: "trophy" },
        ],
      },
      subjects: {
        label: "المواد الدراسية",
        title: "اختر مادتك المفضلة",
        items: [
          { name: "الرياضيات", iconType: "math", color: "from-[#007229] to-[#00913D]" },
          { name: "العلوم", iconType: "science", color: "from-[#D21034] to-[#E8334F]" },
          { name: "اللغة الإنجليزية", iconType: "globe", color: "from-[#005C22] to-[#007229]" },
        ],
      },
      howItWorks: {
        label: "كيف يعمل",
        title: "ثلاث خطوات للنجاح",
        steps: [
          { num: "1", title: "سجّل حسابك", desc: "أنشئ حساباً مجانياً في دقيقة واحدة", iconType: "sparkle" },
          { num: "2", title: "اختر موادك", desc: "حدد صفك الدراسي والمواد التي تريد تعلمها", iconType: "bookopen" },
          { num: "3", title: "ابدأ المغامرة", desc: "تعلم، العب، واجمع النقاط والشهادات", iconType: "rocketlaunch" },
        ],
      },
      sims: {
        label: "الدروس التفاعلية",
        title: "كيف تعمل الحصص؟",
        subtitle: "حصص مسجلة بصوت المعلم مع أنشطة تفاعلية — كأنك في الفصل لكن بتتعلم بسرعتك",
        steps: [
          { num: "1", title: "المعلم يشرح", desc: "تسمع صوت المعلم وتشوف الشرائح تتحرك قدامك — زي ما بشرح في الفصل بالظبط" },
          { num: "2", title: "وقفة للنشاط", desc: "الدرس بيوقف تلقائياً عشان تحل سؤال أو نشاط قبل ما تكمّل — اختبار، سحب وإفلات، أو توصيل" },
          { num: "3", title: "نتيجة فورية", desc: "تعرف إجابتك صح أو غلط فوراً. والمعلم يشوف أداءك ويتابع تقدمك" },
        ],
        features: [
          { title: "وقّف وارجع", desc: "ما فهمت؟ ارجع وسمع تاني" },
          { title: "سبورة حية", desc: "رسومات المعلم تظهر وهو بشرح" },
          { title: "تعلم بسرعتك", desc: "ما في ضغط — خذ وقتك" },
        ],
        cta: "جرّب درس تجريبي",
      },
      teachers: {
        label: "للمعلمين",
        title: "انضم لفريق الأبطال",
        subtitle: "ساعد أطفال السودان على التعلم من أي مكان في العالم",
        benefits: ["إدارة فصول متعددة بسهولة", "أدوات تصحيح ومتابعة متقدمة", "اصنع فرقاً حقيقياً في حياة الأطفال"],
        cta: "قدّم طلب للتدريس",
      },
      faq: {
        title: "أسئلة شائعة",
        items: [
          { q: "هل المنصة مجانية حقاً؟", a: "نعم، مجانية ١٠٠٪ لجميع الطلاب. نحن مبادرة غير ربحية." },
          { q: "ما هي المراحل المتوفرة؟", a: "نغطي المرحلة الابتدائية (١-٨)، والثانوية قريباً." },
          { q: "كيف يعمل المعلم الذكي؟", a: "يستخدم الذكاء الاصطناعي ليشرح ويساعدك على الفهم بالعربية." },
          { q: "هل أحتاج إنترنت دائم؟", a: "نعم، تحتاج اتصال بالإنترنت لمشاهدة الدروس." },
        ],
      },
      finalCta: {
        title: "مستعد للمغامرة؟",
        subtitle: "انضم للطلاب السودانيين. مجاناً للأبد!",
        cta: "ابدأ الآن مجاناً",
      },
      footer: {
        tagline: "نبني مستقبل السودان، طفل بطفل",
        links: { privacy: "الخصوصية", contact: "تواصل معنا", donate: "تبرّع" },
        copyright: "© ٢٠٢٦ مدرسة أمل",
      },
    },
    en: {
      nav: { features: "Features", howItWorks: "How it works", teachers: "For Teachers", faq: "FAQ" },
      login: "Log in",
      getStarted: "Start Now",
      goToDashboard: "Dashboard",
      hero: {
        title1: "The best place to",
        titleHighlight1: "learn",
        titleAnd: "and",
        titleHighlight2: "play",
        title2: "for Sudanese kids",
        subtitle: "A free fun learning platform with interactive lessons, AI tutor, and certified Sudanese curriculum",
        cta1: "Start Now",
        cta2: "See How It Works",
      },
      features: {
        label: "Our Interactive Features",
        title: "Learn in a",
        titleHighlight: "fun way",
        items: [
          { title: "Fun Lessons", desc: "Interactive videos with animations that make learning an adventure", color: "from-[#007229] to-[#00913D]", iconType: "video" },
          { title: "AI Tutor", desc: "Your smart friend who helps you understand any question in Arabic", color: "from-[#D21034] to-[#E8334F]", iconType: "robot" },
          { title: "Learning Games", desc: "Fun quizzes and challenges that let you learn while playing", color: "from-[#005C22] to-[#007229]", iconType: "gamepad" },
          { title: "Badges & Awards", desc: "Collect points and earn certificates and achievement badges", color: "from-amber-500 to-orange-600", iconType: "trophy" },
        ],
      },
      subjects: {
        label: "Subjects",
        title: "Pick your favorite subject",
        items: [
          { name: "Mathematics", iconType: "math", color: "from-[#007229] to-[#00913D]" },
          { name: "Science", iconType: "science", color: "from-[#D21034] to-[#E8334F]" },
          { name: "English", iconType: "globe", color: "from-[#005C22] to-[#007229]" },
        ],
      },
      howItWorks: {
        label: "HOW IT WORKS",
        title: "Three steps to success",
        steps: [
          { num: "1", title: "Create Account", desc: "Sign up for free in one minute", iconType: "sparkle" },
          { num: "2", title: "Choose Subjects", desc: "Select your grade and subjects you want to learn", iconType: "bookopen" },
          { num: "3", title: "Start Adventure", desc: "Learn, play, and collect points and certificates", iconType: "rocketlaunch" },
        ],
      },
      sims: {
        label: "INTERACTIVE LESSONS",
        title: "How do lessons work?",
        subtitle: "Recorded lessons with your teacher's voice and interactive activities — like being in class, but you learn at your own pace",
        steps: [
          { num: "1", title: "Teacher explains", desc: "Hear your teacher's voice while slides move in sync — just like a real classroom lesson" },
          { num: "2", title: "Pause for activity", desc: "The lesson pauses automatically so you can solve a quiz, drag-and-drop, or matching activity before continuing" },
          { num: "3", title: "Instant feedback", desc: "Know right away if your answer is correct. Your teacher can track your progress and see how you're doing" },
        ],
        features: [
          { title: "Pause & rewind", desc: "Didn't get it? Go back and listen again" },
          { title: "Live whiteboard", desc: "See your teacher's drawings as they explain" },
          { title: "Learn at your pace", desc: "No pressure — take your time" },
        ],
        cta: "Try a sample lesson",
      },
      teachers: {
        label: "FOR TEACHERS",
        title: "Join the hero team",
        subtitle: "Help Sudanese children learn from anywhere in the world",
        benefits: ["Manage multiple classes easily", "Advanced grading and tracking tools", "Make a real difference in children's lives"],
        cta: "Apply to Teach",
      },
      faq: {
        title: "Common Questions",
        items: [
          { q: "Is the platform really free?", a: "Yes, 100% free for all students. We're a non-profit initiative." },
          { q: "What grade levels are available?", a: "We cover primary school (1-8), with secondary coming soon." },
          { q: "How does the AI tutor work?", a: "It uses AI to explain and help you understand in Arabic." },
          { q: "Do I need constant internet?", a: "Yes, you need an internet connection to watch lessons." },
        ],
      },
      finalCta: {
        title: "Ready for the adventure?",
        subtitle: "Join Sudanese students learning online. Free forever!",
        cta: "Start Free Now",
      },
      footer: {
        tagline: "Building Sudan's future, one child at a time",
        links: { privacy: "Privacy", contact: "Contact", donate: "Donate" },
        copyright: "© 2026 Amal School",
      },
    },
  };

  const txt = t[language];

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <MadrassaLogo size="sm" className="flex sm:hidden" />
            <MadrassaLogo size="md" className="hidden sm:flex" />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-[#007229] transition-colors">{txt.nav.features}</a>
            <a href="#how-it-works" className="hover:text-[#007229] transition-colors">{txt.nav.howItWorks}</a>
            <a href="#teachers" className="hover:text-[#007229] transition-colors">{txt.nav.teachers}</a>
            <a href="#faq" className="hover:text-[#007229] transition-colors">{txt.nav.faq}</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="px-2.5 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {language === "ar" ? "EN" : "عربي"}
            </button>
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-lg shadow-[#007229]/30 flex items-center gap-1.5 sm:gap-2"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="hidden xs:inline">{txt.goToDashboard}</span>
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="hidden sm:block text-sm font-semibold text-gray-600 hover:text-gray-900">
                  {txt.login}
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-lg shadow-[#007229]/30"
                >
                  {txt.getStarted}
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-14 sm:pt-16">
        {/* Hero Section */}
        <section className="relative pt-6 sm:pt-8 pb-12 sm:pb-16 overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Soft gradient blobs - more subtle */}
            <div className="absolute top-10 left-10 w-64 h-64 bg-violet-200/30 rounded-full blur-3xl" />
            <div className="absolute top-20 right-10 w-72 h-72 bg-[#007229]/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-amber-200/30 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-1/4 w-56 h-56 bg-[#D21034]/10 rounded-full blur-3xl" />

            {/* Floating decorative elements - better distributed */}
            <div className="absolute top-24 left-[8%] w-12 h-12 animate-bounce hidden sm:block" style={{ animationDelay: "0s", animationDuration: "3s" }}>
              <FloatingBook className="w-full h-full drop-shadow-lg" />
            </div>
            <div className="absolute top-32 right-[10%] w-10 h-10 animate-bounce hidden sm:block" style={{ animationDelay: "0.5s", animationDuration: "2.5s" }}>
              <FloatingPencil className="w-full h-full drop-shadow-lg" />
            </div>
            <div className="absolute top-48 left-[4%] w-10 h-10 animate-bounce hidden md:block" style={{ animationDelay: "1s", animationDuration: "3.5s" }}>
              <FloatingTarget className="w-full h-full drop-shadow-lg" />
            </div>
            <div className="absolute top-20 right-[5%] w-12 h-12 animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "2.8s" }}>
              <FloatingStar className="w-full h-full drop-shadow-lg" />
            </div>
            <div className="absolute bottom-32 left-[12%] w-10 h-10 animate-bounce hidden sm:block" style={{ animationDelay: "0.7s", animationDuration: "3.2s" }}>
              <FloatingPalette className="w-full h-full drop-shadow-lg" />
            </div>
            <div className="absolute top-40 right-[4%] w-14 h-14 animate-bounce hidden md:block" style={{ animationDelay: "0.2s", animationDuration: "3s" }}>
              <FloatingRocket className="w-full h-full drop-shadow-lg" />
            </div>
            {/* Extra illustrations for richness */}
            <div className="absolute bottom-24 right-[8%] w-10 h-10 animate-bounce hidden sm:block" style={{ animationDelay: "0.4s", animationDuration: "2.6s" }}>
              <TrophyIcon className="w-full h-full" />
            </div>
            <div className="absolute bottom-40 left-[6%] w-8 h-8 animate-bounce hidden md:block" style={{ animationDelay: "0.9s", animationDuration: "3.1s" }}>
              <GamepadIcon className="w-full h-full" />
            </div>
          </div>

          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
            <div className="text-center">
              {/* Main headline with colorful highlights */}
              <h1 className="font-fredoka text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-medium text-gray-900 leading-[1.15] sm:leading-[1.1] mb-4 sm:mb-6">
                {txt.hero.title1}
                <br />
                <span className="relative inline-block text-violet-600">
                  {txt.hero.titleHighlight1}
                  <svg className="absolute -bottom-1 sm:-bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 8 Q 50 2 100 8 T 198 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-violet-400" />
                  </svg>
                </span>
                {" "}{txt.hero.titleAnd}{" "}
                <span className="relative inline-block text-[#007229]">
                  {txt.hero.titleHighlight2}
                  <svg className="absolute -bottom-1 sm:-bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 8 Q 50 2 100 8 T 198 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-[#00913D]" />
                  </svg>
                </span>
                <br />
                {txt.hero.title2}
              </h1>

              <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-6 sm:mb-10 px-2">
                {txt.hero.subtitle}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-10">
                {isAuthenticated ? (
                  <Link
                    href="/dashboard"
                    className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    {txt.goToDashboard}
                  </Link>
                ) : (
                  <Link
                    href="/auth/signup"
                    className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1 flex items-center justify-center gap-2"
                  >
                    {txt.hero.cta1}
                    <CelebrationIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Link>
                )}
                <a
                  href="#how-it-works"
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold text-gray-700 bg-white border-2 border-gray-200 rounded-full hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#007229]" />
                  {txt.hero.cta2}
                </a>
              </div>

            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-10 sm:py-16 bg-gradient-to-b from-white to-gray-50 relative">
          {/* Decorative elements - hidden on mobile */}
          <div className="absolute top-10 right-10 w-16 h-16 opacity-20 hidden sm:block">
            <LightningIcon className="w-full h-full text-amber-500" />
          </div>
          <div className="absolute bottom-20 left-10 w-14 h-14 opacity-20 hidden sm:block">
            <LightbulbIcon className="w-full h-full text-yellow-500" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-8 sm:mb-10">
              <span className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-violet-100 text-violet-700 rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-4">
                {txt.features.label}
              </span>
              <h2 className="font-fredoka text-2xl sm:text-3xl md:text-5xl font-semibold text-gray-900">
                {txt.features.title}{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600">
                  {txt.features.titleHighlight}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {txt.features.items.map((feature, i) => (
                <div
                  key={i}
                  className="group relative bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-2 border border-gray-100 overflow-hidden"
                >
                  {/* Gradient background on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                  <div className="relative z-10">
                    <div className="w-10 h-10 sm:w-14 sm:h-14 mb-3 sm:mb-4 text-violet-600 group-hover:text-white transition-colors">
                      <FeatureIcon type={feature.iconType} className="w-full h-full" />
                    </div>
                    <h3 className="text-sm sm:text-xl font-bold text-gray-900 group-hover:text-white mb-1 sm:mb-3 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-xs sm:text-base text-gray-600 group-hover:text-white/90 transition-colors line-clamp-3 sm:line-clamp-none">
                      {feature.desc}
                    </p>
                  </div>

                  {/* Decorative shape */}
                  <div className="absolute -bottom-8 -right-8 w-16 sm:w-24 h-16 sm:h-24 bg-gray-100 group-hover:bg-white/20 rounded-full transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Subjects Section */}
        <section className="py-10 sm:py-16 bg-white relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0">
            <div className="absolute top-40 left-20 w-64 h-64 bg-cyan-100/30 rounded-full blur-3xl hidden sm:block" />
            <div className="absolute bottom-20 right-20 w-80 h-80 bg-violet-100/30 rounded-full blur-3xl hidden sm:block" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-6 sm:mb-10">
              <span className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-4">
                {txt.subjects.label}
              </span>
              <h2 className="font-fredoka text-2xl sm:text-3xl md:text-5xl font-semibold text-gray-900">
                {txt.subjects.title}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
              {txt.subjects.items.map((subject, i) => (
                <Link
                  key={i}
                  href="/auth/signup"
                  className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-10 text-center transition-all hover:-translate-y-2 hover:shadow-2xl min-h-[120px] sm:min-h-[180px] lg:min-h-[220px] flex items-center justify-center"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${subject.color}`} />
                  <div className="absolute top-0 right-0 w-16 sm:w-24 lg:w-32 h-16 sm:h-24 lg:h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-12 sm:w-20 lg:w-28 h-12 sm:h-20 lg:h-28 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                  <div className="relative z-10">
                    <div className="w-12 h-12 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 sm:mb-4 text-white drop-shadow-lg">
                      <SubjectIcon type={subject.iconType} className="w-full h-full" />
                    </div>
                    <span className="font-bold text-white text-sm sm:text-lg lg:text-xl">{subject.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-10 sm:py-16 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 relative overflow-hidden">
          {/* Decorative elements - simplified on mobile */}
          <div className="absolute inset-0">
            <div className="absolute top-10 left-10 w-20 sm:w-32 h-20 sm:h-32 border-4 border-white/10 rounded-full" />
            <div className="absolute bottom-10 right-10 w-24 sm:w-48 h-24 sm:h-48 border-4 border-white/10 rounded-full" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-6 sm:mb-10">
              <span className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-white/20 text-white rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-4">
                {txt.howItWorks.label}
              </span>
              <h2 className="font-fredoka text-2xl sm:text-3xl md:text-5xl font-semibold text-white">
                {txt.howItWorks.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
              {txt.howItWorks.steps.map((step, i) => (
                <div key={i} className="relative">
                  {/* Connector line - desktop only */}
                  {i < 2 && (
                    <div className={`hidden md:block absolute top-16 ${isRtl ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} w-full h-1 border-t-4 border-dashed border-white/30`} />
                  )}

                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center border border-white/20 hover:bg-white/20 transition-all flex sm:block items-center gap-4 sm:gap-0">
                    <div className="flex-shrink-0 sm:block">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 sm:mx-auto mb-0 sm:mb-4 text-white">
                        <StepIcon type={step.iconType} className="w-full h-full" />
                      </div>
                    </div>
                    <div className="flex-1 text-left sm:text-center">
                      <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-white text-violet-600 font-extrabold text-sm sm:text-xl flex items-center justify-center sm:mx-auto mb-1 sm:mb-4 inline-flex sm:flex">
                        {step.num}
                      </div>
                      <h3 className="text-base sm:text-xl font-bold text-white mb-1 sm:mb-2 inline sm:block ml-2 sm:ml-0">{step.title}</h3>
                      <p className="text-sm sm:text-base text-white/80 mt-1 sm:mt-0">{step.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How Sims Work */}
        <section id="sims" className="py-10 sm:py-16 bg-white relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-20 right-20 w-72 h-72 bg-emerald-100/30 rounded-full blur-3xl hidden sm:block" />
            <div className="absolute bottom-20 left-10 w-64 h-64 bg-amber-100/30 rounded-full blur-3xl hidden sm:block" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-8 sm:mb-12">
              <span className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-4">
                {txt.sims.label}
              </span>
              <h2 className="font-fredoka text-2xl sm:text-3xl md:text-5xl font-semibold text-gray-900 mb-3 sm:mb-4">
                {txt.sims.title}
              </h2>
              <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
                {txt.sims.subtitle}
              </p>
            </div>

            {/* Animated Lesson Mockup */}
            <div className="max-w-3xl mx-auto mb-10 sm:mb-14">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl shadow-gray-200/60 border border-gray-200 overflow-hidden">
                {/* Top bar */}
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 sm:px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-white/30" />
                    <div className="w-3 h-3 rounded-full bg-white/30" />
                    <div className="w-3 h-3 rounded-full bg-white/30" />
                  </div>
                  <span className="text-white/90 text-xs sm:text-sm font-bold">{language === "ar" ? "الكسور — الصف الرابع" : "Fractions — Grade 4"}</span>
                  <div className="w-16" />
                </div>

                {/* Slide content area */}
                <div className="relative p-5 sm:p-8 min-h-[220px] sm:min-h-[280px] bg-gradient-to-br from-gray-50 to-white">
                  {/* Slide content */}
                  <div className="flex gap-4 sm:gap-6">
                    <div className="flex-1 space-y-3 sm:space-y-4">
                      <h3 className="text-lg sm:text-2xl font-bold text-gray-800">{language === "ar" ? "ما هي الكسور؟" : "What are fractions?"}</h3>
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded-full w-full" />
                        <div className="h-3 bg-gray-200 rounded-full w-5/6" />
                        <div className="h-3 bg-gray-200 rounded-full w-4/6" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <div className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">1/2</div>
                        <div className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">1/4</div>
                        <div className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-bold">3/4</div>
                      </div>
                    </div>
                    {/* Illustration circle */}
                    <div className="hidden sm:flex w-28 h-28 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 items-center justify-center flex-shrink-0">
                      <svg className="w-16 h-16 text-amber-500" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3" />
                        <line x1="32" y1="4" x2="32" y2="60" stroke="currentColor" strokeWidth="3" />
                        <path d="M32 4 A28 28 0 0 1 32 60" fill="currentColor" opacity="0.2" />
                      </svg>
                    </div>
                  </div>

                  {/* Quiz popup — slides in during phase 1+2 */}
                  <div className={`absolute bottom-3 ${isRtl ? "left-3 sm:left-5" : "right-3 sm:right-5"} w-56 sm:w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-3 sm:p-4 transition-all duration-700 ease-in-out ${simPhase >= 1 ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
                    <p className="text-xs font-bold text-gray-700 mb-2">{language === "ar" ? "ما هو نصف الكعكة؟" : "What is half of a cake?"}</p>
                    <div className="space-y-1.5">
                      {[
                        { label: "1/2", correct: true },
                        { label: "1/3", correct: false },
                        { label: "2/4", correct: false },
                      ].map((opt, oi) => (
                        <div key={oi} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-500 ${
                          opt.correct && simPhase === 2
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                            : "bg-gray-50 text-gray-600 border border-gray-100"
                        }`}>
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                            opt.correct && simPhase === 2 ? "border-emerald-500 bg-emerald-500" : "border-gray-300"
                          }`}>
                            {opt.correct && simPhase === 2 && (
                              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          {opt.label}
                        </div>
                      ))}
                    </div>
                    {simPhase === 2 && (
                      <div className="mt-2 text-[10px] font-bold text-emerald-600 flex items-center gap-1 animate-bounce">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75" /></svg>
                        {language === "ar" ? "إجابة صحيحة!" : "Correct!"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio bar */}
                <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
                  {/* Play/Pause */}
                  <button className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                    {simPhase === 0 ? (
                      <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                  {/* Progress bar */}
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-500 rounded-full transition-all ease-linear ${simPhase === 0 ? "w-[60%] duration-[3000ms]" : "w-[45%] duration-0"}`} />
                  </div>
                  {/* Waveform */}
                  <div className="flex items-center gap-[3px]">
                    {[3, 5, 2, 6, 4, 3, 5, 2, 4, 6].map((h, wi) => (
                      <div
                        key={wi}
                        className={`w-[3px] rounded-full transition-all duration-300 ${simPhase === 0 ? "bg-emerald-400" : "bg-gray-300"}`}
                        style={{
                          height: simPhase === 0 ? `${h * 3}px` : "4px",
                          transitionDelay: `${wi * 30}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono w-12 text-right">04:32</span>
                </div>
              </div>
            </div>

            {/* 3-step flow */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
              {txt.sims.steps.map((step, i) => {
                const colors = [
                  { bg: "bg-[#007229]", light: "bg-emerald-50", text: "text-[#007229]", border: "border-emerald-200", ring: "ring-emerald-400" },
                  { bg: "bg-amber-500", light: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", ring: "ring-amber-400" },
                  { bg: "bg-[#D21034]", light: "bg-red-50", text: "text-[#D21034]", border: "border-red-200", ring: "ring-red-400" },
                ][i];
                const icons = [
                  <svg key="listen" className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                  </svg>,
                  <svg key="interact" className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3.15M10.05 4.575a1.575 1.575 0 0 1 3.15 0v1.575M10.05 4.575v5.85m3.15-4.275a1.575 1.575 0 0 1 3.15 0v1.575m0 0a1.575 1.575 0 0 1 3.15 0v5.85m-3.15-5.85v.75m-9.45 3.525H5.325a1.575 1.575 0 0 0-1.575 1.575v.675c0 3.107 2.518 5.625 5.625 5.625h2.25c3.107 0 5.625-2.518 5.625-5.625v-5.85" />
                  </svg>,
                  <svg key="check" className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>,
                ];
                const isActive = simPhase === i;

                return (
                  <div key={i} className={`relative ${colors.light} ${colors.border} border rounded-2xl sm:rounded-3xl p-5 sm:p-8 transition-all duration-500 ${isActive ? `ring-2 ${colors.ring} scale-[1.02] shadow-lg` : "scale-100"}`}>
                    <div className="flex items-center gap-3 mb-3 sm:mb-4">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 ${colors.bg} rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0`}>
                        {icons[i]}
                      </div>
                      <span className={`text-xs font-bold ${colors.text} uppercase tracking-wider`}>
                        {language === "ar" ? `الخطوة ${step.num}` : `Step ${step.num}`}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1 sm:mb-2">{step.title}</h3>
                    <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{step.desc}</p>

                    {i < 2 && (
                      <div className={`hidden sm:block absolute top-1/2 -translate-y-1/2 ${isRtl ? "-left-4" : "-right-4"} z-10`}>
                        <div className={`w-8 h-8 bg-white border-2 ${colors.border} rounded-full flex items-center justify-center`}>
                          <svg className={`w-4 h-4 ${colors.text} ${isRtl ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mb-8">
              {txt.sims.features.map((feat, i) => {
                const pillIcons = [
                  <svg key="rw" className="w-4 h-4 sm:w-5 sm:h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061A1.125 1.125 0 0 1 21 8.689v8.122ZM11.25 16.811c0 .864-.933 1.406-1.683.977l-7.108-4.061a1.125 1.125 0 0 1 0-1.954l7.108-4.061a1.125 1.125 0 0 1 1.683.977v8.122Z" />
                  </svg>,
                  <svg key="wb" className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                  </svg>,
                  <svg key="pace" className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>,
                ];
                const pillBgs = ["bg-violet-50 border-violet-200", "bg-emerald-50 border-emerald-200", "bg-amber-50 border-amber-200"];

                return (
                  <div key={i} className={`flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 ${pillBgs[i]} border rounded-full`}>
                    {pillIcons[i]}
                    <div className="text-left">
                      <span className="text-sm sm:text-base font-bold text-gray-900">{feat.title}</span>
                      <span className="text-xs sm:text-sm text-gray-500 ml-1.5">{feat.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Try a sample lesson CTA */}
            <div className="text-center">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1"
              >
                <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                {txt.sims.cta}
              </Link>
            </div>
          </div>
        </section>

        {/* For Teachers */}
        <section id="teachers" className="py-10 sm:py-16 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-16 relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-32 sm:w-64 h-32 sm:h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-24 sm:w-48 h-24 sm:h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="absolute top-10 left-10 w-12 sm:w-16 h-12 sm:h-16 opacity-30 hidden sm:block">
                <GraduationCapIcon className="w-full h-full text-white" />
              </div>
              <div className="absolute bottom-10 right-10 w-12 sm:w-16 h-12 sm:h-16 opacity-30 hidden sm:block">
                <SparkleIcon className="w-full h-full text-white" />
              </div>

              <div className="relative z-10 grid md:grid-cols-2 gap-6 sm:gap-12 items-center">
                <div className="text-white">
                  <span className="inline-block px-3 sm:px-4 py-1.5 sm:py-2 bg-white/20 rounded-full text-xs sm:text-sm font-bold mb-3 sm:mb-4">
                    {txt.teachers.label}
                  </span>
                  <h2 className="font-fredoka text-2xl sm:text-3xl md:text-4xl font-semibold mb-3 sm:mb-4">{txt.teachers.title}</h2>
                  <p className="text-white/90 text-sm sm:text-lg mb-5 sm:mb-8">{txt.teachers.subtitle}</p>

                  <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                    {txt.teachers.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-center gap-2 sm:gap-3">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                          <span className="text-amber-500 text-sm sm:text-base">✓</span>
                        </div>
                        <span className="font-medium text-sm sm:text-base">{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/auth/signup?role=teacher"
                    className="inline-flex items-center gap-2 px-5 sm:px-8 py-3 sm:py-4 bg-white text-amber-600 rounded-full font-bold hover:bg-gray-100 transition-all shadow-xl text-sm sm:text-base"
                  >
                    {txt.teachers.cta}
                    <span>→</span>
                  </Link>
                </div>

                <div className="hidden md:flex items-center justify-center">
                  <div className="w-48 h-48 text-white/90">
                    <TeacherIcon className="w-full h-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-10 sm:py-16 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-6 sm:mb-12">
              <div className="inline-flex items-center gap-2 sm:gap-3">
                <h2 className="font-fredoka text-2xl sm:text-3xl md:text-4xl font-semibold text-gray-900">
                  {txt.faq.title}
                </h2>
                <QuestionIcon className="w-7 h-7 sm:w-10 sm:h-10 text-violet-500" />
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {txt.faq.items.map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3"
                  >
                    <span className="font-bold text-gray-900 text-left text-sm sm:text-base">{item.q}</span>
                    <span className={`text-xl sm:text-2xl transition-transform flex-shrink-0 ${openFaq === i ? "rotate-45" : ""}`}>
                      +
                    </span>
                  </button>
                  {openFaq === i && (
                    <div className="px-4 sm:px-6 pb-4 sm:pb-5 text-gray-600 text-sm sm:text-base">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-10 sm:py-16 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-emerald-100/50 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-cyan-100/50 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6">
              <BackpackIcon className="w-full h-full text-emerald-600" />
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-gray-900 mb-3 sm:mb-4">
              {txt.finalCta.title}
            </h2>
            <p className="text-base sm:text-xl text-gray-600 mb-6 sm:mb-10">{txt.finalCta.subtitle}</p>
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-10 py-3.5 sm:py-5 text-base sm:text-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-xl shadow-emerald-500/30 hover:shadow-2xl hover:-translate-y-1"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {txt.goToDashboard}
              </Link>
            ) : (
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-10 py-3.5 sm:py-5 text-base sm:text-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-xl shadow-emerald-500/30 hover:shadow-2xl hover:-translate-y-1"
              >
                {txt.finalCta.cta}
                <FloatingRocket className="w-6 h-6 sm:w-8 sm:h-8" />
              </Link>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
            <div className="flex flex-col items-center md:items-start gap-1">
              <MadrassaLogo size="sm" />
              <p className="text-xs sm:text-sm text-gray-500 text-center md:text-left">{txt.footer.tagline}</p>
            </div>

            <div className="flex items-center gap-4 sm:gap-8 text-xs sm:text-sm text-gray-600">
              <a href="/privacy" className="hover:text-[#007229] transition-colors">{txt.footer.links.privacy}</a>
              <a href="/terms" className="hover:text-[#007229] transition-colors">{txt.footer.links.contact}</a>
              <a href="#" className="hover:text-[#D21034] transition-colors">{txt.footer.links.donate}</a>
            </div>

            <p className="text-xs sm:text-sm text-gray-500">{txt.footer.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
