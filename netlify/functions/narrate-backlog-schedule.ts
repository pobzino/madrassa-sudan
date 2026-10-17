// Every three hours: start the narration drain (netlify/functions/
// narrate-backlog-background.ts) so every published Practice and boss question
// gets its ElevenLabs clip without anyone pressing the admin button. The
// background function stops by itself when the backlog is empty.
export const config = { schedule: "0 */3 * * *" };

export async function handler() {
  const origin = process.env.URL;
  const secret = process.env.SLIDE_JOB_SECRET?.trim();
  if (!origin || !secret || !process.env.ELEVENLABS_API_KEY) {
    console.log(JSON.stringify({ event: "narration_schedule", skipped: "not configured" }));
    return { statusCode: 200, body: "skipped" };
  }
  const response = await fetch(`${origin}/.netlify/functions/narrate-backlog-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-milestone-job-secret": secret },
    body: JSON.stringify({ origin }),
  }).catch((error: unknown) => {
    console.error(JSON.stringify({ event: "narration_schedule", error: error instanceof Error ? error.message : String(error) }));
    return null;
  });
  const ok = Boolean(response && (response.status === 202 || response.ok));
  console.log(JSON.stringify({ event: "narration_schedule", started: ok, status: response?.status ?? null }));
  return { statusCode: ok ? 200 : 500, body: ok ? "started" : "failed" };
}
