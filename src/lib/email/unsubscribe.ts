import { createHmac, timingSafeEqual } from "node:crypto";

// Signed unsubscribe links for the recurring summaries, so a link can only
// stop the emails it was sent with, for the person it was sent to.

export const UNSUBSCRIBABLE_KINDS = ["weekly_progress", "volunteer_impact"] as const;
export type UnsubscribableKind = (typeof UNSUBSCRIBABLE_KINDS)[number];

export function isUnsubscribableKind(value: string | null): value is UnsubscribableKind {
  return UNSUBSCRIBABLE_KINDS.includes(value as UnsubscribableKind);
}

function sign(secret: string, userId: string, kind: UnsubscribableKind) {
  return createHmac("sha256", secret).update(`unsubscribe:${userId}:${kind}`).digest("base64url");
}

export function unsubscribeUrl(siteUrl: string, secret: string, userId: string, kind: UnsubscribableKind) {
  const params = new URLSearchParams({ u: userId, k: kind, t: sign(secret, userId, kind) });
  return `${siteUrl}/api/email/unsubscribe?${params.toString()}`;
}

export function verifyUnsubscribeToken(secret: string, userId: string, kind: UnsubscribableKind, token: string) {
  const expected = Buffer.from(sign(secret, userId, kind));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
