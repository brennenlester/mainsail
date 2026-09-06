import { getCreatureDefinition } from "../creatures/catalog";
import { getActiveCreatures, hasCreature } from "../creatures/party";
import {
  HUNTER_CHART,
  HUNTER_MULTIPLIER,
  type FolkloreType,
} from "../creatures/folkloreTypes";
import { questProgress } from "../story/questProgress";
import {
  EAST_LANDING,
  HARBOR_DOCK,
  HARBOR_PIER,
} from "../world/dockBoat";
import type { ZoneId } from "../world/zoneTypes";
import { worldState } from "../world/worldState";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { isGodCreature, NORMAL_BEFRIEND_CHANCE } from "./godSail";
import {
  DEFAULT_PROFILE,
  getHabitatProfile,
  type HabitatProfile,
} from "./habitatProfiles";
import { rollWildCreature, type RollWildOptions } from "./tables";

/** Session: Flee in overworld remembers this species for the next field roll. */
let overworldFleeFollowId: string | null = null;
/** True once the single guaranteed follow encounter was consumed (#268 / #300). */
let overworldFleeFollowSpent = false;

/** Session: emberfen Flee keeps this creature until Spar/Befriend/leave zone. */
let emberfenFleeChainId: string | null = null;

export function resetHabitatEncounterStateForTest(): void {
  overworldFleeFollowId = null;
  overworldFleeFollowSpent = false;
  emberfenFleeChainId = null;
}

export function getOverworldFleeFollowId(): string | null {
  return overworldFleeFollowId;
}

export function setOverworldFleeFollowId(creatureId: string | null): void {
  overworldFleeFollowId = creatureId;
}

export function getEmberfenFleeChainId(): string | null {
  return emberfenFleeChainId;
}

export function setEmberfenFleeChainId(creatureId: string | null): void {
  emberfenFleeChainId = creatureId;
}

export function clearEmberfenFleeChain(): void {
  emberfenFleeChainId = null;
}

export function isHarborBefriendUsed(creatureId: string): boolean {
  return worldState.harborBefriendUsed.includes(creatureId);
}

export function markHarborBefriendUsed(creatureId: string): void {
  if (worldState.harborBefriendUsed.includes(creatureId)) {
    return;
  }
  worldState.harborBefriendUsed.push(creatureId);
  notifyWorldChanged();
}

/** Pier, west dock pad, and East Landing floor pads only. */
export function isHarborEncounterStand(tileX: number, tileY: number): boolean {
  if (tileX === HARBOR_PIER.x && tileY === HARBOR_PIER.y) {
    return true;
  }
  if (tileX === HARBOR_DOCK.x && tileY === HARBOR_DOCK.y) {
    return true;
  }
  const eastPads = [
    { x: EAST_LANDING.x, y: EAST_LANDING.y },
    { x: EAST_LANDING.x + 1, y: EAST_LANDING.y },
    { x: EAST_LANDING.x, y: EAST_LANDING.y - 1 },
    { x: EAST_LANDING.x + 1, y: EAST_LANDING.y - 1 },
  ];
  return eastPads.some((pad) => pad.x === tileX && pad.y === tileY);
}

export function rollHarborCreature(
  discoveredCreatureIds: readonly string[],
  rng: () => number = Math.random,
): string | null {
  const pool = discoveredCreatureIds.filter(
    (id) => !isGodCreature(id) && !hasCreature(id),
  );
  if (pool.length === 0) {
    return null;
  }
  const index = Math.floor(rng() * pool.length);
  return pool[index] ?? null;
}

export type WildEncounterRollContext = {
  zoneId: ZoneId;
  tileX: number;
  tileY: number;
  islandIndex?: number | null;
  discoveredCreatureIds: readonly string[];
  rng?: () => number;
};

/**
 * Resolve the creature for a wild habitat encounter under the zone profile.
 * God paths never call this.
 */
export function resolveWildEncounterCreature(
  context: WildEncounterRollContext,
): string | null {
  const profile = getHabitatProfile(context.zoneId);
  const rng = context.rng ?? Math.random;

  if (profile.availability.kind === "fleePersists" && emberfenFleeChainId) {
    return emberfenFleeChainId;
  }

  if (profile.aftermath.kind === "fleeFollow" && overworldFleeFollowId) {
    const follow = overworldFleeFollowId;
    overworldFleeFollowId = null;
    overworldFleeFollowSpent = true;
    return follow;
  }

  if (profile.tableSource.kind === "discoveredMinusParty") {
    if (!isHarborEncounterStand(context.tileX, context.tileY)) {
      return null;
    }
    return rollHarborCreature(context.discoveredCreatureIds, rng);
  }

  const options: RollWildOptions = {
    islandIndex: context.islandIndex,
  };
  return rollWildCreature(context.zoneId, options);
}

