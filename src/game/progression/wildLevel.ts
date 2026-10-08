import { ZONE_ENCOUNTERS } from "../encounters/tables";
import { MAX_LEVEL } from "./leveling";
import { getActiveCreatures, playerParty } from "../creatures/party";

export const RARITY_BIAS_COMMON = 0;
export const RARITY_BIAS_UNCOMMON = 1;
export const RARITY_BIAS_RARE = 2;

// Inline ids to avoid import cycles with godFusion/party.
const DEFEAT_SCALING_EXCLUDED = new Set([
  "tide-sovereign",
  "cairn-sovereign",
  "horizon-sovereign",
  "eclipse-sovereign",
]);

/** Max encounter weight across all zone tables; null if never listed. */
const SPECIES_MAX_WEIGHT: Map<string, number> = (() => {
  const map = new Map<string, number>();
  for (const table of Object.values(ZONE_ENCOUNTERS)) {
    for (const entry of table) {
      const prev = map.get(entry.id) ?? 0;
      if (entry.weight > prev) {
        map.set(entry.id, entry.weight);
      }
    }
  }
  return map;
})();

/** Story spar rounds (#369) pin one species' level while that round runs. */
const scriptedWildLevels = new Map<string, number>();

export function setScriptedWildLevel(
  creatureId: string,
  level: number | null,
): void {
  if (level === null) {
    scriptedWildLevels.delete(creatureId);
  } else {
    scriptedWildLevels.set(creatureId, level);
  }
}

export function isDefeatScalingExcluded(creatureId: string): boolean {
  return DEFEAT_SCALING_EXCLUDED.has(creatureId);
}

/** Highest listed weight for a species, or null if absent from wild tables. */
export function getSpeciesMaxEncounterWeight(
  creatureId: string,
): number | null {
  return SPECIES_MAX_WEIGHT.get(creatureId) ?? null;
}

/**
 * Rarity bias from max encounter weight:
 * common ≥40 → +0, uncommon 13–39 → +1, rare ≤12 → +2.
 * Unlisted species (evos, etc.) get +0 — they are not wild-scaled spawns.
 */
export function rarityBiasFromWeight(weight: number | null): number {
  if (weight === null) {
    return RARITY_BIAS_COMMON;
  }
  if (weight >= 40) {
    return RARITY_BIAS_COMMON;
  }
  if (weight >= 13) {
    return RARITY_BIAS_UNCOMMON;
  }
  return RARITY_BIAS_RARE;
}

export function getRarityBias(creatureId: string): number {
  if (isDefeatScalingExcluded(creatureId)) {
    return 0;
  }
  return rarityBiasFromWeight(getSpeciesMaxEncounterWeight(creatureId));
}

/** Rounded average level of the active party (all creatures if none active); 1 when empty. */
export function getPartyAverageLevel(): number {
  const actives = getActiveCreatures();
  const pool = actives.length > 0 ? actives : playerParty.creatures;
  if (pool.length === 0) {
    return 1;
  }
  const total = pool.reduce((sum, c) => sum + c.level, 0);
  return Math.max(1, Math.round(total / pool.length));
}

/** Share-card ghost spars pin the opponent to the sharer's level (#368). */
let wildLevelOverride: number | null = null;

export function setWildLevelOverride(level: number | null): void {
  wildLevelOverride =
    level === null ? null : Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
}

/**
 * Wild effective level: party average + small rarity bias, capped at MAX_LEVEL (#370).
 * Spar win counts no longer raise wild level, so success is never punished.
 * Sovereigns always return 1 (catalog baseline; no defeat scaling).
 */
export function getWildEffectiveLevel(
  creatureId: string,
  partyAverage = getPartyAverageLevel(),
): number {
  const scripted = scriptedWildLevels.get(creatureId);
  if (scripted !== undefined) {
    return scripted;
  }
  if (wildLevelOverride !== null) {
    return wildLevelOverride;
  }
  if (isDefeatScalingExcluded(creatureId)) {
    return 1;
  }
  const base = Math.max(1, Math.round(partyAverage));
  return Math.min(MAX_LEVEL, base + getRarityBias(creatureId));
}
