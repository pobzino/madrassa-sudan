import { NextRequest, NextResponse } from "next/server";
import {
  isTrustedAnalyticsOrigin,
  parseAnalyticsPayload,
} from "@/lib/analytics.validation";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

const MAX_BODY_BYTES = 4096;
const RETENTION_MONTHS = 13;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const origin = request.headers.get("origin");
  if (!isTrustedAnalyticsOrigin(
    origin,
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  )) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const payload = parseAnalyticsPayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: "Invalid analytics event" }, { status: 400 });
  }

  if (!hasServiceRoleConfig()) {
    return new NextResponse(null, { status: 204 });
  }

  const service = createServiceClient();
  const { error } = await service.from("analytics_events").insert({
    event_name: payload.eventName,
    locale: payload.locale,
    path: payload.path,
    properties: payload.properties,
  });

  if (error) {
    console.error("Analytics insert failed:", error.message);
    return new NextResponse(null, { status: 204 });
  }

  if (Math.random() < 0.01) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
    void service
      .from("analytics_events")
      .delete()
      .lt("created_at", cutoff.toISOString());
  }

  return new NextResponse(null, { status: 204 });
}
