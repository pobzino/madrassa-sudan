import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { ensureLessonPractice } from "@/lib/server/practice-generator";

export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: lessonId } = await params;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: lesson }, role] = await Promise.all([
    supabase.from("lessons").select("created_by").eq("id", lessonId).maybeSingle(),
    getTeacherRole(supabase, user.id),
  ]);
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  if (!role || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  after(async () => {
    try {
      await ensureLessonPractice({
        client: hasServiceRoleConfig() ? createServiceClient() : supabase,
        lessonId,
        createdBy: user.id,
      });
    } catch (error) {
      console.error("Automatic Practice generation failed:", { lessonId, error });
    }
  });

  return NextResponse.json({ queued: true }, { status: 202 });
}
