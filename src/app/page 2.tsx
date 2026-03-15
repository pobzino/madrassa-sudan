"use client";

import { useState } from "react";

// Icons as inline SVGs for simplicity
const BookIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const VideoIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export default function Home() {
  const [isArabic, setIsArabic] = useState(false);

  const content = {
    en: {
      nav: {
        features: "Features",
        about: "About",
        teachers: "For Teachers",
        contact: "Contact",
        login: "Login",
        signup: "Start Learning",
      },
      hero: {
        badge: "🇸🇩 For Sudanese Children Everywhere",
        title: "Education Without Borders",
        subtitle: "Every child deserves to learn. Our AI-powered platform brings quality Sudanese education to displaced children—anywhere in the world, even with limited internet.",
        cta1: "Join as Student",
        cta2: "Join as Teacher",
        stats: [
          { number: "10M+", label: "Children Affected" },
          { number: "24/7", label: "AI Tutor Available" },
          { number: "Free", label: "Forever Free" },
        ],
      },
      features: {
        title: "Learning Made Accessible",
        subtitle: "Designed for children who've lost access to schools, with features that work even on slow internet.",
        items: [
          {
            icon: "video",
            title: "Video Lessons",
            description: "Watch lessons from qualified Sudanese teachers. Download for offline viewing when internet is unavailable.",
          },
          {
            icon: "ai",
            title: "AI Tutor (24/7)",
            description: "Get homework help anytime in Arabic or English. Our AI explains concepts without giving away answers.",
          },
          {
            icon: "homework",
            title: "Homework System",
            description: "Teachers assign, students complete, and receive personalized feedback. Track your progress over time.",
          },
          {
            icon: "cohort",
            title: "Class Cohorts",
            description: "Learn with classmates from around the world. Build community despite the distance.",
          },
        ],
      },
      howItWorks: {
        title: "Start Learning in 3 Steps",
        steps: [
          { step: "1", title: "Sign Up", description: "Create your free account with just an email or phone number." },
          { step: "2", title: "Join Your Class", description: "Enter the cohort code from your teacher to join your virtual classroom." },
          { step: "3", title: "Start Learning", description: "Watch lessons, complete homework, and ask the AI tutor for help anytime." },
        ],
      },
      subjects: {
        title: "Sudanese Curriculum",
        subtitle: "All subjects aligned with national standards",
        list: ["Arabic", "English", "Mathematics", "Science", "Islamic Studies", "Social Studies"],
      },
      testimonial: {
        quote: "After two years without school, I'm finally learning again. The AI tutor helps me catch up on everything I missed.",
        author: "Fatima, 14",
        location: "Cairo, Egypt",
      },
      cta: {
        title: "Every Child Deserves to Learn",
        subtitle: "Join thousands of Sudanese children continuing their education despite displacement.",
        button: "Get Started Free",
      },
      footer: {
        tagline: "Bringing hope through education",
        links: ["About Us", "Contact", "Privacy Policy", "Terms of Service"],
        copyright: "© 2026 Amal Madrassa. A non-profit initiative.",
      },
    },
    ar: {
      nav: {
        features: "المميزات",
        about: "عن المنصة",
        teachers: "للمعلمين",
        contact: "اتصل بنا",
        login: "تسجيل الدخول",
        signup: "ابدأ التعلم",
      },
      hero: {
        badge: "🇸🇩 لأطفال السودان في كل مكان",
        title: "التعليم بلا حدود",
        subtitle: "كل طفل يستحق أن يتعلم. منصتنا المدعومة بالذكاء الاصطناعي توفر تعليماً سودانياً عالي الجودة للأطفال النازحين—في أي مكان في العالم، حتى مع إنترنت محدود.",
        cta1: "انضم كطالب",
        cta2: "انضم كمعلم",
        stats: [
          { number: "+١٠ مليون", label: "طفل متأثر" },
          { number: "٢٤/٧", label: "معلم ذكي متاح" },
          { number: "مجاني", label: "للأبد" },
        ],
      },
      features: {
        title: "تعلم سهل ومتاح للجميع",
        subtitle: "مصمم للأطفال الذين فقدوا الوصول للمدارس، بميزات تعمل حتى مع إنترنت بطيء.",
        items: [
          {
            icon: "video",
            title: "دروس فيديو",
            description: "شاهد دروساً من معلمين سودانيين مؤهلين. حمّل للمشاهدة بدون إنترنت.",
          },
          {
            icon: "ai",
            title: "معلم ذكي (٢٤/٧)",
            description: "احصل على مساعدة في الواجبات في أي وقت بالعربية أو الإنجليزية.",
          },
          {
            icon: "homework",
            title: "نظام الواجبات",
            description: "المعلمون يعطون الواجبات، الطلاب يكملونها، ويتلقون تغذية راجعة شخصية.",
          },
          {
            icon: "cohort",
            title: "فصول دراسية",
            description: "تعلم مع زملاء من حول العالم. ابنِ مجتمعاً رغم المسافة.",
          },
        ],
      },
      howItWorks: {
        title: "ابدأ التعلم في ٣ خطوات",
        steps: [
          { step: "١", title: "سجّل", description: "أنشئ حسابك المجاني ببريد إلكتروني أو رقم هاتف." },
          { step: "٢", title: "انضم لفصلك", description: "أدخل رمز الفصل من معلمك للانضمام لفصلك الافتراضي." },
          { step: "٣", title: "ابدأ التعلم", description: "شاهد الدروس، أكمل الواجبات، واسأل المعلم الذكي للمساعدة." },
        ],
      },
      subjects: {
        title: "المنهج السوداني",
        subtitle: "جميع المواد متوافقة مع المعايير الوطنية",
        list: ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "التربية الإسلامية", "الدراسات الاجتماعية"],
      },
      testimonial: {
        quote: "بعد سنتين بدون مدرسة، أنا أخيراً أتعلم مجدداً. المعلم الذكي يساعدني ألحق كل ما فاتني.",
        author: "فاطمة، ١٤ سنة",
        location: "القاهرة، مصر",
      },
      cta: {
        title: "كل طفل يستحق أن يتعلم",
        subtitle: "انضم لآلاف الأطفال السودانيين الذين يواصلون تعليمهم رغم النزوح.",
        button: "ابدأ مجاناً",
      },
      footer: {
        tagline: "نزرع الأمل من خلال التعليم",
        links: ["عن المنصة", "اتصل بنا", "سياسة الخصوصية", "شروط الخدمة"],
        copyright: "© ٢٠٢٦ أمل مدرسة. مبادرة غير ربحية.",
      },
    },
  };

  const t = isArabic ? content.ar : content.en;

  const getFeatureIcon = (icon: string) => {
    switch (icon) {
      case "video": return <VideoIcon />;
      case "ai": return <AIIcon />;
      case "homework": return <BookIcon />;
      case "cohort": return <UsersIcon />;
      default: return <BookIcon />;
    }
  };

  return (
    <div className={`min-h-screen ${isArabic ? 'rtl' : 'ltr'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: 'var(--gradient-green)' }}>
                م
              </div>
              <span className="font-semibold text-lg" style={{ color: 'var(--primary)' }}>
                {isArabic ? 'أمل مدرسة' : 'Amal Madrassa'}
              </span>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">{t.nav.features}</a>
              <a href="#about" className="text-gray-600 hover:text-gray-900 transition-colors">{t.nav.about}</a>
              <a href="#teachers" className="text-gray-600 hover:text-gray-900 transition-colors">{t.nav.teachers}</a>
              <a href="#contact" className="text-gray-600 hover:text-gray-900 transition-colors">{t.nav.contact}</a>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Language Toggle */}
              <button
                onClick={() => setIsArabic(!isArabic)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-300 transition-colors text-sm"
              >
                <GlobeIcon />
                <span>{isArabic ? 'EN' : 'عربي'}</span>
              </button>

              <button className="hidden sm:block text-gray-600 hover:text-gray-900 transition-colors">
                {t.nav.login}
              </button>
              <button
                className="px-4 py-2 rounded-full text-white font-medium transition-all hover:scale-105 hover:shadow-lg"
                style={{ background: 'var(--gradient-green)' }}
              >
                {t.nav.signup}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden" style={{ background: 'var(--background)' }}>
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--secondary)' }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--primary-light)' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text Content */}
            <div className="space-y-8 animate-fade-up">
              <span
                className="inline-block px-4 py-2 rounded-full text-sm font-medium"
                style={{ background: 'var(--background-alt)', color: 'var(--primary)' }}
              >
                {t.hero.badge}
              </span>

              <h1
                className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight"
                style={{ fontFamily: isArabic ? 'Cairo, sans-serif' : 'Inter, sans-serif' }}
              >
                <span style={{ color: 'var(--primary)' }}>{t.hero.title.split(' ')[0]}</span>{' '}
                <span className="animate-gradient" style={{ background: 'var(--gradient-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  {t.hero.title.split(' ').slice(1).join(' ')}
                </span>
              </h1>

              <p className="text-xl leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t.hero.subtitle}
              </p>

              <div className="flex flex-wrap gap-4">
                <button
                  className="px-8 py-4 rounded-full text-white font-semibold text-lg transition-all hover:scale-105 hover:shadow-xl animate-pulse-glow"
                  style={{ background: 'var(--gradient-green)' }}
                >
                  {t.hero.cta1}
                </button>
                <button
                  className="px-8 py-4 rounded-full font-semibold text-lg border-2 transition-all hover:scale-105"
                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                >
                  {t.hero.cta2}
                </button>
              </div>

              {/* Stats */}
              <div className="flex gap-8 pt-4">
                {t.hero.stats.map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>{stat.number}</div>
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative animate-scale-in delay-200">
              {/* Main card */}
              <div className="relative rounded-3xl overflow-hidden shadow-2xl" style={{ background: 'var(--gradient-green)' }}>
                <div className="aspect-video flex items-center justify-center p-12">
                  {/* Video preview mockup */}
                  <div className="w-full h-full bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                    <button className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center text-green-600 hover:scale-110 transition-transform shadow-xl">
                      <PlayIcon />
                    </button>
                  </div>
                </div>

                {/* Floating elements */}
                <div className="absolute -top-4 -right-4 glass rounded-2xl p-4 animate-float shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--secondary)' }}>
                      <AIIcon />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">AI Tutor</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>Online 24/7</div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-4 -left-4 glass rounded-2xl p-4 animate-float delay-200 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white" style={{ background: `hsl(${i * 60}, 70%, 60%)` }} />
                      ))}
                    </div>
                    <div className="text-sm font-medium">+2,847 students</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24" style={{ background: 'var(--background-alt)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" style={{ color: 'var(--primary)' }}>
              {t.features.title}
            </h2>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--muted)' }}>
              {t.features.subtitle}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {t.features.items.map((feature, i) => (
              <div
                key={i}
                className="group p-8 rounded-3xl bg-white hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-white transition-transform group-hover:scale-110"
                  style={{ background: i % 2 === 0 ? 'var(--gradient-green)' : 'var(--gradient-warm)' }}
                >
                  {getFeatureIcon(feature.icon)}
                </div>
                <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
                  {feature.title}
                </h3>
                <p style={{ color: 'var(--muted)' }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24" style={{ background: 'var(--background)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" style={{ color: 'var(--primary)' }}>
              {t.howItWorks.title}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {t.howItWorks.steps.map((step, i) => (
              <div key={i} className="relative">
                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-1/2 w-full h-0.5" style={{ background: 'var(--border)' }} />
                )}

                <div className="relative text-center">
                  <div
                    className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center text-3xl font-bold text-white shadow-xl"
                    style={{ background: 'var(--gradient-green)' }}
                  >
                    {step.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
                    {step.title}
                  </h3>
                  <p style={{ color: 'var(--muted)' }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Subjects */}
      <section className="py-24" style={{ background: 'var(--gradient-green)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4 text-white">
            {t.subjects.title}
          </h2>
          <p className="text-xl mb-12 text-white/80">
            {t.subjects.subtitle}
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            {t.subjects.list.map((subject, i) => (
              <span
                key={i}
                className="px-6 py-3 rounded-full bg-white/20 text-white font-medium backdrop-blur-sm hover:bg-white/30 transition-colors cursor-default"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-24" style={{ background: 'var(--background-alt)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="glass rounded-3xl p-12 relative">
            <div className="text-6xl mb-6" style={{ color: 'var(--secondary)' }}>"</div>
            <blockquote className="text-2xl font-medium mb-8 leading-relaxed" style={{ color: 'var(--foreground)' }}>
              {t.testimonial.quote}
            </blockquote>
            <div className="flex items-center justify-center gap-4">
              <div
                className="w-12 h-12 rounded-full"
                style={{ background: 'var(--gradient-warm)' }}
              />
              <div className={isArabic ? 'text-right' : 'text-left'}>
                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{t.testimonial.author}</div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>{t.testimonial.location}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="about" className="py-24" style={{ background: 'var(--background)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6" style={{ color: 'var(--primary)' }}>
            {t.cta.title}
          </h2>
          <p className="text-xl mb-10" style={{ color: 'var(--muted)' }}>
            {t.cta.subtitle}
          </p>
          <button
            className="px-10 py-5 rounded-full text-white font-semibold text-xl transition-all hover:scale-105 hover:shadow-2xl animate-pulse-glow"
            style={{ background: 'var(--gradient-green)' }}
          >
            {t.cta.button}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: 'var(--gradient-green)' }}>
                م
              </div>
              <div>
                <div className="font-semibold" style={{ color: 'var(--primary)' }}>
                  {isArabic ? 'أمل مدرسة' : 'Amal Madrassa'}
                </div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>
                  {t.footer.tagline}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-6">
              {t.footer.links.map((link, i) => (
                <a key={i} href="#" className="text-sm transition-colors hover:underline" style={{ color: 'var(--muted)' }}>
                  {link}
                </a>
              ))}
            </div>
          </div>

          <div className="text-center mt-8 pt-8 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted-light)' }}>
              {t.footer.copyright}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
