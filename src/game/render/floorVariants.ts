import type { ZoneId } from "../world/zoneTypes";

/** Rendered ground variants per zone (`floor-<zone>-v0..3`, #361). */
export const FLOOR_VARIANT_COUNT = 4;

/** Zones that share another zone's floor set (#392: every cottage interior). */
export const FLOOR_ALIAS: Partial<Record<ZoneId, string>> = {
  "warden-cottage": "cottage",
  "weaver-cottage": "cottage",
  "hearthkeep-cottage": "cottage",
  "hermit-cottage": "cottage",
};

type PathRow = { y: number; x0: number; x1: number; cap?: "west" | "east" };
type PathCol = { x: number; y0: number; y1: number; cap?: "north" | "south" };

/**
 * Rows drawn with the zone's `floor-<zone>-path` tile (entrance -> exit).
 * `cap` marks an end that stops mid-grass: that tile uses the rounded
 * `floor-<zone>-path-west|east` end piece instead of a hard square edge.
 */
export const FLOOR_PATH_ROWS: Partial<Record<ZoneId, PathRow[]>> = {
  grove: [{ y: 5, x0: 6, x1: 9, cap: "west" }],
  shrine: [{ y: 5, x0: 0, x1: 9 }],
  village: [{ y: 5, x0: 0, x1: 15 }],
  // #392: Fields road east to the Mistwood gate; Harbor boardwalk; forest
  // trail; Emberfen cinder path from the west entry to the Matriarch's ground.
  overworld: [{ y: 7, x0: 7, x1: 14 }],
  harbor: [{ y: 4, x0: 0, x1: 16 }],
  mistwood: [{ y: 6, x0: 0, x1: 11 }],
  emberfen: [{ y: 5, x0: 0, x1: 7, cap: "east" }],
};

/**
 * Columns drawn with `floor-<zone>-path-v` (#392); a tile on both a row and a
 * column uses `-path-cross`. Caps use `-path-north|south`.
 */
const COTTAGE_RUNNER: PathCol[] = [{ x: 3, y0: 3, y1: 6, cap: "north" }];
export const FLOOR_PATH_COLS: Partial<Record<ZoneId, PathCol[]>> = {
  // Folklore Fields road: Harbor gate (north) down to the village pier.
  overworld: [{ x: 7, y0: 0, y1: 12 }],
  // Runner rug from the cottage door toward the villager.
  "warden-cottage": COTTAGE_RUNNER,
  "weaver-cottage": COTTAGE_RUNNER,
  "hearthkeep-cottage": COTTAGE_RUNNER,
  "hermit-cottage": COTTAGE_RUNNER,
};

/** Rows whose tiles border water on their south edge (`-shore` bank). */
export const FLOOR_SHORE_ROWS: Partial<Record<ZoneId, number[]>> = {
  overworld: [12],
  harbor: [5],
};

/** Whole-tile keys for specific floor cells (piers, islets), "x,y" -> key. */
export const FLOOR_TILE_KEYS: Partial<Record<ZoneId, Record<string, string>>> = {
  overworld: {
    "7,13": "tile-dock-light",
    "7,14": "tile-dock-dark",
    "2,14": "floor-overworld-islet",
    "3,14": "floor-overworld-islet",
    "11,14": "floor-overworld-islet",
    "12,14": "floor-overworld-islet",
  },
  harbor: { "3,6": "tile-dock-light" },
};

function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Deterministic floor key for a tile: fixed cells, path rows/columns and
 * shore rows first, else a hashed pick weighted toward the plain variant (v0
 * 55%, v1 20%, v2 13%, v3 12%) so detail reads as scattered, not as a
 * checkerboard.
 */
export function floorVariantKey(zoneId: ZoneId, x: number, y: number): string {
  const fixed = FLOOR_TILE_KEYS[zoneId]?.[`${x},${y}`];
  if (fixed) return fixed;
  const prefix = `floor-${FLOOR_ALIAS[zoneId] ?? zoneId}`;
  const row = FLOOR_PATH_ROWS[zoneId]?.find((r) => r.y === y && x >= r.x0 && x <= r.x1);
  const col = FLOOR_PATH_COLS[zoneId]?.find((c) => c.x === x && y >= c.y0 && y <= c.y1);
  if (row && col) return `${prefix}-path-cross`;
  if (row) {
    if (row.cap === "west" && x === row.x0) return `${prefix}-path-west`;
    if (row.cap === "east" && x === row.x1) return `${prefix}-path-east`;
    return `${prefix}-path`;
  }
  if (col) {
    if (col.cap === "north" && y === col.y0) return `${prefix}-path-north`;
    if (col.cap === "south" && y === col.y1) return `${prefix}-path-south`;
    return `${prefix}-path-v`;
  }
  if (FLOOR_SHORE_ROWS[zoneId]?.includes(y)) return `${prefix}-shore`;
  const h = tileHash(x, y);
  const v = h < 0.55 ? 0 : h < 0.75 ? 1 : h < 0.88 ? 2 : 3;
  return `${prefix}-v${v}`;
}
