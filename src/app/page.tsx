"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    }
    checkAuth();
  }, [supabase]);

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
        stats: { students: "طالب نشط", lessons: "درس متوفر", teachers: "معلم متطوع" },
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
          { q: "هل أحتاج إنترنت دائم؟", a: "نعم لمشاهدة الدروس، ونعمل على ميزة التحميل." },
        ],
      },
      finalCta: {
        title: "مستعد للمغامرة؟",
        subtitle: "انضم لآلاف الطلاب السودانيين. مجاناً للأبد!",
        cta: "ابدأ الآن مجاناً",
      },
      footer: {
        tagline: "نبني مستقبل السودان، طفل بطفل",
        links: { privacy: "الخصوصية", contact: "تواصل معنا", donate: "تبرّع" },
        copyright: "© ٢٠٢٦ مدرسة السودان",
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
        cta1: "Start Free",
        cta2: "See How It Works",
        stats: { students: "Active Students", lessons: "Lessons Available", teachers: "Volunteer Teachers" },
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
          { q: "Do I need constant internet?", a: "Yes for watching lessons, we're working on offline downloads." },
        ],
      },
      finalCta: {
        title: "Ready for the adventure?",
        subtitle: "Join thousands of Sudanese students. Free forever!",
        cta: "Start Free Now",
      },
      footer: {
        tagline: "Building Sudan's future, one child at a time",
        links: { privacy: "Privacy", contact: "Contact", donate: "Donate" },
        copyright: "© 2026 Madrassa Sudan",
      },
    },
  };

  const txt = t[language];

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/">
            <MadrassaLogo size="sm" className="sm:hidden" />
            <MadrassaLogo size="md" className="hidden sm:block" />
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

              {/* Stats */}
              <div className="flex flex-wrap justify-center gap-6 sm:gap-8 md:gap-16">
                <div className="text-center min-w-[80px]">
                  <div className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600">
                    5,000+
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">{txt.hero.stats.students}</div>
                </div>
                <div className="text-center min-w-[80px]">
                  <div className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#007229] to-[#00913D]">
                    500+
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">{txt.hero.stats.lessons}</div>
                </div>
                <div className="text-center min-w-[80px]">
                  <div className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
                    50+
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600 font-medium mt-1">{txt.hero.stats.teachers}</div>
                </div>
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
        <section className="py-10 sm:py-16 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-32 bg-gray-50" />
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

            <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-3xl mx-auto">
              {txt.subjects.items.map((subject, i) => (
                <Link
                  key={i}
                  href="/auth/signup"
                  className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-center transition-all hover:-translate-y-2 hover:shadow-2xl"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${subject.color}`} />
                  <div className="absolute top-0 right-0 w-16 sm:w-24 h-16 sm:h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-12 sm:w-20 h-12 sm:h-20 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                  <div className="relative z-10">
                    <div className="w-12 h-12 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-4 text-white drop-shadow-lg">
                      <SubjectIcon type={subject.iconType} className="w-full h-full" />
                    </div>
                    <span className="font-bold text-white text-xs sm:text-lg">{subject.name}</span>
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
              <a href="#" className="hover:text-[#007229] transition-colors">{txt.footer.links.privacy}</a>
              <a href="#" className="hover:text-[#007229] transition-colors">{txt.footer.links.contact}</a>
              <a href="#" className="hover:text-[#D21034] transition-colors">{txt.footer.links.donate}</a>
            </div>

            <p className="text-xs sm:text-sm text-gray-500">{txt.footer.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
