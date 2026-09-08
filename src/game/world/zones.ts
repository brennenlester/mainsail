import {
  ARCHIPELAGO,
  ARCHIPELAGO_ENTRY,
  HARBOR_EAST_SAIL_GATES,
  hermitDoorWorld,
} from "./archipelagoStream";
import {
  VILLAGE_CODE_GATE,
  VILLAGE_COTTAGE_DOORS,
  VILLAGE_OVERWORLD_GATE,
} from "./villageGate";
import { TileType, type ZoneDefinition, type ZoneId } from "./zoneTypes";

function borderedFloor(
  width: number,
  height: number,
  openings: { x: number; y: number }[],
): TileType[][] {
  const tiles: TileType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => TileType.Wall),
  );

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      tiles[y][x] = TileType.Floor;
    }
  }

  for (const { x, y } of openings) {
    tiles[y][x] = TileType.Floor;
  }

  return tiles;
}

const GROVE: ZoneDefinition = {
  id: "grove",
  name: "Whisper Grove",
  width: 10,
  height: 10,
  tiles: borderedFloor(10, 10, [{ x: 9, y: 5 }]),
  defaultSpawn: { x: 3, y: 7 },
  lightTint: 0xd8e8c0,
  darkTint: 0x7a9a5c,
  transitions: [{ x: 9, y: 5, targetZone: "shrine", targetX: 1, targetY: 5 }],
};

const SHRINE: ZoneDefinition = {
  id: "shrine",
  name: "Moon Shrine",
  width: 10,
  height: 10,
  tiles: borderedFloor(10, 10, [
    { x: 0, y: 5 },
    { x: 9, y: 5 },
  ]),
  lightTint: 0xe0d4f0,
  darkTint: 0x8a7aa8,
  shrineInteract: { x: 5, y: 5 },
  transitions: [
    { x: 0, y: 5, targetZone: "grove", targetX: 8, targetY: 5 },
    { x: 9, y: 5, targetZone: "village", targetX: 1, targetY: 5 },
  ],
};

/** Plaza west + cottage yard east of the village gate (#291/#316). */
const VILLAGE_WIDTH = 16;
const VILLAGE_HEIGHT = 10;
const villageTiles = borderedFloor(VILLAGE_WIDTH, VILLAGE_HEIGHT, [
  { x: 0, y: 5 },
  { x: VILLAGE_OVERWORLD_GATE.x, y: VILLAGE_OVERWORLD_GATE.y },
]);
villageTiles[VILLAGE_OVERWORLD_GATE.y][VILLAGE_OVERWORLD_GATE.x] =
  TileType.OverworldGate;
// Divider wall between plaza and cottage yard; one VillageGate opening.
for (let y = 1; y < VILLAGE_HEIGHT - 1; y++) {
  villageTiles[y][VILLAGE_CODE_GATE.x] = TileType.Wall;
}
villageTiles[VILLAGE_CODE_GATE.y][VILLAGE_CODE_GATE.x] = TileType.VillageGate;

const VILLAGE: ZoneDefinition = {
  id: "village",
  name: "Hearth Crossing",
  width: VILLAGE_WIDTH,
  height: VILLAGE_HEIGHT,
  tiles: villageTiles,
  lightTint: 0xf0d9b5,
  darkTint: 0xb58863,
  transitions: [
    { x: 0, y: 5, targetZone: "shrine", targetX: 8, targetY: 5 },
    {
      x: VILLAGE_OVERWORLD_GATE.x,
      y: VILLAGE_OVERWORLD_GATE.y,
      targetZone: "overworld",
      targetX: 7,
      targetY: 12,
    },
  ],
  doors: [
    {
      x: VILLAGE_COTTAGE_DOORS.warden.x,
      y: VILLAGE_COTTAGE_DOORS.warden.y,
      targetZone: "warden-cottage",
      targetX: 3,
      targetY: 5,
      label: "Warden's Cottage",
    },
    {
      x: VILLAGE_COTTAGE_DOORS.weaver.x,
      y: VILLAGE_COTTAGE_DOORS.weaver.y,
      targetZone: "weaver-cottage",
      targetX: 3,
      targetY: 5,
      label: "Weaver's Cottage",
    },
    {
      x: VILLAGE_COTTAGE_DOORS.hearthkeep.x,
      y: VILLAGE_COTTAGE_DOORS.hearthkeep.y,
      targetZone: "hearthkeep-cottage",
      targetX: 3,
      targetY: 5,
      label: "Hearthkeep Cottage",
    },
  ],
};

/**
 * Cottage interiors: one room, one villager, no encounters. The doorway at the
 * bottom edge steps back out to the tile the player entered from.
 */
function cottageInterior(
  id: ZoneId,
  name: string,
  exit: { zone: ZoneId; x: number; y: number },
): ZoneDefinition {
  return {
    id,
    name,
    width: 7,
    height: 7,
    tiles: borderedFloor(7, 7, [{ x: 3, y: 6 }]),
    lightTint: 0xf4e0c0,
    darkTint: 0xc09468,
    interior: true,
    transitions: [
      {
        x: 3,
        y: 6,
        targetZone: exit.zone,
        targetX: exit.x,
        targetY: exit.y,
      },
    ],
  };
}

const WARDEN_COTTAGE = cottageInterior("warden-cottage", "Warden's Cottage", {
  zone: "village",
  ...VILLAGE_COTTAGE_DOORS.warden,
});

