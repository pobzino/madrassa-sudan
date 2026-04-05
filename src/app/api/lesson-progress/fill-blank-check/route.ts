import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/ai/openai-client';

// Lightweight fuzzy check for fill-the-blank free-entry answers.
// Clients should already have tried an exact normalized match before calling.
const BodySchema = z.object({
  answer: z.string().min(1).max(200),
  expected_ar: z.string().max(200).optional(),
  expected_en: z.string().max(200).optional(),
  language: z.enum(['ar', 'en']),
  prompt_hint: z.string().max(400).optional(),
});

interface FillBlankCheckResult {
  isCorrect: boolean;
  feedback?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { answer, expected_ar, expected_en, language, prompt_hint } = parsed.data;
  const expected = (language === 'ar' ? expected_ar : expected_en)?.trim() || '';

  if (!expected) {
    return NextResponse.json<FillBlankCheckResult>({ isCorrect: false });
  }

  const openai = getOpenAIClient();
  if (!openai) {
    // No AI configured — fall back to a case-insensitive substring check so the
    // feature still works in local/dev without an API key.
    const normalized = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[\s\p{P}]+/gu, ' ')
        .trim();
    return NextResponse.json<FillBlankCheckResult>({
      isCorrect: normalized(answer) === normalized(expected),
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You grade a young student's typed answer to a fill-in-the-blank question.
Accept the answer if it has the same meaning as the expected word/phrase, ignoring minor spelling, casing, diacritics, spacing, or pluralization differences.
Reject clearly different words.
Return ONLY JSON: {"is_correct": boolean, "feedback": "short encouraging note in the same language as the student's answer (max 80 chars)"}.`,
        },
        {
          role: 'user',
          content: [
            prompt_hint ? `Question context: ${prompt_hint}` : null,
            `Expected answer: ${expected}`,
            `Student answer: ${answer}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let data: { is_correct?: boolean; feedback?: string } = {};
    try {
      data = JSON.parse(content);
    } catch {
      data = {};
    }

    return NextResponse.json<FillBlankCheckResult>({
      isCorrect: data.is_correct === true,
      feedback: typeof data.feedback === 'string' ? data.feedback.slice(0, 120) : undefined,
    });
  } catch (error) {
    console.error('fill-blank-check error:', error);
    return NextResponse.json<FillBlankCheckResult>({ isCorrect: false });
  }
}
