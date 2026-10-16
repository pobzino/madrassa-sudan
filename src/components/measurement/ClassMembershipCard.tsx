"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { School, X } from "lucide-react";
import { toast } from "sonner";
import { CLASS_COPY } from "./classCopy";
import { normaliseJoinCode, scopeApi, type LearnerClass } from "./scopeApi";
import type { UiLang } from "./format";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * For the parent (or an adult learning on their own account): the classes a
 * child is in, "Join a class" with the teacher's code (pick the child, then
 * confirm that the teacher will see their progress) and "Leave class".
 */
export default function ClassMembershipCard({
  lang,
  fetcher = (i, init) => fetch(i, init),
  learners,
  activeLearnerId,
  self,
}: {
  lang: UiLang;
  fetcher?: Fetcher;
  /** The children this account manages (or just the account itself). */
  learners: Array<{ id: string; name: string }>;
  activeLearnerId: string;
  /** The active learner is the account itself: "you" wording. */
  self: boolean;
}) {
  const t = CLASS_COPY[lang];
  const active = learners.find((l) => l.id === activeLearnerId) ?? learners[0];
  const name = active?.name?.trim() || (lang === "ar" ? "طفلك" : "your child");
  const [classes, setClasses] = useState<LearnerClass[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<"closed" | "code" | "confirm">("closed");
  const [code, setCode] = useState("");
  const [childId, setChildId] = useState(activeLearnerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async () => {
    if (!active) return;
    try {
      const body = await scopeApi.learnerClasses(fetcherRef.current, active.id);
      setClasses(body.classes);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [active]);
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  if (!active || failed) return null;
  const chosen = learners.find((l) => l.id === childId) ?? active;
  const chosenName = chosen.name?.trim() || name;

  const errorText = (e: unknown) => {
    const code = (e as { code?: string })?.code ?? "";
    return t.errors[code] ?? t.errors.generic;
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await scopeApi.joinClass(fetcherRef.current, { code: normaliseJoinCode(code), learnerId: chosen.id });
      toast.success(res.status === "active" ? t.joinedActive(res.name) : t.joined(res.name));
      setStep("closed");
      setCode("");
      await load();
    } catch (e) {
      setError(errorText(e));
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  const leave = async (cls: LearnerClass) => {
    if (!window.confirm(self ? t.leaveConfirmSelf(cls.name) : t.leaveConfirm(name, cls.name))) return;
    try {
      await scopeApi.leaveClass(fetcherRef.current, { cohortId: cls.cohortId, learnerId: active.id });
      toast.success(t.left(cls.name));
      await load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700" aria-hidden="true">
          <School className="h-5 w-5" />
        </span>
        <h2 className="min-w-0 flex-1 text-xl font-semibold font-fredoka text-gray-900">{self ? t.classesTitleSelf : t.classesTitle(name)}</h2>
        {step === "closed" && (
          <button
            type="button"
            onClick={() => {
              setChildId(active.id);
              setError(null);
              setStep("code");
            }}
            className="rounded-xl bg-[#007229] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005C22]"
          >
            {t.join}
          </button>
        )}
      </div>

      {step !== "closed" && (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="mb-3 flex items-start gap-2">
            <p className="min-w-0 flex-1 font-semibold text-gray-900">{step === "confirm" ? t.confirmTitle : t.join}</p>
            <button type="button" onClick={() => setStep("closed")} aria-label={t.cancel} className="rounded-lg p-1 text-gray-400 hover:bg-white hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          {step === "code" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (normaliseJoinCode(code).length >= 4) setStep("confirm");
              }}
            >
              <label className="block text-sm font-medium text-gray-700">
                {t.codeLabel}
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t.codePlaceholder}
                  autoComplete="off"
                  autoCapitalize="characters"
                  dir="ltr"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base tracking-widest uppercase"
                />
              </label>
              {learners.length > 1 && (
                <label className="block text-sm font-medium text-gray-700">
                  {t.childLabel}
                  <select value={childId} onChange={(e) => setChildId(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base">
                    {learners.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name || "—"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setStep("closed")} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                  {t.cancel}
                </button>
                <button type="submit" disabled={normaliseJoinCode(code).length < 4} className="rounded-xl bg-[#007229] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {t.next}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-base leading-relaxed text-gray-700">{self ? t.confirmBodySelf : t.confirmBody(chosenName)}</p>
              <p className="text-sm text-gray-500" dir="ltr">{normaliseJoinCode(code)}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setStep("code")} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                  {t.cancel}
                </button>
                <button type="button" onClick={() => void join()} disabled={busy} className="rounded-xl bg-[#007229] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? t.joining : t.confirm}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {classes === null ? (
        <div className="h-14 animate-pulse rounded-xl bg-gray-100" />
      ) : classes.length === 0 ? (
        <p className="text-sm text-gray-500">{self ? t.noClassesSelf : t.noClasses(name)}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {classes.map((cls) => (
            <li key={cls.cohortId} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{cls.name}</p>
                <p className="text-xs text-gray-500">
                  {[cls.schoolName, cls.teacherNames.length ? t.teacher(cls.teacherNames.join(", ")) : null].filter(Boolean).join(" · ")}
                </p>
                <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {cls.status === "active" ? t.active : t.pending}
                </span>
              </div>
              <button type="button" onClick={() => void leave(cls)} className="shrink-0 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                {t.leave}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
