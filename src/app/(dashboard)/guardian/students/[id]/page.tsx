"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AIMessage } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";

interface SubjectProgress {
  id: string;
  lessons: {
    id: string;
    subjects: {
      name_ar: string;
      name_en: string;
    };
  };
}

interface HomeworkItem {
  id: string;
  status: string;
  score: number | null;
  homework_assignments: {
    title: string;
    due_date: string;
    total_points: number;
  };
}

interface ConversationItem {
  id: string;
  title: string | null;
  updated_at: string;
}

interface StudentData {
  profiles: {
    id: string;
    full_name: string;
    email: string;
  };
  streak: {
    total_lessons_completed?: number;
    current_streak_days?: number;
    total_homework_completed?: number;
  };
  subjectProgress: SubjectProgress[];
  homework: HomeworkItem[];
  conversations: ConversationItem[];
}

const translations = {
  ar: {
    backToDashboard: "العودة إلى لوحة التحكم",
    loading: "جاري التحميل...",
    unauthorized: "غير مصرح",
    progress: "التقدم",
    homework: "الواجبات",
    aiTutor: "المعلم الذكي",
    subjects: "المواد",
    noProgress: "لا يوجد تقدم بعد",
    lessonsCompleted: "درس مكتمل",
    currentStreak: "يوم متتالي",
    totalPoints: "نقطة",
    homeworkStatus: "حالة الواجب",
    pending: "معلق",
    completed: "مكتمل",
    graded: "تم التقييم",
    dueDate: "تاريخ الاستحقاق",
    score: "النتيجة",
    recentConversations: "المحادثات الأخيرة",
    viewConversation: "عرض المحادثة",
    noHomework: "لا توجد واجبات",
    noConversations: "لا توجد محادثات",
    overdue: "متأخر",
  },
  en: {
    backToDashboard: "Back to Dashboard",
    loading: "Loading...",
    unauthorized: "Unauthorized",
    progress: "Progress",
    homework: "Homework",
    aiTutor: "AI Tutor",
    subjects: "Subjects",
    noProgress: "No progress yet",
    lessonsCompleted: "Lessons",
    currentStreak: "Day Streak",
    totalPoints: "Points",
    homeworkStatus: "Homework Status",
    pending: "Pending",
    completed: "Completed",
    graded: "Graded",
    dueDate: "Due",
    score: "Score",
    recentConversations: "Recent Conversations",
    viewConversation: "View Conversation",
    noHomework: "No homework",
    noConversations: "No conversations",
    overdue: "Overdue",
  },
};

