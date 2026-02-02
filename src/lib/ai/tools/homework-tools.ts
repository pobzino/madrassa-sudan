// Homework-related AI tools

import { SupabaseClient } from "@supabase/supabase-js";
import { ToolExecutionResult, StudentContext, HomeworkSummary, CreateHomeworkParams } from "../types";
import { getPreferredLanguage, localizeSubjectName, localizeText } from "./utils";

// Get student's homework assignments
export async function getStudentHomework(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const status = params.status as string | undefined;
    const subjectId = params.subject_id as string | undefined;
    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Get homework submissions for the student
    let query = supabase
      .from("homework_submissions")
      .select(`
        id,
        status,
        score,
        started_at,
        submitted_at,
        assignment:homework_assignments (
          id,
          title_ar,
          title_en,
          instructions_ar,
          instructions_en,
          subject_id,
          total_points,
          due_at,
          subject:subjects (
            name_ar,
            name_en
          )
        )
      `)
      .eq("student_id", studentContext.id)
      .order("created_at", { ascending: false });

    // Filter by status if specified
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: submissions, error: submissionsError } = await query;
    if (submissionsError) throw submissionsError;

    // Filter by subject if specified
    let filteredSubmissions = submissions || [];
    if (subjectId) {
      filteredSubmissions = filteredSubmissions.filter((s) => {
        const assignment = s.assignment as unknown as { subject_id: string } | null;
        return assignment?.subject_id === subjectId;
      });
    }

    // Transform to homework summaries
    const homeworkList: HomeworkSummary[] = filteredSubmissions.map((sub) => {
      const assignment = sub.assignment as unknown as {
        id: string;
        title_ar: string;
        title_en: string | null;
        subject_id: string | null;
        total_points: number;
        due_at: string | null;
        subject: { name_ar: string; name_en: string } | null;
      } | null;

      const subjectName = localizeSubjectName(lang, assignment?.subject || null);
      const title = localizeText(lang, assignment?.title_ar, assignment?.title_en, "");

      return {
        id: sub.id,
        title_ar: assignment?.title_ar || "",
        title_en: assignment?.title_en || null,
        title,
        subject_id: assignment?.subject_id || null,
        subject_name_ar: assignment?.subject?.name_ar,
        subject_name_en: assignment?.subject?.name_en,
        subject_name: subjectName,
        due_at: assignment?.due_at || null,
        status: sub.status as "not_started" | "in_progress" | "submitted" | "graded",
        score: sub.score,
        total_points: assignment?.total_points || 0,
      };
    });

    // Categorize by status
    const categorized = {
      not_started: homeworkList.filter((h) => h.status === "not_started"),
      in_progress: homeworkList.filter((h) => h.status === "in_progress"),
      submitted: homeworkList.filter((h) => h.status === "submitted"),
      graded: homeworkList.filter((h) => h.status === "graded"),
    };

    return {
      success: true,
      data: {
        homework: homeworkList,
        by_status: categorized,
        counts: {
          total: homeworkList.length,
          not_started: categorized.not_started.length,
          in_progress: categorized.in_progress.length,
          submitted: categorized.submitted.length,
          graded: categorized.graded.length,
        },
        summary: localizeText(
          lang,
          `لديك ${categorized.not_started.length + categorized.in_progress.length} واجبات تحتاج للانتهاء منها.`,
          `You have ${categorized.not_started.length + categorized.in_progress.length} homework items to finish.`,
          ""
        ),
        overdue: homeworkList.filter(
          (h) =>
            h.due_at &&
            new Date(h.due_at) < new Date() &&
            (h.status === "not_started" || h.status === "in_progress")
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get student homework",
    };
  }
}

