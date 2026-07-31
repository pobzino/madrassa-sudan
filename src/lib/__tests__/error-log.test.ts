import { describe, it, expect } from 'vitest';
import {
  fingerprintOf,
  normaliseError,
  redact,
  sanitizeContext,
  MAX_MESSAGE_CHARS,
} from '@/lib/observability/error-log';

describe('redact', () => {
  it('strips emails, which are personal data on a platform for children', () => {
    expect(redact('failed for parent fatima@example.com')).toBe(
      'failed for parent [redacted-email]'
    );
  });

  it('strips supabase keys and JWTs so a log never becomes a credential leak', () => {
    expect(redact('apikey sb_secret_ABCDEFGHIJKLMNOP failed')).toContain('[redacted-token]');
    expect(
      redact('token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123def')
    ).toContain('[redacted-token]');
  });

  it('strips bearer headers but keeps the surrounding text readable', () => {
    expect(redact('Authorization: Bearer abcdef1234567890')).toBe(
      'Authorization: Bearer [redacted]'
    );
  });

  it('leaves ordinary diagnostics untouched', () => {
    expect(redact('Failed to upload audio chunk 3 of 8')).toBe(
      'Failed to upload audio chunk 3 of 8'
    );
  });
});

describe('fingerprintOf', () => {
  it('groups the same failure across different ids and urls', () => {
    const a = fingerprintOf(
      'Sim not found: 4c9d368e-be9f-4a3d-8a56-489788a72b06',
      'Error\n    at load (/app/sims.ts:12:5)',
      '/api/sims'
    );
    const b = fingerprintOf(
      'Sim not found: 5b02e876-1071-4501-9f58-ee9c95fd9fcd',
      'Error\n    at load (/app/sims.ts:12:9)',
      '/api/sims'
    );
    expect(a).toBe(b);
  });

  it('separates genuinely different failures', () => {
    const upload = fingerprintOf('Audio upload failed', 'Error\n    at upload (/app/a.ts:1:1)');
    const splice = fingerprintOf('Splice produced empty file', 'Error\n    at splice (/app/b.ts:1:1)');
    expect(upload).not.toBe(splice);
  });

  it('is stable for the same input', () => {
    expect(fingerprintOf('x', 'Error\n    at y (z.ts:1:1)')).toBe(
      fingerprintOf('x', 'Error\n    at y (z.ts:1:1)')
    );
  });
});

describe('sanitizeContext', () => {
  it('redacts values whose key suggests secrets or personal data', () => {
    const out = sanitizeContext({
      lessonId: 'abc',
      password: 'hunter2',
      whatsapp: '+249912345678',
      access_token: 'xyz',
      response_text: '7 + 6 = 13',
    });
    expect(out.lessonId).toBe('abc');
    expect(out.password).toBe('[redacted]');
    expect(out.whatsapp).toBe('[redacted]');
    expect(out.access_token).toBe('[redacted]');
    // A child's actual answer must never be stored.
    expect(out.response_text).toBe('[redacted]');
  });

  it('summarises nested values rather than storing them', () => {
    const out = sanitizeContext({ slideIds: [1, 2, 3], meta: { a: 1 } });
    expect(out.slideIds).toBe('[array:3]');
    expect(out.meta).toBe('[object]');
  });

  it('redacts a sensitive key even when its value is a collection', () => {
    // "answers" is a child's work: it must not survive as a summary either.
    const out = sanitizeContext({ answers: [1, 2, 3] });
    expect(out.answers).toBe('[redacted]');
  });

  it('keeps primitives and ignores non-objects', () => {
    expect(sanitizeContext({ count: 3, ok: true, missing: null })).toEqual({
      count: 3,
      ok: true,
      missing: null,
    });
    expect(sanitizeContext('nope')).toEqual({});
    expect(sanitizeContext(null)).toEqual({});
  });

  it('caps how many keys can be stored', () => {
    const big = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeContext(big)).length).toBeLessThanOrEqual(20);
  });
});

describe('normaliseError', () => {
  it('accepts non-Error throws', () => {
    const out = normaliseError('just a string');
    expect(out.message).toBe('just a string');
    expect(out.fingerprint).toHaveLength(8);
  });

  it('redacts and truncates the message', () => {
    const out = normaliseError(new Error('leak me@example.com ' + 'x'.repeat(1000)));
    expect(out.message).not.toContain('@example.com');
    expect(out.message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });
});
