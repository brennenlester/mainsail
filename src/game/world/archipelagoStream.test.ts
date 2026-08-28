import { beforeEach, describe, expect, it } from "vitest";
import { isTileWalkable } from "./collision";
import {
  ARCHIPELAGO,
  ARCHIPELAGO_ENTRY,
  ARCHIPELAGO_HEIGHT,
  ARCHIPELAGO_INITIAL_WIDTH,
  ARCHIPELAGO_LOOKBEHIND,
  ARCHIPELAGO_MAX_WIDTH,
  ARCHIPELAGO_WEST_RETURN_ROWS,
  HARBOR_EAST_SAIL_GATES,
  ISLAND_COLS,
  ISLAND_ORIGIN_X,
  ISLAND_ORIGIN_Y,
  ISLAND_ROWS,
  ISLAND_SPACING,
  ISLAND_WIDTH,
  allowsSailZoneTransition,
  archipelagoVisualCullBefore,
  biomeAtIslandTile,
  ensureArchipelagoChunksAround,
  findNearestIslandDock,
  getArchipelagoProps,
  isArchipelagoIslandPosition,
  isArchipelagoSailPosition,
  islandCellAt,
  islandIndexAtTile,
  islandTemplateAtIndex,
  listIslandTemplates,
  prepareArchipelagoForPosition,
  resetArchipelagoStream,
  ARCHIPELAGO_VISUAL_AHEAD,
  ARCHIPELAGO_VISUAL_MARGIN_Y,
  ARCHIPELAGO_GATE_COLUMNS,
  archipelagoVisualWindow,
  isInArchipelagoVisualWindow} from "./archipelagoStream";
import { getZone, ZONES } from "./zones";
import { TileType } from "./zoneTypes";
import { getZoneProps } from "./zoneProps";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  type WorldSnapshot,
} from "./worldSnapshot";
import { createEmptyQuestProgress, restoreQuestProgress } from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import { setPartyFromSnapshot } from "../creatures/party";
import { setUnlockedAchievements } from "../progression/achievements";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import { setVisitorMode } from "./worldSession";
import {
  isSailing,
  resetPlacedBoatForTest,
  setSailing,
} from "./dockBoat";

function questProgress(): WorldSnapshot["questProgress"] {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "complete" as const]),
  ) as WorldSnapshot["questProgress"];
}

beforeEach(() => {
  resetArchipelagoStream();
  resetPlacedBoatForTest();
  setSailing(false);
  setVisitorMode(false);
});

describe("archipelago zone shell", () => {
  it("registers a 100×100 open ocean archipelago", () => {
    expect(ZONES.archipelago).toBeDefined();
    expect(ZONES.archipelago).toBe(ARCHIPELAGO);
    const zone = getZone("archipelago");
    expect(zone.name).toBe("Open Archipelago");
    expect(ARCHIPELAGO_HEIGHT).toBe(100);
    expect(ARCHIPELAGO_INITIAL_WIDTH).toBe(100);
    expect(ARCHIPELAGO_MAX_WIDTH).toBe(100);
    expect(zone.width).toBe(100);
    expect(zone.height).toBe(100);
    expect(zone.tiles[ARCHIPELAGO_ENTRY.y][ARCHIPELAGO_ENTRY.x]).toBe(
      TileType.Water,
    );
    expect(zone.tiles[0][0]).toBe(TileType.Water);
    expect(zone.tiles[ARCHIPELAGO_HEIGHT - 1][0]).toBe(TileType.Water);
    expect(zone.tiles[0][ARCHIPELAGO_MAX_WIDTH - 1]).toBe(TileType.Water);
    expect(zone.tiles[ARCHIPELAGO_HEIGHT - 1][ARCHIPELAGO_MAX_WIDTH - 1]).toBe(
      TileType.Water,
    );
    for (const y of ARCHIPELAGO_WEST_RETURN_ROWS) {
      expect(zone.tiles[y][0]).toBe(TileType.Water);
    }
  });

  it("wires Harbor east water ↔ archipelago west for sail continuity", () => {
    const harbor = getZone("harbor");
    for (const gate of HARBOR_EAST_SAIL_GATES) {
      const t = harbor.transitions.find(
        (tr) => tr.x === gate.x && tr.y === gate.y,
      );
      expect(t).toMatchObject({
        targetZone: "archipelago",
        targetX: ARCHIPELAGO_ENTRY.x,
        targetY: ARCHIPELAGO_ENTRY.y,
      });
      expect(harbor.tiles[gate.y][gate.x]).toBe(TileType.Water);
    }

    const archipelago = getZone("archipelago");
    const back = archipelago.transitions.find((t) => t.targetZone === "harbor");
    expect(back).toMatchObject({
      x: 0,
      targetZone: "harbor",
      targetX: 16,
    });
    expect(ARCHIPELAGO_ENTRY).toEqual({ x: 1, y: 50 });
    expect(isTileWalkable(getZone("harbor"), 16, 7)).toBe(false); // water on foot
  });

  it("does not put an auto-enter transition on East Landing pads", () => {
    const harbor = getZone("harbor");
    expect(
      harbor.transitions.some(
        (t) =>
          t.targetZone === "archipelago" &&
          ((t.x === 15 || t.x === 16) && (t.y === 4 || t.y === 5)),
      ),
    ).toBe(false);
  });
});