// Get detailed homework information
export async function getHomeworkDetails(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const homeworkId = params.homework_id as string;
    const lang = getPreferredLanguage(studentContext.preferred_language);

    if (!homeworkId) {
      return {
        success: false,
        error: "homework_id is required",
      };
    }

    // Get submission with assignment details
    const { data: submission, error: submissionError } = await supabase
      .from("homework_submissions")
      .select(`
        id,
        status,
        score,
        started_at,
        submitted_at,
        graded_at,
        feedback,
        assignment:homework_assignments (
          id,
          title_ar,
          title_en,
          instructions_ar,
          instructions_en,
          subject_id,
          total_points,
          due_at,
          created_by,
          subject:subjects (
            name_ar,
            name_en
          )
        )
      `)
      .eq("id", homeworkId)
      .eq("student_id", studentContext.id)
      .single();

    if (submissionError) throw submissionError;

    const assignment = submission.assignment as unknown as {
      id: string;
      title_ar: string;
      title_en: string | null;
      instructions_ar: string | null;
      instructions_en: string | null;
      subject_id: string | null;
      total_points: number;
      due_at: string | null;
      subject: { name_ar: string; name_en: string } | null;
    } | null;

    // Get questions for this assignment
    const { data: questions, error: questionsError } = await supabase
      .from("homework_questions")
      .select(`
        id,
        question_text_ar,
        question_text_en,
        question_type,
        options,
        points,
        display_order
      `)
      .eq("assignment_id", assignment?.id)
      .order("display_order", { ascending: true });

    if (questionsError) throw questionsError;

    // Get student's responses
    const questionIds = questions?.map((q) => q.id) || [];
    const { data: responses } = await supabase
      .from("homework_responses")
      .select("question_id, response_text, is_correct, points_earned, feedback")
      .eq("submission_id", homeworkId)
      .in("question_id", questionIds);

    const responseMap = new Map(responses?.map((r) => [r.question_id, r]) || []);

    // Check if this was AI-created
    const { data: aiCreated } = await supabase
      .from("ai_created_homework")
      .select("reason, difficulty_level")
      .eq("assignment_id", assignment?.id)
      .single();

    return {
      success: true,
      data: {
        submission: {
          id: submission.id,
          status: submission.status,
          score: submission.score,
          started_at: submission.started_at,
          submitted_at: submission.submitted_at,
          graded_at: submission.graded_at,
          feedback: submission.feedback,
        },
        assignment: {
          id: assignment?.id,
          title_ar: assignment?.title_ar,
          title_en: assignment?.title_en,
          title: localizeText(lang, assignment?.title_ar, assignment?.title_en, ""),
          instructions_ar: assignment?.instructions_ar,
          instructions_en: assignment?.instructions_en,
          instructions: localizeText(lang, assignment?.instructions_ar, assignment?.instructions_en, ""),
          subject_id: assignment?.subject_id,
          subject_name_ar: assignment?.subject?.name_ar,
          subject_name_en: assignment?.subject?.name_en,
          subject_name: localizeSubjectName(lang, assignment?.subject || null),
          total_points: assignment?.total_points,
          due_at: assignment?.due_at,
        },
        questions: questions?.map((q) => {
          const response = responseMap.get(q.id);
          return {
            id: q.id,
            question_text_ar: q.question_text_ar,
            question_text_en: q.question_text_en,
            question_text: localizeText(lang, q.question_text_ar, q.question_text_en, ""),
            question_type: q.question_type,
            options: q.options,
            points: q.points,
            answered: !!response,
            response: response
              ? {
                  text: response.response_text,
                  is_correct: response.is_correct,
                  points_earned: response.points_earned,
                  feedback: response.feedback,
                }
              : null,
          };
        }),
        ai_created: aiCreated
          ? {
              reason: aiCreated.reason,
              difficulty_level: aiCreated.difficulty_level,
            }
          : null,
        is_overdue:
          assignment?.due_at &&
          new Date(assignment.due_at) < new Date() &&
          (submission.status === "not_started" || submission.status === "in_progress"),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get homework details",
    };
  }
}

