import { beforeEach, describe, expect, it } from "vitest";
import {
  isBoatPlaced,
  isNearAnyDock,
  isNearArchipelagoDock,
  isNearEastLandingDock,
  isNearHarborDock,
  isSailing,
  getMooredDock,
  HARBOR_DOCK,
  HARBOR_EMBARK_WATER,
  HARBOR_PIER,
  resetPlacedBoatForTest,
  setPlacedBoat,
  setSailing,
  tryDisembark,
  tryEmbark,
  tryPlaceBoat,
  EAST_LANDING,
  EAST_LANDING_EMBARK_WATER,
  isOnEastLandingApproach,
} from "./dockBoat";
import { canOccupy, isTileWalkable } from "./collision";
import { getZone } from "./zones";
import { TileType } from "./zoneTypes";
import {
  getItemCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { setVisitorMode } from "./worldSession";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  migrateBoatStateToHarbor,
  type WorldSnapshot,
} from "./worldSnapshot";
import { createEmptyQuestProgress, restoreQuestProgress } from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import { setPartyFromSnapshot } from "../creatures/party";
import { setUnlockedAchievements } from "../progression/achievements";
import {
  ARCHIPELAGO,
  ARCHIPELAGO_ENTRY,
  islandTemplateAtIndex,
  prepareArchipelagoForPosition,
  resetArchipelagoStream,
} from "./archipelagoStream";

function allQuestsComplete(): WorldSnapshot["questProgress"] {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "complete" as const]),
  ) as WorldSnapshot["questProgress"];
}

function questProgress(): WorldSnapshot["questProgress"] {
  return allQuestsComplete();
}

beforeEach(() => {
  resetPlacedBoatForTest();
  resetArchipelagoStream();
  setInventoryFromSnapshot({}, {});
  setVisitorMode(false);
  setPartyFromSnapshot([], 1);
  setUnlockedAchievements([]);
  restoreQuestProgress(createEmptyQuestProgress());
});

describe("Folklore Fields south shore after Harbor move", () => {
  it("keeps the water bay but uses Floor for the village gate (no Dock)", () => {
    const zone = getZone("overworld");
    expect(zone.tiles[14][7]).toBe(TileType.Floor);
    expect(zone.tiles[13][7]).toBe(TileType.Floor);
    expect(zone.tiles[14][6]).toBe(TileType.Water);
    expect(zone.tiles[14][8]).toBe(TileType.Water);
    expect(zone.tiles[13][6]).toBe(TileType.Water);
    expect(zone.tiles[13][8]).toBe(TileType.Water);
    expect(isTileWalkable(zone, 7, 14)).toBe(true);
    expect(isTileWalkable(zone, 7, 13)).toBe(true);
    expect(isTileWalkable(zone, 6, 14)).toBe(false);
    expect(isTileWalkable(zone, 6, 13)).toBe(false);
    expect(isTileWalkable(zone, 7, 12)).toBe(true);
    expect(isNearHarborDock("overworld", 7, 13)).toBe(false);
    expect(isNearHarborDock("overworld", 7, 14)).toBe(false);
  });

  it("keeps the village gate spawn on walkable land", () => {
    const village = getZone("village");
    const toOverworld = village.transitions.find((t) => t.targetZone === "overworld");
    expect(toOverworld).toMatchObject({ targetX: 7, targetY: 12 });
    expect(isTileWalkable(getZone("overworld"), 7, 12)).toBe(true);
  });
});

describe("Harbor dock proximity", () => {
  it("treats the Harbor dock and pier as near-dock", () => {
    expect(isNearHarborDock("harbor", HARBOR_DOCK.x, HARBOR_DOCK.y)).toBe(true);
    expect(isNearHarborDock("harbor", HARBOR_PIER.x, HARBOR_PIER.y)).toBe(true);
    expect(isNearHarborDock("harbor", HARBOR_EMBARK_WATER.x, HARBOR_EMBARK_WATER.y)).toBe(
      true,
    );
    expect(isNearHarborDock("harbor", 10, 7)).toBe(false);
  });

  it("treats East Landing pad and approach as dock-interact near range", () => {
    expect(isNearEastLandingDock("harbor", EAST_LANDING.x, EAST_LANDING.y)).toBe(
      true,
    );
    expect(isNearEastLandingDock("harbor", 15, 6)).toBe(true);
    expect(isNearEastLandingDock("harbor", 16, 6)).toBe(true);
    expect(isNearEastLandingDock("harbor", 8, 7)).toBe(false);
    expect(isNearAnyDock("harbor", 15, 6)).toBe(true);
    expect(isNearAnyDock("harbor", HARBOR_DOCK.x, HARBOR_DOCK.y)).toBe(true);
    expect(isNearAnyDock("harbor", 8, 7)).toBe(false);
  });
});

