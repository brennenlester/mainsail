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

type ViewSource = NameSource & Pick<CreatureInstance, "instanceId">;

/**
 * `displayName` among creatures shown together (#423): the second "Pip" in
 * view reads "Pip ·2". A creature outside `view` keeps its plain name.
 */
export function displayNameIn(creature: ViewSource, view: readonly ViewSource[]): string {
  const base = displayName(creature);
  const key = base.toLowerCase();
  let nth = 0;
  for (const other of view) {
    if (displayName(other).toLowerCase() === key) {
      nth += 1;
      if (other.instanceId === creature.instanceId) {
        return nth > 1 ? `${base} ·${nth}` : base;
      }
    }
  }
  return base;
}

/** Same rule for a list of names already resolved: ["Pip", "Pip"] → ["Pip", "Pip ·2"]. */
export function disambiguateNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    return nth > 1 ? `${name} ·${nth}` : name;
  });
}

/** `displayNameIn` plus the rare marker. */
export function displayNameMarkedIn(creature: ViewSource, view: readonly ViewSource[]): string {
  const name = displayNameIn(creature, view);
  return creature.rare === true ? `${name} ${RARE_MARKER}` : name;
}
