import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SITE_URL = "https://amalschool.org";
const SIM_AUDIO_BUCKET = "sim-audio";

loadDotEnvLocal();

const siteUrl = stripTrailingSlash(process.env.SIM_SMOKE_SITE_URL || DEFAULT_SITE_URL);
const supabaseUrl = requiredEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");

if (isLocalSupabaseUrl(supabaseUrl)) {
  throw new Error(
    "Refusing to run production smoke test against a local Supabase URL. Set SUPABASE_URL=https://<project-ref>.supabase.co."
  );
}

const { chromium } = await importPlaywright();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const lessonId = randomUUID();
const slideIds = [randomUUID(), randomUUID()];
const stamp = Date.now();
const email = `sim-prod-smoke-${stamp}@example.com`;
const password = `Smoke-${randomUUID()}-9a!`;
const lessonTitle = `Sim prod smoke ${stamp}`;
const summary = {
  siteUrl,
  setup: {},
  ui: {},
  apiNegative: {},
  dbVerification: {},
  cleanup: {},
};

let userId = null;
let browser = null;
let page = null;
let firstSimId = null;
let firstAudioPath = null;
let secondSimId = null;
const browserConsole = [];
const pageErrors = [];

try {
  await setupTempData();
  await runBrowserFlow();
  await verifyNegativePaths();
  await verifyFinalDatabaseState();
} finally {
  await cleanup();
}

console.log(JSON.stringify(summary, null, 2));

async function setupTempData() {
  const subject = await must(
    "load subject",
    supabase
      .from("subjects")
      .select("id")
      .order("display_order", { ascending: true })
      .limit(1)
      .single()
  );

  const created = await must(
    "create smoke auth user",
    supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Sim Prod Smoke" },
    })
  );
  userId = created.user.id;

  await must(
    "create smoke profile",
    supabase.from("profiles").upsert({
      id: userId,
      full_name: "Sim Prod Smoke",
      role: "teacher",
      preferred_language: "en",
      is_approved: true,
      can_access_sims: true,
      privacy_consent_at: new Date().toISOString(),
      privacy_consent_version: "smoke-test",
    })
  );

  const now = new Date().toISOString();
  await must(
    "create smoke lesson",
    supabase.from("lessons").insert({
      id: lessonId,
      title_ar: lessonTitle,
      title_en: lessonTitle,
      description_ar: "Temporary sim production smoke test",
      description_en: "Temporary sim production smoke test",
      subject_id: subject.id,
      grade_level: 1,
      created_by: userId,
      display_order: 9999,
      is_published: false,
      submitted_for_review: false,
      video_processing_status: "idle",
      playback_mode: "sim",
      created_at: now,
      updated_at: now,
    })
  );

  await must(
    "create smoke slide deck",
    supabase.from("lesson_slides").insert({
      lesson_id: lessonId,
      slides: [
        makeSlide(slideIds[0], 1, "Live Sim Smoke 1"),
        makeSlide(slideIds[1], 2, "Live Sim Smoke 2"),
      ],
      language_mode: "en",
      generated_at: now,
      updated_at: now,
      created_at: now,
    })
  );

  summary.setup = {
    userCreated: true,
    lessonCreated: true,
    lessonId,
    slideCount: 2,
  };
}

