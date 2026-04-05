import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { buildSlideImagePrompt } from "@/lib/ai/slide-image-prompt";

export const maxDuration = 60;
export const runtime = "nodejs";

const DAILY_LIMIT = 30;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const role = await getTeacherRole(supabase, user.id);
    if (!role) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as {
      lessonId?: string;
      slideId?: string;
      prompt?: string;
      slideTitle?: string;
      ideaFocus?: string;
    };

    const lessonId = body.lessonId?.trim();
    const slideId = body.slideId?.trim();
    const prompt = body.prompt?.trim();
    const slideTitle = body.slideTitle?.trim() || null;
    const ideaFocus = body.ideaFocus?.trim() || null;

    if (!lessonId || !slideId || !prompt) {
      return jsonResponse(
        { error: "Missing required fields (lessonId, slideId, prompt)" },
        400
      );
    }

    if (prompt.length > 500) {
      return jsonResponse({ error: "Prompt is too long (max 500 characters)" }, 400);
    }

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, created_by")
      .eq("id", lessonId)
      .single();

    if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return jsonResponse({ error: "Lesson not found" }, 404);
    }

    // Rate limit: count this user's generations in the last 24h via service client.
    const serviceClient = createServiceClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: countError } = await serviceClient
      .from("ai_image_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);

    if (countError) {
      console.error("rate limit count error:", countError);
      return jsonResponse({ error: "Rate limit check failed" }, 500);
    }

    if ((recentCount ?? 0) >= DAILY_LIMIT) {
      return jsonResponse(
        { error: `Daily limit reached (${DAILY_LIMIT} images per day). Try again tomorrow.` },
        429
      );
    }

    const openai = getOpenAIClient();
    if (!openai) {
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    const fullPrompt = buildSlideImagePrompt({
      userPrompt: prompt,
      slideTitle,
      ideaFocus,
    });

    let b64: string | undefined;
    try {
      const result = await openai.images.generate({
        model,
        prompt: fullPrompt,
        size: "1536x1024",
        n: 1,
      });
      b64 = result.data?.[0]?.b64_json;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image generation failed";
      const isPolicy = /safety|policy|content/i.test(message);
      return jsonResponse(
        {
          error: isPolicy
            ? "Your prompt was rejected by the content safety filter. Please rephrase and try again."
            : message,
        },
        isPolicy ? 400 : 502
      );
    }

    if (!b64) {
      return jsonResponse({ error: "Image generation returned no data" }, 502);
    }

    const pngBuffer = Buffer.from(b64, "base64");
    const storagePath = `slides/${slideId}/ai-${crypto.randomUUID()}.png`;

    const { error: uploadError } = await serviceClient.storage
      .from("lessons")
      .upload(storagePath, pngBuffer, {
        cacheControl: "3600",
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("storage upload error:", uploadError);
      return jsonResponse({ error: "Failed to save generated image" }, 500);
    }

    const { data: publicUrlData } = serviceClient.storage
      .from("lessons")
      .getPublicUrl(storagePath);
    const imageUrl = publicUrlData.publicUrl;

    // Audit row. The DB check constraint allows 'scene' | 'owl'; all generations
    // are now single-shot scenes with no owl involvement, so we always use 'scene'.
    await serviceClient.from("ai_image_generations").insert({
      user_id: user.id,
      lesson_id: lessonId,
      slide_id: slideId,
      mode: "scene",
      prompt,
      image_url: imageUrl,
    });

    return jsonResponse({ imageUrl });
  } catch (error) {
    console.error("generate-image error:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
