import { addToParty, playerParty } from "../creatures/party";
import { getPartyAverageLevel } from "../progression/wildLevel";
import { FINALE_HATCHLING } from "./storySpars";

/**
 * Beat 8 shrine scene (#385): a short scripted DialogueScene beat. Each line
 * may carry a presentation cue (story/storyCueFx.ts). The Matriarch's ember
 * egg hatches into Cinderling before Wren names the voyage / Eclipse hook.
 */
export type StoryCue = "moonlight" | "embers" | "hatch" | "sea";

/**
 * Emitted on `game.events` when the shrine finale dialogue closes, after the
 * hatch and the voyage hook (#385). The finale credits / share card (#393)
 * listens for it; nothing else is shown here.
 */
export const FINALE_COMPLETE_EVENT = "story:finale-complete";

/** `narration`: a narrator line, not spoken by the NPC on the panel (#401). */
export type ScriptLine = { text: string; cue?: StoryCue; narration?: boolean };

/**
 * The "hatch" line hands the stage to the hatch cutscene (finale/HatchScene)
 * first; its text is the narration shown once the cutscene returns.
 */
export const SHRINE_FINALE: readonly ScriptLine[] = [
  { text: "You actually did it. The fen's gone quiet — first time in years.", cue: "moonlight" },
  {
    text: "You set the Matriarch's ember egg on the altar. It is still warm, and it is humming. Moonlight pools in the shrine's carved rings...",
    cue: "embers",
    narration: true,
  },
  {
    text: `${FINALE_HATCHLING.nickname} blinks up at you, glowing like a coal — rare, with the Matriarch's spark in its Ember Spit.`,
    cue: "hatch",
    narration: true,
  },
  {
    text: "Hear that hum? The shrine is singing toward the sea. Reed, the old hermit on the far isle, says two Sovereigns sleep out there — Tide and Stone.",
    cue: "sea",
  },
  { text: "Braid them here and you get Horizon. Braid two Horizons and... nobody alive has seen an Eclipse." },
  { text: "That one's yours to chase, if you want it. Build a boat. I'll be in the plaza whenever you want a rematch." },
];

/** Hatch the finale companion (once; the caller guards on the quest beat). */
export function hatchFinaleCompanion(): void {
  const creature = addToParty(FINALE_HATCHLING.creatureId, getPartyAverageLevel());
  creature.nickname = FINALE_HATCHLING.nickname;
  creature.rare = true;
  creature.trait = { ...FINALE_HATCHLING.trait };
}

/** True when Cinderling is already in the party (never hatch twice). */
export function hasFinaleCompanion(): boolean {
  return playerParty.creatures.some(
    (c) =>
      c.definitionId === FINALE_HATCHLING.creatureId &&
      c.nickname === FINALE_HATCHLING.nickname &&
      c.rare === true,
  );
}
