/**
 * Saving in-lesson activity answers, online and offline.
 *
 * SimPlayer reports answers through its `onSlideResponse` prop. The online
 * lesson page passes submitSlideResponse (POST, queued if that fails); the
 * offline player passes saveSlideResponseOffline (saved on the phone and
 * queued). Answers are always also kept in the local `responses` store so the
 * player can show them again, including offline. The server re-grades every
 * answer when it arrives, so local `isCorrect` is only for display.
 *
 * Bad connections mean answers can reach the server late and out of order
 * (a retry succeeds while the first try is still queued). Every answer
 * carries the time it was given and an id, the queue keeps one answer per
 * slide, and the server ignores an answer older than the one it has, so a
 * late send can't replace a newer answer or its grade.
 */

import { answerFromLegacy, slideToInteraction, toServerSlideAnswer } from "@/lib/interactions/adapters";
import type { InteractionAnswer } from "@/lib/interactions/types";
import type { Slide } from "@/lib/slides.types";
import { LEARNER_HEADER } from "@/lib/learners/types";
import {
  getLocalSlideResponses,
  getStorageEpoch,
  queueSlideResponseItem,
  removeQueuedSlideResponses,
  updateLocalSlideResponse,
  type LocalSlideResponse,
  type LocalSlideResponses,
} from "./db";

/** The shape SimPlayer's `savedResponses` prop takes. */
export type SavedSlideResponses = Record<string, { answer: unknown; isCorrect: boolean }>;

/**
 * What to do with an answer the server didn't take:
 *   - retry: no connection, signed out, timeout, rate limit or a server error;
 *   - parked: the account can't open the lesson right now (unpublished, class
 *     changed, membership waiting for a teacher) — keep it and try again later;
 *   - gone: the lesson or slide no longer exists, or the server refused the
 *     answer itself — it can never succeed.
 */
export type SlideResponseFailure = "retry" | "parked" | "gone";

export type SlideResponsePostResult =
  /** `stale`: the server kept a newer answer for the slide; `isCorrect` is then null (not this answer's grade). */
  | { ok: true; isCorrect: boolean | null; stale?: boolean }
  | { ok: false; retryable: boolean; outcome: SlideResponseFailure; status: number | null };

export interface SlideResponseInput {
  ownerId: string;
  learnerId?: string;
  lessonId: string;
  slideId: string;
  /** What SimPlayer produced: a typed InteractionAnswer, or null for a skipped activity. */
  answer: unknown;
  isCorrect: boolean | null;
  timeSpentSeconds?: number;
  /**
   * When the student answered (ISO, phone clock). Stamped once, when the
   * answer is reported, and kept through retries and sync, so answers are
   * ordered by when they were given rather than when they were sent.
   */
  answeredAt?: string;
  /** Identifies this answer, so the server recognises a resend (lie-fi: it was saved but the reply was lost). */
  answerId?: string;
}

type StampedInput<T> = T & { answeredAt: string; answerId: string };

const POST_TIMEOUT_MS = 10_000;

/** Whether a failed POST is worth retrying later (network trouble) or will never succeed (bad slide, no access). */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

/** Sorts a failed POST into retry / parked / gone (see SlideResponseFailure). `code` is the response body's `code`. */
export function classifyFailedPost(status: number | null, code?: unknown): SlideResponseFailure {
  if (isRetryableStatus(status)) return "retry";
  if (status === 403 && code === "no_access") return "parked";
  return "gone";
}

