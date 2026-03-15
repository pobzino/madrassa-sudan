import type { Metadata } from "next";
import { Inter, Cairo, Fredoka } from "next/font/google";
import "./globals.css";
import { LanguageWrapper } from "@/components/LanguageWrapper";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://amalmadrassa.netlify.app"),
  title: "أمل مدرسة | Amal Madrassa",
  description: "AI-powered online learning platform providing educational continuity for Sudanese children affected by conflict. Access quality education anywhere, anytime.",
  keywords: ["Sudan", "education", "online learning", "AI tutor", "refugee education", "Arabic", "children"],
  openGraph: {
    title: "أمل مدرسة | Amal Madrassa",
    description: "Quality education for every Sudanese child, anywhere in the world.",
    type: "website",
    siteName: "Amal Madrassa",
    locale: "ar_SD",
  },
  twitter: {
    card: "summary_large_image",
    title: "أمل مدرسة | Amal Madrassa",
    description: "Quality education for every Sudanese child, anywhere in the world.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Default to Arabic (RTL) - client-side will update based on user preference
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${inter.variable} ${cairo.variable} ${fredoka.variable} font-cairo antialiased`}>
        <LanguageWrapper>{children}</LanguageWrapper>
      </body>
    </html>
  );
}
