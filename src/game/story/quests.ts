import { HUNTER_MULTIPLIER } from "../creatures/folkloreTypes";
import type { QuestDefinition, QuestId } from "./questTypes";

export const QUEST_ORDER: QuestId[] = [
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
    hint: "Follow the paths through Moon Shrine to the Hearth Crossing plaza.",
    objective: { type: "enter_zone", zoneId: "village" },
    npcLine: {
      speaker: "Hearthkeep Odd",
      text: "Keep on through the shrine. The Crossing plaza is ahead — east cottages keep to themselves a while yet.",
    },
  },
  "shrine-craft": {
    id: "shrine-craft",
    title: "Craft a relic at Moon Shrine",
    hint: "Stand on the moon altar and press E, then craft any relic in the shrine.",
    objective: { type: "craft_item" },
    npcLine: {
      speaker: "Weaver Sable",
      text: "First relic at the Moon Shrine settles the path. Any offering counts.",
    },
  },
  "evolve-bramblewarden": {
    id: "evolve-bramblewarden",
    title: "Grow a Bramblewarden",
    hint: "Craft Moss Salve at the Moon Shrine and apply it to a Mossling.",
    objective: { type: "evolve_creature", evolvesTo: "bramblewarden" },
  },
  "evolve-hearthflame": {
    id: "evolve-hearthflame",
    title: "Grow a Hearthflame",
    hint: "Craft Ember Charm at the Moon Shrine and apply it to an Ember Wisp.",
    objective: { type: "evolve_creature", evolvesTo: "hearthflame" },
  },
  "open-village-gate": {
    id: "open-village-gate",
    title: "Open the cottage gate",
    hint: "Return to Hearth Crossing — the east cottage gate opens for your party.",
    objective: { type: "unlock_village_gate" },
  },
  "odd-company": {
    id: "odd-company",
    title: "Company for the road",
    hint: "Travel with three companions, then speak with Hearthkeep Odd in the village.",
    objective: { type: "party_size", count: 3 },
  },
  "hearth-lots": {
    id: "hearth-lots",
    title: "Tend the Hearth Lots",
    hint: "Enter Odd's cottage and complete the Hearth Lots minigame.",
    objective: { type: "complete_minigame", minigameId: "hearth-lots" },
  },
  "bryn-ledger": {
    id: "bryn-ledger",
    title: "Fill the ledger",
    hint: "Bring word of five different creatures to Warden Bryn.",
    objective: { type: "discover_creatures", count: 5 },
  },
  "ward-crossing": {
    id: "ward-crossing",
    title: "Ward the Crossing",
    hint: "Enter Bryn's cottage and complete the Ward the Crossing minigame.",
    objective: { type: "complete_minigame", minigameId: "ward-crossing" },
  },
  "sable-thread": {
    id: "sable-thread",
    title: "Thread for the loom",
    hint: "Bring Wood ×5 and Wild Fiber ×3 to Weaver Sable.",
    objective: {
      type: "deliver_materials",
      materials: [
        { id: "wood", amount: 5 },
        { id: "wild-fiber", amount: 3 },
      ],
    },
  },
  "loom-pattern": {
    id: "loom-pattern",
    title: "Weave the pattern",
    hint: "Enter Sable's cottage and complete the Loom Pattern minigame.",
    objective: { type: "complete_minigame", minigameId: "loom-pattern" },
  },
  "craft-boat": {
    id: "craft-boat",
    title: "Craft a boat",
    hint: "Craft a Boat at the Moon Shrine or inventory grid, then carry it to the harbor.",
    objective: { type: "craft_item_id", itemId: "boat" },
  },
  "obtain-tide-sovereign": {
    id: "obtain-tide-sovereign",
    title: "Claim the Tide Sovereign",
    hint: "Sail to the hermit's island and befriend or spar-win the Tide Sovereign.",
    objective: { type: "obtain_creature", creatureId: "tide-sovereign" },
  },
  "obtain-cairn-sovereign": {
    id: "obtain-cairn-sovereign",
    title: "Claim the Stone Sovereign",
    hint: "From the hermit's island, sail due south to the gray stone cairn isle — not east. Befriend or spar-win the Stone Sovereign there.",
    objective: { type: "obtain_creature", creatureId: "cairn-sovereign" },
  },
  "craft-sovereign-seal": {
    id: "craft-sovereign-seal",
    title: "Craft a Sovereign Seal",
    hint: "Craft a Sovereign Seal on the Moon Shrine altar pattern.",
    objective: { type: "craft_item_id", itemId: "sovereign-seal" },
  },
  "fuse-horizon": {
    id: "fuse-horizon",
    title: "Fuse a Horizon Sovereign",
    hint: "Return to the Moon Shrine with Tide and Stone Sovereigns and fuse them.",
    objective: { type: "fuse_horizon" },
  },
};
