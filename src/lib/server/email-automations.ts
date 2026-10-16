import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  monthLabel,
  previousMonth,
  previousWeek,
  summariseImpact,
  summariseWeek,
  weekLabel,
  type LessonActivity,
  type PeriodWindow,
  type PracticeAttempt,
  type ProgressActivity,
  type StreakState,
} from "@/lib/email/digest";
import type { ChildWeeklySummary } from "@/lib/email/templates";
import type { EmailLanguage } from "@/lib/email/render";
import { emailAutomationConfig, RESEND_BATCH_LIMIT, sendEmails, type OutgoingEmail } from "@/lib/email/send";
import {
  hadActivity,
  type WeeklySummary,
  volunteerImpactEmail,
  weeklyProgressEmail,
  welcomeParentEmail,
  welcomeTeacherEmail,
} from "@/lib/email/templates";
import { unsubscribeUrl, type UnsubscribableKind } from "@/lib/email/unsubscribe";
import { PARENT_WHATSAPP_GROUP_URL } from "@/lib/parent-community";
import { isDeliverableAmalEmail } from "@/lib/resend-contacts";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

type EmailKind = "welcome" | UnsubscribableKind;

// The email tables aren't in the generated types yet, so they're reached
// through an untyped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>;

const PAGE = 1000;
const ID_CHUNK = 100;
const DAY = 24 * 60 * 60 * 1000;
// Families who stop learning get the "we missed you" version for four weeks, then nothing.
const NUDGE_FOR_DAYS = 28;
// The auth callback also runs for password resets, so only new parents get a welcome.
const WELCOME_WITHIN_DAYS = 14;
// In test mode (EMAIL_TEST_RECIPIENT set), a run sends a few samples and records nothing.
const TEST_RECIPIENT_LIMIT = 3;

export type RunReport = {
  kind: EmailKind;
  period: string;
  status: "sent" | "dry-run" | "disabled" | "not-configured" | "failed";
  /** Accounts of the right role. */
  candidates: number;
  /** Of those, how many get an email this run. */
  eligible: number;
  sent: number;
  failed: number;
  breakdown: Record<string, number>;
  error?: string;
};

type Prepared = { userId: string; email: OutgoingEmail };

type AssignmentRules = { passing_score: number | null; total_points: number | null };

export function languageOf(value: string | null | undefined): EmailLanguage {
  return value === "en" ? "en" : "ar";
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

/** Confirmed, real inboxes by user id. WhatsApp-only parents have no inbox. */
async function deliverableEmails(client: ReturnType<typeof createServiceClient>) {
  const emails = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      if ((user.email_confirmed_at || user.confirmed_at) && isDeliverableAmalEmail(user.email)) {
        emails.set(user.id, user.email!.trim().toLowerCase());
      }
    }
    if (data.users.length < PAGE) return emails;
  }
}

async function userIdsIn(db: UntypedClient, table: "email_suppressions" | "email_log", kind: EmailKind, periodKey?: string) {
  const rows = await fetchAll<{ user_id: string }>((from, to) => {
    let query = db.from(table).select("user_id").eq("kind", kind);
    if (periodKey) query = query.eq("period_key", periodKey);
    return query.order("user_id").range(from, to);
  });
  return new Set(rows.map((row) => row.user_id));
}

/** Test-mode inboxes from EMAIL_TEST_RECIPIENT, with "admins" swapped for every approved admin. */
export async function testRecipients(db: UntypedClient) {
  const listed = emailAutomationConfig().testRecipients;
  if (!listed.includes("admins")) return listed;
  const { data: admins, error } = await db.from("profiles").select("id").eq("role", "admin").eq("is_approved", true);
  if (error) throw new Error(error.message);
  const adminEmails = await Promise.all(
    (admins ?? []).map(async ({ id }: { id: string }) => (await db.auth.admin.getUserById(id)).data.user?.email ?? null),
  );
  const inboxes = [...listed.filter((value) => value !== "admins"), ...adminEmails.filter(isDeliverableAmalEmail)];
  return [...new Set(inboxes.map((email) => email!.toLowerCase()))];
}

