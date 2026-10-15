import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { previousWeek } from "@/lib/email/digest";
import { hadActivity } from "@/lib/email/templates";
import { streakReminderMessage, weeklySummaryMessage, type PushMessage } from "@/lib/push-messages";
import { languageOf, loadWeeklyFamilies, type WeeklyFamily } from "@/lib/server/email-automations";
import { claimPushes, pushConfigured, sendPushToUsers, usersWithPush } from "@/lib/server/push";
import { createServiceClient } from "@/lib/supabase/service";

// Push reminders go only to parent accounts that turned them on. Turning
// them on is the consent, so they don't depend on the email-updates box.

// The push tables aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>;

const DAY = 24 * 60 * 60 * 1000;

export type PushRunReport = {
  kind: "weekly_summary" | "streak_reminder";
  period: string;
  status: "sent" | "dry-run" | "disabled";
  /** Accounts with reminders on. */
  subscribers: number;
  /** Of those, how many get a notification this run. */
  eligible: number;
  /** How many got it on at least one device. */
  reached: number;
  devices: number;
  failed: number;
  /** Devices dropped because notifications were turned off there. */
  removed: number;
};

function emptyReport(kind: PushRunReport["kind"], period: string): PushRunReport {
  return { kind, period, status: "sent", subscribers: 0, eligible: 0, reached: 0, devices: 0, failed: 0, removed: 0 };
}

async function deliver(db: UntypedClient, report: PushRunReport, messages: Map<string, PushMessage>, dryRun: boolean) {
  report.eligible = messages.size;
  if (dryRun) return { ...report, status: "dry-run" as const };
  const claimed = await claimPushes(db, report.kind, report.period, [...messages.keys()]);
  for (const userId of [...messages.keys()]) if (!claimed.has(userId)) messages.delete(userId);
  const result = await sendPushToUsers(db, messages);
  return { ...report, reached: result.users, devices: result.devices, failed: result.failed, removed: result.removed };
}

/** Sunday: the week's summary, or a nudge for families who learned recently but not this week. */
export async function runWeeklySummaryPushes({
  now = new Date(),
  dryRun = false,
  families,
}: { now?: Date; dryRun?: boolean; families?: WeeklyFamily[] } = {}): Promise<PushRunReport> {
  const window = previousWeek(now);
  const report = emptyReport("weekly_summary", window.key);
  if (!dryRun && !pushConfigured()) return { ...report, status: "disabled" };

  const db = createServiceClient() as unknown as UntypedClient;
  const subscribers = await usersWithPush(db);
  report.subscribers = subscribers.size;
  if (!subscribers.size) return { ...report, status: dryRun ? "dry-run" : "sent" };

  const messages = new Map<string, PushMessage>();
  for (const family of families ?? (await loadWeeklyFamilies(window))) {
    if (!subscribers.has(family.id)) continue;
    if (!hadActivity(family.summary) && !family.learnedBefore) continue;
    messages.set(family.id, weeklySummaryMessage(languageOf(family.preferred_language), family.summary));
  }
  return deliver(db, report, messages, dryRun);
}

/** Late afternoon: families who learned yesterday but not yet today, before the streak breaks. */
export async function runStreakReminders({ now = new Date(), dryRun = false } = {}): Promise<PushRunReport> {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  const report = emptyReport("streak_reminder", `day:${today}`);
  if (!dryRun && !pushConfigured()) return { ...report, status: "disabled" };

  const client = createServiceClient();
  const db = client as unknown as UntypedClient;
  const subscribers = [...(await usersWithPush(db))];
  report.subscribers = subscribers.length;

  const messages = new Map<string, PushMessage>();
  for (let i = 0; i < subscribers.length; i += 100) {
    const ids = subscribers.slice(i, i + 100);
    const [{ data: streaks, error: streakError }, { data: profiles, error: profileError }] = await Promise.all([
      client
        .from("student_streaks")
        .select("student_id, current_streak_days")
        .in("student_id", ids)
        .eq("last_activity_date", yesterday)
        .gte("current_streak_days", 1),
      client.from("profiles").select("id, role, preferred_language").in("id", ids),
    ]);
    if (streakError) throw new Error(streakError.message);
    if (profileError) throw new Error(profileError.message);
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    for (const streak of streaks ?? []) {
      const profile = profileById.get(streak.student_id);
      if (profile?.role !== "parent") continue;
      messages.set(streak.student_id, streakReminderMessage(languageOf(profile.preferred_language), streak.current_streak_days));
    }
  }
  return deliver(db, report, messages, dryRun);
}