const WEAVER_COTTAGE = cottageInterior("weaver-cottage", "Weaver's Cottage", {
  zone: "village",
  ...VILLAGE_COTTAGE_DOORS.weaver,
});

const HEARTHKEEP_COTTAGE = cottageInterior(
  "hearthkeep-cottage",
  "Hearthkeep Cottage",
  { zone: "village", ...VILLAGE_COTTAGE_DOORS.hearthkeep },
);

const hermitDoor = hermitDoorWorld();
const HERMIT_COTTAGE = cottageInterior("hermit-cottage", "Island Cottage", {
  zone: "archipelago",
  x: hermitDoor.x,
  y: hermitDoor.y,
});

/** Folklore Fields — first unlocked overworld region (south back to village). */
const overworldTiles = borderedFloor(15, 15, [
  { x: 14, y: 7 },
  { x: 7, y: 0 }, // north gate → Harbor
]);
// South shoreline bay: two water rows with a walkable dock + pier at the village gate.
for (const y of [13, 14]) {
  for (let x = 0; x < 15; x++) {
    overworldTiles[y][x] = TileType.Water;
  }
}
overworldTiles[14][7] = TileType.Floor; // village gate (boat dock moved to Harbor)
overworldTiles[13][7] = TileType.Floor; // approach from land spawn (7,12)

const OVERWORLD: ZoneDefinition = {
  id: "overworld",
  name: "Folklore Fields",
  width: 15,
  height: 15,
  tiles: overworldTiles,
  lightTint: 0xc8dce8,
  darkTint: 0x6a8aa0,
  transitions: [
    { x: 7, y: 14, targetZone: "village", targetX: 5, targetY: 1 },
    { x: 14, y: 7, targetZone: "mistwood", targetX: 1, targetY: 6 },
    { x: 7, y: 0, targetZone: "harbor", targetX: 1, targetY: 4 },
  ],
};

/**
 * Harbor — dock-area shell north of Folklore Fields.
 * Horizontal water corridor is the side-scroll sail path; East Landing is an optional dock (#94).
 */
const harborTiles = borderedFloor(18, 9, [{ x: 0, y: 4 }]);
for (const y of [6, 7]) {
  for (let x = 0; x < 18; x++) {
    harborTiles[y][x] = TileType.Water;
  }
}
harborTiles[7][3] = TileType.Dock;
harborTiles[6][3] = TileType.Floor; // pier from the west entry path
// East Landing — named sail destination pads (approach water is y=6 at x=15–16).
harborTiles[4][15] = TileType.Floor;
harborTiles[4][16] = TileType.Floor;
harborTiles[5][15] = TileType.Floor;
harborTiles[5][16] = TileType.Floor;

const HARBOR: ZoneDefinition = {
  id: "harbor",
  name: "Moonwake Harbor",
  width: 18,
  height: 9,
  tiles: harborTiles,
  lightTint: 0xb8d8e8,
  darkTint: 0x5a8098,
  transitions: [
    { x: 0, y: 4, targetZone: "overworld", targetX: 7, targetY: 1 },
    // East water edge → open archipelago (sail-preserving; on-foot cannot reach water).
    ...HARBOR_EAST_SAIL_GATES.map((gate) => ({
      x: gate.x,
      y: gate.y,
      targetZone: "archipelago" as const,
      targetX: ARCHIPELAGO_ENTRY.x,
      targetY: ARCHIPELAGO_ENTRY.y,
    })),
  ],
};

/** Mistwood Reach — mist-heavy late encounters; east path to Emberfen. */
const MISTWOOD: ZoneDefinition = {
  id: "mistwood",
  name: "Mistwood Reach",
  width: 12,
  height: 12,
  tiles: borderedFloor(12, 12, [
    { x: 0, y: 6 },
    { x: 11, y: 6 },
  ]),
  lightTint: 0xd4c8e8,
  darkTint: 0x7a6a98,
  transitions: [
    { x: 0, y: 6, targetZone: "overworld", targetX: 13, targetY: 7 },
    { x: 11, y: 6, targetZone: "emberfen", targetX: 1, targetY: 5 },
  ],
};

/** Emberfen Hollow — warm peat fen; exclusive late creatures. */
const EMBERFEN: ZoneDefinition = {
  id: "emberfen",
  name: "Emberfen Hollow",
  width: 11,
  height: 11,
  tiles: borderedFloor(11, 11, [{ x: 0, y: 5 }]),
  lightTint: 0xe8c090,
  darkTint: 0xa86840,
  transitions: [
    { x: 0, y: 5, targetZone: "mistwood", targetX: 10, targetY: 6 },
  ],
};

export const ZONES: Record<ZoneId, ZoneDefinition> = {
  grove: GROVE,
  shrine: SHRINE,
  village: VILLAGE,
  overworld: OVERWORLD,
  harbor: HARBOR,
  archipelago: ARCHIPELAGO,
  mistwood: MISTWOOD,
  emberfen: EMBERFEN,
  "warden-cottage": WARDEN_COTTAGE,
  "weaver-cottage": WEAVER_COTTAGE,
  "hearthkeep-cottage": HEARTHKEEP_COTTAGE,
  "hermit-cottage": HERMIT_COTTAGE,
};

export const STARTING_ZONE_ID: ZoneId = "grove";

export function getZone(id: ZoneId): ZoneDefinition {
  return ZONES[id];
}
