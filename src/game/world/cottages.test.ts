import { beforeEach, describe, expect, it } from "vitest";
import { ZONES } from "./zones";
import { TileType, type ZoneId } from "./zoneTypes";
import { ZONE_ENCOUNTERS } from "../encounters/tables";
import { getZoneNpcs } from "./npcs";
import { ZONE_PROPS } from "./zoneProps";
import { cottageFrame } from "./cottageWalls";
import { findNearbyDoor } from "./interactProximity";
import { VILLAGE_CODE_GATE, VILLAGE_COTTAGE_DOORS } from "./villageGate";
import {
  getArchipelagoProps,
  hermitCottageWorld,
  hermitDoorWorld,
  islandTemplateAtIndex,
  resetArchipelagoStream,
} from "./archipelagoStream";
import { HERMIT_ISLAND_INDEX, HERMIT_NPC_ID } from "./hermitIsland";

const VILLAGE_INTERIOR_IDS: ZoneId[] = [
  "warden-cottage",
  "weaver-cottage",
  "hearthkeep-cottage",
];

function isWalkable(zoneId: ZoneId, x: number, y: number): boolean {
  const zone = ZONES[zoneId];
  if (x < 0 || y < 0 || x >= zone.width || y >= zone.height) {
    return false;
  }
  const tile = zone.tiles[y][x];
  return (
    tile === TileType.Floor ||
    tile === TileType.OverworldGate ||
    tile === TileType.VillageGate ||
    tile === TileType.Dock
  );
}

