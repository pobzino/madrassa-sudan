"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CirclePlay,
  Clock3,
  Download,
  Heart,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlReading, OwlWaving } from "@/components/illustrations";
import { SectionScene } from "@/components/dashboard/DashboardScenes";
import { SudanFlagToAmalOwl } from "@/components/brand/SudanFlagToAmalOwl";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

const copy = {
  en: {
    nav: {
      why: "Why Amal",
      learning: "How learning works",
      enrolment: "How to enrol",
      faq: "Questions",
      enrol: "Enrol your child",
    },
    hero: {
      eyebrow: "FOR SUDANESE FAMILIES",
      titleStart: "Your child can keep",
      titleHighlight: "learning",
      titleEnd: "wherever you are.",
      body: "Amal School gives Sudanese children free, interactive Maths and English lessons they can follow on a phone, tablet, or computer — at a pace that works for your family.",
      primary: "Apply to enrol your child",
      secondary: "Try a sample lesson",
      note: "Applying is free. We review every application and contact families on WhatsApp.",
      lessonLabel: "Inside an Amal lesson",
      lessonTitle: "Fractions made simple",
      lessonStep: "Activity 2 of 4",
      question: "Which shape shows one half?",
      answer: "Great work! Let’s keep going.",
    },
    facts: [
      { title: "Free for families", body: "No school fees or subscriptions" },
      { title: "Phone-friendly", body: "Learn on the device you already have" },
      { title: "Maths & English", body: "Clear lessons with regular practice" },
      { title: "No email needed", body: "Parents can register with WhatsApp" },
    ],
    why: {
      eyebrow: "WHY FAMILIES CHOOSE AMAL",
      title: "Learning that meets your child where they are",
      body: "War and displacement have interrupted learning for many Sudanese children. Amal helps children rebuild confidence with lessons they can pause, repeat, and practise.",
      cards: [
        {
          title: "Lessons children take part in",
          body: "The teacher explains, then the lesson pauses for quizzes, matching, drawing, and other activities.",
        },
        {
          title: "Practice after every lesson",
          body: "Short practice helps children remember what they learned, with immediate feedback and chances to try again.",
        },
        {
          title: "A clear view of progress",
          body: "Completed lessons, practice results, and learning progress stay together so families can see what comes next.",
        },
        {
          title: "Made for different connections",
          body: "Use Amal on a phone and save available lessons while connected so learning can continue when internet access is limited.",
        },
      ],
    },
    routine: {
      eyebrow: "HOW LEARNING WORKS",
      title: "One simple learning routine",
      body: "Children do more than watch a video. Each lesson guides them from explanation to activity to practice.",
      steps: [
        { title: "Watch and listen", body: "A teacher explains the idea clearly with visual examples." },
        { title: "Stop and take part", body: "The lesson pauses so your child answers before moving on." },
        { title: "Practise and improve", body: "Post-lesson questions give instant feedback and allow another try." },
      ],
      sample: "See this in a sample lesson",
    },
    enrolment: {
      eyebrow: "HOW TO ENROL",
      title: "Apply in a few clear steps",
      body: "The parent or caregiver completes the application. You can use your WhatsApp number if you do not have an email address.",
      steps: [
        {
          title: "Create a parent account",
          body: "Enter your name, WhatsApp number, and a password. Email is optional for parents.",
        },
        {
          title: "Tell us about your child",
          body: "Share their age, learning situation, location, and the device and internet access available.",
        },
        {
          title: "We review your application",
          body: "Our team checks the information so we can support the families the programme is designed for.",
        },
        {
          title: "Start learning",
          body: "Once approved, sign in with WhatsApp and your password, then open your child’s learning path.",
        },
      ],
      needTitle: "What you will need",
      needs: ["A WhatsApp number", "Your child’s age", "Your current country and city", "A little information about your device and internet access"],
      cta: "Start the parent application",
      support: "Need help applying?",
      supportLink: "Email the Amal team",
    },
    reassurance: {
      title: "You do not have to recreate school at home.",
      body: "Give your child a regular time and a quiet place when possible. Amal guides the lesson, activities, and practice; your encouragement helps them keep going.",
      points: ["Let your child learn at their own pace", "Repeat a lesson whenever needed", "Celebrate steady progress, not only perfect scores"],
    },
    faq: {
      eyebrow: "PARENT QUESTIONS",
      title: "Before you apply",
      items: [
        {
          q: "Is Amal School really free?",
          a: "Yes. Amal School is free for enrolled children. There are no school fees or subscription charges.",
        },
        {
          q: "Which children can apply?",
          a: "Sudanese parents and caregivers can apply for children whose education has been affected or interrupted. The application asks a few questions so our team can understand your child’s situation.",
        },
        {
          q: "Which subjects are available?",
          a: "Amal currently provides Maths and English lessons, with new learning content added over time.",
        },
        {
          q: "What if we only have a phone or weak internet?",
          a: "A phone is enough to use the platform. Available lessons can also be saved while you have a connection, helping your child continue when internet access is limited.",
        },
        {
          q: "Do I need an email address?",
          a: "No. Parents can apply and later sign in using the same WhatsApp number and password they registered with.",
        },
        {
          q: "What happens after I apply?",
          a: "The Amal team reviews your application and contacts you through WhatsApp. After approval, you can sign in and begin your child’s learning path.",
        },
      ],
    },
    final: {
      title: "Ready to help your child keep learning?",
      body: "Complete the parent application and our team will guide you through the next step.",
      cta: "Apply to enrol your child",
      sample: "Try a lesson first",
    },
    footer: {
      tagline: "For the children of Sudan",
      home: "Home",
      privacy: "Privacy",
      terms: "Terms",
      contact: "Contact",
    },
  },
  ar: {
    nav: {
      why: "لماذا آمال؟",
      learning: "كيف يتعلم الطفل",
      enrolment: "طريقة التسجيل",
      faq: "الأسئلة",
      enrol: "سجّل طفلك",
    },
    hero: {
      eyebrow: "للأسر السودانية",
      titleStart: "يمكن لطفلك مواصلة",
      titleHighlight: "التعلّم",
      titleEnd: "أينما كنتم.",
      body: "تقدّم مدرسة آمال للأطفال السودانيين دروساً مجانية وتفاعلية في الرياضيات واللغة الإنجليزية، يمكنهم متابعتها بالهاتف أو الجهاز اللوحي أو الحاسوب وبالسرعة المناسبة لأسرتكم.",
      primary: "قدّم طلب تسجيل طفلك",
      secondary: "جرّب درساً نموذجياً",
      note: "التقديم مجاني. نراجع كل طلب ونتواصل مع الأسر عبر واتساب.",
      lessonLabel: "داخل درس في آمال",
      lessonTitle: "الكسور بطريقة سهلة",
      lessonStep: "النشاط ٢ من ٤",
      question: "أي شكل يوضّح النصف؟",
      answer: "أحسنت! لنواصل التعلّم.",
    },
    facts: [
      { title: "مجانية للأسر", body: "لا رسوم دراسية ولا اشتراكات" },
      { title: "مناسبة للهاتف", body: "تعلّم بالجهاز المتوفر لديكم" },
      { title: "رياضيات وإنجليزي", body: "دروس واضحة وتدريب منتظم" },
      { title: "لا حاجة للبريد", body: "يمكن التسجيل برقم واتساب" },
    ],
    why: {
      eyebrow: "لماذا تختار الأسر آمال؟",
      title: "تعلّم يبدأ من مستوى طفلك وظروفه",
      body: "تسببت الحرب والنزوح في انقطاع كثير من أطفال السودان عن التعليم. تساعد آمال الطفل على استعادة ثقته بدروس يمكن إيقافها وإعادتها والتدرّب عليها.",
      cards: [
        {
          title: "دروس يشارك فيها الطفل",
          body: "يشرح المعلم ثم يتوقف الدرس لأسئلة وأنشطة مثل التوصيل والرسم والاختيار.",
        },
        {
          title: "تدريب بعد كل درس",
          body: "تدريب قصير يثبّت ما تعلّمه الطفل، مع نتيجة فورية وفرصة للمحاولة مرة أخرى.",
        },
        {
          title: "تقدّم واضح للأسرة",
          body: "تبقى الدروس المكتملة ونتائج التدريب ومسار التعلّم في مكان واحد لتعرفوا الخطوة التالية.",
        },
        {
          title: "مصممة لاتصالات مختلفة",
          body: "استخدموا آمال على الهاتف واحفظوا الدروس المتاحة عند توفر الإنترنت ليستمر التعلّم عند ضعف الاتصال.",
        },
      ],
    },
    routine: {
      eyebrow: "كيف يتعلم الطفل؟",
      title: "روتين تعلّم بسيط وواضح",
      body: "الطفل لا يشاهد فيديو فقط. كل درس ينقله من الشرح إلى النشاط ثم إلى التدريب.",
      steps: [
        { title: "يشاهد ويستمع", body: "يشرح المعلم الفكرة بوضوح مع أمثلة مرئية." },
        { title: "يتوقف ويشارك", body: "يتوقف الدرس ليجيب الطفل قبل أن يواصل." },
        { title: "يتدرّب ويتحسن", body: "أسئلة بعد الدرس تعطي نتيجة فورية وتسمح بمحاولة أخرى." },
      ],
      sample: "شاهد ذلك في درس نموذجي",
    },
    enrolment: {
      eyebrow: "طريقة التسجيل",
      title: "قدّم الطلب في خطوات واضحة",
      body: "يكمل ولي الأمر أو مقدم الرعاية الطلب. ويمكنك استخدام رقم واتساب إذا لم يكن لديك بريد إلكتروني.",
      steps: [
        {
          title: "أنشئ حساب ولي أمر",
          body: "أدخل اسمك ورقم واتساب وكلمة مرور. البريد الإلكتروني اختياري لأولياء الأمور.",
        },
        {
          title: "أخبرنا عن طفلك",
          body: "شارك عمره ووضعه التعليمي ومكان إقامتكم والجهاز والإنترنت المتوفرين.",
        },
        {
          title: "نراجع طلبكم",
          body: "يراجع فريقنا المعلومات حتى نتمكن من دعم الأسر التي صُمم البرنامج من أجلها.",
        },
        {
          title: "ابدأوا التعلّم",
          body: "بعد الموافقة، سجّل الدخول برقم واتساب وكلمة المرور وافتح مسار تعلّم طفلك.",
        },
      ],
      needTitle: "ما تحتاجه للتقديم",
      needs: ["رقم واتساب", "عمر طفلك", "الدولة والمدينة الحالية", "معلومات بسيطة عن الجهاز والاتصال بالإنترنت"],
      cta: "ابدأ طلب ولي الأمر",
      support: "تحتاج مساعدة في التقديم؟",
      supportLink: "راسل فريق آمال",
    },
    reassurance: {
      title: "لست مطالباً بإعادة المدرسة كاملة داخل المنزل.",
      body: "وفّر لطفلك وقتاً منتظماً ومكاناً هادئاً قدر الإمكان. تتولى آمال توجيه الدرس والأنشطة والتدريب، ويمنحه تشجيعك الدافع للاستمرار.",
      points: ["دع طفلك يتعلم بالسرعة المناسبة له", "أعد أي درس عند الحاجة", "احتفل بالتقدم المستمر وليس بالدرجة الكاملة فقط"],
    },
    faq: {
      eyebrow: "أسئلة أولياء الأمور",
      title: "قبل أن تقدّم الطلب",
      items: [
        {
          q: "هل مدرسة آمال مجانية فعلاً؟",
          a: "نعم. مدرسة آمال مجانية للأطفال المقبولين، ولا توجد رسوم دراسية أو اشتراكات.",
        },
        {
          q: "من يمكنه التقديم؟",
          a: "يمكن لأولياء الأمور ومقدمي الرعاية السودانيين التقديم لأطفال تأثر تعليمهم أو انقطع. يتضمن الطلب أسئلة بسيطة تساعد فريقنا على فهم وضع الطفل.",
        },
        {
          q: "ما المواد المتوفرة؟",
          a: "تقدم آمال حالياً دروس الرياضيات واللغة الإنجليزية، وتضيف محتوى تعليمياً جديداً مع الوقت.",
        },
        {
          q: "ماذا لو كان لدينا هاتف فقط أو إنترنت ضعيف؟",
          a: "الهاتف يكفي لاستخدام المنصة. ويمكن أيضاً حفظ الدروس المتاحة عند توفر الاتصال ليستمر طفلك عند ضعف الإنترنت.",
        },
        {
          q: "هل أحتاج إلى بريد إلكتروني؟",
          a: "لا. يمكن لولي الأمر التقديم ثم تسجيل الدخول بنفس رقم واتساب وكلمة المرور اللذين سجّل بهما.",
        },
        {
          q: "ماذا يحدث بعد التقديم؟",
          a: "يراجع فريق آمال طلبك ويتواصل معك عبر واتساب. وبعد الموافقة يمكنك تسجيل الدخول وبدء مسار تعلّم طفلك.",
        },
      ],
    },
    final: {
      title: "هل أنت مستعد لمساعدة طفلك على مواصلة التعلّم؟",
      body: "أكمل طلب ولي الأمر وسيرشدك فريقنا إلى الخطوة التالية.",
      cta: "قدّم طلب تسجيل طفلك",
      sample: "جرّب درساً أولاً",
    },
    footer: {
      tagline: "من أجل أطفال السودان",
      home: "الرئيسية",
      privacy: "الخصوصية",
      terms: "الشروط",
      contact: "تواصل معنا",
    },
  },
};

