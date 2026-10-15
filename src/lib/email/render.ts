// The email layout, built to feel like the site: the owl on its sunny meadow
// up top, rounded Fredoka (Cairo in Arabic) headings, figures on the same
// chalkboard as the home page, and chunky green buttons. Tables and inline
// styles keep it working in every mail app (Outlook gets square corners), right-to-left for Arabic, and the
// only images are small PNGs, because many families read on slow connections.

export type EmailLanguage = "ar" | "en";

/** Illustrations in public/email, drawn by scripts/render-email-art.mjs. */
export type EmailArt = "welcome" | "teacher" | "celebrate" | "missed" | "thanks";

export type EmailLink = { label: string; url: string };

export type EmailContent = {
  language: EmailLanguage;
  /** Shown as the inbox preview line. */
  preheader: string;
  hero: { art: EmailArt; alt: string };
  heading: string;
  /** Plain paragraphs; everything is escaped. */
  paragraphs: string[];
  /** Numbered steps, each in its own coloured circle. */
  steps?: string[];
  /** Figures written on a chalkboard, like the home page. */
  board?: { title: string; stats: { value: string; label: string }[]; note?: string };
  /** A row of seven days, ticked where there was learning. */
  week?: { title: string; days: { label: string; active: boolean }[] };
  /** Paragraphs shown after the board and week. */
  closingParagraphs?: string[];
  cta?: EmailLink;
  /** A soft panel with a short message and a link, e.g. the parents' group. */
  callout?: { text: string; link: EmailLink };
  secondaryLink?: EmailLink;
  /** Why they're getting this, for recurring summaries. */
  footerNote?: string;
  unsubscribe?: EmailLink;
};

