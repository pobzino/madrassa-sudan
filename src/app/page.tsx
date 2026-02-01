"use client";

import { useState } from "react";
import Link from "next/link";

// --- Icons (Lucide-style simple strokes) ---
const Icon = ({ path, className = "w-6 h-6" }: { path: string; className?: string }) => (
    <svg
        className={className}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d={path} />
    </svg>
);

const Icons = {
    Play: "M5.25 5.25l13.5 6.75-13.5 6.75V5.25z",
    Book: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
    Brain: "M9.75 3a1.5 1.5 0 00-1.5 1.5v.75a.75.75 0 01-.75.75h-.75a3 3 0 00-3 3v.75c0 .414.336.75.75.75h.75a.75.75 0 01.75.75v.75a3 3 0 003 3h.75a.75.75 0 01.75.75v.75a1.5 1.5 0 001.5 1.5h1.5a1.5 1.5 0 001.5-1.5v-.75a.75.75 0 01.75-.75h.75a3 3 0 003-3v-.75a.75.75 0 01.75-.75h.75a.75.75 0 01.75-.75v-.75a3 3 0 00-3-3h-.75a.75.75 0 01-.75-.75v-.75a1.5 1.5 0 00-1.5-1.5h-1.5z",
    Users: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
    Download: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3",
    Globe: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418",
    ArrowRight: "M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75",
    Check: "M4.5 12.75l6 6 9-13.5",
    Smartphone: "M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3",
    Wifi: "M1.5 4.5a22.553 22.553 0 0131.5 0m-9 9a9.003 9.003 0 0112 0m-5.5 5.5a4.5 4.5 0 01-6 0",
    Heart: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    ChevronDown: "M19.5 8.25l-7.5 7.5-7.5-7.5"
};

