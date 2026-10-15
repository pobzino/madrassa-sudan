// Every day at 15:00 UTC (17:00 in Sudan): a push reminder for families who
// learned yesterday but not yet today, before their streak breaks.
// The work runs in the Next.js route, which can use the app's server code.
export const config = { schedule: "0 15 * * *" };

export async function handler() {
  return triggerRun("push/streak-reminders");
}

async function triggerRun(name: string) {
  const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.EMAIL_AUTOMATION_SECRET;
  if (!siteUrl || !secret) {
    return { statusCode: 500, body: "Missing URL or EMAIL_AUTOMATION_SECRET" };
  }
  const response = await fetch(`${siteUrl}/api/internal/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) console.error(`Run ${name} failed:`, response.status, body);
  else console.log(`Run ${name}:`, body);
  return { statusCode: response.ok ? 200 : 500, body };
}
