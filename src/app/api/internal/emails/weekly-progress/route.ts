import { NextRequest, NextResponse } from "next/server";
import { previousWeek } from "@/lib/email/digest";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { loadWeeklyFamilies, runWeeklyProgressEmails } from "@/lib/server/email-automations";
import { runWeeklySummaryPushes } from "@/lib/server/push-automations";

export const maxDuration = 300;

// Called every Sunday by netlify/functions/email-weekly-progress.ts: the weekly
// summary by email and, for families with reminders on, by push.
// ?dryRun=1 reports who would get what without sending anything.
export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, process.env.EMAIL_AUTOMATION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    const families = await loadWeeklyFamilies(previousWeek(now));
    const email = await runWeeklyProgressEmails({ now, dryRun, families });
    const push = await runWeeklySummaryPushes({ now, dryRun, families }).catch((error) => {
      console.error("Weekly summary pushes failed:", error);
      return { status: "failed" as const };
    });
    return NextResponse.json({ email, push }, { status: email.status === "failed" ? 502 : 200 });
  } catch (error) {
    console.error("Weekly progress emails failed:", error);
    return NextResponse.json({ error: "Weekly progress emails failed" }, { status: 500 });
  }
}