export type RenderOptions = {
  siteUrl: string;
  /** Where illustrations load from. Defaults to the site's public/email folder. */
  assetUrl?: (file: string) => string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const GREEN = "#007229";
const GREEN_DARK = "#005C22";
const INK = "#1f2937";
const BODY = "#4b5563";
const MUTED = "#6b7280";
const STEP_COLOURS = [GREEN, "#D21034", "#F59E0B"];
const CHALK_LABELS = ["#FDE68A", "#FBCFE8", "#BBF7D0"];

const FONTS = {
  en: {
    heading: "'Fredoka', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif",
    body: "'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    chalk: "'Caveat', 'Chalkboard SE', 'Comic Sans MS', cursive",
  },
  ar: {
    heading: "'Cairo', Tahoma, 'Segoe UI', Arial, sans-serif",
    body: "'Cairo', Tahoma, 'Segoe UI', Arial, sans-serif",
    chalk: "'Aref Ruqaa', 'Cairo', Tahoma, serif",
  },
};

const BRAND_NAME = { en: "Amal School", ar: "مدرسة آمال" };

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmail(subject: string, content: EmailContent, { siteUrl, assetUrl }: RenderOptions): RenderedEmail {
  const { language } = content;
  const rtl = language === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const start = rtl ? "right" : "left";
  const end = rtl ? "left" : "right";
  const fonts = FONTS[language];
  const art = assetUrl ?? ((file: string) => `${siteUrl}/email/${file}`);
  const e = escapeHtml;
  const formatIndex = (i: number) => new Intl.NumberFormat(rtl ? "ar-EG" : "en-GB").format(i + 1);
  const arrow = rtl ? "&larr;" : "&rarr;";

  const paragraph = (p: string) =>
    `<p style="margin:0 0 14px;font-family:${fonts.body};font-size:16px;line-height:1.65;color:${BODY};text-align:center;">${e(p)}</p>`;

  const steps = content.steps?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 8px;background:#f5faf5;border-radius:18px;">
        <tr><td style="padding:10px 18px;">
        ${content.steps
          .map(
            (step, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}"><tr>
              <td valign="top" width="46" style="width:46px;padding:10px 0;">
                <div style="width:34px;height:34px;line-height:34px;border-radius:17px;background:${STEP_COLOURS[i % STEP_COLOURS.length]};color:#ffffff;font-family:${fonts.heading};font-size:17px;font-weight:700;text-align:center;">${formatIndex(i)}</div>
              </td>
              <td valign="middle" style="padding:10px 0;font-family:${fonts.body};font-size:16px;line-height:1.5;color:${INK};text-align:${start};">${e(step)}</td>
            </tr></table>`,
          )
          .join("")}
        </td></tr></table>`
    : "";

  const board = content.board
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;">
        <tr><td style="background:#c27d33;border-radius:18px;padding:10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#11683a;border-radius:10px;padding:18px 10px 20px;">
              <p style="margin:0 0 12px;font-family:${fonts.chalk};font-size:26px;line-height:1.2;color:#FDE68A;text-align:center;">${e(content.board.title)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}"><tr>
              ${content.board.stats
                .map(
                  (stat, i, all) => `<td valign="top" width="${Math.floor(100 / all.length)}%" style="padding:4px 8px;text-align:center;${i > 0 ? `border-${start}:2px dashed #54926e;` : ""}">
                    <div style="font-family:${fonts.heading};font-size:38px;line-height:1.1;font-weight:700;color:#fffdf2;">${e(stat.value)}</div>
                    <div style="margin-top:4px;font-family:${fonts.body};font-size:13px;line-height:1.35;color:${CHALK_LABELS[i % CHALK_LABELS.length]};">${e(stat.label)}</div>
                  </td>`,
                )
                .join("")}
              </tr></table>
              ${content.board.note ? `<p style="margin:16px 0 0;font-family:${fonts.chalk};font-size:21px;line-height:1.3;color:#fffdf2;text-align:center;">${e(content.board.note)}</p>` : ""}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center"><table role="presentation" width="78%" cellpadding="0" cellspacing="0"><tr><td style="height:9px;line-height:9px;font-size:0;background:#9c6026;border-radius:0 0 8px 8px;">&nbsp;</td></tr></table></td></tr>
      </table>`
    : "";

  const week = content.week
    ? `<p style="margin:26px 0 10px;font-family:${fonts.heading};font-size:16px;font-weight:700;color:${INK};text-align:center;">${e(content.week.title)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" dir="${dir}" style="margin:0 auto 20px;"><tr>
      ${content.week.days
        .map(
          (day) => `<td align="center" style="padding:0 4px;">
            <div style="${day.active ? `width:34px;height:34px;line-height:34px;background:${GREEN};color:#ffffff;` : "width:30px;height:30px;line-height:30px;background:#f3f4f6;color:#c0c6cc;border:2px dashed #d7dde2;"}border-radius:17px;font-family:Arial, sans-serif;font-size:16px;font-weight:700;text-align:center;">${day.active ? "&#10003;" : "&middot;"}</div>
            <div style="margin-top:6px;font-family:${fonts.body};font-size:12px;color:${day.active ? INK : MUTED};font-weight:${day.active ? 700 : 400};">${e(day.label)}</div>
          </td>`,
        )
        .join("")}
      </tr></table>`
    : "";

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:22px auto 6px;"><tr>
        <td style="background:${GREEN};border-radius:999px;border-bottom:4px solid ${GREEN_DARK};">
          <a href="${e(content.cta.url)}" style="display:inline-block;padding:15px 34px;font-family:${fonts.heading};font-size:17px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px;">${e(content.cta.label)}</a>
        </td></tr></table>`
    : "";

  const callout = content.callout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;background:#ecf7ef;border:1px solid #cfe9d6;border-radius:18px;">
        <tr><td style="padding:18px 20px;text-align:center;">
          <p style="margin:0 0 8px;font-family:${fonts.body};font-size:15px;line-height:1.55;color:${INK};">${e(content.callout.text)}</p>
          <a href="${e(content.callout.link.url)}" style="font-family:${fonts.heading};font-size:16px;font-weight:700;color:${GREEN};text-decoration:none;">${e(content.callout.link.label)} ${arrow}</a>
        </td></tr></table>`
    : "";

  const secondary = content.secondaryLink
    ? `<p style="margin:16px 0 0;text-align:center;"><a href="${e(content.secondaryLink.url)}" style="font-family:${fonts.heading};font-size:15px;font-weight:700;color:${GREEN};text-decoration:none;">${e(content.secondaryLink.label)} ${arrow}</a></p>`
    : "";

  const footer = [
    content.footerNote ? e(content.footerNote) : "",
    content.unsubscribe ? `<a href="${e(content.unsubscribe.url)}" style="color:${MUTED};text-decoration:underline;">${e(content.unsubscribe.label)}</a>` : "",
    `${e(BRAND_NAME[language])} · <a href="${e(siteUrl)}" style="color:${MUTED};text-decoration:underline;">amalschool.org</a>`,
  ]
    .filter(Boolean)
    .join("<br>");

  const html = `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&amp;family=Inter:wght@400;600&amp;family=Cairo:wght@400;700&amp;family=Caveat:wght@600&amp;family=Aref+Ruqaa:wght@700&amp;display=swap" rel="stylesheet">
<style>
  @media (max-width: 520px) {
    .amal-body { padding: 26px 20px 30px !important; }
    .amal-heading { font-size: 25px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eef6ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6ee;" dir="${dir}">
<tr><td align="center" style="padding:22px 12px 28px;">
  <!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px;"><tr>
    <td style="padding-${end}:10px;"><img src="${e(siteUrl)}/icons/icon-192.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:10px;"></td>
    <td style="font-family:${fonts.heading};font-size:20px;font-weight:700;color:${GREEN};">${e(BRAND_NAME[language])}</td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;border:1px solid #dcebdc;" dir="${dir}">
    <tr><td style="padding:0;line-height:0;font-size:0;">
      <img src="${e(art(`${content.hero.art}.png`))}" width="560" alt="${e(content.hero.alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:23px 23px 0 0;">
    </td></tr>
    <tr><td class="amal-body" style="padding:30px 36px 34px;">
      <h1 class="amal-heading" style="margin:0 0 12px;font-family:${fonts.heading};font-size:28px;line-height:1.3;font-weight:700;color:${INK};text-align:center;">${e(content.heading)}</h1>
      ${content.paragraphs.map(paragraph).join("")}
      ${steps}${board}${week}
      ${(content.closingParagraphs ?? []).map(paragraph).join("")}
      ${cta}${callout}${secondary}
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;" dir="${dir}">
    <tr><td style="padding:18px 28px 0;font-family:${fonts.body};font-size:12.5px;line-height:1.7;color:${MUTED};text-align:center;">${footer}</td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    "",
    ...content.paragraphs,
    ...(content.steps?.length ? ["", ...content.steps.map((s, i) => `${formatIndex(i)}. ${s}`)] : []),
    ...(content.board
      ? ["", content.board.title, ...content.board.stats.map((s) => `${s.value} ${s.label}`), ...(content.board.note ? [content.board.note] : [])]
      : []),
    ...(content.week ? ["", `${content.week.title}: ${content.week.days.filter((d) => d.active).map((d) => d.label).join(", ")}`] : []),
    ...(content.closingParagraphs?.length ? ["", ...content.closingParagraphs] : []),
    ...(content.cta ? ["", `${content.cta.label}: ${content.cta.url}`] : []),
    ...(content.callout ? ["", content.callout.text, `${content.callout.link.label}: ${content.callout.link.url}`] : []),
    ...(content.secondaryLink ? ["", `${content.secondaryLink.label}: ${content.secondaryLink.url}`] : []),
    ...(content.footerNote ? ["", content.footerNote] : []),
    ...(content.unsubscribe ? [`${content.unsubscribe.label}: ${content.unsubscribe.url}`] : []),
    "",
    `${BRAND_NAME[language]} · ${siteUrl}`,
  ];

  return { subject, html, text: text.join("\n") };
}