/** True when travel threshold should force an encounter (skip chance roll). */
export function shouldGuaranteeWildTrigger(
  profile: HabitatProfile,
  zoneId: ZoneId,
): boolean {
  if (profile.trigger.kind === "guaranteed") {
    return true;
  }
  if (profile.availability.kind === "fleePersists" && emberfenFleeChainId) {
    return true;
  }
  if (profile.aftermath.kind === "fleeFollow" && overworldFleeFollowId) {
    return zoneId === "overworld";
  }
  return false;
}

export function rollWildTriggerChance(
  profile: HabitatProfile,
  rng: () => number = Math.random,
): boolean {
  if (profile.trigger.kind === "guaranteed") {
    return true;
  }
  return rng() < profile.trigger.chance;
}

export function shouldShowSparVerb(
  profile: HabitatProfile,
  creatureId: string,
): boolean {
  if (isGodCreature(creatureId)) {
    return true;
  }
  if (profile.verbs.kind === "withholdSparUnlessFirstSpar") {
    return questProgress["first-spar"] !== "locked";
  }
  return true;
}

export function shouldConcealReveal(
  profile: HabitatProfile,
  creatureId: string,
): boolean {
  if (isGodCreature(creatureId)) {
    return false;
  }
  return profile.reveal.kind === "concealedUntilAction";
}

/** Encounter panel folklore type line; omitted until reveal (no `???` placeholder). */
export function encounterTypeLineText(
  revealed: boolean,
  folkloreType: string,
): string | null {
  return revealed ? `Type: ${folkloreType}` : null;
}

export function shouldOfferHarborBefriend(
  profile: HabitatProfile,
  creatureId: string,
): boolean {
  if (isGodCreature(creatureId)) {
    return true;
  }
  if (
    profile.tableSource.kind === "discoveredMinusParty" &&
    profile.tableSource.befriendOncePerSpecies &&
    isHarborBefriendUsed(creatureId)
  ) {
    return false;
  }
  return true;
}

/**
 * Shrine folklore-matchup befriend odds from active party types vs wild.
 * God creatures never use this (flat GOD_BEFRIEND_CHANCE).
 */
export function folkloreMatchupBefriendChance(
  wildCreatureId: string,
  partyTypes: readonly FolkloreType[] = getActiveCreatures().map(
    (c) => getCreatureDefinition(c.definitionId).folkloreType,
  ),
): number {
  const wildType = getCreatureDefinition(wildCreatureId).folkloreType;
  const hasHunter = partyTypes.some((type) => HUNTER_CHART[type] === wildType);
  const isHunted = partyTypes.some(
    (type) => HUNTER_CHART[wildType] === type,
  );
  if (hasHunter) {
    return Math.min(0.95, NORMAL_BEFRIEND_CHANCE * HUNTER_MULTIPLIER);
  }
  if (isHunted) {
    return NORMAL_BEFRIEND_CHANCE / HUNTER_MULTIPLIER;
  }
  return NORMAL_BEFRIEND_CHANCE;
}

export function resolveProfileBefriendChance(
  zoneId: ZoneId,
  creatureId: string,
): number | null {
  if (isGodCreature(creatureId)) {
    return null;
  }
  const profile = getHabitatProfile(zoneId);
  if (profile.resolution.kind === "folkloreMatchup") {
    return folkloreMatchupBefriendChance(creatureId);
  }
  return null;
}

export function profileForEncounter(
  zoneId: ZoneId | undefined,
  creatureId: string,
): HabitatProfile {
  if (!zoneId || isGodCreature(creatureId)) {
    return DEFAULT_PROFILE;
  }
  return getHabitatProfile(zoneId);
}

export function onWildFlee(zoneId: ZoneId, creatureId: string): void {
  if (isGodCreature(creatureId)) {
    return;
  }
  const profile = getHabitatProfile(zoneId);
  if (profile.aftermath.kind === "fleeFollow") {
    if (!overworldFleeFollowSpent && !overworldFleeFollowId) {
      overworldFleeFollowId = creatureId;
    }
  }
  if (profile.availability.kind === "fleePersists") {
    emberfenFleeChainId = creatureId;
  }
}

export function onWildEncounterResolved(
  zoneId: ZoneId,
  creatureId: string,
  outcome: "befriend" | "spar" | "flee",
): void {
  if (isGodCreature(creatureId)) {
    return;
  }
  const profile = getHabitatProfile(zoneId);
  if (outcome === "flee") {
    onWildFlee(zoneId, creatureId);
    return;
  }
  // Spar / Befriend clear emberfen chain.
  if (profile.availability.kind === "fleePersists") {
    clearEmberfenFleeChain();
  }
  if (profile.aftermath.kind === "fleeFollow") {
    overworldFleeFollowId = null;
    overworldFleeFollowSpent = false;
  }
  if (
    outcome === "befriend" &&
    profile.tableSource.kind === "discoveredMinusParty" &&
    profile.tableSource.befriendOncePerSpecies
  ) {
    markHarborBefriendUsed(creatureId);
  }
}

export function onZoneEnter(
  zoneId: ZoneId,
  previousZoneId: ZoneId | null,
): void {
  if (previousZoneId === "emberfen" && zoneId !== "emberfen") {
    clearEmberfenFleeChain();
  }
}
