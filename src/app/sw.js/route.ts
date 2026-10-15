import { readFileSync } from "node:fs";
import path from "node:path";

// Built once per deploy: the service worker with this build's version stamped
// in, so each deploy changes the worker's bytes, which makes browsers install
// it and fill fresh shell and static caches.
export const dynamic = "force-static";

const TEMPLATE_PATH = path.join(process.cwd(), "src/sw/service-worker.template.js");
const VERSION_PLACEHOLDER = "'__AMAL_VERSION__'";

// It ends up in cache names and a JS string literal.
function sanitize(value: string | undefined): string {
  return (value ?? "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
}

function workerVersion(): string {
  for (const candidate of [process.env.NEXT_PUBLIC_RUNTIME_VERSION, process.env.COMMIT_REF]) {
    const version = sanitize(candidate);
    // The build script writes the literal "dev" when git isn't available.
    if (!version || version === "dev") continue;
    // Netlify's deploy id: a rebuild of the same commit can still produce new
    // build files, so it gets a fresh worker too.
    const deploy = sanitize(process.env.DEPLOY_ID);
    return deploy ? `${version.slice(0, 12)}-${deploy}`.slice(0, 64) : version;
  }
  return "dev";
}

export function GET() {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  // Fail the build rather than ship a worker whose caches never turn over.
  if (!template.includes(VERSION_PLACEHOLDER)) {
    throw new Error(`${TEMPLATE_PATH} no longer contains ${VERSION_PLACEHOLDER}`);
  }

  const script = template.replaceAll(VERSION_PLACEHOLDER, JSON.stringify(workerVersion()));
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Browsers revalidate the worker on every check, so a deploy is picked up
      // on the next visit.
      "Cache-Control": "no-cache",
    },
  });
}
