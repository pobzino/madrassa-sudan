import { describe, it, expect } from 'vitest';
import {
  createQuestionSchema,
  createAssignmentSchema,
  submitHomeworkSchema,
  gradeSubmissionSchema,
} from '@/lib/homework.validation';

describe('createQuestionSchema', () => {
  it('accepts a valid multiple_choice question', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'multiple_choice',
      question_text_ar: 'ما هو 2+2؟',
      options: ['2', '3', '4', '5'],
      correct_answer: '4',
      points: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing question_text_ar', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'short_answer',
      points: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid question_type', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'essay',
      question_text_ar: 'test',
      points: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects points < 1', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'short_answer',
      question_text_ar: 'test',
      points: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional rubric', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'long_answer',
      question_text_ar: 'اكتب مقالة',
      points: 20,
      rubric: [
        { criterion: 'Grammar', description: 'Correct grammar usage', points: 10 },
        { criterion: 'Content', description: 'Relevant content', points: 10 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects rubric with negative points', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'long_answer',
      question_text_ar: 'test',
      points: 10,
      rubric: [{ criterion: 'Grammar', description: 'test', points: -1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('createAssignmentSchema', () => {
  const validQuestion = {
    question_type: 'short_answer' as const,
    question_text_ar: 'test',
    points: 5,
  };

  it('accepts a valid assignment', () => {
    const result = createAssignmentSchema.safeParse({
      cohort_id: 'a0000000-0000-4000-8000-000000000001',
      title_ar: 'واجب الرياضيات',
      questions: [validQuestion],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty questions array', () => {
    const result = createAssignmentSchema.safeParse({
      cohort_id: 'a0000000-0000-4000-8000-000000000001',
      title_ar: 'test',
      questions: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid cohort_id format', () => {
    const result = createAssignmentSchema.safeParse({
      cohort_id: 'not-a-uuid',
      title_ar: 'test',
      questions: [validQuestion],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing title_ar', () => {
    const result = createAssignmentSchema.safeParse({
      cohort_id: 'a0000000-0000-4000-8000-000000000001',
      questions: [validQuestion],
    });
    expect(result.success).toBe(false);
  });

  it('defaults is_published to false', () => {
    const result = createAssignmentSchema.safeParse({
      cohort_id: 'a0000000-0000-4000-8000-000000000001',
      title_ar: 'test',
      questions: [validQuestion],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_published).toBe(false);
    }
  });
});

describe('submitHomeworkSchema', () => {
  it('accepts a valid submission', () => {
    const result = submitHomeworkSchema.safeParse({
      assignment_id: 'a0000000-0000-4000-8000-000000000001',
      answers: [
        { question_id: 'b0000000-0000-4000-8000-000000000002', response_text: 'My answer' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts submission with file upload', () => {
    const result = submitHomeworkSchema.safeParse({
      assignment_id: 'a0000000-0000-4000-8000-000000000001',
      answers: [
        {
          question_id: 'b0000000-0000-4000-8000-000000000002',
          response_file_url: 'https://storage.example.com/file.pdf',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid assignment_id', () => {
    const result = submitHomeworkSchema.safeParse({
      assignment_id: 'bad',
      answers: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional time_spent_seconds', () => {
    const result = submitHomeworkSchema.safeParse({
      assignment_id: 'a0000000-0000-4000-8000-000000000001',
      answers: [],
      time_spent_seconds: 120,
    });
    expect(result.success).toBe(true);
  });
});

describe('gradeSubmissionSchema', () => {
  it('accepts valid grades', () => {
    const result = gradeSubmissionSchema.safeParse({
      submission_id: 'a0000000-0000-4000-8000-000000000001',
      grades: [
        { response_id: 'b0000000-0000-4000-8000-000000000002', points_earned: 8 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative points_earned', () => {
    const result = gradeSubmissionSchema.safeParse({
      submission_id: 'a0000000-0000-4000-8000-000000000001',
      grades: [
        { response_id: 'b0000000-0000-4000-8000-000000000002', points_earned: -1 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional overall_feedback and teacher_comment', () => {
    const result = gradeSubmissionSchema.safeParse({
      submission_id: 'a0000000-0000-4000-8000-000000000001',
      grades: [
        {
          response_id: 'b0000000-0000-4000-8000-000000000002',
          points_earned: 10,
          teacher_comment: 'Great work!',
        },
      ],
      overall_feedback: 'Well done overall.',
    });
    expect(result.success).toBe(true);
  });
});