// Get current homework question context for targeted help
export async function getHomeworkQuestionContext(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const submissionId = params.submission_id as string;
    const questionId = params.question_id as string;
    const lang = getPreferredLanguage(studentContext.preferred_language);

    if (!submissionId || !questionId) {
      return { success: false, error: "submission_id and question_id are required" };
    }

    const { data: submission, error: submissionError } = await supabase
      .from("homework_submissions")
      .select(
        `
        id,
        status,
        assignment:homework_assignments (
          id,
          title_ar,
          title_en,
          instructions_ar,
          instructions_en,
          subject:subjects (
            name_ar,
            name_en
          )
        )
      `
      )
      .eq("id", submissionId)
      .eq("student_id", studentContext.id)
      .single();

    if (submissionError || !submission) {
      return { success: false, error: "Homework submission not found" };
    }

    const assignment = submission.assignment as unknown as {
      id: string;
      title_ar: string;
      title_en: string | null;
      instructions_ar: string | null;
      instructions_en: string | null;
      subject: { name_ar: string; name_en: string } | null;
    } | null;

    const { data: question, error: questionError } = await supabase
      .from("homework_questions")
      .select("id, question_text_ar, question_text_en, question_type, options, points, assignment_id")
      .eq("id", questionId)
      .eq("assignment_id", assignment?.id)
      .single();

    if (questionError || !question) {
      return { success: false, error: "Question not found for this assignment" };
    }

    const { data: response } = await supabase
      .from("homework_responses")
      .select("response_text, response_file_url, points_earned, teacher_comment, updated_at")
      .eq("submission_id", submissionId)
      .eq("question_id", questionId)
      .single();

    return {
      success: true,
      data: {
        submission: {
          id: submission.id,
          status: submission.status,
        },
        assignment: {
          id: assignment?.id,
          title_ar: assignment?.title_ar,
          title_en: assignment?.title_en,
          title: localizeText(lang, assignment?.title_ar, assignment?.title_en, ""),
          instructions_ar: assignment?.instructions_ar,
          instructions_en: assignment?.instructions_en,
          instructions: localizeText(lang, assignment?.instructions_ar, assignment?.instructions_en, ""),
          subject_name_ar: assignment?.subject?.name_ar,
          subject_name_en: assignment?.subject?.name_en,
          subject_name: localizeSubjectName(lang, assignment?.subject || null),
        },
        question: {
          id: question.id,
          question_text_ar: question.question_text_ar,
          question_text_en: question.question_text_en,
          question_text: localizeText(lang, question.question_text_ar, question.question_text_en, ""),
          question_type: question.question_type,
          options: question.options,
          points: question.points,
        },
        response: response
          ? {
              text: response.response_text,
              file_url: response.response_file_url,
              points_earned: response.points_earned,
              teacher_comment: response.teacher_comment,
              updated_at: response.updated_at,
            }
          : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get homework question context",
    };
  }
}

// Helper function to generate practice questions based on subject and topic
function generatePracticeQuestions(
  subjectName: string,
  topic: string,
  difficulty: "easy" | "medium" | "hard",
  count: number,
  gradeLevel: number
): Array<{
  question_type: "multiple_choice" | "short_answer" | "long_answer";
  question_text_ar: string;
  question_text_en?: string;
  options?: string[];
  correct_answer?: string;
  points: number;
}> {
  const questions: Array<{
    question_type: "multiple_choice" | "short_answer" | "long_answer";
    question_text_ar: string;
    question_text_en?: string;
    options?: string[];
    correct_answer?: string;
    points: number;
  }> = [];

  const subject = subjectName.toLowerCase();
  const isMath = subject.includes("math") || subject.includes("رياضيات");
  const isScience = subject.includes("science") || subject.includes("علوم");
  const isEnglish = subject.includes("english") || subject.includes("إنجليزي");
  const isArabic = subject.includes("arabic") || subject.includes("عربي") || subject.includes("لغة عربية");

  // Math question templates based on grade level and difficulty
  if (isMath) {
    const mathQuestions = generateMathQuestions(topic, difficulty, count, gradeLevel);
    questions.push(...mathQuestions);
  } else if (isScience) {
    const scienceQuestions = generateScienceQuestions(topic, difficulty, count, gradeLevel);
    questions.push(...scienceQuestions);
  } else if (isEnglish) {
    const englishQuestions = generateEnglishQuestions(topic, difficulty, count, gradeLevel);
    questions.push(...englishQuestions);
  } else if (isArabic) {
    const arabicQuestions = generateArabicQuestions(topic, difficulty, count, gradeLevel);
    questions.push(...arabicQuestions);
  } else {
    // Generic questions for unknown subjects
    for (let i = 0; i < count; i++) {
      questions.push({
        question_type: "short_answer",
        question_text_ar: `سؤال ${i + 1}: اشرح مفهوم ${topic}`,
        question_text_en: `Question ${i + 1}: Explain the concept of ${topic}`,
        points: 10,
      });
    }
  }

  return questions.slice(0, count);
}

