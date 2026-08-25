import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

interface PathRow {
  id: string;
}

export interface PathWeekRow {
  id: string;
  path_id: string;
  week_number: number;
}

export interface PathStepRow {
  lesson_id: string;
  sequence: number;
  week_id: string;
}

export interface NavigationLesson {
  id: string;
  title_ar: string;
  title_en: string;
}

export interface LessonNavigation {
  previous: NavigationLesson | null;
  next: NavigationLesson | null;
  source: "learning_path" | "subject_order";
}

export function buildLearningPathLessonOrder(
  weeks: PathWeekRow[],
  steps: PathStepRow[],
): string[] {
  const weekById = new Map(weeks.map((week) => [week.id, week]));

  return [...steps]
    .filter((step) => weekById.has(step.week_id))
    .sort((left, right) => {
      const leftWeek = weekById.get(left.week_id)!;
      const rightWeek = weekById.get(right.week_id)!;
      return (
        leftWeek.week_number - rightWeek.week_number ||
        left.sequence - right.sequence ||
        left.lesson_id.localeCompare(right.lesson_id)
      );
    })
    .map((step) => step.lesson_id);
}

export function getAdjacentLessonIds(
  orderedLessonIds: string[],
  currentLessonId: string,
): { previousId: string | null; nextId: string | null } {
  const currentIndex = orderedLessonIds.indexOf(currentLessonId);
  if (currentIndex < 0) return { previousId: null, nextId: null };

  return {
    previousId: currentIndex > 0 ? orderedLessonIds[currentIndex - 1] : null,
    nextId: currentIndex < orderedLessonIds.length - 1
      ? orderedLessonIds[currentIndex + 1]
      : null,
  };
}

async function loadPathOrderContainingLesson(
  supabase: SupabaseClient<Database>,
  subjectId: string,
  currentLessonId: string,
): Promise<string[] | null> {
  const { data: paths, error: pathsError } = await supabase
    .from("learning_paths")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  if (pathsError || !paths?.length) return null;

  const pathRows = paths as PathRow[];
  const { data: weeks, error: weeksError } = await supabase
    .from("learning_path_weeks")
    .select("id, path_id, week_number")
    .in("path_id", pathRows.map((path) => path.id));

  if (weeksError || !weeks?.length) return null;

  const weekRows = weeks as PathWeekRow[];
  const { data: steps, error: stepsError } = await supabase
    .from("learning_path_steps")
    .select("week_id, lesson_id, sequence")
    .in("week_id", weekRows.map((week) => week.id));

  if (stepsError || !steps?.length) return null;

  const stepRows = steps as PathStepRow[];
  for (const path of pathRows) {
    const pathWeeks = weekRows.filter((week) => week.path_id === path.id);
    const pathWeekIds = new Set(pathWeeks.map((week) => week.id));
    const pathSteps = stepRows.filter((step) => pathWeekIds.has(step.week_id));
    const order = buildLearningPathLessonOrder(pathWeeks, pathSteps);
    if (order.includes(currentLessonId)) {
      const { data: publishedLessons, error: publishedLessonsError } = await supabase
        .from("lessons")
        .select("id")
        .in("id", order)
        .eq("is_published", true);
      if (publishedLessonsError) return order;
      const publishedIds = new Set((publishedLessons ?? []).map((lesson) => lesson.id));
      const publishedOrder = order.filter((lessonId) => publishedIds.has(lessonId));
      return publishedOrder.includes(currentLessonId) ? publishedOrder : order;
    }
  }

  return null;
}

async function loadNavigationLessons(
  supabase: SupabaseClient<Database>,
  previousId: string | null,
  nextId: string | null,
): Promise<{ previous: NavigationLesson | null; next: NavigationLesson | null }> {
  const ids = [previousId, nextId].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { previous: null, next: null };

  const { data } = await supabase
    .from("lessons")
    .select("id, title_ar, title_en")
    .in("id", ids)
    .eq("is_published", true);
  const lessonById = new Map((data ?? []).map((lesson) => [lesson.id, lesson]));

  return {
    previous: previousId ? lessonById.get(previousId) ?? null : null,
    next: nextId ? lessonById.get(nextId) ?? null : null,
  };
}

export async function loadLessonNavigation(
  supabase: SupabaseClient<Database>,
  subjectId: string,
  currentLessonId: string,
): Promise<LessonNavigation> {
  const pathOrder = await loadPathOrderContainingLesson(supabase, subjectId, currentLessonId);
  if (pathOrder) {
    const adjacent = getAdjacentLessonIds(pathOrder, currentLessonId);
    return {
      ...(await loadNavigationLessons(supabase, adjacent.previousId, adjacent.nextId)),
      source: "learning_path",
    };
  }

  const { data: subjectLessons } = await supabase
    .from("lessons")
    .select("id, title_ar, title_en, display_order, created_at")
    .eq("subject_id", subjectId)
    .eq("is_published", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const lessons = subjectLessons ?? [];
  const adjacent = getAdjacentLessonIds(lessons.map((lesson) => lesson.id), currentLessonId);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  return {
    previous: adjacent.previousId ? lessonById.get(adjacent.previousId) ?? null : null,
    next: adjacent.nextId ? lessonById.get(adjacent.nextId) ?? null : null,
    source: "subject_order",
  };
}
