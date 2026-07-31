/**
 * Error log tracking — shared shaping rules for server and browser reports.
 *
 * Everything here is pure so it can be unit tested: what a fingerprint is, what
 * counts as sensitive, and how big a payload may get. The actual writing lives
 * in `error-log.server.ts` (service-role insert) and `/api/errors` (browser).
 *
 * Privacy note, deliberate: this platform serves children and publishes a GDPR
 * privacy policy. Error records carry diagnostics and a user id — never lesson
 * content, answers, chat messages, tokens or emails. `redact` is the guard, and
 * it runs on every message and stack before storage.
 */

export type ErrorSource = 'server' | 'client';
export type ErrorLevel = 'error' | 'warn' | 'fatal';

export const MAX_MESSAGE_CHARS = 500;
export const MAX_STACK_CHARS = 4000;
export const MAX_CONTEXT_KEYS = 20;
export const MAX_CONTEXT_VALUE_CHARS = 200;

/** Keys whose values must never be stored, however they arrive. */
const SENSITIVE_KEY = /(pass(word)?|token|secret|key|auth|cookie|session|email|phone|whatsapp|answer|response_text|content|body|prompt)/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Long opaque strings: JWTs, API keys, signed-URL tokens.
const TOKEN_RE = /\b(?:eyJ[\w-]{10,}\.[\w-]+\.[\w-]+|sb_[a-z]+_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{16,})\b/g;
const BEARER_RE = /(bearer\s+)[A-Za-z0-9._-]{8,}/gi;

/** Strip anything that looks like a credential or personal identifier. */
export function redact(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(TOKEN_RE, '[redacted-token]')
    .replace(BEARER_RE, '$1[redacted]')
    .replace(EMAIL_RE, '[redacted-email]');
}

/**
 * Group repeats together: the message with volatile parts removed, plus the
 * first stack frame. Two occurrences of the same bug share a fingerprint even
 * though their ids, timestamps and urls differ.
 */
export function fingerprintOf(message: string, stack?: string | null, route?: string | null): string {
  const normalisedMessage = redact(message)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d{3,}\b/g, '<n>')
    .replace(/https?:\/\/[^\s)"']+/g, '<url>')
    .trim()
    .slice(0, 200);

  const topFrame = (stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at '))
    ?.replace(/:\d+:\d+/g, '')
    .replace(/\?[^)]*/g, '')
    .slice(0, 160);

  const basis = `${normalisedMessage}|${topFrame ?? ''}|${route ?? ''}`;

  // FNV-1a: short, stable, dependency-free. Not security-relevant.
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Keep context small, flat and free of anything sensitive. */
export function sanitizeContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
  const out: Record<string, unknown> = {};
  let keys = 0;
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (keys >= MAX_CONTEXT_KEYS) break;
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
      keys++;
      continue;
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = redact(value).slice(0, MAX_CONTEXT_VALUE_CHARS);
    } else {
      // Objects/arrays are summarised rather than stored: they are where
      // request bodies and answers would sneak in.
      out[key] = Array.isArray(value) ? `[array:${value.length}]` : '[object]';
    }
    keys++;
  }
  return out;
}

export interface NormalisedError {
  message: string;
  stack: string | null;
  fingerprint: string;
}

/** Turn anything thrown into the stored shape. */
export function normaliseError(
  error: unknown,
  route?: string | null
): NormalisedError {
  const raw =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Unknown error');
  const message = redact(raw.message || 'Unknown error').slice(0, MAX_MESSAGE_CHARS);
  const stack = raw.stack ? redact(raw.stack).slice(0, MAX_STACK_CHARS) : null;
  return { message, stack, fingerprint: fingerprintOf(message, stack, route) };
}
