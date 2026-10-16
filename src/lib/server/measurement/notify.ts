import "server-only";

import { learnerDisplayName } from "@/lib/learners/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import type { EmailLanguage } from "@/lib/email/render";
import { sendEmails } from "@/lib/email/send";
import { placementDoneEmail } from "@/lib/email/templates";
import { placementDoneMessage, type PushMessage } from "@/lib/push-messages";
import { isDeliverableAmalEmail } from "@/lib/resend-contacts";
import { languageOf, testRecipients } from "@/lib/server/email-automations";
import { sendPushToUsers } from "@/lib/server/push";
import { isBossKey, type MilestoneAdminClient } from "@/lib/server/milestones/load";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const KIND = "placement_done";

type LearnerRow = {
  id: string;
  full_name: string | null;
  learner_name: string | null;
  parent_account_id: string | null;
  auth_user_id: string | null;
};
type RecipientRow = { id: string; full_name: string | null; preferred_language: string | null; email_updates_opt_in?: boolean | null };

export type PlacementNotifyReport = {
  status: "sent" | "skipped";
  reason?: string;
  recipients: number;
  pushUsers: number;
  emailsSent: number;
  emailsFailed: number;
  testMode: boolean;
};

/** One note per child per placement, even after a staff re-placement. */
export function placementPeriodKey(learnerId: string, milestoneId: string) {
  return `placement:${learnerId}:${milestoneId}`;
}

/**
 * Tell the family their child met the starting boss (no scores): push to every
 * subscribed recipient (the owning account plus approved guardians), email only
 * to recipients who opted in to email updates and did not stop the weekly
 * summary. Claimed in push_log / email_log first, so it is sent once. Runs
 * after the answer response.
 */