/**
 * Claims each person in the email log before sending, so overlapping runs or
 * retries never send twice, and releases the claim if Resend refuses the batch.
 */
async function deliver(db: UntypedClient, kind: EmailKind, periodKey: string, prepared: Prepared[]) {
  const redirectTo = await testRecipients(db);
  const testMode = redirectTo.length > 0;
  // One email per test inbox, so recipients don't see each other's addresses.
  const queue = testMode
    ? prepared.slice(0, TEST_RECIPIENT_LIMIT).flatMap((item) =>
        redirectTo.map((to) => ({
          ...item,
          email: { ...item.email, to, subject: `[Test, for ${item.email.to}] ${item.email.subject}` },
        })),
      )
    : prepared;
  let sent = 0;
  let failed = 0;
  let error: string | undefined;

  for (let batch of chunk(queue, RESEND_BATCH_LIMIT)) {
    if (!testMode) {
      const { data, error: claimError } = await db
        .from("email_log")
        .upsert(
          batch.map((item) => ({ user_id: item.userId, kind, period_key: periodKey })),
          { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
        )
        .select("user_id");
      if (claimError) throw new Error(claimError.message);
      const claimed = new Set((data ?? []).map((row: { user_id: string }) => row.user_id));
      batch = batch.filter((item) => claimed.has(item.userId));
    }
    if (!batch.length) continue;

    const outcome = await sendEmails(batch.map((item) => item.email));
    if (outcome.status === "sent") {
      sent += batch.length;
      if (!testMode && batch.length === 1 && outcome.ids[0]) {
        await db.from("email_log").update({ resend_id: outcome.ids[0] }).eq("user_id", batch[0].userId).eq("kind", kind).eq("period_key", periodKey);
      }
      continue;
    }
    failed += batch.length;
    error = outcome.status === "failed" ? outcome.error : outcome.reason;
    if (!testMode) {
      await db.from("email_log").delete().eq("kind", kind).eq("period_key", periodKey).in("user_id", batch.map((item) => item.userId));
    }
    if (outcome.status === "skipped") break;
  }
  return { sent, failed, error };
}

/** Why a run can't go ahead, or null when it can. A dry run only needs the secret. */
function blockedReason(dryRun: boolean): RunReport["status"] | null {
  const config = emailAutomationConfig();
  if (!process.env.EMAIL_AUTOMATION_SECRET?.trim()) return "not-configured";
  if (dryRun) return null;
  if (!config.enabled) return "disabled";
  if (!config.apiKey || !config.from) return "not-configured";
  return null;
}

async function finish(
  report: RunReport,
  db: UntypedClient,
  prepared: Prepared[],
  dryRun: boolean,
): Promise<RunReport> {
  report.eligible = prepared.length;
  if (dryRun) return { ...report, status: "dry-run" };
  const result = await deliver(db, report.kind, report.period, prepared);
  return {
    ...report,
    sent: result.sent,
    failed: result.failed,
    status: result.failed && !result.sent ? "failed" : "sent",
    ...(result.error ? { error: result.error } : {}),
  };
}

/** Sends the welcome email once: parents when they confirm their email, teachers when approved. */
export async function sendWelcomeEmail(userId: string) {
  const config = emailAutomationConfig();
  if (!config.enabled || !config.apiKey || !config.from) return "skipped" as const;

  const client = createServiceClient();
  const { data: profile } = await client
    .from("profiles")
    .select("role, full_name, preferred_language, is_approved")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !(profile.role === "parent" || (profile.role === "teacher" && profile.is_approved))) return "skipped" as const;

  const { data: authData } = await client.auth.admin.getUserById(userId);
  const authUser = authData?.user;
  const address = authUser?.email;
  if (!authUser || !address || !isDeliverableAmalEmail(address)) return "skipped" as const;
  const accountAge = Date.now() - Date.parse(authUser.created_at);
  if (profile.role === "parent" && accountAge > WELCOME_WITHIN_DAYS * DAY) return "skipped" as const;

  const siteUrl = getCanonicalSiteUrl();
  const language = languageOf(profile.preferred_language);
  const rendered =
    profile.role === "parent"
      ? welcomeParentEmail({ language, name: profile.full_name, siteUrl, whatsappGroupUrl: PARENT_WHATSAPP_GROUP_URL })
      : welcomeTeacherEmail({ language, name: profile.full_name, siteUrl });

  const result = await deliver(client as unknown as UntypedClient, "welcome", "once", [
    { userId, email: { to: address, ...rendered, tag: "welcome" } },
  ]);
  if (result.error) console.error("Welcome email failed:", result.error);
  return result.sent ? ("sent" as const) : result.failed ? ("failed" as const) : ("skipped" as const);
}

