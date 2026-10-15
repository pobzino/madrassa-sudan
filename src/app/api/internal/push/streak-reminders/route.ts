import { NextRequest, NextResponse } from "next/server";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { runStreakReminders } from "@/lib/server/push-automations";

export const maxDuration = 300;

// Called every afternoon by netlify/functions/push-streak-reminders.ts.
// ?dryRun=1 reports who would get a reminder without sending anything.
export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, process.env.EMAIL_AUTOMATION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runStreakReminders({ dryRun: request.nextUrl.searchParams.get("dryRun") === "1" });
    return NextResponse.json(report);
  } catch (error) {
    console.error("Streak reminders failed:", error);
    return NextResponse.json({ error: "Streak reminders failed" }, { status: 500 });
  }
}
