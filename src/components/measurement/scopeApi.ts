// School / class progress visibility: the app's calls. The shapes are the
// shared contract in src/lib/measurement/types.ts (server-owned).
//
// Visibility rule (owner): the owner parent (or adult self) and admins always;
// teachers only for children in their own classes (approved, active members);
// school admins for classes in their school; children in no class/school ->
// admins + parent only. The server enforces it; the app only asks.
import type {
  ClassProgressResponse,
  ImpactScopesResponse,
  JoinClassRequest,
  JoinClassResponse,
  LeaveClassRequest,
  LearnerClassesResponse,
  SchoolOverviewResponse,
} from "@/lib/measurement/types";

export type {
  ClassChildProgress,
  ClassProgressResponse,
  ClassSubjectBands,
  ImpactScope,
  ImpactScopeOption,
  LearnerClass,
  SchoolOverviewResponse,
} from "@/lib/measurement/types";
export { scopeParam } from "@/lib/measurement/types";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw Object.assign(new Error(body?.error ?? String(res.status)), { status: res.status, code: body?.error ?? "unknown", serverMessage: body?.message ?? null });
  }
  return (await res.json()) as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });

export const scopeApi = {
  learnerClasses: (f: Fetcher, learnerId: string) =>
    f(`/api/learners/${encodeURIComponent(learnerId)}/classes`, { cache: "no-store" }).then((r) => json<LearnerClassesResponse>(r)),
  joinClass: (f: Fetcher, body: JoinClassRequest) => f("/api/learners/classes/join", post(body)).then((r) => json<JoinClassResponse>(r)),
  leaveClass: (f: Fetcher, body: LeaveClassRequest) => f("/api/learners/classes/leave", post(body)).then((r) => json<{ ok: true }>(r)),
  classProgress: (f: Fetcher, cohortId: string) =>
    f(`/api/teacher/cohorts/${encodeURIComponent(cohortId)}/progress`, { cache: "no-store" }).then((r) => json<ClassProgressResponse>(r)),
  schoolOverview: (f: Fetcher) => f("/api/school/overview", { cache: "no-store" }).then((r) => json<SchoolOverviewResponse>(r)),
  impactScopes: (f: Fetcher) => f("/api/teacher/measurement/scopes", { cache: "no-store" }).then((r) => json<ImpactScopesResponse>(r)),
};

/** A join code as typed: trimmed, spaces removed, upper case. */
export function normaliseJoinCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
