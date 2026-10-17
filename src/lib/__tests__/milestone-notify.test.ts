import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushMessage } from "@/lib/push-messages";
import { createFakeDb } from "./milestone-fake-db";

const mocks = vi.hoisted(() => ({
  sendEmails: vi.fn<(...args: unknown[]) => Promise<{ status: "sent"; ids: string[] }>>(async () => ({ status: "sent", ids: ["resend-1"] })),
  sendPushToUsers: vi.fn(async (_db: unknown, messages: Map<string, unknown>) => ({ users: messages.size, devices: messages.size, failed: 0, removed: 0 })),
  testRecipients: vi.fn(async () => [] as string[]),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/send", () => ({ sendEmails: mocks.sendEmails }));
vi.mock("@/lib/server/push", () => ({ sendPushToUsers: mocks.sendPushToUsers }));
vi.mock("@/lib/server/email-automations", () => ({
  languageOf: (value: string | null | undefined) => (value === "en" ? "en" : "ar"),
  testRecipients: mocks.testRecipients,
}));
vi.mock("@/lib/site-url", () => ({ getCanonicalSiteUrl: () => "https://amal.test" }));

import { milestonePassedEmail } from "@/lib/email/templates";
import { milestonePassedMessage } from "@/lib/push-messages";
import { notifyMilestonePassed } from "@/lib/server/milestones/notify";

type Row = Record<string, unknown>;

function seed() {
  const tables: Record<string, Row[]> = {
    learner_certificates: [{
      id: "cert-1", learner_id: "child-1", milestone_id: "m-1", subject_id: "subject-1", after_week_number: 4,
      title_ar: "التحدي الكبير", title_en: "Big Challenge", boss_key: "number_giant", score_percent: 100,
      correct_count: 9, wrong_count: 0, question_count: 12, stars: 3, awarded_at: "2026-10-16T10:00:00Z", parent_notified_at: null,
    }],
    profiles: [
      { id: "child-1", full_name: null, learner_name: "Amira", parent_account_id: "parent-ar", auth_user_id: null },
      { id: "parent-ar", full_name: "Fatima Ali", preferred_language: "ar" },
      { id: "guardian-en", full_name: "Sam Lee", preferred_language: "en" },
    ],
    guardian_students: [{ guardian_id: "guardian-en", student_id: "child-1", is_approved: true }],
    subjects: [{ id: "subject-1", name_ar: "الرياضيات", name_en: "Maths" }],
    push_log: [],
    email_log: [],
  };
  const { client } = createFakeDb(tables);
  const emails: Record<string, string> = { "parent-ar": "fatima@example.com", "guardian-en": "sam@example.com" };
  client.auth.admin.getUserById = (async (id: string) => ({
    data: { user: emails[id] ? { id, email: emails[id], email_confirmed_at: "2026-01-01T00:00:00Z" } : null },
  })) as never;
  return { tables, client };
}

function pushMessages(): Map<string, PushMessage> {
  return mocks.sendPushToUsers.mock.calls[0][1] as Map<string, PushMessage>;
}

beforeEach(() => {
  mocks.sendEmails.mockClear();
  mocks.sendPushToUsers.mockClear();
  mocks.testRecipients.mockResolvedValue([]);
});

describe("notifyMilestonePassed", () => {
  it("sends one push and one email per recipient, each in their own language", async () => {
    const { tables, client } = seed();
    const report = await notifyMilestonePassed(client as never, "cert-1");
    expect(report).toMatchObject({ status: "sent", recipients: 2, pushUsers: 2, emailsSent: 2 });

    const messages = pushMessages();
    expect(messages.get("parent-ar")!.title).toContain("Amira");
    expect(messages.get("parent-ar")!.lang).toBe("ar");
    expect(messages.get("parent-ar")!.body).toContain("الرياضيات");
    expect(messages.get("guardian-en")!.title).toBe("Amira beat Numbo the Number Giant and earned a certificate!");
    expect(messages.get("guardian-en")!.url).toBe("/certificates/cert-1");

    const sent = mocks.sendEmails.mock.calls.map((call) => (call[0] as Array<{ to: string; subject: string; tag: string }>)[0]);
    expect(sent.map((email) => email.to).sort()).toEqual(["fatima@example.com", "sam@example.com"]);
    expect(sent.every((email) => email.tag === "milestone_passed")).toBe(true);
    expect(mocks.sendEmails.mock.calls[0][1]).toMatch(/^milestone_passed:cert-1:/);
    expect(tables.push_log.map((row) => row.period_key)).toEqual(["cert:cert-1", "cert:cert-1"]);
    expect(tables.email_log).toHaveLength(2);
    expect(tables.learner_certificates[0].parent_notified_at).toBeTruthy();
  });

  it("never sends twice: the log claims block a retry even if the flag is cleared", async () => {
    const { tables, client } = seed();
    await notifyMilestonePassed(client as never, "cert-1");
    mocks.sendEmails.mockClear();
    mocks.sendPushToUsers.mockClear();

    expect(await notifyMilestonePassed(client as never, "cert-1")).toMatchObject({ status: "skipped", reason: "already_notified" });
    tables.learner_certificates[0].parent_notified_at = null;
    await notifyMilestonePassed(client as never, "cert-1");
    expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
    expect(mocks.sendEmails).not.toHaveBeenCalled();
  });

  it("releases the email claim when sending fails, so a retry can send", async () => {
    const { tables, client } = seed();
    mocks.sendEmails.mockResolvedValueOnce({ status: "failed", error: "boom" } as never);
    await notifyMilestonePassed(client as never, "cert-1");
    expect(tables.email_log).toHaveLength(1);
  });

  it("in test-recipient mode sends samples to the test inbox and records nothing", async () => {
    const { tables, client } = seed();
    mocks.testRecipients.mockResolvedValue(["qa@amal.test"]);
    const report = await notifyMilestonePassed(client as never, "cert-1");
    expect(report.testMode).toBe(true);
    const sent = mocks.sendEmails.mock.calls.map((call) => (call[0] as Array<{ to: string; subject: string }>)[0]);
    expect(sent.every((email) => email.to === "qa@amal.test")).toBe(true);
    expect(sent[0].subject).toMatch(/^\[Test, for /);
    expect(tables.email_log).toHaveLength(0);
  });
});

describe("milestone copy", () => {
  const args = { childName: "Amira", subjectName: "Maths", weeksLabel: "weeks 1–4", certificateId: "c1", bossName: "Numbo the Number Giant" };

  it("celebrates the child beating the boss, warmly and without violent words", () => {
    const en = milestonePassedMessage("en", args);
    const ar = milestonePassedMessage("ar", { ...args, subjectName: "الرياضيات", weeksLabel: "الأسابيع ١–٤", bossName: "نُمبو عملاق الأرقام" });
    expect(en).toMatchObject({ url: "/certificates/c1", tag: "milestone-c1", image: "/icons/icon-512.png", lang: "en" });
    expect(ar.title).toContain("Amira");
    expect(ar.title).toContain("نُمبو");
    expect(ar.body).toContain("الأسابيع ١–٤");
    const emailEn = milestonePassedEmail({ language: "en", name: "Sam Lee", siteUrl: "https://amal.test", ...args, stars: 2, certificateUrl: "https://amal.test/certificates/c1" });
    const emailAr = milestonePassedEmail({ language: "ar", name: "فاطمة", siteUrl: "https://amal.test", ...args, stars: 2, certificateUrl: "https://amal.test/certificates/c1" });
    expect(emailEn.subject).toBe("Amira beat Numbo the Number Giant and earned a certificate!");
    expect(emailEn.html).toContain("https://amal.test/certificates/c1");
    expect(emailAr.html).toContain('dir="rtl"');
    const violent = /\b(kill|destroy|dead|die|blood|weapon)\b|يقتل|دمّر|دم /i;
    for (const text of [en.title, en.body, ar.title, ar.body, emailEn.text, emailAr.text]) expect(text).not.toMatch(violent);
  });
});