describe("tryPlaceBoat", () => {
  it("places once, consumes the boat, and is idempotent", () => {
    setInventoryFromSnapshot({}, { boat: 2 });
    const first = tryPlaceBoat("harbor", HARBOR_DOCK.x, HARBOR_DOCK.y);
    expect(first).toEqual({
      ok: true,
      message: "Boat moored at the dock.",
      consumed: true,
    });
    expect(isBoatPlaced()).toBe(true);
    expect(getItemCount("boat")).toBe(1);

    const second = tryPlaceBoat("harbor", HARBOR_DOCK.x, HARBOR_DOCK.y);
    expect(second).toEqual({
      ok: true,
      message: "Your boat is already moored.",
      consumed: false,
    });
    expect(getItemCount("boat")).toBe(1);
  });

  it("refuses without a boat item", () => {
    const result = tryPlaceBoat("harbor", HARBOR_DOCK.x, HARBOR_DOCK.y);
    expect(result.ok).toBe(false);
    expect(result.consumed).toBe(false);
    expect(isBoatPlaced()).toBe(false);
  });

  it("blocks visitors", () => {
    setInventoryFromSnapshot({}, { boat: 1 });
    setVisitorMode(true);
    const result = tryPlaceBoat("harbor", HARBOR_DOCK.x, HARBOR_DOCK.y);
    expect(result.ok).toBe(false);
    expect(getItemCount("boat")).toBe(1);
    expect(isBoatPlaced()).toBe(false);
  });

  it("refuses Folklore Fields south even with a boat", () => {
    setInventoryFromSnapshot({}, { boat: 1 });
    const result = tryPlaceBoat("overworld", 7, 14);
    expect(result.ok).toBe(false);
    expect(isBoatPlaced()).toBe(false);
    expect(getItemCount("boat")).toBe(1);
  });
});

describe("embark and disembark", () => {
  it("embarks when the boat is moored near the Harbor dock", () => {
    setPlacedBoat(true);
    const result = tryEmbark("harbor", HARBOR_PIER.x, HARBOR_PIER.y);
    expect(result).toMatchObject({
      ok: true,
      embarked: true,
      playerX: HARBOR_EMBARK_WATER.x,
      playerY: HARBOR_EMBARK_WATER.y,
    });
    expect(result.message).toBe("You set sail.");
    expect(isSailing()).toBe(true);
  });

  it("blocks visitors from embarking", () => {
    setPlacedBoat(true);
    setVisitorMode(true);
    const result = tryEmbark("harbor", HARBOR_PIER.x, HARBOR_PIER.y);
    expect(result.ok).toBe(false);
    expect(isSailing()).toBe(false);
  });

  it("disembarks onto the pier and clears sailing", () => {
    setPlacedBoat(true);
    setSailing(true);
    const result = tryDisembark(
      "harbor",
      HARBOR_EMBARK_WATER.x,
      HARBOR_EMBARK_WATER.y,
    );
    expect(result).toMatchObject({
      ok: true,
      disembarked: true,
      playerX: HARBOR_PIER.x,
      playerY: HARBOR_PIER.y,
    });
    expect(isSailing()).toBe(false);
  });

  it("blocks visitors from disembarking", () => {
    setPlacedBoat(true);
    setSailing(true);
    setVisitorMode(true);
    const result = tryDisembark(
      "harbor",
      HARBOR_EMBARK_WATER.x,
      HARBOR_EMBARK_WATER.y,
    );
    expect(result.ok).toBe(false);
    expect(isSailing()).toBe(true);
  });
});

