// The 1st of each month at 08:00 UTC: the volunteer teachers' impact summary.
// The work runs in the Next.js route, which can use the app's server code.
export const config = { schedule: "0 8 1 * *" };

export async function handler() {
  return triggerEmailRun("volunteer-impact");
}

async function triggerEmailRun(name: string) {
  const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.EMAIL_AUTOMATION_SECRET;
  if (!siteUrl || !secret) {
    return { statusCode: 500, body: "Missing URL or EMAIL_AUTOMATION_SECRET" };
  }
  const response = await fetch(`${siteUrl}/api/internal/emails/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) console.error(`Email run ${name} failed:`, response.status, body);
  else console.log(`Email run ${name}:`, body);
  return { statusCode: response.ok ? 200 : 500, body };
}
