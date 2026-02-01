"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
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

  const t = {
    ar: {
      nav: { features: "المميزات", howItWorks: "كيف يعمل", teachers: "للمعلمين", faq: "الأسئلة" },
      login: "تسجيل الدخول",
      getStarted: "ابدأ الآن",
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
          { title: "دروس ممتعة", desc: "فيديوهات تفاعلية مع رسوم متحركة تجعل التعلم مغامرة", color: "from-violet-500 to-purple-600", iconType: "video" },
          { title: "المعلم الذكي", desc: "صديقك الذكي الذي يساعدك على فهم أي سؤال بالعربية", color: "from-cyan-500 to-blue-600", iconType: "robot" },
          { title: "الألعاب التعليمية", desc: "اختبارات وتحديات ممتعة تجعلك تتعلم وأنت تلعب", color: "from-emerald-500 to-teal-600", iconType: "gamepad" },
          { title: "شهادات وجوائز", desc: "اجمع النقاط واحصل على شهادات وشارات تقدير", color: "from-amber-500 to-orange-600", iconType: "trophy" },
        ],
      },
      subjects: {
        label: "المواد الدراسية",
        title: "اختر مادتك المفضلة",
        items: [
          { name: "الرياضيات", iconType: "math", color: "from-blue-500 to-indigo-600" },
          { name: "العلوم", iconType: "science", color: "from-emerald-500 to-teal-600" },
          { name: "اللغة العربية", iconType: "arabic", color: "from-amber-500 to-orange-600" },
          { name: "اللغة الإنجليزية", iconType: "globe", color: "from-violet-500 to-purple-600" },
          { name: "التربية الإسلامية", iconType: "moonstar", color: "from-cyan-500 to-blue-600" },
          { name: "الدراسات الاجتماعية", iconType: "map", color: "from-pink-500 to-rose-600" },
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
          { title: "Fun Lessons", desc: "Interactive videos with animations that make learning an adventure", color: "from-violet-500 to-purple-600", iconType: "video" },
          { title: "AI Tutor", desc: "Your smart friend who helps you understand any question in Arabic", color: "from-cyan-500 to-blue-600", iconType: "robot" },
          { title: "Learning Games", desc: "Fun quizzes and challenges that let you learn while playing", color: "from-emerald-500 to-teal-600", iconType: "gamepad" },
          { title: "Badges & Awards", desc: "Collect points and earn certificates and achievement badges", color: "from-amber-500 to-orange-600", iconType: "trophy" },
        ],
      },
      subjects: {
        label: "Subjects",
        title: "Pick your favorite subject",
        items: [
          { name: "Mathematics", iconType: "math", color: "from-blue-500 to-indigo-600" },
          { name: "Science", iconType: "science", color: "from-emerald-500 to-teal-600" },
          { name: "Arabic", iconType: "arabic", color: "from-amber-500 to-orange-600" },
          { name: "English", iconType: "globe", color: "from-violet-500 to-purple-600" },
          { name: "Islamic Studies", iconType: "moonstar", color: "from-cyan-500 to-blue-600" },
          { name: "Social Studies", iconType: "map", color: "from-pink-500 to-rose-600" },
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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-500/30">
              م
            </div>
            <span className="text-lg font-bold text-gray-900 hidden sm:block">
              {isRtl ? "مدرسة السودان" : "Madrassa Sudan"}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-emerald-600 transition-colors">{txt.nav.features}</a>
            <a href="#how-it-works" className="hover:text-emerald-600 transition-colors">{txt.nav.howItWorks}</a>
            <a href="#teachers" className="hover:text-emerald-600 transition-colors">{txt.nav.teachers}</a>
            <a href="#faq" className="hover:text-emerald-600 transition-colors">{txt.nav.faq}</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {language === "ar" ? "EN" : "عربي"}
            </button>
            <Link href="/auth/login" className="hidden sm:block text-sm font-semibold text-gray-600 hover:text-gray-900">
              {txt.login}
            </Link>
            <Link
              href="/auth/signup"
              className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-lg shadow-emerald-500/30"
            >
              {txt.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative pt-8 pb-16 overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Soft gradient blobs - more subtle */}
            <div className="absolute top-10 left-10 w-64 h-64 bg-violet-200/30 rounded-full blur-3xl" />
            <div className="absolute top-20 right-10 w-72 h-72 bg-cyan-200/30 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-amber-200/30 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-1/4 w-56 h-56 bg-emerald-200/30 rounded-full blur-3xl" />

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

          <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
            <div className="text-center">
              {/* Main headline with colorful highlights */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight mb-6">
                {txt.hero.title1}
                <br />
                <span className="relative inline-block text-violet-600">
                  {txt.hero.titleHighlight1}
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 8 Q 50 2 100 8 T 198 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-violet-400" />
                  </svg>
                </span>
                {" "}{txt.hero.titleAnd}{" "}
                <span className="relative inline-block text-emerald-500">
                  {txt.hero.titleHighlight2}
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 8 Q 50 2 100 8 T 198 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-emerald-400" />
                  </svg>
                </span>
                <br />
                {txt.hero.title2}
              </h1>

              <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
                {txt.hero.subtitle}
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
                <Link
                  href="/auth/signup"
                  className="group px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-xl shadow-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/40 hover:-translate-y-1 flex items-center gap-2"
                >
                  {txt.hero.cta1}
                  <CelebrationIcon className="w-6 h-6" />
                </Link>
                <a
                  href="#how-it-works"
                  className="px-8 py-4 text-lg font-semibold text-gray-700 bg-white border-2 border-gray-200 rounded-full hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center gap-2"
                >
                  <PlayIcon className="w-6 h-6 text-emerald-500" />
                  {txt.hero.cta2}
                </a>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap justify-center gap-8 md:gap-16">
                <div className="text-center">
                  <div className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600">
                    5,000+
                  </div>
                  <div className="text-gray-600 font-medium mt-1">{txt.hero.stats.students}</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">
                    500+
                  </div>
                  <div className="text-gray-600 font-medium mt-1">{txt.hero.stats.lessons}</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
                    50+
                  </div>
                  <div className="text-gray-600 font-medium mt-1">{txt.hero.stats.teachers}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 bg-gradient-to-b from-white to-gray-50 relative">
          {/* Decorative elements */}
          <div className="absolute top-10 right-10 w-16 h-16 opacity-20">
            <LightningIcon className="w-full h-full text-amber-500" />
          </div>
          <div className="absolute bottom-20 left-10 w-14 h-14 opacity-20">
            <LightbulbIcon className="w-full h-full text-yellow-500" />
          </div>

          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-2 bg-violet-100 text-violet-700 rounded-full text-sm font-bold mb-4">
                {txt.features.label}
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900">
                {txt.features.title}{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600">
                  {txt.features.titleHighlight}
                </span>
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {txt.features.items.map((feature, i) => (
                <div
                  key={i}
                  className="group relative bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-2 border border-gray-100 overflow-hidden"
                >
                  {/* Gradient background on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                  <div className="relative z-10">
                    <div className="w-14 h-14 mb-4 text-violet-600 group-hover:text-white transition-colors">
                      <FeatureIcon type={feature.iconType} className="w-full h-full" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-white mb-3 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 group-hover:text-white/90 transition-colors">
                      {feature.desc}
                    </p>
                  </div>

                  {/* Decorative shape */}
                  <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-gray-100 group-hover:bg-white/20 rounded-full transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Subjects Section */}
        <section className="py-16 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-32 bg-gray-50" />
          <div className="absolute inset-0">
            <div className="absolute top-40 left-20 w-64 h-64 bg-cyan-100/30 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-20 w-80 h-80 bg-violet-100/30 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-6">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-bold mb-4">
                {txt.subjects.label}
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900">
                {txt.subjects.title}
              </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {txt.subjects.items.map((subject, i) => (
                <Link
                  key={i}
                  href="/auth/signup"
                  className="group relative overflow-hidden rounded-2xl p-6 text-center transition-all hover:-translate-y-2 hover:shadow-xl"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${subject.color}`} />
                  <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />

                  <div className="relative z-10">
                    <div className="w-14 h-14 mx-auto mb-3 text-white drop-shadow-lg">
                      <SubjectIcon type={subject.iconType} className="w-full h-full" />
                    </div>
                    <span className="font-bold text-white text-sm">{subject.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute inset-0">
            <div className="absolute top-10 left-10 w-32 h-32 border-4 border-white/10 rounded-full" />
            <div className="absolute bottom-10 right-10 w-48 h-48 border-4 border-white/10 rounded-full" />
            <div className="absolute top-1/2 left-1/4 w-20 h-20 bg-white/5 rounded-xl rotate-45" />
            <div className="absolute bottom-1/3 right-1/3 w-16 h-16 bg-white/5 rounded-full" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-6">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-2 bg-white/20 text-white rounded-full text-sm font-bold mb-4">
                {txt.howItWorks.label}
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-white">
                {txt.howItWorks.title}
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {txt.howItWorks.steps.map((step, i) => (
                <div key={i} className="relative">
                  {/* Connector line */}
                  {i < 2 && (
                    <div className={`hidden md:block absolute top-16 ${isRtl ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"} w-full h-1 border-t-4 border-dashed border-white/30`} />
                  )}

                  <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 text-center border border-white/20 hover:bg-white/20 transition-all">
                    <div className="w-14 h-14 mx-auto mb-4 text-white">
                      <StepIcon type={step.iconType} className="w-full h-full" />
                    </div>
                    <div className="w-12 h-12 rounded-full bg-white text-violet-600 font-extrabold text-xl flex items-center justify-center mx-auto mb-4">
                      {step.num}
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                    <p className="text-white/80">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For Teachers */}
        <section id="teachers" className="py-16 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 rounded-3xl p-8 md:p-16 relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
              <div className="absolute top-10 left-10 w-16 h-16 opacity-30">
                <GraduationCapIcon className="w-full h-full text-white" />
              </div>
              <div className="absolute bottom-10 right-10 w-16 h-16 opacity-30">
                <SparkleIcon className="w-full h-full text-white" />
              </div>

              <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                <div className="text-white">
                  <span className="inline-block px-4 py-2 bg-white/20 rounded-full text-sm font-bold mb-4">
                    {txt.teachers.label}
                  </span>
                  <h2 className="text-3xl md:text-4xl font-extrabold mb-4">{txt.teachers.title}</h2>
                  <p className="text-white/90 text-lg mb-8">{txt.teachers.subtitle}</p>

                  <ul className="space-y-4 mb-8">
                    {txt.teachers.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                          <span className="text-amber-500">✓</span>
                        </div>
                        <span className="font-medium">{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/auth/signup?role=teacher"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-white text-amber-600 rounded-full font-bold hover:bg-gray-100 transition-all shadow-xl"
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
        <section id="faq" className="py-16 bg-gray-50">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-3">
                <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
                  {txt.faq.title}
                </h2>
                <QuestionIcon className="w-10 h-10 text-violet-500" />
              </div>
            </div>

            <div className="space-y-4">
              {txt.faq.items.map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between"
                  >
                    <span className="font-bold text-gray-900 text-left">{item.q}</span>
                    <span className={`text-2xl transition-transform ${openFaq === i ? "rotate-45" : ""}`}>
                      +
                    </span>
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-5 text-gray-600">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-100/50 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-100/50 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
            <div className="w-20 h-20 mx-auto mb-6">
              <BackpackIcon className="w-full h-full text-emerald-600" />
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 mb-4">
              {txt.finalCta.title}
            </h2>
            <p className="text-xl text-gray-600 mb-10">{txt.finalCta.subtitle}</p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-3 px-10 py-5 text-xl font-bold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full hover:from-emerald-600 hover:to-cyan-600 transition-all shadow-xl shadow-emerald-500/30 hover:shadow-2xl hover:-translate-y-1"
            >
              {txt.finalCta.cta}
              <FloatingRocket className="w-8 h-8" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold shadow-md">
                م
              </div>
              <div>
                <span className="font-bold text-gray-900">Madrassa Sudan</span>
                <p className="text-sm text-gray-500">{txt.footer.tagline}</p>
              </div>
            </div>

            <div className="flex items-center gap-8 text-sm text-gray-600">
              <a href="#" className="hover:text-emerald-600 transition-colors">{txt.footer.links.privacy}</a>
              <a href="#" className="hover:text-emerald-600 transition-colors">{txt.footer.links.contact}</a>
              <a href="#" className="hover:text-emerald-600 transition-colors">{txt.footer.links.donate}</a>
            </div>

            <p className="text-sm text-gray-500">{txt.footer.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