async function runBrowserFlow() {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const context = await browser.newContext({
    baseURL: siteUrl,
    permissions: ["microphone"],
    locale: "en-GB",
    viewport: { width: 1440, height: 1000 },
  });
  page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserConsole.push({
        type: message.type(),
        text: message.text().slice(0, 500),
      });
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error.message || error).slice(0, 500));
  });

  await page.goto("/auth/login?lang=en", { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form").evaluate((form) => form.requestSubmit());
  await page.waitForURL(/\/dashboard|\/teacher|\/lessons/, { timeout: 60_000 }).catch(() => null);

  const authStatus = await page.evaluate(async () => {
    const response = await fetch("/api/teacher/lessons/non-existent/sims", {
      credentials: "include",
    });
    return response.status;
  });
  if (authStatus === 401) throw new Error("Browser login did not create an authenticated session.");

  await page.goto(`/teacher/lessons/${lessonId}?lang=en`, {
    waitUntil: "networkidle",
    timeout: 90_000,
  });
  await page.getByRole("button", { name: /Slides/i }).click();
  await page.getByRole("button", { name: /^Record$/ }).waitFor({ timeout: 60_000 });

  const first = await saveOneRecording("first");
  firstSimId = first.sim.id;
  firstAudioPath = first.sim.audioPath;
  summary.ui.firstSave = first.summary;

  const second = await saveOneRecording("second", { acceptReplace: true });
  secondSimId = second.sim.id;
  summary.ui.secondReplace = {
    ...second.summary,
    simIdChanged: firstSimId !== second.sim.id,
    audioPathChanged: firstAudioPath !== second.sim.audioPath,
    previousAudioDeleted: !(await storageObjectExists(firstAudioPath)),
  };

  expect(summary.ui.secondReplace.simIdChanged, "Replacement did not create a new sim row.");
  expect(summary.ui.secondReplace.audioPathChanged, "Replacement did not create a new audio object path.");
  expect(summary.ui.secondReplace.previousAudioDeleted, "Replacement did not delete the previous audio object.");
}

async function saveOneRecording(label, options = {}) {
  if (options.acceptReplace) {
    page.once("dialog", async (dialog) => {
      summary.ui.replaceDialog = dialog.message();
      await dialog.accept();
    });
  }

  const beforeAttempts = await must(
    `${label} load previous saved attempts`,
    supabase.from("sim_save_attempts").select("id").eq("lesson_id", lessonId).eq("status", "saved")
  );
  const beforeIds = new Set(beforeAttempts.map((row) => row.id));

  await page.getByRole("button", { name: /^Record$/ }).click();
  await page.getByText("REC", { exact: true }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "Checkpoint" }).click();
  await page.getByPlaceholder("Add a note...").fill(`smoke note with spaces ${label}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Next slide/i }).click().catch(() => null);
  await page.waitForTimeout(700);
  await page.locator('[data-tour="sim-stop-btn"]').click();
  await page.getByText("Review Recording").waitFor({ timeout: 20_000 });

  const finalizeResponsePromise = page.waitForResponse((response) => {
    try {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/teacher/lessons/${lessonId}/sims` &&
        response.request().method() === "POST"
      );
    } catch {
      return false;
    }
  }, { timeout: 90_000 });

  await page.getByRole("button", { name: "Save to Lesson" }).click();
  const finalizeResponse = await finalizeResponsePromise;
  const finalizeBody = await finalizeResponse.json().catch(() => null);
  expect(finalizeResponse.status() === 201, `${label} finalize failed: ${JSON.stringify(finalizeBody)}`);

  const savedAttempt = await waitForNewSavedAttempt(beforeIds);
  const simRow = await must(
    `${label} load sim row`,
    supabase
      .from("lesson_sims")
      .select("id, duration_ms, events, audio_path, audio_mime, deck_snapshot, recorded_by")
      .eq("lesson_id", lessonId)
      .single()
  );

  const playback = await getPlaybackProbe();
  const audioObjectExists = await storageObjectExists(simRow.audio_path);
  const eventTypes = Array.isArray(simRow.events)
    ? [...new Set(simRow.events.map((event) => event.type))]
    : [];

  expect(audioObjectExists, `${label} audio object missing after save.`);
  expect(playback.audioUrlPresent, `${label} did not return a signed playback URL.`);
  expect([200, 206].includes(playback.audioStatus), `${label} signed audio URL did not stream.`);

  return {
    sim: {
      id: simRow.id,
      audioPath: simRow.audio_path,
    },
    summary: {
      finalizeStatus: finalizeResponse.status(),
      simId: simRow.id,
      durationMs: simRow.duration_ms,
      audioMime: simRow.audio_mime,
      audioObjectExists,
      eventCount: Array.isArray(simRow.events) ? simRow.events.length : null,
      eventTypes,
      playback,
      savedAttempt: {
        id: savedAttempt.id,
        simId: savedAttempt.sim_id,
        durationMs: savedAttempt.duration_ms,
        audioSizeBytes: savedAttempt.audio_size_bytes,
        eventsCount: savedAttempt.events_count,
        audioPathPresent: Boolean(savedAttempt.audio_path),
      },
    },
  };
}

