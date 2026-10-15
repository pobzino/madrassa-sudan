/**
 * Saving in-lesson activity answers, online and offline.
 *
 * SimPlayer reports answers through its `onSlideResponse` prop. The online
 * lesson page passes submitSlideResponse (POST, queued if that fails); the
 * offline player passes saveSlideResponseOffline (saved on the phone and
 * queued). Answers are always also kept in the local `responses` store so the
 * player can show them again, including offline. The server re-grades every
 * answer when it arrives, so local `isCorrect` is only for display.
 */

import { answerFromLegacy, slideToInteraction, toServerSlideAnswer } from "@/lib/interactions/adapters";
import type { InteractionAnswer } from "@/lib/interactions/types";
import type { Slide } from "@/lib/slides.types";
import {
  addQueueItem,
  getLocalSlideResponses,
  putLocalSlideResponses,
  type LocalSlideResponse,
  type LocalSlideResponses,
} from "./db";

/** The shape SimPlayer's `savedResponses` prop takes. */
export type SavedSlideResponses = Record<string, { answer: unknown; isCorrect: boolean }>;

export type SlideResponsePostResult =
  | { ok: true; isCorrect: boolean | null }
  | { ok: false; retryable: boolean; status: number | null };

export interface SlideResponseInput {
  ownerId: string;
  lessonId: string;
  slideId: string;
  /** What SimPlayer produced: a typed InteractionAnswer, or null for a skipped activity. */
  answer: unknown;
  isCorrect: boolean | null;
  timeSpentSeconds?: number;
}

const POST_TIMEOUT_MS = 10_000;

/** Whether a failed POST is worth retrying later (network trouble) or will never succeed (bad slide, no access). */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

/**
 * POSTs one answer to /api/lessons/<id>/slide-responses, converted to the
 * shape the route accepts. Never throws.
 */
export async function postSlideResponse(
  lessonId: string,
  slideId: string,
  answer: unknown,
  {
    timeSpentSeconds,
    signal,
    timeoutMs = POST_TIMEOUT_MS,
  }: { timeSpentSeconds?: number; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<SlideResponsePostResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, retryable: true, status: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/slide-responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({
        slide_id: slideId,
        answer: toServerSlideAnswer(answer),
        ...(typeof timeSpentSeconds === "number" && timeSpentSeconds >= 0
          ? { time_spent_seconds: Math.round(timeSpentSeconds) }
          : {}),
      }),
    });
    if (!response.ok) {
      return { ok: false, retryable: isRetryableStatus(response.status), status: response.status };
    }
    const json = (await response.json().catch(() => null)) as { is_correct?: unknown } | null;
    return { ok: true, isCorrect: typeof json?.is_correct === "boolean" ? json.is_correct : null };
  } catch {
    return { ok: false, retryable: true, status: null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Queues one answer for syncOfflineQueue to send. */
export async function queueSlideResponse({
  ownerId,
  lessonId,
  slideId,
  answer,
  timeSpentSeconds,
}: Omit<SlideResponseInput, "isCorrect">): Promise<void> {
  const answeredAt = new Date().toISOString();
  await addQueueItem({
    lessonId,
    ownerId,
    kind: "slide_response",
    timestamp: answeredAt,
    data: {
      slideId,
      answer: toServerSlideAnswer(answer),
      answeredAt,
      ...(typeof timeSpentSeconds === "number" ? { timeSpentSeconds } : {}),
    },
  });
}

async function saveLocally({ ownerId, lessonId, slideId, answer, isCorrect }: SlideResponseInput) {
  await putLocalSlideResponses(ownerId, lessonId, {
    [slideId]: { answer: answer ?? null, isCorrect, answeredAt: new Date().toISOString() },
  });
}

/** Offline player: keep the answer on the phone and queue it. */
export async function saveSlideResponseOffline(input: SlideResponseInput): Promise<void> {
  await Promise.all([saveLocally(input), queueSlideResponse(input)]);
}

/**
 * Online lesson page: keep the answer on the phone, POST it, and queue it if
 * the POST fails for a reason a retry can fix. The server's grade replaces
 * the local one when it answers.
 */
export async function submitSlideResponse(input: SlideResponseInput): Promise<SlideResponsePostResult> {
  await saveLocally(input).catch(() => undefined);
  const result = await postSlideResponse(input.lessonId, input.slideId, input.answer, {
    timeSpentSeconds: input.timeSpentSeconds,
  });
  if (result.ok) {
    if (result.isCorrect !== null && result.isCorrect !== input.isCorrect) {
      await saveLocally({ ...input, isCorrect: result.isCorrect }).catch(() => undefined);
    }
  } else if (result.retryable) {
    await queueSlideResponse(input).catch(() => undefined);
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
export async function getSavedSlideResponses(ownerId: string, lessonId: string): Promise<SavedSlideResponses> {
  try {
    return toSavedSlideResponses(await getLocalSlideResponses(ownerId, lessonId));
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
