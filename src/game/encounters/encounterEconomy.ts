import { getMaterialName } from "../inventory/materials";
import {
  consumeMaterial,
  getMaterialCount,
} from "../inventory/playerInventory";
import {
  befriendButtonLabel,
  getBefriendChance,
} from "./godSail";

/** Pinned #266/#267: Folklore Dust id used by encounter verb costs. */
export const FOLKLORE_DUST_ID = "folklore-dust";

/** Befriend: 2 Folklore Dust per attempt. */
export const BEFRIEND_DUST_COST = 2;

/** Flee: 1 Folklore Dust for a guaranteed escape. */
export const FLEE_DUST_COST = 1;

/**
 * Spar risk: the wild creature takes exactly this many opening turns
 * before the player's first action.
 */
export const SPAR_WILD_OPENING_TURNS = 1;

export function getFolkloreDustCount(): number {
  return getMaterialCount(FOLKLORE_DUST_ID);
}

export function canAffordBefriend(
  dustCount: number = getFolkloreDustCount(),
): boolean {
  return dustCount >= BEFRIEND_DUST_COST;
}

export function canAffordFlee(
  dustCount: number = getFolkloreDustCount(),
): boolean {
  return dustCount >= FLEE_DUST_COST;
}

/** Spend Befriend cost. Returns false if unaffordable (no mutation). */
export function payBefriendCost(): boolean {
  return consumeMaterial(FOLKLORE_DUST_ID, BEFRIEND_DUST_COST);
}

/** Spend Flee cost. Returns false if unaffordable (no mutation). */
export function payFleeCost(): boolean {
  return consumeMaterial(FOLKLORE_DUST_ID, FLEE_DUST_COST);
}

export function encounterBefriendButtonLabel(creatureId: string): string {
  return `${befriendButtonLabel(getBefriendChance(creatureId))} · ${BEFRIEND_DUST_COST} Dust`;
}

export function encounterSparButtonLabel(): string {
  return "Spar · wild opens";
}

export function encounterFleeButtonLabel(): string {
  return `Flee · ${FLEE_DUST_COST} Dust`;
}

export function unaffordableBefriendReason(): string {
  return `Need ${BEFRIEND_DUST_COST} ${getMaterialName(FOLKLORE_DUST_ID)} to Befriend`;
}

export function unaffordableFleeReason(): string {
  return `Need ${FLEE_DUST_COST} ${getMaterialName(FOLKLORE_DUST_ID)} to Flee`;
}

/**
 * Reasons for disabled encounter verbs. Empty when both Dust verbs are affordable.
 * Spar never appears — it has no Dust cost.
 */
export function encounterUnaffordableReasons(
  dustCount: number = getFolkloreDustCount(),
): string[] {
  const reasons: string[] = [];
  if (!canAffordBefriend(dustCount)) {
    reasons.push(unaffordableBefriendReason());
  }
  if (!canAffordFlee(dustCount)) {
    reasons.push(unaffordableFleeReason());
  }
  return reasons;
}
