import {
  ARCHIPELAGO_MAX_WIDTH,
  islandBakeRegion,
  listIslandTemplates,
  type ArchipelagoVisualWindow,
} from "../world/archipelagoStream";
import { TILE_HEIGHT, TILE_WIDTH } from "../isometric";

// Pure (no Phaser): which islands to bake, in what order, and at what scale.

export type TileRect = { x0: number; y0: number; x1: number; y1: number };
export type BakeCandidate = { index: number; r: TileRect };

/** Tiles past the drawn window where islands are baked ahead of need (#417). */
export const ISLAND_PREBAKE_MARGIN = 6;

/**
 * Most islands that can be baked at once: the visual window (+ prebake margin)
 * spans the 4 island columns and at most 3 of the 4 island rows.
 */
export const ISLAND_BAKE_MAX_ISLANDS = 12;
/** Total RenderTexture pixels all island textures may hold (~36 MB RGBA). */
export const ISLAND_BAKE_MAX_PIXELS = 9_000_000;

function touches(r: TileRect, w: ArchipelagoVisualWindow, margin: number): boolean {
  return r.x0 < w.xMax + margin && r.x1 > w.xMin - margin && r.y0 < w.yMax + margin && r.y1 > w.yMin - margin;
}

export type IslandBakePlan = {
  /** Islands to keep or bake (window + prebake margin). */
  keep: Set<number>;
  /** Islands still to bake, most urgent first: on-screen window, then nearest the focus. */
  queue: { index: number; urgent: boolean }[];
};

/**
 * `focus` is the player tile. Islands touching `win` are urgent (they can be
 * on screen); the rest are prebake. Both sort nearest-first.
 */
export function planIslandBakes(
  islands: readonly BakeCandidate[],
  baked: ReadonlySet<number>,
  win: ArchipelagoVisualWindow,
  focus: { x: number; y: number },
  margin = ISLAND_PREBAKE_MARGIN,
): IslandBakePlan {
  const keep = new Set<number>();
  const queue: (IslandBakePlan["queue"][number] & { d: number })[] = [];
  for (const { index, r } of islands) {
    if (!touches(r, win, margin)) {
      continue;
    }
    keep.add(index);
    if (!baked.has(index)) {
      const dx = (r.x0 + r.x1) / 2 - focus.x;
      const dy = (r.y0 + r.y1) / 2 - focus.y;
      queue.push({ index, urgent: touches(r, win, 0), d: dx * dx + dy * dy });
    }
  }
  queue.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.d - b.d);
  return { keep, queue: queue.map(({ index, urgent }) => ({ index, urgent })) };
}

/** Largest island bake region, in 1x px. */
export function maxIslandBakePixels(): number {
  let max = 0;
  for (const island of listIslandTemplates(ARCHIPELAGO_MAX_WIDTH)) {
    const r = islandBakeRegion(island);
    max = Math.max(max, (r.x1 - r.x0) * TILE_WIDTH * (r.y1 - r.y0) * TILE_HEIGHT);
  }
  return max;
}

/**
 * Bake resolution (texture px per world px) for a camera zoom (buffer px per
 * world px): 1 when the zoom is at or under 1, else the zoom rounded up to a
 * half step, never above 2 and never so high that every island at once would
 * pass ISLAND_BAKE_MAX_PIXELS. With 12 islands of ~0.3 MPx under a 9 MPx budget
 * that makes 1.5x the effective ceiling (2x would need 14.6 MPx). Phones at
 * DPR 3 and retina laptops zoom past 1 and get 1.5x.
 */
export function islandBakeScale(zoom: number): number {
  const wanted = !Number.isFinite(zoom) || zoom <= 1.05 ? 1 : Math.min(2, Math.ceil(zoom * 2) / 2);
  const budget = Math.sqrt(ISLAND_BAKE_MAX_PIXELS / (ISLAND_BAKE_MAX_ISLANDS * maxIslandBakePixels()));
  const affordable = Math.max(1, Math.floor(budget * 2) / 2);
  return Math.min(wanted, affordable);
}
