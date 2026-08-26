import type { Metadata, Viewport } from "next";
import { Inter, Cairo, Fredoka } from "next/font/google";
import "./globals.css";
import { LanguageWrapper } from "@/components/LanguageWrapper";
import { getSiteUrl } from "@/lib/site-url";
import { Toaster } from "sonner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
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
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#007229",
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "مدرسة آمال | Amal School",
  description: "AI-powered online learning platform providing educational continuity for Sudanese children affected by conflict. Access quality education anywhere, anytime.",
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
    title: "مدرسة آمال | Amal School",
    description: "Quality education for every Sudanese child, anywhere in the world.",
    type: "website",
    siteName: "Amal School",
    locale: "ar_SD",
  },
  twitter: {
    card: "summary_large_image",
    title: "مدرسة آمال | Amal School",
    description: "Quality education for every Sudanese child, anywhere in the world.",
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
    url: getSiteUrl(),
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

  // Default to Arabic (RTL) - client-side will update based on user preference
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${inter.variable} ${cairo.variable} ${fredoka.variable} font-cairo antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
        />
        <LanguageWrapper>
          {children}
        </LanguageWrapper>
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
