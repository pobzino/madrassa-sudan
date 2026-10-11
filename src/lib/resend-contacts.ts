export type AmalContactRole = "parent" | "volunteer";

type SyncResult =
  | { status: "synced" }
  | { status: "skipped"; reason: "not-configured" | "synthetic-email" | "invalid-email" };

const RESEND_API_URL = "https://api.resend.com";
const WHATSAPP_LOGIN_DOMAIN = "@parents.amalschool.app";

function resendHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function segmentIdFor(role: AmalContactRole) {
  return role === "parent"
    ? process.env.RESEND_AMAL_PARENTS_SEGMENT_ID
    : process.env.RESEND_AMAL_VOLUNTEERS_SEGMENT_ID;
}

export function isDeliverableAmalEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.includes("@") && !normalized.endsWith(WHATSAPP_LOGIN_DOMAIN);
}

async function requestResend(
  path: string,
  apiKey: string,
  init: RequestInit,
) {
  return fetch(`${RESEND_API_URL}${path}`, {
    ...init,
    headers: resendHeaders(apiKey),
  });
}

/**
 * Adds an adult to the appropriate Amal segment. Existing contacts retain
 * their subscription status; only their Amal role and membership are updated.
 */
export async function syncAmalContact(
  email: string | null | undefined,
  role: AmalContactRole,
): Promise<SyncResult> {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (!isDeliverableAmalEmail(email)) {
    return {
      status: "skipped",
      reason: normalizedEmail.includes("@") ? "synthetic-email" : "invalid-email",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = segmentIdFor(role);
  if (!apiKey || !segmentId) {
    return { status: "skipped", reason: "not-configured" };
  }

  const encodedEmail = encodeURIComponent(normalizedEmail);
  const createResponse = await requestResend("/contacts", apiKey, {
    method: "POST",
    body: JSON.stringify({
      email: normalizedEmail,
      properties: { amal_role: role },
      segments: [{ id: segmentId }],
    }),
  });

  if (createResponse.ok) {
    return { status: "synced" };
  }

  // A duplicate is normal after a retry or when a contact already exists.
  if (createResponse.status !== 409) {
    const responseText = await createResponse.text();
    throw new Error(`Resend contact creation failed (${createResponse.status}): ${responseText}`);
  }

  const updateResponse = await requestResend(`/contacts/${encodedEmail}`, apiKey, {
    method: "PATCH",
    body: JSON.stringify({ properties: { amal_role: role } }),
  });
  if (!updateResponse.ok) {
    const responseText = await updateResponse.text();
    throw new Error(`Resend contact update failed (${updateResponse.status}): ${responseText}`);
  }

  const segmentResponse = await requestResend(
    `/contacts/${encodedEmail}/segments/${segmentId}`,
    apiKey,
    { method: "POST" },
  );
  if (!segmentResponse.ok && segmentResponse.status !== 409) {
    const responseText = await segmentResponse.text();
    throw new Error(`Resend segment membership failed (${segmentResponse.status}): ${responseText}`);
  }

  return { status: "synced" };
}
