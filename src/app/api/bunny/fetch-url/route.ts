import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

/**
 * Extract a direct download URL from a Google Drive share link.
 * Supports formats:
 *   - https://drive.google.com/file/d/FILE_ID/view?...
 *   - https://drive.google.com/open?id=FILE_ID
 *   - https://drive.google.com/uc?id=FILE_ID&export=download
 */
function extractGoogleDriveUrl(url: string): string | null {
  // Pattern: /file/d/FILE_ID/
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}&confirm=t`;
  }

  // Pattern: ?id=FILE_ID
  const idMatch = url.match(/drive\.google\.com\/(?:open|uc)\?.*id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/uc?export=download&id=${idMatch[1]}&confirm=t`;
  }

  return null;
}

/**
 * Check if a URL is a direct video link (not a page).
 */
function isDirectVideoUrl(url: string): boolean {
  const videoExtensions = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"];
  const lower = url.toLowerCase().split("?")[0];
  return videoExtensions.some((ext) => lower.endsWith(ext));
}

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

    const role = await getTeacherRole(supabase, user.id);
    if (!role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { url, title, lessonId } = await request.json();
    if (!url || !title || !lessonId) {
      return NextResponse.json(
        { error: "url, title, and lessonId required" },
        { status: 400 }
      );
    }

    // Verify teacher/admin can manage the lesson.
    // Use service client so this check does not depend on lesson RLS visibility.
    const service = createServiceClient();
    const { data: lesson } = await service
      .from("lessons")
      .select("created_by")
      .eq("id", lessonId)
      .single();

    if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;

    if (!libraryId || !apiKey) {
      return NextResponse.json(
        { error: "Bunny Stream not configured" },
        { status: 500 }
      );
    }

    // Resolve the download URL
    let downloadUrl = url.trim();

    if (downloadUrl.includes("drive.google.com")) {
      const resolved = extractGoogleDriveUrl(downloadUrl);
      if (!resolved) {
        return NextResponse.json(
          { error: "Could not parse Google Drive link. Make sure the file is shared with 'Anyone with the link'." },
          { status: 400 }
        );
      }
      downloadUrl = resolved;
    } else if (!isDirectVideoUrl(downloadUrl) && !downloadUrl.includes("dropbox.com")) {
      // For Dropbox, replace dl=0 with dl=1 for direct download
      return NextResponse.json(
        { error: "URL must be a Google Drive share link or a direct video file URL (.mp4, .mov, .webm)" },
        { status: 400 }
      );
    }

    // Handle Dropbox links
    if (downloadUrl.includes("dropbox.com")) {
      downloadUrl = downloadUrl.replace("dl=0", "dl=1").replace("www.dropbox.com", "dl.dropboxusercontent.com");
    }

    // Create video in Bunny Stream via fetch
    const bunnyRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/fetch`,
      {
        method: "POST",
        headers: {
          AccessKey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: downloadUrl,
          title,
        }),
      }
    );

    if (!bunnyRes.ok) {
      const errText = await bunnyRes.text();
      console.error("Bunny fetch-url error:", errText);
      return NextResponse.json(
        { error: "Bunny could not fetch the video. Make sure the link is publicly accessible." },
        { status: 502 }
      );
    }

    const data = await bunnyRes.json();

    return NextResponse.json({
      videoId: data.id || data.guid,
      status: "fetching",
    });
  } catch (error) {
    console.error("fetch-url error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
