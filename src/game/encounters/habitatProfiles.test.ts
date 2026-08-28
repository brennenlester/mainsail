import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  getHabitatProfile,
  GROVE_ENCOUNTER_CHANCE,
  HABITAT_PROFILES,
  isInteriorZone,
  profilesEqual,
  VARIATION_ZONE_IDS,
} from "./habitatProfiles";
import {
  clearArchipelagoLandingEncounters,
  folkloreMatchupBefriendChance,
  getEmberfenFleeChainId,
  getOverworldFleeFollowId,
  hasArchipelagoLandingEncounter,
  isHarborEncounterStand,
  markArchipelagoLandingEncounter,
  markHarborBefriendUsed,
  onWildEncounterResolved,
  onZoneEnter,
  profileForEncounter,
  resetHabitatEncounterStateForTest,
  resolveProfileBefriendChance,
  resolveWildEncounterCreature,
  rollHarborCreature,
  rollWildTriggerChance,
  shouldConcealReveal,
  encounterTypeLineText,
  shouldGuaranteeWildTrigger,
  shouldOfferHarborBefriend,
  shouldShowSparVerb,
} from "./habitatRuntime";
import { ZONE_ENCOUNTERS } from "./tables";
import { GOD_BEFRIEND_CHANCE, NORMAL_BEFRIEND_CHANCE } from "./godSail";
import { HUNTER_MULTIPLIER } from "../creatures/folkloreTypes";
import { ENCOUNTERABLE_CREATURE_IDS } from "../progression/achievements";
import { addToParty, setPartyFromSnapshot } from "../creatures/party";
import { questProgress } from "../story/questProgress";
import {
  setDiscoveredCreatures,
  setHarborBefriendUsed,
  worldState,
} from "../world/worldState";
import { HARBOR_DOCK, HARBOR_PIER, EAST_LANDING } from "../world/dockBoat";

describe("habitatProfiles", () => {
  it("exports DEFAULT_PROFILE matching today's chance/always/all/flat/shown/zone/none", () => {
    expect(DEFAULT_PROFILE).toEqual({
      trigger: { kind: "chance", chance: 0.05 },
      availability: { kind: "always" },
      verbs: { kind: "all" },
      resolution: { kind: "flat" },
      reveal: { kind: "shown" },
      tableSource: { kind: "zoneTable" },
      aftermath: { kind: "none" },
    });
  });

  it("gives every non-interior habitat a profile distinct from DEFAULT and each other", () => {
    expect(VARIATION_ZONE_IDS).toHaveLength(8);
    for (const zoneId of VARIATION_ZONE_IDS) {
      expect(isInteriorZone(zoneId)).toBe(false);
      const profile = HABITAT_PROFILES[zoneId];
      expect(profilesEqual(profile, DEFAULT_PROFILE)).toBe(false);
    }
    for (let i = 0; i < VARIATION_ZONE_IDS.length; i++) {
      for (let j = i + 1; j < VARIATION_ZONE_IDS.length; j++) {
        const a = VARIATION_ZONE_IDS[i]!;
        const b = VARIATION_ZONE_IDS[j]!;
        expect(profilesEqual(HABITAT_PROFILES[a], HABITAT_PROFILES[b])).toBe(
          false,
        );
      }
    }
  });

  it("skips interiors (DEFAULT fallback) and matches #268 per-habitat axes", () => {
    expect(isInteriorZone("warden-cottage")).toBe(true);
    expect(profilesEqual(getHabitatProfile("warden-cottage"), DEFAULT_PROFILE)).toBe(
      true,
    );
    expect(HABITAT_PROFILES.grove.trigger).toEqual({
      kind: "chance",
      chance: GROVE_ENCOUNTER_CHANCE,
    });
    expect(HABITAT_PROFILES.shrine.resolution).toEqual({
      kind: "folkloreMatchup",
    });
    expect(HABITAT_PROFILES.village.verbs).toEqual({
      kind: "withholdSparUnlessFirstSpar",
    });
    expect(HABITAT_PROFILES.overworld.aftermath).toEqual({ kind: "fleeFollow" });
    expect(HABITAT_PROFILES.mistwood.reveal).toEqual({
      kind: "concealedUntilAction",
    });
    expect(HABITAT_PROFILES.emberfen.availability).toEqual({
      kind: "fleePersists",
    });
    expect(HABITAT_PROFILES.archipelago.availability).toEqual({
      kind: "onePerLanding",
    });
    expect(HABITAT_PROFILES.harbor.tableSource).toEqual({
      kind: "discoveredMinusParty",
      stands: "pierDockEastLanding",
      befriendOncePerSpecies: true,
    });
  });

  it("does not put species identity, tint, or resource costs on profile axes", () => {
    const serialized = JSON.stringify(HABITAT_PROFILES);
    expect(serialized).not.toMatch(/mossling|tint|dust|cost|price/i);
  });
});