describe("cottage interiors", () => {
  it("adds three village cottages plus the island hermit cottage", () => {
    const interiors = (Object.keys(ZONES) as ZoneId[]).filter(
      (id) => ZONES[id].interior,
    );
    expect(interiors).toHaveLength(4);
  });

  it("is a safe room with no wild encounters", () => {
    for (const id of [...VILLAGE_INTERIOR_IDS, "hermit-cottage" as ZoneId]) {
      expect(ZONE_ENCOUNTERS[id]).toEqual([]);
    }
  });

  it("houses exactly one villager each", () => {
    for (const id of [...VILLAGE_INTERIOR_IDS, "hermit-cottage" as ZoneId]) {
      expect(getZoneNpcs(id)).toHaveLength(1);
    }
  });

  it("gives each village villager a unique sprite", () => {
    const keys = VILLAGE_INTERIOR_IDS.flatMap((id) =>
      getZoneNpcs(id).map((npc) => npc.spriteKey),
    );
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it("frames each cottage as a square floor with a south door", () => {
    const frame = cottageFrame(ZONES["warden-cottage"]);
    expect(frame).toEqual({
      floorX0: 1,
      floorY0: 1,
      floorX1: 5,
      floorY1: 5,
      doorX: 3,
    });
  });

  it("has no E-doors; the south opening is a walk-on exit", () => {
    for (const id of VILLAGE_INTERIOR_IDS) {
      const interior = ZONES[id];
      expect(interior.doors).toBeUndefined();
      expect(findNearbyDoor(interior, 3, 6)).toBeUndefined();
      expect(findNearbyDoor(interior, 3, 5)).toBeUndefined();
      const exit = interior.transitions.find((t) => t.targetZone === "village");
      expect(exit).toMatchObject({ x: 3, y: 6 });
    }
  });
});

describe("village doors", () => {
  const village = ZONES.village;

  it("keeps cottages east of the village gate", () => {
    expect(village.tiles[VILLAGE_CODE_GATE.y][VILLAGE_CODE_GATE.x]).toBe(
      TileType.VillageGate,
    );
    for (const door of village.doors ?? []) {
      expect(door.x).toBeGreaterThan(VILLAGE_CODE_GATE.x);
    }
    expect(ZONE_PROPS.village?.filter((p) => p.kind === "cottage")).toHaveLength(
      3,
    );
    for (const prop of ZONE_PROPS.village ?? []) {
      if (prop.kind === "cottage") {
        expect(prop.x).toBeGreaterThan(VILLAGE_CODE_GATE.x);
      }
    }
  });

  it("has one door per village cottage", () => {
    expect(village.doors).toHaveLength(VILLAGE_INTERIOR_IDS.length);
  });

  it("stands on a walkable village tile", () => {
    for (const door of village.doors ?? []) {
      expect(isWalkable("village", door.x, door.y)).toBe(true);
    }
  });

  it("drops the player on a walkable tile inside the cottage", () => {
    for (const door of village.doors ?? []) {
      expect(isWalkable(door.targetZone, door.targetX, door.targetY)).toBe(true);
    }
  });

  it("is not also a walk-on transition, so passing by never pulls you inside", () => {
    for (const door of village.doors ?? []) {
      const overlapping = village.transitions.some(
        (t) => t.x === door.x && t.y === door.y,
      );
      expect(overlapping).toBe(false);
    }
  });

  it("returns the player to the doorstep they entered from", () => {
    for (const door of village.doors ?? []) {
      const exit = ZONES[door.targetZone].transitions.find(
        (t) => t.targetZone === "village",
      );
      expect(exit).toBeDefined();
      expect({ x: exit!.targetX, y: exit!.targetY }).toEqual({
        x: door.x,
        y: door.y,
      });
    }
  });

  it("gives each cottage its own door", () => {
    const targets = (village.doors ?? []).map((door) => door.targetZone);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("does not put hearths in the village square", () => {
    expect(ZONE_PROPS.village?.some((prop) => prop.kind === "hearth")).toBe(
      false,
    );
  });

  it("matches the relocated cottage door constants", () => {
    expect(village.doors?.map((d) => `${d.x},${d.y}`).sort()).toEqual(
      [
        `${VILLAGE_COTTAGE_DOORS.warden.x},${VILLAGE_COTTAGE_DOORS.warden.y}`,
        `${VILLAGE_COTTAGE_DOORS.weaver.x},${VILLAGE_COTTAGE_DOORS.weaver.y}`,
        `${VILLAGE_COTTAGE_DOORS.hearthkeep.x},${VILLAGE_COTTAGE_DOORS.hearthkeep.y}`,
      ].sort(),
    );
  });
});

describe("hermit island cottage", () => {
  beforeEach(() => {
    resetArchipelagoStream();
  });

  it("places island index 3 at the top-right of the 4×4 grid", () => {
    const island = islandTemplateAtIndex(HERMIT_ISLAND_INDEX);
    expect(island.row).toBe(0);
    expect(island.col).toBe(3);
  });

  it("stamps a cottage prop and E-door on island 3", () => {
    const cottage = hermitCottageWorld();
    const door = hermitDoorWorld();
    expect(
      ZONES.archipelago.doors?.some(
        (d) =>
          d.x === door.x &&
          d.y === door.y &&
          d.targetZone === "hermit-cottage",
      ),
    ).toBe(true);
    expect(
      getArchipelagoProps().some(
        (p) => p.x === cottage.x && p.y === cottage.y && p.kind === "cottage",
      ),
    ).toBe(true);
  });

  it("exits the hermit cottage onto the island door tile", () => {
    const door = hermitDoorWorld();
    const exit = ZONES["hermit-cottage"].transitions[0];
    expect(exit).toMatchObject({
      targetZone: "archipelago",
      targetX: door.x,
      targetY: door.y,
    });
    expect(getZoneNpcs("hermit-cottage")[0]?.id).toBe(HERMIT_NPC_ID);
  });

  it("keeps Reed as fusion sage without village-gate lore", () => {
    const reed = getZoneNpcs("hermit-cottage")[0];
    expect(reed?.id).toBe(HERMIT_NPC_ID);
    const catalog = [...(reed?.introLines ?? []), ...(reed?.idleLines ?? [])].join(" ");
    expect(catalog).toMatch(/Horizon|joining|Sovereign/i);
    expect(catalog).not.toMatch(/east gate|village story|gate code|\d{4}/i);
  });
});
