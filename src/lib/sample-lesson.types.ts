import type { SimPayload } from "@/lib/sim.types";

export interface SamplePracticeQuestion {
  id: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  promptAr: string;
  promptEn: string;
  optionsAr: string[];
  optionsEn: string[];
  correctAnswer: string;
  correctOptionIndex: number | null;
  audioUrlAr: string | null;
  audioUrlEn: string | null;
}

export interface SampleLessonData {
  lesson: {
    id: string;
    titleAr: string;
    titleEn: string;
    descriptionAr: string;
    descriptionEn: string;
    gradeLevel: number;
    subjectAr: string;
    subjectEn: string;
    durationMs: number;
    slideCount: number;
    activityCount: number;
  };
  contentLanguage: "ar" | "en";
  sim: SimPayload;
  practice: {
    titleAr: string;
    titleEn: string;
    passingPercent: number;
    questions: SamplePracticeQuestion[];
  };
}
