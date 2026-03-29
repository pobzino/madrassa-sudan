"use client";

import { useEffect } from "react";
import {
  getCurriculumRequirementMessage,
  getCurriculumSelectionKey,
  getCurriculumTopicOptions,
  type CurriculumSelection,
} from "@/lib/curriculum";

type Subject = {
  name_ar?: string | null;
  name_en?: string | null;
};

interface CurriculumTopicSelectorProps {
  subject: Subject | null;
  gradeLevel: number;
  value: CurriculumSelection | null;
  onChange: (value: CurriculumSelection | null) => void;
  disabled?: boolean;
}

export default function CurriculumTopicSelector({
  subject,
  gradeLevel,
  value,
  onChange,
  disabled = false,
}: CurriculumTopicSelectorProps) {
  const options = getCurriculumTopicOptions(subject, gradeLevel);
  const blockedReason = getCurriculumRequirementMessage(subject, gradeLevel, value);

  useEffect(() => {
    if (!value) {
      return;
    }

    const stillValid = options.some(
      (option) => getCurriculumSelectionKey(option) === getCurriculumSelectionKey(value)
    );

    if (!stillValid) {
      onChange(null);
    }
  }, [onChange, options, value]);

  if (!subject) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-sm text-gray-600">Select a subject to load curriculum topics.</p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-sm text-gray-600">
          No mapped curriculum topics are configured for this subject and grade yet.
        </p>
      </div>
    );
  }

  const selectedKey = value ? getCurriculumSelectionKey(value) : "";
  const grouped = options.reduce<Record<string, CurriculumSelection[]>>((acc, option) => {
    if (!acc[option.strand]) {
      acc[option.strand] = [];
    }
    acc[option.strand].push(option);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Curriculum Topic</label>
        <select
          value={selectedKey}
          onChange={(e) => {
            const next = options.find((option) => getCurriculumSelectionKey(option) === e.target.value) ?? null;
            onChange(next);
          }}
          disabled={disabled}
          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">Select a curriculum topic</option>
          {Object.entries(grouped).map(([strand, strandOptions]) => (
            <optgroup key={strand} label={strand}>
              {strandOptions.map((option) => (
                <option key={getCurriculumSelectionKey(option)} value={getCurriculumSelectionKey(option)}>
                  {option.substrand}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {value ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-emerald-900">
              {value.frameworkTitle} · Stage {value.stage}
            </p>
            <p className="text-xs text-emerald-700">{value.strand}</p>
          </div>
          <p className="text-sm text-emerald-900">{value.summary}</p>
          <p className="text-xs text-emerald-800">
            AI focus: {value.promptFocus}
          </p>
          <p className="text-xs text-emerald-800">
            Suggested key ideas: {value.suggestedKeyIdeas.join(", ")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-amber-700">{blockedReason}</p>
      )}
    </div>
  );
}
