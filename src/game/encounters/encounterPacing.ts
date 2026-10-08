/**
 * Wild encounter pacing (#390): soft overworld means a walk is never a
 * gauntlet. The habitat profile still owns *how likely* a roll is
 * (habitatProfiles.ts, unchanged); the pacer only owns *when* a roll may
 * happen, measured in tiles walked:
 * - a minimum gap after every encounter (longer after a flee),
 * - a short grace after entering a zone.
 * Scripted opening beats (#363) bypass the pacer so their guarantee holds.
 */

/** Tiles walked after a won / befriended / sovereign encounter before rolls resume. */
export const ENCOUNTER_MIN_GAP_TILES = 12;
/** Tiles walked after a flee before rolls resume (no flee → re-roll chains). */
export const ENCOUNTER_FLEE_GAP_TILES = 14;
/** Tiles walked after entering a zone before rolls resume. */
export const ZONE_ENTRY_GRACE_TILES = 6;

export type EncounterPacingOutcome = "befriend" | "spar" | "flee";

export class EncounterPacer {
  private tilesUntilEligible = 0;

  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /** Swap the roll source (tests / deterministic sims). */
  setRng(rng: () => number): void {
    this.rng = rng;
  }

  /** Count walked distance toward the current gap. */
  walk(tiles: number): void {
    if (tiles > 0) {
      this.tilesUntilEligible = Math.max(0, this.tilesUntilEligible - tiles);
    }
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
    this.tilesUntilEligible = Math.max(
      this.tilesUntilEligible,
      ENCOUNTER_MIN_GAP_TILES,
    );
  }

  /** A wild encounter resolved; fleeing earns the longer gap. */
  onEncounterResolved(outcome: EncounterPacingOutcome): void {
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
  }
}

/** Session pacer for the overworld wild roll. */
export const overworldEncounterPacer = new EncounterPacer();
