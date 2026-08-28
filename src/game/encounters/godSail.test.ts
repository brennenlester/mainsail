import { beforeEach, describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import {
  hasCreature,
  playerParty,
  setPartyFromSnapshot,
} from "../creatures/party";
import {
  getItemCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import {
  isGodSailEncounterClaimed,
  isStory1BefriendGuaranteeConsumed,
  setGodSailEncounterClaimed,
  setHorizonFusionCount,
  setStory1BefriendGuaranteeConsumed,
  setTideSovereignObtained,
} from "../world/worldState";
import { restoreQuestProgress } from "../story/questProgress";
import {
  buildArmedWanderer,
  getBestWeaponId,
} from "../battle/wandererWeapons";
import {
  appendGodSailCheatKey,
  appendGodSparKillCheatKey,
  ASSURED_BEFRIEND_LABEL,
  BEFRIEND_MISS_TEXT,
  befriendButtonLabel,
  canAttemptBefriend,
  canForceGodSailEncounter,
  claimTideSovereign,
  createPendingGodSailEncounter,
  formatBefriendOddsPercent,
  formatGodClaimJoinLine,
  getBefriendButtonLabel,
  getBefriendChance,
  getTideSovereignAttack,
  GOD_BEFRIEND_CHANCE,
  GOD_SAIL_ENCOUNTER_CHANCE,
  GOD_SAIL_ENCOUNTER_DELAY_MS,
  isStory1BefriendGuaranteed,
  lockPendingGodSailEncounter,
  NORMAL_BEFRIEND_CHANCE,
  resolveTideSovereignOutcome,
  rollBefriendAttempt,
  rollGodSailEncounter,
  shouldAttemptGodSailEncounter,
  shouldAttemptHermitTideEncounter,
  TIDE_CLEAVER_ID,
  TIDE_SOVEREIGN_ATTACK_PATTERN,
  TIDE_SOVEREIGN_ID,
} from "./godSail";
import { HERMIT_ISLAND_INDEX } from "../world/hermitIsland";
import {
  ENCOUNTER_TRAVEL_THRESHOLD,
  getHabitatsForCreature,
  ZONE_ENCOUNTERS,
} from "./tables";

describe("god sail encounter", () => {
  beforeEach(() => {
    setPartyFromSnapshot([], 1);
    setInventoryFromSnapshot({}, {});
    setGodSailEncounterClaimed(false, false);
    setStory1BefriendGuaranteeConsumed(false, false);
    setTideSovereignObtained(0, false);
    setHorizonFusionCount(0, false);
    restoreQuestProgress({
      "first-befriend": "active",
      "first-spar": "locked",
      "reach-village": "locked",
      "shrine-craft": "locked",
    });
  });

  it("uses a deterministic 1/100 roll boundary without Monte Carlo", () => {
    expect(ENCOUNTER_TRAVEL_THRESHOLD).toBe(0.75);
    expect(GOD_SAIL_ENCOUNTER_CHANCE).toBe(0.01);
    expect(rollGodSailEncounter(() => 0)).toBe(true);
    expect(rollGodSailEncounter(() => 0.009999)).toBe(true);
    expect(rollGodSailEncounter(() => 0.01)).toBe(false);
  });

  it("allows Tide rolls on the hermit island while on foot", () => {
    const valid = {
      sailing: false,
      zoneId: "archipelago" as const,
      islandIndex: HERMIT_ISLAND_INDEX,
      visitor: false,
      claimed: false,
    };
    expect(shouldAttemptHermitTideEncounter(valid)).toBe(true);
    expect(
      shouldAttemptHermitTideEncounter({ ...valid, islandIndex: HERMIT_ISLAND_INDEX + 1 }),
    ).toBe(false);
    expect(shouldAttemptHermitTideEncounter({ ...valid, sailing: true })).toBe(
      false,
    );
  });

  it("only allows natural rolls for solo open-water Archipelago sailing", () => {
    const valid = {
      sailing: true,
      zoneId: "archipelago" as const,
      islandIndex: null,
      visitor: false,
      claimed: false,
    };
    expect(shouldAttemptGodSailEncounter(valid)).toBe(true);
    expect(shouldAttemptGodSailEncounter({ ...valid, sailing: false })).toBe(false);
    expect(shouldAttemptGodSailEncounter({ ...valid, zoneId: "harbor" })).toBe(false);
    expect(shouldAttemptGodSailEncounter({ ...valid, islandIndex: 0 })).toBe(false);
    expect(shouldAttemptGodSailEncounter({ ...valid, visitor: true })).toBe(false);
    expect(shouldAttemptGodSailEncounter({ ...valid, claimed: true })).toBe(true);
    setInventoryFromSnapshot({}, { "tide-crown": 1 });
    expect(shouldAttemptGodSailEncounter({ ...valid, claimed: true })).toBe(false);
    setInventoryFromSnapshot({}, { "tide-crown": 1, "sovereign-plate": 1 });
    expect(shouldAttemptGodSailEncounter({ ...valid, claimed: true })).toBe(true);
  });

  it("keeps the god out of normal encounter tables and the codex", () => {
    expect(getHabitatsForCreature(TIDE_SOVEREIGN_ID)).toEqual([]);
    expect(
      Object.values(ZONE_ENCOUNTERS).flat().some(({ id }) => id === TIDE_SOVEREIGN_ID),
    ).toBe(false);
    expect(getCreatureDefinition(TIDE_SOVEREIGN_ID).excludeFromCodex).toBe(true);
  });

  it("detects 0319 and creates an origin-locked 10-second pending encounter", () => {
    let buffer = "";
    for (const key of ["x", "0", "3", "1"]) {
      const result = appendGodSailCheatKey(buffer, key);
      buffer = result.buffer;
      expect(result.triggered).toBe(false);
    }
    const result = appendGodSailCheatKey(buffer, "9");
    expect(result.triggered).toBe(true);
    expect(
      canForceGodSailEncounter({
        sailing: true,
        zoneId: "archipelago",
        visitor: false,
      }),
    ).toBe(true);
    expect(
      canForceGodSailEncounter({
        sailing: true,
        zoneId: "archipelago",
        visitor: true,
      }),
    ).toBe(false);

    const naturallyClaimed = {
      sailing: true,
      zoneId: "archipelago" as const,
      islandIndex: null,
      visitor: false,
      claimed: true,
    };
    const naturallyOnIsland = {
      ...naturallyClaimed,
      islandIndex: 3,
      claimed: false,
    };
    setInventoryFromSnapshot({}, { "tide-crown": 1 });
    expect(shouldAttemptGodSailEncounter(naturallyClaimed)).toBe(false);
    expect(shouldAttemptGodSailEncounter(naturallyOnIsland)).toBe(false);
    expect(canForceGodSailEncounter(naturallyClaimed)).toBe(true);
    expect(canForceGodSailEncounter(naturallyOnIsland)).toBe(true);

    const pending = createPendingGodSailEncounter(12.25, 7.5, true);
    expect(pending).toMatchObject({
      creatureId: TIDE_SOVEREIGN_ID,
      delayMs: GOD_SAIL_ENCOUNTER_DELAY_MS,
      forced: true,
      origin: { x: 12.25, y: 7.5 },
    });
    expect(Object.isFrozen(pending.origin)).toBe(true);

    const firstLock = lockPendingGodSailEncounter(undefined, 12.25, 7.5, true);
    const movementAttempt = lockPendingGodSailEncounter(
      firstLock.pending,
      20,
      30,
      false,
    );
    expect(firstLock.acquired).toBe(true);
    expect(movementAttempt.acquired).toBe(false);
    expect(movementAttempt.pending).toBe(firstLock.pending);
    expect(movementAttempt.pending.origin).toEqual({ x: 12.25, y: 7.5 });
  });

  it("detects the temporary 0601 god-spar kill cheat", () => {
    let buffer = "";
    for (const key of ["x", "0", "6", "0"]) {
      const result = appendGodSparKillCheatKey(buffer, key);
      buffer = result.buffer;
      expect(result.triggered).toBe(false);
    }

    expect(appendGodSparKillCheatKey(buffer, "1")).toEqual({
      buffer: "0601",
      triggered: true,
    });
  });

  it("uses the difficult god befriend rate without changing normal encounters", () => {
    expect(GOD_BEFRIEND_CHANCE).toBe(0.08);
    expect(getBefriendChance(TIDE_SOVEREIGN_ID)).toBe(GOD_BEFRIEND_CHANCE);
    expect(getBefriendChance("mossling")).toBe(NORMAL_BEFRIEND_CHANCE);
    expect(NORMAL_BEFRIEND_CHANCE).toBe(0.55);
  });

  it("prints the same percent the befriend resolver uses", () => {
    expect(formatBefriendOddsPercent(NORMAL_BEFRIEND_CHANCE)).toBe("55%");
    expect(formatBefriendOddsPercent(GOD_BEFRIEND_CHANCE)).toBe("8%");
    setStory1BefriendGuaranteeConsumed(true, false);
    expect(befriendButtonLabel(getBefriendChance("mossling"))).toBe(
      "Befriend 55%",
    );
    expect(getBefriendButtonLabel("mossling")).toBe("Befriend 55%");
    expect(befriendButtonLabel(getBefriendChance(TIDE_SOVEREIGN_ID))).toBe(
      "Befriend 8%",
    );
  });

  it("labels the Story 1 first befriend as assured instead of 55%", () => {
    expect(isStory1BefriendGuaranteed("mossling")).toBe(true);
    expect(getBefriendButtonLabel("mossling")).toBe(ASSURED_BEFRIEND_LABEL);
    expect(getBefriendButtonLabel("mossling")).not.toContain("55%");
    expect(getBefriendButtonLabel(TIDE_SOVEREIGN_ID)).toBe("Befriend 8%");
  });

  it("guarantees the first Story 1 befriend without consulting Math.random", () => {
    expect(rollBefriendAttempt("mossling", () => 0.99)).toBe(true);
    expect(isStory1BefriendGuaranteeConsumed()).toBe(true);
    expect(isStory1BefriendGuaranteed("mossling")).toBe(false);
    expect(rollBefriendAttempt("mossling", () => 0.99)).toBe(false);
  });

  it("does not apply the Story 1 guarantee to god creatures", () => {
    expect(isStory1BefriendGuaranteed(TIDE_SOVEREIGN_ID)).toBe(false);
    expect(rollBefriendAttempt(TIDE_SOVEREIGN_ID, () => 0.99)).toBe(false);
    expect(isStory1BefriendGuaranteeConsumed()).toBe(false);
    expect(isStory1BefriendGuaranteed("mossling")).toBe(true);
  });

  it("does not guarantee befriend after Story 1 completes", () => {
    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "active",
      "reach-village": "locked",
      "shrine-craft": "locked",
    });
    expect(isStory1BefriendGuaranteed("mossling")).toBe(false);
    expect(getBefriendButtonLabel("mossling")).toBe("Befriend 55%");
    expect(rollBefriendAttempt("mossling", () => 0.99)).toBe(false);
    expect(isStory1BefriendGuaranteeConsumed()).toBe(false);
  });

  it("uses a miss line that is not the old slip copy and not empty", () => {
    expect(BEFRIEND_MISS_TEXT.length).toBeGreaterThan(0);
    expect(BEFRIEND_MISS_TEXT.toLowerCase()).not.toMatch(/slipped away/);
  });

  it("allows only one befriend roll per encounter", () => {
    expect(canAttemptBefriend(false)).toBe(true);
    expect(canAttemptBefriend(true)).toBe(false);
  });

  it("cycles flat sovereign attacks as 10, 15, 10, 20", () => {
    expect(
      Array.from({ length: 8 }, (_, index) => {
        const attack = getTideSovereignAttack(index);
        return [attack.move.name, attack.damage];
      }),
    ).toEqual([
      ["Still Tide", 10],
      ["Abyss Surge", 15],
      ["Still Tide", 10],
      ["Crown Crash", 20],
      ["Still Tide", 10],
      ["Abyss Surge", 15],
      ["Still Tide", 10],
      ["Crown Crash", 20],
    ]);
    expect(TIDE_SOVEREIGN_ATTACK_PATTERN).toHaveLength(4);
    expect(getCreatureDefinition(TIDE_SOVEREIGN_ID).moves).toEqual([
      { id: "still-tide", name: "Still Tide", power: 10, type: "water", accuracy: 100 },
      { id: "abyss-surge", name: "Abyss Surge", power: 15, type: "water", accuracy: 100 },
      { id: "crown-crash", name: "Crown Crash", power: 20, type: "water", accuracy: 100 },
    ]);
  });

  it("claims a spar-killed god as fainted with one weapon and a permanent flag", () => {
    expect(resolveTideSovereignOutcome("flee")).toBeNull();
    expect(isGodSailEncounterClaimed()).toBe(false);
    expect(hasCreature(TIDE_SOVEREIGN_ID)).toBe(false);
    expect(getItemCount(TIDE_CLEAVER_ID)).toBe(0);

    expect(resolveTideSovereignOutcome("spar-win")).toEqual({
      creatureAdded: true,
      weaponGranted: true,
      crownGranted: true,
    });
    expect(hasCreature(TIDE_SOVEREIGN_ID)).toBe(true);
    expect(playerParty.creatures[0]?.currentHp).toBe(0);
    expect(getItemCount(TIDE_CLEAVER_ID)).toBe(1);
    expect(getItemCount("tide-crown")).toBe(1);
    expect(isGodSailEncounterClaimed()).toBe(true);
    expect(getBestWeaponId()).toBe(TIDE_CLEAVER_ID);
    expect(buildArmedWanderer(TIDE_CLEAVER_ID)).toMatchObject({
      maxHp: 36,
      attack: 16,
      defense: 6,
      moves: [
        { id: "cleave", power: 14, type: "earth" },
        { id: "riptide", power: 10, type: "earth" },
      ],
    });

    expect(claimTideSovereign()).toEqual({
      creatureAdded: true,
      weaponGranted: false,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(2);
    expect(claimTideSovereign()).toEqual({
      creatureAdded: false,
      weaponGranted: false,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(2);
    expect(getItemCount(TIDE_CLEAVER_ID)).toBe(1);
  });

  it("grants crown without party join when Sovereign Plate is owned", () => {
    setInventoryFromSnapshot({}, { "sovereign-plate": 1 });
    expect(resolveTideSovereignOutcome("spar-win")).toEqual({
      creatureAdded: false,
      weaponGranted: true,
      crownGranted: true,
    });
    expect(hasCreature(TIDE_SOVEREIGN_ID)).toBe(false);
    expect(getItemCount("tide-crown")).toBe(1);
    expect(getItemCount(TIDE_CLEAVER_ID)).toBe(1);
    expect(isGodSailEncounterClaimed()).toBe(true);
  });

  it("grants crown on befriend when Sovereign Plate is owned without party join", () => {
    setInventoryFromSnapshot({}, { "sovereign-plate": 1 });
    expect(resolveTideSovereignOutcome("befriend")).toEqual({
      creatureAdded: false,
      weaponGranted: true,
      crownGranted: true,
    });
    expect(hasCreature(TIDE_SOVEREIGN_ID)).toBe(false);
    expect(getItemCount("tide-crown")).toBe(1);
  });

  it("does not add a third Tide after the two-copy cap", () => {
    claimTideSovereign();
    claimTideSovereign();
    expect(playerParty.creatures).toHaveLength(2);
    expect(claimTideSovereign()).toEqual({
      creatureAdded: false,
      weaponGranted: false,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(2);
  });

  it("does not add a Tide after two Horizon fusions even if none remain in the party", () => {
    setHorizonFusionCount(2, false);
    expect(claimTideSovereign()).toEqual({
      creatureAdded: false,
      weaponGranted: true,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(0);
  });

  it("claims a befriended god with the same fainted one-time outcome", () => {
    expect(resolveTideSovereignOutcome("befriend")).toEqual({
      creatureAdded: true,
      weaponGranted: true,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(1);
    expect(playerParty.creatures[0]).toMatchObject({
      definitionId: TIDE_SOVEREIGN_ID,
      currentHp: 0,
    });
    expect(getItemCount(TIDE_CLEAVER_ID)).toBe(1);
    expect(getItemCount("tide-crown")).toBe(0);
    expect(isGodSailEncounterClaimed()).toBe(true);
    expect(
      shouldAttemptGodSailEncounter({
        sailing: true,
        zoneId: "archipelago",
        islandIndex: null,
        visitor: false,
        claimed: true,
      }),
    ).toBe(true);
  });

  it("omits the weapon from a second-claim join line", () => {
    expect(
      formatGodClaimJoinLine(
        "Tide Sovereign",
        "Tide Cleaver",
        { creatureAdded: true, weaponGranted: true, crownGranted: true },
        true,
        "Tide Crown",
      ),
    ).toBe(
      "The defeated Tide Sovereign joined you, fainted. Tide Cleaver and Tide Crown obtained!",
    );
    expect(
      formatGodClaimJoinLine(
        "Stone Sovereign",
        "Cairn Maul",
        { creatureAdded: true, weaponGranted: false, crownGranted: false },
        false,
      ),
    ).toBe("The Stone Sovereign joined you, fainted.");
    expect(
      formatGodClaimJoinLine(
        "Tide Sovereign",
        "Tide Cleaver",
        { creatureAdded: false, weaponGranted: false, crownGranted: false },
        false,
      ),
    ).toBe("Tide Sovereign slips away.");
  });
});
