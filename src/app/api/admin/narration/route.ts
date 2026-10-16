// GET  /api/admin/narration  -> the narration backlog (what still has no clip) and the ElevenLabs quota
// POST /api/admin/narration  -> start draining it in the background (approved admins only)

import { openStaffRequest } from "@/lib/server/milestones/teacher";
import { BACKGROUND_FUNCTION_PATH, JOB_SECRET_HEADER, jobSecret } from "@/lib/server/milestones/jobs";
import { milestoneError, milestoneJson } from "@/lib/server/milestones/load";
import { narrationBacklogSummary } from "@/lib/server/narration-backlog";

export const dynamic = "force-dynamic";

const NARRATE_FUNCTION_PATH = BACKGROUND_FUNCTION_PATH.replace("generate-milestone-background", "narrate-backlog-background");

async function quota(): Promise<{ used: number; limit: number; resetsAt: string | null } | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey } });
    if (!response.ok) return null;
    const data = (await response.json()) as { character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
    return {
      used: data.character_count ?? 0,
      limit: data.character_limit ?? 0,
      resetsAt: data.next_character_count_reset_unix ? new Date(data.next_character_count_reset_unix * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
}

async function openAdmin() {
  const staff = await openStaffRequest({ fastAuth: true });
  if (!staff.ok) return staff;
  if (staff.role !== "admin") return { ok: false as const, response: milestoneError("unauthorized", 403, { message: "Admins only" }) };
  return staff;
}

export async function GET() {
  const staff = await openAdmin();
  if (!staff.ok) return staff.response;
  const [backlog, plan] = await Promise.all([narrationBacklogSummary(staff.admin), quota()]);
  return milestoneJson({ backlog, plan, configured: Boolean(jobSecret()) && Boolean(process.env.ELEVENLABS_API_KEY) });
}

export async function POST(request: Request) {
  const staff = await openAdmin();
  if (!staff.ok) return staff.response;
  const secret = jobSecret();
  if (!secret || !process.env.ELEVENLABS_API_KEY) return milestoneError("service_unavailable", 503, { message: "Narration is not configured on this site." });
  const origin = new URL(request.url).origin;
  const response = await fetch(new URL(NARRATE_FUNCTION_PATH, origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", [JOB_SECRET_HEADER]: secret },
    body: JSON.stringify({ origin }),
  }).catch(() => null);
  if (!response || !response.ok) return milestoneError("service_unavailable", 502, { message: "The background worker could not be started." });
  return milestoneJson({ started: true }, 202);
}
