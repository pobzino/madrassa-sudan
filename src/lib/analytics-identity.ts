/**
 * Maps an authenticated account to an opaque analytics identifier. The raw
 * account ID, email address, and any profile data must never reach analytics.
 */
export async function getOpaqueLearnerAnalyticsId(userId: string): Promise<string> {
  const value = new TextEncoder().encode(`amal-learner-v1:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", value);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `amal_learner_${hash}`;
}
