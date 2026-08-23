import {
  HUNTER_MULTIPLIER,
  getHunterTarget,
  type FolkloreType,
} from "../creatures/folkloreTypes";
import { getActiveQuestId } from "../story/questProgress";

/** Story 2 ("first-spar") is the only beat that teaches hunters. */
export function isHunterMatchupTeachActive(): boolean {
  return getActiveQuestId() === "first-spar";
}

/** Advertised multiplier label — must stay tied to folkloreTypes. */
export function formatHunterMultiplierLabel(): string {
  return `×${HUNTER_MULTIPLIER}`;
}

/**
 * Pre-move teaching copy for Story 2 spars.
 * Names the hunter mechanic and the active creature's prey type.
 */
export function formatHunterMatchupTeach(
  attackerType: FolkloreType,
  defenderType: FolkloreType,
): string {
  const prey = getHunterTarget(attackerType);
  const mult = formatHunterMultiplierLabel();
  if (prey === defenderType) {
    return `Hunter tip: ${attackerType} hunts ${defenderType} for ${mult} damage — advantage this spar.`;
  }
  return `Hunter tip: ${attackerType} hunts ${prey} for ${mult} damage. This foe is ${defenderType}.`;
}
