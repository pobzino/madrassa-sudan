"use client";

// A Big Challenge certificate. Fetched with plain fetch (no learner header):
// the server authorises it by account ownership.
import { useParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import CertificateCard from "@/components/milestones/CertificateCard";

const plainFetch = (input: string, init?: RequestInit) => fetch(input, init);

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  return <CertificateCard certificateId={id} lang={language} fetcher={plainFetch} />;
}