async function verifyNegativePaths() {
  const badFinalize = await page.evaluate(async ({ lessonId, secondSimId }) => {
    const fakeId = crypto.randomUUID();
    const response = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: fakeId,
        duration_ms: 1234,
        audio_duration_ms: 1234,
        audio_mime: "audio/webm",
        audio_upload_path: `${lessonId}/${fakeId}.webm`,
        deck_snapshot: [],
        events: [],
      }),
    });
    const body = await response.json().catch(() => null);
    const current = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
      credentials: "include",
    }).then((r) => r.json());
    return {
      status: response.status,
      error: body?.error || null,
      currentStillSecond: unwrapSim(current)?.id === secondSimId,
    };

    function unwrapSim(payload) {
      return payload?.sim?.sim ?? payload?.sim ?? payload;
    }
  }, { lessonId, secondSimId });

  expect(badFinalize.status === 400, "Missing-audio finalize should fail with 400.");
  expect(badFinalize.currentStillSecond, "Missing-audio finalize replaced the existing sim.");
  summary.apiNegative.badFinalizeMissingAudio = badFinalize;

  const patchResult = await page.evaluate(async ({ lessonId, simId }) => {
    const response = await fetch(`/api/teacher/lessons/${lessonId}/sims/${simId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clip_segments: [{ start: 0, end: 0.5 }] }),
    });
    const body = await response.json().catch(() => null);
    const sim = body?.sim?.sim ?? body?.sim ?? body;
    return {
      status: response.status,
      clipCount: Array.isArray(sim?.clip_segments) ? sim.clip_segments.length : null,
    };
  }, { lessonId, simId: secondSimId });

  expect(patchResult.status === 200 && patchResult.clipCount === 1, "Sim edit PATCH failed.");
  summary.ui.editPatch = patchResult;

  await must(
    "publish smoke lesson",
    supabase
      .from("lessons")
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq("id", lessonId)
  );

  const publishedLock = await page.evaluate(async ({ lessonId, secondSimId }) => {
    const upload = await fetch(`/api/teacher/lessons/${lessonId}/sims/audio-upload`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_mime: "audio/webm", audio_size_bytes: 10 }),
    });
    const create = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        duration_ms: 100,
        deck_snapshot: [],
        events: [],
      }),
    });
    const get = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
      credentials: "include",
    });
    const getBody = await get.json().catch(() => null);
    const sim = getBody?.sim?.sim ?? getBody?.sim ?? getBody;
    return {
      uploadStatus: upload.status,
      createStatus: create.status,
      getStatus: get.status,
      getStillSecond: sim?.id === secondSimId,
    };
  }, { lessonId, secondSimId });

  expect(publishedLock.uploadStatus === 409, "Published upload should be blocked.");
  expect(publishedLock.createStatus === 409, "Published create should be blocked.");
  expect(publishedLock.getStatus === 200 && publishedLock.getStillSecond, "Published GET should still return the existing sim.");
  summary.apiNegative.publishedLessonLock = publishedLock;
}

async function verifyFinalDatabaseState() {
  const finalSim = await must(
    "load final sim",
    supabase
      .from("lesson_sims")
      .select("id, events, audio_path, clip_segments, deck_snapshot, recorded_by")
      .eq("lesson_id", lessonId)
      .single()
  );
  const statuses = await must(
    "load smoke save attempt statuses",
    supabase.from("sim_save_attempts").select("status").eq("lesson_id", lessonId)
  );

  const finalAudioObjectExists = await storageObjectExists(finalSim.audio_path);
  summary.dbVerification = {
    finalSimIdMatchesSecond: finalSim.id === secondSimId,
    finalAudioObjectExists,
    finalRecordedByMatchesTempUser: finalSim.recorded_by === userId,
    finalEventCount: Array.isArray(finalSim.events) ? finalSim.events.length : null,
    finalDeckSlideCount: Array.isArray(finalSim.deck_snapshot) ? finalSim.deck_snapshot.length : null,
    finalClipSegmentCount: Array.isArray(finalSim.clip_segments) ? finalSim.clip_segments.length : null,
    saveAttemptStatusCounts: statuses.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {}),
    pageErrors,
    browserConsoleCount: browserConsole.length,
  };

  expect(summary.dbVerification.finalSimIdMatchesSecond, "Final DB sim does not match second recording.");
  expect(finalAudioObjectExists, "Final audio object is missing.");
  expect(summary.dbVerification.finalClipSegmentCount === 1, "Final clip segment edit was not persisted.");
}

async function cleanup() {
  try {
    if (browser) await browser.close();
  } catch {
    // ignore
  }

  try {
    await supabase.from("sim_save_attempts").delete().eq("lesson_id", lessonId);
    summary.cleanup.attemptsDeleted = true;
  } catch (error) {
    summary.cleanup.attemptsDeleted = String(error.message || error);
  }

  try {
    await supabase.from("lessons").update({ is_published: false }).eq("id", lessonId);
  } catch {
    // ignore
  }

  try {
    const { data: objects } = await supabase.storage.from(SIM_AUDIO_BUCKET).list(lessonId, {
      limit: 1000,
    });
    const paths = (objects || []).map((object) => `${lessonId}/${object.name}`);
    if (paths.length > 0) {
      await supabase.storage.from(SIM_AUDIO_BUCKET).remove(paths);
    }
    summary.cleanup.storageObjectsRemoved = paths.length;
  } catch (error) {
    summary.cleanup.storageObjectsRemoved = String(error.message || error);
  }

  try {
    await supabase.from("lessons").delete().eq("id", lessonId);
    summary.cleanup.lessonDeleted = true;
  } catch (error) {
    summary.cleanup.lessonDeleted = String(error.message || error);
  }

  try {
    if (userId) await supabase.auth.admin.deleteUser(userId);
    summary.cleanup.userDeleted = Boolean(userId);
  } catch (error) {
    summary.cleanup.userDeleted = String(error.message || error);
  }
}

async function getPlaybackProbe() {
  return page.evaluate(async ({ lessonId }) => {
    const response = await fetch(`/api/teacher/lessons/${lessonId}/sims`, {
      credentials: "include",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, body };
    const payload = body?.sim ?? body;
    const sim = payload?.sim ?? payload;
    const audioUrl = payload?.audio_url;
    let audioStatus = null;
    let contentType = null;
    let rangeLength = null;
    if (audioUrl) {
      const audioResponse = await fetch(audioUrl, { headers: { Range: "bytes=0-63" } });
      audioStatus = audioResponse.status;
      contentType = audioResponse.headers.get("content-type");
      rangeLength = (await audioResponse.arrayBuffer()).byteLength;
    }
    return {
      ok: true,
      status: response.status,
      simId: sim?.id,
      durationMs: sim?.duration_ms,
      eventCount: Array.isArray(sim?.events) ? sim.events.length : null,
      audioUrlPresent: Boolean(audioUrl),
      audioStatus,
      contentType,
      rangeLength,
    };
  }, { lessonId });
}

async function waitForNewSavedAttempt(previousIds) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const rows = await must(
      "poll saved attempts",
      supabase
        .from("sim_save_attempts")
        .select("id, status, sim_id, audio_path, duration_ms, audio_size_bytes, events_count, created_at")
        .eq("lesson_id", lessonId)
        .eq("status", "saved")
        .order("created_at", { ascending: false })
        .limit(10)
    );
    const found = rows.find((row) => !previousIds.has(row.id));
    if (found) return found;
    await sleep(500);
  }
  throw new Error("Timed out waiting for a new saved attempt row.");
}

async function storageObjectExists(objectPath) {
  if (!objectPath) return false;
  const parts = objectPath.split("/");
  const name = parts.pop();
  const directory = parts.join("/");
  const { data, error } = await supabase.storage.from(SIM_AUDIO_BUCKET).list(directory, {
    limit: 100,
  });
  if (error) return false;
  return (data || []).some((object) => object.name === name);
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function makeSlide(id, sequence, title) {
  return {
    id,
    type: sequence === 1 ? "title" : "content",
    sequence,
    is_required: true,
    timestamp_seconds: 0,
    title_ar: title,
    title_en: title,
    body_ar: sequence === 1 ? "اختبار تسجيل حي" : "نص اختبار مع مسافات alpha beta gamma",
    body_en: sequence === 1 ? "Live production recording test" : "Test content with spaces alpha beta gamma",
    speaker_notes_ar: "ملاحظات المتحدث لاختبار الحفظ",
    speaker_notes_en: "Speaker notes for save verification",
    visual_hint: "",
    bullets_ar: sequence === 1 ? null : ["نقطة أولى", "نقطة ثانية"],
    bullets_en: sequence === 1 ? null : ["First point", "Second point"],
    reveal_items_ar: null,
    reveal_items_en: null,
    image_url: null,
    image_fit: "contain",
    image_position_x: 50,
    image_position_y: 50,
    image_zoom: 1,
    layout: "default",
    title_size: "lg",
    body_size: "md",
    text_align: "center",
    lesson_phase: sequence === 1 ? "title" : "core_teaching",
    idea_focus_en: null,
    idea_focus_ar: null,
    vocabulary_word_en: null,
    vocabulary_word_ar: null,
    say_it_twice_prompt: false,
    practice_question_count: null,
    representation_stage: "not_applicable",
    interaction_type: null,
    interaction_prompt_ar: null,
    interaction_prompt_en: null,
    interaction_expected_answer_ar: null,
    interaction_expected_answer_en: null,
    interaction_options_ar: null,
    interaction_options_en: null,
    interaction_correct_index: null,
    interaction_true_false_answer: null,
    interaction_count_target: null,
    interaction_visual_emoji: null,
    interaction_items_ar: null,
    interaction_items_en: null,
    interaction_targets_ar: null,
    interaction_targets_en: null,
    interaction_solution_map: null,
    interaction_free_entry: null,
    interaction_hotspots: null,
    activity_id: null,
    annotations: null,
    exploration_widget_type: null,
    exploration_config: null,
    progressive_reveal: sequence === 2,
    entrance_animation: "fade",
  };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)=([\s\S]*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "The production sim smoke test requires Playwright. Run `npm install`, then `npx playwright install chromium` if Chromium is not already installed."
    );
  }
}

function isLocalSupabaseUrl(url) {
  return /127\.0\.0\.1|localhost/.test(url);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
