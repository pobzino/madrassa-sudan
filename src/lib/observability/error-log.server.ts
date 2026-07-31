import 'server-only';

/**
 * Server-side error recording.
 *
 * Use in place of a bare `console.error` in catch blocks — it still logs to the
 * console (so local development and function logs are unchanged) and also
 * persists a sanitised record so failures in the field are answerable.
 *
 * Never throws and never blocks the response: an observability system that can
 * break a lesson is worse than no observability.
 */

import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import type { Json } from '@/lib/database.types';
import {
  normaliseError,
  sanitizeContext,
  type ErrorLevel,
  type ErrorSource,
} from '@/lib/observability/error-log';

export interface LogErrorInput {
  error: unknown;
  /** API route path or server action name, e.g. '/api/homework/[id]/submit'. */
  route?: string | null;
  httpMethod?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  userRole?: string | null;
  level?: ErrorLevel;
  source?: ErrorSource;
  userAgent?: string | null;
  context?: Record<string, unknown>;
}

export async function logError(input: LogErrorInput): Promise<void> {
  const {
    error,
    route = null,
    httpMethod = null,
    statusCode = null,
    userId = null,
    userRole = null,
    level = 'error',
    source = 'server',
    userAgent = null,
    context,
  } = input;

  const { message, stack, fingerprint } = normaliseError(error, route);

  // Keep the console line: function logs stay useful, and local dev is unchanged.
  console.error(`[${route ?? 'app'}] ${message}`, error);

  if (!hasServiceRoleConfig()) return;

  try {
    const service = createServiceClient();
    await service.from('error_logs').insert({
      source,
      level,
      fingerprint,
      message,
      stack,
      route,
      http_method: httpMethod,
      status_code: statusCode,
      release: process.env.NEXT_PUBLIC_RUNTIME_VERSION ?? null,
      user_agent: userAgent ? userAgent.slice(0, 300) : null,
      user_id: userId,
      user_role: userRole,
      context: sanitizeContext(context) as unknown as Json,
    });
  } catch (loggingError) {
    // Swallow: a failure to record a failure must not become a third failure.
    console.error('error_logs insert failed', loggingError);
  }
}

/**
 * Wrap an API route handler so unhandled throws are recorded and answered with
 * a generic 500 instead of leaking internals to a child's browser.
 */
export function withErrorLogging<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0] as { method?: string; headers?: Headers } | undefined;
      await logError({
        error,
        route,
        httpMethod: request?.method ?? null,
        statusCode: 500,
        userAgent: request?.headers?.get?.('user-agent') ?? null,
      });
      return new Response(JSON.stringify({ error: 'An unexpected error occurred' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
