import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/ai/openai-client';

// Vision grader for letter/word tracing activities. The client captures the
// canvas (guide text + student stroke) as a PNG data URL and sends it here
// along with the target text. The grader checks whether the student actually
// traced the text rather than scribbling randomly.
const BodySchema = z.object({
  image_data_url: z
    .string()
    .min(32)
    .max(2_000_000)
    .refine((value) => value.startsWith('data:image/'), {
      message: 'image_data_url must be a base64 data URL',
    }),
  target_text: z.string().min(1).max(200),
  script: z.enum(['ar', 'en']),
});

interface TraceCheckResult {
  isCorrect: boolean;
  stars: number;
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

  const { image_data_url, target_text, script } = parsed.data;

  const openai = getOpenAIClient();
  if (!openai) {
    // No AI configured — accept so the feature works locally without an API key
    return NextResponse.json<TraceCheckResult>({ isCorrect: true, stars: 3 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are evaluating a young child's handwriting trace practice.
The image shows gray guide text and a colored stroke drawn by the child on top.
The target text is: "${target_text}" (${script === 'ar' ? 'Arabic' : 'English'}).

Evaluate whether the child's colored stroke reasonably traces the target text.
- Be generous: messy but recognisable tracing should pass.
- Accept partial tracing if the child traced most of the letters.
- Reject if the stroke is just a random scribble, a single line, or clearly unrelated to the text.
- A single straight line does NOT count as tracing a word.

Return ONLY JSON:
{
  "is_correct": boolean,
  "stars": 1|2|3,
  "feedback": "short encouraging message in ${script === 'ar' ? 'Arabic' : 'English'} (max 80 chars)"
}

Stars guide: 3 = excellent trace, 2 = recognisable but messy, 1 = barely acceptable.
If is_correct is false, stars should be 0.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: image_data_url, detail: 'low' },
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let data: { is_correct?: boolean; stars?: number; feedback?: string } = {};
    try {
      data = JSON.parse(content);
    } catch {
      data = {};
    }

    const isCorrect = data.is_correct === true;
    const stars = isCorrect ? Math.max(1, Math.min(3, data.stars || 1)) : 0;

    return NextResponse.json<TraceCheckResult>({
      isCorrect,
      stars,
      feedback: typeof data.feedback === 'string' ? data.feedback.slice(0, 160) : undefined,
    });
  } catch (error) {
    console.error('trace-check error:', error);
    // On error, accept so kids aren't blocked
    return NextResponse.json<TraceCheckResult>({ isCorrect: true, stars: 2 });
  }
}
