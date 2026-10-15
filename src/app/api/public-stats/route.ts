import { NextResponse } from "next/server";
import { loadHomeStats } from "@/lib/server/home-stats";

// Aggregate counts only, for the live counters on the public home page.
export async function GET() {
  const stats = await loadHomeStats();
  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
