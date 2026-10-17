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

import { notifyPlacementDone, placementPeriodKey } from "@/lib/server/measurement/notify";

type Row = Record<string, unknown>;

function seed(overrides: { optIn?: boolean; suppressed?: boolean; battle?: Row } = {}) {
  const tables: Record<string, Row[]> = {
    milestone_battles: [{ id: "battle-1", learner_id: "child-1", milestone_id: "pl-1", status: "completed", kind: "placement", is_preview: false, ...overrides.battle }],
    learning_path_milestones: [{ id: "pl-1", path_id: "path-1", boss_key: "number_giant" }],
    learning_paths: [{ id: "path-1", subject_id: "subject-1" }],
    profiles: [
      { id: "child-1", full_name: null, learner_name: "Amira", parent_account_id: "parent-ar", auth_user_id: null },
      { id: "parent-ar", full_name: "Fatima Ali", preferred_language: "ar", email_updates_opt_in: overrides.optIn ?? true },
      { id: "guardian-en", full_name: "Sam Lee", preferred_language: "en", email_updates_opt_in: false },
    ],
    guardian_students: [{ guardian_id: "guardian-en", student_id: "child-1", is_approved: true }],
    subjects: [{ id: "subject-1", name_ar: "الرياضيات", name_en: "Maths" }],
    email_suppressions: overrides.suppressed ? [{ user_id: "parent-ar", kind: "weekly_progress" }] : [],
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

beforeEach(() => {
  mocks.sendEmails.mockClear();
  mocks.sendPushToUsers.mockClear();
  mocks.testRecipients.mockResolvedValue([]);
});

describe("notifyPlacementDone", () => {
  it("pushes to the owner and approved guardians, emails only the opted-in, once per child and placement", async () => {
    const { tables, client } = seed();
    const report = await notifyPlacementDone(client as never, "battle-1");
    expect(report).toMatchObject({ status: "sent", recipients: 2, pushUsers: 2, emailsSent: 1 });
    const messages = mocks.sendPushToUsers.mock.calls[0][1] as Map<string, PushMessage>;
    expect(messages.get("parent-ar")).toMatchObject({ title: "تعرّف Amira على نُمبو عملاق الأرقام!", body: "صار آمال يعرف من أين يبدأ في الرياضيات.", url: "/progress" });
    expect(messages.get("guardian-en")).toMatchObject({ title: "Amira met Numbo the Number Giant!", body: "Amal now knows where to start in Maths." });
    expect(mocks.sendEmails).toHaveBeenCalledTimes(1);
    const [[emails, idempotency]] = mocks.sendEmails.mock.calls as unknown as Array<[Array<{ to: string; tag: string }>, string]>;
    expect(emails[0]).toMatchObject({ to: "fatima@example.com", tag: "placement_done" });
    expect(idempotency).toBe("placement_done:child-1:pl-1:parent-ar");
    const key = placementPeriodKey("child-1", "pl-1");
    expect(key).toBe("placement:child-1:pl-1");
    expect(tables.push_log.map((row) => [row.user_id, row.kind, row.period_key])).toEqual([["parent-ar", "placement_done", key], ["guardian-en", "placement_done", key]]);
    expect(tables.email_log).toHaveLength(1);

    // a second call (a retry, or a later re-placement of the same child) sends nothing
    mocks.sendEmails.mockClear();
    mocks.sendPushToUsers.mockClear();
    const again = await notifyPlacementDone(client as never, "battle-1");
    expect(again.emailsSent).toBe(0);
    expect(mocks.sendEmails).not.toHaveBeenCalled();
    expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
  });

  it("no email when the family did not opt in, or stopped the weekly summary", async () => {
    for (const overrides of [{ optIn: false }, { suppressed: true }]) {
      mocks.sendEmails.mockClear();
      const { client } = seed(overrides);
      const report = await notifyPlacementDone(client as never, "battle-1");
      expect(report.emailsSent).toBe(0);
      expect(report.pushUsers).toBe(2);
      expect(mocks.sendEmails).not.toHaveBeenCalled();
    }
  });

  it("test mode sends samples to the test inboxes and records nothing", async () => {
    mocks.testRecipients.mockResolvedValue(["qa@amal.test"]);
    const { tables, client } = seed();
    const report = await notifyPlacementDone(client as never, "battle-1");
    expect(report).toMatchObject({ testMode: true, emailsSent: 1 });
    const [[emails]] = mocks.sendEmails.mock.calls as unknown as Array<[Array<{ to: string; subject: string }>]>;
    expect(emails[0].to).toBe("qa@amal.test");
    expect(emails[0].subject).toMatch(/^\[Test, for fatima@example.com\]/);
    expect(tables.email_log).toHaveLength(0);
  });

  it("skips previews, unfinished battles and Big Challenges", async () => {
    for (const battle of [{ is_preview: true }, { status: "active" }, { kind: "milestone", status: "won" }]) {
      const { client } = seed({ battle });
      expect((await notifyPlacementDone(client as never, "battle-1")).status).toBe("skipped");
    }
    expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
  });
});
