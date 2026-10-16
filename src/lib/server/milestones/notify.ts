import "server-only";

import { learnerDisplayName } from "@/lib/learners/types";
import { BOSS_NAMES, milestoneBlockWeeks } from "@/lib/milestones/rules";
import type { EmailLanguage } from "@/lib/email/render";
import { sendEmails } from "@/lib/email/send";
import { milestonePassedEmail } from "@/lib/email/templates";
import { milestonePassedMessage, type PushMessage } from "@/lib/push-messages";
import { isDeliverableAmalEmail } from "@/lib/resend-contacts";
import { languageOf, testRecipients } from "@/lib/server/email-automations";
import { sendPushToUsers } from "@/lib/server/push";
import { CERTIFICATE_COLUMNS, type CertificateRow } from "@/lib/server/milestones/certificates";
import { isBossKey, type MilestoneAdminClient } from "@/lib/server/milestones/load";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const KIND = "milestone_passed";

type LearnerRow = {
  id: string;
  full_name: string | null;
  learner_name: string | null;
  parent_account_id: string | null;
  auth_user_id: string | null;
};

type RecipientRow = { id: string; full_name: string | null; preferred_language: string | null };

export type MilestoneNotifyReport = {
  status: "sent" | "skipped";
  reason?: string;
  recipients: number;
  pushUsers: number;
  emailsSent: number;
  emailsFailed: number;
  testMode: boolean;
};

function weeksLabel(language: EmailLanguage, afterWeekNumber: number) {
  const weeks = milestoneBlockWeeks(afterWeekNumber);
  const format = (value: number) => new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-GB").format(value);
  const range = `${format(weeks[0])}–${format(weeks[weeks.length - 1])}`;
  return language === "ar" ? `الأسابيع ${range}` : `weeks ${range}`;
}

/**
 * Tell the family a child passed a Big Challenge: one push and one email per
 * recipient (the owning account plus approved guardians), each in their own
 * language. Push and email are claimed in push_log / email_log first, so a
 * retry or a second call never sends twice. Runs after the answer response.
 */
export async function notifyMilestonePassed(admin: MilestoneAdminClient, certificateId: string): Promise<MilestoneNotifyReport> {
  const report: MilestoneNotifyReport = {
    status: "skipped",
    recipients: 0,
    pushUsers: 0,
    emailsSent: 0,
    emailsFailed: 0,
    testMode: false,
  };
  const periodKey = `cert:${certificateId}`;

  const { data: certificate } = await admin
    .from("learner_certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("id", certificateId)
    .maybeSingle<CertificateRow>();
  if (!certificate) return { ...report, reason: "certificate_not_found" };
  if (certificate.parent_notified_at) return { ...report, reason: "already_notified" };

  const { data: learner } = await admin
    .from("profiles")
    .select("id, full_name, learner_name, parent_account_id, auth_user_id")
    .eq("id", certificate.learner_id)
    .maybeSingle<LearnerRow>();
  if (!learner) return { ...report, reason: "learner_not_found" };

  const owner = learner.parent_account_id ?? (learner.auth_user_id === learner.id ? learner.id : null);
  const { data: guardians } = await admin
    .from("guardian_students")
    .select("guardian_id")
    .eq("student_id", learner.id)
    .eq("is_approved", true)
    .returns<Array<{ guardian_id: string }>>();
  const recipientIds = [...new Set([owner, ...(guardians ?? []).map((row) => row.guardian_id)].filter((id): id is string => Boolean(id)))];
  if (!recipientIds.length) return { ...report, reason: "no_recipients" };

  const [{ data: recipients }, { data: subject }] = await Promise.all([
    admin.from("profiles").select("id, full_name, preferred_language").in("id", recipientIds).returns<RecipientRow[]>(),
    certificate.subject_id
      ? admin.from("subjects").select("name_ar, name_en").eq("id", certificate.subject_id).maybeSingle<{ name_ar: string | null; name_en: string | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const recipientById = new Map((recipients ?? []).map((row) => [row.id, row]));
  report.recipients = recipientIds.length;

  const childName = learnerDisplayName(learner);
  const bossKey = isBossKey(certificate.boss_key) ? certificate.boss_key : "puzzle_owlet";
  const stars = (Math.min(3, Math.max(1, Number(certificate.stars))) as 1 | 2 | 3);
  const copyFor = (language: EmailLanguage) => ({
    childName,
    subjectName:
      (language === "ar" ? subject?.name_ar || subject?.name_en : subject?.name_en || subject?.name_ar) ||
      (language === "ar" ? "المادة" : "their subject"),
    weeksLabel: weeksLabel(language, certificate.after_week_number),
    bossName: BOSS_NAMES[bossKey][language],
  });
  const languageFor = (userId: string) => languageOf(recipientById.get(userId)?.preferred_language);

  // Push: claim (user, kind, cert) once, then send to every claimed user's devices.
  try {
    const { data: claimedRows, error: claimError } = await admin
      .from("push_log")
      .upsert(
        recipientIds.map((userId) => ({ user_id: userId, kind: KIND, period_key: periodKey })),
        { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
      )
      .select("user_id");
    if (claimError) throw new Error(claimError.message);
    const messages = new Map<string, PushMessage>();
    for (const row of (claimedRows ?? []) as Array<{ user_id: string }>) {
      const language = languageFor(row.user_id);
      messages.set(row.user_id, milestonePassedMessage(language, { ...copyFor(language), certificateId }));
    }
    if (messages.size) report.pushUsers = (await sendPushToUsers(admin, messages)).users;
  } catch (error) {
    console.error("Milestone push failed:", error);
  }

  // Email: transactional, so it ignores email_updates_opt_in (like the welcome email).
  try {
    const redirectTo = await testRecipients(admin);
    report.testMode = redirectTo.length > 0;
    const siteUrl = getCanonicalSiteUrl();
    const certificateUrl = `${siteUrl}/certificates/${certificateId}`;
    for (const userId of recipientIds) {
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      const authUser = authData?.user;
      const address = authUser?.email;
      if (!authUser || !(authUser.email_confirmed_at || authUser.confirmed_at) || !isDeliverableAmalEmail(address)) continue;

      const language = languageFor(userId);
      const rendered = milestonePassedEmail({
        language,
        name: recipientById.get(userId)?.full_name ?? null,
        siteUrl,
        ...copyFor(language),
        stars,
        certificateUrl,
      });
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

      const outcome = await sendEmails([email], `${KIND}:${certificateId}:${userId}`);
      if (outcome.status === "sent") {
        report.emailsSent += 1;
        if (outcome.ids[0]) {
          await admin.from("email_log").update({ resend_id: outcome.ids[0] })
            .eq("user_id", userId).eq("kind", KIND).eq("period_key", periodKey);
        }
      } else {
        report.emailsFailed += 1;
        // Release the claim so a later retry can send it.
        await admin.from("email_log").delete().eq("user_id", userId).eq("kind", KIND).eq("period_key", periodKey);
        if (outcome.status === "failed") console.error("Milestone email failed:", outcome.error);
      }
    }
  } catch (error) {
    console.error("Milestone email failed:", error);
  }

  await admin
    .from("learner_certificates")
    .update({ parent_notified_at: new Date().toISOString() })
    .eq("id", certificateId)
    .is("parent_notified_at", null);
  return { ...report, status: "sent" };
}
