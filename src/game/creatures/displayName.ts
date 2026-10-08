import { getCreatureDefinition } from "./catalog";
import type { CreatureInstance } from "./types";

export const RARE_MARKER = "✦";

type NameSource = Pick<CreatureInstance, "definitionId" | "nickname" | "rare">;

/** What the player calls this creature: nickname, else species name (#401). */
export function displayName(creature: NameSource): string {
  const nickname = creature.nickname?.trim();
  return nickname || getCreatureDefinition(creature.definitionId).name;
}

/** `displayName` plus the rare marker, for plates, HUD rows, and cards. */
export function displayNameMarked(creature: NameSource): string {
  return creature.rare === true
    ? `${displayName(creature)} ${RARE_MARKER}`
    : displayName(creature);
}
