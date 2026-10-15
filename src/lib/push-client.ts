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
// Turning reminders on waits longer: on a phone's first visit the worker can
// still be installing (it caches the offline lesson pages first), and on a
// slow link that takes a while.
const SETUP_TIMEOUT_MS = 60000;
// Set once the phone has said yes and cleared once the server has the
// subscription, so a yes is never lost when the worker wasn't ready yet.
const REMINDERS_WANTED_KEY = "amal-reminders-wanted";
const REFRESHED_KEY = "amal-push-refreshed";

export type ReminderOutcome = "on" | "denied" | "dismissed" | "pending" | "error";

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

async function readyWorker(timeoutMs = SERVICE_WORKER_TIMEOUT_MS) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

// The worker to subscribe with, waiting out a first install. If that install
// failed (nothing installing, waiting or active), the browser won't retry
// until the next page load, so register again here.
async function setUpWorker() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const hasWorker = Boolean(registration?.active || registration?.installing || registration?.waiting);
    // Development unregisters the worker on purpose (ServiceWorkerRegister).
    if (!hasWorker && process.env.NODE_ENV === "production") await navigator.serviceWorker.register("/sw.js");
  } catch {
    // `ready` below still decides.
  }
  return readyWorker(SETUP_TIMEOUT_MS);
}

/** The language reminders were turned on in, while that is still being finished. */
export function remindersWanted(): "ar" | "en" | null {
  try {
    const value = localStorage.getItem(REMINDERS_WANTED_KEY);
    return value === "ar" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

function setRemindersWanted(language: "ar" | "en" | null) {
  try {
    if (language) localStorage.setItem(REMINDERS_WANTED_KEY, language);
    else localStorage.removeItem(REMINDERS_WANTED_KEY);
  } catch {
    // Storage can be unavailable in private or locked-down browsers.
  }
}

async function saveSubscription(subscription: PushSubscription, extra: Record<string, unknown> = {}) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...subscription.toJSON(), ...extra }),
  });
  return response.ok;
}

// Subscribes this phone (or reuses its subscription) and sends a "reminders are on" push.
async function subscribeAndConfirm(registration: ServiceWorkerRegistration, language: "ar" | "en") {
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() }));
  const saved = await saveSubscription(subscription, { confirm: true, language });
  if (saved) setRemindersWanted(null);
  return saved;
}

let turningOn: Promise<ReminderOutcome> | null = null;
let refreshing: Promise<void> | null = null;

/**
 * Asks for permission (call it from a tap), subscribes and sends a "reminders
 * are on" push. "pending": the phone said yes but the worker isn't ready yet;
 * refreshReminders finishes it later.
 */
export async function enableReminders(language: "ar" | "en"): Promise<ReminderOutcome> {
  const attempt = turnOn(language);
  turningOn = attempt;
  try {
    return await attempt;
  } finally {
    if (turningOn === attempt) turningOn = null;
    notifyReminders();
  }
}

async function turnOn(language: "ar" | "en"): Promise<ReminderOutcome> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  // Remember the yes before any waiting: the page may be closed meanwhile.
  setRemindersWanted(language);
  try {
    const registration = await setUpWorker();
    if (!registration) {
      // Finish on this visit if the worker gets there; otherwise on the next.
      navigator.serviceWorker.ready.then(() => refreshReminders()).catch(() => undefined);
      return "pending";
    }
    return (await subscribeAndConfirm(registration, language)) ? "on" : "error";
  } catch {
    return "error";
  }
}

/**
 * Once per visit: re-sends an existing subscription, so the server keeps it
 * linked to whoever is signed in and picks up any change the browser made.
 * Also finishes turning reminders on when an earlier yes couldn't (the worker
 * wasn't ready), whenever it's called until that works. A failed attempt
 * tries again on the next call.
 */
export function refreshReminders(): Promise<void> {
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refresh() {
  try {
    // A tap is turning reminders on right now: let it finish (and confirm) first.
    if (turningOn) await turningOn.catch(() => undefined);
    if (reminderState() !== "granted") return;
    const wanted = remindersWanted();
    if (!wanted && sessionStorage.getItem(REFRESHED_KEY)) return;
    const registration = await readyWorker(wanted ? SETUP_TIMEOUT_MS : SERVICE_WORKER_TIMEOUT_MS);
    if (!registration) return;
    if (wanted) {
      if (!(await subscribeAndConfirm(registration, wanted))) return;
      notifyReminders();
    } else {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && !(await saveSubscription(subscription))) return;
    }
    sessionStorage.setItem(REFRESHED_KEY, "1");
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
  // Also an unfinished "turn on": it must not finish later.
  setRemindersWanted(null);
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
