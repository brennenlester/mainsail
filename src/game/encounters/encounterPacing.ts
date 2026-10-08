/**
 * Wild encounter pacing (#390): soft overworld means a walk is never a
 * gauntlet. The habitat profile still owns *how likely* a roll is
 * (habitatProfiles.ts, unchanged); the pacer only owns *when* a roll may
 * happen, measured in tiles walked:
 * - a minimum gap after every encounter (longer after a flee),
 * - a short grace after entering a zone.
 * Scripted opening beats (#363) bypass the pacer so their guarantee holds.
 *
 * Living routes (#411): the story routes are short (Fields -> Mistwood ->
 * Emberfen is ~30 tiles on a straight walk), so grace + gap could swallow the
 * whole walk. After a dry spell of `ROUTE_DRY_SPELL_TILES` walked on a route
 * zone, the next *eligible* roll is guaranteed. Gaps and grace still apply.
 */
import type { ZoneId } from "../world/zoneTypes";

/** Tiles walked after a won / befriended / sovereign encounter before rolls resume. */
export const ENCOUNTER_MIN_GAP_TILES = 12;
/** Tiles walked after a flee before rolls resume (no flee → re-roll chains). */
export const ENCOUNTER_FLEE_GAP_TILES = 14;
/** Tiles walked after entering a zone before rolls resume. */
export const ZONE_ENTRY_GRACE_TILES = 6;

/** Story-route zones that guarantee a light encounter schedule (#411). */
export const ROUTE_ZONE_IDS: readonly ZoneId[] = ["overworld", "mistwood", "emberfen"];
/** Route tiles walked without an encounter before the next eligible roll is certain. */
export const ROUTE_DRY_SPELL_TILES = 20;

export function isRouteZone(zoneId: ZoneId): boolean {
  return ROUTE_ZONE_IDS.includes(zoneId);
}

export type EncounterPacingOutcome = "befriend" | "spar" | "flee";

export class EncounterPacer {
  private tilesUntilEligible = 0;

  /** Route tiles walked since the last encounter (#411). */
  private dryRouteTiles = 0;

  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /** Swap the roll source (tests / deterministic sims). */
  setRng(rng: () => number): void {
    this.rng = rng;
  }

  /** Count walked distance toward the current gap (and the route dry spell). */
  walk(tiles: number, onRoute = false): void {
    if (tiles > 0) {
      this.tilesUntilEligible = Math.max(0, this.tilesUntilEligible - tiles);
      if (onRoute) {
        this.dryRouteTiles += tiles;
      }
    }
  }

  /** True when a route dry spell makes the next eligible roll a certain hit. */
  routeEncounterDue(): boolean {
    return this.canRoll() && this.dryRouteTiles >= ROUTE_DRY_SPELL_TILES;
  }

  /** True when a habitat chance roll may happen. */
  canRoll(): boolean {
    return this.tilesUntilEligible <= 0;
  }

  /** The injected roll source (habitat chance rolls share it). */
  random(): number {
    return this.rng();
  }

  /** Back in the overworld after any encounter: at least the minimum gap. */
  onEncounterEnd(): void {
    this.dryRouteTiles = 0;
    this.tilesUntilEligible = Math.max(
      this.tilesUntilEligible,
      ENCOUNTER_MIN_GAP_TILES,
    );
  }

  /** A wild encounter resolved; fleeing earns the longer gap. */
  onEncounterResolved(outcome: EncounterPacingOutcome): void {
    this.dryRouteTiles = 0;
    this.tilesUntilEligible =
      outcome === "flee" ? ENCOUNTER_FLEE_GAP_TILES : ENCOUNTER_MIN_GAP_TILES;
  }

  /** Walked into a new zone: short grace (never shortens a running gap). */
  onZoneEnter(): void {
    this.tilesUntilEligible = Math.max(
      this.tilesUntilEligible,
      ZONE_ENTRY_GRACE_TILES,
    );
  }

  reset(): void {
    this.tilesUntilEligible = 0;
    this.dryRouteTiles = 0;
  }
}

/** Session pacer for the overworld wild roll. */
export const overworldEncounterPacer = new EncounterPacer();
