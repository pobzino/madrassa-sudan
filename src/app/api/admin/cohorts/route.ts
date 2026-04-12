import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify caller is an approved admin
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin" || !adminProfile.is_approved) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all cohorts
    const { data: cohorts, error: cohortsError } = await supabase
      .from("cohorts")
      .select("id, name, description, grade_level, join_code, is_active, created_at")
      .order("created_at", { ascending: false });

    if (cohortsError) {
      console.error("Admin cohorts list error:", cohortsError);
      return NextResponse.json(
        { error: "Failed to load cohorts" },
        { status: 500 }
      );
    }

    // Get teacher names and student counts for each cohort
    const cohortIds = (cohorts || []).map((c) => c.id);

    const teacherMap: Record<string, string[]> = {};
    const studentCountMap: Record<string, number> = {};

    if (cohortIds.length > 0) {
      // Get teachers
      const { data: cohortTeachers } = await supabase
        .from("cohort_teachers")
        .select("cohort_id, teacher:profiles!teacher_id(full_name)")
        .in("cohort_id", cohortIds);

      for (const ct of cohortTeachers || []) {
        const teacher = ct.teacher as unknown as { full_name: string | null };
        const name = teacher?.full_name || "Unknown";
        if (!teacherMap[ct.cohort_id]) teacherMap[ct.cohort_id] = [];
        teacherMap[ct.cohort_id].push(name);
      }

      // Get student counts per cohort
      for (const id of cohortIds) {
        const { count } = await supabase
          .from("cohort_students")
          .select("*", { count: "exact", head: true })
          .eq("cohort_id", id)
          .eq("is_active", true);

        studentCountMap[id] = count || 0;
      }
    }

    const enrichedCohorts = (cohorts || []).map((c) => ({
      ...c,
      teachers: teacherMap[c.id] || [],
      student_count: studentCountMap[c.id] || 0,
    }));

    return NextResponse.json({ cohorts: enrichedCohorts });
  } catch (error) {
    console.error("Admin cohorts GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
