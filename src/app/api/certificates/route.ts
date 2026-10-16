// GET /api/certificates — the active learner's Big Challenge certificates.

import type { CertificateListResponse } from "@/lib/milestones/types";
import { CERTIFICATE_COLUMNS, certificateViews, type CertificateRow } from "@/lib/server/milestones/certificates";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { milestoneError, milestoneJson } from "@/lib/server/milestones/load";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin } = opened.value;

  const { data, error } = await admin
    .from("learner_certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("learner_id", context.learnerId)
    .order("awarded_at", { ascending: false })
    .returns<CertificateRow[]>();
  if (error) {
    console.error("Certificate list failed:", error);
    return milestoneError("service_unavailable", 500);
  }
  const body: CertificateListResponse = { certificates: await certificateViews(admin, data ?? []) };
  return milestoneJson(body);
}
