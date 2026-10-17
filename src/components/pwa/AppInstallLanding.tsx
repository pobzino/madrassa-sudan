"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { OwlWaving } from "@/components/illustrations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AddToPhone, useInstallPlatform } from "./AddToPhone";

const COPY = {
  en: {
    title: "Put Amal on your phone",
    subtitle: "Open your lessons in one tap, like an app.",
    perks: ["Free, with no app store", "Opens straight to your lessons", "Takes almost no space on your phone"],
    installedTitle: "You're all set!",
    installedBody: "Amal is on your phone. Open it from your home screen any time.",
    openLessons: "Open my lessons",
    alreadyHave: "Already added it? Open Amal",
  },
  ar: {
    title: "ضع آمال على هاتفك",
    subtitle: "افتح دروسك بلمسة واحدة مثل أي تطبيق.",
    perks: ["مجاني، ولا حاجة لمتجر التطبيقات", "يفتح مباشرة على دروسك", "لا يأخذ مساحة تُذكر على هاتفك"],
    installedTitle: "كل شيء جاهز!",
    installedBody: "آمال موجود على هاتفك. افتحه من الشاشة الرئيسية في أي وقت.",
    openLessons: "افتح دروسي",
    alreadyHave: "أضفته من قبل؟ افتح آمال",
  },
};

export function AppInstallLanding() {
  const { language, isRtl } = useLanguage();
  const t = COPY[language];
  const platform = useInstallPlatform();
  const installed = platform === "installed";

  return (
    <main
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-svh px-4 py-10"
      style={{ background: "linear-gradient(180deg, #e4efff 0%, #eef0fb 30%, #eef6ee 65%, #dcefdd 100%)" }}
    >
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center text-center">
          <OwlWaving className="h-28 w-28 drop-shadow-lg" />
          <h1 className="mt-3 font-fredoka text-3xl font-bold text-gray-900">{installed ? t.installedTitle : t.title}</h1>
          <p className="mt-2 text-base text-gray-600">{installed ? t.installedBody : t.subtitle}</p>
        </div>

        <div className="mt-7 rounded-[28px] bg-[#f5faf5]/90 p-5 shadow-xl ring-1 ring-white">
          {installed ? (
            <Link
              href="/dashboard"
              className="flex w-full items-center justify-center rounded-2xl bg-[#007229] px-6 py-4 font-fredoka text-lg font-bold text-white shadow-[0_4px_0_#005C22]"
            >
              {t.openLessons}
            </Link>
          ) : (
            <AddToPhone source="app_page" />
          )}
        </div>

        {!installed && (
          <>
            <ul className="mt-6 space-y-2">
              {t.perks.map((perk) => (
                <li key={perk} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-[15px] font-semibold text-gray-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#007229] text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /></span>
                  {perk}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center">
              <Link href="/dashboard" className="font-fredoka font-bold text-[#007229]">
                {t.alreadyHave}
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
