import { NextRequest, NextResponse } from "next/server";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { runVolunteerImpactEmails } from "@/lib/server/email-automations";

export const maxDuration = 300;

// Called on the 1st of each month by netlify/functions/email-volunteer-impact.ts.
// ?dryRun=1 reports who would get what without sending anything.
export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, process.env.EMAIL_AUTOMATION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runVolunteerImpactEmails({ dryRun: request.nextUrl.searchParams.get("dryRun") === "1" });
    return NextResponse.json(report, { status: report.status === "failed" ? 502 : 200 });
  } catch (error) {
    console.error("Volunteer impact emails failed:", error);
    return NextResponse.json({ error: "Volunteer impact emails failed" }, { status: 500 });
  }
}
