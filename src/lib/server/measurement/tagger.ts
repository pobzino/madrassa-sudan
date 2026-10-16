import "server-only";

import { AI_MODEL_FAST, getOpenAIClient } from "@/lib/ai/openai-client";
import type { Difficulty } from "@/lib/measurement/types";
import { DIFFICULTY_SCALE } from "@/lib/server/milestones/item-generator";
import { describeForChild } from "@/lib/server/milestones/item-verifier";
import type { BattleInteraction } from "@/lib/server/milestones/interactions";

// Tags existing pool items (the backfill, teacher-added items) with a skill and a
// difficulty: one structured call on the fast model per <= 20 items.

export const TAGGER_BATCH_SIZE = 20;

export interface TagRequest {
  items: BattleInteraction[];
  subjectName: string;
  gradeLevel: number;
  /** The subject's assessable skills. */
  skills: Array<{ key: string; label: string }>;
}
export interface ItemTag { index: number; skillKey: string | null; difficulty: Difficulty | null }
export type ItemTagger = (request: TagRequest) => Promise<ItemTag[]>;

export function taggerSchema(skillKeys: readonly string[]) {
  const keys = [...new Set(skillKeys.filter(Boolean))];
  const properties = {
    index: { type: "integer" },
    skill_key: keys.length ? { type: "string", enum: keys } : { type: "string" },
    difficulty: { type: "integer", enum: [1, 2, 3] },
  };
  return {
    type: "object",
    properties: {
      tags: { type: "array", items: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } },
    },
    required: ["tags"],
    additionalProperties: false,
  } as const;
}

/** One model call for one batch (<= TAGGER_BATCH_SIZE items). */
export const tagBatchWithModel: ItemTagger = async (request) => {
  if (!request.items.length) return [];
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OpenAI is not configured for tagging.");
  const items = request.items.map((item, index) => `ITEM ${index}: ${describeForChild(item, index)}`).join("\n");
  const prompt = `Tag each quick game item for children (subject: ${request.subjectName}, grade ${request.gradeLevel}).

SKILLS (pick the one each item checks)
${request.skills.map((skill) => `- ${skill.key}: ${skill.label}`).join("\n")}

DIFFICULTY
${DIFFICULTY_SCALE.map((line) => `- ${line}`).join("\n")}

ITEMS
${items}

Return one tag per item, using its index.`;
  const completion = await openai.chat.completions.create({
    model: AI_MODEL_FAST,
    messages: [
      { role: "system", content: "You are a careful primary-curriculum reviewer. Tag honestly." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: "item_tags", strict: true, schema: taggerSchema(request.skills.map((skill) => skill.key)) } },
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Tagging returned no content.");
  const parsed = JSON.parse(text) as { tags?: Array<Record<string, unknown>> };
  return normaliseTags(parsed.tags ?? [], request.items.length, request.skills.map((skill) => skill.key));
};

/** Keep one valid tag per index; an unknown skill or a difficulty outside 1-3 becomes null. */
export function normaliseTags(raw: ReadonlyArray<Record<string, unknown>>, count: number, skillKeys: readonly string[]): ItemTag[] {
  const known = new Set(skillKeys);
  const byIndex = new Map<number, ItemTag>();
  for (const tag of raw) {
    const index = Number(tag.index);
    if (!Number.isInteger(index) || index < 0 || index >= count || byIndex.has(index)) continue;
    const skill = typeof tag.skill_key === "string" && known.has(tag.skill_key) ? tag.skill_key : null;
    const difficulty = tag.difficulty === 1 || tag.difficulty === 2 || tag.difficulty === 3 ? tag.difficulty : null;
    byIndex.set(index, { index, skillKey: skill, difficulty });
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * Tag any number of items in batches of 20 (sequential: a retag is a staff action).
 * `tagBatch` is injectable for tests.
 */
export async function tagItemsWithModel(
  { items, subjectName, gradeLevel, skills }: TagRequest,
  tagBatch: ItemTagger = tagBatchWithModel,
): Promise<ItemTag[]> {
  const tags: ItemTag[] = [];
  for (let start = 0; start < items.length; start += TAGGER_BATCH_SIZE) {
    const batch = items.slice(start, start + TAGGER_BATCH_SIZE);
    const result = await tagBatch({ items: batch, subjectName, gradeLevel, skills });
    const raw = result.map((tag) => ({ index: tag.index, skill_key: tag.skillKey, difficulty: tag.difficulty }));
    for (const tag of normaliseTags(raw, batch.length, skills.map((skill) => skill.key))) {
      tags.push({ ...tag, index: tag.index + start });
    }
  }
  return tags;
}
