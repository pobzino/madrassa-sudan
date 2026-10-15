"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  LEARNER_HEADER,
  type Learner,
  type LearnersResponse,
} from "@/lib/learners/types";
import { getCachedProfile, getCachedUser } from "@/lib/supabase/auth-cache";
import { createClient } from "@/lib/supabase/client";
import LearnerPicker from "@/components/learners/LearnerPicker";
import { cacheValidatedLearnerSelection } from "@/lib/offline/learner";

export const LEARNER_CHANGED_EVENT = "amal:learner-changed";

interface LearnerContextValue {
  learners: Learner[];
  activeLearner: Learner | null;
  accountId: string | null;
  isParent: boolean;
  canHaveChildren: boolean;
  needsSelfName: boolean;
  suggestedChildren: LearnersResponse["suggestedChildren"];
  needsSetup: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActiveLearner: (id: string) => Promise<boolean>;
  openPicker: () => void;
  fetchWithLearner: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

function readSavedLearner(accountId: string): string | null {
  try {
    const raw = localStorage.getItem(`amal-active-learner:${accountId}`);
    if (!raw) return null;
    // Read the earlier raw-ID format so an online refresh can migrate it after
    // the server has freshly validated the account's learner list.
    try {
      const parsed = JSON.parse(raw) as { activeLearnerId?: unknown };
      return typeof parsed.activeLearnerId === "string" ? parsed.activeLearnerId : raw;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [learners, setLearners] = useState<Learner[]>([]);
  const learnersRef = useRef<Learner[]>([]);
  const [activeLearner, setActiveLearnerState] = useState<Learner | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);
  const [canHaveChildren, setCanHaveChildren] = useState(false);
  const [needsSelfName, setNeedsSelfName] = useState(false);
  const needsSelfNameRef = useRef(false);
  const [suggestedChildren, setSuggestedChildren] = useState<LearnersResponse["suggestedChildren"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [initialSelectionRequired, setInitialSelectionRequired] = useState(false);
  const router = useRouter();
  const { language } = useLanguage();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/learners", { cache: "no-store" });
      if (!response.ok) throw new Error(`Learners request failed (${response.status})`);
      const payload = (await response.json()) as LearnersResponse;
      if (!payload.accountId || !Array.isArray(payload.learners) || payload.learners.length === 0) {
        throw new Error("Learners response is incomplete");
      }
      const parent = Object.prototype.hasOwnProperty.call(payload, "needsSelfName") ||
        Object.prototype.hasOwnProperty.call(payload, "suggestedChildren");
      const nextLearners = payload.learners;
      const self = nextLearners.find((learner) => learner.isSelf);
      if (!self) throw new Error("Learners response has no account learner");

      setAccountId(payload.accountId);
      learnersRef.current = nextLearners;
      setLearners(nextLearners);
      setIsParent(parent);
      setCanHaveChildren(Boolean(payload.canHaveChildren));
      needsSelfNameRef.current = Boolean(payload.needsSelfName);
      setNeedsSelfName(Boolean(payload.needsSelfName));
      setSuggestedChildren(payload.suggestedChildren || []);

      const savedId = readSavedLearner(payload.accountId);
      const saved = savedId ? nextLearners.find((learner) => learner.id === savedId) : null;
      const selectedId = saved && !saved.needsSetup && !payload.needsSelfName ? saved.id : self.id;
      cacheValidatedLearnerSelection(payload.accountId, selectedId, nextLearners.map((learner) => learner.id));
      const pending = (learner: Learner | undefined) => Boolean(learner?.needsSetup);
      if (parent) {
        if (saved && !pending(saved) && !payload.needsSelfName) {
          setActiveLearnerState(saved);
          setInitialSelectionRequired(false);
          setPickerOpen(false);
        } else {
          setActiveLearnerState(null);
          setInitialSelectionRequired(true);
          setPickerOpen(true);
        }
      } else {
        setActiveLearnerState(self);
        setInitialSelectionRequired(false);
        setPickerOpen(false);
      }
    } catch (cause) {
      const user = await getCachedUser(createClient()).catch(() => null);
      const cachedProfile = user ? await getCachedProfile(createClient(), user.id).catch(() => null) : null;
      if (user && cachedProfile?.role === "parent" && typeof navigator !== "undefined" && navigator.onLine === false) {
        // No learner list has been freshly validated, so an offline visit can
        // safely fall back to the account learner only.
        const self: Learner = {
          id: user.id,
          name: cachedProfile.full_name || "",
          avatar: null,
          gradeLevel: cachedProfile.grade_level || null,
          isSelf: true,
        };
        setAccountId(user.id);
        setLearners([self]);
        setActiveLearnerState(self);
        setIsParent(true);
        setCanHaveChildren(false);
        needsSelfNameRef.current = !self.name.trim();
        setNeedsSelfName(needsSelfNameRef.current);
        setInitialSelectionRequired(false);
        setPickerOpen(false);
        return;
      }
      if (user && cachedProfile?.role !== "parent") {
        // Existing student/staff experiences retain their self learner if the new endpoint
        // is temporarily unreachable. No previously selected child can leak into this view.
        const self: Learner = {
          id: user.id,
          name: cachedProfile?.full_name || "",
          avatar: null,
          gradeLevel: cachedProfile?.grade_level || null,
          isSelf: true,
        };
        setAccountId(user.id);
        setLearners([self]);
        setActiveLearnerState(self);
        setIsParent(false);
        setInitialSelectionRequired(false);
        setPickerOpen(false);
      } else {
        setActiveLearnerState(null);
        setError(cause instanceof Error ? cause.message : "Could not load learners");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => {
      if (isParent && activeLearner && !activeLearner.isSelf) {
        // Hide the previous learner until the server revalidates that profile
        // after connectivity returns.
        setActiveLearnerState(null);
        setInitialSelectionRequired(true);
        setPickerOpen(true);
      }
      void refresh();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [activeLearner, isParent, refresh]);

  const setActiveLearner = useCallback(async (id: string) => {
    const learner = learnersRef.current.find((item) => item.id === id);
    if (!accountId || !learner || learner.needsSetup || needsSelfNameRef.current) return false;
    setSwitching(true);
    setError(null);
    // Unmount learner-scoped pages while they drop their old state, then mount
    // again under a key tied to the new learner.
    window.dispatchEvent(new CustomEvent(LEARNER_CHANGED_EVENT, { detail: { accountId, learnerId: id } }));
    cacheValidatedLearnerSelection(accountId, id, learnersRef.current.map((learner) => learner.id));
    setActiveLearnerState(learner);
    setInitialSelectionRequired(false);
    setPickerOpen(false);
    router.refresh();
    setSwitching(false);
    return true;
  }, [accountId, router]);

  const fetchWithLearner = useCallback((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (activeLearner) headers.set(LEARNER_HEADER, activeLearner.id);
    return fetch(input, { ...init, headers });
  }, [activeLearner]);

  const openPicker = useCallback(() => {
    if (isParent) setPickerOpen(true);
  }, [isParent]);

  const value = useMemo<LearnerContextValue>(() => ({
    learners,
    activeLearner,
    accountId,
    isParent,
    canHaveChildren,
    needsSelfName,
    suggestedChildren,
    needsSetup: Boolean(activeLearner?.needsSetup || (activeLearner?.isSelf && needsSelfName)),
    loading,
    error,
    refresh,
    setActiveLearner,
    openPicker,
    fetchWithLearner,
  }), [learners, activeLearner, accountId, isParent, canHaveChildren, needsSelfName, suggestedChildren, loading, error, refresh, setActiveLearner, openPicker, fetchWithLearner]);

  const requiresPicker = isParent && (pickerOpen || initialSelectionRequired || switching || !activeLearner || Boolean(activeLearner.needsSetup) || needsSelfName);

  return (
    <LearnerContext.Provider value={value}>
      {loading && !accountId ? (
        <div className="min-h-[40vh] flex items-center justify-center text-gray-500" role="status">
          {language === "ar" ? "جاري تحميل ملفات المتعلّمين..." : "Loading learner profiles..."}
        </div>
      ) : error && !activeLearner ? (
        <div className="min-h-[40vh] max-w-lg mx-auto px-5 flex flex-col items-center justify-center text-center" role="alert" dir={language === "ar" ? "rtl" : "ltr"}>
          <p className="mb-4 text-gray-700">{language === "ar" ? "تعذّر تحميل ملفات المتعلّمين. حاول مرة أخرى." : "Couldn’t load learners. Try again."}</p>
          <button type="button" onClick={() => void refresh()} className="rounded-xl bg-[#007229] px-5 py-3 font-semibold text-white">
            {language === "ar" ? "إعادة المحاولة" : "Try again"}
          </button>
        </div>
      ) : requiresPicker ? (
        <LearnerPicker
          learners={learners}
          accountId={accountId}
          canHaveChildren={canHaveChildren}
          needsSelfName={needsSelfName}
          suggestedChildren={suggestedChildren}
          language={language}
          dismissible={Boolean(activeLearner && !initialSelectionRequired && !activeLearner.needsSetup && !needsSelfName)}
          onClose={() => setPickerOpen(false)}
          onSelect={setActiveLearner}
          onUpdated={refresh}
        />
      ) : activeLearner ? (
        <div key={`${accountId}:${activeLearner.id}`}>{children}</div>
      ) : children
      }
    </LearnerContext.Provider>
  );
}

export function useLearnerContext() {
  const context = useContext(LearnerContext);
  if (!context) throw new Error("useLearnerContext must be used within LearnerProvider");
  return context;
}

/** Compact dashboard control; selecting a learner completes before the old page remounts. */
export function LearnerSwitcher({ className = "" }: { className?: string }) {
  const { activeLearner, isParent, openPicker } = useLearnerContext();
  const { language } = useLanguage();
  if (!isParent || !activeLearner) return null;
  return (
    <button type="button" onClick={openPicker} className={`inline-flex items-center gap-2 rounded-full border border-[#007229]/20 bg-white/90 px-4 py-2 text-sm font-bold text-[#005C22] shadow-sm hover:bg-[#007229]/5 ${className}`} aria-label={language === "ar" ? "تبديل المتعلّم" : "Switch learner"}>
      <span aria-hidden="true">{activeLearner.avatar ? ({ cat: "🐱", dog: "🐶", lion: "🦁", elephant: "🐘", camel: "🐪", rabbit: "🐰", turtle: "🐢", fish: "🐟", bird: "🐦", monkey: "🐵", bear: "🐻", frog: "🐸" } as const)[activeLearner.avatar] : "👤"}</span>
      <span>{language === "ar" ? "تبديل المتعلّم" : "Switch learner"}</span>
      <span className="hidden sm:inline text-gray-500">{activeLearner.name || (language === "ar" ? "المتعلّم" : "Learner")}</span>
      <span aria-hidden="true">⌄</span>
    </button>
  );
}
