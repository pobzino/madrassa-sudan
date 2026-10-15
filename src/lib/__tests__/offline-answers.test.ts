import { describe, expect, it } from "vitest";
import { toServerSlideAnswer } from "@/lib/interactions/adapters";
import {
  answerSupersedes,
  nextProgressQueueData,
  planSlideAnswerQueue,
  queuedAnswerTime,
  supersededQueuedAnswerIds,
  type ProgressQueueItem,
} from "@/lib/offline/db";
import {
  classifyFailedPost,
  isRetryableStatus,
  isSameAnswer,
  newAnswerId,
  serverResponsesToLocal,
  toSavedSlideResponses,
} from "@/lib/offline/slide-responses";
import type { Slide } from "@/lib/slides.types";

function slide(id: string, overrides: Partial<Slide>): Slide {
  return { id, type: "activity", sequence: 0, image_url: null, ...overrides } as Slide;
}

describe("toServerSlideAnswer", () => {
  it("converts typed answers to the legacy shapes the route accepts", () => {
    expect(toServerSlideAnswer({ type: "choose_correct", selected_index: 2 })).toBe(2);
    expect(toServerSlideAnswer({ type: "true_false", value: false })).toBe(false);
    expect(toServerSlideAnswer({ type: "free_response", text: "a cat" })).toBe("a cat");
    expect(toServerSlideAnswer({ type: "fill_missing_word", text: "sun" })).toBe("sun");
    expect(toServerSlideAnswer({ type: "fill_missing_word", selected_index: 1 })).toBe(1);
    expect(toServerSlideAnswer({ type: "tap_to_count", count: 5 })).toBe(5);
    expect(toServerSlideAnswer({ type: "sequence_order", order: [2, 0, 1] })).toEqual(["2", "0", "1"]);
    expect(
      toServerSlideAnswer({
        type: "match_pairs",
        placements: [
          { item_index: 0, target_index: 1 },
          { item_index: 1, target_index: 0 },
        ],
      })
    ).toEqual(["0:1", "1:0"]);
    expect(
      toServerSlideAnswer({ type: "drag_drop_label", placements: [{ label_index: 0, hotspot_index: 0 }] })
    ).toEqual(["0:0"]);
    expect(
      toServerSlideAnswer({
        type: "draw_answer",
        image_data_url: "data:image/png;base64,AAAA",
        vision_result: { is_correct: true },
      })
    ).toBe("data:image/png;base64,AAAA");
  });

  it("passes legacy values through unchanged (safe to apply twice)", () => {
    expect(toServerSlideAnswer("x")).toBe("x");
    expect(toServerSlideAnswer(3)).toBe(3);
    expect(toServerSlideAnswer(true)).toBe(true);
    expect(toServerSlideAnswer(["0:1"])).toEqual(["0:1"]);
    expect(toServerSlideAnswer(toServerSlideAnswer({ type: "sequence_order", order: [1, 0] }))).toEqual(["1", "0"]);
  });

  it("records skipped or unreadable answers as null instead of failing the request", () => {
    expect(toServerSlideAnswer(null)).toBeNull();
    expect(toServerSlideAnswer(undefined)).toBeNull();
    expect(toServerSlideAnswer({ type: "match_pairs" })).toBeNull();
    expect(toServerSlideAnswer({ type: "choose_correct" })).toBeNull();
    expect(toServerSlideAnswer({ type: "tap_to_count", count: Number.NaN })).toBeNull();
    expect(toServerSlideAnswer({ type: "unknown_widget", value: 1 })).toBeNull();
    expect(toServerSlideAnswer({ foo: "bar" })).toBeNull();
    expect(toServerSlideAnswer(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toServerSlideAnswer([{ nested: true }])).toBeNull();
  });
});

describe("serverResponsesToLocal", () => {
  const slides = [
    slide("choose", { interaction_type: "choose_correct", interaction_options_en: ["a", "b"], interaction_correct_index: 1 }),
    slide("order", { interaction_type: "sequence_order", interaction_items_en: ["x", "y"] }),
    slide("draw", { interaction_type: "draw_answer" }),
    slide("plain", {}),
  ];

  it("turns the server's legacy answers back into typed answers the player shows", () => {
    const rows = [
      { slide_id: "choose", response_data: { answer: 1 }, is_correct: true, completed_at: "2026-10-01T00:00:00Z" },
      { slide_id: "order", response_data: { answer: ["1", "0"] }, is_correct: false },
      { slide_id: "draw", response_data: { answer: { type: "draw_answer", image_data_url: "data:image/png;base64,BB" } }, is_correct: true },
    ];
    expect(serverResponsesToLocal(rows, slides)).toEqual({
      choose: { answer: { type: "choose_correct", selected_index: 1 }, isCorrect: true, answeredAt: "2026-10-01T00:00:00Z" },
      order: { answer: { type: "sequence_order", order: [1, 0] }, isCorrect: false },
      draw: { answer: { type: "draw_answer", image_data_url: "data:image/png;base64,BB" }, isCorrect: true },
    });
  });

  it("skips skipped activities, unknown slides and slides without an activity", () => {
    const rows = [
      { slide_id: "choose", response_data: { answer: null }, is_correct: false },
      { slide_id: "missing", response_data: { answer: 1 }, is_correct: true },
      { slide_id: "plain", response_data: { answer: "x" }, is_correct: true },
      { slide_id: "order", response_data: "garbage", is_correct: true },
    ];
    expect(serverResponsesToLocal(rows, slides)).toEqual({});
    expect(serverResponsesToLocal(null, slides)).toEqual({});
  });

  it("keeps the first (newest) row per slide", () => {
    const rows = [
      { slide_id: "choose", response_data: { answer: 1 }, is_correct: true },
      { slide_id: "choose", response_data: { answer: 0 }, is_correct: false },
    ];
    expect(serverResponsesToLocal(rows, slides).choose.answer).toEqual({ type: "choose_correct", selected_index: 1 });
  });
});

describe("toSavedSlideResponses", () => {
  it("shapes local answers for SimPlayer, dropping skipped ones", () => {
    expect(
      toSavedSlideResponses({
        bySlide: {
          a: { answer: { type: "true_false", value: true }, isCorrect: true },
          b: { answer: { type: "free_response", text: "hi" }, isCorrect: null },
          c: { answer: null, isCorrect: false },
        },
      })
    ).toEqual({
      a: { answer: { type: "true_false", value: true }, isCorrect: true },
      b: { answer: { type: "free_response", text: "hi" }, isCorrect: false },
    });
    expect(toSavedSlideResponses(null)).toEqual({});
  });
});

describe("isRetryableStatus", () => {
  it("retries network trouble, never a request the server rejected for good", () => {
    expect(isRetryableStatus(null)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(401)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });
});

describe("classifyFailedPost", () => {
  it("parks answers for a lesson this account can't open now, drops impossible ones", () => {
    expect(classifyFailedPost(null)).toBe("retry");
    expect(classifyFailedPost(500)).toBe("retry");
    expect(classifyFailedPost(401)).toBe("retry");
    expect(classifyFailedPost(403, "no_access")).toBe("parked");
    expect(classifyFailedPost(403)).toBe("gone");
    expect(classifyFailedPost(404)).toBe("gone");
    expect(classifyFailedPost(422)).toBe("gone");
    expect(classifyFailedPost(400)).toBe("gone");
  });
});

describe("isSameAnswer", () => {
  const entry = { answer: { type: "choose_correct", selected_index: 2 }, answeredAt: "2026-10-10T00:00:00.000Z", answerId: "a1" };

  it("matches by answer id when both have one", () => {
    expect(isSameAnswer(entry, { answerId: "a1", answer: 0 })).toBe(true);
    expect(isSameAnswer(entry, { answerId: "a2", answer: 2, answeredAt: entry.answeredAt })).toBe(false);
  });

  it("falls back to the time, then the value, for answers saved before ids", () => {
    expect(isSameAnswer({ ...entry, answerId: undefined }, { answeredAt: entry.answeredAt, answer: 0 })).toBe(true);
    expect(isSameAnswer({ ...entry, answerId: undefined }, { answer: 2 })).toBe(true);
    expect(isSameAnswer({ ...entry, answerId: undefined }, { answer: 0 })).toBe(false);
  });

  it("makes distinct ids", () => {
    expect(newAnswerId()).not.toBe(newAnswerId());
  });
});

describe("queueing one answer per slide", () => {
  const item = (id: number | undefined, answer: unknown, answeredAt: string, slideId = "s1", ownerId = "u"): ProgressQueueItem => ({
    id,
    lessonId: "l",
    ownerId,
    kind: "slide_response",
    timestamp: answeredAt,
    data: { slideId, answer, answeredAt },
  });
  const T0 = "2026-10-10T00:00:00.000Z";
  const T1 = "2026-10-10T00:01:00.000Z";

  it("a real answer beats a skip; otherwise the later one wins", () => {
    expect(answerSupersedes({ real: true, time: 0 }, { real: false, time: 9 })).toBe(true);
    expect(answerSupersedes({ real: false, time: 9 }, { real: true, time: 0 })).toBe(false);
    expect(answerSupersedes({ real: true, time: 2 }, { real: true, time: 1 })).toBe(true);
    expect(answerSupersedes({ real: true, time: 1 }, { real: true, time: 1 })).toBe(false);
    expect(answerSupersedes({ real: true, time: Number.NaN }, { real: true, time: 1 })).toBe(false);
  });

  it("adds, replaces, or skips", () => {
    expect(planSlideAnswerQueue(null, [], item(undefined, 2, T0) as never)).toEqual({ action: "add" });
    expect(planSlideAnswerQueue(null, [item(7, 0, T0)], item(undefined, 2, T1) as never)).toEqual({ action: "replace", id: 7 });
    // Another slide or another account's answer is left alone.
    expect(planSlideAnswerQueue(null, [item(7, 0, T0, "s2"), item(8, 0, T0, "s1", "other")], item(undefined, 2, T1) as never)).toEqual({
      action: "add",
    });
    // An older answer that failed late never replaces a newer one, queued or saved.
    expect(planSlideAnswerQueue(null, [item(7, 2, T1)], item(undefined, 0, T0) as never)).toEqual({ action: "skip" });
    expect(
      planSlideAnswerQueue({ answer: { type: "x" }, answeredAt: T1, answerId: "newer" }, [], item(undefined, 0, T0) as never)
    ).toEqual({ action: "skip" });
    // The saved copy of this same answer doesn't block it, whatever the order
    // the two writes ran in, and neither does a copy of the server's answer
    // saved at download (timed by the server's clock).
    const same = { ...item(undefined, 0, T0), data: { slideId: "s1", answer: 0, answeredAt: T0, answerId: "this" } };
    expect(planSlideAnswerQueue({ answer: { type: "x" }, answeredAt: T1, answerId: "this" }, [], same as never)).toEqual({ action: "add" });
    expect(planSlideAnswerQueue({ answer: { type: "x" }, answeredAt: T1 }, [], item(undefined, 0, T0) as never)).toEqual({ action: "add" });
    // A skip never replaces a real answer.
    expect(planSlideAnswerQueue(null, [item(7, 2, T0)], item(undefined, null, T1) as never)).toEqual({ action: "skip" });
    expect(planSlideAnswerQueue(null, [item(7, null, T1)], item(undefined, 2, T0) as never)).toEqual({ action: "replace", id: 7 });
  });

  it("after a confirmed answer, removes the queued ones it replaces", () => {
    const queued = [item(1, 0, T0), item(2, 3, T1), item(3, null, T0), item(4, 0, T0, "s2")];
    expect(supersededQueuedAnswerIds(queued, "u", "s1", { real: true, time: Date.parse(T0) })).toEqual([1, 3]);
    // A confirmed skip leaves queued real answers.
    expect(supersededQueuedAnswerIds(queued, "u", "s1", { real: false, time: Date.parse(T1) })).toEqual([3]);
  });

  it("keeps a lesson's first completion time when its progress item is replaced", () => {
    expect(nextProgressQueueData({ data: { completed_at: T0 } }, { completed: true, last_position_seconds: 9 })).toEqual({
      completed: true,
      last_position_seconds: 9,
      completed_at: T0,
    });
    expect(nextProgressQueueData(null, { completed: true, completed_at: T1 })).toEqual({ completed: true, completed_at: T1 });
    expect(queuedAnswerTime(item(1, 0, T1))).toBe(Date.parse(T1));
  });
});
