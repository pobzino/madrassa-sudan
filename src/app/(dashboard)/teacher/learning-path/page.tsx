"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { BoltIcon, RefreshIcon } from "@/components/icons/AmalIcons";
import { createClient } from "@/lib/supabase/client";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import MilestoneBlockCard from "@/components/milestones/MilestoneBlockCard";
import PlacementBlockCard from "@/components/milestones/PlacementBlockCard";
import FinalBlockCard from "@/components/milestones/FinalBlockCard";
import { MILESTONE_WEEKS_PER_BLOCK, type TeacherMilestoneListResponse } from "@/lib/milestones/types";

const LESSONS_PER_WEEK = 2;
/** A Big Challenge follows every 4 weeks: every 8 ordered lessons. */
const LESSONS_PER_BLOCK = MILESTONE_WEEKS_PER_BLOCK * LESSONS_PER_WEEK;

const MILESTONE_ERRORS: Record<string, string> = {
  unpublish_first: "Unpublish it first: a live challenge can't be regenerated.",
  block_incomplete: "All 4 weeks need lessons before a challenge can be drafted.",
  generation_failed: "The AI couldn't draft enough good questions. Try again.",
  pool_too_small: "Not enough auto-marked questions for the battle size yet.",
  publish_forbidden: "Only an approved admin or the path's teacher can publish this.",
  pool_unbalanced: "A starting boss needs at least 3 easy, 3 medium and 3 hard questions.",
};

/** The starting boss (placement) uses week 0 in these handlers; the final boss ("The Grand Challenge") uses -1. */
const FINAL_WEEK = -1;
const PLACEMENT_WEEK = 0;

interface SubjectRow {
  id: string;
  name_ar: string | null;
  name_en: string | null;
}

interface LessonItem {
  id: string;
  title: string;
}

interface StepPracticeInfo {
  stepId: string;
  practiceAssignmentId: string | null;
}

// A boss-generation job's progress is polled; the job id is kept in localStorage so a
// reopened page (a phone that switched apps) picks the job back up.
const jobKey = (pathId: string, afterWeekNumber: number) => `amal.bossJob:${pathId}:${afterWeekNumber}`;
function readJobId(pathId: string, afterWeekNumber: number) {
  try {
    return window.localStorage.getItem(jobKey(pathId, afterWeekNumber));
  } catch {
    return null;
  }
}
function writeJobId(pathId: string, afterWeekNumber: number, jobId: string | null) {
  try {
    if (jobId) window.localStorage.setItem(jobKey(pathId, afterWeekNumber), jobId);
    else window.localStorage.removeItem(jobKey(pathId, afterWeekNumber));
  } catch {
    /* no storage: the page just cannot resume */
  }
}

