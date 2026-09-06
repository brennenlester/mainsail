import { getMaterialCount } from "../inventory/playerInventory";
import {
  befriendButtonLabel,
  getBefriendChance,
} from "./godSail";

/** Folklore Dust id (spar loot / Want / craft). Encounter verbs no longer spend it (#306). */
export const FOLKLORE_DUST_ID = "folklore-dust";

/** Befriend: free (#306; was 2 Dust under #267). */
export const BEFRIEND_DUST_COST = 0;

/** Flee: free (#306; was 1 Dust under #267). */
export const FLEE_DUST_COST = 0;

/**
 * Opening turns the wild takes before the player's first action.
 * 0 = player strikes first (#336).
 */
export const SPAR_WILD_OPENING_TURNS = 0;

export function getFolkloreDustCount(): number {
  return getMaterialCount(FOLKLORE_DUST_ID);
}

export function canAffordBefriend(_dustCount?: number): boolean {
  return true;
}

export function canAffordFlee(_dustCount?: number): boolean {
  return true;
}

/** No-op since costs are 0; always succeeds. */
export function payBefriendCost(): boolean {
  return true;
}

/** No-op since costs are 0; always succeeds. */
export function payFleeCost(): boolean {
  return true;
}

export function encounterBefriendButtonLabel(creatureId: string): string {
  return befriendButtonLabel(getBefriendChance(creatureId));
}

export function encounterSparButtonLabel(): string {
  return SPAR_WILD_OPENING_TURNS > 0 ? "Spar · wild opens" : "Spar";
}

export function encounterFleeButtonLabel(): string {
  return "Flee";
}

export function unaffordableBefriendReason(): string {
  return "";
}

export function unaffordableFleeReason(): string {
  return "";
}

/**
 * Reasons for disabled encounter verbs. Empty when Dust costs are free (#306).
 * Spar never appears — it has no Dust cost.
 */
export function encounterUnaffordableReasons(_dustCount?: number): string[] {
  return [];
}
