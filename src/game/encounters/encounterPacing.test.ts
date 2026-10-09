import { beforeEach, describe, expect, it } from "vitest";
import { seededRng } from "../battle/sparSim";
import {
  ENCOUNTER_FLEE_GAP_TILES,
  ENCOUNTER_MIN_GAP_TILES,
  EncounterPacer,
  isQuietAfterStory,
  isRouteZone,
  QUIET_AFTER_STORY_ZONE_IDS,
  overworldEncounterPacer,
  ROUTE_DRY_SPELL_TILES,
  ROUTE_ZONE_IDS,
  ZONE_ENTRY_GRACE_TILES,
} from "./encounterPacing";
import type { ZoneId } from "../world/zoneTypes";
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

/**
 * A story-route walk (#411) in IsometricScene's loop: zone entry grace per
 * leg, a roll every ENCOUNTER_TRAVEL_THRESHOLD tiles, pacer-gated, guaranteed
 * on a route dry spell. Returns the tile (from the walk's start) of each
 * encounter. `routes: false` is the pre-#411 behavior.
 */
function routeWalk(
  legs: readonly { zoneId: ZoneId; tiles: number }[],
  chance: number,
  routes: boolean,
  startGap = 0,
  seed = 1,
): number[] {
  const pacer = new EncounterPacer(seededRng(seed));
  if (startGap > 0) {
    pacer.onEncounterEnd();
    pacer.walk(ENCOUNTER_MIN_GAP_TILES - startGap);
  }
  const step = 0.1;
  const hits: number[] = [];
  let walked = 0;
  let sinceRoll = 0;
  legs.forEach((leg, i) => {
    if (i > 0) {
      pacer.onZoneEnter(leg.zoneId);
    }
    for (let t = 0; t < leg.tiles; t += step) {
      walked += step;
      pacer.walk(step);
      if (routes) {
        pacer.walkRoute(step, { zoneId: leg.zoneId });
      }
      sinceRoll += step;
      if (sinceRoll < ENCOUNTER_TRAVEL_THRESHOLD) {
        continue;
      }
      sinceRoll = 0;
      if (!pacer.canRoll()) {
        continue;
      }
      if ((routes && pacer.routeEncounterDue(leg.zoneId)) || pacer.random() < chance) {
        hits.push(walked);
        pacer.onEncounterResolved("spar");
        pacer.onEncounterEnd();
      }
    }
  });
  return hits;
}

