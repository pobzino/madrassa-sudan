import type { BossKey } from "../types";
import { harf } from "./harf";
import { harfi } from "./harfi";
import { numbo } from "./numbo";
import { owlet } from "./owlet";
import { sprouty } from "./sprouty";
import type { BossDef } from "./types";
import { wordy } from "./wordy";

export type { BossDef } from "./types";

export const BOSSES: Record<BossKey, BossDef> = {
  number_giant: numbo,
  letter_dragon: harf,
  word_dragon: wordy,
  letter_camel: harfi,
  sprout_buddy: sprouty,
  puzzle_owlet: owlet,
};
