import { getCreatureDefinition } from "../creatures/catalog";
import { markCreatureDiscovered } from "../world/worldState";

/**
 * Codex entry at encounter start, so a creature you flee from (or never
 * reveal) still fills in (#401). Returns whether the id is codex-eligible.
 */
export function discoverOnEncounter(creatureId: string): boolean {
  if (getCreatureDefinition(creatureId).excludeFromCodex) {
    return false;
  }
  markCreatureDiscovered(creatureId);
  return true;
}