export default function StudentDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [student, setStudent] = useState<StudentData | null>(null);
  const [activeTab, setActiveTab] = useState<"progress" | "homework" | "tutor">("progress");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Record<string, AIMessage[]>>({});
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadStudentData() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Verify guardian has access to this student
      const { data: link } = await supabase
        .from("guardian_students")
        .select("*, profiles!guardian_students_student_id_fkey(id, full_name, email)")
        .eq("guardian_id", user.id)
        .eq("student_id", params.id)
        .eq("is_approved", true)
        .single();

      if (!link) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true);

      // Load student progress
      const { data: streak } = await supabase
        .from("student_streaks")
        .select("*")
        .eq("student_id", params.id)
        .maybeSingle();

      // Load subject progress
      const { data: subjectProgress } = await supabase
        .from("lesson_progress")
        .select("*, lessons!inner(*, subjects(*))")
        .eq("student_id", params.id)
        .eq("status", "completed");

      // Load homework
      const { data: homework } = await supabase
        .from("homework_submissions")
        .select("*, homework_assignments(title, due_date, total_points)")
        .eq("student_id", params.id)
        .not("homework_assignments", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);

      // Load AI conversations
      const { data: conversations } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("student_id", params.id)
        .order("updated_at", { ascending: false })
        .limit(5);

      setStudent({
        ...link,
        streak: streak || {},
        subjectProgress: subjectProgress || [],
        homework: (homework || []) as unknown as HomeworkItem[],
        conversations: conversations || [],
      } as unknown as StudentData);

      setLoading(false);
    }

    loadStudentData();
  }, [params.id, router, supabase]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const loadConversationMessages = async (conversationId: string) => {
    if (conversationMessages[conversationId]) {
      // Already loaded, just toggle
      setExpandedConversation(expandedConversation === conversationId ? null : conversationId);
      return;
    }

    // Load messages
    const { data: messages } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messages) {
      setConversationMessages(prev => ({ ...prev, [conversationId]: messages }));
      setExpandedConversation(conversationId);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 mx-auto mb-4 text-[#007229]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-500 text-lg">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.unauthorized}</h2>
          <Link href="/guardian/dashboard" className="text-[#007229] hover:underline">
            {t.backToDashboard}
          </Link>
        </div>
      </div>
    );
  }

  if (!student) {
    return null;
  }

  // Calculate subject breakdown
  const subjectBreakdown = student.subjectProgress.reduce((acc: Record<string, number>, progress: SubjectProgress) => {
    const subjectName = language === "ar"
      ? progress.lessons.subjects.name_ar
      : progress.lessons.subjects.name_en;
    
    if (!acc[subjectName]) {
      acc[subjectName] = 0;
    }
    acc[subjectName]++;
    return acc;
  }, {});

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/guardian/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-[#007229] mb-4 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isRtl ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
          {t.backToDashboard}
        </Link>
        
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#007229] to-[#00913D] flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            {student.profiles.full_name.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{student.profiles.full_name}</h1>
            <p className="text-gray-600">{student.profiles.email}</p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-4xl font-bold">{student.streak.total_lessons_completed || 0}</div>
          <div className="text-violet-200 font-medium mt-1">{t.lessonsCompleted}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-4xl font-bold">{student.streak.current_streak_days || 0}</div>
          <div className="text-orange-200 font-medium mt-1">{t.currentStreak}</div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-yellow-500 rounded-2xl p-6 text-white shadow-lg">
          <div className="text-4xl font-bold">
            {((student.streak.total_lessons_completed || 0) * 10) + ((student.streak.total_homework_completed || 0) * 20)}
          </div>
          <div className="text-amber-200 font-medium mt-1">{t.totalPoints}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab("progress")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors ${
                activeTab === "progress"
                  ? "text-[#007229] border-b-2 border-[#007229]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.progress}
            </button>
            <button
              onClick={() => setActiveTab("homework")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors ${
                activeTab === "homework"
                  ? "text-[#007229] border-b-2 border-[#007229]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.homework}
            </button>
            <button
              onClick={() => setActiveTab("tutor")}
              className={`flex-1 py-4 px-6 font-semibold transition-colors ${
                activeTab === "tutor"
                  ? "text-[#007229] border-b-2 border-[#007229]"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.aiTutor}
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Progress Tab */}
          {activeTab === "progress" && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{t.subjects}</h3>
              {Object.keys(subjectBreakdown).length === 0 ? (
                <p className="text-gray-500 py-8 text-center">{t.noProgress}</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(subjectBreakdown).map(([subject, count]) => (
                    <div key={subject} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-900">{subject}</span>
                          <span className="text-sm text-gray-600">{count} {language === "ar" ? "درس" : "lessons"}</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#007229] to-[#00913D]"
                            style={{ width: `${Math.min(100, (count as number) * 10)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Homework Tab */}
          {activeTab === "homework" && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{t.homeworkStatus}</h3>
              {student.homework.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">{t.noHomework}</p>
              ) : (
                <div className="space-y-3">
                  {student.homework.map((hw: HomeworkItem) => (
                    <div key={hw.id} className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">
                            {hw.homework_assignments.title}
                          </h4>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {t.dueDate}: {formatDate(hw.homework_assignments.due_date)}
                            </span>
                            {hw.score !== null && (
                              <span className="flex items-center gap-1 font-semibold text-[#007229]">
                                {t.score}: {hw.score}/{hw.homework_assignments.total_points}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          {hw.status === "graded" && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full">
                              {t.graded}
                            </span>
                          )}
                          {hw.status === "submitted" && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full">
                              {t.completed}
                            </span>
                          )}
                          {(hw.status === "not_started" || hw.status === "in_progress") && (
                            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                              isOverdue(hw.homework_assignments.due_date)
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {isOverdue(hw.homework_assignments.due_date) ? t.overdue : t.pending}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Tutor Tab */}
          {activeTab === "tutor" && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{t.recentConversations}</h3>
              {student.conversations.length === 0 ? (
                <p className="text-gray-500 py-8 text-center">{t.noConversations}</p>
              ) : (
                <div className="space-y-3">
                  {student.conversations.map((conv: ConversationItem) => (
                    <div key={conv.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => loadConversationMessages(conv.id)}
                        className="w-full p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">
                              {conv.title || (language === "ar" ? "محادثة بدون عنوان" : "Untitled conversation")}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {formatDate(conv.updated_at)}
                            </p>
                          </div>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${
                              expandedConversation === conv.id ? "rotate-180" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      
                      {expandedConversation === conv.id && conversationMessages[conv.id] && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 max-h-96 overflow-y-auto">
                          <div className="space-y-3">
                            {conversationMessages[conv.id].map((msg: AIMessage, idx: number) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg ${
                                  msg.role === "user"
                                    ? "bg-white border border-gray-200"
                                    : "bg-blue-50 border border-blue-100"
                                }`}
                              >
                                <div className="text-xs font-semibold text-gray-500 mb-1">
                                  {msg.role === "user"
                                    ? (language === "ar" ? "الطالب" : "Student")
                                    : (language === "ar" ? "المعلم الذكي" : "AI Tutor")}
                                </div>
                                <div className="text-sm text-gray-900 whitespace-pre-wrap">{msg.content}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