describe("sailing collision", () => {
  it("allows Harbor Water and Dock while sailing, not Floor land or walls", () => {
    setSailing(true);
    const zone = getZone("harbor");
    expect(isTileWalkable(zone, 4, 7)).toBe(true);
    expect(isTileWalkable(zone, 2, 7)).toBe(true);
    expect(isTileWalkable(zone, 3, 7)).toBe(true);
    expect(canOccupy(zone, 4, 7)).toBe(true);
    // Pier Floor is land — not sail-walkable.
    expect(isTileWalkable(zone, 3, 6)).toBe(false);
    expect(isTileWalkable(zone, 1, 4)).toBe(false);
    expect(isTileWalkable(zone, 0, 0)).toBe(false);
  });

  it("keeps Harbor Water non-walkable on foot", () => {
    expect(isSailing()).toBe(false);
    const zone = getZone("harbor");
    expect(isTileWalkable(zone, 4, 7)).toBe(false);
    expect(isTileWalkable(zone, 2, 7)).toBe(false);
    expect(canOccupy(zone, 4, 7)).toBe(false);
  });
});

describe("placedBoat snapshot", () => {
  it("round-trips placedBoat in the world snapshot", () => {
    setInventoryFromSnapshot({}, {});
    setPlacedBoat(true);
    const snapshot = exportWorldSnapshot({
      zoneId: "harbor",
      x: HARBOR_PIER.x,
      y: HARBOR_PIER.y,
    });
    expect(snapshot.placedBoat).toBe(true);
    expect(snapshot.mooredDock).toBe("west");
    expect(isValidWorldSnapshot(snapshot)).toBe(true);

    resetPlacedBoatForTest();
    applyWorldSnapshot({
      ...snapshot,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
    });
    expect(isBoatPlaced()).toBe(true);
    expect(getMooredDock()).toBe("west");
  });

  it("round-trips east mooredDock after East Landing disembark", () => {
    setPlacedBoat(true);
    setSailing(true);
    expect(tryDisembark("harbor", 15, 6).ok).toBe(true);
    const snapshot = exportWorldSnapshot({
      zoneId: "harbor",
      x: EAST_LANDING.x,
      y: EAST_LANDING.y,
    });
    expect(snapshot.mooredDock).toBe("east");
    resetPlacedBoatForTest();
    applyWorldSnapshot({
      ...snapshot,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
    });
    expect(isBoatPlaced()).toBe(true);
    expect(getMooredDock()).toBe("east");
  });

  it("infers east mooredDock for legacy East Landing auto-arrive saves", () => {
    applyWorldSnapshot({
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      placedBoat: true,
      sailing: false,
      // no mooredDock — pre-#94
      position: { zoneId: "harbor", x: EAST_LANDING.x, y: EAST_LANDING.y },
    });
    expect(isBoatPlaced()).toBe(true);
    expect(getMooredDock()).toBe("east");
  });

  it("treats missing placedBoat as false for older saves", () => {
    setPlacedBoat(true);
    applyWorldSnapshot({
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      position: { zoneId: "grove", x: 3, y: 7 },
    });
    expect(isBoatPlaced()).toBe(false);
  });
});

describe("sailing snapshot", () => {
  it("round-trips sailing true and false", () => {
    setPlacedBoat(true);
    setSailing(true);
    const sailingSnap = exportWorldSnapshot({
      zoneId: "harbor",
      x: HARBOR_EMBARK_WATER.x,
      y: HARBOR_EMBARK_WATER.y,
    });
    expect(sailingSnap.sailing).toBe(true);
    expect(isValidWorldSnapshot(sailingSnap)).toBe(true);

    resetPlacedBoatForTest();
    applyWorldSnapshot({
      ...sailingSnap,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
    });
    expect(isSailing()).toBe(true);

    setSailing(false);
    const dockedSnap = exportWorldSnapshot({
      zoneId: "harbor",
      x: HARBOR_PIER.x,
      y: HARBOR_PIER.y,
    });
    expect(dockedSnap.sailing).toBe(false);
    applyWorldSnapshot({
      ...dockedSnap,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      placedBoat: true,
      sailing: false,
    });
    expect(isSailing()).toBe(false);
  });

  it("treats missing sailing as false for older saves", () => {
    setSailing(true);
    applyWorldSnapshot({
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      placedBoat: true,
      position: { zoneId: "harbor", x: HARBOR_PIER.x, y: HARBOR_PIER.y },
    });
    expect(isSailing()).toBe(false);
  });
});