export type WeeklyFamily = {
  id: string;
  full_name: string | null;
  preferred_language: string | null;
  email_updates_opt_in: boolean;
  summary: WeeklySummary;
  childSummaries: ChildWeeklySummary[];
  /** Learned in the four weeks before this one, so a quiet week counts as lapsing. */
  learnedBefore: boolean;
};

/** Each parent account's week. Loaded once and shared by the Sunday email and push runs. */
export async function loadWeeklyFamilies(window: PeriodWindow): Promise<WeeklyFamily[]> {
  const client = createServiceClient();
  const db = client as unknown as UntypedClient;
  const parents = await fetchAll((from, to) =>
    client.from("profiles").select("id, full_name, preferred_language, email_updates_opt_in").eq("role", "parent").order("id").range(from, to),
  );
  const learnerProfiles = await fetchAll<{ id: string; parent_account_id: string | null; role: string; full_name: string | null; learner_name: string | null }>((from, to) =>
    db.from("profiles").select("id, parent_account_id, role, full_name, learner_name").order("id").range(from, to),
  );

  const nudgeFrom = new Date(window.start.getTime() - NUDGE_FOR_DAYS * DAY);
  const [progress, attempts, streaks] = await Promise.all([
    fetchAll<ProgressActivity & { id: string; student_id: string }>((from, to) =>
      client
        .from("lesson_progress")
        .select("id, student_id, created_at, updated_at, completed_at")
        .gte("updated_at", nudgeFrom.toISOString())
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      student_id: string;
      assignment_id: string;
      submitted_at: string;
      score: number | null;
      max_score: number | null;
      // One assignment per attempt; PostgREST sends an object, the untyped client expects a list.
      homework_assignments: AssignmentRules | AssignmentRules[];
    }>((from, to) =>
      db
        .from("homework_attempts")
        .select("id, student_id, assignment_id, submitted_at, score, max_score, homework_assignments!inner(passing_score, total_points, is_practice)")
        .eq("homework_assignments.is_practice", true)
        .gte("submitted_at", window.start.toISOString())
        .lt("submitted_at", window.end.toISOString())
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      client.from("student_streaks").select("id, student_id, current_streak_days, last_activity_date").order("id").range(from, to),
    ),
  ]);

  const progressBy = groupBy(progress, (row) => row.student_id);
  const attemptsBy = groupBy(
    attempts.map((row): PracticeAttempt & { student_id: string } => {
      const rules = Array.isArray(row.homework_assignments) ? row.homework_assignments[0] : row.homework_assignments;
      return {
        student_id: row.student_id,
        assignment_id: row.assignment_id,
        submitted_at: row.submitted_at,
        score: row.score,
        max_score: row.max_score,
        passing_score: rules?.passing_score ?? null,
        total_points: rules?.total_points ?? null,
      };
    }),
    (row) => row.student_id,
  );
  const streakBy = new Map<string, StreakState>(streaks.map((row) => [row.student_id, row]));

  const ownerByLearner = new Map<string, string>();
  const learnerById = new Map(learnerProfiles.map((profile) => [profile.id, profile]));
  for (const profile of learnerProfiles) {
    if (profile.role === "parent") ownerByLearner.set(profile.id, profile.id);
    else if (profile.parent_account_id) ownerByLearner.set(profile.id, profile.parent_account_id);
  }

  const emptySummary = (): WeeklySummary => ({ lessonsStarted: 0, lessonsCompleted: 0, practiceTried: 0, practicePassed: 0, streakDays: 0, activeDays: Array(7).fill(false) });
  const addSummary = (target: WeeklySummary, value: WeeklySummary) => {
    target.lessonsStarted += value.lessonsStarted;
    target.lessonsCompleted += value.lessonsCompleted;
    target.practiceTried += value.practiceTried;
    target.practicePassed += value.practicePassed;
    target.streakDays = Math.max(target.streakDays, value.streakDays);
    target.activeDays = target.activeDays.map((active, index) => active || value.activeDays[index]);
  };
  const summaryForLearner = (id: string) => summariseWeek(
    window,
    progressBy.get(id) ?? [],
    attemptsBy.get(id) ?? [],
    streakBy.get(id) ?? null,
  );

  return parents.map((parent) => {
    const learnerIds = [...ownerByLearner.entries()].filter(([, ownerId]) => ownerId === parent.id).map(([learnerId]) => learnerId);
    const memberIds = learnerIds.includes(parent.id) ? learnerIds : [parent.id, ...learnerIds];
    const summary = emptySummary();
    const childSummaries: ChildWeeklySummary[] = [];
    let learnedBefore = false;
    for (const learnerId of memberIds) {
      addSummary(summary, summaryForLearner(learnerId));
      const rows = progressBy.get(learnerId) ?? [];
      learnedBefore ||= rows.some((row) => Date.parse(row.updated_at) < window.start.getTime());
      if (learnerId !== parent.id) {
        const profile = learnerById.get(learnerId);
        childSummaries.push({ name: profile?.learner_name?.trim() || profile?.full_name?.trim() || "Learner", summary: summaryForLearner(learnerId) });
      }
    }
    return {
      ...parent,
      summary,
      childSummaries,
      learnedBefore,
    };
  });
}

