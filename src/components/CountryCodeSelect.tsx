"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

type CountryOption = { code: string; en: string; ar: string };

export default function CountryCodeSelect({ value, onChange, options, language, label }: {
  value: string;
  onChange: (code: string) => void;
  options: CountryOption[];
  language: "ar" | "en";
  label: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.code === value);
  const matches = options.filter((option) =>
    `${option.en} ${option.ar} ${option.code}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="min-w-0">
      <span id={`${id}-label`} className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>
      <button
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="dialog"
        onClick={() => { setQuery(""); dialog.current?.showModal(); }}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-start text-base text-gray-900 transition-colors hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        <span id={`${id}-value`} className="min-w-0 break-words">{selected?.[language]}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        dir={language === "ar" ? "rtl" : "ltr"}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/35 open:flex"
        onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <div className="flex items-center justify-between border-b border-gray-200 ps-5 pe-2 py-2">
          <h2 id={`${id}-title`} className="text-base font-semibold">{label}</h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={language === "ar" ? "إغلاق" : "Close"} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="relative mx-4 my-3">
          <Search className="pointer-events-none absolute start-3 top-3.5 h-4 w-4 text-gray-500" aria-hidden="true" />
          <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={language === "ar" ? "ابحث عن دولة أو رمز" : "Search country or code"} placeholder={language === "ar" ? "ابحث عن دولة أو رمز" : "Search country or code"} className="h-11 w-full rounded-lg border border-gray-300 bg-gray-50 ps-9 pe-3 text-base outline-offset-2 focus:outline-[var(--primary)]" />
        </div>
        <div className="min-h-0 max-h-[55dvh] overflow-y-auto overscroll-contain px-2 pb-2">
          {matches.map((option) => (
            <button key={option.code} type="button" aria-pressed={option.code === value} onClick={() => { onChange(option.code); dialog.current?.close(); }} className={`flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-gray-100 focus-visible:outline-[var(--primary)] ${option.code === value ? "bg-gray-100 font-semibold" : ""}`}>
              <span className="flex-1">{option[language]}</span>
              <span dir="ltr" className="tabular-nums text-gray-500">{option.code}</span>
              <Check className={`h-4 w-4 shrink-0 ${option.code === value ? "text-[var(--primary)]" : "invisible"}`} aria-hidden="true" />
            </button>
          ))}
          {matches.length === 0 && <p className="px-3 py-5 text-sm text-gray-500">{language === "ar" ? "لا توجد نتائج" : "No countries found"}</p>}
        </div>
      </dialog>
    </div>
  );
}
