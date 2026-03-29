"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlTutorIcon, OwlThinking, OwlWaving, OwlCelebrating } from "@/components/illustrations";
import type { AIConversation } from "@/lib/database.types";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import ReactMarkdown from "react-markdown";

const translations = {
  ar: {
    aiTutor: "المعلم الذكي",
    subtitle: "مساعدك الشخصي للتعلم",
    newChat: "محادثة جديدة",
    history: "المحادثات السابقة",
    typeMessage: "اكتب سؤالك هنا...",
    send: "إرسال",
    thinking: "يفكر...",
    welcome: "مرحباً! أنا مساعدك للتعلم",
    welcomeDesc: "يمكنني مساعدتك في فهم الدروس وحل الواجبات. اسألني أي شيء!",
    quickPrompts: "أسئلة سريعة",
    explainThis: "اشرح هذا الموضوع",
    giveExample: "أعطني مثالاً",
    helpUnderstand: "ساعدني أفهم",
    solveStep: "حل خطوة بخطوة",
    loading: "جاري التحميل...",
    back: "العودة",
    noHistory: "لا توجد محادثات سابقة",
    today: "اليوم",
    yesterday: "أمس",
    earlier: "سابقاً",
    relatedTo: "متعلق بـ",
    lesson: "درس",
    homework: "واجب",
    homeworkCreated: "تم إنشاء واجب جديد!",
    viewHomework: "عرض الواجب",
    progressLoading: "جاري تحميل تقدمك...",
    lessonsCompleted: "دروس مكتملة",
    currentStreak: "أيام متتالية",
    checkingProgress: "جاري التحقق من تقدمك...",
    analyzingWeakAreas: "جاري تحليل نقاط الضعف...",
    suggestingPath: "جاري اقتراح مسار التعلم...",
    creatingHomework: "جاري إنشاء الواجب...",
    askProgress: "كيف هو تقدمي؟",
    askWeakAreas: "ما هي نقاط ضعفي؟",
    askLearningPath: "اقترح لي مسار تعلم",
    askPractice: "أريد تمارين إضافية",
    readAloud: "القراءة بصوت عالٍ",
    readAloudOn: "تشغيل الصوت",
    readAloudOff: "إيقاف الصوت",
    speak: "اقرأ",
    stop: "إيقاف",
    speechUnsupported: "جهازك لا يدعم القراءة الصوتية",
    mistakeInsights: "نقاط تحتاج تركيز",
    lessonRefs: "مراجع من الدروس",
    subjectsLabel: "المواد",
    questionTypesLabel: "أنواع الأسئلة",
    mic: "التحدث",
    listening: "يستمع...",
    micUnsupported: "التحدث غير مدعوم على هذا الجهاز",
    chatError: "حدث خطأ في رد المعلم",
    chatErrorDesc: "حاول مرة أخرى الآن.",
    deleteChat: "حذف المحادثة",
    voiceMode: "وضع الصوت",
    tapToSpeak: "اضغط للتحدث",
    voiceRecording: "جاري الاستماع...",
    voiceProcessing: "جاري المعالجة...",
    voicePlaying: "جاري الرد...",
    voiceError: "حدث خطأ في الصوت",
    exitVoice: "خروج",
    you: "أنت",
    tutor: "المعلم",
    micPermissionDenied: "يرجى السماح بالوصول للميكروفون",
  },
  en: {
    aiTutor: "AI Tutor",
    subtitle: "Your personal learning assistant",
    newChat: "New Chat",
    history: "Chat History",
    typeMessage: "Type your question here...",
    send: "Send",
    thinking: "Thinking...",
    welcome: "Hello! I'm your learning assistant",
    welcomeDesc: "I can help you understand lessons and solve homework. Ask me anything!",
    quickPrompts: "Quick Prompts",
    explainThis: "Explain this topic",
    giveExample: "Give me an example",
    helpUnderstand: "Help me understand",
    solveStep: "Solve step by step",
    loading: "Loading...",
    back: "Back",
    noHistory: "No chat history",
    today: "Today",
    yesterday: "Yesterday",
    earlier: "Earlier",
    relatedTo: "Related to",
    lesson: "Lesson",
    homework: "Homework",
    homeworkCreated: "New homework created!",
    viewHomework: "View Homework",
    progressLoading: "Loading your progress...",
    lessonsCompleted: "Lessons Completed",
    currentStreak: "Day Streak",
    checkingProgress: "Checking your progress...",
    analyzingWeakAreas: "Analyzing areas for improvement...",
    suggestingPath: "Suggesting a learning path...",
    creatingHomework: "Creating homework assignment...",
    askProgress: "How am I doing?",
    askWeakAreas: "What are my weak areas?",
    askLearningPath: "Suggest a learning path",
    askPractice: "I need more practice",
    readAloud: "Read aloud",
    readAloudOn: "Speech on",
    readAloudOff: "Speech off",
    speak: "Speak",
    stop: "Stop",
    speechUnsupported: "Speech not supported on this device",
    mistakeInsights: "Focus Areas",
    lessonRefs: "Lesson references",
    subjectsLabel: "Subjects",
    questionTypesLabel: "Question types",
    mic: "Speak",
    listening: "Listening...",
    micUnsupported: "Speech input not supported on this device",
    chatError: "Something went wrong",
    chatErrorDesc: "Please try again.",
    deleteChat: "Delete chat",
    voiceMode: "Voice Mode",
    tapToSpeak: "Tap to speak",
    voiceRecording: "Listening...",
    voiceProcessing: "Thinking...",
    voicePlaying: "Speaking...",
    voiceError: "Voice error",
    exitVoice: "Exit",
    you: "You",
    tutor: "Tutor",
    micPermissionDenied: "Please allow microphone access",
  },
};