/** A random id for one answer. Older browsers (and plain-http pages) have no crypto.randomUUID. */
export function newAnswerId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Not a secure context.
  }
  const part = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${Date.now().toString(36)}-${part()}-${part()}`;
}

function stamp<T extends { answeredAt?: string; answerId?: string }>(input: T): StampedInput<T> {
  return { ...input, answeredAt: input.answeredAt ?? new Date().toISOString(), answerId: input.answerId ?? newAnswerId() };
}

function isRealAnswer(answer: unknown): boolean {
  return answer !== null && answer !== undefined;
}

/**
 * Whether a saved answer is the one a server reply is about: the same answer
 * id, or (answers saved before ids existed) the same time or the same value.
 */
export function isSameAnswer(
  entry: Pick<LocalSlideResponse, "answer" | "answeredAt" | "answerId">,
  sent: { answer?: unknown; answeredAt?: unknown; answerId?: unknown }
): boolean {
  if (typeof entry.answerId === "string" && typeof sent.answerId === "string") return entry.answerId === sent.answerId;
  if (typeof entry.answeredAt === "string" && entry.answeredAt === sent.answeredAt) return true;
  return JSON.stringify(toServerSlideAnswer(entry.answer)) === JSON.stringify(toServerSlideAnswer(sent.answer));
}

/**
 * Puts the server's grade on the saved answer, only when the saved answer is
 * still the one that was graded (a newer answer keeps its own grade).
 */
export async function applyServerGrade(
  ownerId: string,
  lessonId: string,
  slideId: string,
  sent: { answer?: unknown; answeredAt?: unknown; answerId?: unknown },
  isCorrect: boolean,
  epoch?: number,
  learnerId = ownerId
): Promise<void> {
  await updateLocalSlideResponse(
    ownerId,
    lessonId,
    slideId,
    (entry) => (entry && entry.isCorrect !== isCorrect && isSameAnswer(entry, sent) ? { ...entry, isCorrect } : undefined),
    epoch,
    learnerId
  );
}

/**
 * POSTs one answer to /api/lessons/<id>/slide-responses, converted to the
 * shape the route accepts. Never throws. `answeredAt` and `answerId` let the
 * server ignore an answer older than the one it has, and a resend of one it
 * already saved.
 */
export async function postSlideResponse(
  lessonId: string,
  slideId: string,
  answer: unknown,
  {
    timeSpentSeconds,
    answeredAt,
    answerId,
    learnerId,
    signal,
    timeoutMs = POST_TIMEOUT_MS,
  }: {
      timeSpentSeconds?: number;
      answeredAt?: string;
      answerId?: string;
      learnerId?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<SlideResponsePostResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, retryable: true, outcome: "retry", status: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/slide-responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(learnerId ? { [LEARNER_HEADER]: learnerId } : {}) },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({
        slide_id: slideId,
        answer: toServerSlideAnswer(answer),
        ...(typeof timeSpentSeconds === "number" && timeSpentSeconds >= 0
          ? { time_spent_seconds: Math.round(timeSpentSeconds) }
          : {}),
        ...(answeredAt ? { answered_at: answeredAt } : {}),
        ...(answerId ? { client_answer_id: answerId } : {}),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      return {
        ok: false,
        retryable: isRetryableStatus(response.status),
        outcome: classifyFailedPost(response.status, body?.code),
        status: response.status,
      };
    }
    const json = (await response.json().catch(() => null)) as { is_correct?: unknown; stale?: unknown } | null;
    if (json?.stale === true) return { ok: true, isCorrect: null, stale: true };
    return { ok: true, isCorrect: typeof json?.is_correct === "boolean" ? json.is_correct : null };
  } catch {
    return { ok: false, retryable: true, outcome: "retry", status: null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Queues one answer for syncOfflineQueue to send: at most one per slide,
 * the one the server should end up with (see queueSlideResponseItem).
 * `epoch` (read when the answer was given) refuses the write if a logout
 * cleared storage since.
 */
export async function queueSlideResponse(
  input: Omit<SlideResponseInput, "isCorrect">,
  epoch = getStorageEpoch()
): Promise<void> {
  const { ownerId, learnerId = input.ownerId, lessonId, slideId, answer, timeSpentSeconds, answeredAt, answerId } = stamp(input);
  await queueSlideResponseItem({
    lessonId,
    ownerId,
    learnerId,
    kind: "slide_response",
    timestamp: answeredAt,
    data: {
      slideId,
      answer: toServerSlideAnswer(answer),
      answeredAt,
      answerId,
      ...(typeof timeSpentSeconds === "number" ? { timeSpentSeconds } : {}),
    },
  }, epoch);
}

async function saveLocally(
  { ownerId, learnerId = ownerId, lessonId, slideId, answer, isCorrect, answeredAt, answerId }: StampedInput<SlideResponseInput>,
  epoch: number
) {
  await updateLocalSlideResponse(
    ownerId,
    lessonId,
    slideId,
    (current) =>
      // A skip never hides an answer this phone already shows.
      !isRealAnswer(answer) && current && isRealAnswer(current.answer)
        ? undefined
        : { answer: answer ?? null, isCorrect, answeredAt, answerId },
    epoch,
    learnerId
  );
}

/** Offline player: keep the answer on the phone and queue it. */
export async function saveSlideResponseOffline(input: SlideResponseInput): Promise<void> {
  const epoch = getStorageEpoch();
  const answer = stamp(input);
  await Promise.all([saveLocally(answer, epoch), queueSlideResponse(answer, epoch)]);
}

/**
 * Online lesson page: keep the answer on the phone, POST it, and queue it if
 * the POST fails for a reason a retry can fix. The server's grade replaces
 * the local one when it answers.
 */
export async function submitSlideResponse(input: SlideResponseInput): Promise<SlideResponsePostResult> {
  // A logout during the POST (e.g. in another tab) must not get this
  // account's answer written back into the wiped storage.
  const epoch = getStorageEpoch();
  const answer = stamp(input);
  const { ownerId, learnerId = ownerId, lessonId, slideId, answeredAt, answerId } = answer;
  await saveLocally(answer, epoch).catch(() => undefined);
  const result = await postSlideResponse(lessonId, slideId, answer.answer, {
    timeSpentSeconds: answer.timeSpentSeconds,
    answeredAt,
    answerId,
    learnerId,
  });
  if (result.ok) {
    // Older answers to this slide still queued from a failed send must not
    // be replayed over this one by the next sync.
    await removeQueuedSlideResponses(ownerId, lessonId, slideId, {
      real: isRealAnswer(answer.answer),
      time: Date.parse(answeredAt),
    }, learnerId).catch(() => undefined);
    if (result.isCorrect !== null && result.isCorrect !== input.isCorrect) {
      await applyServerGrade(ownerId, lessonId, slideId, answer, result.isCorrect, epoch, learnerId).catch(() => undefined);
    }
  } else if (result.outcome === "retry") {
    // Not queued when a newer answer to the slide was given meanwhile (it is
    // sent or queued on its own).
    await queueSlideResponse(answer, epoch).catch(() => undefined);
  }
  return result;
}

/** Local answers in the shape SimPlayer's `savedResponses` takes. */
export function toSavedSlideResponses(local: Pick<LocalSlideResponses, "bySlide"> | null | undefined): SavedSlideResponses {
  const saved: SavedSlideResponses = {};
  for (const [slideId, entry] of Object.entries(local?.bySlide ?? {})) {
    if (entry?.answer === null || entry?.answer === undefined) continue;
    saved[slideId] = { answer: entry.answer, isCorrect: entry.isCorrect === true };
  }
  return saved;
}

/** Answers saved on this phone for one owner + lesson, ready for SimPlayer. Never throws. */
export async function getSavedSlideResponses(ownerId: string, lessonId: string, learnerId = ownerId): Promise<SavedSlideResponses> {
  try {
    return toSavedSlideResponses(await getLocalSlideResponses(ownerId, lessonId, learnerId));
  } catch {
    return {};
  }
}

interface ServerSlideResponseRow {
  slide_id?: unknown;
  response_data?: unknown;
  is_correct?: unknown;
  completed_at?: unknown;
}

function isLegacyAnswer(value: unknown): value is boolean | number | string | string[] | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

/**
 * Converts rows from GET /api/lessons/<id>/slide-responses (legacy answers)
 * into typed answers SimPlayer can show, using each slide's interaction to
 * read the legacy value. Rows for unknown slides or unreadable answers are
 * skipped. Pure.
 */
export function serverResponsesToLocal(
  rows: unknown,
  slides: Slide[] | null | undefined
): Record<string, LocalSlideResponse> {
  const result: Record<string, LocalSlideResponse> = {};
  if (!Array.isArray(rows)) return result;
  const slideById = new Map((slides ?? []).map((slide) => [slide.id, slide]));

  for (const row of rows as ServerSlideResponseRow[]) {
    if (!row || typeof row.slide_id !== "string" || result[row.slide_id]) continue;
    const slide = slideById.get(row.slide_id);
    const interaction = slide ? slideToInteraction(slide) : null;
    if (!interaction) continue;

    const data = row.response_data;
    const raw = data && typeof data === "object" && !Array.isArray(data) ? (data as { answer?: unknown }).answer : undefined;

    let answer: InteractionAnswer | null = null;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as { type?: unknown }).type === "draw_answer") {
      const image = (raw as { image_data_url?: unknown }).image_data_url;
      answer = typeof image === "string" ? { type: "draw_answer", image_data_url: image } : null;
    } else if (isLegacyAnswer(raw)) {
      answer = answerFromLegacy(interaction, raw);
    }
    if (!answer) continue;

    result[row.slide_id] = {
      answer,
      isCorrect: typeof row.is_correct === "boolean" ? row.is_correct : null,
      ...(typeof row.completed_at === "string" ? { answeredAt: row.completed_at } : {}),
    };
  }

  return result;
}
