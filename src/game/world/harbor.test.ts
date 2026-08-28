import { describe, expect, it } from "vitest";
import { isTileWalkable } from "./collision";
import { getZone, ZONES } from "./zones";
import { TileType } from "./zoneTypes";
import { getZoneProps } from "./zoneProps";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  type WorldSnapshot,
} from "./worldSnapshot";
import { restoreQuestProgress } from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import { setPartyFromSnapshot } from "../creatures/party";
import { setUnlockedAchievements } from "../progression/achievements";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import { setVisitorMode } from "./worldSession";
import { resetPlacedBoatForTest } from "./dockBoat";

function questProgress(): WorldSnapshot["questProgress"] {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "complete" as const]),
  ) as WorldSnapshot["questProgress"];
}

describe("harbor zone shell", () => {
  it("registers harbor in ZONES with dock/water/pier geometry", () => {
    expect(ZONES.harbor).toBeDefined();
    const harbor = getZone("harbor");
    expect(harbor.name).toBe("Moonwake Harbor");
    expect(harbor.tiles[7][3]).toBe(TileType.Dock);
    expect(harbor.tiles[6][3]).toBe(TileType.Floor);
    expect(harbor.tiles[7][4]).toBe(TileType.Water);
    expect(isTileWalkable(harbor, 3, 7)).toBe(true);
    expect(isTileWalkable(harbor, 3, 6)).toBe(true);
    expect(isTileWalkable(harbor, 4, 7)).toBe(false);
    // East Landing destination pads
    expect(isTileWalkable(harbor, 15, 4)).toBe(true);
    expect(isTileWalkable(harbor, 16, 5)).toBe(true);
    expect(harbor.tiles[6][15]).toBe(TileType.Water);
    expect(harbor.tiles[6][16]).toBe(TileType.Water);
  });

  it("wires Folklore Fields north gate ↔ Harbor bidirectionally", () => {
    const overworld = getZone("overworld");
    expect(overworld.tiles[0][7]).toBe(TileType.Floor);
    expect(isTileWalkable(overworld, 7, 0)).toBe(true);
    const toHarbor = overworld.transitions.find((t) => t.targetZone === "harbor");
    expect(toHarbor).toMatchObject({
      x: 7,
      y: 0,
      targetZone: "harbor",
      targetX: 1,
      targetY: 4,
    });

    const harbor = getZone("harbor");
    const toFields = harbor.transitions.find((t) => t.targetZone === "overworld");
    expect(toFields).toMatchObject({
      x: 0,
      y: 4,
      targetZone: "overworld",
      targetX: 7,
      targetY: 1,
    });
    expect(isTileWalkable(overworld, 7, 1)).toBe(true);
    expect(isTileWalkable(harbor, 1, 4)).toBe(true);
  });

  it("keeps Folklore Fields south village travel unchanged", () => {
    const overworld = getZone("overworld");
    const toVillage = overworld.transitions.find((t) => t.targetZone === "village");
    expect(toVillage).toMatchObject({
      x: 7,
      y: 14,
      targetZone: "village",
      targetX: 5,
      targetY: 1,
    });
    expect(overworld.tiles[14][7]).toBe(TileType.Floor);
  });

  it("places a gate prop on the Folklore Fields north opening", () => {
    const props = getZoneProps("overworld");
    expect(props.some((p) => p.kind === "gate" && p.x === 7 && p.y === 0)).toBe(
      true,
    );
  });

  it("accepts harbor positions in world snapshots", () => {
    resetPlacedBoatForTest();
    setVisitorMode(false);
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot([], 1);
    setUnlockedAchievements([]);
    restoreQuestProgress(questProgress());

    const snapshot = exportWorldSnapshot({
      zoneId: "harbor",
      x: 1,
      y: 4,
    });
    expect(snapshot.position).toEqual({ zoneId: "harbor", x: 1, y: 4 });
    expect(isValidWorldSnapshot(snapshot)).toBe(true);

    applyWorldSnapshot({
      ...snapshot,
      questProgress: questProgress(),
      party: [],
      nextInstanceId: 1,
      materials: {},
      items: {},
      overworldUnlocked: true,
    });
    expect(isValidWorldSnapshot(snapshot)).toBe(true);
  });
});
