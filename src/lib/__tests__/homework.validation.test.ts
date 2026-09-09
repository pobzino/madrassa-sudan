import { describe, it, expect } from 'vitest';
import {
  createQuestionSchema,
  createAssignmentSchema,
  submitHomeworkSchema,
  gradeSubmissionSchema,
  practicePublicationError,
} from '@/lib/homework.validation';

describe('practicePublicationError', () => {
  const question = {
    question_type: 'multiple_choice', question_text_ar: 'اختر الاسم الصحيح',
    question_text_en: 'Choose the correctly written name.',
    options_ar: ['sam', 'Sam'], options_en: ['sam', 'Sam'],
    correct_answer: 'Sam', correct_option_index: 1,
  };
  it('preserves meaningful letter-case distinctions', () => {
    expect(practicePublicationError([question])).toBeNull();
  });
  it('rejects missing bilingual choices and inconsistent answers', () => {
    expect(practicePublicationError([{...question, options_en: []}])).toMatch(/aligned/);
    expect(practicePublicationError([{...question, correct_answer: 'sam'}])).toMatch(/disagree/);
    expect(practicePublicationError([{...question, question_text_en: ''}])).toMatch(/both/);
  });
  it('requires standard true/false ordering and supports productive word answers', () => {
    expect(practicePublicationError([{...question, question_type: 'true_false', correct_answer: 'false'}])).toMatch(/standard/);
    expect(practicePublicationError([{...question, question_type: 'short_answer', correct_answer: 'cat'}])).toBeNull();
  });
});

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

  it('preserves bilingual Practice choices and their aligned correct index', () => {
    const result = createQuestionSchema.safeParse({
      question_type: 'multiple_choice',
      question_text_ar: 'اختر العدد ثلاثة',
      question_text_en: 'Choose the number three',
      options: ['١', '٢', '٣', '٤'],
      options_ar: ['١', '٢', '٣', '٤'],
      options_en: ['1', '2', '3', '4'],
      correct_option_index: 2,
      correct_answer: '٣',
      points: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options_en).toEqual(['1', '2', '3', '4']);
      expect(result.data.correct_option_index).toBe(2);
    }
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
      expect(result.data.passing_score).toBe(75);
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