describe("living routes (#411)", () => {
  const NEVER = 0; // worst case: every chance roll misses
  // Straight story walk after Wren: Fields gate -> Mistwood gate is 13 tiles,
  // across Mistwood 10, Emberfen entry -> Matriarch 7.
  const STORY_WALK = [
    { zoneId: "overworld", tiles: 13 },
    { zoneId: "mistwood", tiles: 10 },
    { zoneId: "emberfen", tiles: 7 },
  ] as const;

  it("lists the story routes and only them", () => {
    expect([...ROUTE_ZONE_IDS].sort()).toEqual(["emberfen", "mistwood", "overworld"]);
    expect(isRouteZone("village")).toBe(false);
    expect(isRouteZone("grove")).toBe(false);
  });

  it("reproduces the empty walk before #411 when every roll misses", () => {
    expect(routeWalk(STORY_WALK, NEVER, false, 8)).toEqual([]);
  });

  it("guarantees an encounter on the straight Fields -> Emberfen walk, even after Wren's gap", () => {
    const hits = routeWalk(STORY_WALK, NEVER, true, 8);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!).toBeLessThanOrEqual(30);
  });

  it("guarantees one within the first ~40 tiles of each route leg", () => {
    for (const legs of [
      [
        { zoneId: "overworld", tiles: 25 },
        { zoneId: "mistwood", tiles: 15 },
      ],
      [
        { zoneId: "mistwood", tiles: 20 },
        { zoneId: "emberfen", tiles: 20 },
      ],
    ] as const) {
      const hits = routeWalk(legs, NEVER, true, ENCOUNTER_MIN_GAP_TILES);
      expect(hits.length, legs[0].zoneId).toBeGreaterThanOrEqual(1);
      expect(hits[0]!, legs[0].zoneId).toBeLessThanOrEqual(40);
    }
  });

  it("stays low pressure: never closer than the min gap, at most ~5 per 100 route tiles", () => {
    const long = [{ zoneId: "mistwood", tiles: 2000 }] as const;
    for (const seed of [1, 2, 3]) {
      const hits = routeWalk(long, DEFAULT_PROFILE.trigger.kind === "chance" ? DEFAULT_PROFILE.trigger.chance : 0, true, 0, seed);
      for (let i = 1; i < hits.length; i++) {
        expect(hits[i]! - hits[i - 1]!).toBeGreaterThanOrEqual(ENCOUNTER_MIN_GAP_TILES - 0.01);
      }
      const per100 = (hits.length / 2000) * 100;
      expect(per100, `seed ${seed}`).toBeGreaterThan(3);
      expect(per100, `seed ${seed}`).toBeLessThanOrEqual(5.5);
    }
  });

  it("never counts or fires in non-route zones", () => {
    const pacer = new EncounterPacer(() => 0.99);
    pacer.walkRoute(ROUTE_DRY_SPELL_TILES * 3, { zoneId: "shrine" });
    expect(pacer.routeEncounterDue("overworld")).toBe(false);
    pacer.walkRoute(ROUTE_DRY_SPELL_TILES, { zoneId: "overworld" });
    expect(pacer.routeEncounterDue("overworld")).toBe(true);
    // A dry spell built on a route never fires off-route (shrine / islands).
    expect(pacer.routeEncounterDue("shrine")).toBe(false);
    expect(pacer.routeEncounterDue("archipelago")).toBe(false);
    pacer.onEncounterResolved("spar");
    pacer.walk(ENCOUNTER_MIN_GAP_TILES);
    pacer.walkRoute(ENCOUNTER_MIN_GAP_TILES, { zoneId: "overworld" });
    expect(pacer.routeEncounterDue("overworld")).toBe(false);
  });

  it("drops the dry spell on leaving the routes (25 Fields tiles, then the shrine)", () => {
    const legs = [
      { zoneId: "overworld", tiles: 19 },
      { zoneId: "shrine", tiles: 20 },
      { zoneId: "overworld", tiles: 7 },
    ] as const;
    // Every chance roll misses: only the dry spell could fire, and it must not
    // carry through the shrine (25+ route tiles would otherwise be "due").
    const pacer = new EncounterPacer(() => 0.99);
    pacer.walkRoute(19, { zoneId: "overworld" });
    pacer.onZoneEnter("shrine");
    expect(pacer.routeEncounterDue("shrine")).toBe(false);
    pacer.walk(ZONE_ENTRY_GRACE_TILES);
    expect(pacer.routeEncounterDue("shrine")).toBe(false);
    pacer.onZoneEnter("overworld");
    pacer.walk(ZONE_ENTRY_GRACE_TILES);
    pacer.walkRoute(ZONE_ENTRY_GRACE_TILES, { zoneId: "overworld" });
    expect(pacer.routeEncounterDue("overworld")).toBe(false);
    expect(routeWalk(legs, 0, true)).toEqual([]);
  });

  it("never counts while immune or on a safe tile", () => {
    const pacer = new EncounterPacer(() => 0.99);
    pacer.walkRoute(ROUTE_DRY_SPELL_TILES * 2, { zoneId: "overworld", immune: true });
    pacer.walkRoute(ROUTE_DRY_SPELL_TILES * 2, { zoneId: "overworld", safeTile: true });
    expect(pacer.routeEncounterDue("overworld")).toBe(false);
    pacer.walkRoute(ROUTE_DRY_SPELL_TILES, { zoneId: "overworld" });
    expect(pacer.routeEncounterDue("overworld")).toBe(true);
  });

  it("route-to-route crossings keep the dry spell (Fields -> Mistwood)", () => {
    const pacer = new EncounterPacer(() => 0.99);
    pacer.walkRoute(15, { zoneId: "overworld" });
    pacer.onZoneEnter("mistwood");
    pacer.walk(ZONE_ENTRY_GRACE_TILES);
    pacer.walkRoute(ZONE_ENTRY_GRACE_TILES, { zoneId: "mistwood" });
    expect(pacer.routeEncounterDue("mistwood")).toBe(true);
  });
});

describe("shrine yard after the story (#429)", () => {
  /** Shrine-yard walk in IsometricScene's loop, every roll a hit unless quiet. */
  function shrineEncounters(finaleComplete: boolean, tiles = 60): number {
    const pacer = new EncounterPacer(() => 0);
    let count = 0;
    let sinceRoll = 0;
    for (let t = 0; t < tiles; t += 0.1) {
      pacer.walk(0.1);
      sinceRoll += 0.1;
      if (sinceRoll < ENCOUNTER_TRAVEL_THRESHOLD) continue;
      sinceRoll = 0;
      if (isQuietAfterStory("shrine", finaleComplete) || !pacer.canRoll()) continue;
      count += 1;
      pacer.onEncounterResolved("spar");
      pacer.onEncounterEnd();
    }
    return count;
  }

  it("only the shrine goes quiet, and only once the finale is complete", () => {
    expect([...QUIET_AFTER_STORY_ZONE_IDS]).toEqual(["shrine"]);
    expect(isQuietAfterStory("shrine", true)).toBe(true);
    expect(isQuietAfterStory("shrine", false)).toBe(false);
    for (const zone of ["grove", "overworld", "mistwood", "emberfen", "archipelago", "harbor"] as const) {
      expect(isQuietAfterStory(zone, true), zone).toBe(false);
    }
  });

  it("keeps earlier-story shrine encounters on the #390 pacing, none after the finale", () => {
    expect(shrineEncounters(false)).toBeGreaterThanOrEqual(3);
    expect(shrineEncounters(true)).toBe(0);
  });
});