describe("East Landing dock-only (no auto sail-end)", () => {
  it("keeps sailing when occupying East Landing approach water", () => {
    setPlacedBoat(true);
    setSailing(true);
    expect(isOnEastLandingApproach("harbor", 15, 6)).toBe(true);
    expect(isNearEastLandingDock("harbor", 15, 6)).toBe(true);
    // No auto-arrive: sailing stays true until E-disembark.
    expect(isSailing()).toBe(true);
    setSailing(false);
    expect(isTileWalkable(getZone("harbor"), EAST_LANDING.x, EAST_LANDING.y)).toBe(
      true,
    );
  });

  it("E-disembarks onto East Landing and clears sailing", () => {
    setPlacedBoat(true);
    setSailing(true);
    const result = tryDisembark("harbor", 15, 6);
    expect(result).toMatchObject({
      ok: true,
      disembarked: true,
      playerX: EAST_LANDING.x,
      playerY: EAST_LANDING.y,
    });
    expect(result.message).toBe("You step onto the pier.");
    expect(isSailing()).toBe(false);
  });

  it("reboards from East Landing onto approach water", () => {
    setPlacedBoat(true);
    setSailing(true);
    expect(tryDisembark("harbor", 15, 6).ok).toBe(true);
    expect(getMooredDock()).toBe("east");
    const result = tryEmbark("harbor", EAST_LANDING.x, EAST_LANDING.y);
    expect(result).toMatchObject({
      ok: true,
      embarked: true,
      playerX: EAST_LANDING_EMBARK_WATER.x,
      playerY: EAST_LANDING_EMBARK_WATER.y,
    });
    expect(isSailing()).toBe(true);
  });

  it("refuses boarding at East Landing while the boat is moored west", () => {
    setPlacedBoat(true);
    expect(getMooredDock()).toBe("west");
    const result = tryEmbark("harbor", EAST_LANDING.x, EAST_LANDING.y);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("another dock");
    expect(isSailing()).toBe(false);
  });

  it("refuses boarding at the west dock while the boat is moored east", () => {
    setPlacedBoat(true);
    setSailing(true);
    expect(tryDisembark("harbor", 15, 6).ok).toBe(true);
    expect(getMooredDock()).toBe("east");
    const result = tryEmbark("harbor", HARBOR_PIER.x, HARBOR_PIER.y);
    expect(result.ok).toBe(false);
    expect(isSailing()).toBe(false);
  });

  it("keeps sailing mid-bay away from either dock", () => {
    setPlacedBoat(true);
    setSailing(true);
    expect(isNearAnyDock("harbor", 8, 7)).toBe(false);
    expect(isOnEastLandingApproach("harbor", 8, 7)).toBe(false);
    const midBay = tryDisembark("harbor", 8, 7);
    expect(midBay.ok).toBe(false);
    expect(isSailing()).toBe(true);
  });

  it("blocks visitors from disembarking at East Landing", () => {
    setPlacedBoat(true);
    setSailing(true);
    setVisitorMode(true);
    const result = tryDisembark("harbor", 16, 6);
    expect(result.ok).toBe(false);
    expect(isSailing()).toBe(true);
  });

  it("refuses placing a boat at East Landing", () => {
    setInventoryFromSnapshot({}, { boat: 1 });
    const result = tryPlaceBoat("harbor", EAST_LANDING.x, EAST_LANDING.y);
    expect(result.ok).toBe(false);
    expect(isBoatPlaced()).toBe(false);
    expect(getItemCount("boat")).toBe(1);
  });
});

describe("migrateBoatStateToHarbor", () => {
  it("moves mid-sail Folklore Fields south-bay stands into Harbor water", () => {
    const sailing = {
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      placedBoat: true,
      sailing: true,
      position: { zoneId: "overworld", x: 6, y: 14 },
    };
    migrateBoatStateToHarbor(sailing);
    expect(sailing.position).toEqual({
      zoneId: "harbor",
      x: HARBOR_EMBARK_WATER.x,
      y: HARBOR_EMBARK_WATER.y,
    });
    expect(sailing.sailing).toBe(true);
    expect(isValidWorldSnapshot(sailing)).toBe(true);
  });

  it("moves moored-boat stands near the old dock onto the Harbor pier", () => {
    const moored = {
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      placedBoat: true,
      sailing: false,
      position: { zoneId: "overworld", x: 7, y: 13 },
    };
    migrateBoatStateToHarbor(moored);
    expect(moored.position).toEqual({
      zoneId: "harbor",
      x: HARBOR_PIER.x,
      y: HARBOR_PIER.y,
    });
    expect(isValidWorldSnapshot(moored)).toBe(true);
  });

  it("leaves non-south-bay overworld positions alone", () => {
    const inland = {
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      placedBoat: true,
      position: { zoneId: "overworld", x: 7, y: 12 },
    };
    migrateBoatStateToHarbor(inland);
    expect(inland.position).toEqual({ zoneId: "overworld", x: 7, y: 12 });
  });
});

