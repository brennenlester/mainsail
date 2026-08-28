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
  isGodLandEncounterClaimed,
  setCairnSovereignObtained,
  setGodLandEncounterClaimed,
  setHorizonFusionCount,
} from "../world/worldState";
import { TileType } from "../world/zoneTypes";
import {
  buildArmedWanderer,
  getBestWeaponId,
} from "../battle/wandererWeapons";
import { getBefriendChance, GOD_BEFRIEND_CHANCE } from "./godSail";
import {
  appendGodLandCheatKey,
  CAIRN_MAUL_ID,
  CAIRN_SOVEREIGN_ATTACK_PATTERN,
  CAIRN_SOVEREIGN_ID,
  canForceGodLandEncounter,
  claimCairnSovereign,
  createPendingGodLandEncounter,
  getCairnSovereignAttack,
  GOD_LAND_ENCOUNTER_CHANCE,
  GOD_LAND_ENCOUNTER_DELAY_MS,
  isWalkableLandTile,
  lockPendingGodLandEncounter,
  resolveCairnSovereignOutcome,
  rollGodLandEncounter,
  shouldAttemptGodLandEncounter,
} from "./godLand";
import { CAIRN_ISLAND_INDEX } from "../world/cairnIsland";
import {
  ENCOUNTER_TRAVEL_THRESHOLD,
  getHabitatsForCreature,
  ZONE_ENCOUNTERS,
} from "./tables";

