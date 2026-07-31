// POST /api/errors — browser error reports.
//
// The browser is where the failures that matter most happen: a tutor's upload
// dying mid-save, a child's practice screen going blank on a bad connection.
// None of that reaches server logs today.
//
// This endpoint is deliberately paranoid. Anything a page sends is attacker-
// controlled, so the payload is capped, sanitised, rate-limited per user, and
// written with the service role (clients have no INSERT rights on error_logs).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import type { Json } from '@/lib/database.types';
import {
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  fingerprintOf,
  redact,
  sanitizeContext,
} from '@/lib/observability/error-log';

const ReportSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).nullable().optional(),
  route: z.string().max(300).nullable().optional(),
  level: z.enum(['error', 'warn', 'fatal']).optional(),
  release: z.string().max(80).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Per-user cap. A render loop can throw hundreds of times a second; without a
 * ceiling one broken page could fill the table (and the database quota) before
 * anyone notices.
 */
const MAX_REPORTS_PER_WINDOW = 20;
const WINDOW_MS = 60_000;
const recentByUser = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = recentByUser.get(userId);
  if (!entry || now > entry.resetAt) {
    recentByUser.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REPORTS_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Only signed-in users may report: it keeps the endpoint from being an open
    // write target, and an anonymous browser error is rarely actionable anyway.
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (overRateLimit(user.id)) {
      // 202, not 429: the page should not retry or surface anything to a child.
      return NextResponse.json({ ok: true, throttled: true }, { status: 202 });
    }

    const parsed = ReportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ ok: true, stored: false });
    }

    const data = parsed.data;
    const message = redact(data.message).slice(0, MAX_MESSAGE_CHARS);
    const stack = data.stack ? redact(data.stack).slice(0, MAX_STACK_CHARS) : null;
    const route = data.route ? data.route.slice(0, 300) : null;

    const service = createServiceClient();
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const { error } = await service.from('error_logs').insert({
      source: 'client',
      level: data.level ?? 'error',
      fingerprint: fingerprintOf(message, stack, route),
      message,
      stack,
      route,
      release: data.release ?? process.env.NEXT_PUBLIC_RUNTIME_VERSION ?? null,
      user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      user_id: user.id,
      user_role: (profile as { role?: string } | null)?.role ?? null,
      context: sanitizeContext(data.context) as unknown as Json,
    });

    if (error) {
      console.error('client error report insert failed', error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('client error report failed', err);
    // Never surface a failure to report a failure.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