const Icons = {
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  send: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  sparkle: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3zm6 10l.75 2.25L21 16l-2.25.75L18 19l-.75-2.25L15 16l2.25-.75L18 13zM6 13l.75 2.25L9 16l-2.25.75L6 19l-.75-2.25L3 16l2.25-.75L6 13z" />
    </svg>
  ),
  menu: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  close: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  speaker: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9v6m0 0H5a2 2 0 01-2-2v-2a2 2 0 012-2h4m0 6l5 4V5l-5 4zM16.5 8.5a4 4 0 010 7M18.5 6a7 7 0 010 12" />
    </svg>
  ),
  speakerOff: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9v6m0 0H5a2 2 0 01-2-2v-2a2 2 0 012-2h4m0 6l5 4V5l-5 4zM18 6l-6 6m0 0l-6 6m6-6l6 6m-6-6l-6-6" />
    </svg>
  ),
  mic: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a4.5 4.5 0 004.5-4.5v-6a4.5 4.5 0 00-9 0v6a4.5 4.5 0 004.5 4.5zm0 0v3m-3 0h6m-9-6h.01M6 12v-.01" />
    </svg>
  ),
  micOff: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9v3m3 6a4.5 4.5 0 004.5-4.5v-1.5M12 21.75v-3m-3 0h6M4.5 4.5l15 15M8.25 8.25A4.5 4.5 0 0112 4.5a4.5 4.5 0 014.5 4.5v1.5" />
    </svg>
  ),
  book: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  fire: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: Array<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type TutorMessagesResponse = {
  messages?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    tool_results?: Array<{ type: string; state?: string; output?: unknown }> | null;
  }>;
};

type TutorConversationsResponse = {
  conversations?: AIConversation[];
};

// Tool Result Components
type HomeworkCreatedData = {
  status?: "created";
  assignment_id: string;
  title_ar: string;
  title_en?: string;
  title?: string;
  subject_name_ar?: string;
  subject_name_en?: string;
  subject_name?: string;
  total_points: number;
  question_count: number;
  due_at: string;
  difficulty_level: string;
  reason: string;
};

type HomeworkDraftData = {
  status?: "draft";
  needs_confirmation?: boolean;
  message?: string;
  preview?: {
    title_ar: string;
    title_en?: string;
    title?: string;
    subject_name_ar?: string;
    subject_name_en?: string;
    subject_name?: string;
    total_points: number;
    question_count: number;
    due_days: number;
    difficulty_level: string;
    reason: string;
  };
};

function HomeworkCreatedCard({ data, t, isRtl }: { data: HomeworkCreatedData; t: typeof translations.en; isRtl: boolean }) {
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 rounded-2xl p-4 border border-emerald-200">
      <div className="flex items-start gap-3">
        <OwlCelebrating className="w-12 h-12 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-emerald-700 mb-1">{t.homeworkCreated}</p>
          <p className="text-sm text-gray-700 font-medium">
            {data.title || (isRtl ? data.title_ar : (data.title_en || data.title_ar))}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {(data.subject_name || (isRtl ? data.subject_name_ar : data.subject_name_en))} • {data.question_count} questions • {data.total_points} points
          </p>
          <p className="text-xs text-gray-400 mt-1">{data.reason}</p>
          <Link
            href={`/homework/${data.assignment_id}`}
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors"
          >
            {Icons.book}
            {t.viewHomework}
          </Link>
        </div>
      </div>
    </div>
  );
}