// Generate math questions based on topic and difficulty
function generateMathQuestions(
  topic: string,
  difficulty: "easy" | "medium" | "hard",
  count: number,
  gradeLevel: number
) {
  const questions: Array<{
    question_type: "multiple_choice" | "short_answer";
    question_text_ar: string;
    question_text_en: string;
    options?: string[];
    correct_answer?: string;
    points: number;
  }> = [];

  const topicLower = topic.toLowerCase();
  const isAddition = topicLower.includes("add") || topicLower.includes("جمع");
  const isSubtraction = topicLower.includes("subtract") || topicLower.includes("طرح");
  const isMultiplication = topicLower.includes("multipl") || topicLower.includes("ضرب");
  const isDivision = topicLower.includes("divis") || topicLower.includes("قسمة");
  const isFractions = topicLower.includes("fraction") || topicLower.includes("كسور");

  // Generate numbers based on difficulty and grade
  const maxNum = difficulty === "easy" ? 10 * gradeLevel : difficulty === "medium" ? 50 * gradeLevel : 100 * gradeLevel;

  for (let i = 0; i < count; i++) {
    const a = Math.floor(Math.random() * maxNum) + 1;
    const b = Math.floor(Math.random() * (maxNum / 2)) + 1;

    if (isAddition) {
      const answer = a + b;
      questions.push({
        question_type: "short_answer",
        question_text_ar: `ما ناتج ${a} + ${b}؟`,
        question_text_en: `What is ${a} + ${b}?`,
        correct_answer: answer.toString(),
        points: 10,
      });
    } else if (isSubtraction) {
      const larger = Math.max(a, b);
      const smaller = Math.min(a, b);
      const answer = larger - smaller;
      questions.push({
        question_type: "short_answer",
        question_text_ar: `ما ناتج ${larger} − ${smaller}؟`,
        question_text_en: `What is ${larger} − ${smaller}?`,
        correct_answer: answer.toString(),
        points: 10,
      });
    } else if (isMultiplication) {
      const smallA = Math.floor(Math.random() * 12) + 1;
      const smallB = Math.floor(Math.random() * 12) + 1;
      const answer = smallA * smallB;
      questions.push({
        question_type: "short_answer",
        question_text_ar: `ما ناتج ${smallA} × ${smallB}؟`,
        question_text_en: `What is ${smallA} × ${smallB}?`,
        correct_answer: answer.toString(),
        points: 10,
      });
    } else if (isDivision) {
      const divisor = Math.floor(Math.random() * 10) + 2;
      const quotient = Math.floor(Math.random() * 10) + 1;
      const dividend = divisor * quotient;
      questions.push({
        question_type: "short_answer",
        question_text_ar: `ما ناتج ${dividend} ÷ ${divisor}؟`,
        question_text_en: `What is ${dividend} ÷ ${divisor}?`,
        correct_answer: quotient.toString(),
        points: 10,
      });
    } else if (isFractions) {
      const num = Math.floor(Math.random() * 5) + 1;
      const den = Math.floor(Math.random() * 8) + 2;
      questions.push({
        question_type: "multiple_choice",
        question_text_ar: `ما هو نوع الكسر ${num}/${den}؟`,
        question_text_en: `What type of fraction is ${num}/${den}?`,
        options: num < den
          ? ["كسر حقيقي (Proper fraction)", "كسر غير حقيقي (Improper fraction)", "عدد كسري (Mixed number)", "لا شيء مما سبق"]
          : ["كسر غير حقيقي (Improper fraction)", "كسر حقيقي (Proper fraction)", "عدد كسري (Mixed number)", "لا شيء مما سبق"],
        correct_answer: num < den ? "كسر حقيقي (Proper fraction)" : "كسر غير حقيقي (Improper fraction)",
        points: 10,
      });
    } else {
      // Default math - mixed operations
      const ops = ["+", "−", "×"];
      const op = ops[i % 3];
      let answer: number;
      let questionAr: string;
      let questionEn: string;

      if (op === "+") {
        answer = a + b;
        questionAr = `ما ناتج ${a} + ${b}؟`;
        questionEn = `What is ${a} + ${b}?`;
      } else if (op === "−") {
        const larger = Math.max(a, b);
        const smaller = Math.min(a, b);
        answer = larger - smaller;
        questionAr = `ما ناتج ${larger} − ${smaller}؟`;
        questionEn = `What is ${larger} − ${smaller}?`;
      } else {
        const smallA = Math.floor(Math.random() * 12) + 1;
        const smallB = Math.floor(Math.random() * 12) + 1;
        answer = smallA * smallB;
        questionAr = `ما ناتج ${smallA} × ${smallB}؟`;
        questionEn = `What is ${smallA} × ${smallB}?`;
      }

      questions.push({
        question_type: "short_answer",
        question_text_ar: questionAr,
        question_text_en: questionEn,
        correct_answer: answer.toString(),
        points: 10,
      });
    }
  }

  return questions;
}

