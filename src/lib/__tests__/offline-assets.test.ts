import { describe, expect, it } from "vitest";
import {
  addLessonToAssetRef,
  collectSimAssetUrls,
  removeLessonFromAssetRef,
  resolveAssetUrl,
} from "@/lib/offline/assets";
import type { SimEvent, SimPayload } from "@/lib/sim.types";
import type { Slide } from "@/lib/slides.types";

const BASE = "https://amal.example/lessons/1";

function slide(id: string, overrides: Partial<Slide> = {}): Slide {
  return { id, type: "content", sequence: 0, image_url: null, ...overrides } as Slide;
}

function payload(deck: Slide[], events: SimEvent[] = []): SimPayload {
  return {
    audio_url: "https://storage.example/signed/audio.webm?token=abc",
    sim: {
      id: "sim-1",
      lesson_id: "lesson-1",
      duration_ms: 1000,
      deck_snapshot: deck,
      events,
      audio_path: "lesson-1/audio.webm",
      audio_duration_ms: 1000,
      audio_mime: "audio/webm",
      recorded_by: null,
      recorded_at: "2026-01-01T00:00:00Z",
      clip_segments: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  };
}

describe("resolveAssetUrl", () => {
  it("keeps absolute http(s) URLs and resolves site-relative ones", () => {
    expect(resolveAssetUrl("https://cdn.example/a.png", BASE)).toBe("https://cdn.example/a.png");
    expect(resolveAssetUrl("/images/b.png", BASE)).toBe("https://amal.example/images/b.png");
    expect(resolveAssetUrl("  http://cdn.example/c.png  ", "http://localhost:3000/")).toBe("http://cdn.example/c.png");
  });

  it("upgrades http: images to https: on an https page, as browsers do for <img>", () => {
    expect(resolveAssetUrl("  http://cdn.example/c.png  ", BASE)).toBe("https://cdn.example/c.png");
    expect(resolveAssetUrl("http://cdn.example:8080/c.png", BASE)).toBe("https://cdn.example:8080/c.png");
    expect(resolveAssetUrl("http://cdn.example/c.png")).toBe("http://cdn.example/c.png");
  });

  it("skips owl illustrations, data and blob URLs, and empty values", () => {
    expect(resolveAssetUrl("owl:happy", BASE)).toBeNull();
    expect(resolveAssetUrl("data:image/png;base64,AAAA", BASE)).toBeNull();
    expect(resolveAssetUrl("blob:https://amal.example/123", BASE)).toBeNull();
    expect(resolveAssetUrl("", BASE)).toBeNull();
    expect(resolveAssetUrl(null, BASE)).toBeNull();
    expect(resolveAssetUrl(42, BASE)).toBeNull();
  });

  it("drops the fragment but keeps the query (signed or versioned URLs)", () => {
    expect(resolveAssetUrl("https://cdn.example/a.png?v=2#top", BASE)).toBe("https://cdn.example/a.png?v=2");
  });

  it("returns null for relative paths when there is no base", () => {
    expect(resolveAssetUrl("/images/b.png")).toBeNull();
  });
});

describe("collectSimAssetUrls", () => {
  it("collects slide images, exploration slide images and exploration gate images, deduped", () => {
    const deck = [
      slide("s1", { image_url: "https://storage.example/one.png" }),
      slide("s2", { image_url: "owl:wave" }),
      slide("s3", {
        image_url: "https://storage.example/one.png",
        exploration_config: {
          type: "image_hotspot",
          image_url: "/uploads/hotspot.jpg",
          hotspots: [],
        },
      }),
      slide("s4", { image_url: "data:image/png;base64,AAAA" }),
    ];
    const events: SimEvent[] = [
      { t: 10, type: "slide_change", slide_id: "s1" } as SimEvent,
      {
        t: 20,
        type: "exploration_gate",
        slide_id: "s1",
        widget_type: "image_hotspot",
        config: { type: "image_hotspot", image_url: "https://third.example/map.png", hotspots: [] },
      },
      {
        t: 30,
        type: "exploration_gate",
        slide_id: "s1",
        widget_type: "number_line",
        config: { type: "number_line" } as never,
      },
    ];

    expect(collectSimAssetUrls(payload(deck, events), BASE)).toEqual([
      "https://storage.example/one.png",
      "https://amal.example/uploads/hotspot.jpg",
      "https://third.example/map.png",
    ]);
  });

  it("never collects the signed audio URL", () => {
    expect(collectSimAssetUrls(payload([slide("s1")]), BASE)).toEqual([]);
  });

  it("tolerates missing or malformed sims", () => {
    expect(collectSimAssetUrls(null, BASE)).toEqual([]);
    expect(collectSimAssetUrls(undefined, BASE)).toEqual([]);
    const broken = payload([null as unknown as Slide]);
    (broken.sim as { events: unknown }).events = null;
    expect(collectSimAssetUrls(broken, BASE)).toEqual([]);
  });
});

describe("asset reference counts", () => {
  it("adds a lesson once and keeps the known size", () => {
    const first = addLessonToAssetRef(null, "https://cdn.example/a.png", "lesson-1", 1200);
    expect(first).toEqual({ key: "asset:https://cdn.example/a.png", lessons: ["lesson-1"], bytes: 1200 });
    const again = addLessonToAssetRef(first, "https://cdn.example/a.png", "lesson-1", 0);
    expect(again.lessons).toEqual(["lesson-1"]);
    expect(again.bytes).toBe(1200);
    const shared = addLessonToAssetRef(again, "https://cdn.example/a.png", "lesson-2", 0);
    expect(shared.lessons).toEqual(["lesson-1", "lesson-2"]);
  });

  it("keeps a shared image when one lesson is removed and frees it with the last", () => {
    const shared = { key: "asset:https://cdn.example/a.png", lessons: ["lesson-1", "lesson-2"], bytes: 10 };
    const afterFirst = removeLessonFromAssetRef(shared, "lesson-1");
    expect(afterFirst?.lessons).toEqual(["lesson-2"]);
    expect(removeLessonFromAssetRef(afterFirst!, "lesson-2")).toBeNull();
  });
});
