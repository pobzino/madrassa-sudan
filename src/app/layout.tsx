import type { Metadata, Viewport } from "next";
import { Inter, Cairo, Fredoka } from "next/font/google";
import "./globals.css";
import { LanguageWrapper } from "@/components/LanguageWrapper";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { Toaster } from "sonner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { LEGAL_ENTITY } from "@/lib/legal-entity";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#007229",
};

export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalSiteUrl()),
  title: "Amal School | مدرسة آمال",
  description: "Amal School is a free learning platform for Sudanese children, with interactive online lessons and curriculum-aligned practice in English and Arabic.",
  keywords: ["Sudan", "education", "online learning", "AI tutor", "refugee education", "Arabic", "children"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amal School",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Amal School | مدرسة آمال",
    description: "Free interactive online lessons and curriculum-aligned practice for Sudanese children.",
    type: "website",
    siteName: "Amal School",
    locale: "en_GB",
    alternateLocale: ["ar_SD"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Amal School | مدرسة آمال",
    description: "Free interactive online lessons and curriculum-aligned practice for Sudanese children.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organisationJsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: LEGAL_ENTITY.brandName,
    legalName: LEGAL_ENTITY.registeredName,
    url: getCanonicalSiteUrl(),
    identifier: {
      "@type": "PropertyValue",
      propertyID: "Companies House company number",
      value: LEGAL_ENTITY.companyNumber,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: "3 Pinedene Carlton Grove",
      addressLocality: "London",
      postalCode: "SE15 2UL",
      addressCountry: "GB",
    },
    sameAs: [LEGAL_ENTITY.companiesHouseUrl],
  };

  // Default to English for first-time visitors and crawlers; saved preferences hydrate client-side.
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${inter.variable} ${cairo.variable} ${fredoka.variable} font-cairo antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
        />
        <LanguageWrapper>
          {children}
        </LanguageWrapper>
        <AnalyticsTracker />
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
