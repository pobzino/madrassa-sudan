import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import type { HomeStats } from "@/lib/home-stats";

// Known minimums from the admin dashboard (Oct 2026). Live counts only ever raise
// these, so a failed query or a missing service key never shows a smaller number.
const FLOOR: HomeStats = {
  signups: 680,
  lessonsCompleted: 430,
  practiceAttempts: 490,
  live: false,
};

async function loadHomeStatsUncached(): Promise<HomeStats> {
  if (!hasServiceRoleConfig()) return FLOOR;

  try {
    const supabase = createServiceClient();
    const [profiles, lessons, practice] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("lesson_progress")
        .select("id", { count: "exact", head: true })
        .not("completed_at", "is", null),
      supabase
        .from("homework_attempts")
        .select("id, homework_assignments!inner(is_practice)", { count: "exact", head: true })
        .eq("homework_assignments.is_practice", true),
    ]);

    const counts = [profiles.count, lessons.count, practice.count];
    const live = counts.every((count) => typeof count === "number") && !profiles.error && !lessons.error && !practice.error;
    return {
      signups: Math.max(FLOOR.signups, profiles.count ?? 0),
      lessonsCompleted: Math.max(FLOOR.lessonsCompleted, lessons.count ?? 0),
      practiceAttempts: Math.max(FLOOR.practiceAttempts, practice.count ?? 0),
      live,
    };
  } catch (error) {
    console.error("Failed to load home page stats", error);
    return FLOOR;
  }
}

// Short-lived so the home page counters feel live without querying per visitor.
export const loadHomeStats = unstable_cache(loadHomeStatsUncached, ["public-home-stats-v2"], {
  revalidate: 30,
  tags: ["public-home-stats-v2"],
});
