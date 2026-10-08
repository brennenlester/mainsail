import { HUNTER_MULTIPLIER } from "../creatures/folkloreTypes";
import type { QuestDefinition, QuestId } from "./questTypes";

/**
 * #369 main arc — eight beats sized for a ~20 minute Hybrid session.
 * Village asks, cottage minigames, daily asks, and the Sovereign voyage are
 * optional side threads (see story/sovereignVoyage.ts), never gates here.
 */
export const QUEST_ORDER: QuestId[] = [
  "first-befriend",
  "first-spar",
  "shrine-craft",
  "first-evolution",
  "rival-wren",
  "reach-mistwood",
  "cinder-matriarch",
  "shrine-finale",
];

export const QUESTS: Record<QuestId, QuestDefinition> = {
  "first-befriend": {
    id: "first-befriend",
    title: "Befriend your first companion",
    hint: "Walk in Whisper Grove until a wild creature appears, then choose Befriend.",
    objective: { type: "befriend_creature" },
    payoff: "a companion walks with you",
  },
  "first-spar": {
    id: "first-spar",
    title: "Win a training spar",
    hint: `Spar a wild creature: hunter types deal ×${HUNTER_MULTIPLIER} damage to their prey. Win to open the overworld gate.`,
    objective: { type: "win_spar" },
    payoff: "Overworld gate opened!",
    unlocksOverworld: true,
  },
  "shrine-craft": {
    id: "shrine-craft",
    title: "Craft a relic at Moon Shrine",
    hint: "Walk east to the Moon Shrine and press E at the moon altar (it heals your party, and once gives Moss Fiber, Ember Ash and Folklore Dust if you are short). On Craft, make Moss Salve (Moss Fiber ×2 + Folklore Dust) or Ember Charm (Ember Ash ×2 + Folklore Dust).",
    objective: { type: "craft_item" },
    payoff: "the shrine answers your craft",
    npcLine: {
      speaker: "Weaver Sable",
      text: "First relic at the Moon Shrine settles the path. Any offering counts.",
    },
  },
  "first-evolution": {
    id: "first-evolution",
    title: "Grow your first companion",
    hint: "At the Moon Shrine altar (press E), open the Fusion tab and apply Moss Salve to Mossling or Ember Charm to Ember Wisp. No relic? Craft one on Craft (the altar gives the materials once if you are short). Missing a Grove companion? Warden Bryn's cottage gate is open now.",
    objective: { type: "evolve_creature" },
    payoff: "your companion grew — and the cottage gate in Hearth Crossing opened",
    npcLine: {
      speaker: "Weaver Sable",
      text: "Moss and ember both remember what they could become. Give them the shrine's nudge.",
    },
  },
  "rival-wren": {
    id: "rival-wren",
    title: "Beat Wren, the rival",
    hint: "Find Wren in the Hearth Crossing plaza and accept her spar — she fights with two companions, one after the other.",
    objective: { type: "win_story_spar", sparId: "rival-wren" },
    payoff: "the Mistwood path opens east of Folklore Fields",
    npcLine: {
      speaker: "Wren",
      text: "You're the one the shrine keeps humming about? Prove it. Plaza. Now.",
    },
  },
  "reach-mistwood": {
    id: "reach-mistwood",
    title: "Walk the Mistwood path",
    hint: "Go north through the village gate into Folklore Fields, then take the east path into Mistwood Reach.",
    objective: { type: "enter_zone", zoneId: "mistwood" },
    payoff: "new creatures wander the mist",
    npcLine: {
      speaker: "Wren",
      text: "East edge of the Fields. The mist was sealed for anyone who couldn't beat me.",
    },
  },
  "cinder-matriarch": {
    id: "cinder-matriarch",
    title: "Face the Cinder Matriarch",
    hint: "Cross Mistwood into Emberfen Hollow and challenge the Matriarch. She announces each form before it rises — swap in a companion that hunts it.",
    objective: { type: "win_story_spar", sparId: "cinder-matriarch" },
    payoff: "the fen cools — Wren is waiting at the Moon Shrine",
    npcLine: {
      speaker: "Wren",
      text: "Watch what she turns into before you pick who stands in front.",
    },
  },
  "shrine-finale": {
    id: "shrine-finale",
    title: "Return to the Moon Shrine",
    hint: "Walk back to the Moon Shrine and talk to Wren.",
    objective: { type: "story_finale" },
    payoff: "the main story is complete — the Sovereign voyage waits across the sea",
  },
};

/** One-line temperament for the first-companion toast (beat 1 payoff). */
const COMPANION_TEMPERAMENTS: Readonly<Record<string, string>> = {
  mossling: "shy, stubborn, and loyal to the moss",
  "ember-wisp": "restless, bright, and fond of warm hands",
  "brook-nymph": "curious, quick to laugh, slow to forgive splashes",
};

export function formatCompanionJoinNote(creatureName: string, creatureId: string): string {
  const temperament = COMPANION_TEMPERAMENTS[creatureId] ?? "quiet, watchful, and already yours";
  return `${creatureName} joins — ${temperament}`;
}