// Generate science questions
function generateScienceQuestions(
  topic: string,
  difficulty: "easy" | "medium" | "hard",
  count: number,
  _gradeLevel: number
) {
  const questions: Array<{
    question_type: "multiple_choice" | "short_answer";
    question_text_ar: string;
    question_text_en: string;
    options?: string[];
    correct_answer?: string;
    points: number;
  }> = [];

  // Generate science questions based on common topics
  const scienceTemplates = [
    {
      ar: `ما هي خصائص ${topic}؟`,
      en: `What are the properties of ${topic}?`,
      type: "short_answer" as const,
    },
    {
      ar: `اشرح كيف يعمل/تعمل ${topic}`,
      en: `Explain how ${topic} works`,
      type: "short_answer" as const,
    },
    {
      ar: `ما أهمية ${topic} في حياتنا اليومية؟`,
      en: `What is the importance of ${topic} in our daily life?`,
      type: "short_answer" as const,
    },
  ];

  for (let i = 0; i < count; i++) {
    const template = scienceTemplates[i % scienceTemplates.length];
    questions.push({
      question_type: template.type,
      question_text_ar: template.ar,
      question_text_en: template.en,
      points: difficulty === "easy" ? 10 : difficulty === "medium" ? 15 : 20,
    });
  }

  return questions;
}

// Generate English questions
function generateEnglishQuestions(
  topic: string,
  difficulty: "easy" | "medium" | "hard",
  count: number,
  _gradeLevel: number
) {
  const questions: Array<{
    question_type: "multiple_choice" | "short_answer";
    question_text_ar: string;
    question_text_en: string;
    options?: string[];
    correct_answer?: string;
    points: number;
  }> = [];

  const topicLower = topic.toLowerCase();
  const isGrammar = topicLower.includes("grammar") || topicLower.includes("قواعد");
  const isVocabulary = topicLower.includes("vocab") || topicLower.includes("مفردات");

  if (isGrammar) {
    const grammarQuestions = [
      { sentence: "She ___ to school every day.", options: ["go", "goes", "going", "went"], correct: "goes" },
      { sentence: "They ___ playing football now.", options: ["is", "are", "am", "be"], correct: "are" },
      { sentence: "I ___ a book yesterday.", options: ["read", "reads", "reading", "readed"], correct: "read" },
      { sentence: "He ___ his homework tomorrow.", options: ["will do", "did", "does", "doing"], correct: "will do" },
      { sentence: "We ___ to the park last week.", options: ["go", "goes", "went", "going"], correct: "went" },
    ];

    for (let i = 0; i < Math.min(count, grammarQuestions.length); i++) {
      const q = grammarQuestions[i];
      questions.push({
        question_type: "multiple_choice",
        question_text_ar: `أكمل الجملة: ${q.sentence}`,
        question_text_en: `Complete the sentence: ${q.sentence}`,
        options: q.options,
        correct_answer: q.correct,
        points: 10,
      });
    }
  } else if (isVocabulary) {
    const vocabPrompts = [
      { ar: "اكتب معنى الكلمة التالية:", en: "Write the meaning of the following word:" },
      { ar: "استخدم الكلمة في جملة مفيدة:", en: "Use the word in a meaningful sentence:" },
    ];

    for (let i = 0; i < count; i++) {
      const prompt = vocabPrompts[i % vocabPrompts.length];
      questions.push({
        question_type: "short_answer",
        question_text_ar: `${prompt.ar} (سؤال ${i + 1})`,
        question_text_en: `${prompt.en} (Question ${i + 1})`,
        points: 10,
      });
    }
  } else {
    // Generic English questions
    for (let i = 0; i < count; i++) {
      questions.push({
        question_type: "short_answer",
        question_text_ar: `سؤال ${i + 1} عن ${topic}`,
        question_text_en: `Question ${i + 1} about ${topic}`,
        points: 10,
      });
    }
  }

  return questions;
}

