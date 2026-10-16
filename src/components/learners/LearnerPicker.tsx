"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LEARNER_AVATAR_LABELS,
  LEARNER_AVATAR_CHOICES,
  LEARNER_HEADER,
  MAX_CHILD_PROFILES_PER_ACCOUNT,
  MAX_LEARNER_NAME_LENGTH,
  gradeFromAge,
  type Learner,
  type LearnerAvatar,
  type SuggestedChild,
} from "@/lib/learners/types";
import LearnerAvatarIcon from "@/components/learners/LearnerAvatarIcon";
import type { Language } from "@/contexts/LanguageContext";

type LearnerFormValue = { id?: string; name: string; age: string; avatar: LearnerAvatar | ""; isSelf: boolean };

const COPY = {
  en: {
    title: "Who’s learning?", subtitle: "Choose your profile", add: "Add a child", addAnother: "Add another child",
    name: "Name your learner", field: "Learner’s name", avatar: "Choose an avatar", age: "Age (optional)",
    save: "Save", cancel: "Cancel", edit: "Edit", delete: "Delete child", max: "You can add up to 8 children.",
    remove: (name: string) => `Delete ${name} and their learning data?`, cannotUndo: "This cannot be undone.",
    offline: "Connect to the internet once to use this learner offline.", error: "Couldn’t load learners. Try again.",
    grade: (grade: number) => `Grade ${grade}`, self: "Account learner", saving: "Saving…", nameRequired: "Enter a name between 1 and 60 characters.",
    permission: "Only a parent or approved admin account can manage child profiles.",
    welcome: "Add or manage your children’s profiles here to keep their learning progress separate.",
  },
  ar: {
    title: "من سيتعلّم الآن؟", subtitle: "اختر ملفك الشخصي", add: "أضف طفلًا", addAnother: "أضف طفلًا آخر",
    name: "اكتب اسم المتعلّم", field: "اسم المتعلّم", avatar: "اختر صورة رمزية", age: "العمر (اختياري)",
    save: "حفظ", cancel: "إلغاء", edit: "تعديل", delete: "حذف الطفل", max: "يمكنك إضافة ٨ أطفال كحد أقصى.",
    remove: (name: string) => `هل تريد حذف ${name} وبيانات تعلّمه؟`, cannotUndo: "لا يمكن التراجع عن هذا الإجراء.",
    offline: "اتصل بالإنترنت مرة واحدة لاستخدام ملف المتعلّم دون اتصال.", error: "تعذّر تحميل ملفات المتعلّمين. حاول مرة أخرى.",
    grade: (grade: number) => `الصف ${grade}`, self: "متعلّم الحساب", saving: "جاري الحفظ…", nameRequired: "أدخل اسمًا من حرف واحد إلى ٦٠ حرفًا.",
    permission: "يمكن لوليّ الأمر أو المدير المعتمد إدارة ملفات الأطفال.",
    welcome: "أضف ملفات أطفالك أو أدرها هنا لمتابعة تقدّم كلٍّ منهم بشكل مستقل.",
  },
} as const;

interface LearnerPickerProps {
  learners: Learner[];
  accountId: string | null;
  canHaveChildren: boolean;
  needsSelfName: boolean;
  suggestedChildren: SuggestedChild[];
  language: Language;
  dismissible: boolean;
  onClose: () => void;
  onSelect: (id: string) => Promise<boolean>;
  onUpdated: () => Promise<void>;
  manageMode?: boolean;
  welcomePrompt?: boolean;
}

