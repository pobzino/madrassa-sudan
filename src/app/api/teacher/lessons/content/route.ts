import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type ContentBlockInput = {
  language: "ar" | "en";
  content: string;
  source_type?: string;
  sequence?: number;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const lessonId = body.lesson_id as string | undefined;
    const blocks = (body.blocks as ContentBlockInput[] | undefined) || [];

    if (!lessonId) {
      return NextResponse.json({ error: "lesson_id is required" }, { status: 400 });
    }

    const service = createServiceClient();

    await service.from("lesson_content_blocks").delete().eq("lesson_id", lessonId);

    if (blocks.length > 0) {
      const sanitized = blocks
        .filter((block) => block.content && block.content.trim().length > 0)
        .map((block, index) => ({
          lesson_id: lessonId,
          language: block.language,
          content: block.content.trim(),
          source_type: block.source_type || "lesson",
          sequence: block.sequence ?? index,
        }));

      if (sanitized.length > 0) {
        const { error } = await service.from("lesson_content_blocks").insert(sanitized);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save lesson content" }, { status: 500 });
  }
}