export async function notifyPlacementDone(admin: MilestoneAdminClient, battleId: string): Promise<PlacementNotifyReport> {
  const report: PlacementNotifyReport = { status: "skipped", recipients: 0, pushUsers: 0, emailsSent: 0, emailsFailed: 0, testMode: false };

  const { data: battle } = await admin
    .from("milestone_battles")
    .select("id, learner_id, milestone_id, status, kind, is_preview")
    .eq("id", battleId)
    .maybeSingle<{ id: string; learner_id: string; milestone_id: string; status: string; kind: string | null; is_preview: boolean }>();
  if (!battle || battle.kind !== "placement" || battle.status !== "completed") return { ...report, reason: "battle_not_completed" };
  if (battle.is_preview) return { ...report, reason: "preview" };

  const [{ data: learner }, { data: milestone }] = await Promise.all([
    admin.from("profiles").select("id, full_name, learner_name, parent_account_id, auth_user_id").eq("id", battle.learner_id).maybeSingle<LearnerRow>(),
    admin.from("learning_path_milestones").select("id, path_id, boss_key").eq("id", battle.milestone_id).maybeSingle<{ id: string; path_id: string; boss_key: string }>(),
  ]);
  if (!learner) return { ...report, reason: "learner_not_found" };
  if (!milestone) return { ...report, reason: "milestone_not_found" };
  const periodKey = placementPeriodKey(learner.id, milestone.id);

  const owner = learner.parent_account_id ?? (learner.auth_user_id === learner.id ? learner.id : null);
  const [{ data: guardians }, { data: path }] = await Promise.all([
    admin.from("guardian_students").select("guardian_id").eq("student_id", learner.id).eq("is_approved", true).returns<Array<{ guardian_id: string }>>(),
    admin.from("learning_paths").select("subject_id").eq("id", milestone.path_id).maybeSingle<{ subject_id: string }>(),
  ]);
  const recipientIds = [...new Set([owner, ...(guardians ?? []).map((row) => row.guardian_id)].filter((id): id is string => Boolean(id)))];
  if (!recipientIds.length) return { ...report, reason: "no_recipients" };

  const [{ data: recipients }, { data: subject }, { data: suppressedRows }] = await Promise.all([
    admin.from("profiles").select("id, full_name, preferred_language, email_updates_opt_in").in("id", recipientIds).returns<RecipientRow[]>(),
    path?.subject_id
      ? admin.from("subjects").select("name_ar, name_en").eq("id", path.subject_id).maybeSingle<{ name_ar: string | null; name_en: string | null }>()
      : Promise.resolve({ data: null }),
    admin.from("email_suppressions").select("user_id").eq("kind", "weekly_progress").in("user_id", recipientIds).returns<Array<{ user_id: string }>>(),
  ]);
  const recipientById = new Map((recipients ?? []).map((row) => [row.id, row]));
  const suppressed = new Set((suppressedRows ?? []).map((row) => row.user_id));
  report.recipients = recipientIds.length;

  const childName = learnerDisplayName(learner);
  const bossKey = isBossKey(milestone.boss_key) ? milestone.boss_key : "puzzle_owlet";
  const copyFor = (language: EmailLanguage) => ({
    childName,
    bossName: BOSS_NAMES[bossKey][language],
    subjectName:
      (language === "ar" ? subject?.name_ar || subject?.name_en : subject?.name_en || subject?.name_ar) ||
      (language === "ar" ? "المادة" : "their subject"),
  });
  const languageFor = (userId: string) => languageOf(recipientById.get(userId)?.preferred_language);

  // Push: to every subscribed recipient, claimed once.
  try {
    const { data: claimedRows, error: claimError } = await admin
      .from("push_log")
      .upsert(recipientIds.map((userId) => ({ user_id: userId, kind: KIND, period_key: periodKey })), {
        onConflict: "user_id,kind,period_key",
        ignoreDuplicates: true,
      })
      .select("user_id");
    if (claimError) throw new Error(claimError.message);
    const messages = new Map<string, PushMessage>();
    for (const row of (claimedRows ?? []) as Array<{ user_id: string }>) {
      const language = languageFor(row.user_id);
      messages.set(row.user_id, placementDoneMessage(language, copyFor(language)));
    }
    if (messages.size) report.pushUsers = (await sendPushToUsers(admin, messages)).users;
  } catch (error) {
    console.error("Placement push failed:", error);
  }

  // Email: only families who said yes to email updates (and did not stop the weekly summary).
  try {
    const redirectTo = await testRecipients(admin);
    report.testMode = redirectTo.length > 0;
    const siteUrl = getCanonicalSiteUrl();
    for (const userId of recipientIds) {
      const recipient = recipientById.get(userId);
      if (recipient?.email_updates_opt_in !== true || suppressed.has(userId)) continue;
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      const authUser = authData?.user;
      const address = authUser?.email;
      if (!authUser || !(authUser.email_confirmed_at || authUser.confirmed_at) || !isDeliverableAmalEmail(address)) continue;

      const language = languageFor(userId);
      const rendered = placementDoneEmail({ language, name: recipient?.full_name ?? null, siteUrl, ...copyFor(language) });
      const email = { to: address!.trim().toLowerCase(), ...rendered, tag: KIND };

      if (report.testMode) {
        // Test mode: samples go to the test inboxes and nothing is recorded.
        for (const to of redirectTo) {
          const outcome = await sendEmails([{ ...email, to, subject: `[Test, for ${email.to}] ${email.subject}` }]);
          if (outcome.status === "sent") report.emailsSent += 1;
          else report.emailsFailed += 1;
        }
        continue;
      }

      const { data: claimed, error: claimError } = await admin
        .from("email_log")
        .upsert([{ user_id: userId, kind: KIND, period_key: periodKey }], { onConflict: "user_id,kind,period_key", ignoreDuplicates: true })
        .select("user_id");
      if (claimError) throw new Error(claimError.message);
      if (!claimed?.length) continue;

      const outcome = await sendEmails([email], `${KIND}:${learner.id}:${milestone.id}:${userId}`);
      if (outcome.status === "sent") {
        report.emailsSent += 1;
        if (outcome.ids[0]) {
          await admin.from("email_log").update({ resend_id: outcome.ids[0] }).eq("user_id", userId).eq("kind", KIND).eq("period_key", periodKey);
        }
      } else {
        report.emailsFailed += 1;
        await admin.from("email_log").delete().eq("user_id", userId).eq("kind", KIND).eq("period_key", periodKey);
        if (outcome.status === "failed") console.error("Placement email failed:", outcome.error);
      }
    }
  } catch (error) {
    console.error("Placement email failed:", error);
  }
  return { ...report, status: "sent" };
}
