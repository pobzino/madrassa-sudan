"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { MadrassaLogo } from "@/components/illustrations";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = useLanguage();
  const pathname = usePathname();

  const isLogin = pathname === "/auth/login";
  const isSignup = pathname === "/auth/signup";

  return (
    <>
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <MadrassaLogo size="sm" className="flex sm:hidden" />
            <MadrassaLogo size="md" className="hidden sm:flex" />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="px-2.5 py-1.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {language === "ar" ? "EN" : "عربي"}
            </button>
            {!isLogin && (
              <Link href="/auth/login" className="text-sm font-semibold text-gray-600 hover:text-gray-900">
                {language === "ar" ? "تسجيل الدخول" : "Log in"}
              </Link>
            )}
            {!isSignup && (
              <Link
                href="/auth/signup"
                className="px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white bg-[#007229] rounded-full hover:bg-[#005C22] transition-all shadow-lg shadow-[#007229]/30"
              >
                {language === "ar" ? "ابدأ الآن" : "Get Started"}
              </Link>
            )}
          </div>
        </div>
      </nav>
      <div className="pt-14 sm:pt-16">
        {children}
      </div>
    </>
  );
}