export default function Home() {
    const [lang, setLang] = useState<'en' | 'ar'>('en');
    const dir = lang === 'ar' ? 'rtl' : 'ltr';

    const t = {
        en: {
            nav: ["Features", "For Teachers", "Subjects", "Giving"],
            login: "Log in",
            cta: "Start Learning Free",
            hero: {
                pill: "Restoring hope through education",
                h1: "Learning Without Borders",
                h2: "For Every Sudanese Child",
                p: "The premium online school for Sudan's future generation. AI-powered, offline-ready, and completely free for families affected by conflict.",
                primary: "Join as Student",
                secondary: "Volunteer as Teacher"
            },
            bento: {
                title: "Education Reimagined",
                subtitle: "Built to overcome connectivity challenges while delivering world-class curriculum.",
                card1: { title: "AI Tutor Assistant", desc: "Instantly explains concepts in Arabic & English. It doesn't just give answers—it teaches." },
                card2: { title: "Offline-First Design", desc: "Download lessons once, learn anywhere. No constant internet required." },
                card3: { title: "Sudanese Curriculum", desc: "Full alignment with national standards." },
                card4: { title: "Community Cohorts", desc: "Connect with classmates in your region." },
            },
            teachers: {
                title: "Teach From Anywhere",
                subtitle: "Join our network of qualified Sudanese educators. Create impact from your home.",
                benefit1: "Manage multiple cohorts easily",
                benefit2: "Automated grading & progress tracking",
                benefit3: "Connect with students who need you most",
                cta: "Apply to Teach"
            },
            faq: {
                title: "Common Questions",
                items: [
                    { q: "Is this really free?", a: "Yes, 100% free for all students and families." },
                    { q: "Do I need internet?", a: "Only to download lessons. You can learn offline." },
                    { q: "Which grades are covered?", a: "Currently grades 1-8, with high school coming soon." }
                ]
            },
            devices: {
                title: "Works on Your Device",
                subtitle: "Designed for everything from older smartphones to tablets and laptops.",
            },
            footer: "© 2026 Madrassa Sudan. A non-profit initiative."
        },
        ar: {
            nav: ["المميزات", "للمعلمين", "المواد", "تبرع"],
            login: "دخول",
            cta: "ابدأ التعلم مجاناً",
            hero: {
                pill: "نزرع الأمل من خلال التعليم",
                h1: "تعليم بلا حدود",
                h2: "لكل طفل سوداني",
                p: "المدرسة الرقمية الأولى لجيل مستقبل السودان. مدعومة بالذكاء الاصطناعي، تعمل بدون إنترنت، ومجانية تماماً للأسر المتأثرة بالنزاع.",
                primary: "انضم كطالب",
                secondary: "تطوع كمعلم"
            },
            bento: {
                title: "مفهوم جديد للتعليم",
                subtitle: "صُممت لتتغلب على تحديات الاتصال مع تقديم منهج بمواصفات عالمية.",
                card1: { title: "المعلم الذكي", desc: "شرح فوري للمفاهيم بالعربية والإنجليزية. لا يعطيك الحل فقط، بل يعلمك." },
                card2: { title: "يعمل بدون إنترنت", desc: "حمل الدروس مرة واحدة، وتعلم في أي مكان. لا حاجة لاتصال دائم." },
                card3: { title: "المنهج السوداني", desc: "تطابق كامل مع المعايير الوطنية." },
                card4: { title: "مجتمع طلابي", desc: "تواصل مع زملائك في منطقتك." },
            },
            teachers: {
                title: "علّم من أي مكان",
                subtitle: "انضم لشبكة المعلمين السودانيين المؤهلين. اصنع أثراً من منزلك.",
                benefit1: "إدارة سهلة لعدة فصول دراسية",
                benefit2: "تصحيح تلقائي ومتابعة للتقدم",
                benefit3: "تواصل مع الطلاب الذين يحتاجونك",
                cta: "قدم طلب للتدريس"
            },
            faq: {
                title: "أسئلة شائعة",
                items: [
                    { q: "هل المنصة مجانية حقاً؟", a: "نعم، مجانية ١٠٠٪ لجميع الطلاب والأسر." },
                    { q: "هل أحتاج إنترنت؟", a: "فقط لتحميل الدروس. يمكنك التعلم بدون اتصال." },
                    { q: "ما هي المراحل الدراسية؟", a: "حالياً الصفوف ١-٨، والثانوية قريباً." }
                ]
            },
            devices: {
                title: "يعمل على جهازك",
                subtitle: "مصمم ليعمل على كل الأجهزة، من الهواتف القديمة إلى الأجهزة اللوحية.",
            },
            footer: "© ٢٠٢٦ مدرسة السودان. مبادرة غير ربحية."
        }
    };

    const txt = t[lang];

    return (
        <div dir={dir} className={`min-h-screen font-sans ${lang === 'ar' ? 'font-arabic' : ''}`}>

            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-green-900/10">
                            م
                        </div>
                        <span className="text-xl font-bold tracking-tight text-gray-900 hidden sm:block">
                            {lang === 'ar' ? 'مدرسة السودان' : 'Madrassa Sudan'}
                        </span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
                        {txt.nav.map((item, i) => (
                            <a key={i} href="#" className="hover:text-[var(--primary)] transition-colors">{item}</a>
                        ))}
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                            className="px-3 py-1.5 rounded-lg bg-gray-50 text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 transition-all uppercase"
                        >
                            {lang === 'en' ? 'العربية' : 'English'}
                        </button>
                        <Link href="/auth/login" className="hidden sm:block px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20">
                            {txt.login}
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="pt-20">

                {/* --- Hero Section with Grid Background --- */}
                <section className="relative min-h-[80vh] flex flex-col items-center justify-center border-b border-gray-100 overflow-hidden">
                    {/* Lexport-style Grid Background */}
                    <div className="absolute inset-0 grid-pattern opacity-60 pointer-events-none" />

                    <div className="relative z-10 max-w-7xl mx-auto px-6 text-center py-24">
                        {/* Badge */}
                        <div className="flex justify-center mb-8">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-100 shadow-sm animate-fade-up">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-xs font-semibold text-green-800 tracking-wide uppercase">{txt.hero.pill}</span>
                            </div>
                        </div>

                        <div className="text-center max-w-4xl mx-auto mb-12 space-y-4">
                            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.1] animate-fade-up [animation-delay:100ms]">
                                {txt.hero.h1} <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)]">
                                    {txt.hero.h2}
                                </span>
                            </h1>
                            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed animate-fade-up [animation-delay:200ms] text-balance">
                                {txt.hero.p}
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10 animate-fade-up [animation-delay:300ms]">
                            <Link href="/auth/signup" className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--primary)] text-white text-lg font-semibold hover:bg-[var(--primary-light)] transition-all shadow-xl shadow-green-900/20 flex items-center justify-center gap-2 group">
                                {txt.hero.primary}
                                <Icon path={Icons.ArrowRight} className={`w-5 h-5 transition-transform ${lang === 'ar' ? 'group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} />
                            </Link>
                            <Link href="/teach" className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-gray-900 text-lg font-semibold border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm">
                                {txt.hero.secondary}
                            </Link>
                        </div>

                    </div>
                </section>


                {/* --- Unified Grid Features Section --- */}
                <section id="features" className="max-w-7xl mx-auto px-6 py-24">
                    <div className="mb-16 text-center">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{txt.bento.title}</h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">{txt.bento.subtitle}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Card 1: AI Tutor - BRAND GREEN */}
                        <div className="md:col-span-2 group rounded-3xl p-8 bg-[var(--primary)] text-white border border-transparent shadow-lg hover:shadow-xl transition-all duration-300">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="flex-1">
                                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white mb-6 backdrop-blur-sm">
                                        <Icon path={Icons.Brain} className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-2xl font-bold mb-3">{txt.bento.card1.title}</h3>
                                    <p className="text-green-50 leading-relaxed mb-6">{txt.bento.card1.desc}</p>
                                </div>

                                {/* Integrated Chat Preview (Dark Mode for Green bg) */}
                                <div className="w-full md:w-1/2 bg-white/10 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <div className="w-6 h-6 rounded-full bg-white/20 flex-shrink-0" />
                                            <div className="bg-white/90 text-gray-900 p-2 rounded-lg text-xs shadow-sm w-3/4">Can you explain...?</div>
                                        </div>
                                        <div className="flex gap-2 flex-row-reverse">
                                            <div className="w-6 h-6 rounded-full bg-white flex-shrink-0" />
                                            <div className="bg-black/20 text-white p-2 rounded-lg text-xs shadow-sm w-3/4">Of course! Let's break it down...</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Offline - Standardized */}
                        <div className="group rounded-3xl p-8 bg-white border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 mb-6">
                                <Icon path={Icons.Download} className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-gray-900">{txt.bento.card2.title}</h3>
                            <p className="text-gray-600 leading-relaxed">{txt.bento.card2.desc}</p>
                        </div>

                        {/* Card 3: Curriculum - Standardized */}
                        <div className="group rounded-3xl p-8 bg-white border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 mb-6">
                                <Icon path={Icons.Book} className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">{txt.bento.card3.title}</h3>
                            <p className="text-gray-600 leading-relaxed">{txt.bento.card3.desc}</p>
                        </div>

                        {/* Card 4: Community - Standardized */}
                        <div className="md:col-span-2 group rounded-3xl p-8 bg-white border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300">
                            <div className="flex flex-col md:flex-row items-center gap-8">
                                <div className="flex-1">
                                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-700 mb-6">
                                        <Icon path={Icons.Users} className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900 mb-3">{txt.bento.card4.title}</h3>
                                    <p className="text-gray-600 leading-relaxed">{txt.bento.card4.desc}</p>
                                </div>
                                {/* Community Visual */}
                                <div className="flex -space-x-4">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="w-12 h-12 rounded-full border-4 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                                            {i}
                                        </div>
                                    ))}
                                    <div className="w-12 h-12 rounded-full border-4 border-white bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">+2k</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </section>


                {/* --- Devices & Offline Section --- */}
                <section className="bg-gray-50 border-y border-gray-200 py-24">
                    <div className="max-w-7xl mx-auto px-6">
                        <div className="grid md:grid-cols-2 gap-16 items-center">
                            <div>
                                <h2 className="text-3xl font-bold text-gray-900 mb-6">{txt.devices.title}</h2>
                                <p className="text-lg text-gray-600 mb-8">{txt.devices.subtitle}</p>

                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-900 shadow-sm">
                                            <Icon path={Icons.Smartphone} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">Mobile First</h4>
                                            <p className="text-sm text-gray-600">Optimized for low-end Android devices.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-900 shadow-sm">
                                            <Icon path={Icons.Wifi} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">Low Bandwidth</h4>
                                            <p className="text-sm text-gray-600">Adaptive video streaming for slow connections.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-lg flex items-center justify-center h-80">
                                {/* Device Mockup Graphic Placeholder */}
                                <div className="text-center text-gray-400">
                                    <Icon path={Icons.Smartphone} className="w-24 h-24 mx-auto mb-4 opacity-20" />
                                    <span>App Interface Preview</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>


                {/* --- Teachers Section --- */}
                <section id="teachers" className="max-w-7xl mx-auto px-6 py-24">
                    <div className="bg-[var(--primary)] rounded-3xl p-8 md:p-16 text-white text-center md:text-left relative overflow-hidden">
                        {/* Abstract Pattern */}
                        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                            <div>
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">{txt.teachers.title}</h2>
                                <p className="text-green-50 text-lg mb-8 max-w-md">{txt.teachers.subtitle}</p>

                                <ul className="space-y-4 mb-8">
                                    {[txt.teachers.benefit1, txt.teachers.benefit2, txt.teachers.benefit3].map((benefit, i) => (
                                        <li key={i} className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full bg-green-400 flex items-center justify-center">
                                                <Icon path={Icons.Check} className="w-4 h-4 text-green-900" />
                                            </div>
                                            <span>{benefit}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Link href="/teach" className="px-8 py-3 bg-white text-[var(--primary)] rounded-full font-bold hover:bg-green-50 transition-colors inline-block">
                                    {txt.teachers.cta}
                                </Link>
                            </div>
                            {/* Teacher Image Area */}
                            <div className="hidden md:block h-full min-h-[300px] bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 flex items-center justify-center">
                                <Icon path={Icons.Users} className="w-24 h-24 text-green-200 opacity-50" />
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- FAQ Section --- */}
                <section className="max-w-3xl mx-auto px-6 py-24">
                    <h2 className="text-3xl font-bold text-center mb-12">{txt.faq.title}</h2>
                    <div className="space-y-4">
                        {txt.faq.items.map((item, i) => (
                            <div key={i} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow cursor-pointer bg-white">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-lg text-gray-900">{item.q}</h3>
                                    <Icon path={Icons.ChevronDown} className="w-5 h-5 text-gray-400" />
                                </div>
                                <p className="text-gray-600">{item.a}</p>
                            </div>
                        ))}
                    </div>
                </section>

            </main>

            {/* --- Footer --- */}
            <footer className="border-t border-gray-200 bg-gray-50">
                <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2 text-gray-900 font-bold">
                        <span className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white text-sm">م</span>
                        <span>Madrassa Sudan</span>
                    </div>
                    <div className="flex gap-8 text-sm text-gray-600">
                        <a href="#" className="hover:text-gray-900">Privacy</a>
                        <a href="#" className="hover:text-gray-900">Contact</a>
                        <a href="#" className="hover:text-gray-900">Donate</a>
                    </div>
                    <p className="text-sm text-gray-500">{txt.footer}</p>
                </div>
            </footer>
        </div>
    );
}
