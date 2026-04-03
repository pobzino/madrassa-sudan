import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBunnyPlaybackUrl } from "@/lib/bunny-playback";

export const runtime = "nodejs";

function getForwardedReferer(request: NextRequest): string {
  const rawReferer = request.headers.get("referer");

  if (rawReferer) {
    try {
      return `${new URL(rawReferer).origin}/`;
    } catch {
      // Fall back to the current request origin below.
    }
  }

  return `${request.nextUrl.origin}/`;
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

    const targetUrl = request.nextUrl.searchParams.get("url");
    const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;

    if (!targetUrl || !cdnHostname || !isBunnyPlaybackUrl(targetUrl, cdnHostname)) {
      return NextResponse.json({ error: "Invalid Bunny playback URL" }, { status: 400 });
    }

    const upstreamHeaders = new Headers({
      Referer: getForwardedReferer(request),
    });

    const range = request.headers.get("range");
    if (range) {
      upstreamHeaders.set("Range", range);
    }

    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const errorBody = await upstream.text().catch(() => "");
      return new NextResponse(errorBody || "Unable to load Bunny media", {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
        },
      });
    }

    const responseHeaders = new Headers();
    for (const headerName of [
      "accept-ranges",
      "cache-control",
      "content-length",
      "content-range",
      "content-type",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(headerName);
      if (value) {
        responseHeaders.set(headerName, value);
      }
    }
    responseHeaders.set("Access-Control-Allow-Origin", request.nextUrl.origin);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("bunny media proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