describe("god land encounter", () => {
  beforeEach(() => {
    setPartyFromSnapshot([], 1);
    setInventoryFromSnapshot({}, {});
    setGodLandEncounterClaimed(false, false);
    setCairnSovereignObtained(0, false);
    setHorizonFusionCount(0, false);
  });

  it("uses a deterministic 1/100 roll boundary without Monte Carlo", () => {
    expect(ENCOUNTER_TRAVEL_THRESHOLD).toBe(0.75);
    expect(GOD_LAND_ENCOUNTER_CHANCE).toBe(0.01);
    expect(rollGodLandEncounter(() => 0)).toBe(true);
    expect(rollGodLandEncounter(() => 0.009999)).toBe(true);
    expect(rollGodLandEncounter(() => 0.01)).toBe(false);
  });

  it("only allows natural rolls for solo Cairn island walking", () => {
    const valid = {
      sailing: false,
      zoneId: "archipelago" as const,
      islandIndex: CAIRN_ISLAND_INDEX,
      walkableLand: true,
      visitor: false,
      claimed: false,
    };
    expect(shouldAttemptGodLandEncounter(valid)).toBe(true);
    expect(
      shouldAttemptGodLandEncounter({ ...valid, islandIndex: CAIRN_ISLAND_INDEX + 1 }),
    ).toBe(false);
    expect(shouldAttemptGodLandEncounter({ ...valid, sailing: true })).toBe(
      false,
    );
    expect(shouldAttemptGodLandEncounter({ ...valid, zoneId: "grove" })).toBe(
      false,
    );
    expect(shouldAttemptGodLandEncounter({ ...valid, zoneId: "mistwood" })).toBe(
      false,
    );
    expect(
      shouldAttemptGodLandEncounter({ ...valid, zoneId: "overworld" }),
    ).toBe(false);
    expect(
      shouldAttemptGodLandEncounter({ ...valid, walkableLand: false }),
    ).toBe(false);
    expect(shouldAttemptGodLandEncounter({ ...valid, visitor: true })).toBe(
      false,
    );
    expect(shouldAttemptGodLandEncounter({ ...valid, claimed: true })).toBe(
      true,
    );
    setInventoryFromSnapshot({}, { "boulder-crown": 1 });
    expect(shouldAttemptGodLandEncounter({ ...valid, claimed: true })).toBe(
      false,
    );
    setInventoryFromSnapshot({}, { "boulder-crown": 1, "sovereign-plate": 1 });
    expect(shouldAttemptGodLandEncounter({ ...valid, claimed: true })).toBe(
      true,
    );
  });

  it("treats floor and overworld-gate as walkable land, not water or dock", () => {
    expect(isWalkableLandTile(TileType.Floor)).toBe(true);
    expect(isWalkableLandTile(TileType.OverworldGate)).toBe(true);
    expect(isWalkableLandTile(TileType.Water)).toBe(false);
    expect(isWalkableLandTile(TileType.Dock)).toBe(false);
    expect(isWalkableLandTile(TileType.Wall)).toBe(false);
    expect(isWalkableLandTile(undefined)).toBe(false);
  });

  it("keeps the god out of normal encounter tables and the codex", () => {
    expect(getHabitatsForCreature(CAIRN_SOVEREIGN_ID)).toEqual([]);
    expect(
      Object.values(ZONE_ENCOUNTERS)
        .flat()
        .some(({ id }) => id === CAIRN_SOVEREIGN_ID),
    ).toBe(false);
    expect(getCreatureDefinition(CAIRN_SOVEREIGN_ID).name).toBe("Stone Sovereign");
    expect(getCreatureDefinition(CAIRN_SOVEREIGN_ID).excludeFromCodex).toBe(
      true,
    );
  });

  it("detects 0420 and creates an origin-locked 10-second pending encounter", () => {
    let buffer = "";
    for (const key of ["x", "0", "4", "2"]) {
      const result = appendGodLandCheatKey(buffer, key);
      buffer = result.buffer;
      expect(result.triggered).toBe(false);
    }
    const result = appendGodLandCheatKey(buffer, "0");
    expect(result.triggered).toBe(true);
    expect(
      canForceGodLandEncounter({
        sailing: false,
        zoneId: "archipelago",
        visitor: false,
      }),
    ).toBe(true);
    expect(
      canForceGodLandEncounter({
        sailing: false,
        zoneId: "archipelago",
        visitor: true,
      }),
    ).toBe(false);
    expect(
      canForceGodLandEncounter({
        sailing: true,
        zoneId: "archipelago",
        visitor: false,
      }),
    ).toBe(false);

    const naturallyClaimed = {
      sailing: false,
      zoneId: "archipelago" as const,
      islandIndex: CAIRN_ISLAND_INDEX,
      walkableLand: true,
      visitor: false,
      claimed: true,
    };
    const naturallyOnWater = {
      ...naturallyClaimed,
      walkableLand: false,
      claimed: false,
    };
    setInventoryFromSnapshot({}, { "boulder-crown": 1 });
    expect(shouldAttemptGodLandEncounter(naturallyClaimed)).toBe(false);
    expect(shouldAttemptGodLandEncounter(naturallyOnWater)).toBe(false);
    expect(canForceGodLandEncounter(naturallyClaimed)).toBe(true);
    expect(canForceGodLandEncounter(naturallyOnWater)).toBe(true);

    const pending = createPendingGodLandEncounter(7, 12, true);
    expect(pending).toMatchObject({
      creatureId: CAIRN_SOVEREIGN_ID,
      delayMs: GOD_LAND_ENCOUNTER_DELAY_MS,
      forced: true,
      origin: { x: 7, y: 12 },
    });
    expect(Object.isFrozen(pending.origin)).toBe(true);

    const firstLock = lockPendingGodLandEncounter(undefined, 7, 12, true);
    const movementAttempt = lockPendingGodLandEncounter(
      firstLock.pending,
      8,
      9,
      false,
    );
    expect(firstLock.acquired).toBe(true);
    expect(movementAttempt.acquired).toBe(false);
    expect(movementAttempt.pending).toBe(firstLock.pending);
    expect(movementAttempt.pending.origin).toEqual({ x: 7, y: 12 });
  });

  it("uses the difficult god befriend rate", () => {
    expect(getBefriendChance(CAIRN_SOVEREIGN_ID)).toBe(GOD_BEFRIEND_CHANCE);
  });

  it("cycles flat sovereign attacks as 10, 15, 10, 20", () => {
    expect(
      Array.from({ length: 8 }, (_, index) => {
        const attack = getCairnSovereignAttack(index);
        return [attack.move.name, attack.damage];
      }),
    ).toEqual([
      ["Grave Hum", 10],
      ["Cairn Crash", 15],
      ["Grave Hum", 10],
      ["Ridge Fall", 20],
      ["Grave Hum", 10],
      ["Cairn Crash", 15],
      ["Grave Hum", 10],
      ["Ridge Fall", 20],
    ]);
    expect(CAIRN_SOVEREIGN_ATTACK_PATTERN).toHaveLength(4);
    expect(getCreatureDefinition(CAIRN_SOVEREIGN_ID).moves).toEqual([
      { id: "grave-hum", name: "Grave Hum", power: 10, type: "earth", accuracy: 100 },
      { id: "cairn-crash", name: "Cairn Crash", power: 15, type: "earth", accuracy: 100 },
      { id: "ridge-fall", name: "Ridge Fall", power: 20, type: "earth", accuracy: 100 },
    ]);
  });

  it("claims a spar-killed god as fainted with one weapon and a permanent flag", () => {
    expect(resolveCairnSovereignOutcome("flee")).toBeNull();
    expect(isGodLandEncounterClaimed()).toBe(false);
    expect(hasCreature(CAIRN_SOVEREIGN_ID)).toBe(false);
    expect(getItemCount(CAIRN_MAUL_ID)).toBe(0);

    expect(resolveCairnSovereignOutcome("spar-win")).toEqual({
      creatureAdded: true,
      weaponGranted: true,
      crownGranted: true,
    });
    expect(hasCreature(CAIRN_SOVEREIGN_ID)).toBe(true);
    expect(playerParty.creatures[0]?.currentHp).toBe(0);
    expect(getItemCount(CAIRN_MAUL_ID)).toBe(1);
    expect(getItemCount("boulder-crown")).toBe(1);
    expect(isGodLandEncounterClaimed()).toBe(true);
    expect(getBestWeaponId()).toBe(CAIRN_MAUL_ID);
    expect(buildArmedWanderer(CAIRN_MAUL_ID)).toMatchObject({
      maxHp: 36,
      attack: 16,
      defense: 6,
      moves: [
        { id: "crush", power: 14, type: "earth" },
        { id: "quake", power: 10, type: "earth" },
      ],
    });

    expect(claimCairnSovereign()).toEqual({
      creatureAdded: true,
      weaponGranted: false,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(2);
    expect(claimCairnSovereign()).toEqual({
      creatureAdded: false,
      weaponGranted: false,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(2);
    expect(getItemCount(CAIRN_MAUL_ID)).toBe(1);
  });

  it("grants crown without party join when Sovereign Plate is owned", () => {
    setInventoryFromSnapshot({}, { "sovereign-plate": 1 });
    expect(resolveCairnSovereignOutcome("spar-win")).toEqual({
      creatureAdded: false,
      weaponGranted: true,
      crownGranted: true,
    });
    expect(hasCreature(CAIRN_SOVEREIGN_ID)).toBe(false);
    expect(getItemCount("boulder-crown")).toBe(1);
    expect(getItemCount(CAIRN_MAUL_ID)).toBe(1);
    expect(isGodLandEncounterClaimed()).toBe(true);
  });

  it("grants crown on befriend when Sovereign Plate is owned without party join", () => {
    setInventoryFromSnapshot({}, { "sovereign-plate": 1 });
    expect(resolveCairnSovereignOutcome("befriend")).toEqual({
      creatureAdded: false,
      weaponGranted: true,
      crownGranted: true,
    });
    expect(hasCreature(CAIRN_SOVEREIGN_ID)).toBe(false);
    expect(getItemCount("boulder-crown")).toBe(1);
  });

  it("does not add a third Stone Sovereign after the two-copy cap", () => {
    claimCairnSovereign();
    claimCairnSovereign();
    expect(playerParty.creatures).toHaveLength(2);
    expect(claimCairnSovereign()).toEqual({
      creatureAdded: false,
      weaponGranted: false,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(2);
  });

  it("claims a befriended god with the same fainted one-time outcome", () => {
    expect(resolveCairnSovereignOutcome("befriend")).toEqual({
      creatureAdded: true,
      weaponGranted: true,
      crownGranted: false,
    });
    expect(playerParty.creatures).toHaveLength(1);
    expect(playerParty.creatures[0]).toMatchObject({
      definitionId: CAIRN_SOVEREIGN_ID,
      currentHp: 0,
    });
    expect(getItemCount(CAIRN_MAUL_ID)).toBe(1);
    expect(getItemCount("boulder-crown")).toBe(0);
    expect(isGodLandEncounterClaimed()).toBe(true);
    expect(
      shouldAttemptGodLandEncounter({
        sailing: false,
        zoneId: "archipelago",
        islandIndex: CAIRN_ISLAND_INDEX,
        walkableLand: true,
        visitor: false,
        claimed: true,
      }),
    ).toBe(true);
  });

  it("keeps Tide Cleaver preferred when both god weapons are owned", () => {
    setInventoryFromSnapshot({}, { "tide-cleaver": 1, "cairn-maul": 1 });
    expect(getBestWeaponId()).toBe("tide-cleaver");
  });
});