function HomeworkDraftCard({
  data,
  t,
  isRtl,
  onConfirm,
  onCancel,
}: {
  data: HomeworkDraftData;
  t: typeof translations.en;
  isRtl: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const preview = data.preview;
  if (!preview) return null;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
      <div className="flex items-start gap-3">
        <OwlTutorIcon className="w-10 h-10 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-amber-700 mb-1">{data.message || t.creatingHomework}</p>
          <p className="text-sm text-gray-700 font-medium">
            {preview.title || (isRtl ? preview.title_ar : (preview.title_en || preview.title_ar))}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
              {preview.subject_name || (isRtl ? preview.subject_name_ar : preview.subject_name_en)}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
              {preview.question_count} {isRtl ? "أسئلة" : "questions"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
              {preview.total_points} {isRtl ? "نقطة" : "points"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs capitalize">
              {preview.difficulty_level}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">{preview.reason}</p>

          {/* Confirm/Cancel Buttons */}
          {onConfirm && onCancel && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1"
              >
                {Icons.check}
                {isRtl ? "نعم، أنشئه" : "Yes, create it"}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-300 transition-colors"
              >
                {isRtl ? "لا شكراً" : "No thanks"}
              </button>
            </div>
          )}
          {!onConfirm && (
            <p className="text-xs text-amber-600 mt-3 italic">
              {isRtl ? "قل 'نعم' للمتابعة أو 'لا' للإلغاء" : "Say 'yes' to proceed or 'no' to cancel"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ data, t }: { data: { lessons_completed: number; total_lessons: number; homework_completed: number; homework_pending: number; average_score: number | null; current_streak: number }; t: typeof translations.en }) {
  return (
    <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-4 border border-cyan-200">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center p-3 bg-white rounded-xl">
          <div className="flex items-center justify-center gap-2 text-cyan-600 mb-1">
            {Icons.book}
            <span className="text-2xl font-bold">{data.lessons_completed}</span>
          </div>
          <p className="text-xs text-gray-500">{t.lessonsCompleted}</p>
        </div>
        <div className="text-center p-3 bg-white rounded-xl">
          <div className="flex items-center justify-center gap-2 text-orange-500 mb-1">
            {Icons.fire}
            <span className="text-2xl font-bold">{data.current_streak}</span>
          </div>
          <p className="text-xs text-gray-500">{t.currentStreak}</p>
        </div>
      </div>
      {data.average_score !== null && (
        <div className="mt-3 text-center">
          <p className="text-sm text-gray-600">Average Score: <span className="font-semibold text-cyan-600">{data.average_score}%</span></p>
        </div>
      )}
    </div>
  );
}

function ToolLoadingIndicator({ message }: { message: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-600">{message}</span>
    </div>
  );
}

export default function TutorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speechInputSupported, setSpeechInputSupported] = useState(true);
  const [listening, setListening] = useState(false);

  // Voice mode state
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing" | "playing">("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscripts, setVoiceTranscripts] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [voiceConversationId, setVoiceConversationId] = useState<string | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skipReloadRef = useRef(false);
  const lastSpokenMessageId = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseRef = useRef<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceTranscriptsEndRef = useRef<HTMLDivElement>(null);

  // Context from URL params
  const lessonId = searchParams.get("lesson");
  const homeworkId = searchParams.get("homework");
  const subjectId = searchParams.get("subject");

  const fetchConversationHistory = async (): Promise<AIConversation[]> => {
    try {
      const response = await fetch("/api/tutor", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as TutorConversationsResponse;
      return Array.isArray(payload.conversations) ? payload.conversations : [];
    } catch (fetchError) {
      console.warn("Failed to fetch conversation history:", fetchError);
      return [];
    }
  };

  const fetchConversationMessages = async (activeConversationId: string) => {
    try {
      const response = await fetch(
        `/api/tutor?conversation_id=${encodeURIComponent(activeConversationId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as TutorMessagesResponse;
      return Array.isArray(payload.messages) ? payload.messages : [];
    } catch (fetchError) {
      console.warn("Failed to fetch conversation messages:", fetchError);
      return [];
    }
  };

  // AI SDK useChat hook
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/tutor",
    }),
    onError: (err) => {
      console.error("useChat error:", err);
    },
    onFinish: ({ message, messages: allMessages }) => {
      const metadata = message.metadata as { conversation_id?: string } | undefined;
      const nextConversationId = metadata?.conversation_id;

      if (!nextConversationId) return;

      if (nextConversationId !== conversationId) {
        skipReloadRef.current = true;
        setConversationId(nextConversationId);
      }

      const lastUserMessage = [...allMessages].reverse().find((m) => m.role === "user");
      const titleText = lastUserMessage?.parts?.find((p) => p.type === "text")?.text?.slice(0, 50) || "New conversation";
      const nowIso = new Date().toISOString();

      const fallbackConversation: AIConversation = {
        id: nextConversationId,
        student_id: userId || "",
        lesson_id: lessonId || null,
        homework_id: homeworkId || null,
        subject_id: subjectId || null,
        title: titleText,
        created_at: nowIso,
        updated_at: nowIso,
      };

      setConversations((prev) => {
        const exists = prev.find((c) => c.id === nextConversationId);
        const updated = exists
          ? prev.map((c) => (c.id === nextConversationId ? { ...c, updated_at: nowIso } : c))
          : [fallbackConversation, ...prev];

        return updated.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const [input, setInput] = useState("");

  const getMessageText = (message: (typeof messages)[0]) =>
    message.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim() || "";

  const speakText = async (text: string, messageId?: string) => {
    if (!text) return;
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTtsLoading(true);
    setSpeakingId(messageId || null);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeakingId(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setSpeakingId(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      setTtsLoading(false);
      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
      setSpeakingId(null);
      setTtsLoading(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeakingId(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("tutor_tts_enabled");
    if (stored !== null) {
      setTtsEnabled(stored === "true");
    }
  }, []);

  useEffect(() => {
    if (!ttsEnabled || isLoading) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    if (lastAssistant.id === lastSpokenMessageId.current) return;
    const text = getMessageText(lastAssistant);
    if (!text) return;
    speakText(text, lastAssistant.id);
    lastSpokenMessageId.current = lastAssistant.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsEnabled, isLoading, language]);

  const toggleTts = () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tutor_tts_enabled", String(next));
    }
    if (!next) stopSpeaking();
  };

  const toggleListening = () => {
    if (!speechInputSupported) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      return;
    }
    speechBaseRef.current = input.trim();
    recognition.lang = language === "ar" ? "ar" : "en-US";
    recognition.start();
  };

  // ─── Voice Mode Functions ───
  const startVoiceMode = () => {
    setVoiceModeActive(true);
    setVoiceState("idle");
    setVoiceError(null);
    setVoiceTranscripts([]);
    setVoiceConversationId(conversationId);
  };

  const exitVoiceMode = () => {
    // Stop any recording or playback
    if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state !== "inactive") {
      voiceMediaRecorderRef.current.stop();
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }
    setVoiceModeActive(false);
    setVoiceState("idle");
    setVoiceError(null);

    // Reload conversation to pick up voice messages
    if (voiceConversationId && voiceConversationId !== conversationId) {
      setConversationId(voiceConversationId);
    } else if (voiceConversationId === conversationId && voiceTranscripts.length > 0) {
      // Trigger a reload of messages for the current conversation
      setConversationId(undefined);
      setTimeout(() => setConversationId(voiceConversationId), 50);
    }
  };

  const startVoiceRecording = async () => {
    if (voiceState !== "idle") return;
    setVoiceError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      voiceChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        const blob = new Blob(voiceChunksRef.current, { type: "audio/webm" });
        voiceChunksRef.current = [];

        if (blob.size < 100) {
          setVoiceState("idle");
          return;
        }

        await processVoiceRecording(blob);
      };

      voiceMediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setVoiceState("recording");
    } catch (err) {
      console.error("Mic access error:", err);
      setVoiceError(t.micPermissionDenied);
      setVoiceState("idle");
    }
  };

  const stopVoiceRecording = () => {
    if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state !== "inactive") {
      voiceMediaRecorderRef.current.stop();
      setVoiceState("processing");
    }
  };

  const toggleVoiceRecording = () => {
    if (voiceState === "idle") {
      startVoiceRecording();
    } else if (voiceState === "recording") {
      stopVoiceRecording();
    }
  };

  const processVoiceRecording = async (audioBlob: Blob) => {
    setVoiceState("processing");
    setVoiceError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");
      formData.append("language", language);
      if (voiceConversationId) formData.append("conversation_id", voiceConversationId);

      const contextObj = {
        lesson_id: lessonId,
        homework_id: homeworkId,
        subject_id: subjectId,
      };
      formData.append("context", JSON.stringify(contextObj));

      // Send recent voice transcripts as message history for context
      const messagesForContext = voiceTranscripts.slice(-10).map(t2 => ({
        role: t2.role,
        content: t2.text,
      }));
      formData.append("messages", JSON.stringify(messagesForContext));

      const response = await fetch("/api/tutor/voice", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Voice request failed");
      }

      // Extract transcripts from headers
      const userTranscript = decodeURIComponent(response.headers.get("X-User-Transcript") || "");
      const assistantTranscript = decodeURIComponent(response.headers.get("X-Assistant-Transcript") || "");
      const returnedConvId = response.headers.get("X-Conversation-Id");

      if (returnedConvId && !voiceConversationId) {
        setVoiceConversationId(returnedConvId);
      }

      // Add transcripts
      const newTranscripts: Array<{ role: "user" | "assistant"; text: string }> = [];
      if (userTranscript) newTranscripts.push({ role: "user", text: userTranscript });
      if (assistantTranscript) newTranscripts.push({ role: "assistant", text: assistantTranscript });

      setVoiceTranscripts(prev => [...prev, ...newTranscripts]);

      // Play audio response
      const audioResponseBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioResponseBlob);
      const audio = new Audio(audioUrl);
      voiceAudioRef.current = audio;

      setVoiceState("playing");

      audio.onended = () => {
        setVoiceState("idle");
        URL.revokeObjectURL(audioUrl);
        voiceAudioRef.current = null;
      };
      audio.onerror = () => {
        setVoiceState("idle");
        URL.revokeObjectURL(audioUrl);
        voiceAudioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.error("Voice processing error:", err);
      setVoiceError(err instanceof Error ? err.message : t.voiceError);
      setVoiceState("idle");
    }
  };

  // Auto-scroll voice transcripts
  useEffect(() => {
    voiceTranscriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [voiceTranscripts]);

  // Clean up voice mode on unmount
  useEffect(() => {
    return () => {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause();
        voiceAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSpeechInputSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = language === "ar" ? "ar" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      const base = speechBaseRef.current.trim();
      const addition = transcript.trim();
      if (!addition) return;
      const combined = base ? `${base} ${addition}` : addition;
      setInput(combined);
    };

    recognitionRef.current = recognition;
    setSpeechInputSupported(true);

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    async function loadData() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUserId(user.id);

      // Load conversation history
      const conversationsData = await fetchConversationHistory();
      setConversations(conversationsData);

      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages for selected conversation
  useEffect(() => {
    async function loadConversationMessages() {
      if (skipReloadRef.current) {
        skipReloadRef.current = false;
        return;
      }

      if (!conversationId) {
        setMessages([]);
        return;
      }

      const messagesData = await fetchConversationMessages(conversationId);

      if (messagesData.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loadedMessages: any[] = messagesData.map((msg) => {
          // Build parts array
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parts: any[] = [];

          // Add text part if content exists
          if (msg.content) {
            parts.push({ type: "text" as const, text: msg.content });
          }

          // Add tool result parts if they exist (for UI component persistence)
          if (msg.tool_results && Array.isArray(msg.tool_results)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            msg.tool_results.forEach((tr: any) => {
              parts.push({
                type: tr.type,
                state: tr.state || "output-available",
                output: tr.output,
              });
            });
          }

          return {
            id: msg.id,
            role: msg.role as "user" | "assistant",
            parts: parts.length > 0 ? parts : [{ type: "text" as const, text: "" }],
          };
        });
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }
    }

    void loadConversationMessages();
  }, [conversationId, supabase, setMessages]);

  // Start new conversation
  const startNewConversation = async () => {
    setConversationId(undefined);
    setMessages([]);
    setShowSidebar(false);
  };

  // Delete conversation
  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the conversation when clicking delete

    // Delete from database when available; ignore when persistence tables are missing.
    try {
      await supabase.from("ai_conversations").delete().eq("id", convId);
    } catch (deleteError) {
      console.warn("Failed to delete conversation from persistence layer:", deleteError);
    }

    // Remove from local state
    setConversations((prev) => prev.filter((c) => c.id !== convId));

    // If the deleted conversation was selected, clear the view
    if (conversationId === convId) {
      setConversationId(undefined);
      setMessages([]);
    }
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim() || isLoading || !userId) return;

    const userMessage = input.trim();
    setInput("");

    try {
      // Send message using AI SDK with dynamic body params
      await sendMessage(
        { text: userMessage },
        {
          body: {
            language: language,
            conversation_id: conversationId,
            context: {
              lesson_id: lessonId,
              homework_id: homeworkId,
              subject_id: subjectId,
            },
          },
        }
      );
    } catch (err) {
      console.error("Send message error:", err);
    }
  };

  // Direct send for quick actions (like confirm/cancel buttons)
  const sendQuickMessage = async (text: string) => {
    if (isLoading || !userId) return;

    try {
      await sendMessage(
        { text },
        {
          body: {
            language: language,
            conversation_id: conversationId,
            context: {
              lesson_id: lessonId,
              homework_id: homeworkId,
              subject_id: subjectId,
            },
          },
        }
      );
    } catch (err) {
      console.error("Quick send error:", err);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick prompts - now using AI tools
  const quickPrompts = [
    { label: t.askProgress, prompt: language === "ar" ? "كيف هو تقدمي في الدراسة؟" : "How am I doing with my studies?" },
    { label: t.askWeakAreas, prompt: language === "ar" ? "ما هي المواد التي أحتاج للتركيز عليها؟" : "What subjects do I need to focus on?" },
    { label: t.askLearningPath, prompt: language === "ar" ? "اقترح لي مسار تعلم مناسب" : "Suggest a learning path for me" },
    { label: t.askPractice, prompt: language === "ar" ? "أريد تمارين إضافية للممارسة" : "I need extra practice exercises" },
  ];

  // Group conversations by date
  const groupedConversations = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { [key: string]: AIConversation[] } = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    conversations.forEach((conv) => {
      const convDate = new Date(conv.updated_at);
      convDate.setHours(0, 0, 0, 0);

      if (convDate.getTime() === today.getTime()) {
        groups.today.push(conv);
      } else if (convDate.getTime() === yesterday.getTime()) {
        groups.yesterday.push(conv);
      } else {
        groups.earlier.push(conv);
      }
    });

    return groups;
  };

  // Internal tools that should be hidden from users
  const HIDDEN_TOOLS = [
    "tool-get_subjects",
    "tool-search_lessons",
    "tool-get_lesson_content_chunk",
    "tool-get_homework_question_context",
  ];

  // Check if a message has actual content to display (not just loading states)
  const hasMessageContent = (message: typeof messages[0]): boolean => {
    return message.parts.some((part) => {
      // Text content counts as content
      if (part.type === "text" && part.text.trim()) {
        return true;
      }

      // Skip hidden internal tools - they don't count as visible content
      if (HIDDEN_TOOLS.includes(part.type)) {
        return false;
      }

      // Tool invocations only count as content when output is available
      if (part.type.startsWith("tool-")) {
        const toolPart = part as { state?: string; output?: unknown };
        // Show tool calls while input or output is pending/available
        if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
          return true;
        }
        if (toolPart.state === "output-available") {
          return true;
        }
        if (toolPart.state === "output-error" || toolPart.state === "output-denied") {
          return true;
        }
      }

      return false;
    });
  };

  // Render message parts including tool results
  const renderMessageParts = (message: typeof messages[0]) => {
    return message.parts.map((part, index) => {
      // Text content with markdown rendering
      if (part.type === "text") {
        return (
          <div key={index} className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-gray-900">
            <ReactMarkdown>{part.text}</ReactMarkdown>
          </div>
        );
      }

      // Tool invocations with generative UI
      if (part.type === "tool-create_homework_assignment") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.creatingHomework} />;
          case "output-available":
            const output = part.output as Record<string, unknown>;

            // Handle error response
            if (output?.error) {
              return (
                <div key={index} className="bg-red-50 rounded-xl p-3 border border-red-200">
                  <p className="text-sm text-red-600">{String(output.error)}</p>
                </div>
              );
            }

            // Handle draft/preview state
            if (output?.status === "draft" || output?.preview) {
              // Only show buttons for the most recent message (not historical ones)
              const isLatestMessage = message.id === messages[messages.length - 1]?.id;
              return (
                <HomeworkDraftCard
                  key={index}
                  data={output as HomeworkDraftData}
                  t={t}
                  isRtl={isRtl}
                  onConfirm={isLatestMessage && !isLoading ? () => {
                    sendQuickMessage(isRtl ? "نعم، أنشئ الواجب" : "Yes, create the homework");
                  } : undefined}
                  onCancel={isLatestMessage && !isLoading ? () => {
                    sendQuickMessage(isRtl ? "لا، شكراً" : "No, thanks");
                  } : undefined}
                />
              );
            }

            // Handle created state - only show if we have a valid assignment_id
            if (output?.status === "created" && output?.assignment_id) {
              return <HomeworkCreatedCard key={index} data={output as HomeworkCreatedData} t={t} isRtl={isRtl} />;
            }

            // Fallback - show message or a generic success instead of empty bubble
            if (output?.message) {
              return (
                <div key={index} className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                  <p className="text-sm text-emerald-700">{String(output.message)}</p>
                </div>
              );
            }
            return (
              <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-sm text-gray-500">{isRtl ? "✓ تم التنفيذ" : "✓ Action completed"}</p>
              </div>
            );
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      if (part.type === "tool-get_student_progress") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.checkingProgress} />;
          case "output-available":
            return <ProgressCard key={index} data={part.output as Parameters<typeof ProgressCard>[0]["data"]} t={t} />;
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      if (part.type === "tool-get_weak_areas") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.analyzingWeakAreas} />;
          case "output-available":
            // Display weak areas summary
            const weakData = part.output as { weak_subjects?: Array<{ subject_name_en?: string; subject_name_ar?: string; average_score: number }>; recommendations?: string };
            if (weakData.weak_subjects && weakData.weak_subjects.length > 0) {
              return (
                <div key={index} className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                  <p className="text-sm font-medium text-amber-700 mb-2">{isRtl ? "المجالات التي تحتاج اهتمام:" : "Areas needing attention:"}</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {weakData.weak_subjects.map((s, i) => (
                      <li key={i}>• {isRtl ? s.subject_name_ar : s.subject_name_en} ({s.average_score}%)</li>
                    ))}
                  </ul>
                </div>
              );
            }
            // No weak areas - return null, let the model explain
            return null;
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      if (part.type === "tool-get_mistake_patterns") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.analyzingWeakAreas} />;
          case "output-available": {
            const data = part.output as {
              summary?: string;
              insights?: string[];
              subject_summary?: Array<{ subject_name?: string | null; average_score?: number | null }>;
              question_type_summary?: Array<{ question_type: string; incorrect_rate: number }>;
            };
            return (
              <div key={index} className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
                <p className="text-sm font-semibold text-amber-700">{t.mistakeInsights}</p>
                {data.summary && <p className="text-sm text-gray-700">{data.summary}</p>}
                {data.insights && data.insights.length > 0 && (
                  <ul className="text-sm text-gray-600 space-y-1">
                    {data.insights.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                )}
                {data.subject_summary && data.subject_summary.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{t.subjectsLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      {data.subject_summary.map((subject, i) => (
                        <span key={i} className="px-2 py-1 text-xs bg-white border border-amber-200 rounded-full text-amber-700">
                          {subject.subject_name || (isRtl ? "مادة" : "Subject")} • {subject.average_score ?? "—"}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {data.question_type_summary && data.question_type_summary.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{t.questionTypesLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      {data.question_type_summary.map((qt, i) => (
                        <span key={i} className="px-2 py-1 text-xs bg-white border border-amber-200 rounded-full text-amber-700">
                          {qt.question_type} • {qt.incorrect_rate}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      if (part.type === "tool-get_lesson_context") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.thinking} />;
          case "output-available": {
            const data = part.output as {
              summary?: string;
              sources?: Array<{ title?: string; subject_name?: string | null; snippet?: string }>;
            };
            return (
              <div key={index} className="bg-cyan-50 rounded-xl p-4 border border-cyan-200 space-y-3">
                <p className="text-sm font-semibold text-cyan-700">{t.lessonRefs}</p>
                {data.summary && <p className="text-sm text-gray-700">{data.summary}</p>}
                {data.sources && data.sources.length > 0 && (
                  <ul className="space-y-2">
                    {data.sources.map((source, i) => (
                      <li key={i} className="text-sm text-gray-600">
                        <p className="font-medium text-gray-800">{source.title || (isRtl ? "درس" : "Lesson")}</p>
                        <p className="text-xs text-gray-500">{source.subject_name || ""}</p>
                        {source.snippet && <p className="text-xs text-gray-500 mt-1">{source.snippet}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      if (part.type === "tool-suggest_learning_path") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.suggestingPath} />;
          case "output-available":
            const pathData = part.output as { recommended_lessons?: Array<{ title_ar: string; title_en?: string; reason: string }>; summary?: string };
            if (pathData.recommended_lessons && pathData.recommended_lessons.length > 0) {
              return (
                <div key={index} className="bg-purple-50 rounded-xl p-3 border border-purple-200">
                  <p className="text-sm font-medium text-purple-700 mb-2">{isRtl ? "الدروس المقترحة:" : "Recommended lessons:"}</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    {pathData.recommended_lessons.slice(0, 3).map((lesson, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-purple-500">{i + 1}.</span>
                        <div>
                          <p className="font-medium">{isRtl ? lesson.title_ar : (lesson.title_en || lesson.title_ar)}</p>
                          <p className="text-xs text-gray-400">{lesson.reason}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            // Show message when no lessons available
            return (
              <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-sm text-gray-500">{isRtl ? "لا توجد دروس متاحة حالياً" : "No lessons available at the moment"}</p>
              </div>
            );
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      // Handle tool-get_student_profile (student profile card)
      if (part.type === "tool-get_student_profile") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={t.loading} />;
          case "output-available":
            const profileData = part.output as { full_name?: string; grade_level?: number | null; preferred_language?: string; cohorts?: Array<{ name: string }> };
            if (profileData.full_name) {
              return (
                <div key={index} className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                  <p className="text-sm font-medium text-blue-700 mb-2">{isRtl ? "الملف الشخصي" : "Student Profile"}</p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">{isRtl ? "الاسم:" : "Name:"}</span> {profileData.full_name}</p>
                    {profileData.grade_level && <p><span className="font-medium">{isRtl ? "الصف:" : "Grade:"}</span> {profileData.grade_level}</p>}
                    {profileData.cohorts && profileData.cohorts.length > 0 && (
                      <p><span className="font-medium">{isRtl ? "الفصول:" : "Classes:"}</span> {profileData.cohorts.map(c => c.name).join(", ")}</p>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      // Handle tool-get_student_homework (homework list)
      if (part.type === "tool-get_student_homework") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={isRtl ? "جاري التحقق من الواجبات..." : "Checking homework..."} />;
          case "output-available":
            const hwData = part.output as { assignments?: Array<{ id: string; title_ar: string; title_en?: string; status: string; due_at?: string; score?: number }> };
            if (hwData.assignments && hwData.assignments.length > 0) {
              return (
                <div key={index} className="bg-orange-50 rounded-xl p-3 border border-orange-200">
                  <p className="text-sm font-medium text-orange-700 mb-2">{isRtl ? "واجباتك:" : "Your Homework:"}</p>
                  <ul className="text-sm text-gray-600 space-y-2">
                    {hwData.assignments.slice(0, 5).map((hw, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span>{isRtl ? hw.title_ar : (hw.title_en || hw.title_ar)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${hw.status === 'graded' ? 'bg-green-100 text-green-700' : hw.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {hw.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            return (
              <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-sm text-gray-500">{isRtl ? "لا يوجد واجبات حالياً" : "No homework assignments found"}</p>
              </div>
            );
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      // Handle tool-get_subjects - internal lookup tool, hidden from users
      if (part.type === "tool-get_subjects") {
        // This is an internal tool for the AI to look up subject IDs
        // Don't show any UI to users
        return null;
      }

      // Internal RAG/lookup tools - hidden from users
      if (
        part.type === "tool-search_lessons" ||
        part.type === "tool-get_lesson_content_chunk" ||
        part.type === "tool-get_homework_question_context"
      ) {
        // These are internal tools for fetching lesson/homework content
        // The AI uses them to build context but they shouldn't show UI
        return null;
      }

      // Handle tool-get_available_lessons (lessons list)
      if (part.type === "tool-get_available_lessons") {
        switch (part.state) {
          case "input-streaming":
          case "input-available":
            return <ToolLoadingIndicator key={index} message={isRtl ? "جاري البحث عن الدروس..." : "Finding lessons..."} />;
          case "output-available":
            const lessonsData = part.output as { lessons?: Array<{ id: string; title_ar: string; title_en: string; subject_name_ar?: string; subject_name_en?: string }> };
            if (lessonsData.lessons && lessonsData.lessons.length > 0) {
              return (
                <div key={index} className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
                  <p className="text-sm font-medium text-indigo-700 mb-2">{isRtl ? "الدروس المتاحة:" : "Available Lessons:"}</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {lessonsData.lessons.slice(0, 5).map((lesson, i) => (
                      <li key={i}>• {isRtl ? lesson.title_ar : lesson.title_en}</li>
                    ))}
                  </ul>
                </div>
              );
            }
            return null;
          case "output-error":
            return <div key={index} className="text-red-500 text-sm">Error: {part.errorText}</div>;
        }
      }

      // Generic tool handling for other tools not handled above
      if (part.type.startsWith("tool-")) {
        const toolState = (part as { state?: string }).state;
        const toolOutput = (part as { output?: unknown }).output;

        // Debug: log unhandled tool types
        console.log("Unhandled tool:", part.type, "state:", toolState);

        if (toolState === "input-streaming" || toolState === "input-available") {
          return <ToolLoadingIndicator key={index} message={t.thinking} />;
        }

        // For output-available, try to show meaningful content
        if (toolState === "output-available") {
          if (!toolOutput) {
            return (
              <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-sm text-gray-500">{isRtl ? "✓ تم التنفيذ" : "✓ Action completed"}</p>
              </div>
            );
          }
          // Check if it has an error
          if (typeof toolOutput === "object" && "error" in toolOutput) {
            return (
              <div key={index} className="bg-red-50 rounded-xl p-3 border border-red-200">
                <p className="text-sm text-red-600">{String((toolOutput as Record<string, unknown>).error)}</p>
              </div>
            );
          }

          // Show summary or message if available
          const output = toolOutput as Record<string, unknown>;
          if (output.summary) {
            return (
              <div key={index} className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <p className="text-sm text-blue-700">{String(output.summary)}</p>
              </div>
            );
          }
          if (output.message) {
            return (
              <div key={index} className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <p className="text-sm text-blue-700">{String(output.message)}</p>
              </div>
            );
          }

          // Generic success
          return (
            <div key={index} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-sm text-gray-500">{isRtl ? "✓ تم التنفيذ" : "✓ Action completed"}</p>
            </div>
          );
        }

        if (toolState === "output-error" || toolState === "output-denied") {
          const errorText = (part as { errorText?: string }).errorText;
          return (
            <div key={index} className="bg-red-50 rounded-xl p-3 border border-red-200">
              <p className="text-sm text-red-600">{errorText || "An error occurred"}</p>
            </div>
          );
        }

        // Fallback for unknown tool states
        return <ToolLoadingIndicator key={index} message={t.thinking} />;
      }

      return null;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <OwlThinking className="w-20 h-20 mx-auto mb-4" />
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  const grouped = groupedConversations();

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors lg:hidden"
            >
              {showSidebar ? Icons.close : Icons.menu}
            </button>
            <Link
              href="/dashboard"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors hidden lg:block"
            >
              <span className={isRtl ? "rotate-180 inline-block" : ""}>{Icons.back}</span>
            </Link>
            <OwlTutorIcon className="w-10 h-10" />
            <div>
              <h1 className="font-semibold text-gray-900">{t.aiTutor}</h1>
              <p className="text-xs text-gray-500">{t.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTts}
              title={t.readAloud}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${ttsEnabled
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
            >
              {ttsEnabled ? Icons.speaker : Icons.speakerOff}
              <span className="hidden sm:inline">{ttsEnabled ? t.readAloudOn : t.readAloudOff}</span>
            </button>

            <button
              onClick={startVoiceMode}
              title={t.voiceMode}
              className="flex items-center gap-2 px-3 py-2 bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-xl text-sm font-medium transition-colors"
            >
              {Icons.mic}
              <span className="hidden sm:inline">{t.voiceMode}</span>
            </button>

            <button
              onClick={startNewConversation}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-100 text-cyan-700 rounded-xl hover:bg-cyan-200 transition-colors text-sm font-medium"
            >
              {Icons.plus}
              <span className="hidden sm:inline">{t.newChat}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`${showSidebar ? "translate-x-0" : isRtl ? "translate-x-full" : "-translate-x-full"
          } lg:translate-x-0 absolute lg:relative z-10 w-72 h-full bg-white border-e border-gray-200 transition-transform lg:block flex-shrink-0`}>
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t.history}</h2>
          </div>

          <div className="overflow-y-auto h-[calc(100%-60px)] p-2">
            {conversations.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">{t.noHistory}</p>
            ) : (
              <>
                {grouped.today.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-400 px-2 mb-2">{t.today}</p>
                    {grouped.today.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group relative w-full text-left p-3 rounded-xl mb-1 transition-colors cursor-pointer ${conversationId === conv.id
                          ? "bg-cyan-100 text-cyan-700"
                          : "hover:bg-gray-100 text-gray-700"
                          }`}
                        onClick={() => {
                          setConversationId(conv.id);
                          setShowSidebar(false);
                        }}
                      >
                        <p className="text-sm font-medium truncate pe-6">{conv.title || "New conversation"}</p>
                        {(conv.lesson_id || conv.homework_id) && (
                          <p className="text-xs text-gray-400 mt-1">
                            {t.relatedTo} {conv.lesson_id ? t.lesson : t.homework}
                          </p>
                        )}
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="absolute top-3 end-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all"
                          title={t.deleteChat}
                        >
                          {Icons.trash}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {grouped.yesterday.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-400 px-2 mb-2">{t.yesterday}</p>
                    {grouped.yesterday.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group relative w-full text-left p-3 rounded-xl mb-1 transition-colors cursor-pointer ${conversationId === conv.id
                          ? "bg-cyan-100 text-cyan-700"
                          : "hover:bg-gray-100 text-gray-700"
                          }`}
                        onClick={() => {
                          setConversationId(conv.id);
                          setShowSidebar(false);
                        }}
                      >
                        <p className="text-sm font-medium truncate pe-6">{conv.title || "New conversation"}</p>
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="absolute top-3 end-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all"
                          title={t.deleteChat}
                        >
                          {Icons.trash}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {grouped.earlier.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 px-2 mb-2">{t.earlier}</p>
                    {grouped.earlier.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group relative w-full text-left p-3 rounded-xl mb-1 transition-colors cursor-pointer ${conversationId === conv.id
                          ? "bg-cyan-100 text-cyan-700"
                          : "hover:bg-gray-100 text-gray-700"
                          }`}
                        onClick={() => {
                          setConversationId(conv.id);
                          setShowSidebar(false);
                        }}
                      >
                        <p className="text-sm font-medium truncate pe-6">{conv.title || "New conversation"}</p>
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="absolute top-3 end-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all"
                          title={t.deleteChat}
                        >
                          {Icons.trash}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Overlay for mobile sidebar */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 z-0 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Error display */}
          {error && (
            <div className="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              Error: {error.message || "Something went wrong"}
            </div>
          )}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              /* Welcome screen */
              <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center">
                <OwlWaving className="w-24 h-24 mb-6" />
                <h2 className="text-xl font-bold text-gray-900 mb-2">{t.welcome}</h2>
                <p className="text-gray-500 mb-8">{t.welcomeDesc}</p>

                {/* Quick prompts */}
                <div className="w-full">
                  <p className="text-sm font-medium text-gray-400 mb-3">{t.quickPrompts}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setInput(prompt.prompt);
                          inputRef.current?.focus();
                        }}
                        className="p-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
                      >
                        <span className="text-cyan-500 mr-2">{Icons.sparkle}</span>
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Messages list */
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg) => {
                  // Skip assistant messages that don't have content yet (loading state)
                  if (msg.role === "assistant" && !hasMessageContent(msg)) {
                    return null;
                  }

                  const renderedParts = renderMessageParts(msg).filter(Boolean);
                  if (msg.role === "assistant" && renderedParts.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? (isRtl ? "justify-start" : "justify-end") : (isRtl ? "justify-end" : "justify-start")}`}
                    >
                      <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        {/* Avatar */}
                        {msg.role === "user" ? (
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-[#007229]/100 text-white">
                            أ
                          </div>
                        ) : (
                          <OwlTutorIcon className="w-8 h-8 flex-shrink-0" />
                        )}

                        {/* Message bubble */}
                        <div className={`p-4 rounded-2xl ${msg.role === "user"
                          ? "bg-[#007229]/100 text-white"
                          : "bg-white border border-gray-200"
                          }`}>
                          <div className="space-y-3">
                            {renderedParts}
                          </div>
                          {msg.role === "assistant" && getMessageText(msg) && (
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                onClick={() => {
                                  if (speakingId === msg.id) {
                                    stopSpeaking();
                                  } else {
                                    speakText(getMessageText(msg), msg.id);
                                  }
                                }}
                                disabled={ttsLoading && speakingId === msg.id}
                                className="inline-flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
                              >
                                {ttsLoading && speakingId === msg.id ? (
                                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                ) : speakingId === msg.id ? Icons.speakerOff : Icons.speaker}
                                {ttsLoading && speakingId === msg.id ? t.speak : speakingId === msg.id ? t.stop : t.speak}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Thinking indicator */}
                {isLoading && (
                  <div className={`flex ${isRtl ? "justify-end" : "justify-start"}`}>
                    <div className="flex gap-3 max-w-[85%]">
                      <OwlThinking className="w-10 h-10 flex-shrink-0" />
                      <div className="p-4 rounded-2xl bg-white border border-gray-200">
                        <div className="flex items-center gap-2 text-gray-400">
                          <div className="w-2 h-2 bg-[#007229] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 bg-[#007229] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 bg-[#007229] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          <span className="text-sm">{t.thinking}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error indicator */}
                {status === "error" && (
                  <div className={`flex ${isRtl ? "justify-end" : "justify-start"}`}>
                    <div className="flex gap-3 max-w-[85%]">
                      <OwlTutorIcon className="w-8 h-8 flex-shrink-0" />
                      <div className="p-4 rounded-2xl bg-red-50 border border-red-200">
                        <p className="text-sm font-medium text-red-700">{t.chatError}</p>
                        <p className="text-xs text-red-600 mt-1">{error?.message || t.chatErrorDesc}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 bg-white p-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.typeMessage}
                  rows={1}
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white resize-none"
                  style={{ minHeight: "48px", maxHeight: "120px" }}
                />
                <button
                  onClick={toggleListening}
                  disabled={!speechInputSupported}
                  title={speechInputSupported ? (listening ? t.listening : t.mic) : t.micUnsupported}
                  className={`px-3 py-3 rounded-xl border transition-colors ${!speechInputSupported
                    ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                    : listening
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  {listening ? Icons.micOff : Icons.mic}
                </button>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="px-5 py-3 bg-cyan-500 text-white rounded-xl hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isRtl ? null : Icons.send}
                  <span className="hidden sm:inline">{t.send}</span>
                  {isRtl ? <span className="rotate-180">{Icons.send}</span> : null}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Mode Overlay */}
      {voiceModeActive && (
        <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 via-gray-900 to-black flex flex-col">
          {/* Voice Header */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <OwlTutorIcon className="w-9 h-9" />
              <div>
                <h2 className="text-white font-semibold text-lg">{t.voiceMode}</h2>
                <p className="text-gray-400 text-xs">{t.subtitle}</p>
              </div>
            </div>
            <button
              onClick={exitVoiceMode}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors text-sm"
            >
              {Icons.close}
              <span>{t.exitVoice}</span>
            </button>
          </div>

          {/* Voice Transcripts */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="max-w-lg mx-auto space-y-3">
              {voiceTranscripts.map((entry, idx) => (
                <div
                  key={idx}
                  className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${entry.role === "user"
                    ? "bg-violet-600/80 text-white"
                    : "bg-white/10 text-gray-200"
                    }`}>
                    <p className="text-xs font-medium mb-1 opacity-60">
                      {entry.role === "user" ? t.you : t.tutor}
                    </p>
                    <p className="text-sm leading-relaxed">{entry.text}</p>
                  </div>
                </div>
              ))}
              <div ref={voiceTranscriptsEndRef} />
            </div>
          </div>

          {/* Error display */}
          {voiceError && (
            <div className="mx-6 mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm text-center">
              {voiceError}
            </div>
          )}

          {/* Voice Control Area */}
          <div className="flex flex-col items-center pb-12 pt-6">
            {/* State label */}
            <p className={`text-sm font-medium mb-6 ${voiceState === "recording" ? "text-red-400" :
              voiceState === "processing" ? "text-amber-400" :
                voiceState === "playing" ? "text-emerald-400" :
                  "text-gray-400"
              }`}>
              {voiceState === "recording" ? t.voiceRecording :
                voiceState === "processing" ? t.voiceProcessing :
                  voiceState === "playing" ? t.voicePlaying :
                    t.tapToSpeak}
            </p>

            {/* Main button */}
            <button
              onClick={toggleVoiceRecording}
              disabled={voiceState === "processing" || voiceState === "playing"}
              className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${voiceState === "recording"
                ? "bg-red-500 scale-110 shadow-[0_0_40px_rgba(239,68,68,0.5)]"
                : voiceState === "processing"
                  ? "bg-amber-500/80 cursor-wait"
                  : voiceState === "playing"
                    ? "bg-emerald-500/80 cursor-default"
                    : "bg-violet-600 hover:bg-violet-500 hover:scale-105 shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                } disabled:cursor-not-allowed`}
            >
              {/* Pulse ring for recording */}
              {voiceState === "recording" && (
                <>
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
                  <span className="absolute -inset-2 rounded-full border-2 border-red-400/50 animate-pulse" />
                </>
              )}

              {/* Spinner for processing */}
              {voiceState === "processing" && (
                <span className="absolute inset-0 rounded-full border-4 border-amber-300/30 border-t-amber-300 animate-spin" />
              )}

              {/* Sound waves for playing */}
              {voiceState === "playing" && (
                <span className="absolute -inset-2 rounded-full border-2 border-emerald-400/40 animate-pulse" />
              )}

              {/* Icon */}
              <svg
                className={`w-10 h-10 text-white relative z-10 ${voiceState === "processing" ? "animate-pulse" : ""
                  }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                {voiceState === "playing" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9v6m0 0H5a2 2 0 01-2-2v-2a2 2 0 012-2h4m0 6l5 4V5l-5 4zM16.5 8.5a4 4 0 010 7M18.5 6a7 7 0 010 12" />
                ) : voiceState === "recording" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a4.5 4.5 0 004.5-4.5v-6a4.5 4.5 0 00-9 0v6a4.5 4.5 0 004.5 4.5zm0 0v3m-3 0h6" />
                )}
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