const factIcons = [Heart, Smartphone, BookOpen, MessageCircle];
const benefitIcons = [CirclePlay, Sparkles, TrendingUp, Download];
const routineIcons = [CirclePlay, Sparkles, ShieldCheck];

export default function ParentsPage() {
  const { language, setLanguage, isRtl } = useLanguage();
  const [openFaq, setOpenFaq] = useState(0);
  const t = copy[language];

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden bg-[#fffdf8] text-slate-900">
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-emerald-950/5 bg-[#fffdf8]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Amal School home">
            <span className="block h-10 w-10 shrink-0">
              <SudanFlagToAmalOwl markOnly showReplay={false} className="h-full w-full" />
            </span>
            <span className="font-fredoka text-xl font-semibold tracking-tight text-[#007229] sm:text-2xl">amal school</span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex">
            <a href="#why-amal" className="transition-colors hover:text-[#007229]">{t.nav.why}</a>
            <a href="#learning" className="transition-colors hover:text-[#007229]">{t.nav.learning}</a>
            <a href="#enrolment" className="transition-colors hover:text-[#007229]">{t.nav.enrolment}</a>
            <a href="#parent-questions" className="transition-colors hover:text-[#007229]">{t.nav.faq}</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
              aria-label={language === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            >
              {language === "ar" ? "EN" : "عربي"}
            </button>
            <Link
              href="/auth/signup?role=parent"
              data-analytics="signup_click"
              data-analytics-source="parents_navbar"
              data-analytics-role="parent"
              className="rounded-full bg-[#007229] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-900/15 transition-all hover:bg-[#005C22] sm:px-5 sm:text-sm"
            >
              {t.nav.enrol}
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        <section className="relative overflow-hidden pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28 lg:pt-20">
          <SectionScene sky="linear-gradient(180deg,#eef5ff 0%,#f8f4e9 58%,#e4f3e4 100%)" hill="#cfe8d4" hill2="#b9dfc2" clouds />
          <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
            <div className="text-center lg:text-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-xs font-extrabold tracking-[0.12em] text-[#007229] shadow-sm">
                <Heart className="h-3.5 w-3.5 fill-current" />
                {t.hero.eyebrow}
              </span>
              <h1 className="mt-5 font-fredoka text-4xl font-semibold leading-[1.05] tracking-tight text-[#0d1830] sm:text-5xl lg:text-7xl">
                {t.hero.titleStart}{" "}
                <span className="relative inline-block text-[#007229]">
                  {t.hero.titleHighlight}
                  <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 220 12" fill="none" aria-hidden>
                    <path d="M3 8C58 2 153 2 217 8" stroke="#f5ad22" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </span>{" "}
                {t.hero.titleEnd}
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 lg:mx-0">{t.hero.body}</p>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
                <Link
                  href="/auth/signup?role=parent"
                  data-analytics="signup_click"
                  data-analytics-source="parents_hero"
                  data-analytics-role="parent"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#007229] px-7 py-4 text-base font-bold text-white shadow-xl shadow-emerald-900/20 transition-all hover:-translate-y-0.5 hover:bg-[#005C22] sm:w-auto"
                >
                  {t.hero.primary}
                  <ArrowRight className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${isRtl ? "rotate-180 group-hover:-translate-x-1" : ""}`} />
                </Link>
                <Link
                  href="/sample-lesson"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-slate-200 bg-white px-7 py-3.5 text-base font-bold text-slate-700 transition-all hover:border-emerald-300 hover:text-[#007229] sm:w-auto"
                >
                  <CirclePlay className="h-5 w-5 text-[#007229]" />
                  {t.hero.secondary}
                </Link>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">{t.hero.note}</p>
            </div>

            <div className="relative mx-auto w-full max-w-[560px]">
              <div className="absolute -left-6 top-12 h-24 w-24 rounded-full bg-amber-200/70 blur-2xl" />
              <div className="absolute -right-4 bottom-10 h-32 w-32 rounded-full bg-emerald-200/70 blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 p-4 shadow-[0_28px_80px_rgba(15,23,42,0.14)] sm:p-6">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#007229]">{t.hero.lessonLabel}</p>
                    <p className="mt-1 font-fredoka text-lg font-semibold text-slate-900 sm:text-xl">{t.hero.lessonTitle}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700">{t.hero.lessonStep}</span>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-[0.82fr_1.18fr]">
                  <div className="relative min-h-44 overflow-hidden rounded-3xl bg-gradient-to-b from-emerald-50 to-emerald-100 p-4">
                    <div className="absolute left-4 top-4 flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#D21034]" />
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="h-2 w-2 rounded-full bg-[#007229]" />
                    </div>
                    <OwlReading className="absolute bottom-5 left-1/2 w-36 -translate-x-1/2 sm:w-40" />
                    <div className="absolute inset-x-4 bottom-3 h-2 rounded-full bg-white">
                      <div className="h-full w-2/3 rounded-full bg-[#007229]" />
                    </div>
                  </div>

                  <div className="rounded-3xl bg-[#0d1830] p-5 text-white">
                    <p className="text-sm font-semibold text-white/70">{t.hero.question}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2" dir="ltr">
                      {["◐", "◒", "●"].map((shape, index) => (
                        <div
                          key={shape}
                          className={`flex aspect-square items-center justify-center rounded-2xl text-3xl ${index === 1 ? "bg-white text-[#007229] ring-4 ring-emerald-300" : "bg-white/10 text-white/75"}`}
                        >
                          {shape}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-500/20 px-3 py-2.5 text-xs font-bold text-emerald-200">
                      <Check className="h-4 w-4" />
                      {t.hero.answer}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-20 -mt-6 px-4 sm:px-6">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 rounded-3xl border border-emerald-100 bg-white p-3 shadow-xl shadow-emerald-950/5 sm:grid-cols-4 sm:gap-0 sm:p-5">
            {t.facts.map((fact, index) => {
              const Icon = factIcons[index];
              return (
                <div key={fact.title} className={`rounded-2xl p-3 text-center sm:px-5 ${index > 0 ? "sm:border-s sm:border-slate-100" : ""}`}>
                  <Icon className="mx-auto h-6 w-6 text-[#007229]" />
                  <p className="mt-2 text-sm font-extrabold text-slate-900 sm:text-base">{fact.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{fact.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="why-amal" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-extrabold tracking-[0.14em] text-[#007229]">{t.why.eyebrow}</p>
              <h2 className="mt-3 font-fredoka text-3xl font-semibold leading-tight text-[#0d1830] sm:text-5xl">{t.why.title}</h2>
              <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg">{t.why.body}</p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
              {t.why.cards.map((card, index) => {
                const Icon = benefitIcons[index];
                const accents = ["bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700"];
                return (
                  <article key={card.title} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accents[index]}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 font-fredoka text-xl font-semibold leading-tight text-slate-900">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{card.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="learning" className="relative scroll-mt-16 overflow-hidden bg-[#08752e] px-4 py-20 text-white sm:px-6 sm:py-24">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #86efac 0, transparent 28%), radial-gradient(circle at 80% 70%, #fde68a 0, transparent 24%)" }} />
          <div className="relative mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-extrabold tracking-[0.14em] text-emerald-100">{t.routine.eyebrow}</p>
              <h2 className="mt-3 font-fredoka text-3xl font-semibold sm:text-5xl">{t.routine.title}</h2>
              <p className="mt-4 text-base leading-7 text-white/80 sm:text-lg">{t.routine.body}</p>
            </div>

            <div className="relative mt-12 grid gap-5 md:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-white/30 md:block" />
              {t.routine.steps.map((step, index) => {
                const Icon = routineIcons[index];
                return (
                  <article key={step.title} className="relative rounded-3xl border border-white/15 bg-white/10 p-6 text-center backdrop-blur-sm sm:p-8">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#007229] shadow-lg ring-4 ring-white/20">
                      <Icon className="h-7 w-7" />
                    </div>
                    <span className="absolute top-5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-amber-950 ltr:right-5 rtl:left-5">{index + 1}</span>
                    <h3 className="mt-5 font-fredoka text-xl font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/75">{step.body}</p>
                  </article>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Link href="/sample-lesson" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 font-bold text-[#007229] transition-transform hover:-translate-y-0.5">
                <CirclePlay className="h-5 w-5" />
                {t.routine.sample}
              </Link>
            </div>
          </div>
        </section>

        <section id="enrolment" className="scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-start gap-12 lg:grid-cols-[1fr_0.85fr] lg:gap-16">
              <div>
                <p className="text-xs font-extrabold tracking-[0.14em] text-[#007229]">{t.enrolment.eyebrow}</p>
                <h2 className="mt-3 font-fredoka text-3xl font-semibold leading-tight text-[#0d1830] sm:text-5xl">{t.enrolment.title}</h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{t.enrolment.body}</p>

                <ol className="mt-10 space-y-4">
                  {t.enrolment.steps.map((step, index) => (
                    <li key={step.title} className="flex gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:gap-5 sm:p-6">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#007229] font-fredoka text-lg font-bold text-white shadow-md shadow-emerald-900/15">{index + 1}</span>
                      <div>
                        <h3 className="font-fredoka text-lg font-semibold text-slate-900 sm:text-xl">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-slate-600 sm:text-base">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <aside className="lg:sticky lg:top-24">
                <div className="relative overflow-hidden rounded-[2rem] bg-[#0d1830] p-6 text-white shadow-2xl sm:p-8">
                  <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-500/25" />
                  <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-amber-400/15" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                      <MessageCircle className="h-6 w-6 text-emerald-300" />
                    </div>
                    <h3 className="mt-5 font-fredoka text-2xl font-semibold">{t.enrolment.needTitle}</h3>
                    <ul className="mt-5 space-y-3">
                      {t.enrolment.needs.map((need) => (
                        <li key={need} className="flex items-start gap-3 text-sm leading-6 text-white/80">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                          {need}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/auth/signup?role=parent"
                      data-analytics="signup_click"
                      data-analytics-source="parents_enrolment"
                      data-analytics-role="parent"
                      className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-400 px-6 py-4 font-bold text-amber-950 transition-all hover:bg-amber-300"
                    >
                      {t.enrolment.cta}
                      <ArrowRight className={`h-5 w-5 ${isRtl ? "rotate-180" : ""}`} />
                    </Link>
                    <p className="mt-5 text-center text-xs text-white/55">
                      {t.enrolment.support}{" "}
                      <a href="mailto:admin@amalschool.org?subject=Parent%20application%20help" className="font-bold text-white underline decoration-white/40 underline-offset-4">{t.enrolment.supportLink}</a>
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <Clock3 className="h-5 w-5 shrink-0 text-[#007229]" />
                  <span>{t.hero.note}</span>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="mx-auto grid max-w-6xl items-center gap-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-100 via-[#fff8eb] to-emerald-100 p-6 sm:p-10 md:grid-cols-[0.72fr_1.28fr] lg:p-14">
            <div className="relative mx-auto h-52 w-full max-w-xs">
              <div className="absolute inset-6 rounded-full bg-white/65" />
              <OwlWaving className="absolute bottom-2 left-1/2 w-48 -translate-x-1/2 drop-shadow-xl" />
              <span className="absolute left-5 top-2 text-3xl text-amber-400">✦</span>
              <span className="absolute right-8 top-12 text-xl text-[#007229]">♥</span>
            </div>
            <div>
              <h2 className="font-fredoka text-3xl font-semibold leading-tight text-[#0d1830] sm:text-4xl">{t.reassurance.title}</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">{t.reassurance.body}</p>
              <ul className="mt-6 grid gap-3">
                {t.reassurance.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 font-semibold text-slate-700">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#007229] text-white"><Check className="h-4 w-4" /></span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="parent-questions" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="text-xs font-extrabold tracking-[0.14em] text-[#007229]">{t.faq.eyebrow}</p>
              <h2 className="mt-3 font-fredoka text-3xl font-semibold text-[#0d1830] sm:text-5xl">{t.faq.title}</h2>
            </div>

            <div className="mt-10 space-y-3">
              {t.faq.items.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <article key={item.q} className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fffdf8]">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? -1 : index)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-start sm:px-6"
                      aria-expanded={isOpen}
                    >
                      <span className="font-bold text-slate-900">{item.q}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-[#007229] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && <p className="px-5 pb-5 text-sm leading-7 text-slate-600 sm:px-6 sm:text-base">{item.a}</p>}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
          <SectionScene sky="linear-gradient(180deg,#eef5ff 0%,#eef7ef 100%)" hill="#d2ead7" hill2="#bde0c5" clouds />
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-lg">
              <ShieldCheck className="h-8 w-8 text-[#007229]" />
            </div>
            <h2 className="mt-6 font-fredoka text-3xl font-semibold leading-tight text-[#0d1830] sm:text-5xl">{t.final.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{t.final.body}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/signup?role=parent"
                data-analytics="signup_click"
                data-analytics-source="parents_final"
                data-analytics-role="parent"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#007229] px-8 py-4 font-bold text-white shadow-xl shadow-emerald-900/20 transition-all hover:-translate-y-0.5 hover:bg-[#005C22] sm:w-auto"
              >
                {t.final.cta}
                <ArrowRight className={`h-5 w-5 ${isRtl ? "rotate-180" : ""}`} />
              </Link>
              <Link href="/sample-lesson" className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-slate-200 bg-white px-8 py-3.5 font-bold text-slate-700 hover:border-emerald-300 hover:text-[#007229] sm:w-auto">
                <CirclePlay className="h-5 w-5" />
                {t.final.sample}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <SudanFlagToAmalOwl markOnly showReplay={false} className="h-10 w-10" />
              <div>
                <p className="font-fredoka text-xl font-semibold text-[#007229]">amal school</p>
                <p className="text-xs text-slate-500">{t.footer.tagline}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-semibold text-slate-600">
              <Link href="/" className="hover:text-[#007229]">{t.footer.home}</Link>
              <Link href="/privacy" className="hover:text-[#007229]">{t.footer.privacy}</Link>
              <Link href="/terms" className="hover:text-[#007229]">{t.footer.terms}</Link>
              <a href="mailto:admin@amalschool.org" className="hover:text-[#007229]">{t.footer.contact}</a>
            </div>
          </div>
          <p dir="ltr" className="mx-auto mt-7 max-w-4xl border-t border-slate-100 pt-6 text-center text-[11px] leading-relaxed text-slate-500 sm:text-xs">
            {LEGAL_ENTITY.registeredName} is a community interest company limited by guarantee, registered in {LEGAL_ENTITY.registeredIn}.{" "}
            <a href={LEGAL_ENTITY.companiesHouseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-300 underline-offset-2 hover:text-[#007229]">
              Company number {LEGAL_ENTITY.companyNumber}
            </a>
            . Registered office: {LEGAL_ENTITY.registeredOffice}.
          </p>
        </div>
      </footer>
    </div>
  );
}