/** Sunday's summary of the past week for each family, or a nudge if they've lapsed recently. */
export async function runWeeklyProgressEmails({
  now = new Date(),
  dryRun = false,
  families,
}: { now?: Date; dryRun?: boolean; families?: WeeklyFamily[] } = {}): Promise<RunReport> {
  const window = previousWeek(now);
  const report: RunReport = { kind: "weekly_progress", period: window.key, status: "sent", candidates: 0, eligible: 0, sent: 0, failed: 0, breakdown: {} };
  const blocked = blockedReason(dryRun);
  if (blocked) return { ...report, status: blocked };

  const secret = process.env.EMAIL_AUTOMATION_SECRET!.trim();
  const client = createServiceClient();
  const db = client as unknown as UntypedClient;
  const siteUrl = getCanonicalSiteUrl();

  const [parents, emails, suppressed, done] = await Promise.all([
    families ?? loadWeeklyFamilies(window),
    deliverableEmails(client),
    userIdsIn(db, "email_suppressions", "weekly_progress"),
    userIdsIn(db, "email_log", "weekly_progress", window.key),
  ]);
  report.candidates = parents.length;

  const count = (key: string) => (report.breakdown[key] = (report.breakdown[key] ?? 0) + 1);
  const prepared: Prepared[] = [];
  for (const parent of parents) {
    const address = emails.get(parent.id);
    if (!address) {
      count("no_inbox");
      continue;
    }
    if (suppressed.has(parent.id)) {
      count("unsubscribed");
      continue;
    }
    if (done.has(parent.id)) {
      count("already_sent");
      continue;
    }

    const { summary } = parent;
    const active = hadActivity(summary);
    // The nudge encourages a return visit, so it only goes to families who said yes to email updates.
    if (!active && !(parent.learnedBefore && parent.email_updates_opt_in)) {
      count("quiet");
      continue;
    }
    count(active ? "summary" : "nudge");

    const language = languageOf(parent.preferred_language);
    const unsubscribe = unsubscribeUrl(siteUrl, secret, parent.id, "weekly_progress");
    const rendered = weeklyProgressEmail({
      language,
      name: parent.full_name,
      siteUrl,
      unsubscribeUrl: unsubscribe,
      summary,
      childSummaries: parent.childSummaries,
      weekLabel: weekLabel(window, language),
    });
    prepared.push({ userId: parent.id, email: { to: address, ...rendered, tag: "weekly_progress", unsubscribeUrl: unsubscribe } });
  }

  return finish(report, db, prepared, dryRun);
}

