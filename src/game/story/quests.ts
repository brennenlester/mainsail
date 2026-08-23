import { HUNTER_MULTIPLIER } from "../creatures/folkloreTypes";
import type { QuestDefinition, QuestId } from "./questTypes";

export const QUEST_ORDER: QuestId[] = [
  "first-befriend",
  "first-spar",
  "reach-village",
  "shrine-craft",
];

export const QUESTS: Record<QuestId, QuestDefinition> = {
  "first-befriend": {
    id: "first-befriend",
    title: "Befriend a wild creature",
    hint: "Walk in a zone until a wild creature appears, then choose Befriend.",
    objective: { type: "befriend_creature" },
  },
  "first-spar": {
    id: "first-spar",
    title: "Win a training spar",
    hint: `Spar a wild creature: hunter types deal ×${HUNTER_MULTIPLIER} damage to their prey. Win to open the overworld gate.`,
    objective: { type: "win_spar" },
    unlocksOverworld: true,
  },
  "reach-village": {
    id: "reach-village",
    title: "Reach Hearth Crossing",
    hint: "Follow the paths through Moon Shrine to Hearth Crossing. The cottages sit east behind a code-locked gate.",
    objective: { type: "enter_zone", zoneId: "village" },
  },
  "shrine-craft": {
    id: "shrine-craft",
    title: "Craft a relic at Moon Shrine",
    hint: "Stand on the moon altar and press E, then craft any relic in the shrine.",
    objective: { type: "craft_item" },
  },
};