describe("archipelago island dock embark/disembark", () => {
  it("disembarks onto an island pier and keeps sailing until E", () => {
    const island = islandTemplateAtIndex(0);
    prepareArchipelagoForPosition(island.x);
    setPlacedBoat(true);
    setSailing(true);
    expect(isNearArchipelagoDock("archipelago", island.embarkWater.x, island.embarkWater.y)).toBe(
      true,
    );
    expect(isNearAnyDock("archipelago", island.embarkWater.x, island.embarkWater.y)).toBe(
      true,
    );
    expect(isSailing()).toBe(true);

    const result = tryDisembark(
      "archipelago",
      island.embarkWater.x,
      island.embarkWater.y,
    );
    expect(result).toMatchObject({
      ok: true,
      disembarked: true,
      playerX: island.pier.x,
      playerY: island.pier.y,
    });
    expect(isSailing()).toBe(false);
    expect(isTileWalkable(getZone("archipelago"), island.pier.x, island.pier.y)).toBe(
      true,
    );
  });

  it("reboards from any archipelago dock while the boat is globally placed", () => {
    const lush = islandTemplateAtIndex(0);
    const barren = islandTemplateAtIndex(1);
    prepareArchipelagoForPosition(barren.x);
    setPlacedBoat(true);
    setSailing(true);
    expect(tryDisembark("archipelago", lush.embarkWater.x, lush.embarkWater.y).ok).toBe(
      true,
    );

    // Hop: board at lush, sail to barren, disembark, reboard — no mooredDock gate.
    expect(
      tryEmbark("archipelago", lush.pier.x, lush.pier.y),
    ).toMatchObject({
      ok: true,
      embarked: true,
      playerX: lush.embarkWater.x,
      playerY: lush.embarkWater.y,
    });
    expect(tryDisembark("archipelago", barren.embarkWater.x, barren.embarkWater.y).ok).toBe(
      true,
    );
    const reboard = tryEmbark("archipelago", barren.pier.x, barren.pier.y);
    expect(reboard).toMatchObject({
      ok: true,
      embarked: true,
      playerX: barren.embarkWater.x,
      playerY: barren.embarkWater.y,
    });
    expect(isSailing()).toBe(true);
  });

  it("allows sailing around island water without auto-ending the voyage", () => {
    const island = islandTemplateAtIndex(0);
    prepareArchipelagoForPosition(island.x);
    setPlacedBoat(true);
    setSailing(true);
    // Mid-ocean beside the island — not near the dock.
    const midY = ARCHIPELAGO_ENTRY.y;
    expect(isNearArchipelagoDock("archipelago", island.x, midY)).toBe(false);
    expect(isTileWalkable(getZone("archipelago"), island.x, midY)).toBe(true);
    expect(isTileWalkable(getZone("archipelago"), island.x, midY + 1)).toBe(
      true,
    );
    const mid = tryDisembark("archipelago", island.x, midY);
    expect(mid.ok).toBe(false);
    expect(isSailing()).toBe(true);
  });

  it("refuses placing a boat at an archipelago dock", () => {
    const island = islandTemplateAtIndex(0);
    prepareArchipelagoForPosition(island.x);
    setInventoryFromSnapshot({}, { boat: 1 });
    const result = tryPlaceBoat("archipelago", island.pier.x, island.pier.y);
    expect(result.ok).toBe(false);
    expect(isBoatPlaced()).toBe(false);
    expect(getItemCount("boat")).toBe(1);
  });

  it("does not grow the stream when checking archipelago dock proximity", () => {
    resetArchipelagoStream();
    const widthBefore = ARCHIPELAGO.width;
    const seedDock = islandTemplateAtIndex(0).dock;
    expect(isNearArchipelagoDock("archipelago", seedDock.x, seedDock.y)).toBe(
      true,
    );
    expect(ARCHIPELAGO.width).toBe(widthBefore);
    // Far-east dock not yet stamped — must not mutate width for a prompt scan.
    expect(isNearArchipelagoDock("archipelago", 100, seedDock.y)).toBe(false);
    expect(ARCHIPELAGO.width).toBe(widthBefore);
  });
});
