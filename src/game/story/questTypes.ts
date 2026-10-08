import type { ZoneId } from "../world/zoneTypes";

/** Legacy FTUE ids (pre-#312 4-step saves); kept for save migration. */
export const LEGACY_QUEST_IDS = [
  "first-befriend",
  "first-spar",
  "reach-village",
  "shrine-craft",
] as const;

export type LegacyQuestId = (typeof LEGACY_QUEST_IDS)[number];

/**
 * #312 18-step spine ids (superseded by the 8-beat arc in #369). Kept only so
 * saves written by that build migrate onto the new beats.
 */
export const SPINE18_QUEST_IDS = [
  "first-befriend",
  "first-spar",
  "reach-village",
  "shrine-craft",
  "evolve-bramblewarden",
  "evolve-hearthflame",
  "open-village-gate",
  "odd-company",
  "hearth-lots",
  "bryn-ledger",
  "ward-crossing",
  "sable-thread",
  "loom-pattern",
  "craft-boat",
  "obtain-tide-sovereign",
  "obtain-cairn-sovereign",
  "craft-sovereign-seal",
  "fuse-horizon",
] as const;

export type Spine18QuestId = (typeof SPINE18_QUEST_IDS)[number];

/** #369 main arc: eight linear beats. */
export type QuestId =
  | "first-befriend"
  | "first-spar"
  | "shrine-craft"
  | "first-evolution"
  | "rival-wren"
  | "reach-mistwood"
  | "cinder-matriarch"
  | "shrine-finale";

export type QuestStatus = "locked" | "active" | "complete";

/** Scripted multi-round spars (rival / boss) — see story/storySpars.ts. */
export type StorySparId = "rival-wren" | "cinder-matriarch";

export type QuestObjective =
  | { type: "enter_zone"; zoneId: ZoneId }
  | { type: "befriend_creature" }
  | { type: "win_spar" }
  | { type: "craft_item" }
  /** Any shrine evolution when `evolvesTo` is omitted. */
  | { type: "evolve_creature"; evolvesTo?: string }
  | { type: "win_story_spar"; sparId: StorySparId }
  | { type: "story_finale" };

/** Short attributed line shown on the quest HUD (hybrid delivery). */
export type QuestNpcLine = {
  speaker: string;
  text: string;
};

export type QuestDefinition = {
  id: QuestId;
  title: string;
  hint: string;
  objective: QuestObjective;
  /** What completing the beat gives the player — appended to the completion toast. */
  payoff: string;
  unlocksOverworld?: boolean;
  npcLine?: QuestNpcLine;
};

export type QuestEvent =
  | { type: "enter_zone"; zoneId: ZoneId }
  | { type: "befriend_creature"; creatureId?: string }
  | { type: "win_spar" }
  | { type: "craft_item" }
  | { type: "evolve_creature"; evolvesTo: string }
  | { type: "win_story_spar"; sparId: StorySparId }
  | { type: "story_finale" };
