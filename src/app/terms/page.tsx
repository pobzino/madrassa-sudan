import fs from "fs";
import path from "path";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Amal School",
  description: "Terms of service for Amal School — rules and guidelines for using the platform.",
};

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const html: string[] = [];
  let inTable = false;
  let inList = false;
  let listType: "ul" | "ol" = "ul";

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (i === 0 && line.startsWith("# ")) continue;
    if (i === 1 && line.startsWith("**Last Updated")) continue;
    if (i === 2 && line.trim() === "") continue;

    if (inTable && !line.startsWith("|")) {
      html.push("</tbody></table></div>");
      inTable = false;
    }

    if (inList && !line.match(/^(\d+\.\s|-\s|\s+-\s|\s+\d+\.\s)/)) {
      html.push(`</${listType}>`);
      inList = false;
    }

    if (line.startsWith("## ")) {
      html.push(`<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">${formatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3 class="text-lg font-semibold text-gray-800 mt-6 mb-2">${formatInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("#### ")) {
      html.push(`<h4 class="text-base font-semibold text-gray-700 mt-4 mb-1">${formatInline(line.slice(5))}</h4>`);
      continue;
    }

    if (line.trim() === "---") {
      html.push('<hr class="my-6 border-gray-200" />');
      continue;
    }

    if (line.startsWith("|")) {
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      if (!inTable) {
        inTable = true;
        html.push('<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-gray-200 rounded-xl overflow-hidden">');
        html.push(`<thead class="bg-gray-50"><tr>${cells.map((c) => `<th class="px-4 py-2 text-start font-semibold text-gray-700 border-b border-gray-200">${formatInline(c)}</th>`).join("")}</tr></thead><tbody>`);
        continue;
      }
      if (cells.every((c) => c.match(/^[-:]+$/))) continue;
      html.push(`<tr class="border-b border-gray-100">${cells.map((c) => `<td class="px-4 py-2 text-gray-600">${formatInline(c)}</td>`).join("")}</tr>`);
      continue;
    }

    const listMatch = line.match(/^(\s*)(-|\d+\.)\s+(.*)/);
    if (listMatch) {
      const newType = listMatch[2] === "-" ? "ul" : "ol";
      if (!inList) {
        inList = true;
        listType = newType;
        html.push(`<${listType} class="list-${listType === "ul" ? "disc" : "decimal"} ps-5 my-2 space-y-1 text-gray-600">`);
      }
      html.push(`<li>${formatInline(listMatch[3])}</li>`);
      continue;
    }

    if (line.trim() === "") continue;

    html.push(`<p class="text-gray-600 my-2 leading-relaxed">${formatInline(line)}</p>`);
  }

  if (inTable) html.push("</tbody></table></div>");
  if (inList) html.push(`</${listType}>`);

  return <div dangerouslySetInnerHTML={{ __html: html.join("\n") }} />;
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-800">$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-emerald-700 underline hover:text-emerald-800" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm">$1</code>');
}

export default function TermsPage() {
  const filePath = path.join(process.cwd(), "docs", "TERMS.md");
  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to home
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10">
          <div className="mb-8 pb-6 border-b border-gray-100">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
            <p className="text-sm text-gray-500">Last Updated: February 24, 2026</p>
          </div>

          <MarkdownContent content={content} />
        </div>
      </div>
    </div>
  );
}
