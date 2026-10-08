import { beforeEach, describe, expect, it } from "vitest";
import { seededRng } from "../battle/sparSim";
import {
  ENCOUNTER_FLEE_GAP_TILES,
  ENCOUNTER_MIN_GAP_TILES,
  EncounterPacer,
  overworldEncounterPacer,
  ZONE_ENTRY_GRACE_TILES,
} from "./encounterPacing";
import {
  GROVE_ENCOUNTER_CHANCE,
  HABITAT_PROFILES,
  DEFAULT_PROFILE,
} from "./habitatProfiles";
import {
  onWildEncounterResolved,
  onZoneEnter,
  resetHabitatEncounterStateForTest,
  rollWildTriggerChance,
} from "./habitatRuntime";
import { ENCOUNTER_TRAVEL_THRESHOLD } from "./tables";

/**
 * Mirrors IsometricScene's wild roll loop: a roll every
 * ENCOUNTER_TRAVEL_THRESHOLD tiles, gated by the pacer; every encounter is
 * fled (worst case for chains). `paced: false` is the pre-#390 behavior.
 */
function encountersPer100Tiles(
  chance: number,
  paced: boolean,
  seed: number,
  tiles = 10_000,
): { per100: number; minGap: number } {
  const pacer = new EncounterPacer(seededRng(seed));
  const step = 0.1; // ~one 60fps frame at MOVE_SPEED 6
  let travelled = 0;
  let sinceRoll = 0;
  let sinceEncounter = 0;
  let encounters = 0;
  let minGap = Infinity;
  for (let walked = 0; walked < tiles; walked += step) {
    pacer.walk(step);
    sinceRoll += step;
    sinceEncounter += step;
    travelled += step;
    if (sinceRoll < ENCOUNTER_TRAVEL_THRESHOLD) {
      continue;
    }
    sinceRoll = 0;
    if (paced && !pacer.canRoll()) {
      continue;
    }
    if (pacer.random() < chance) {
      if (encounters > 0) {
        minGap = Math.min(minGap, sinceEncounter);
      }
      encounters += 1;
      sinceEncounter = 0;
      pacer.onEncounterResolved("flee");
      pacer.onEncounterEnd();
    }
  }
  return { per100: (encounters / travelled) * 100, minGap };
}

describe("EncounterPacer (#390)", () => {
  it("holds rolls for the minimum gap after an encounter", () => {
    const pacer = new EncounterPacer(() => 0);
    expect(pacer.canRoll()).toBe(true);
    pacer.onEncounterResolved("spar");
    pacer.onEncounterEnd();
    pacer.walk(ENCOUNTER_MIN_GAP_TILES - 0.1);
    expect(pacer.canRoll()).toBe(false);
    pacer.walk(0.1);
    expect(pacer.canRoll()).toBe(true);
  });

  it("gives a longer cooldown after a flee", () => {
    const pacer = new EncounterPacer(() => 0);
    pacer.onEncounterResolved("flee");
    pacer.onEncounterEnd();
    pacer.walk(ENCOUNTER_MIN_GAP_TILES);
    expect(pacer.canRoll()).toBe(false);
    pacer.walk(ENCOUNTER_FLEE_GAP_TILES - ENCOUNTER_MIN_GAP_TILES);
    expect(pacer.canRoll()).toBe(true);
  });

  it("gaps sovereign / scripted encounters that skip the wild resolve hook", () => {
    const pacer = new EncounterPacer();
    pacer.onEncounterEnd();
    pacer.walk(ENCOUNTER_MIN_GAP_TILES - 1);
    expect(pacer.canRoll()).toBe(false);
  });

  it("adds a zone-entry grace that never shortens a running gap", () => {
    const pacer = new EncounterPacer();
    pacer.onZoneEnter();
    pacer.walk(ZONE_ENTRY_GRACE_TILES - 0.5);
    expect(pacer.canRoll()).toBe(false);
    pacer.walk(0.5);
    expect(pacer.canRoll()).toBe(true);

    pacer.onEncounterResolved("flee");
    pacer.onZoneEnter();
    pacer.walk(ZONE_ENTRY_GRACE_TILES);
    expect(pacer.canRoll()).toBe(false);
  });

  it("keeps the gap within the issue's 10-14 tile band", () => {
    expect(ENCOUNTER_MIN_GAP_TILES).toBeGreaterThanOrEqual(10);
    expect(ENCOUNTER_FLEE_GAP_TILES).toBeLessThanOrEqual(14);
    expect(ENCOUNTER_FLEE_GAP_TILES).toBeGreaterThan(ENCOUNTER_MIN_GAP_TILES);
  });

  it("is deterministic with an injected RNG", () => {
    const a = encountersPer100Tiles(GROVE_ENCOUNTER_CHANCE, true, 7, 2000);
    const b = encountersPer100Tiles(GROVE_ENCOUNTER_CHANCE, true, 7, 2000);
    expect(a).toEqual(b);
  });

  it("cuts Whisper Grove from ~16 to ~5 encounters per 100 tiles, never closer than the gap", () => {
    const before = encountersPer100Tiles(GROVE_ENCOUNTER_CHANCE, false, 1);
    const after = encountersPer100Tiles(GROVE_ENCOUNTER_CHANCE, true, 1);
    expect(before.per100).toBeGreaterThan(14);
    expect(after.per100).toBeGreaterThan(3.5);
    expect(after.per100).toBeLessThan(6.5);
    expect(after.minGap).toBeGreaterThanOrEqual(ENCOUNTER_FLEE_GAP_TILES - 0.01);
  });

  it("keeps quieter habitats quieter (rarity order unchanged)", () => {
    const grove = encountersPer100Tiles(GROVE_ENCOUNTER_CHANCE, true, 3).per100;
    const shrine = encountersPer100Tiles(
      HABITAT_PROFILES.shrine.trigger.kind === "chance"
        ? HABITAT_PROFILES.shrine.trigger.chance
        : 1,
      true,
      3,
    ).per100;
    expect(shrine).toBeLessThan(grove);
    expect(shrine).toBeGreaterThan(2);
  });
});

describe("habitat runtime feeds the overworld pacer", () => {
  beforeEach(() => {
    resetHabitatEncounterStateForTest();
  });

  it("starts the flee cooldown from the encounter verb", () => {
    onWildEncounterResolved("grove", "mossling", "flee");
    overworldEncounterPacer.walk(ENCOUNTER_MIN_GAP_TILES);
    expect(overworldEncounterPacer.canRoll()).toBe(false);
    overworldEncounterPacer.walk(ENCOUNTER_FLEE_GAP_TILES);
    expect(overworldEncounterPacer.canRoll()).toBe(true);
  });

  it("grants zone-entry grace only on a real zone change", () => {
    onZoneEnter("grove", null); // reload of the same zone (resume / boot)
    expect(overworldEncounterPacer.canRoll()).toBe(true);
    onZoneEnter("shrine", "grove");
    expect(overworldEncounterPacer.canRoll()).toBe(false);
  });

  it("leaves habitat chance rolls untouched", () => {
    expect(DEFAULT_PROFILE.trigger).toEqual({ kind: "chance", chance: 0.05 });
    expect(rollWildTriggerChance(HABITAT_PROFILES.grove, () => 0.119)).toBe(true);
    expect(rollWildTriggerChance(HABITAT_PROFILES.grove, () => 0.12)).toBe(false);
  });
});
