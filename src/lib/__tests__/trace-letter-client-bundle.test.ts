import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// The full trace templates (~70 KB, 1.1 MB before compaction) are for server
// grading only. Browsers load one letter at a time from
// public/trace-letter/templates. This walks the import graph from every
// "use client" module and fails if any of them can reach the template JSON.

const SRC = path.resolve(__dirname, "..", "..");
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".json"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null; // a package
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) if (existsSync(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`);
  return null;
}

/** Runtime imports only: `import type` / `export type` vanish at build time. */
function importsOf(file: string): string[] {
  if (file.endsWith(".json")) return [];
  const text = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of text.matchAll(pattern)) {
    if (match[1]) continue;
    // `import { type A, type B } from "x"` (nothing else) is type-only too.
    const braces = /^\s*(?:import|export)\s*\{([^}]*)\}\s*from/.exec(match[0].trim());
    if (braces) {
      const names = braces[1].split(",").map((name) => name.trim()).filter(Boolean);
      if (names.length && names.every((name) => name.startsWith("type "))) continue;
    }
    specifiers.push(match[2] ?? match[3]);
  }
  return specifiers;
}

const isTemplateModule = (file: string) =>
  /trace-templates[\\/](ar|en)\.json$/.test(file) || /trace-templates\.server\.ts$/.test(file);

function reachableFrom(entry: string): Map<string, string> {
  // file -> the file that imported it (for the failure message)
  const seen = new Map<string, string>([[entry, ""]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const specifier of importsOf(file)) {
      const target = resolveImport(file, specifier);
      if (!target || seen.has(target)) continue;
      seen.set(target, file);
      queue.push(target);
    }
  }
  return seen;
}

describe("letter-tracing templates stay out of the client bundle", () => {
  const clientEntries = walk(SRC).filter((file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8")));

  it("finds the client components that trace letters", () => {
    const names = clientEntries.map((file) => path.relative(SRC, file));
    expect(names).toContain(path.join("components", "interactions", "TraceLetterInput.tsx"));
    expect(names).toContain(path.join("components", "milestones", "moves", "TraceRune.tsx"));
    expect(names).toContain(path.join("components", "lessons", "SlideInteractionOverlay.tsx"));
  });

  it("no client module imports trace-templates/*.json (directly or through other modules)", () => {
    const leaks: string[] = [];
    for (const entry of clientEntries) {
      const graph = reachableFrom(entry);
      for (const [file] of graph) {
        if (!isTemplateModule(file)) continue;
        const chain = [file];
        let at = graph.get(file);
        while (at) {
          chain.unshift(at);
          at = graph.get(at);
        }
        leaks.push(chain.map((f) => path.relative(SRC, f)).join(" -> "));
      }
    }
    expect(leaks).toEqual([]);
  });

  it("the server template module is marked server-only", () => {
    const text = readFileSync(path.join(SRC, "lib", "interactions", "trace-templates.server.ts"), "utf8");
    expect(text).toMatch(/^import "server-only";/);
  });

  it("detects a leak (the check itself works)", () => {
    const graph = reachableFrom(path.join(SRC, "lib", "homework-grading.ts"));
    expect([...graph.keys()].some(isTemplateModule)).toBe(true);
  });
});
