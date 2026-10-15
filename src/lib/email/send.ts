import "server-only";

// Sends automated emails through Resend. Nothing goes out unless
// EMAIL_AUTOMATIONS_ENABLED is "true", and EMAIL_TEST_RECIPIENT (when set)
// redirects every email to one inbox, for a safe run on production data.

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** A short tag (letters, numbers, _ or -) to tell automations apart in Resend. */
  tag: string;
  /** Adds one-click unsubscribe headers, for recurring summaries. */
  unsubscribeUrl?: string;
};

export type SendOutcome =
  | { status: "sent"; ids: string[] }
  | { status: "skipped"; reason: "disabled" | "not-configured" }
  | { status: "failed"; error: string };

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
export const RESEND_BATCH_LIMIT = 100;

export function emailAutomationConfig() {
  return {
    enabled: process.env.EMAIL_AUTOMATIONS_ENABLED === "true",
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
    testRecipient: process.env.EMAIL_TEST_RECIPIENT?.trim() || null,
  };
}

export function canSendEmail() {
  const config = emailAutomationConfig();
  return config.enabled && Boolean(config.apiKey && config.from);
}

/** Sends up to 100 emails in one Resend request. */
export async function sendEmails(emails: OutgoingEmail[], idempotencyKey?: string): Promise<SendOutcome> {
  const config = emailAutomationConfig();
  if (!config.enabled) return { status: "skipped", reason: "disabled" };
  if (!config.apiKey || !config.from) return { status: "skipped", reason: "not-configured" };
  if (!emails.length) return { status: "sent", ids: [] };
  if (emails.length > RESEND_BATCH_LIMIT) throw new Error(`Resend batches are limited to ${RESEND_BATCH_LIMIT} emails`);

  const payload = emails.map((email) => ({
    from: config.from,
    to: [config.testRecipient ?? email.to],
    subject: config.testRecipient ? `[Test, for ${email.to}] ${email.subject}` : email.subject,
    html: email.html,
    text: email.text,
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    ...(email.unsubscribeUrl
      ? {
          headers: {
            "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
    tags: [{ name: "automation", value: email.tag }],
  }));

  try {
    const response = await fetch(RESEND_BATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { status: "failed", error: `Resend ${response.status}: ${detail}`.slice(0, 400) };
    }
    const body = (await response.json().catch(() => null)) as { data?: { id: string }[] } | null;
    return { status: "sent", ids: body?.data?.map((item) => item.id) ?? [] };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