describe("sail-preserving Harbor → archipelago transition", () => {
  it("allows sail transitions only between Harbor and Archipelago", () => {
    expect(allowsSailZoneTransition("harbor", "archipelago")).toBe(true);
    expect(allowsSailZoneTransition("archipelago", "harbor")).toBe(true);
    expect(allowsSailZoneTransition("harbor", "overworld")).toBe(false);
    expect(allowsSailZoneTransition("grove", "shrine")).toBe(false);
  });

  it("keeps sailing flag true across a simulated Harbor → archipelago hop", () => {
    setSailing(true);
    expect(allowsSailZoneTransition("harbor", "archipelago")).toBe(true);
    prepareArchipelagoForPosition(ARCHIPELAGO_ENTRY.x);
    expect(isSailing()).toBe(true);
    expect(
      getZone("archipelago").tiles[ARCHIPELAGO_ENTRY.y][ARCHIPELAGO_ENTRY.x],
    ).toBe(TileType.Water);
  });
});

describe("archipelago 2D island grid", () => {
  it("places sixteen 9×9 islands on a 4×4 grid with sail gaps", () => {
    const islands = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH);
    expect(islands).toHaveLength(16);
    expect(ISLAND_COLS * ISLAND_ROWS).toBe(16);
    expect(ISLAND_WIDTH).toBe(9);
    expect(ISLAND_SPACING).toBe(22);

    const origins = [
      [10, 10],
      [32, 10],
      [54, 10],
      [76, 10],
      [10, 32],
      [32, 32],
      [54, 32],
      [76, 32],
      [10, 54],
      [32, 54],
      [54, 54],
      [76, 54],
      [10, 76],
      [32, 76],
      [54, 76],
      [76, 76],
    ] as const;

    for (let i = 0; i < islands.length; i++) {
      const island = islands[i]!;
      const [ox, oy] = origins[i]!;
      expect(island.index).toBe(i);
      expect(island.x).toBe(ox);
      expect(island.y).toBe(oy);
      expect(island.x + ISLAND_WIDTH - 1).toBeLessThanOrEqual(84);
      expect(island.y + ISLAND_WIDTH - 1).toBeLessThanOrEqual(84);
      expect(island.dock).toEqual({ x: ox + 4, y: oy + 9 });
      expect(island.pier).toEqual({ x: ox + 4, y: oy + 8 });
      expect(island.embarkWater).toEqual({ x: ox + 4, y: oy + 10 });

      expect(ARCHIPELAGO.tiles[island.dock.y][island.dock.x]).toBe(TileType.Dock);
      expect(ARCHIPELAGO.tiles[island.pier.y][island.pier.x]).toBe(TileType.Floor);
      expect(ARCHIPELAGO.tiles[island.embarkWater.y][island.embarkWater.x]).toBe(
        TileType.Water,
      );
      expect(ARCHIPELAGO.tiles[oy][ox]).toBe(TileType.Floor);
      expect(ARCHIPELAGO.tiles[oy + ISLAND_WIDTH - 1][ox + ISLAND_WIDTH - 1]).toBe(
        TileType.Floor,
      );
      // Open water in the gap east/south of the footprint.
      expect(ARCHIPELAGO.tiles[oy][ox + ISLAND_WIDTH]).toBe(TileType.Water);
      expect(ARCHIPELAGO.tiles[oy + ISLAND_WIDTH][ox]).toBe(TileType.Water);
    }

    const biomes = new Set(islands.map((i) => i.biome));
    expect(biomes.has("lush")).toBe(true);
    expect(biomes.has("barren")).toBe(true);
    expect(biomes.has("other")).toBe(true);

    const props = getArchipelagoProps();
    expect(props.length).toBeGreaterThan(0);
    expect(getZoneProps("archipelago")).toEqual(props);
  });

  it("resolves islandCellAt / biomeAtIslandTile for floor and dock", () => {
    const first = islandTemplateAtIndex(0);
    expect(islandCellAt(first.x, first.y)).toBe("floor");
    expect(islandCellAt(first.dock.x, first.dock.y)).toBe("dock");
    expect(islandCellAt(first.embarkWater.x, first.embarkWater.y)).toBe(null);
    expect(biomeAtIslandTile(first.pier.x, first.pier.y)).toBe("lush");
    expect(biomeAtIslandTile(ARCHIPELAGO_ENTRY.x, ARCHIPELAGO_ENTRY.y)).toBe(
      null,
    );
    expect(islandIndexAtTile(first.pier.x, first.pier.y)).toBe(0);
    expect(islandIndexAtTile(first.dock.x, first.dock.y)).toBe(0);
    expect(islandIndexAtTile(ARCHIPELAGO_ENTRY.x, ARCHIPELAGO_ENTRY.y)).toBe(
      null,
    );
    expect(findNearestIslandDock(first.dock.x, first.dock.y)?.index).toBe(0);
  });

  it("exposes the NW seed island at the origin", () => {
    const first = islandTemplateAtIndex(0);
    expect(first.x).toBe(ISLAND_ORIGIN_X);
    expect(first.y).toBe(ISLAND_ORIGIN_Y);
    expect(first.biome).toBe("lush");
    expect(first.row).toBe(0);
    expect(first.col).toBe(0);
    expect(ARCHIPELAGO.tiles[first.dock.y][first.dock.x]).toBe(TileType.Dock);
    expect(isArchipelagoIslandPosition(first.pier.x, first.pier.y)).toBe(true);
  });
});

