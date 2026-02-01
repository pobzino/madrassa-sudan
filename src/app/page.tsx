"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

// Simple Icon component
const Icon = ({ d, className = "w-6 h-6" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// Icon paths
const icons = {
  play: "M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  sparkles: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z",
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  check: "M4.5 12.75l6 6 9-13.5",
  arrowRight: "M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3",
  chevronDown: "m19.5 8.25-7.5 7.5-7.5-7.5",
  academic: "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5",
  globe: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
};

export default function Home() {
  const { language, setLanguage, isRtl } = useLanguage();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const t = {
    ar: {
      nav: { features: "المميزات", howItWorks: "كيف يعمل", teachers: "للمعلمين", faq: "الأسئلة" },
      login: "تسجيل الدخول",
      getStarted: "انضم الآن",
      hero: {
        badge: "نُعيد الأمل من خلال التعليم",
        title1: "تعليم بلا حدود.",
        title2: "لكل طفل سوداني.",
        subtitle: "المدرسة الرقمية المجانية لأطفال السودان. دروس مسجلة، معلم ذكي يعمل بالذكاء الاصطناعي، ومنهج سوداني معتمد.",
        cta1: "انضم مجاناً",
        cta2: "شاهد كيف يعمل",
      },
      howItWorks: {
        label: "كيف يعمل",
        title: "تعلّم بثلاث خطوات بسيطة",
        steps: [
          { num: "01", title: "سجّل حسابك", desc: "أنشئ حساباً مجانياً في دقيقة واحدة" },
          { num: "02", title: "اختر موادك", desc: "اختر المواد والمستوى الدراسي المناسب" },
          { num: "03", title: "ابدأ التعلم", desc: "شاهد الدروس وتفاعل مع المعلم الذكي" },
        ],
      },
      features: {
        label: "المميزات",
        title: "كل ما يحتاجه طفلك للتعلم",
        items: [
          { icon: "sparkles", title: "معلم ذكي", desc: "مساعد يعمل بالذكاء الاصطناعي يشرح ويجيب على أسئلتك بالعربية. لا يعطيك الإجابة مباشرة، بل يساعدك على الفهم." },
          { icon: "play", title: "دروس مسجلة", desc: "فيديوهات تعليمية عالية الجودة من معلمين سودانيين مؤهلين" },
          { icon: "book", title: "المنهج السوداني", desc: "محتوى متوافق مع المنهج الوطني السوداني المعتمد" },
          { icon: "users", title: "فصول تفاعلية", desc: "انضم لمجموعات دراسية مع طلاب من نفس المستوى" },
          { icon: "academic", title: "واجبات وتقييم", desc: "اختبارات قصيرة وواجبات يصححها المعلمون" },
          { icon: "globe", title: "متاح للجميع", desc: "يعمل على أي جهاز - هاتف، تابلت، أو كمبيوتر" },
        ],
      },
      teachers: {
        label: "للمعلمين",
        title: "علّم من أي مكان في العالم",
        subtitle: "انضم لشبكة المعلمين السودانيين المتطوعين واصنع فرقاً حقيقياً في حياة الأطفال",
        benefits: ["إدارة فصول متعددة بسهولة", "أدوات تصحيح ومتابعة متقدمة", "تواصل مع طلاب يحتاجونك"],
        cta: "قدّم طلب للتدريس",
      },
      faq: {
        title: "الأسئلة الشائعة",
        items: [
          { q: "هل المنصة مجانية حقاً؟", a: "نعم، مجانية ١٠٠٪ لجميع الطلاب والأسر. نحن مبادرة غير ربحية مدعومة من متبرعين." },
          { q: "ما هي المراحل الدراسية المتوفرة؟", a: "حالياً نغطي المرحلة الابتدائية (الصفوف ١-٨)، والمرحلة الثانوية قريباً." },
          { q: "كيف يعمل المعلم الذكي؟", a: "المعلم الذكي يستخدم الذكاء الاصطناعي لشرح المفاهيم والإجابة على أسئلتك بالعربية. لا يعطيك الإجابة مباشرة، بل يساعدك على الفهم." },
          { q: "هل أحتاج إنترنت دائم؟", a: "تحتاج إنترنت لمشاهدة الدروس. نعمل على إضافة ميزة التحميل للمشاهدة بدون إنترنت قريباً." },
        ],
      },
      finalCta: {
        title: "مستعد لبدء رحلة التعلم؟",
        subtitle: "انضم لآلاف الطلاب السودانيين الذين يتعلمون معنا. مجاناً للأبد.",
        cta: "سجّل الآن مجاناً",
      },
      footer: {
        tagline: "نُعيد بناء مستقبل السودان، طفل بطفل.",
        links: { privacy: "الخصوصية", contact: "تواصل معنا", donate: "تبرّع" },
        copyright: "© ٢٠٢٦ مدرسة السودان. مبادرة غير ربحية.",
      },
    },
    en: {
      nav: { features: "Features", howItWorks: "How it works", teachers: "For Teachers", faq: "FAQ" },
      login: "Log in",
      getStarted: "Join Now",
      hero: {
        badge: "Restoring hope through education",
        title1: "Learning Without Borders.",
        title2: "For Every Sudanese Child.",
        subtitle: "The free digital school for Sudan's children. Recorded lessons, AI-powered tutor, and certified Sudanese curriculum.",
        cta1: "Join for Free",
        cta2: "See How It Works",
      },
      howItWorks: {
        label: "HOW IT WORKS",
        title: "Learn in three simple steps",
        steps: [
          { num: "01", title: "Create Account", desc: "Sign up for free in one minute" },
          { num: "02", title: "Choose Subjects", desc: "Select your grade level and subjects" },
          { num: "03", title: "Start Learning", desc: "Watch lessons and interact with AI tutor" },
        ],
      },
      features: {
        label: "FEATURES",
        title: "Everything your child needs to learn",
        items: [
          { icon: "sparkles", title: "AI Tutor", desc: "AI-powered assistant that explains and answers questions in Arabic. It doesn't give you answers directly - it helps you understand." },
          { icon: "play", title: "Recorded Lessons", desc: "High-quality video lessons from qualified Sudanese teachers" },
          { icon: "book", title: "Sudanese Curriculum", desc: "Content aligned with the official Sudanese national curriculum" },
          { icon: "users", title: "Interactive Cohorts", desc: "Join study groups with students at your level" },
          { icon: "academic", title: "Homework & Assessment", desc: "Quizzes and assignments graded by teachers" },
          { icon: "globe", title: "Available Everywhere", desc: "Works on any device - phone, tablet, or computer" },
        ],
      },
      teachers: {
        label: "FOR TEACHERS",
        title: "Teach from anywhere in the world",
        subtitle: "Join our network of volunteer Sudanese teachers and make a real difference in children's lives",
        benefits: ["Manage multiple classes easily", "Advanced grading and tracking tools", "Connect with students who need you"],
        cta: "Apply to Teach",
      },
      faq: {
        title: "Frequently Asked Questions",
        items: [
          { q: "Is the platform really free?", a: "Yes, 100% free for all students and families. We're a non-profit initiative supported by donors." },
          { q: "What grade levels are available?", a: "Currently we cover primary school (grades 1-8), with secondary school coming soon." },
          { q: "How does the AI tutor work?", a: "The AI tutor uses artificial intelligence to explain concepts and answer your questions in Arabic. It doesn't give you answers directly - it helps you understand." },
          { q: "Do I need constant internet?", a: "You need internet to watch lessons. We're working on adding download feature for offline viewing soon." },
        ],
      },
      finalCta: {
        title: "Ready to start learning?",
        subtitle: "Join thousands of Sudanese students learning with us. Free forever.",
        cta: "Sign Up Free",
      },
      footer: {
        tagline: "Rebuilding Sudan's future, one child at a time.",
        links: { privacy: "Privacy", contact: "Contact", donate: "Donate" },
        copyright: "© 2026 Madrassa Sudan. A non-profit initiative.",
      },
    },
  };

  const txt = t[language];

  const getIcon = (name: string) => {
    const iconMap: Record<string, string> = {
      play: icons.play,
      sparkles: icons.sparkles,
      book: icons.book,
      users: icons.users,
      academic: icons.academic,
      globe: icons.globe,
    };
    return iconMap[name] || icons.book;
  };

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className={`min-h-screen bg-white ${isRtl ? "font-cairo" : "font-sans"}`}>
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-600/20">
              م
            </div>
            <span className="text-lg font-bold text-gray-900 hidden sm:block">
              {isRtl ? "مدرسة السودان" : "Madrassa Sudan"}
            </span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-emerald-600 transition-colors">{txt.nav.features}</a>
            <a href="#how-it-works" className="hover:text-emerald-600 transition-colors">{txt.nav.howItWorks}</a>
            <a href="#teachers" className="hover:text-emerald-600 transition-colors">{txt.nav.teachers}</a>
            <a href="#faq" className="hover:text-emerald-600 transition-colors">{txt.nav.faq}</a>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {language === "ar" ? "English" : "العربية"}
            </button>
            <Link href="/auth/login" className="hidden sm:block text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {txt.login}
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10"
            >
              {txt.getStarted}
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
          {/* Grid Background */}
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(16, 185, 129, 0.1) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: "60px 60px",
            }}
          />

          {/* Gradient Orbs */}
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-emerald-200/30 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center py-20">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-800">{txt.hero.badge}</span>
              </div>
            </div>

            {/* Headlines */}
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.1] mb-6">
              {txt.hero.title1}
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                {txt.hero.title2}
              </span>
            </h1>

            <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              {txt.hero.subtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link
                href="/auth/signup"
                className="w-full sm:w-auto px-8 py-4 text-lg font-semibold text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-all shadow-xl shadow-gray-900/20 flex items-center justify-center gap-2 group"
              >
                {txt.hero.cta1}
                <Icon d={icons.arrowRight} className={`w-5 h-5 transition-transform ${isRtl ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1"}`} />
              </Link>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto px-8 py-4 text-lg font-semibold text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                {txt.hero.cta2}
              </a>
            </div>

            {/* Video Placeholder */}
            <div className="relative max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-200 overflow-hidden">
                {/* Browser Header */}
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-white rounded-lg px-4 py-1.5 text-sm text-gray-400 text-center border border-gray-200">
                      madrassa-sudan.com/lessons
                    </div>
                  </div>
                </div>

                {/* Video Content Area */}
                <div className="relative aspect-video bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center group cursor-pointer">
                  {/* Play Button */}
                  <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <div className={`w-0 h-0 border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent ${isRtl ? "border-r-[20px] border-r-emerald-600" : "border-l-[20px] border-l-emerald-600 ml-1"}`} />
                  </div>

                  {/* Overlay Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center justify-between text-white">
                      <div>
                        <p className="text-sm text-gray-300">{isRtl ? "الرياضيات - الصف الرابع" : "Mathematics - Grade 4"}</p>
                        <h4 className="font-bold text-lg">{isRtl ? "الكسور والأعداد العشرية" : "Fractions and Decimals"}</h4>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-300">{isRtl ? "المدة" : "Duration"}</p>
                        <p className="font-semibold">12:45</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 h-1 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-emerald-500 rounded-full" />
                    </div>
                  </div>

                  {/* Decorative Elements */}
                  <div className="absolute top-4 right-4 px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                    {isRtl ? "مباشر" : "LIVE"}
                  </div>
                </div>
              </div>

              {/* Floating Cards */}
              <div className={`absolute -bottom-6 ${isRtl ? "-left-6" : "-right-6"} bg-white rounded-xl p-4 shadow-xl border border-gray-100 hidden md:block`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Icon d={icons.sparkles} className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{isRtl ? "المعلم الذكي" : "AI Tutor"}</p>
                    <p className="font-semibold text-gray-900 text-sm">{isRtl ? "جاهز للمساعدة" : "Ready to help"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-gray-50/50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <span className="text-sm font-semibold text-emerald-600 tracking-wide uppercase">{txt.howItWorks.label}</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">{txt.howItWorks.title}</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {txt.howItWorks.steps.map((step, i) => (
                <div key={i} className="relative bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                  <span className="text-5xl font-bold text-emerald-100">{step.num}</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-4 mb-2">{step.title}</h3>
                  <p className="text-gray-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <span className="text-sm font-semibold text-emerald-600 tracking-wide uppercase">{txt.features.label}</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">{txt.features.title}</h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {txt.features.items.map((feature, i) => (
                <div
                  key={i}
                  className={`rounded-2xl p-8 border transition-all hover:shadow-lg ${
                    i === 0
                      ? "md:col-span-2 lg:col-span-2 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-transparent"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${
                    i === 0 ? "bg-white/20" : "bg-emerald-50"
                  }`}>
                    <Icon d={getIcon(feature.icon)} className={`w-6 h-6 ${i === 0 ? "text-white" : "text-emerald-600"}`} />
                  </div>
                  <h3 className={`text-xl font-bold mb-3 ${i === 0 ? "text-white" : "text-gray-900"}`}>{feature.title}</h3>
                  <p className={i === 0 ? "text-emerald-50" : "text-gray-600"}>{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* For Teachers */}
        <section id="teachers" className="py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 md:p-16 text-white relative overflow-hidden">
              {/* Decorative Elements */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

              <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <span className="text-sm font-semibold text-emerald-400 tracking-wide uppercase">{txt.teachers.label}</span>
                  <h2 className="text-3xl md:text-4xl font-bold mt-3 mb-4">{txt.teachers.title}</h2>
                  <p className="text-gray-300 text-lg mb-8">{txt.teachers.subtitle}</p>

                  <ul className="space-y-4 mb-8">
                    {txt.teachers.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                          <Icon d={icons.check} className="w-4 h-4 text-white" />
                        </div>
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/auth/signup?role=teacher"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 rounded-full font-semibold hover:bg-gray-100 transition-colors"
                  >
                    {txt.teachers.cta}
                    <Icon d={icons.arrowRight} className={`w-4 h-4 ${isRtl ? "rotate-180" : ""}`} />
                  </Link>
                </div>

                <div className="hidden md:flex items-center justify-center">
                  <div className="w-64 h-64 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 flex items-center justify-center">
                    <Icon d={icons.academic} className="w-32 h-32 text-emerald-400/50" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-24 bg-gray-50/50">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">{txt.faq.title}</h2>

            <div className="space-y-4">
              {txt.faq.items.map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-100 overflow-hidden transition-shadow hover:shadow-md"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between text-right"
                  >
                    <span className="font-semibold text-gray-900">{item.q}</span>
                    <Icon
                      d={icons.chevronDown}
                      className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isRtl ? "mr-4" : "ml-4"} ${openFaq === i ? "rotate-180" : ""}`}
                    />
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
        <section className="py-24">
          <div className="max-w-5xl mx-auto px-6">
            <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-12 md:p-16 text-center relative overflow-hidden">
              {/* Decorative */}
              <div className="absolute top-4 left-8">
                <Icon d={icons.sparkles} className="w-8 h-8 text-emerald-500/30" />
              </div>
              <div className="absolute bottom-8 right-12 w-24 h-24 border border-white/10 rounded-full" />

              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {txt.finalCta.title.replace("؟", "").replace("?", "")}
                <span className="text-emerald-400">{language === "ar" ? "؟" : "?"}</span>
              </h2>
              <p className="text-gray-300 text-lg mb-8 max-w-xl mx-auto">{txt.finalCta.subtitle}</p>
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 rounded-full text-lg font-semibold hover:bg-gray-100 transition-colors shadow-xl"
              >
                {txt.finalCta.cta}
                <Icon d={icons.arrowRight} className={`w-5 h-5 ${isRtl ? "rotate-180" : ""}`} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white font-bold text-sm">
                م
              </div>
              <div>
                <span className="font-bold text-gray-900">Madrassa Sudan</span>
                <p className="text-sm text-gray-500">{txt.footer.tagline}</p>
              </div>
            </div>

            <div className="flex items-center gap-8 text-sm text-gray-600">
              <a href="#" className="hover:text-gray-900 transition-colors">{txt.footer.links.privacy}</a>
              <a href="#" className="hover:text-gray-900 transition-colors">{txt.footer.links.contact}</a>
              <a href="#" className="hover:text-gray-900 transition-colors">{txt.footer.links.donate}</a>
            </div>

            <p className="text-sm text-gray-500">{txt.footer.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
