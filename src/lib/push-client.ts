// Lesson reminders in the browser: asks permission, subscribes this device
// with the service worker, and tells the server. iPhones only allow this
// once Amal is on the home screen.

export type ReminderState =
  /** The browser can't do push notifications. */
  | "unsupported"
  /** iPhone in Safari: add Amal to the home screen first. */
  | "needs-install"
  | "default"
  | "granted"
  | "denied";

const SERVICE_WORKER_TIMEOUT_MS = 8000;

// One live view of "are reminders on?" shared by the prompt, the dashboard
// card and Settings, so turning them on in one place updates the others.
const reminderListeners = new Set<() => void>();
let watchingPermission = false;

function notifyReminders() {
  reminderListeners.forEach((listener) => listener());
}

export function subscribeToReminders(listener: () => void) {
  reminderListeners.add(listener);
  // Also follow changes made in the phone's settings, where the browser reports them.
  if (!watchingPermission && typeof navigator !== "undefined" && navigator.permissions?.query) {
    watchingPermission = true;
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((status) => status.addEventListener("change", notifyReminders))
      .catch(() => undefined);
  }
  return () => {
    reminderListeners.delete(listener);
  };
}

export function reminderState(): ReminderState {
  const hasWorker = "serviceWorker" in navigator;
  const hasPush = "PushManager" in window && "Notification" in window;
  if (!hasWorker || !hasPush) {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !standalone ? "needs-install" : "unsupported";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "unsupported";
  return Notification.permission;
}

function vapidKey() {
  const base64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function readyWorker() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), SERVICE_WORKER_TIMEOUT_MS)),
  ]);
}

async function saveSubscription(subscription: PushSubscription, extra: Record<string, unknown> = {}) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...subscription.toJSON(), ...extra }),
  });
  return response.ok;
}

/** Asks for permission (call it from a tap), subscribes and sends a "reminders are on" push. */
export async function enableReminders(language: "ar" | "en"): Promise<"on" | "denied" | "dismissed" | "error"> {
  try {
    return await turnOn(language);
  } finally {
    notifyReminders();
  }
}

async function turnOn(language: "ar" | "en"): Promise<"on" | "denied" | "dismissed" | "error"> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  try {
    const registration = await readyWorker();
    if (!registration) return "error";
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() }));
    return (await saveSubscription(subscription, { confirm: true, language })) ? "on" : "error";
  } catch {
    return "error";
  }
}

/**
 * Re-sends an existing subscription once per visit, so the server keeps it
 * linked to whoever is signed in and picks up any change the browser made.
 */
export async function refreshReminders() {
  try {
    if (reminderState() !== "granted" || sessionStorage.getItem("amal-push-refreshed")) return;
    sessionStorage.setItem("amal-push-refreshed", "1");
    const registration = await readyWorker();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await saveSubscription(subscription);
  } catch {
    // Reminders are a bonus; never interrupt learning over them.
  }
}

const REMINDERS_CARD_HIDDEN_KEY = "amal-reminders-card-hidden-until";

export function isRemindersCardHidden() {
  try {
    return Number(localStorage.getItem(REMINDERS_CARD_HIDDEN_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function hideRemindersCard(days = 3) {
  try {
    localStorage.setItem(REMINDERS_CARD_HIDDEN_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch {
    // Storage can be unavailable in private or locked-down browsers.
  }
  notifyReminders();
}

/** True when this device has a live push subscription. */
export async function remindersSubscribed() {
  try {
    if (reminderState() !== "granted") return false;
    const registration = await readyWorker();
    return Boolean(await registration?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Turns reminders off on this device and tells the server to stop sending. */
export async function disableReminders() {
  try {
    const registration = await readyWorker();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
    return true;
  } catch {
    return false;
  } finally {
    notifyReminders();
  }
}

// How often we ask. Our own prompt comes before the phone's permission box,
// because once someone taps "Don't allow" the browser never lets us ask again.
const ASKS_KEY = "amal-reminder-asks";
const MAX_ASKS = 4;
const DAYS_BETWEEN_ASKS = 3;

function readAsks(): { count: number; last: number } {
  try {
    const parsed = JSON.parse(localStorage.getItem(ASKS_KEY) ?? "{}");
    return { count: Number(parsed.count) || 0, last: Number(parsed.last) || 0 };
  } catch {
    return { count: 0, last: 0 };
  }
}

/** Whether it's time to show the reminders prompt again: first time, then every few days, up to a limit. */
export function shouldAskForReminders(now = Date.now()) {
  const { count, last } = readAsks();
  return count < MAX_ASKS && now - last >= DAYS_BETWEEN_ASKS * 24 * 60 * 60 * 1000;
}

export function remindersAskCount() {
  return readAsks().count;
}

export function markRemindersAsked(now = Date.now()) {
  try {
    localStorage.setItem(ASKS_KEY, JSON.stringify({ count: readAsks().count + 1, last: now }));
  } catch {
    // Storage can be unavailable in private or locked-down browsers.
  }
}