describe("archipelago chunk ensure", () => {
  it("no-ops when the map is already full width", () => {
    expect(ARCHIPELAGO.width).toBe(ARCHIPELAGO_MAX_WIDTH);
    const result = ensureArchipelagoChunksAround(80);
    expect(result.grew).toBe(false);
    expect(result.width).toBe(ARCHIPELAGO_MAX_WIDTH);
    expect(result.previousWidth).toBe(ARCHIPELAGO_MAX_WIDTH);
  });

  it("keeps a continuous water path west to the Harbor return gate", () => {
    const y = ARCHIPELAGO_ENTRY.y;
    for (let x = 0; x <= 80; x++) {
      expect(ARCHIPELAGO.tiles[y][x]).toBe(TileType.Water);
    }
    expect(
      getZone("archipelago").transitions.some((t) => t.targetZone === "harbor"),
    ).toBe(true);
  });

  it("reports a visual cull frontier behind the player without walling water", () => {
    const cull = archipelagoVisualCullBefore(80);
    expect(cull).toBe(80 - ARCHIPELAGO_LOOKBEHIND);
    expect(cull).toBeGreaterThan(3);
    expect(ARCHIPELAGO.tiles[ARCHIPELAGO_ENTRY.y][cull - 1]).toBe(TileType.Water);
    expect(archipelagoVisualCullBefore(10)).toBe(3);
  });

  it("accepts sail positions within the 100×100 bounds including far north", () => {
    expect(isArchipelagoSailPosition(90, ARCHIPELAGO_ENTRY.y)).toBe(true);
    expect(isArchipelagoSailPosition(ARCHIPELAGO_MAX_WIDTH, ARCHIPELAGO_ENTRY.y)).toBe(
      false,
    );
    expect(isArchipelagoSailPosition(5, 0)).toBe(true);
    expect(isArchipelagoSailPosition(5, ARCHIPELAGO_HEIGHT - 1)).toBe(true);
    expect(isArchipelagoSailPosition(5, ARCHIPELAGO_HEIGHT)).toBe(false);
    // North of the first island row remains open water for sailing up.
    expect(isArchipelagoSailPosition(1, 5)).toBe(true);
    expect(ARCHIPELAGO.width).toBe(ARCHIPELAGO_INITIAL_WIDTH);
  });
});

