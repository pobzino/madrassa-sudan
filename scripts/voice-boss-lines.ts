// Records every boss line (src/components/milestones/bossLines.ts) with
// ElevenLabs, one voice per boss, into public/audio/boss/<boss>/<lang>/<kind>-<n>.mp3.
// Skips files that already exist, so re-running only records new or changed lines.
//
//   ELEVENLABS_API_KEY=... npx tsx scripts/voice-boss-lines.ts [--dry] [--boss number_giant] [--lang en]
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { BOSS_LINES, BOSS_LINE_KINDS, type BossLineKind } from "../src/components/milestones/bossLines";
import type { BossKey } from "../src/lib/milestones/types";

const MODEL_ID = "eleven_multilingual_v2";
/** One ElevenLabs voice per boss: a character, not the narrator. */
const BOSS_VOICES: Record<BossKey, { voiceId: string; name: string; stability: number; style: number }> = {
  number_giant: { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", stability: 0.35, style: 0.55 },
  word_dragon: { voiceId: "IKne3meq5aSn9XLyUdCD", name: "Charlie", stability: 0.4, style: 0.5 },
  letter_dragon: { voiceId: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", stability: 0.4, style: 0.45 },
  letter_camel: { voiceId: "8wLXLt5CA7rwQP1ekjBR", name: "Tom Hassan", stability: 0.45, style: 0.4 },
  sprout_buddy: { voiceId: "cgSgspJ2msm6clMCkdW9", name: "Jessica", stability: 0.4, style: 0.55 },
  puzzle_owlet: { voiceId: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", stability: 0.35, style: 0.6 },
};

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyBoss = args[args.indexOf("--boss") + 1] as BossKey | undefined;
const onlyLang = args[args.indexOf("--lang") + 1] as "ar" | "en" | undefined;
const key = process.env.ELEVENLABS_API_KEY;
if (!key && !dry) {
  console.error("ELEVENLABS_API_KEY is not set");
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "public", "audio", "boss");

async function record(voice: (typeof BOSS_VOICES)[BossKey], text: string, lang: "ar" | "en"): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_96`, {
    method: "POST",
    headers: { "xi-api-key": key!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      language_code: lang,
      voice_settings: { stability: voice.stability, similarity_boost: 0.8, style: voice.style, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  let planned = 0;
  let recorded = 0;
  let chars = 0;
  let failed = 0;
  for (const bossKey of Object.keys(BOSS_LINES) as BossKey[]) {
    if (onlyBoss && bossKey !== onlyBoss && args.includes("--boss")) continue;
    const voice = BOSS_VOICES[bossKey];
    for (const lang of ["en", "ar"] as const) {
      if (onlyLang && lang !== onlyLang && args.includes("--lang")) continue;
      const dir = path.join(root, bossKey, lang);
      mkdirSync(dir, { recursive: true });
      for (const kind of BOSS_LINE_KINDS as BossLineKind[]) {
        const lines = BOSS_LINES[bossKey][kind];
        for (let i = 0; i < lines.length; i += 1) {
          const text = lines[i][lang];
          const file = path.join(dir, `${kind}-${i}.mp3`);
          const stamp = path.join(dir, `${kind}-${i}.txt`);
          const hash = createHash("sha1").update(`${MODEL_ID}:${voice.voiceId}:${text}`).digest("hex");
          planned += 1;
          // Already recorded for this exact text and voice.
          if (existsSync(file) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === hash) continue;
          chars += text.length;
          if (dry) continue;
          try {
            const audio = await record(voice, text, lang);
            writeFileSync(file, audio);
            writeFileSync(stamp, hash + "\n");
            recorded += 1;
            process.stdout.write(`${bossKey}/${lang}/${kind}-${i} ${audio.length}b\n`);
          } catch (error) {
            failed += 1;
            console.error(`FAILED ${bossKey}/${lang}/${kind}-${i}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }
  console.log(JSON.stringify({ planned, recorded, failed, charsToBill: chars, dry }));
}

void main();
