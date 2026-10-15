"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import {
  FloatingRocket,
  MadrassaLogo,
  SparkleIcon,
  GraduationCapIcon,
  BackpackIcon,
  QuestionIcon,
  PlayIcon,
  CelebrationIcon,
} from "@/components/illustrations";
import { LandingHeroScene, SectionScene, TeacherScene } from "@/components/dashboard/DashboardScenes";
import HomepageSamplePreview from "@/components/sample/HomepageSamplePreview";
import { SudanFlagToAmalOwl } from "@/components/brand/SudanFlagToAmalOwl";
import { OwlLessonPortal } from "@/components/brand/OwlLessonPortal";
import { LEGAL_ENTITY } from "@/lib/legal-entity";
import { roundDownStat, statNumberFormat, type HomeStats } from "@/lib/home-stats";
import { PARTNERS } from "@/lib/partners";
import { FeaturesSection } from "./FeaturesSection";
import { HeroOwls } from "./HeroOwls";
import { HowItWorks } from "./HowItWorks";
import { SocialProof } from "./SocialProof";
import { SubjectsSection } from "./SubjectsSection";

export default function HomePage({ stats }: { stats: HomeStats }) {
  const { language, setLanguage, isRtl } = useLanguage();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [heroCtaActive, setHeroCtaActive] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const user = await getCachedUser(supabase);
      setIsAuthenticated(!!user);
    }
    checkAuth();
  }, [supabase]);

  const signupsLabel = statNumberFormat(language).format(roundDownStat(stats.signups));

  const t = {
    ar: {
      nav: { features: "المميزات", howItWorks: "كيف يعمل", sample: "درس نموذجي", parents: "للأهل", teachers: "للمعلمين", faq: "الأسئلة" },
      login: "تسجيل الدخول",
      getStarted: "ابدأ الآن",
      goToDashboard: "لوحة التحكم",
      hero: {
        title1: "أفضل مكان",
        titleHighlight1: "للتعلم",
        titleAnd: "و",
        titleHighlight2: "اللعب",
        title2: "لأطفال السودان",
        subtitle: "منصة تعليمية مجانية مع دروس تفاعلية وتدريب متوافق مع المنهج السوداني",
        cta1: "ابدأ مجاناً",
        cta2: "جرّب درساً نموذجياً",
      },
      features: {
        title: "تعلم بطريقة",
        titleHighlight: "ممتعة",
        items: [
          { title: "دروس ممتعة", desc: "فيديوهات تفاعلية مع رسوم متحركة تجعل التعلم مغامرة", color: "from-[#007229] to-[#00913D]", iconType: "video" },
          { title: "تدريب وتقييم", desc: "تدريب ممتع مع تقييم فوري يساعدك تعرف مستواك وتتحسّن", color: "from-[#D21034] to-[#E8334F]", iconType: "trophy" },
          { title: "الألعاب التعليمية", desc: "اختبارات وتحديات ممتعة تجعلك تتعلم وأنت تلعب", color: "from-[#005C22] to-[#007229]", iconType: "gamepad" },
          { title: "متابعة التقدم", desc: "تابع الدروس والتدريبات التي أكملتها وواصل من مكانك", color: "from-amber-500 to-orange-600", iconType: "trophy" },
        ],
      },
      sims: {
        title: "كيف تعمل الحصص؟",
        subtitle: "حصص مسجلة بصوت المعلم مع أنشطة تفاعلية — كأنك في الفصل لكن بتتعلم بسرعتك",
        steps: [
          { num: "1", title: "المعلم يشرح", desc: "تسمع صوت المعلم وتشوف الشرائح تتحرك قدامك — زي ما بشرح في الفصل بالظبط" },
          { num: "2", title: "وقفة للنشاط", desc: "الدرس بيوقف تلقائياً عشان تحل سؤال أو نشاط قبل ما تكمّل — اختبار، سحب وإفلات، أو توصيل" },
          { num: "3", title: "نتيجة فورية", desc: "تعرف إجابتك صح أو غلط فوراً، وتقدّمك يُحفظ لتكمل من حيث توقفت" },
        ],
        cta: "افتح الدرس النموذجي",
        noSignup: "بدون تسجيل حساب",
      },
      teachers: {
        title: "سجّل دروساً لأطفال السودان",
        subtitle: "المعلمون المتطوعون يسجّلون الدروس بأصواتهم، والأطفال يتعلمون منها ويتدرّبون بالسرعة التي تناسبهم.",
        benefits: ["سجّل الدروس بصوتك، من أي مكان", "لا فصول تديرها ولا واجبات تصحّحها", "صوتك يصل إلى أطفال السودان أينما كانوا"],
        cta: "قدّم طلب للتدريس",
      },
      faq: {
        title: "أسئلة شائعة",
        items: [
          { q: "هل المنصة مجانية حقاً؟", a: "نعم، مجانية ١٠٠٪ لجميع الطلاب. تديرها شركة آمال سكول للمصلحة المجتمعية، وهي شركة مسجلة في إنجلترا وويلز." },
          { q: "ما هي المواد المتوفرة؟", a: "تتوفر حالياً دروس الرياضيات واللغة الإنجليزية، ونضيف محتوى جديداً باستمرار." },
          { q: "هل أحتاج إنترنت دائم؟", a: "نعم، تحتاج اتصال بالإنترنت لمشاهدة الدروس." },
        ],
      },
      finalCta: {
        title: "مستعد للمغامرة؟",
        subtitle: `انضم إلى أكثر من ${signupsLabel} طالباً وولي أمر ومعلماً على آمال. مجاناً للأبد!`,
        cta: "ابدأ الآن مجاناً",
      },
      footer: {
        tagline: "نبني مستقبل السودان، طفل بطفل",
        links: { parents: "للأهل", privacy: "الخصوصية", terms: "الشروط", contact: "تواصل معنا", donate: "ادعم آمال" },
        partners: "بالشراكة مع",
        copyright: "© ٢٠٢٦ مدرسة آمال",
      },
    },
    en: {
      nav: { features: "Features", howItWorks: "How it works", sample: "Sample lesson", parents: "For Parents", teachers: "For Teachers", faq: "FAQ" },
      login: "Log in",
      getStarted: "Start Now",
      goToDashboard: "Dashboard",
      hero: {
        title1: "The best place to",
        titleHighlight1: "learn",
        titleAnd: "and",
        titleHighlight2: "play",
        title2: "for Sudanese kids",
        subtitle: "A free learning platform with interactive lessons and curriculum-aligned Practice for Sudanese children",
        cta1: "Start Now",
        cta2: "Try a sample lesson",
      },
      features: {
        title: "Learn in a",
        titleHighlight: "fun way",
        items: [
          { title: "Fun Lessons", desc: "Interactive videos with animations that make learning an adventure", color: "from-[#007229] to-[#00913D]", iconType: "video" },
          { title: "Practice & Feedback", desc: "Fun practice with instant feedback so you know your level and improve", color: "from-[#D21034] to-[#E8334F]", iconType: "trophy" },
          { title: "Learning Games", desc: "Fun quizzes and challenges that let you learn while playing", color: "from-[#005C22] to-[#007229]", iconType: "gamepad" },
          { title: "Progress Tracking", desc: "See completed lessons and Practice, then continue where you left off", color: "from-amber-500 to-orange-600", iconType: "trophy" },
        ],
      },
      sims: {
        title: "How do lessons work?",
        subtitle: "Recorded lessons with your teacher's voice and interactive activities — like being in class, but you learn at your own pace",
        steps: [
          { num: "1", title: "Teacher explains", desc: "Hear your teacher's voice while slides move in sync — just like a real classroom lesson" },
          { num: "2", title: "Pause for activity", desc: "The lesson pauses automatically so you can solve a quiz, drag-and-drop, or matching activity before continuing" },
          { num: "3", title: "Instant feedback", desc: "Know right away if your answer is correct, and your progress is saved so you can pick up where you left off" },
        ],
        cta: "Open the sample lesson",
        noSignup: "No signup required",
      },
      teachers: {
        title: "Record lessons for Sudan's children",
        subtitle: "Volunteer teachers record lessons in their own voice. Children learn from them and practise at their own pace.",
        benefits: ["Record lessons in your own voice, from anywhere", "No classes to run and no marking to do", "Your voice reaches Sudanese children wherever they are"],
        cta: "Apply to Teach",
      },
      faq: {
        title: "Common Questions",
        items: [
          { q: "Is the platform really free?", a: "Yes, 100% free for all students. Amal School is operated by a registered community interest company." },
          { q: "Which subjects are available?", a: "Maths and English lessons are available now, with new content added regularly." },
          { q: "Do I need constant internet?", a: "Yes, you need an internet connection to watch lessons." },
        ],
      },
      finalCta: {
        title: "Ready for the adventure?",
        subtitle: `Join ${signupsLabel}+ learners, parents and teachers already on Amal. Free forever!`,
        cta: "Start Free Now",
      },
      footer: {
        tagline: "Building Sudan's future, one child at a time",
        links: { parents: "For Parents", privacy: "Privacy", terms: "Terms", contact: "Contact", donate: "Support Amal" },
        partners: "In partnership with",
        copyright: "© 2026 Amal School",
      },
    },
  };

  const txt = t[language];

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-white overflow-x-clip">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2">
            <span className="block h-8 w-8 shrink-0 sm:h-10 sm:w-10">
              <SudanFlagToAmalOwl
                markOnly
                showReplay={false}
                className="h-full w-full"
              />
            </span>
            <span className="font-fredoka text-xl font-semibold tracking-tight text-[#007229] sm:text-2xl">
              amal school
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-[#007229] transition-colors">{txt.nav.features}</a>
            <a href="#how-it-works" className="hover:text-[#007229] transition-colors">{txt.nav.howItWorks}</a>
            <Link href="/sample-lesson" className="hover:text-[#007229] transition-colors">{txt.nav.sample}</Link>
            <Link href="/parents" className="hover:text-[#007229] transition-colors">{txt.nav.parents}</Link>
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
                  data-analytics="signup_click"
                  data-analytics-source="navbar"
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
        <section
          data-amal-home-hero
          className="relative min-h-[calc(100svh-3.5rem)] overflow-hidden pt-6 sm:min-h-[calc(100svh-4rem)] sm:pt-8"
        >
          {/* Illustrated "learning world" backdrop with the owl trio on the hills */}
          <LandingHeroScene owls={false} />
          <HeroOwls language={language} excited={heroCtaActive} />

          {/* Only the content itself takes clicks, so the owl below stays tappable. */}
          <div className="pointer-events-none relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-8 pb-[230px] sm:pb-[300px]">
            <div
              data-amal-hero-content
              className="pointer-events-auto text-center"
              onMouseOver={(event) => setHeroCtaActive(!!(event.target as HTMLElement).closest("a"))}
              onMouseLeave={() => setHeroCtaActive(false)}
              onFocus={(event) => setHeroCtaActive(!!(event.target as HTMLElement).closest("a"))}
              onBlur={() => setHeroCtaActive(false)}
            >
              {/* Main headline with colorful highlights */}
              <h1 className="font-fredoka text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-medium text-gray-900 leading-[1.15] sm:leading-[1.1] mb-4 sm:mb-6">
                {txt.hero.title1}
                <br />
                <span className="relative inline-block text-amber-500">
                  {txt.hero.titleHighlight1}
                  <svg className="absolute -bottom-1 sm:-bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                    <path d="M2 8 Q 50 2 100 8 T 198 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-amber-400" />
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
                    data-analytics="signup_click"
                    data-analytics-source="hero"
                    className="group w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1 flex items-center justify-center gap-2"
                  >
                    {txt.hero.cta1}
                    <CelebrationIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Link>
                )}
                <Link
                  href="/sample-lesson"
                  className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold text-gray-700 bg-white border-2 border-gray-200 rounded-full hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#007229]" />
                  {txt.hero.cta2}
                </Link>
              </div>

            </div>
          </div>
        </section>

        <SocialProof stats={stats} language={language} />

        <FeaturesSection
          title={txt.features.title}
          highlight={txt.features.titleHighlight}
          items={txt.features.items}
          isRtl={isRtl}
        />

        <SubjectsSection language={language} isRtl={isRtl} />

        <HowItWorks language={language} isRtl={isRtl} isAuthenticated={isAuthenticated} />

        <OwlLessonPortal
          isRtl={isRtl}
          title={txt.sims.title}
          subtitle={txt.sims.subtitle}
          steps={txt.sims.steps}
        />

        {/* How Sims Work */}
        <section aria-label={txt.sims.title} className="py-10 sm:py-16 bg-white relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-20 right-20 w-72 h-72 bg-emerald-100/30 rounded-full blur-3xl hidden sm:block" />
            <div className="absolute bottom-20 left-10 w-64 h-64 bg-amber-100/30 rounded-full blur-3xl hidden sm:block" />
          </div>
          <SectionScene sky="linear-gradient(180deg,#ecfbf4 0%,#eef5ff 100%)" hills={false} />

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
            {/* Real lesson + one live Practice question */}
            <HomepageSamplePreview language={language} isRtl={isRtl} />

            {/* Try a sample lesson CTA */}
            <div className="text-center">
              <Link
                href="/sample-lesson"
                className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1"
              >
                <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                {txt.sims.cta}
              </Link>
              <p className="mt-2 text-xs font-semibold text-gray-500">{txt.sims.noSignup}</p>
            </div>
          </div>
        </section>

        {/* For Teachers */}
        <section id="teachers" className="py-10 sm:py-16 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="bg-gradient-to-br from-[#f9b13f] to-[#ef7e2c] rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-16 relative overflow-hidden">
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
                    data-analytics="signup_click"
                    data-analytics-source="teacher_section"
                    data-analytics-role="teacher"
                    className="inline-flex items-center gap-2 px-5 sm:px-8 py-3 sm:py-4 bg-white text-amber-600 rounded-full font-bold hover:bg-gray-100 transition-all shadow-xl text-sm sm:text-base"
                  >
                    {txt.teachers.cta}
                    <span>→</span>
                  </Link>
                </div>

                <div className="hidden md:flex items-center justify-center">
                  <TeacherScene className="w-full max-w-sm aspect-square" />
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
                <QuestionIcon className="w-7 h-7 sm:w-10 sm:h-10 text-[#007229]" />
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
        <section className="py-10 sm:py-16 pb-16 sm:pb-24 relative overflow-hidden">
          <SectionScene sky="linear-gradient(180deg,#e4efff 0%,#eef6ee 55%,#dcefdd 100%)" hill="#cfe6d3" hill2="#bfe0c6" clouds />

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <div className="w-14 h-14 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6">
              <BackpackIcon className="w-full h-full text-emerald-600" />
            </div>
            <h2 className="font-fredoka text-3xl sm:text-4xl md:text-5xl font-semibold text-gray-900 mb-3 sm:mb-4">
              {txt.finalCta.title}
            </h2>
            <p className="text-base sm:text-xl text-gray-600 mb-6 sm:mb-10 max-w-2xl mx-auto">{txt.finalCta.subtitle}</p>
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-10 py-3.5 sm:py-5 text-base sm:text-xl font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {txt.goToDashboard}
              </Link>
            ) : (
              <Link
                href="/auth/signup"
                data-analytics="signup_click"
                data-analytics-source="final_cta"
                className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-10 py-3.5 sm:py-5 text-base sm:text-xl font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-xl shadow-[#007229]/30 hover:shadow-2xl hover:shadow-[#007229]/40 hover:-translate-y-1"
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

            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-gray-600">
              <Link href="/parents" className="hover:text-[#007229] transition-colors">{txt.footer.links.parents}</Link>
              <a href="/privacy" className="hover:text-[#007229] transition-colors">{txt.footer.links.privacy}</a>
              <a href="/terms" className="hover:text-[#007229] transition-colors">{txt.footer.links.terms}</a>
              <a href="mailto:admin@amalschool.org" className="hover:text-[#007229] transition-colors">{txt.footer.links.contact}</a>
              <a href="mailto:admin@amalschool.org?subject=Support%20Amal%20School" className="hover:text-[#D21034] transition-colors">{txt.footer.links.donate}</a>
            </div>

            <p className="text-xs sm:text-sm text-gray-500">{txt.footer.copyright}</p>
          </div>

          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:text-sm text-gray-500">
            <span>{txt.footer.partners}</span>
            {PARTNERS.map((partner, i) => (
              <span key={partner.id} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-gray-300">·</span>}
                <a
                  href={partner.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={language === "ar" ? partner.nameAr : partner.name}
                  className="font-semibold text-gray-700 hover:text-[#007229] transition-colors"
                >
                  {partner.shortName}
                </a>
              </span>
            ))}
          </p>

          <p
            dir="ltr"
            className="mx-auto mt-6 max-w-4xl border-t border-gray-100 pt-5 text-center text-[11px] leading-relaxed text-gray-500 sm:text-xs"
          >
            {LEGAL_ENTITY.registeredName} is a community interest company
            limited by guarantee, registered in {LEGAL_ENTITY.registeredIn}.{" "}
            <a
              href={LEGAL_ENTITY.companiesHouseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-gray-300 underline-offset-2 hover:text-[#007229]"
            >
              Company number {LEGAL_ENTITY.companyNumber}
            </a>
            . Registered office: {LEGAL_ENTITY.registeredOffice}.
          </p>
        </div>
      </footer>
    </div>
  );
}
