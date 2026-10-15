import { NextRequest, NextResponse } from "next/server";
import { escapeHtml } from "@/lib/email/render";
import { isUnsubscribableKind, verifyUnsubscribeToken, type UnsubscribableKind } from "@/lib/email/unsubscribe";
import { suppressEmails } from "@/lib/server/email-automations";

// Opening the link shows a confirm button, since mail scanners open links on
// their own; the button, and mail apps' one-click unsubscribe, POST here.

const NAMES: Record<UnsubscribableKind, { en: string; ar: string }> = {
  weekly_progress: { en: "the weekly progress summary", ar: "الملخص الأسبوعي" },
  volunteer_impact: { en: "the monthly teaching summary", ar: "الملخص الشهري للمعلّمين" },
};

type Page = { en: { title: string; body: string }; ar: { title: string; body: string }; button?: { action: string; en: string; ar: string } };

function page({ en, ar, button }: Page, status = 200) {
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(en.title)} · Amal School</title>
</head>
<body style="margin:0;background:#eef6ee;font-family:-apple-system,'Segoe UI',Roboto,Tahoma,Arial,sans-serif;color:#1f2937;">
<main style="max-width:460px;margin:48px auto;padding:32px 28px;background:#fff;border-radius:24px;border:1px solid #dcebdc;text-align:center;">
  <img src="/icons/icon-192.png" width="48" height="48" alt="Amal School" style="border-radius:12px;">
  <h1 style="margin:18px 0 8px;font-size:22px;">${e(en.title)}</h1>
  <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#4b5563;">${e(en.body)}</p>
  <div dir="rtl" lang="ar">
    <h2 style="margin:0 0 8px;font-size:21px;">${e(ar.title)}</h2>
    <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#4b5563;">${e(ar.body)}</p>
  </div>
  ${
    button
      ? `<form method="post" action="${e(button.action)}">
    <button type="submit" style="padding:14px 30px;border:0;border-bottom:4px solid #005C22;border-radius:999px;background:#007229;color:#fff;font-size:16px;font-weight:700;cursor:pointer;">${e(button.en)} · ${e(button.ar)}</button>
  </form>`
      : `<a href="/" style="color:#007229;font-weight:700;text-decoration:none;">amalschool.org</a>`
  }
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

const INVALID: Page = {
  en: { title: "This link isn't valid", body: "It may be incomplete. Try opening the whole link from the email again." },
  ar: { title: "هذا الرابط غير صالح", body: "ربما الرابط غير مكتمل. جرّب فتح الرابط كاملاً من الرسالة مرة أخرى." },
};

function parse(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const userId = params.get("u");
  const kind = params.get("k");
  const token = params.get("t");
  const secret = process.env.EMAIL_AUTOMATION_SECRET?.trim();
  if (!secret || !userId || !token || !isUnsubscribableKind(kind)) return null;
  if (!verifyUnsubscribeToken(secret, userId, kind, token)) return null;
  return { userId, kind };
}

export async function GET(request: NextRequest) {
  const link = parse(request);
  if (!link) return page(INVALID, 400);
  const name = NAMES[link.kind];
  return page({
    en: { title: "Stop these emails?", body: `You'll stop getting ${name.en}. Your account and learning aren't affected.` },
    ar: { title: "إيقاف هذه الرسائل؟", body: `لن يصلك ${name.ar} بعد الآن. حسابك وتعلّمك لن يتأثرا.` },
    button: { action: `${request.nextUrl.pathname}${request.nextUrl.search}`, en: "Unsubscribe", ar: "إلغاء الاشتراك" },
  });
}

export async function POST(request: NextRequest) {
  const link = parse(request);
  if (!link) return page(INVALID, 400);
  try {
    await suppressEmails(link.userId, link.kind);
  } catch (error) {
    console.error("Email unsubscribe failed:", error);
    return page(
      {
        en: { title: "Something went wrong", body: "We couldn't update your preferences. Please try again in a minute." },
        ar: { title: "حدث خطأ ما", body: "لم نتمكن من تحديث تفضيلاتك. حاول مرة أخرى بعد دقيقة." },
      },
      500,
    );
  }
  const name = NAMES[link.kind];
  return page({
    en: { title: "You're unsubscribed", body: `You won't get ${name.en} any more.` },
    ar: { title: "تم إلغاء اشتراكك", body: `لن يصلك ${name.ar} بعد الآن.` },
  });
}