describe("habitat protected invariants", () => {
  it("keeps harbor table empty and species count at 27", () => {
    expect(ZONE_ENCOUNTERS.harbor).toEqual([]);
    expect(ENCOUNTERABLE_CREATURE_IDS).toHaveLength(27);
  });

  it("keeps GOD_BEFRIEND_CHANCE flat at 0.08", () => {
    expect(GOD_BEFRIEND_CHANCE).toBe(0.08);
  });

  it("keeps HUNTER_MULTIPLIER for folklore matchup math", () => {
    expect(HUNTER_MULTIPLIER).toBe(1.5);
  });
});

describe("habitatRuntime behaviors", () => {
  beforeEach(() => {
    resetHabitatEncounterStateForTest();
    setHarborBefriendUsed([]);
    setDiscoveredCreatures([]);
    setPartyFromSnapshot([], 1, []);
    questProgress["first-spar"] = "locked";
  });

  it("grove trigger is elevated chance, not guaranteed (#308)", () => {
    const profile = getHabitatProfile("grove");
    expect(GROVE_ENCOUNTER_CHANCE).toBe(0.12);
    expect(GROVE_ENCOUNTER_CHANCE).toBeGreaterThan(0.05);
    expect(shouldGuaranteeWildTrigger(profile, "grove")).toBe(false);
    expect(rollWildTriggerChance(profile, () => GROVE_ENCOUNTER_CHANCE - 0.001)).toBe(
      true,
    );
    expect(rollWildTriggerChance(profile, () => GROVE_ENCOUNTER_CHANCE)).toBe(
      false,
    );
    expect(
      rollWildTriggerChance(getHabitatProfile("village"), () => 0.99),
    ).toBe(false);
  });

  it("shrine resolution scales befriend odds by folklore matchup", () => {
    // mossling is woodland; ember hunts woodland.
    expect(folkloreMatchupBefriendChance("mossling", ["ember"])).toBe(
      Math.min(0.95, NORMAL_BEFRIEND_CHANCE * HUNTER_MULTIPLIER),
    );
    // woodland hunts fen — party woodland is hunted by wild fen peat-sprite? 
    // peat-sprite folklore — check catalog. Use explicit: wild woodland, party fen is hunted by woodland.
    expect(folkloreMatchupBefriendChance("mossling", ["fen"])).toBe(
      NORMAL_BEFRIEND_CHANCE / HUNTER_MULTIPLIER,
    );
    expect(folkloreMatchupBefriendChance("mossling", ["mist"])).toBe(
      NORMAL_BEFRIEND_CHANCE,
    );
    expect(resolveProfileBefriendChance("shrine", "mossling")).not.toBeNull();
    expect(resolveProfileBefriendChance("grove", "mossling")).toBeNull();
    expect(resolveProfileBefriendChance("shrine", "tide-sovereign")).toBeNull();
  });

  it("village withholds Spar until first-spar unlocks, then keeps it", () => {
    const village = getHabitatProfile("village");
    expect(shouldShowSparVerb(village, "mossling")).toBe(false);
    questProgress["first-spar"] = "active";
    expect(shouldShowSparVerb(village, "mossling")).toBe(true);
    questProgress["first-spar"] = "complete";
    expect(shouldShowSparVerb(village, "mossling")).toBe(true);
    expect(shouldShowSparVerb(village, "tide-sovereign")).toBe(true);
  });

  it("overworld Flee follow returns the same species once", () => {
    onWildEncounterResolved("overworld", "rootwalker", "flee");
    expect(getOverworldFleeFollowId()).toBe("rootwalker");
    const next = resolveWildEncounterCreature({
      zoneId: "overworld",
      tileX: 5,
      tileY: 5,
      discoveredCreatureIds: [],
    });
    expect(next).toBe("rootwalker");
    expect(getOverworldFleeFollowId()).toBeNull();
  });

  it("overworld Flee does not re-arm an infinite follow chain (#300)", () => {
    const profile = getHabitatProfile("overworld");
    onWildEncounterResolved("overworld", "rootwalker", "flee");
    resolveWildEncounterCreature({
      zoneId: "overworld",
      tileX: 5,
      tileY: 5,
      discoveredCreatureIds: [],
    });
    onWildEncounterResolved("overworld", "rootwalker", "flee");
    expect(getOverworldFleeFollowId()).toBeNull();
    expect(shouldGuaranteeWildTrigger(profile, "overworld")).toBe(false);
  });

  it("overworld Spar clears flee follow so a later Flee can arm again", () => {
    onWildEncounterResolved("overworld", "rootwalker", "flee");
    onWildEncounterResolved("overworld", "rootwalker", "spar");
    onWildEncounterResolved("overworld", "lantern-fox", "flee");
    expect(getOverworldFleeFollowId()).toBe("lantern-fox");
  });

  it("mistwood conceals until action; gods ignore", () => {
    expect(
      shouldConcealReveal(getHabitatProfile("mistwood"), "thunder-finch"),
    ).toBe(true);
    expect(
      encounterTypeLineText(
        !shouldConcealReveal(getHabitatProfile("mistwood"), "thunder-finch"),
        "storm",
      ),
    ).toBeNull();
    expect(encounterTypeLineText(true, "storm")).toBe("Type: storm");
    expect(
      shouldConcealReveal(getHabitatProfile("mistwood"), "tide-sovereign"),
    ).toBe(false);
    expect(profileForEncounter("mistwood", "tide-sovereign")).toEqual(
      DEFAULT_PROFILE,
    );
  });

  it("emberfen Flee persists until Spar/Befriend/leave zone", () => {
    onWildEncounterResolved("emberfen", "peat-sprite", "flee");
    expect(getEmberfenFleeChainId()).toBe("peat-sprite");
    expect(
      resolveWildEncounterCreature({
        zoneId: "emberfen",
        tileX: 3,
        tileY: 3,
        discoveredCreatureIds: [],
      }),
    ).toBe("peat-sprite");
    onWildEncounterResolved("emberfen", "peat-sprite", "spar");
    expect(getEmberfenFleeChainId()).toBeNull();

    onWildEncounterResolved("emberfen", "cinder-toad", "flee");
    onZoneEnter("mistwood", "emberfen");
    expect(getEmberfenFleeChainId()).toBeNull();
  });

  it("archipelago is one encounter per landing until boat leave", () => {
    markArchipelagoLandingEncounter(0);
    expect(hasArchipelagoLandingEncounter(0)).toBe(true);
    expect(
      resolveWildEncounterCreature({
        zoneId: "archipelago",
        tileX: 1,
        tileY: 1,
        islandIndex: 0,
        discoveredCreatureIds: [],
      }),
    ).toBeNull();
    clearArchipelagoLandingEncounters();
    expect(
      resolveWildEncounterCreature({
        zoneId: "archipelago",
        tileX: 1,
        tileY: 1,
        islandIndex: 0,
        discoveredCreatureIds: [],
      }),
    ).toBe("isle-fernling");
  });

  it("harbor rolls discovered−party only on pier/dock/East Landing", () => {
    expect(isHarborEncounterStand(HARBOR_PIER.x, HARBOR_PIER.y)).toBe(true);
    expect(isHarborEncounterStand(HARBOR_DOCK.x, HARBOR_DOCK.y)).toBe(true);
    expect(isHarborEncounterStand(EAST_LANDING.x, EAST_LANDING.y)).toBe(true);
    expect(isHarborEncounterStand(1, 1)).toBe(false);

    setDiscoveredCreatures(["mossling", "ember-wisp"]);
    addToParty("mossling");
    expect(rollHarborCreature(worldState.discoveredCreatures, () => 0)).toBe(
      "ember-wisp",
    );
    expect(
      resolveWildEncounterCreature({
        zoneId: "harbor",
        tileX: 1,
        tileY: 1,
        discoveredCreatureIds: worldState.discoveredCreatures,
        rng: () => 0,
      }),
    ).toBeNull();
    expect(
      resolveWildEncounterCreature({
        zoneId: "harbor",
        tileX: HARBOR_PIER.x,
        tileY: HARBOR_PIER.y,
        discoveredCreatureIds: worldState.discoveredCreatures,
        rng: () => 0,
      }),
    ).toBe("ember-wisp");
  });

  it("harbor withholds Befriend once-per-species after a claim", () => {
    const harbor = getHabitatProfile("harbor");
    expect(shouldOfferHarborBefriend(harbor, "mossling")).toBe(true);
    markHarborBefriendUsed("mossling");
    expect(shouldOfferHarborBefriend(harbor, "mossling")).toBe(false);
    onWildEncounterResolved("harbor", "ember-wisp", "befriend");
    expect(worldState.harborBefriendUsed).toContain("ember-wisp");
  });
});
