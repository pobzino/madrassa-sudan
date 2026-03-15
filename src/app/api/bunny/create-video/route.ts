import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    const { title, lessonId } = await request.json();
    if (!title || !lessonId) {
      return NextResponse.json(
        { error: "title and lessonId required" },
        { status: 400 }
      );
    }

    // Verify teacher owns the lesson
    const { data: lesson } = await supabase
      .from("lessons")
      .select("created_by")
      .eq("id", lessonId)
      .single();

    if (!lesson || lesson.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create video in Bunny Stream
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;

    if (!libraryId || !apiKey) {
      return NextResponse.json(
        { error: "Bunny Stream not configured" },
        { status: 500 }
      );
    }

    const bunnyRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos`,
      {
        method: "POST",
        headers: {
          AccessKey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      }
    );

    if (!bunnyRes.ok) {
      const errText = await bunnyRes.text();
      console.error("Bunny create-video error:", errText);
      return NextResponse.json(
        { error: "Failed to create video" },
        { status: 502 }
      );
    }

    const { guid: videoId } = await bunnyRes.json();

    // Generate TUS upload signature: SHA256(libraryId + apiKey + expirationTime + videoId)
    const expirationTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    const signature = crypto
      .createHash("sha256")
      .update(libraryId + apiKey + expirationTime + videoId)
      .digest("hex");

    return NextResponse.json({
      videoId,
      libraryId,
      tusEndpoint: "https://video.bunnycdn.com/tusupload",
      authSignature: signature,
      authExpire: expirationTime,
    });
  } catch (error) {
    console.error("create-video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
