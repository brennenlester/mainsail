import type { ZoneId } from "../world/zoneTypes";

/** Rendered ground variants per zone (`floor-<zone>-v0..3`, #361). */
export const FLOOR_VARIANT_COUNT = 4;

/**
 * Rows drawn with the zone's `floor-<zone>-path` tile (entrance -> exit).
 * `cap` marks an end that stops mid-grass: that tile uses the rounded
 * `floor-<zone>-path-west|east` end piece instead of a hard square edge.
 */
export const FLOOR_PATH_ROWS: Partial<
  Record<ZoneId, { y: number; x0: number; x1: number; cap?: "west" | "east" }[]>
> = {
  grove: [{ y: 5, x0: 6, x1: 9, cap: "west" }],
  shrine: [{ y: 5, x0: 0, x1: 9 }],
  village: [{ y: 5, x0: 0, x1: 15 }],
};

function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Deterministic floor variant for a tile: the path tile on path rows, else a
 * hashed pick weighted toward the plain variant (v0 55%, v1 20%, v2 13%,
 * v3 12%) so detail reads as scattered, not as a checkerboard.
 */
export function floorVariantKey(zoneId: ZoneId, x: number, y: number): string {
  const row = FLOOR_PATH_ROWS[zoneId]?.find((r) => r.y === y && x >= r.x0 && x <= r.x1);
  if (row) {
    if (row.cap === "west" && x === row.x0) return `floor-${zoneId}-path-west`;
    if (row.cap === "east" && x === row.x1) return `floor-${zoneId}-path-east`;
    return `floor-${zoneId}-path`;
  }
  const h = tileHash(x, y);
  const v = h < 0.55 ? 0 : h < 0.75 ? 1 : h < 0.88 ? 2 : 3;
  return `floor-${zoneId}-v${v}`;
}