// Generate Arabic questions
function generateArabicQuestions(
  topic: string,
  difficulty: "easy" | "medium" | "hard",
  count: number,
  _gradeLevel: number
) {
  const questions: Array<{
    question_type: "multiple_choice" | "short_answer";
    question_text_ar: string;
    question_text_en: string;
    options?: string[];
    correct_answer?: string;
    points: number;
  }> = [];

  const topicLower = topic.toLowerCase();
  const isNahw = topicLower.includes("نحو") || topicLower.includes("grammar");
  const isReading = topicLower.includes("قراءة") || topicLower.includes("reading");

  if (isNahw) {
    const nahwQuestions = [
      { q: "ما إعراب كلمة 'الكتابُ' في جملة 'الكتابُ مفيدٌ'؟", options: ["مبتدأ مرفوع", "خبر مرفوع", "فاعل", "مفعول به"], correct: "مبتدأ مرفوع" },
      { q: "ما نوع الجملة: 'ذهب الولدُ إلى المدرسة'؟", options: ["جملة فعلية", "جملة اسمية", "شبه جملة", "لا شيء مما سبق"], correct: "جملة فعلية" },
      { q: "ما علامة رفع الفاعل في 'كتبَ الطالبُ الدرسَ'؟", options: ["الضمة", "الفتحة", "الكسرة", "السكون"], correct: "الضمة" },
    ];

    for (let i = 0; i < Math.min(count, nahwQuestions.length); i++) {
      const q = nahwQuestions[i];
      questions.push({
        question_type: "multiple_choice",
        question_text_ar: q.q,
        question_text_en: `Arabic grammar question ${i + 1}`,
        options: q.options,
        correct_answer: q.correct,
        points: difficulty === "easy" ? 10 : difficulty === "medium" ? 15 : 20,
      });
    }
  } else if (isReading) {
    for (let i = 0; i < count; i++) {
      questions.push({
        question_type: "short_answer",
        question_text_ar: `اقرأ النص ثم أجب: سؤال ${i + 1} عن ${topic}`,
        question_text_en: `Read the text then answer: Question ${i + 1} about ${topic}`,
        points: 10,
      });
    }
  } else {
    // Generic Arabic questions
    for (let i = 0; i < count; i++) {
      questions.push({
        question_type: "short_answer",
        question_text_ar: `سؤال ${i + 1}: اشرح ${topic}`,
        question_text_en: `Question ${i + 1}: Explain ${topic}`,
        points: 10,
      });
    }
  }

  return questions;
}

