import { playerParty } from "../creatures/party";
import { type BrynGroveStarterId, worldState } from "./worldState";
import { isVisitorMode } from "./worldSession";

/**
 * Warden Bryn's Grove starter gift (#349): after the village gate opens he
 * gives the Grove line the party is missing, once per line. Shared by his
 * conversation (npcState) and Wren's "bring a friend" nudge (#411), so the
 * nudge only names Bryn when he really has a companion waiting.
 */
const GROVE_STARTER_ORDER: readonly BrynGroveStarterId[] = ["mossling", "ember-wisp"];

const GROVE_STARTER_LINE: Record<BrynGroveStarterId, readonly string[]> = {
  mossling: ["mossling", "bramblewarden"],
  "ember-wisp": ["ember-wisp", "hearthflame"],
};

function partyHasGroveLine(starterId: BrynGroveStarterId): boolean {
  const ids = GROVE_STARTER_LINE[starterId];
  return playerParty.creatures.some(
    (creature) => ids.includes(creature.definitionId) || ids.includes(creature.speciesId),
  );
}

/** The Grove starter Bryn would gift right now, or null (host only, gate open). */
export function nextBrynGroveStarter(): BrynGroveStarterId | null {
  if (isVisitorMode() || !worldState.villageGateUnlocked) {
    return null;
  }
  return (
    GROVE_STARTER_ORDER.find(
      (id) => !worldState.brynGroveStartersGifted.includes(id) && !partyHasGroveLine(id),
    ) ?? null
  );
}
