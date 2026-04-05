import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/ai/openai-client';

// Vision grader for `draw_answer` slide interactions. The client rasterizes the
// student whiteboard to a PNG data URL and posts it here along with the
// teacher's expected-answer description. The grader is deliberately lenient so
// young students are not penalised for messy but recognisable drawings.
const BodySchema = z.object({
  image_data_url: z
    .string()
    .min(32)
    .max(2_000_000)
    .refine((value) => value.startsWith('data:image/'), {
      message: 'image_data_url must be a base64 data URL',
    }),
  expected_ar: z.string().max(600).optional(),
  expected_en: z.string().max(600).optional(),
  language: z.enum(['ar', 'en']),
  prompt_hint: z.string().max(600).optional(),
});

interface DrawCheckResult {
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

  const { image_data_url, expected_ar, expected_en, language, prompt_hint } = parsed.data;
  const expected =
    (language === 'ar' ? expected_ar : expected_en)?.trim() ||
    expected_ar?.trim() ||
    expected_en?.trim() ||
    '';

  if (!expected) {
    return NextResponse.json<DrawCheckResult>({ isCorrect: false });
  }

  const openai = getOpenAIClient();
  if (!openai) {
    // No AI configured — accept any non-empty drawing so the feature is usable
    // locally without an API key. Real grading happens only when OpenAI is set.
    return NextResponse.json<DrawCheckResult>({ isCorrect: true });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 160,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are grading a young student's hand-drawn answer on a school whiteboard.
You will receive the teacher's expected-answer description and an image of the student's drawing.
Be generous: accept any drawing that clearly shows the required shapes, labels, or relationships — even if it is messy, rough, or stylised.
Reject only drawings that are empty, unrelated to the question, or clearly wrong.
Return ONLY JSON: {"is_correct": boolean, "feedback": "short encouraging note in the same language as the expected answer (max 120 chars)"}.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                prompt_hint ? `Question: ${prompt_hint}` : null,
                `Expected answer: ${expected}`,
                'Grade the attached student drawing.',
              ]
                .filter(Boolean)
                .join('\n'),
            },
            {
              type: 'image_url',
              image_url: { url: image_data_url, detail: 'low' },
            },
          ],
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

    return NextResponse.json<DrawCheckResult>({
      isCorrect: data.is_correct === true,
      feedback: typeof data.feedback === 'string' ? data.feedback.slice(0, 160) : undefined,
    });
  } catch (error) {
    console.error('draw-check error:', error);
    return NextResponse.json<DrawCheckResult>({ isCorrect: false });
  }
}
