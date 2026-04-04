"use client";

import { useState, useRef } from "react";
import { Bug, Sparkles, RefreshCw, MessageCircle, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

const translations = {
  ar: {
    title: "الإبلاغ عن مشكلة",
    category: "النوع",
    bug: "خطأ",
    feature: "ميزة جديدة",
    change: "طلب تغيير",
    other: "أخرى",
    titleLabel: "العنوان",
    titlePlaceholder: "وصف مختصر للمشكلة",
    descLabel: "التفاصيل",
    descPlaceholder: "اشرح المشكلة أو التغيير المطلوب بالتفصيل...",
    pageUrl: "رابط الصفحة",
    screenshot: "لقطة شاشة (اختياري)",
    uploadScreenshot: "رفع صورة",
    submit: "إرسال",
    submitting: "جاري الإرسال...",
    cancel: "إلغاء",
    success: "تم الإرسال بنجاح!",
    issueCreated: "تم إنشاء تذكرة على GitHub",
    viewIssue: "عرض التذكرة",
    error: "فشل الإرسال. حاول مرة أخرى.",
    close: "إغلاق",
    changeFile: "تغيير",
  },
  en: {
    title: "Report Issue",
    category: "Category",
    bug: "Bug",
    feature: "Feature Request",
    change: "Change Request",
    other: "Other",
    titleLabel: "Title",
    titlePlaceholder: "Brief description of the issue",
    descLabel: "Description",
    descPlaceholder: "Explain the issue or change request in detail...",
    pageUrl: "Page URL",
    screenshot: "Screenshot (optional)",
    uploadScreenshot: "Upload image",
    submit: "Submit",
    submitting: "Submitting...",
    cancel: "Cancel",
    success: "Submitted successfully!",
    issueCreated: "GitHub issue created",
    viewIssue: "View Issue",
    error: "Failed to submit. Please try again.",
    close: "Close",
    changeFile: "Change",
  },
};

const CATEGORIES = ["bug", "feature", "change", "other"] as const;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bug: Bug,
  feature: Sparkles,
  change: RefreshCw,
  other: MessageCircle,
};

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  const [category, setCategory] = useState<string>("bug");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    github_issue_url?: string | null;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  function reset() {
    setCategory("bug");
    setFeedbackTitle("");
    setDescription("");
    setScreenshotFile(null);
    setError("");
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackTitle.trim() || !description.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      let screenshot_url: string | null = null;

      // Upload screenshot if provided
      if (screenshotFile) {
        const supabase = createClient();
        const ext = screenshotFile.name.split(".").pop() || "png";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("feedback")
          .upload(path, screenshotFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("feedback")
            .getPublicUrl(path);
          screenshot_url = urlData.publicUrl;
        }
      }

      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: feedbackTitle.trim(),
          description: description.trim(),
          page_url: pageUrl,
          screenshot_url,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Submission failed");
      }

      setResult({
        github_issue_url: data.github_issue_url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            {t.title}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success state */}
        {result ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.success}</h3>
            {result.github_issue_url && (
              <p className="text-sm text-gray-500 mb-4">
                {t.issueCreated}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              {result.github_issue_url && (
                <a
                  href={result.github_issue_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
                >
                  {t.viewIssue} &rarr;
                </a>
              )}
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                {t.close}
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Category pills */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.category}
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      category === cat
                        ? "bg-gray-900 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {(() => { const Icon = CATEGORY_ICONS[cat]; return Icon ? <Icon className="inline w-4 h-4" /> : null; })()}{" "}
                    {t[cat as keyof typeof t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.titleLabel}
              </label>
              <input
                type="text"
                value={feedbackTitle}
                onChange={(e) => setFeedbackTitle(e.target.value)}
                placeholder={t.titlePlaceholder}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.descLabel}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.descPlaceholder}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Page URL (readonly) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.pageUrl}
              </label>
              <input
                type="text"
                value={pageUrl}
                readOnly
                className="w-full px-3 py-2 border border-gray-100 rounded-xl text-sm bg-gray-50 text-gray-500 truncate"
              />
            </div>

            {/* Screenshot upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.screenshot}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
              />
              {screenshotFile ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
                  <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-emerald-700 truncate flex-1">
                    {screenshotFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-emerald-600 hover:text-emerald-700 text-xs font-medium"
                  >
                    {t.changeFile}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors w-full"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
                  </svg>
                  {t.uploadScreenshot}
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={submitting || !feedbackTitle.trim() || !description.trim()}
                className="flex-1 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {submitting ? t.submitting : t.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
