import "server-only";

import arabicTemplates from "./trace-templates/ar.json";
import englishTemplates from "./trace-templates/en.json";
import {
  gradeTraceStrokes,
  registerTraceTemplateSource,
  traceLetterOf,
  type TraceLetterGrade,
  type TraceLetterTemplate,
} from "./trace-letter";
import type { TraceLetterConfig, TraceLetterScript } from "./types";

// The full letter-tracing template set, for grading on the server only.
// Browsers load one letter at a time (public/trace-letter/templates); a test
// fails if any client module reaches this file or the JSON.

type TemplateFile = { version: number; script: TraceLetterScript; templates: Record<string, TraceLetterTemplate> };

const FILES: Record<TraceLetterScript, TemplateFile> = {
  ar: arabicTemplates as unknown as TemplateFile,
  en: englishTemplates as unknown as TemplateFile,
};

export function serverTraceTemplate(config: TraceLetterConfig | null | undefined): TraceLetterTemplate | null {
  const letter = traceLetterOf(config);
  return letter && config ? FILES[config.script].templates[letter] ?? null : null;
}

/** Grade a trace on the server (fails closed for an unknown letter). */
export function gradeTraceLetterOnServer(config: TraceLetterConfig | null | undefined, strokes: unknown, tolerance?: number): TraceLetterGrade {
  const template = serverTraceTemplate(config);
  return template ? gradeTraceStrokes(template, strokes, tolerance) : { score: 0, is_correct: false };
}

// gradeInteraction (shared with the browser) finds templates through this.
registerTraceTemplateSource((script, letter) => FILES[script]?.templates[letter] ?? null);
