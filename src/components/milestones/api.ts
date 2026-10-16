import type {
  AnswerRequest,
  AnswerResult,
  BattleState,
  CertificateView,
  GetBattleResponse,
  HintRequest,
  HintResponse,
  Lang,
  MilestoneError,
  MilestoneErrorCode,
  MilestoneIntroResponse,
  StartBattleResponse,
} from "@/lib/milestones/types";

/** `fetchWithLearner` on learner pages; plain `fetch` for the certificate. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** The request never reached the server (no connection, dropped). */
export class MilestoneNetworkError extends Error {
  constructor() {
    super("network");
  }
}

export class MilestoneApiError extends Error {
  constructor(
    public status: number,
    public code: MilestoneErrorCode | "unknown",
    public battle: BattleState | null,
    /** The server's own (localized, child-friendly) words, when it sends them. */
    public serverMessage: string | null = null
  ) {
    super(code);
  }
}

async function request<T>(fetcher: Fetcher, url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { cache: "no-store", ...init });
  } catch {
    throw new MilestoneNetworkError();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as MilestoneError | null;
    throw new MilestoneApiError(response.status, body?.error ?? "unknown", body?.battle ?? null, body?.message ?? null);
  }
  try {
    return (await response.json()) as T;
  } catch {
    // A captive portal or a cut-off body: treat it like no connection.
    throw new MilestoneNetworkError();
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const milestoneApi = {
  intro: (fetcher: Fetcher, milestoneId: string, lang: Lang) =>
    request<MilestoneIntroResponse>(fetcher, `/api/milestones/${encodeURIComponent(milestoneId)}?lang=${lang}`),
  getBattle: (fetcher: Fetcher, milestoneId: string, lang: Lang) =>
    request<GetBattleResponse>(fetcher, `/api/milestones/${encodeURIComponent(milestoneId)}/battle?lang=${lang}`),
  startBattle: (fetcher: Fetcher, milestoneId: string, lang: Lang) =>
    request<StartBattleResponse>(fetcher, `/api/milestones/${encodeURIComponent(milestoneId)}/battle`, json({ lang })),
  answer: (fetcher: Fetcher, battleId: string, answer: AnswerRequest, lang: Lang) =>
    request<AnswerResult>(fetcher, `/api/milestones/battles/${encodeURIComponent(battleId)}/answer`, json({ ...answer, lang })),
  audio: async (fetcher: Fetcher, battleId: string, position: number, lang: Lang): Promise<string | null> => {
    try {
      const body = await request<{ audio_url?: string }>(
        fetcher,
        `/api/milestones/battles/${encodeURIComponent(battleId)}/questions/${position}/audio`,
        json({ lang })
      );
      return body.audio_url ?? null;
    } catch {
      return null;
    }
  },
  /** The one Owl hint per battle, for the current question (display indexes). */
  hint: (fetcher: Fetcher, milestoneId: string, position: number, lang: Lang) =>
    request<HintResponse>(
      fetcher,
      `/api/milestones/${encodeURIComponent(milestoneId)}/battle/hint`,
      json({ position, lang } satisfies HintRequest)
    ),
  certificate: (fetcher: Fetcher, certificateId: string) =>
    request<CertificateView>(fetcher, `/api/certificates/${encodeURIComponent(certificateId)}`),
};
