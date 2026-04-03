'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { getIncorrectFeedback, getCorrectFeedback } from '@/lib/feedback-messages';
// Inline SVG icons (no lucide-react dependency)
const Check = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);
const X = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const AlertCircle = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const RotateCcw = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

export interface QuizQuestion {
  id: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_in_blank';
  question_text_ar: string;
  question_text_en: string;
  options?: Array<{
    id: string;
    text_ar: string;
    text_en: string;
    is_correct: boolean;
  }>;
  correct_answer?: string;
  explanation_ar?: string;
  explanation_en?: string;
  points?: number;
}

export interface QuizSettings {
  allow_retries: boolean;
  max_attempts?: number | null;
  show_explanation: boolean;
}

interface QuizOverlayProps {
  question: QuizQuestion;
  settings: QuizSettings;
  currentAttempt: number;
  onSubmit: (answer: string | string[], isCorrect: boolean) => void;
  onRetry: () => void;
  language: 'en' | 'ar';
  questionNumber: number;
  totalQuestions: number;
}

export function QuizOverlay({
  question,
  settings,
  currentAttempt,
  onSubmit,
  onRetry,
  language,
  questionNumber,
  totalQuestions,
}: QuizOverlayProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [fillInAnswer, setFillInAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const questionText = language === 'ar' ? question.question_text_ar : question.question_text_en;
  const explanationText = language === 'ar' ? question.explanation_ar : question.explanation_en;

  const canRetry =
    settings.allow_retries &&
    (settings.max_attempts == null || currentAttempt < settings.max_attempts);

  const handleSubmit = () => {
    let answer: string | string[] = '';
    let correct = false;

    if (question.question_type === 'multiple_choice') {
      answer = selectedAnswer || '';
      const selectedOption = question.options?.find((opt) => opt.id === selectedAnswer);
      correct = selectedOption?.is_correct || false;
    } else if (question.question_type === 'true_false') {
      answer = selectedAnswer || '';
      correct = answer === question.correct_answer;
    } else if (question.question_type === 'fill_in_blank') {
      answer = fillInAnswer.trim();
      correct = answer.toLowerCase() === (question.correct_answer || '').toLowerCase();
    }

    setIsCorrect(correct);
    setSubmitted(true);
    onSubmit(answer, correct);
  };

  const handleRetryClick = () => {
    setSubmitted(false);
    setIsCorrect(false);
    setSelectedAnswer(null);
    setFillInAnswer('');
    onRetry();
  };

  const renderQuestionContent = () => {
    if (question.question_type === 'multiple_choice' && question.options) {
      return (
        <RadioGroup value={selectedAnswer || ''} onValueChange={setSelectedAnswer}>
          <div className="space-y-3">
            {question.options.map((option) => (
              <div
                key={option.id}
                className={`
                  flex items-center space-x-3 p-4 border rounded-lg cursor-pointer transition-colors
                  ${selectedAnswer === option.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-300'}
                  ${submitted && option.is_correct ? 'bg-green-50 border-green-500' : ''}
                  ${submitted && selectedAnswer === option.id && !option.is_correct ? 'bg-red-50 border-red-500' : ''}
                `}
              >
                <RadioGroupItem value={option.id} id={option.id} disabled={submitted} />
                <Label htmlFor={option.id} className="flex-1 cursor-pointer" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  {language === 'ar' ? option.text_ar : option.text_en}
                </Label>
                {submitted && option.is_correct && (
                  <Check className="h-5 w-5 text-green-600" />
                )}
                {submitted && selectedAnswer === option.id && !option.is_correct && (
                  <X className="h-5 w-5 text-red-600" />
                )}
              </div>
            ))}
          </div>
        </RadioGroup>
      );
    }

    if (question.question_type === 'true_false') {
      const trueFalseOptions = [
        { id: 'true', label_en: 'True', label_ar: 'صح', value: 'true' },
        { id: 'false', label_en: 'False', label_ar: 'خطأ', value: 'false' },
      ];

      return (
        <div className="grid grid-cols-2 gap-4">
          {trueFalseOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => !submitted && setSelectedAnswer(option.value)}
              disabled={submitted}
              className={`
                py-8 px-6 text-lg font-semibold rounded-lg border-2 transition-all
                ${selectedAnswer === option.value ? 'border-blue-500 bg-blue-50 scale-105' : 'border-gray-300 hover:border-blue-300'}
                ${submitted && option.value === question.correct_answer ? 'bg-green-50 border-green-500' : ''}
                ${submitted && selectedAnswer === option.value && option.value !== question.correct_answer ? 'bg-red-50 border-red-500' : ''}
                disabled:cursor-not-allowed
              `}
            >
              <div className="flex flex-col items-center gap-2">
                <span>{language === 'ar' ? option.label_ar : option.label_en}</span>
                {submitted && option.value === question.correct_answer && (
                  <Check className="h-6 w-6 text-green-600" />
                )}
                {submitted && selectedAnswer === option.value && option.value !== question.correct_answer && (
                  <X className="h-6 w-6 text-red-600" />
                )}
              </div>
            </button>
          ))}
        </div>
      );
    }

    if (question.question_type === 'fill_in_blank') {
      return (
        <div className="space-y-4">
          <Input
            value={fillInAnswer}
            onChange={(e) => setFillInAnswer(e.target.value)}
            placeholder={language === 'ar' ? 'اكتب إجابتك هنا' : 'Type your answer here'}
            disabled={submitted}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className={`
              text-lg py-6
              ${submitted && isCorrect ? 'border-green-500 bg-green-50' : ''}
              ${submitted && !isCorrect ? 'border-red-500 bg-red-50' : ''}
            `}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !submitted && fillInAnswer.trim()) {
                handleSubmit();
              }
            }}
          />
          {submitted && !isCorrect && question.correct_answer && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-gray-600">
                {language === 'ar' ? 'الإجابة الصحيحة:' : 'Correct answer:'}
              </p>
              <p className="font-medium text-blue-900">{question.correct_answer}</p>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">
              {language === 'ar' ? `سؤال ${questionNumber} من ${totalQuestions}` : `Question ${questionNumber} of ${totalQuestions}`}
            </span>
            {currentAttempt > 1 && (
              <span className="text-sm text-gray-500">
                {language === 'ar' ? `المحاولة ${currentAttempt}` : `Attempt ${currentAttempt}`}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            {questionText}
          </h2>
        </div>

        {/* Question Content */}
        <div className="p-6">{renderQuestionContent()}</div>

        {/* Feedback */}
        {submitted && (
          <div className={`mx-6 p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            <div className="flex items-start gap-3">
              {isCorrect ? (
                <Check className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-semibold ${isCorrect ? 'text-green-900' : 'text-amber-900'}`}>
                  {isCorrect
                    ? getCorrectFeedback(language)
                    : getIncorrectFeedback(language)}
                </p>
                {settings.show_explanation && explanationText && (
                  <p className="text-sm mt-2" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                    {explanationText}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-6 border-t flex justify-end gap-3">
          {!submitted && (
            <Button
              onClick={handleSubmit}
              disabled={
                (question.question_type !== 'fill_in_blank' && !selectedAnswer) ||
                (question.question_type === 'fill_in_blank' && !fillInAnswer.trim())
              }
              size="lg"
            >
              {language === 'ar' ? 'تأكيد الإجابة' : 'Submit Answer'}
            </Button>
          )}
          {submitted && !isCorrect && canRetry && (
            <Button onClick={handleRetryClick} size="lg" variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              {language === 'ar' ? 'حاول مرة أخرى' : 'Try Again'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
