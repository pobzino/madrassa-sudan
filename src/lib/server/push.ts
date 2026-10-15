import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { type PushSubscription } from "web-push";
import type { PushMessage } from "@/lib/push-messages";

// Sends web push notifications to the devices families turned reminders on
// for. Needs the VAPID keys; PUSH_NOTIFICATIONS_ENABLED="false" stops all pushes.

// The push tables aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>;

type StoredSubscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

const PARALLEL_SENDS = 10;
const ONE_DAY_SECONDS = 24 * 60 * 60;

let vapidReady = false;

export function pushConfigured() {
  return (
    process.env.PUSH_NOTIFICATIONS_ENABLED !== "false" &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  );
}

function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@amalschool.org",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

async function sendOne(subscription: StoredSubscription, message: PushMessage) {
  const target: PushSubscription = { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } };
  try {
    await webpush.sendNotification(target, JSON.stringify(message), { TTL: ONE_DAY_SECONDS, urgency: "normal" });
    return "sent" as const;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404 and 410 mean the device turned notifications off or the app was removed.
    return status === 404 || status === 410 ? ("gone" as const) : ("failed" as const);
  }
}

/** Sends each user's message to all their devices. Returns how many users got at least one. */
export async function sendPushToUsers(db: UntypedClient, messages: Map<string, PushMessage>) {
  const result = { users: 0, devices: 0, failed: 0, removed: 0 };
  if (!pushConfigured() || messages.size === 0) return result;
  ensureVapid();

  const userIds = [...messages.keys()];
  const subscriptions: StoredSubscription[] = [];
  for (let i = 0; i < userIds.length; i += 100) {
    const { data, error } = await db
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    subscriptions.push(...(data ?? []));
  }

  const reached = new Set<string>();
  const gone: string[] = [];
  for (let i = 0; i < subscriptions.length; i += PARALLEL_SENDS) {
    const batch = subscriptions.slice(i, i + PARALLEL_SENDS);
    const outcomes = await Promise.all(batch.map((sub) => sendOne(sub, messages.get(sub.user_id)!)));
    outcomes.forEach((outcome, index) => {
      const sub = batch[index];
      if (outcome === "sent") {
        result.devices += 1;
        reached.add(sub.user_id);
      } else if (outcome === "gone") gone.push(sub.id);
      else result.failed += 1;
    });
  }

  if (gone.length) {
    await db.from("push_subscriptions").delete().in("id", gone);
    result.removed = gone.length;
  }
  result.users = reached.size;
  return result;
}

/** Sends one message to a single device, e.g. to confirm reminders are on. */
export async function sendPushToDevice(subscription: StoredSubscription, message: PushMessage) {
  if (!pushConfigured()) return "skipped" as const;
  ensureVapid();
  return sendOne(subscription, message);
}

/** Claims (user, kind, period) rows so each reminder only goes once; returns the users claimed. */
export async function claimPushes(db: UntypedClient, kind: "weekly_summary" | "streak_reminder", periodKey: string, userIds: string[]) {
  const claimed = new Set<string>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data, error } = await db
      .from("push_log")
      .upsert(
        userIds.slice(i, i + 500).map((userId) => ({ user_id: userId, kind, period_key: periodKey })),
        { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
      )
      .select("user_id");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) claimed.add((row as { user_id: string }).user_id);
  }
  return claimed;
}

/** Users with at least one device that has reminders on. */
export async function usersWithPush(db: UntypedClient) {
  const users = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("push_subscriptions").select("user_id").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) users.add((row as { user_id: string }).user_id);
    if (!data || data.length < 1000) return users;
  }
}
