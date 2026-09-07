import type { ZoneId } from "../world/zoneTypes";

/** Legacy FTUE ids (steps 1–4); kept for save migration and existing call sites. */
export const LEGACY_QUEST_IDS = [
  "first-befriend",
  "first-spar",
  "reach-village",
  "shrine-craft",
] as const;

export type LegacyQuestId = (typeof LEGACY_QUEST_IDS)[number];

export type QuestId =
  | LegacyQuestId
  | "evolve-bramblewarden"
  | "evolve-hearthflame"
  | "open-village-gate"
  | "odd-company"
  | "hearth-lots"
  | "bryn-ledger"
  | "ward-crossing"
  | "sable-thread"
  | "loom-pattern"
  | "craft-boat"
  | "obtain-tide-sovereign"
  | "obtain-cairn-sovereign"
  | "craft-sovereign-seal"
  | "fuse-horizon";

export type QuestStatus = "locked" | "active" | "complete";

export type MinigameQuestId = "hearth-lots" | "ward-crossing" | "loom-pattern";

export type QuestObjective =
  | { type: "enter_zone"; zoneId: ZoneId }
  | { type: "befriend_creature" }
  | { type: "win_spar" }
  | { type: "craft_item" }
  | { type: "evolve_creature"; evolvesTo: string }
  | { type: "unlock_village_gate" }
  | { type: "party_size"; count: number }
  | { type: "complete_minigame"; minigameId: MinigameQuestId }
  | { type: "discover_creatures"; count: number }
  | {
      type: "deliver_materials";
      materials: { id: string; amount: number }[];
    }
  | { type: "craft_item_id"; itemId: string }
  | { type: "obtain_creature"; creatureId: string }
  | { type: "fuse_horizon" };

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
  unlocksOverworld?: boolean;
  npcLine?: QuestNpcLine;
};

export type QuestEvent =
  | { type: "enter_zone"; zoneId: ZoneId }
  | { type: "befriend_creature" }
  | { type: "win_spar" }
  | { type: "craft_item" }
  | { type: "evolve_creature"; evolvesTo: string }
  | { type: "unlock_village_gate" }
  | { type: "party_size"; count: number }
  | { type: "complete_minigame"; minigameId: MinigameQuestId }
  | { type: "discover_creatures"; count: number }
  | { type: "deliver_materials" }
  | { type: "craft_item_id"; itemId: string }
  | { type: "obtain_creature"; creatureId: string }
  | { type: "fuse_horizon" };
