import { describe, expect, it } from "vitest";
import { toServerSlideAnswer } from "@/lib/interactions/adapters";
import {
  isRetryableStatus,
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
  });
});