export default function LearnerPicker(props: LearnerPickerProps) {
  const { learners, accountId, canHaveChildren, needsSelfName, suggestedChildren, language, dismissible, onClose, onSelect, onUpdated, manageMode = false, welcomePrompt = false } = props;
  const t = COPY[language];
  const rtl = language === "ar";
  const [form, setForm] = useState<LearnerFormValue | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingLearner, setLoadingLearner] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const children = useMemo(() => learners.filter((learner) => !learner.isSelf), [learners]);
  const childCount = children.length;

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const startForm = (learner?: Learner, suggestion?: SuggestedChild) => {
    setForm({
      id: learner?.id,
      name: learner?.name || suggestion?.name || "",
      age: learner?.gradeLevel ? "" : suggestion?.age?.toString() || "",
      avatar: learner?.avatar || "",
      isSelf: Boolean(learner?.isSelf),
    });
    setFormError("");
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !accountId || busy) return;
    const name = form.name.trim();
    const age = form.age.trim() ? Number(form.age) : undefined;
    if (name.length < 1 || name.length > MAX_LEARNER_NAME_LENGTH) {
      setFormError(t.nameRequired);
      return;
    }
    if (age !== undefined && (!Number.isInteger(age) || age < 3 || age > 19)) {
      setFormError(language === "ar" ? "أدخل عمرًا صحيحًا من ٣ إلى ١٩." : "Enter an age from 3 to 19.");
      return;
    }

    setBusy(true);
    setFormError("");
    try {
      const editing = Boolean(form.id);
      const response = await fetch(editing ? `/api/learners/${form.id}` : "/api/learners", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json", [LEARNER_HEADER]: accountId },
        body: JSON.stringify({ name, ...(age === undefined ? {} : { age }), ...(form.avatar ? { avatar: form.avatar } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error(t.max);
        if (response.status === 401 || response.status === 403) throw new Error(t.permission);
        throw new Error(t.error);
      }
      const updatedLearner = result.learner || result.data?.learner || result;
      const learnerId = updatedLearner.id || form.id;
      setForm(null);
      await onUpdated();
      if (!manageMode && learnerId) {
        const chosen = await onSelect(learnerId);
        if (!chosen) setFormError(t.error);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const removeLearner = async (learner: Learner) => {
    if (!accountId || learner.isSelf || busy) return;
    if (!window.confirm(`${t.remove(learner.name)}\n\n${t.cannotUndo}`)) return;
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch(`/api/learners/${learner.id}`, {
        method: "DELETE",
        headers: { [LEARNER_HEADER]: accountId },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error(t.permission);
        throw new Error(t.error);
      }
      await onUpdated();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const selectLearner = async (learner: Learner) => {
    if (learner.needsSetup || (learner.isSelf && needsSelfName)) {
      startForm(learner);
      return;
    }
    setLoadingLearner(learner.id);
    const selected = await onSelect(learner.id);
    setLoadingLearner(null);
    if (!selected) setFormError(t.error);
  };

  const panel = (
    <section className={`w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8 ${manageMode ? "border border-gray-100" : ""}`} dir={rtl ? "rtl" : "ltr"} aria-labelledby="learner-picker-title">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#007229]">{manageMode ? t.self : t.subtitle}</p>
          <h1 id="learner-picker-title" className="text-2xl font-bold text-gray-900 sm:text-3xl">{manageMode ? (language === "ar" ? "أطفالي" : "My children") : t.title}</h1>
        </div>
        {dismissible && !manageMode && <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label={t.cancel}>×</button>}
      </div>

      {welcomePrompt && <p className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{t.welcome}</p>}

      {suggestedChildren.length > 0 && !manageMode && (
        <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{language === "ar" ? "أكمل إعداد ملفات المتعلّمين الذين أضفتهم عند التسجيل." : "Finish setting up the learners you mentioned at sign-up."}</p>
      )}

      {!manageMode && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {learners.map((learner) => {
            const needsName = learner.needsSetup || (learner.isSelf && needsSelfName);
            return (
              <button
                type="button"
                key={learner.id}
                onClick={() => void selectLearner(learner)}
                disabled={loadingLearner !== null}
                className={`flex min-h-36 flex-col items-center justify-center rounded-2xl border-2 p-4 text-center transition hover:-translate-y-0.5 hover:border-[#007229]/40 hover:bg-[#007229]/5 disabled:opacity-60 ${needsName ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-gray-50"}`}
              >
                <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm" aria-hidden="true">
                  {learner.avatar ? <LearnerAvatarIcon avatar={learner.avatar} className="h-12 w-12" /> : <span className="text-xl font-bold text-[#007229]">{learner.name?.trim().charAt(0).toLocaleUpperCase() || "?"}</span>}
                </span>
                <span className="font-bold text-gray-800">{needsName ? t.name : learner.name || (learner.isSelf ? t.self : t.name)}</span>
                {learner.gradeLevel && <span className="mt-1 text-xs text-gray-500">{t.grade(learner.gradeLevel)}</span>}
                {loadingLearner === learner.id && <span className="mt-1 text-xs text-[#007229]">{t.saving}</span>}
              </button>
            );
          })}
          {canHaveChildren && childCount < MAX_CHILD_PROFILES_PER_ACCOUNT && (
            <button type="button" disabled={needsSelfName} onClick={() => startForm(undefined, suggestedChildren[0])} className="flex min-h-36 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#007229]/30 bg-[#007229]/5 p-4 text-center font-bold text-[#007229] hover:bg-[#007229]/10 disabled:cursor-not-allowed disabled:opacity-50">
              <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl" aria-hidden="true">＋</span>
              {childCount ? t.addAnother : t.add}
            </button>
          )}
        </div>
      )}

      {manageMode && (
        <div className="space-y-3">
          {children.length === 0 ? <p className="rounded-2xl bg-gray-50 p-5 text-gray-600">{language === "ar" ? "لم تتم إضافة أطفال بعد." : "No children have been added yet."}</p> : children.map((learner) => (
            <div key={learner.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 sm:p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white" aria-hidden="true">
                {learner.avatar ? <LearnerAvatarIcon avatar={learner.avatar} className="h-10 w-10" /> : <span className="font-bold text-[#007229]">{learner.name?.trim().charAt(0).toLocaleUpperCase() || "?"}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-gray-900">{learner.name || t.name}</p>
                {learner.gradeLevel && <p className="text-sm text-gray-500">{t.grade(learner.gradeLevel)}</p>}
              </div>
              <button type="button" disabled={busy} onClick={() => startForm(learner)} className="rounded-xl px-3 py-2 text-sm font-bold text-[#007229] hover:bg-[#007229]/10">{t.edit}</button>
              <button type="button" disabled={busy} onClick={() => void removeLearner(learner)} className="rounded-xl px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">{t.delete}</button>
            </div>
          ))}
          {canHaveChildren && childCount < MAX_CHILD_PROFILES_PER_ACCOUNT && <button type="button" onClick={() => startForm(undefined, suggestedChildren[0])} className="w-full rounded-2xl border-2 border-dashed border-[#007229]/30 px-4 py-4 font-bold text-[#007229] hover:bg-[#007229]/5">＋ {childCount ? t.addAnother : t.add}</button>}
        </div>
      )}

      {childCount >= MAX_CHILD_PROFILES_PER_ACCOUNT && <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{t.max}</p>}
      {offline && <p className="mt-5 text-center text-xs text-gray-500">{t.offline}</p>}
      {formError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
    </section>
  );

  return (
    <>
      {manageMode ? panel : <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#102018]/55 p-3 backdrop-blur-sm sm:p-6"><div className="my-auto w-full max-w-3xl">{panel}</div></div>}
      {form && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" dir={rtl ? "rtl" : "ltr"}>
          <form onSubmit={(event) => void submitForm(event)} className="my-auto w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
            <h2 className="mb-5 text-2xl font-bold text-gray-900">{t.name}</h2>
            <label className="mb-4 block text-sm font-bold text-gray-700">
              {t.field}
              <input autoFocus required maxLength={MAX_LEARNER_NAME_LENGTH} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-[#007229] focus:ring-2 focus:ring-[#007229]/15" />
            </label>
            <label className="mb-5 block text-sm font-bold text-gray-700">
              {t.age}
              <input type="number" min={3} max={19} step={1} inputMode="numeric" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-[#007229] focus:ring-2 focus:ring-[#007229]/15" />
              {form.age && <span className="mt-1 block text-xs font-medium text-gray-500">{t.grade(gradeFromAge(Number(form.age)))}</span>}
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-bold text-gray-700">{t.avatar}</legend>
              <div className="grid grid-cols-6 gap-2">
                {LEARNER_AVATAR_CHOICES.map((avatar) => <button key={avatar} type="button" aria-label={LEARNER_AVATAR_LABELS[avatar][language]} title={LEARNER_AVATAR_LABELS[avatar][language]} aria-pressed={form.avatar === avatar} onClick={() => setForm({ ...form, avatar })} className={`flex h-14 w-14 items-center justify-center rounded-xl p-1 ${form.avatar === avatar ? "bg-[#007229]/10 ring-2 ring-[#007229]" : "bg-gray-50 hover:bg-gray-100"}`}><LearnerAvatarIcon avatar={avatar} className="h-12 w-12" /></button>)}
              </div>
            </fieldset>
            {formError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setForm(null)} disabled={busy} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 font-bold text-gray-700">{t.cancel}</button>
              <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-[#007229] px-4 py-3 font-bold text-white disabled:opacity-60">{busy ? t.saving : t.save}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
