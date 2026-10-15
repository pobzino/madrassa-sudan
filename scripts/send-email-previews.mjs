// Sends every automated email, in English and Arabic, with sample data, to
// one inbox through Resend, so the real HTML can be checked in real mail apps.
//
//   RESEND_API_KEY=... node scripts/send-email-previews.mjs you@example.com
//
// EMAIL_FROM sets the sender (default "Amal School <hello@amalschool.org>").

import { build } from "esbuild";
import path from "node:path";

const to = process.argv[2];
const apiKey = process.env.RESEND_API_KEY;
if (!to || !apiKey) {
  console.error("Usage: RESEND_API_KEY=... node scripts/send-email-previews.mjs you@example.com");
  process.exit(1);
}

const bundle = await build({
  entryPoints: [path.resolve(import.meta.dirname, "../src/lib/email/templates.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const templates = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const siteUrl = "https://amalschool.org";
const unsubscribeUrl = `${siteUrl}/api/email/unsubscribe?preview=1`;
const whatsappGroupUrl = "https://chat.whatsapp.com/ENlNNVC61xT53dQgtQTFrQ?mode=gi_t";
const activeWeek = {
  lessonsStarted: 5,
  lessonsCompleted: 4,
  practiceTried: 3,
  practicePassed: 2,
  streakDays: 3,
  activeDays: [true, false, true, true, true, false, false],
};
const quietWeek = { ...activeWeek, lessonsStarted: 0, lessonsCompleted: 0, practiceTried: 0, practicePassed: 0, streakDays: 0, activeDays: Array(7).fill(false) };

const emails = [];
for (const language of ["en", "ar"]) {
  const base = { language, name: language === "ar" ? "أمينة" : "Amina", siteUrl };
  const weekLabel = language === "ar" ? "٥–١١ أكتوبر" : "5–11 October";
  const samples = {
    "Parent welcome": templates.welcomeParentEmail({ ...base, whatsappGroupUrl }),
    "Teacher welcome": templates.welcomeTeacherEmail(base),
    "Weekly progress": templates.weeklyProgressEmail({ ...base, unsubscribeUrl, summary: activeWeek, weekLabel }),
    "Weekly nudge": templates.weeklyProgressEmail({ ...base, unsubscribeUrl, summary: quietWeek, weekLabel }),
    "Volunteer impact": templates.volunteerImpactEmail({
      ...base,
      unsubscribeUrl,
      monthLabel: language === "ar" ? "سبتمبر" : "September",
      impact: { starts: 312, completions: 187, learners: 94, topLessonTitle: language === "ar" ? "جمع الكسور" : "Adding fractions" },
    }),
  };
  for (const [label, email] of Object.entries(samples)) {
    emails.push({
      from: process.env.EMAIL_FROM || "Amal School <hello@amalschool.org>",
      to: [to],
      subject: `[Preview · ${label} · ${language.toUpperCase()}] ${email.subject}`,
      html: email.html,
      text: email.text,
    });
  }
}

const response = await fetch("https://api.resend.com/emails/batch", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(emails),
});
const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(`Resend ${response.status}:`, body);
  process.exit(1);
}
console.log(`Sent ${body?.data?.length ?? 0} previews to ${to}.`);
