'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
// Inline SVG icons (no lucide-react dependency)
const Edit = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const Trash2 = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const GripVertical = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
  </svg>
);
const Clock = ({ className = '' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
export interface QuestionData {
  id?: string;
  question_type: string;
  timestamp_seconds: number;
  question_text_ar: string;
  question_text_en: string;
  correct_answer: string;
  options?: Array<{ text_ar: string; text_en: string; is_correct: boolean }>;
  explanation_ar?: string;
  explanation_en?: string;
  points?: number;
  display_order?: number;
}

interface QuestionListProps {
  questions: QuestionData[];
  onEdit: (question: QuestionData) => void;
  onDelete: (questionId: string) => void;
  onReorder: (questions: QuestionData[]) => void;
}

export function QuestionList({ questions, onEdit, onDelete, onReorder }: QuestionListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newQuestions = [...questions];
    const draggedItem = newQuestions[draggedIndex];
    newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    onReorder(newQuestions);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getQuestionTypeLabel = (type: string) => {
    switch (type) {
      case 'multiple_choice':
        return 'Multiple Choice';
      case 'true_false':
        return 'True/False';
      case 'fill_in_blank':
        return 'Fill in Blank';
      default:
        return type;
    }
  };

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No quiz questions yet. Add your first question to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {questions.map((question, index) => (
        <div
          key={question.id || index}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className={`
            flex items-center gap-4 p-4 bg-white border rounded-lg
            cursor-move hover:shadow-md transition-shadow
            ${draggedIndex === index ? 'opacity-50' : ''}
          `}
        >
          {/* Drag Handle */}
          <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5 text-gray-400" />
          </div>

          {/* Question Number */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold flex items-center justify-center text-sm">
            {index + 1}
          </div>

          {/* Question Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                {getQuestionTypeLabel(question.question_type)}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {formatTimestamp(question.timestamp_seconds)}
              </span>
              {question.points && question.points > 1 && (
                <span className="text-xs text-gray-500">
                  {question.points} pts
                </span>
              )}
            </div>
            <p className="font-medium text-gray-900 truncate">
              {question.question_text_en}
            </p>
            <p className="text-sm text-gray-600 truncate" dir="rtl">
              {question.question_text_ar}
            </p>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(question)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => question.id && onDelete(question.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
