import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<number, string> = {
  0: "created",
  1: "uploaded",
  2: "processing",
  3: "transcoding",
  4: "finished",
  5: "error",
};

async function isPlayableVideoUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    return response.status === 206 || response.status === 200;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
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

    const videoId = request.nextUrl.searchParams.get("videoId");
    if (!videoId) {
      return NextResponse.json(
        { error: "videoId required" },
        { status: 400 }
      );
    }

    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = process.env.BUNNY_STREAM_API_KEY;
    const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;

    if (!libraryId || !apiKey || !cdnHostname) {
      return NextResponse.json(
        { error: "Bunny Stream not configured" },
        { status: 500 }
      );
    }

    const bunnyRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      {
        headers: { AccessKey: apiKey },
        cache: "no-store",
      }
    );

    if (!bunnyRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch video status" },
        { status: 502 }
      );
    }

    const data = await bunnyRes.json();
    const statusCode = data.status as number;
    const status = STATUS_LABELS[statusCode] || "unknown";

    const response: Record<string, unknown> = {
      status,
      statusCode,
    };

    if (statusCode === 4) {
      const candidateUrls = {
        video_url_1080p: `https://${cdnHostname}/${videoId}/play_1080p.mp4`,
        video_url_360p: `https://${cdnHostname}/${videoId}/play_360p.mp4`,
        video_url_480p: `https://${cdnHostname}/${videoId}/play_480p.mp4`,
        video_url_720p: `https://${cdnHostname}/${videoId}/play_720p.mp4`,
      };

      const entries = Object.entries(candidateUrls) as Array<
        [keyof typeof candidateUrls, string]
      >;
      const checks = await Promise.all(
        entries.map(async ([key, url]) => [key, url, await isPlayableVideoUrl(url)] as const)
      );

      const playableUrls = checks.reduce<Record<string, string>>((acc, [key, url, playable]) => {
        acc[key] = playable ? url : "";
        return acc;
      }, {});

      const playableQualities = checks
        .filter(([, , playable]) => playable)
        .map(([key]) => key);

      response.urls = playableUrls;
      response.playableQualities = playableQualities;
      response.hlsUrl = `https://${cdnHostname}/${videoId}/playlist.m3u8`;

      if (playableQualities.length === 0) {
        response.status = "transcoding";
        response.statusCode = 3;
        response.awaitingPlayableRenditions = true;
      }

      if (data.length) {
        response.durationSeconds = data.length;
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("bunny status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
