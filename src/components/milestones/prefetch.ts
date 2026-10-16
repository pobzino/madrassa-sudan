import type { BossKey, GetBattleResponse, Lang, MilestoneIntroResponse, StartBattleResponse } from "@/lib/milestones/types";
import { BOSS_KEYS } from "@/lib/milestones/types";
import { milestoneApi, type Fetcher } from "./api";

/**
 * Warm caches so the Big Challenge rarely shows a loading screen:
 *  - the intro's data is fetched once and reused by the battle page;
 *  - pressing Play starts (or resumes) the battle right away, before the
 *    route change, and the battle page picks up that same request;
 *  - the boss's key is remembered per milestone so even a loading line can
 *    say "Getting Numbo ready...".
 */
const INTRO_TTL_MS = 60_000;
const intros = new Map<string, { at: number; promise: Promise<MilestoneIntroResponse> }>();
const starts = new Map<string, Promise<StartBattleResponse>>();

const introKey = (milestoneId: string, lang: Lang) => `${milestoneId}:${lang}`;

export function loadIntro(fetcher: Fetcher, milestoneId: string, lang: Lang): Promise<MilestoneIntroResponse> {
  const key = introKey(milestoneId, lang);
  const cached = intros.get(key);
  if (cached && Date.now() - cached.at < INTRO_TTL_MS) return cached.promise;
  const promise = milestoneApi.intro(fetcher, milestoneId, lang).then((intro) => {
    rememberBoss(milestoneId, intro.milestone.bossKey);
    return intro;
  });
  promise.catch(() => intros.delete(key));
  intros.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * Warm the battle for a milestone (its node was selected on the path): the
 * intro data and the current battle, so tapping Battle! opens it at once.
 * Never starts an attempt.
 */
const WARM_TTL_MS = 20_000;
const warm = new Map<string, { at: number; promise: Promise<GetBattleResponse> }>();
export function warmBattle(fetcher: Fetcher, milestoneId: string, lang: Lang) {
  void loadIntro(fetcher, milestoneId, lang).catch(() => undefined);
  const cached = warm.get(milestoneId);
  if (cached && Date.now() - cached.at < WARM_TTL_MS) return;
  const promise = milestoneApi.getBattle(fetcher, milestoneId, lang);
  promise.catch(() => warm.delete(milestoneId));
  warm.set(milestoneId, { at: Date.now(), promise });
}

/** The battle page takes the warmed battle (once, while fresh), if there is one. */
export function takeWarmBattle(milestoneId: string): Promise<GetBattleResponse> | null {
  const cached = warm.get(milestoneId);
  warm.delete(milestoneId);
  return cached && Date.now() - cached.at < WARM_TTL_MS ? cached.promise : null;
}

/** Start (or resume) the battle now, e.g. on the tap that opens it. */
export function startBattleEarly(fetcher: Fetcher, milestoneId: string, lang: Lang): Promise<StartBattleResponse> {
  const promise = milestoneApi.startBattle(fetcher, milestoneId, lang);
  // Unclaimed failures are re-tried by the battle page's own request.
  promise.catch(() => starts.delete(milestoneId));
  starts.set(milestoneId, promise);
  return promise;
}

/** The battle page takes the early start (once), if there is one. */
export function takeEarlyStart(milestoneId: string): Promise<StartBattleResponse> | null {
  const promise = starts.get(milestoneId) ?? null;
  starts.delete(milestoneId);
  return promise;
}

const BOSS_MEMORY = "amal-milestone-boss:";

export function rememberBoss(milestoneId: string, bossKey: BossKey) {
  try {
    sessionStorage.setItem(BOSS_MEMORY + milestoneId, bossKey);
  } catch {
    // Storage can be blocked; the loading line just stays generic.
  }
}

export function recallBoss(milestoneId: string): BossKey | null {
  try {
    const value = sessionStorage.getItem(BOSS_MEMORY + milestoneId);
    return value && (BOSS_KEYS as readonly string[]).includes(value) ? (value as BossKey) : null;
  } catch {
    return null;
  }
}