// Create a new homework assignment for the student
export async function createHomeworkAssignment(
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const homeworkParams = params as unknown as CreateHomeworkParams & {
      _last_user_message?: string;
      confirm?: boolean;
      subject_name?: string; // Allow subject name as alternative
      topic?: string; // Topic for auto-generating questions
      question_count?: number; // Number of questions to generate
    };
    const lang = getPreferredLanguage(studentContext.preferred_language);

    // Minimal required validation - subject and difficulty only
    if (!homeworkParams.subject_id && !homeworkParams.subject_name) {
      return { success: false, error: "Either subject_id or subject_name is required" };
    }
    if (!homeworkParams.difficulty_level) {
      return { success: false, error: "difficulty_level is required" };
    }

    // Auto-generate title if not provided
    const topic = homeworkParams.topic || "practice";
    if (!homeworkParams.title_ar) {
      homeworkParams.title_ar = `تمارين ${topic}`;
      homeworkParams.title_en = `${topic.charAt(0).toUpperCase() + topic.slice(1)} Practice`;
    }

    // Auto-generate reason if not provided
    if (!homeworkParams.reason) {
      homeworkParams.reason = `Student requested ${homeworkParams.difficulty_level} practice on ${topic}`;
    }

    // Auto-generate questions if not provided
    const questionCount = homeworkParams.question_count || 5;
    if (!homeworkParams.questions || homeworkParams.questions.length === 0) {
      homeworkParams.questions = generatePracticeQuestions(
        homeworkParams.subject_name || "",
        topic,
        homeworkParams.difficulty_level,
        questionCount,
        studentContext.grade_level || 3
      );
    }

    if (homeworkParams.questions.length > 10) {
      return { success: false, error: "Maximum 10 questions allowed per assignment" };
    }

    // Find subject - by ID or by name
    let subject: { id: string; name_ar: string; name_en: string } | null = null;

    if (homeworkParams.subject_id) {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name_ar, name_en")
        .eq("id", homeworkParams.subject_id)
        .single();
      if (!error) subject = data;
    }

    // If no subject found by ID, try by name
    if (!subject && homeworkParams.subject_name) {
      const searchName = homeworkParams.subject_name.toLowerCase();
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name_ar, name_en");

      subject = subjects?.find(s =>
        s.name_en?.toLowerCase().includes(searchName) ||
        s.name_ar?.includes(homeworkParams.subject_name || "")
      ) || null;
    }

    if (!subject) {
      // Get available subjects to help the AI
      const { data: allSubjects } = await supabase.from("subjects").select("name_en, name_ar");
      const subjectList = allSubjects?.map(s => s.name_en || s.name_ar).join(", ");
      return {
        success: false,
        error: `Invalid subject. Available subjects: ${subjectList}. Use get_subjects tool first.`
      };
    }

    // Calculate total points
    const totalPoints = homeworkParams.questions.reduce((sum, q) => sum + (q.points || 10), 0);

    // Calculate due date
    const dueDays = homeworkParams.due_days || 3;
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + dueDays);

    const localizedTitle = localizeText(lang, homeworkParams.title_ar, homeworkParams.title_en, "");
    const localizedSubject = localizeText(lang, subject.name_ar, subject.name_en, "");

    // Simplified confirmation logic:
    // - If confirm=true → always create (AI explicitly requested creation)
    // - If confirm not set → check user message for confirmation, otherwise show draft
    const lastUserMessage = (homeworkParams._last_user_message || "").toLowerCase();
    const userConfirmed =
      /(yes|confirm|ok|okay|go ahead|create it|do it|proceed|sure|create the homework)/i.test(lastUserMessage) ||
      /(نعم|موافق|تمام|اوكي|حسنًا|حسنا|اعملها|نفذ|تابع|أكمل|اكمل|أنشئ الواجب)/i.test(lastUserMessage);

    const shouldCreate = homeworkParams.confirm === true || userConfirmed;

    if (!shouldCreate) {
      return {
        success: true,
        data: {
          status: "draft",
          needs_confirmation: true,
          message: localizeText(
            lang,
            "جاهز لإنشاء واجب تدريبي. هل تريدني أن أنشئه؟",
            "I can create a practice homework now. Would you like me to create it?",
            ""
          ),
          preview: {
            title_ar: homeworkParams.title_ar,
            title_en: homeworkParams.title_en,
            title: localizedTitle,
            subject_name_ar: subject.name_ar,
            subject_name_en: subject.name_en,
            subject_name: localizedSubject,
            total_points: totalPoints,
            question_count: homeworkParams.questions.length,
            due_days: dueDays,
            difficulty_level: homeworkParams.difficulty_level,
            reason: homeworkParams.reason,
          },
        },
      };
    }

    // Get or create a cohort for AI-generated homework
    // First try to find an existing cohort for this student
    let cohortId: string | null = null;

    const { data: studentCohort } = await supabase
      .from("cohort_students")
      .select("cohort_id")
      .eq("student_id", studentContext.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (studentCohort) {
      cohortId = studentCohort.cohort_id;
    } else {
      // Create a personal cohort for AI homework if student has no cohort
      const { data: newCohort, error: cohortError } = await supabase
        .from("cohorts")
        .insert({
          name: `AI Practice - ${studentContext.full_name}`,
          description: "Auto-created cohort for AI-generated practice homework",
          grade_level: studentContext.grade_level || 1,
          is_active: true,
        })
        .select()
        .single();

      if (cohortError) {
        console.error("Failed to create cohort:", cohortError);
        return { success: false, error: "Failed to create homework cohort" };
      }

      cohortId = newCohort.id;

      // Add student to the cohort
      await supabase.from("cohort_students").insert({
        cohort_id: cohortId,
        student_id: studentContext.id,
        is_active: true,
      });
    }

    // Get AI user ID or use student as creator
    const { data: aiProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "teacher")
      .limit(1)
      .single();

    const createdBy = aiProfile?.id || studentContext.id;

    // Create the assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .insert({
        title_ar: homeworkParams.title_ar,
        title_en: homeworkParams.title_en || null,
        instructions_ar: homeworkParams.instructions_ar || null,
        instructions_en: homeworkParams.instructions_en || null,
        subject_id: subject.id, // Use resolved subject ID
        cohort_id: cohortId, // Required field
        total_points: totalPoints,
        due_at: dueAt.toISOString(),
        is_published: true,
        created_by: createdBy,
      })
      .select()
      .single();

    if (assignmentError) throw assignmentError;

    // Create questions
    const questionsToInsert = homeworkParams.questions.map((q, index) => ({
      assignment_id: assignment.id,
      question_text_ar: q.question_text_ar,
      question_text_en: q.question_text_en || null,
      question_type: q.question_type,
      options: q.options || null,
      correct_answer: q.correct_answer || null,
      points: q.points || 10,
      display_order: index + 1, // Fixed: was order_index
    }));

    const { error: questionsError } = await supabase
      .from("homework_questions")
      .insert(questionsToInsert);

    if (questionsError) throw questionsError;

    // Create submission for the student
    const { data: submission, error: submissionError } = await supabase
      .from("homework_submissions")
      .insert({
        assignment_id: assignment.id,
        student_id: studentContext.id,
        status: "not_started",
      })
      .select()
      .single();

    if (submissionError) throw submissionError;

    // Record this as AI-created homework
    const { error: aiRecordError } = await supabase.from("ai_created_homework").insert({
      assignment_id: assignment.id,
      student_id: studentContext.id,
      reason: homeworkParams.reason,
      difficulty_level: homeworkParams.difficulty_level,
    });

    if (aiRecordError) {
      console.error("Failed to record AI homework creation:", aiRecordError);
    }

    return {
      success: true,
      data: {
        status: "created",
        assignment_id: assignment.id,
        submission_id: submission.id,
        title_ar: assignment.title_ar,
        title_en: assignment.title_en,
        title: localizedTitle,
        subject_name_ar: subject.name_ar,
        subject_name_en: subject.name_en,
        subject_name: localizedSubject,
        total_points: totalPoints,
        question_count: homeworkParams.questions.length,
        due_at: dueAt.toISOString(),
        difficulty_level: homeworkParams.difficulty_level,
        reason: homeworkParams.reason,
        message: localizeText(
          lang,
          `تم إنشاء واجب "${homeworkParams.title_ar}" بعدد ${homeworkParams.questions.length} سؤال، مستحق بعد ${dueDays} أيام.`,
          `Created ${homeworkParams.difficulty_level} homework "${homeworkParams.title_ar}" with ${homeworkParams.questions.length} questions, due in ${dueDays} days.`,
          ""
        ),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create homework assignment",
    };
  }
}