export default function LearningPathEditorPage() {
  const { loading: authLoading } = useTeacherGuard();
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [ordered, setOrdered] = useState<LessonItem[]>([]);
  const [available, setAvailable] = useState<LessonItem[]>([]);
  const [loadingPath, setLoadingPath] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // lessonId -> saved step + its practice; used for the Generate/Vet controls.
  const [stepByLesson, setStepByLesson] = useState<Record<string, StepPracticeInfo>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<TeacherMilestoneListResponse | null>(null);
  const [milestoneBusy, setMilestoneBusy] = useState<number | null>(null);
  const [generatingBlock, setGeneratingBlock] = useState<number | null>(null);
  /** "Generate all bosses" is running: every slot's job was started and is being followed. */
  const [generatingAll, setGeneratingAll] = useState(false);

  const loadMilestones = useCallback(async (subjectId: string) => {
    if (!subjectId) return;
    try {
      const res = await fetch(`/api/teacher/milestones?subject_id=${encodeURIComponent(subjectId)}`, { cache: "no-store" });
      setMilestones(res.ok ? ((await res.json()) as TeacherMilestoneListResponse) : null);
    } catch {
      setMilestones(null);
    }
  }, []);

  const milestoneAt = (afterWeekNumber: number) =>
    afterWeekNumber === PLACEMENT_WEEK
      ? milestones?.placement ?? null
      : afterWeekNumber === FINAL_WEEK
        ? milestones?.final ?? null
        : milestones?.blocks.find((b) => b.afterWeekNumber === afterWeekNumber)?.milestone ?? null;
  const bossLabel = (afterWeekNumber: number) =>
    afterWeekNumber === PLACEMENT_WEEK ? "starting boss" : afterWeekNumber === FINAL_WEEK ? "Grand Challenge" : "Big Challenge";

  const pollJob = useCallback(async (pathId: string, afterWeekNumber: number, jobId: string, progress: string | number) => {
    const what = bossLabel(afterWeekNumber);
    setGeneratingBlock(afterWeekNumber);
    try {
      for (;;) {
        const res = await fetch(`/api/teacher/milestones/generate/status?job=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        if (res.status === 404) throw new Error("This generation is no longer tracked. Generate again.");
        const job = (await res.json().catch(() => ({}))) as { status?: string; progressDone?: number; progressTotal?: number; message?: string | null; warnings?: string[] };
        if (!res.ok) throw new Error(job.message ?? "Could not read the generation's progress.");
        if (job.status === "done") {
          writeJobId(pathId, afterWeekNumber, null);
          toast.success(afterWeekNumber === PLACEMENT_WEEK ? "Starting boss draft ready: review the tags before publishing" : `${what === "Grand Challenge" ? "Grand Challenge" : "Big Challenge"} draft ready: review it before publishing`, { id: progress });
          for (const warning of job.warnings ?? []) toast.warning(warning, { duration: 12000 });
          return;
        }
        if (job.status === "failed") {
          writeJobId(pathId, afterWeekNumber, null);
          toast.error(job.message ?? `Generating the ${what} failed.`, { id: progress });
          return;
        }
        toast.loading(
          job.progressTotal ? `Writing questions: ${job.progressDone ?? 0} of ${job.progressTotal} lessons` : `Planning the ${what}...`,
          { id: progress },
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error) {
      writeJobId(pathId, afterWeekNumber, null);
      toast.error(error instanceof Error ? error.message : "Generation failed", { id: progress });
    } finally {
      setGeneratingBlock(null);
      await loadMilestones(selectedSubject);
    }
  }, [loadMilestones, selectedSubject]);

  const generateMilestone = async (afterWeekNumber: number) => {
    if (!milestones?.pathId) return;
    const placement = afterWeekNumber === PLACEMENT_WEEK;
    const final = afterWeekNumber === FINAL_WEEK;
    const existing = milestoneAt(afterWeekNumber);
    if (existing && !window.confirm("Replace this draft's questions with a newly generated set?")) return;
    setGeneratingBlock(afterWeekNumber);
    const what = bossLabel(afterWeekNumber);
    const progress = toast.loading(`Starting the ${what}...`);
    try {
      const res = await fetch("/api/teacher/milestones/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          placement
            ? { path_id: milestones.pathId, kind: "placement" }
            : final
              ? { path_id: milestones.pathId, final: true }
              : { path_id: milestones.pathId, after_week_number: afterWeekNumber }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; jobId?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.message ?? MILESTONE_ERRORS[data.error ?? ""] ?? `Generation failed: ${data.error ?? `error ${res.status}`}`);
      if (res.status === 202 && data.jobId) {
        // The deployed site: the server does the work; this page (or a reopened one) follows it.
        writeJobId(milestones.pathId, afterWeekNumber, data.jobId);
        toast.loading(`Generating the ${what}: you can leave this page and come back.`, { id: progress });
        await pollJob(milestones.pathId, afterWeekNumber, data.jobId, progress);
        return;
      }
      toast.success(placement ? "Starting boss draft ready: review the tags before publishing" : `${final ? "Grand Challenge" : "Big Challenge"} draft ready: review it before publishing`, { id: progress });
      for (const warning of data.warnings ?? []) toast.warning(warning, { duration: 12000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed", { id: progress });
    } finally {
      setGeneratingBlock(null);
      await loadMilestones(selectedSubject);
    }
  };

  /** Every boss of the path: the starting boss, each 4-week block, the Grand Challenge. */
  const allBossSlots = () => [PLACEMENT_WEEK, ...(milestones?.blocks.map((b) => b.afterWeekNumber) ?? []), ...(milestones?.lastWeekNumber ? [FINAL_WEEK] : [])];

  /**
   * One click for the whole path: starts a background job per boss (unpublishing
   * first when regenerating), then follows them all. Published bosses are left
   * alone unless `regenerate`.
   */
  const generateAll = async (regenerate: boolean) => {
    if (!milestones?.pathId || generatingAll || generatingBlock !== null) return;
    const pathId = milestones.pathId;
    const slots = allBossSlots();
    if (regenerate && !window.confirm(`Unpublish and regenerate every boss on this path (${slots.length})? Children in a battle right now will be reset; nothing is published until you review each draft.`)) return;
    setGeneratingAll(true);
    const started: Array<{ week: number; jobId: string }> = [];
    try {
      for (const week of slots) {
        const existing = milestoneAt(week);
        const what = bossLabel(week);
        if (existing?.status === "published") {
          if (!regenerate) continue;
          const res = await fetch(`/api/teacher/milestones/${existing.id}/unpublish`, { method: "POST" });
          if (!res.ok) {
            toast.error(`Could not unpublish the ${what}`);
            continue;
          }
        }
        const body =
          week === PLACEMENT_WEEK ? { path_id: pathId, kind: "placement" } : week === FINAL_WEEK ? { path_id: pathId, final: true } : { path_id: pathId, after_week_number: week };
        const res = await fetch("/api/teacher/milestones/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; jobId?: string };
        if (!res.ok) {
          toast.error(`${what}: ${data.message ?? MILESTONE_ERRORS[data.error ?? ""] ?? `error ${res.status}`}`);
          continue;
        }
        if (res.status === 202 && data.jobId) {
          writeJobId(pathId, week, data.jobId);
          started.push({ week, jobId: data.jobId });
        } else toast.success(`${what} draft ready`);
      }
      if (!started.length) {
        toast.message(regenerate ? "Nothing to regenerate." : "Every boss is already published. Use Regenerate all to replace them.");
        return;
      }
      toast.message(`Generating ${started.length} bosses in the background: you can leave this page and come back.`, { duration: 8000 });
      await Promise.all(started.map(({ week, jobId }) => pollJob(pathId, week, jobId, toast.loading(`Starting the ${bossLabel(week)}...`))));
    } finally {
      setGeneratingAll(false);
      await loadMilestones(selectedSubject);
    }
  };

  // A job started earlier (this page or another) is picked back up.
  useEffect(() => {
    const pathId = milestones?.pathId;
    if (!pathId || generatingBlock !== null) return;
    const weeks = [PLACEMENT_WEEK, FINAL_WEEK, ...(milestones?.blocks.map((b) => b.afterWeekNumber) ?? [])];
    for (const week of weeks) {
      const jobId = readJobId(pathId, week);
      if (jobId) {
        void pollJob(pathId, week, jobId, toast.loading("Checking on the generation..."));
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones?.pathId]);

  const setPlacementRequired = async (required: boolean) => {
    const m = milestones?.placement;
    if (!m) return;
    setMilestoneBusy(PLACEMENT_WEEK);
    try {
      const res = await fetch(`/api/teacher/milestones/${m.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ required }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.message ?? MILESTONE_ERRORS[data.error] ?? "Could not save");
      else toast.success(required ? "Week 1 now waits for the starting boss" : "Week 1 opens without the starting boss");
    } finally {
      setMilestoneBusy(null);
      await loadMilestones(selectedSubject);
    }
  };

  const setMilestoneLive = async (afterWeekNumber: number, live: boolean) => {
    const m = milestoneAt(afterWeekNumber);
    if (!m) return;
    const what = bossLabel(afterWeekNumber);
    if (!live && !window.confirm(`Unpublish this ${what}? Any games children are playing now will be reset.`)) return;
    setMilestoneBusy(afterWeekNumber);
    try {
      const res = await fetch(`/api/teacher/milestones/${m.id}/${live ? "publish" : "unpublish"}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(MILESTONE_ERRORS[data.error] ?? `Failed: ${data.message ?? data.error ?? "unknown error"}`);
      else toast.success(`${afterWeekNumber === PLACEMENT_WEEK ? "Starting boss" : afterWeekNumber === FINAL_WEEK ? "Grand Challenge" : "Big Challenge"} ${live ? "published" : "unpublished"}`);
    } finally {
      setMilestoneBusy(null);
      await loadMilestones(selectedSubject);
    }
  };

  // Load subjects that actually have published lessons.
  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    (async () => {
      const { data: lessons } = await supabase
        .from("lessons")
        .select("subject_id")
        .eq("is_published", true);
      const subjectIds = new Set(
        (lessons || []).map((l) => l.subject_id).filter(Boolean) as string[]
      );
      const { data: subjectRows } = await supabase
        .from("subjects")
        .select("id, name_ar, name_en")
        .order("display_order");
      const withLessons = (subjectRows || []).filter((s) => subjectIds.has(s.id));
      setSubjects(withLessons);
      if (withLessons.length > 0) setSelectedSubject(withLessons[0].id);
    })();
  }, [authLoading]);

  const loadPath = useCallback(async (subjectId: string) => {
    if (!subjectId) return;
    setLoadingPath(true);
    setDirty(false);
    const supabase = createClient();
    const db = supabase as unknown as SupabaseClient;

    // All published lessons for this subject (title lookup + "available" pool).
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("id, title_ar, title_en")
      .eq("subject_id", subjectId)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    const titleById = new Map(
      (lessonRows || []).map((l) => [
        l.id,
        l.title_ar || l.title_en || "Untitled lesson",
      ])
    );

    // The published path and its ordered lessons.
    const { data: path } = await db
      .from("learning_paths")
      .select("id")
      .eq("subject_id", subjectId)
      .eq("is_published", true)
      .maybeSingle<{ id: string }>();

    let orderedIds: string[] = [];
    setStepByLesson({});
    if (path) {
      const { data: weeks } = await db
        .from("learning_path_weeks")
        .select("id, week_number")
        .eq("path_id", path.id)
        .order("week_number", { ascending: true })
        .returns<Array<{ id: string; week_number: number }>>();
      const weekOrder = new Map((weeks ?? []).map((w, i) => [w.id, i]));

      if (weeks && weeks.length > 0) {
        const { data: steps } = await db
          .from("learning_path_steps")
          .select("id, week_id, lesson_id, sequence, practice_assignment_id")
          .in(
            "week_id",
            weeks.map((w) => w.id)
          )
          .returns<Array<{ id: string; week_id: string; lesson_id: string; sequence: number; practice_assignment_id: string | null }>>();
        const stepMap: Record<string, StepPracticeInfo> = {};
        for (const st of steps ?? []) {
          stepMap[st.lesson_id] = { stepId: st.id, practiceAssignmentId: st.practice_assignment_id };
        }
        setStepByLesson(stepMap);
        orderedIds = (steps ?? [])
          .slice()
          .sort((a, b) => {
            const wa = weekOrder.get(a.week_id) ?? 0;
            const wb = weekOrder.get(b.week_id) ?? 0;
            return wa !== wb ? wa - wb : a.sequence - b.sequence;
          })
          .map((s) => s.lesson_id)
          // Keep only lessons that still exist & are published.
          .filter((id) => titleById.has(id));
      }
    }

    const inPath = new Set(orderedIds);
    setOrdered(orderedIds.map((id) => ({ id, title: titleById.get(id) || "Lesson" })));
    setAvailable(
      (lessonRows || [])
        .filter((l) => !inPath.has(l.id))
        .map((l) => ({ id: l.id, title: titleById.get(l.id) || "Lesson" }))
    );
    setLoadingPath(false);
  }, []);

  useEffect(() => {
    if (!selectedSubject) return;
    void loadPath(selectedSubject);
    const timer = window.setTimeout(() => void loadMilestones(selectedSubject), 0);
    return () => window.clearTimeout(timer);
  }, [selectedSubject, loadPath, loadMilestones]);

  const move = (index: number, delta: number) => {
    setOrdered((prev) => {
      const next = prev.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const removeAt = (index: number) => {
    setOrdered((prev) => {
      const item = prev[index];
      if (item) setAvailable((a) => [{ ...item }, ...a]);
      return prev.filter((_, i) => i !== index);
    });
    setDirty(true);
  };

  const addLesson = (lesson: LessonItem) => {
    setOrdered((prev) => [...prev, lesson]);
    setAvailable((prev) => prev.filter((l) => l.id !== lesson.id));
    setDirty(true);
  };

  const generatePractice = async (lessonId: string) => {
    const info = stepByLesson[lessonId];
    if (!info) return;
    if (
      info.practiceAssignmentId &&
      !window.confirm(
        "Replace this unreviewed Practice draft with a newly generated set? Approved Practices are protected and will open unchanged."
      )
    ) {
      return;
    }
    setGeneratingFor(lessonId);
    try {
      const res = await fetch("/api/teacher/learning-path/generate-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: info.stepId, num_questions: 10 }),
      });
      const text = await res.text();
      const lastLine = text.trim().split("\n").pop() ?? "";
      const data = JSON.parse(lastLine) as {
        assignment_id?: string;
        error?: string;
        generated?: boolean;
        review_protected?: boolean;
      };
      if (!res.ok || data.error || !data.assignment_id) {
        toast.error("Practice generation failed: " + (data.error || "Unknown error"));
      } else {
        setStepByLesson((prev) => ({
          ...prev,
          [lessonId]: { ...info, practiceAssignmentId: data.assignment_id! },
        }));
        if (data.review_protected) {
          toast.info("Approved Practice is protected and was not regenerated");
        } else if (data.generated) {
          toast.success("Practice draft generated — review and approve it before students see it");
        } else {
          toast.info("Existing Practice draft kept");
        }
      }
    } catch {
      toast.error("Practice generation failed");
    } finally {
      setGeneratingFor(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/learning-path", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: selectedSubject,
          ordered_lesson_ids: ordered.map((l) => l.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Save failed: " + (data.error || "Unknown error"));
      } else {
        toast.success("Learning path saved");
        setDirty(false);
        await loadMilestones(selectedSubject);
      }
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Learning Path</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Set the order students move through lessons. Every {LESSONS_PER_WEEK} lessons make a week,
          and each week ends with its test. Every 4 weeks end with a Big Challenge.
        </p>
      </div>

      {/* Subject selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Subject</label>
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
        >
          {subjects.length === 0 && <option value="">No subjects with lessons</option>}
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_en || s.name_ar}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {loadingPath ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {/* Ordered path */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Path order</h2>
              {ordered.length > 0 && milestones?.pathId && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void generateAll(false)}
                    disabled={dirty || generatingAll || generatingBlock !== null || milestoneBusy !== null}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    title={dirty ? "Save the path first" : "Draft every boss that is not published yet (starting boss, each block, the Grand Challenge)"}
                  >
                    {generatingAll ? "Generating all bosses…" : "Generate all bosses"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generateAll(true)}
                    disabled={dirty || generatingAll || generatingBlock !== null || milestoneBusy !== null}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                    title="Unpublish every boss and draft them all again"
                  >
                    Regenerate all
                  </button>
                </div>
              )}
            </div>
            {ordered.length > 0 && (
              <PlacementBlockCard
                placement={milestones?.placement ?? null}
                onToggleRequired={setPlacementRequired}
                hasPath={Boolean(milestones?.pathId)}
                disabled={dirty}
                generating={generatingBlock === PLACEMENT_WEEK}
                busy={generatingBlock !== null || milestoneBusy !== null}
                onGenerate={() => void generateMilestone(PLACEMENT_WEEK)}
                onPublish={() => void setMilestoneLive(PLACEMENT_WEEK, true)}
                onUnpublish={() => void setMilestoneLive(PLACEMENT_WEEK, false)}
              />
            )}
            {ordered.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                No lessons on the path yet. Add lessons below.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ordered.map((lesson, i) => {
                  const weekNumber = Math.floor(i / LESSONS_PER_WEEK) + 1;
                  const startsWeek = i % LESSONS_PER_WEEK === 0;
                  return (
                    <li key={lesson.id}>
                      {startsWeek && (
                        <div className="flex items-center gap-2 mt-3 first:mt-0 mb-1.5">
                          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                            Week {weekNumber}
                          </span>
                          <div className="flex-1 h-px bg-emerald-100" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="w-6 text-center text-xs font-semibold text-gray-400">
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm text-gray-800 truncate">{lesson.title}</span>
                        {stepByLesson[lesson.id] ? (
                          generatingFor === lesson.id ? (
                            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-600">
                              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-amber-600" />
                              Generating…
                            </span>
                          ) : stepByLesson[lesson.id].practiceAssignmentId ? (
                            <span className="flex items-center gap-1">
                              <a
                                href={`/teacher/homework/create?assignment=${stepByLesson[lesson.id].practiceAssignmentId}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                                title="Review and edit the practice questions"
                              >
                                <Check className="h-3 w-3" aria-hidden="true" />
                                Practice · Vet
                              </a>
                              <button
                                onClick={() => generatePractice(lesson.id)}
                                disabled={generatingFor !== null}
                                className="px-2 py-1 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                                title="Regenerate questions from the lesson"
                                aria-label="Regenerate questions from the lesson"
                              >
                                <RefreshIcon className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => generatePractice(lesson.id)}
                              disabled={generatingFor !== null}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-40"
                              title="Generate ~10 auto-marked questions from this lesson"
                            >
                              <BoltIcon className="h-3 w-3" />
                              Generate practice
                            </button>
                          )
                        ) : (
                          <span className="px-2 py-1 text-[11px] text-gray-300" title="Save the path first to enable practice generation">
                            save first
                          </span>
                        )}
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === ordered.length - 1}
                          className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeAt(i)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          aria-label="Remove from path"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {(i + 1) % LESSONS_PER_BLOCK === 0 && (
                        <MilestoneBlockCard
                          afterWeekNumber={(i + 1) / LESSONS_PER_WEEK}
                          block={milestones?.blocks.find((b) => b.afterWeekNumber === (i + 1) / LESSONS_PER_WEEK) ?? null}
                          disabled={dirty}
                          generating={generatingBlock === (i + 1) / LESSONS_PER_WEEK}
                          busy={generatingBlock !== null || milestoneBusy !== null}
                          onGenerate={() => void generateMilestone((i + 1) / LESSONS_PER_WEEK)}
                          onPublish={() => void setMilestoneLive((i + 1) / LESSONS_PER_WEEK, true)}
                          onUnpublish={() => void setMilestoneLive((i + 1) / LESSONS_PER_WEEK, false)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {ordered.length > 0 && (
              <FinalBlockCard
                final={milestones?.final ?? null}
                lastWeekNumber={milestones?.lastWeekNumber ?? null}
                disabled={dirty}
                generating={generatingBlock === FINAL_WEEK}
                busy={generatingBlock !== null || milestoneBusy !== null}
                onGenerate={() => void generateMilestone(FINAL_WEEK)}
                onPublish={() => void setMilestoneLive(FINAL_WEEK, true)}
                onUnpublish={() => void setMilestoneLive(FINAL_WEEK, false)}
              />
            )}
          </div>

          {/* Available lessons */}
          {available.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Not on the path</h2>
              <p className="text-xs text-gray-500 mb-3">Published lessons you can add to the end.</p>
              <ul className="space-y-1.5">
                {available.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2"
                  >
                    <span className="flex-1 text-sm text-gray-700 truncate">{lesson.title}</span>
                    <button
                      onClick={() => addLesson(lesson)}
                      className="px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
