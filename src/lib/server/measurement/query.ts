import { z } from "zod";
import type { FunderExport, ImpactQuery } from "@/lib/measurement/types";

/** The default window: the last 84 days (12 weeks), ending today (UTC). */
export const DEFAULT_WINDOW_DAYS = 84;

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && isoDay(new Date(`${value}T00:00:00Z`)) === value);
const QuerySchema = z.object({
  from: DateSchema.optional(),
  to: DateSchema.optional(),
  subject_id: z.string().uuid().optional(),
  path_id: z.string().uuid().optional(),
  split: z.enum(["none", "grade_band", "age_band", "subject", "mode"]).optional(),
  scope: z.string().regex(/^(all|(school|class):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/).optional(),
});

export type ParsedImpactQuery = ImpactQuery & { scope: string };

/** Parse and validate the impact query string (window <= 366 days, never in the future). */
export function parseImpactQuery(params: URLSearchParams, now = new Date()): { ok: true; query: ParsedImpactQuery } | { ok: false } {
  const raw = Object.fromEntries([...params.entries()].filter(([, value]) => value !== ""));
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const today = isoDay(now);
  const to = parsed.data.to ?? today;
  const from = parsed.data.from ?? isoDay(new Date(Date.parse(`${to}T00:00:00Z`) - (DEFAULT_WINDOW_DAYS - 1) * DAY));
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;
  if (to > today || from > to || span > 366) return { ok: false };
  return {
    ok: true,
    query: {
      from,
      to,
      subjectId: parsed.data.subject_id ?? null,
      pathId: parsed.data.path_id ?? null,
      split: parsed.data.split ?? "none",
      scope: parsed.data.scope ?? "all",
    },
  };
}

/** Parse the export window (same rules, no filters). */
export function parseExportQuery(params: URLSearchParams, now = new Date()): { ok: true; from: string; to: string; format: "json" | "csv" } | { ok: false } {
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return { ok: false };
  const window = parseImpactQuery(new URLSearchParams([...(params.get("from") ? [["from", params.get("from")!]] : []), ...(params.get("to") ? [["to", params.get("to")!]] : [])]), now);
  if (!window.ok) return { ok: false };
  return { ok: true, from: window.query.from, to: window.query.to, format };
}

/** One RFC 4180 field. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The funder export as long-format CSV (UTF-8 with a BOM, so spreadsheet apps
 * read Arabic): table_id,group,column,value,suppressed, one line per cell.
 */
export function funderExportCsv(data: FunderExport): string {
  const lines = [["table_id", "group", "column", "value", "suppressed"].join(",")];
  for (const table of data.tables) {
    for (const row of table.rows) {
      for (const column of table.columns) {
        lines.push([table.id, row.group ?? "", column.key, row[column.key] ?? null, row.suppressed === true].map(csvField).join(","));
      }
    }
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
