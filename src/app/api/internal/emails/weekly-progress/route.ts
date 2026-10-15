import { NextRequest, NextResponse } from "next/server";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { runWeeklyProgressEmails } from "@/lib/server/email-automations";

export const maxDuration = 300;

// Called every Sunday by netlify/functions/email-weekly-progress.ts.
// ?dryRun=1 reports who would get what without sending anything.
export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, process.env.EMAIL_AUTOMATION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runWeeklyProgressEmails({ dryRun: request.nextUrl.searchParams.get("dryRun") === "1" });
    return NextResponse.json(report, { status: report.status === "failed" ? 502 : 200 });
  } catch (error) {
    console.error("Weekly progress emails failed:", error);
    return NextResponse.json({ error: "Weekly progress emails failed" }, { status: 500 });
  }
}
