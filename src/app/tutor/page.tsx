"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import { OwlTutorIcon, OwlThinking, OwlWaving } from "@/components/illustrations";
import type { AIConversation, AIMessage, Subject } from "@/lib/database.types";

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
  chat: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  ),
  sparkle: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3zm6 10l.75 2.25L21 16l-2.25.75L18 19l-.75-2.25L15 16l2.25-.75L18 13zM6 13l.75 2.25L9 16l-2.25.75L6 19l-.75-2.25L3 16l2.25-.75L6 13z"/>
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
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

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
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Context from URL params
  const lessonId = searchParams.get("lesson");
  const homeworkId = searchParams.get("homework");

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUserId(user.id);

      // Load conversation history
      const { data: conversationsData } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("student_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (conversationsData) {
        setConversations(conversationsData);
      }

      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages when conversation changes
  useEffect(() => {
    async function loadMessages() {
      if (!currentConversation) {
        setMessages([]);
        return;
      }

      const { data: messagesData } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", currentConversation)
        .order("created_at");

      if (messagesData) {
        setMessages(messagesData.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.created_at),
        })));
      }
    }
    loadMessages();
  }, [currentConversation, supabase]);

  // Start new conversation
  const startNewConversation = async () => {
    setCurrentConversation(null);
    setMessages([]);
    setShowSidebar(false);
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim() || sending || !userId) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);

    // Add user message to UI immediately
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      // Create conversation if needed
      let convId = currentConversation;
      if (!convId) {
        const { data: newConv } = await supabase
          .from("ai_conversations")
          .insert({
            student_id: userId,
            lesson_id: lessonId || null,
            homework_id: homeworkId || null,
            title: userMessage.slice(0, 50),
          })
          .select()
          .single();

        if (newConv) {
          convId = newConv.id;
          setCurrentConversation(convId);
          setConversations((prev) => [newConv, ...prev]);
        }
      }

      if (!convId) throw new Error("Failed to create conversation");

      // Save user message
      await supabase.from("ai_messages").insert({
        conversation_id: convId,
        role: "user",
        content: userMessage,
      });

      // Generate AI response (mock for now - would call API)
      // In production, this would call /api/tutor
      const aiResponse = generateMockResponse(userMessage, language);

      // Save AI response
      const { data: aiMsg } = await supabase
        .from("ai_messages")
        .insert({
          conversation_id: convId,
          role: "assistant",
          content: aiResponse,
        })
        .select()
        .single();

      // Add AI response to UI
      if (aiMsg) {
        setMessages((prev) => [...prev, {
          id: aiMsg.id,
          role: "assistant",
          content: aiMsg.content,
          timestamp: new Date(aiMsg.created_at),
        }]);
      }

      // Update conversation timestamp
      await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);

    } catch (error) {
      console.error("Error sending message:", error);
    }

    setSending(false);
  };

  // Mock AI response (replace with actual API call)
  function generateMockResponse(question: string, lang: string): string {
    const responses = {
      ar: [
        "هذا سؤال ممتاز! دعني أشرح لك بطريقة بسيطة...\n\nأولاً، من المهم فهم المفهوم الأساسي. ثم يمكننا التعمق في التفاصيل.\n\nهل تريد أن أعطيك مثالاً عملياً؟",
        "أفهم ما تسأل عنه. إليك الشرح:\n\n1. الخطوة الأولى هي فهم المشكلة\n2. ثم نحلل المعطيات\n3. وأخيراً نطبق الحل\n\nهل هذا واضح؟ يمكنني شرح أي جزء بالتفصيل.",
        "سؤال جيد جداً! 🌟\n\nلفهم هذا الموضوع، فكر فيه بهذه الطريقة...\n\nتخيل أنك تبني شيئاً خطوة بخطوة. كل خطوة تبني على السابقة.\n\nما الجزء الذي تجده صعباً؟",
      ],
      en: [
        "That's an excellent question! Let me explain in a simple way...\n\nFirst, it's important to understand the basic concept. Then we can dive into the details.\n\nWould you like me to give you a practical example?",
        "I understand what you're asking. Here's the explanation:\n\n1. The first step is to understand the problem\n2. Then we analyze the given information\n3. Finally, we apply the solution\n\nIs this clear? I can explain any part in detail.",
        "Great question! 🌟\n\nTo understand this topic, think of it this way...\n\nImagine you're building something step by step. Each step builds on the previous one.\n\nWhich part do you find difficult?",
      ],
    };
    const options = responses[lang as "ar" | "en"] || responses.en;
    return options[Math.floor(Math.random() * options.length)];
  }

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick prompts
  const quickPrompts = [
    { label: t.explainThis, prompt: language === "ar" ? "اشرح لي هذا الموضوع" : "Explain this topic to me" },
    { label: t.giveExample, prompt: language === "ar" ? "أعطني مثالاً على ذلك" : "Give me an example of this" },
    { label: t.helpUnderstand, prompt: language === "ar" ? "ساعدني في فهم هذا المفهوم" : "Help me understand this concept" },
    { label: t.solveStep, prompt: language === "ar" ? "حل هذه المسألة خطوة بخطوة" : "Solve this step by step" },
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <OwlThinking className="w-20 h-20 mx-auto mb-4" />
            <p className="text-gray-500">{t.loading}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const grouped = groupedConversations();

  return (
    <DashboardLayout>
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

          <button
            onClick={startNewConversation}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-100 text-cyan-700 rounded-xl hover:bg-cyan-200 transition-colors text-sm font-medium"
          >
            {Icons.plus}
            <span className="hidden sm:inline">{t.newChat}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`${
          showSidebar ? "translate-x-0" : isRtl ? "translate-x-full" : "-translate-x-full"
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
                      <button
                        key={conv.id}
                        onClick={() => {
                          setCurrentConversation(conv.id);
                          setShowSidebar(false);
                        }}
                        className={`w-full text-left p-3 rounded-xl mb-1 transition-colors ${
                          currentConversation === conv.id
                            ? "bg-cyan-100 text-cyan-700"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        <p className="text-sm font-medium truncate">{conv.title || "New conversation"}</p>
                        {(conv.lesson_id || conv.homework_id) && (
                          <p className="text-xs text-gray-400 mt-1">
                            {t.relatedTo} {conv.lesson_id ? t.lesson : t.homework}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {grouped.yesterday.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-400 px-2 mb-2">{t.yesterday}</p>
                    {grouped.yesterday.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setCurrentConversation(conv.id);
                          setShowSidebar(false);
                        }}
                        className={`w-full text-left p-3 rounded-xl mb-1 transition-colors ${
                          currentConversation === conv.id
                            ? "bg-cyan-100 text-cyan-700"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        <p className="text-sm font-medium truncate">{conv.title || "New conversation"}</p>
                      </button>
                    ))}
                  </div>
                )}

                {grouped.earlier.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 px-2 mb-2">{t.earlier}</p>
                    {grouped.earlier.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setCurrentConversation(conv.id);
                          setShowSidebar(false);
                        }}
                        className={`w-full text-left p-3 rounded-xl mb-1 transition-colors ${
                          currentConversation === conv.id
                            ? "bg-cyan-100 text-cyan-700"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                      >
                        <p className="text-sm font-medium truncate">{conv.title || "New conversation"}</p>
                      </button>
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
                {messages.map((msg) => (
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
                      <div className={`p-4 rounded-2xl ${
                        msg.role === "user"
                          ? "bg-[#007229]/100 text-white"
                          : "bg-white border border-gray-200"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {sending && (
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
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
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
      </div>
    </DashboardLayout>
  );
}