describe("archipelago sailing snapshot", () => {
  it("accepts mid-ocean sailing positions on the full map", () => {
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot([], 1);
    setUnlockedAchievements([]);
    restoreQuestProgress(questProgress());
    setSailing(true);

    const midX = 64;
    prepareArchipelagoForPosition(midX);
    const snapshot = exportWorldSnapshot({
      zoneId: "archipelago",
      x: midX,
      y: ARCHIPELAGO_ENTRY.y,
    });
    expect(snapshot.sailing).toBe(true);
    expect(isValidWorldSnapshot(snapshot)).toBe(true);
  });

  it("restores mid-sail archipelago save with sailing and water underfoot", () => {
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot([], 1);
    setUnlockedAchievements([]);
    restoreQuestProgress(questProgress());

    const midX = 72;
    const snapshot: WorldSnapshot = {
      ...exportWorldSnapshot({
        zoneId: "archipelago",
        x: midX,
        y: ARCHIPELAGO_ENTRY.y,
      }),
      sailing: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      overworldUnlocked: true,
    };

    resetArchipelagoStream();
    expect(ARCHIPELAGO.width).toBe(ARCHIPELAGO_INITIAL_WIDTH);

    applyWorldSnapshot(snapshot);
    expect(isSailing()).toBe(true);
    expect(ARCHIPELAGO.width).toBe(ARCHIPELAGO_MAX_WIDTH);
    expect(ARCHIPELAGO.tiles[ARCHIPELAGO_ENTRY.y][midX]).toBe(TileType.Water);
  });

  it("restores on-foot island stand on the full stamped grid", () => {
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot([], 1);
    setUnlockedAchievements([]);
    restoreQuestProgress(questProgress());

    const island = islandTemplateAtIndex(2);
    prepareArchipelagoForPosition(island.x);
    const snapshot: WorldSnapshot = {
      ...exportWorldSnapshot({
        zoneId: "archipelago",
        x: island.pier.x,
        y: island.pier.y,
      }),
      sailing: false,
      placedBoat: true,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      overworldUnlocked: true,
    };
    expect(isValidWorldSnapshot(snapshot)).toBe(true);

    resetArchipelagoStream();
    applyWorldSnapshot(snapshot);
    expect(isSailing()).toBe(false);
    expect(ARCHIPELAGO.tiles[island.pier.y][island.pier.x]).toBe(TileType.Floor);
    expect(ARCHIPELAGO.tiles[island.dock.y][island.dock.x]).toBe(TileType.Dock);
  });
});


describe("archipelago visual XY window", () => {
  it("keeps a local XY window and always includes west gate columns in membership", () => {
    const win = archipelagoVisualWindow(80, 50);
    expect(win.xMin).toBe(80 - ARCHIPELAGO_LOOKBEHIND);
    expect(win.xMax).toBe(Math.min(ARCHIPELAGO_MAX_WIDTH, 80 + ARCHIPELAGO_VISUAL_AHEAD + 1));
    expect(win.yMin).toBe(50 - ARCHIPELAGO_VISUAL_MARGIN_Y);
    expect(win.yMax).toBe(50 + ARCHIPELAGO_VISUAL_MARGIN_Y + 1);
    expect(isInArchipelagoVisualWindow(1, 0, win)).toBe(true);
    expect(isInArchipelagoVisualWindow(1, 99, win)).toBe(true);
    expect(isInArchipelagoVisualWindow(win.xMin, win.yMin, win)).toBe(true);
    expect(isInArchipelagoVisualWindow(win.xMin - 1, win.yMin, win)).toBe(false);
    expect(isInArchipelagoVisualWindow(win.xMax, win.yMin, win)).toBe(false);
    expect(isInArchipelagoVisualWindow(win.xMin, win.yMax, win)).toBe(false);
  });

  it("does not shrink collision tiles when computing the visual window", () => {
    const win = archipelagoVisualWindow(80, 50);
    expect(ARCHIPELAGO.width).toBe(ARCHIPELAGO_INITIAL_WIDTH);
    expect(ARCHIPELAGO.height).toBe(ARCHIPELAGO_HEIGHT);
    expect(ARCHIPELAGO.tiles[0][0]).toBe(TileType.Water);
    expect(ARCHIPELAGO.tiles[win.yMin][win.xMin]).toBeDefined();
    expect(archipelagoVisualCullBefore(80)).toBe(win.xMin);
    expect(ARCHIPELAGO_GATE_COLUMNS).toBe(3);
  });
});

describe("island template caching (#194)", () => {
  it("returns identical template instances on repeated lookups", () => {
    expect(islandTemplateAtIndex(3)).toBe(islandTemplateAtIndex(3));
  });

  it("returns the identical list instance per width (no per-call construction)", () => {
    const a = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH);
    const b = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH);
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(0);
  });

  it("caches per distinct width without cross-contamination", () => {
    const wide = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH);
    const narrow = listIslandTemplates(30);
    expect(narrow).not.toBe(wide);
    expect(narrow.length).toBeLessThan(wide.length);
    expect(listIslandTemplates(30)).toBe(narrow);
  });
});