/** On the 1st, tell each volunteer teacher what their lessons did last month. */
export async function runVolunteerImpactEmails({ now = new Date(), dryRun = false } = {}): Promise<RunReport> {
  const window = previousMonth(now);
  const report: RunReport = { kind: "volunteer_impact", period: window.key, status: "sent", candidates: 0, eligible: 0, sent: 0, failed: 0, breakdown: {} };
  const blocked = blockedReason(dryRun);
  if (blocked) return { ...report, status: blocked };

  const secret = process.env.EMAIL_AUTOMATION_SECRET!.trim();
  const client = createServiceClient();
  const db = client as unknown as UntypedClient;
  const siteUrl = getCanonicalSiteUrl();

  const teachers = await fetchAll((from, to) =>
    client.from("profiles").select("id, full_name, preferred_language").eq("role", "teacher").eq("is_approved", true).order("id").range(from, to),
  );
  const [emails, suppressed, done] = await Promise.all([
    deliverableEmails(client),
    userIdsIn(db, "email_suppressions", "volunteer_impact"),
    userIdsIn(db, "email_log", "volunteer_impact", window.key),
  ]);
  report.candidates = teachers.length;

  const lessons = (
    await Promise.all(
      chunk(teachers.map((teacher) => teacher.id), ID_CHUNK).map((ids) =>
        fetchAll((from, to) =>
          client.from("lessons").select("id, created_by, title_en, title_ar").in("created_by", ids).order("id").range(from, to),
        ),
      ),
    )
  ).flat();
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  // Rows touched since the month began cover every start and completion in it.
  const activity = (
    await Promise.all(
      chunk(lessons.map((lesson) => lesson.id), ID_CHUNK).map((ids) =>
        fetchAll<LessonActivity & { id: string }>((from, to) =>
          client
            .from("lesson_progress")
            .select("id, lesson_id, student_id, created_at, completed_at")
            .in("lesson_id", ids)
            .gte("updated_at", window.start.toISOString())
            .order("id")
            .range(from, to),
        ),
      ),
    )
  ).flat();
  // Leave out teachers watching their own lessons.
  const authorOf = (row: LessonActivity) => lessonById.get(row.lesson_id)?.created_by ?? null;
  const activityByTeacher = groupBy(
    activity.filter((row) => authorOf(row) && authorOf(row) !== row.student_id),
    (row) => authorOf(row)!,
  );

  const count = (key: string) => (report.breakdown[key] = (report.breakdown[key] ?? 0) + 1);
  const prepared: Prepared[] = [];
  for (const teacher of teachers) {
    const address = emails.get(teacher.id);
    if (!address) {
      count("no_inbox");
      continue;
    }
    if (suppressed.has(teacher.id)) {
      count("unsubscribed");
      continue;
    }
    if (done.has(teacher.id)) {
      count("already_sent");
      continue;
    }

    const language = languageOf(teacher.preferred_language);
    const impact = summariseImpact(window, activityByTeacher.get(teacher.id) ?? [], (lessonId) => {
      const lesson = lessonById.get(lessonId);
      if (!lesson) return null;
      return (language === "ar" ? lesson.title_ar || lesson.title_en : lesson.title_en || lesson.title_ar) || null;
    });
    if (!impact.starts) {
      count("no_activity");
      continue;
    }
    count("summary");

    const unsubscribe = unsubscribeUrl(siteUrl, secret, teacher.id, "volunteer_impact");
    const rendered = volunteerImpactEmail({
      language,
      name: teacher.full_name,
      siteUrl,
      unsubscribeUrl: unsubscribe,
      monthLabel: monthLabel(window, language),
      impact,
    });
    prepared.push({ userId: teacher.id, email: { to: address, ...rendered, tag: "volunteer_impact", unsubscribeUrl: unsubscribe } });
  }

  return finish(report, db, prepared, dryRun);
}

/** Records an unsubscribe from one recurring summary. */
export async function suppressEmails(userId: string, kind: UnsubscribableKind) {
  const db = createServiceClient() as unknown as UntypedClient;
  const { error } = await db
    .from("email_suppressions")
    .upsert({ user_id: userId, kind }, { onConflict: "user_id,kind", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
