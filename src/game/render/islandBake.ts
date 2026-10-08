import Phaser from "phaser";
import { TILE_HEIGHT, TILE_WIDTH } from "../isometric";
import { TileType, type ZoneDefinition } from "../world/zoneTypes";
import {
  ARCHIPELAGO_MAX_WIDTH,
  ISLAND_BIOME_FLOOR_TINT,
  biomeAtIslandTile,
  islandBakeRegion,
  listIslandTemplates,
  type ArchipelagoVisualWindow,
} from "../world/archipelagoStream";
import { floorVariantKey, seaTileLayers } from "./floorVariants";
import { ISLAND_BAKE_MAX_ISLANDS, planIslandBakes } from "./islandBakePlan";
import { FLOOR_DISPLAY } from "./displaySizes";
import { hasWorldTexture, imagineTexture } from "./imagineAssets";

/**
 * Archipelago islands drawn as one RenderTexture each (#412): floor tiles,
 * the shallow ring, shore pieces and the pier are stamped once when the
 * island enters the visual window instead of living as ~300 sprites. Only
 * props, NPCs and the boat stay separate objects.
 */
export const ISLAND_BAKE_DEPTH = -500;

/** A frame bakes at least one slice, then more while it has spent less than this. */
const BAKE_FRAME_BUDGET_MS = 6;
const MAX_BAKES_PER_FRAME = 2;
/** Tile rows per slice: a ~13-row island bakes in a handful of frames, not one hitch. */
const BAKE_ROWS_PER_SLICE = 2;
/**
 * Island textures are allocated up front, at zone load, and recycled. A
 * framebuffer allocation is a synchronous GL round trip that waits on the frame
 * in flight (~100 ms under SwiftShader), so allocating mid-sail hitches; at
 * load the zone is already stalling once and the rest ride along (#417).
 */
const RT_BUDGET = ISLAND_BAKE_MAX_ISLANDS;

type BakeJob = {
  index: number;
  rt: Phaser.GameObjects.RenderTexture;
  slices: Generator<void, void, void>;
};

export class IslandBakes {
  /** Finished islands (the only ones drawn). */
  readonly baked = new Map<number, Phaser.GameObjects.RenderTexture>();

  private readonly scene: Phaser.Scene;
  private readonly origin: () => { x: number; y: number };
  private readonly scale: () => number;
  private queue: { index: number; urgent: boolean }[] = [];
  private job: BakeJob | undefined;
  private pool: Phaser.GameObjects.RenderTexture[] = [];
  private zone: ZoneDefinition | undefined;
  /** Texture size the next bakes use; spares of any other size are freed. */
  private sizeKey = "";

  constructor(scene: Phaser.Scene, origin: () => { x: number; y: number }, scale: () => number = () => 1) {
    this.scene = scene;
    this.origin = origin;
    this.scale = scale;
  }

  /**
   * Free islands that left the window (+ prebake margin) and queue the ones
   * that entered it. `immediate` bakes the on-screen ones now (zone load /
   * growth, where nothing may pop in); otherwise `tick` spreads the work
   * across frames, on-screen first and nearest the player first (#417).
   */
  sync(
    zone: ZoneDefinition,
    win: ArchipelagoVisualWindow,
    focus: { x: number; y: number },
    immediate = false,
  ): void {
    this.zone = zone;
    const islands = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH).map((island) => ({
      index: island.index,
      r: islandBakeRegion(island),
    }));
    if (islands[0]) {
      this.useSize(islands[0].r);
    }
    const have = new Set(this.baked.keys());
    if (this.job) {
      have.add(this.job.index);
    }
    const plan = planIslandBakes(islands, have, win, focus);
    for (const [index, rt] of this.baked) {
      if (!plan.keep.has(index)) {
        this.baked.delete(index);
        this.release(rt);
      }
    }
    if (this.job && !plan.keep.has(this.job.index)) {
      this.abortJob();
    }
    this.queue = plan.queue;
    if (immediate) {
      while (this.job || this.queue[0]?.urgent) {
        if (!this.step()) {
          break;
        }
      }
      this.prewarm(islands[0]?.r);
    }
  }

  /** Bake slices of the queued islands: a few ms, and at most two islands, per frame. */
  tick(): void {
    const start = performance.now();
    const before = this.baked.size;
    do {
      if (!this.step()) {
        return;
      }
    } while (performance.now() - start < BAKE_FRAME_BUDGET_MS && this.baked.size - before < MAX_BAKES_PER_FRAME);
  }

  /** Destroy every baked island (zone unload: removeAll does not destroy). */
  clear(): void {
    this.abortJob();
    for (const rt of this.baked.values()) {
      rt.destroy();
    }
    this.baked.clear();
    for (const rt of this.pool) {
      rt.destroy();
    }
    this.pool = [];
    this.queue = [];
  }

  /** Rebake everything (the map grew): keep the textures for reuse. */
  invalidate(): void {
    this.abortJob();
    for (const [index, rt] of [...this.baked]) {
      this.baked.delete(index);
      this.release(rt);
    }
    this.queue = [];
  }

  get size(): number {
    return this.baked.size;
  }

  /** Islands waiting for (or in the middle of) a bake. */
  get pending(): number {
    return this.queue.length + (this.job ? 1 : 0);
  }

  /** Run one slice of the current bake (starting the next queued island). False when idle. */
  private step(): boolean {
    if (!this.job) {
      const next = this.queue.shift();
      if (!next) {
        return false;
      }
      const island = listIslandTemplates(ARCHIPELAGO_MAX_WIDTH).find((i) => i.index === next.index);
      if (!island || !this.zone || this.baked.has(next.index)) {
        return this.queue.length > 0;
      }
      this.job = this.startJob(this.zone, next.index, islandBakeRegion(island));
    }
    const job = this.job;
    if (job.slices.next().done) {
      job.rt.setVisible(true);
      this.baked.set(job.index, job.rt);
      this.job = undefined;
    }
    return true;
  }

  private allocated(): number {
    return this.baked.size + this.pool.length + (this.job ? 1 : 0);
  }

  /** Allocate the whole texture budget now. */
  private prewarm(r: ReturnType<typeof islandBakeRegion> | undefined): void {
    if (!r) {
      return;
    }
    const { w, h } = this.useSize(r);
    while (this.allocated() < RT_BUDGET) {
      this.pool.push(this.scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setVisible(false).setData("bakeSize", this.sizeKey));
    }
  }

  /**
   * Texture size for a region at the current scale. A resize / DPR change moves
   * it: spares of the old size can never be reused, so free them now.
   */
  private useSize(r: ReturnType<typeof islandBakeRegion>): { w: number; h: number } {
    const s = this.scale();
    const w = Math.ceil((r.x1 - r.x0) * TILE_WIDTH * s);
    const h = Math.ceil((r.y1 - r.y0) * TILE_HEIGHT * s);
    const key = `${w}x${h}`;
    if (key !== this.sizeKey) {
      this.sizeKey = key;
      this.pool = this.pool.filter((rt) => {
        const keep = rt.getData("bakeSize") === key;
        if (!keep) {
          rt.destroy();
        }
        return keep;
      });
    }
    return { w, h };
  }

  /** Park a finished-with texture for reuse, or free it when the pool is full. */
  private release(rt: Phaser.GameObjects.RenderTexture): void {
    if (this.allocated() < RT_BUDGET && rt.getData("bakeSize") === this.sizeKey) {
      rt.setVisible(false);
      this.pool.push(rt);
    } else {
      rt.destroy();
    }
  }

  private abortJob(): void {
    if (this.job) {
      const { slices, rt } = this.job;
      this.job = undefined;
      slices.return();
      this.release(rt);
    }
  }

  private startJob(zone: ZoneDefinition, index: number, r: ReturnType<typeof islandBakeRegion>): BakeJob {
    const o = this.origin();
    // Texture px per world px: >1 on zoomed-in HiDPI stages so the stamps
    // stay sharp; the texture is shown at 1/s so it still covers the region.
    const s = this.scale();
    const { w, h } = this.useSize(r);
    const pooled = this.pool.findIndex((p) => p.getData("bakeSize") === this.sizeKey);
    const rt =
      pooled >= 0
        ? this.pool.splice(pooled, 1)[0]!.clear()
        : this.scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setData("bakeSize", this.sizeKey);
    rt
      .setPosition(o.x + r.x0 * TILE_WIDTH, o.y + r.y0 * TILE_HEIGHT)
      .setScale(1 / s)
      .setDepth(ISLAND_BAKE_DEPTH)
      // Hidden until every slice is stamped: no half-drawn island on screen.
      .setVisible(false);
    return { index, rt, slices: this.bakeSlices(zone, r, rt, s) };
  }

  /** Stamp the island a few rows at a time, yielding between slices. */
  private *bakeSlices(
    zone: ZoneDefinition,
    r: ReturnType<typeof islandBakeRegion>,
    rt: Phaser.GameObjects.RenderTexture,
    s: number,
  ): Generator<void, void, void> {
    const stamp = this.scene.make.image({ x: 0, y: 0, key: "__WHITE" }, false);
    try {
      // Shore pieces are NE quadrants pivoting on the tile centre.
      const put = (key: string, cx: number, cy: number, turns = 0, quad = false, tint?: number) => {
        if (!hasWorldTexture(this.scene, key)) {
          return;
        }
        stamp.setTexture(...imagineTexture(this.scene, key));
        stamp.setOrigin(quad ? 0 : 0.5, quad ? 1 : 0.5);
        stamp.setRotation((turns * Math.PI) / 2);
        const w = (quad ? FLOOR_DISPLAY.width / 2 : FLOOR_DISPLAY.width) * s;
        const h = (quad ? FLOOR_DISPLAY.height / 2 : FLOOR_DISPLAY.height) * s;
        stamp.setDisplaySize(w, h);
        if (tint === undefined) stamp.clearTint();
        else stamp.setTint(tint);
        rt.batchDraw(stamp, cx * s, cy * s);
      };
      const rows = (y: number, fn: (x: number, y: number, cx: number, cy: number) => void) => {
        rt.beginDraw();
        for (let yy = y; yy < Math.min(r.y1, y + BAKE_ROWS_PER_SLICE); yy += 1) {
          for (let x = r.x0; x < r.x1; x += 1) {
            fn(x, yy, (x - r.x0) * TILE_WIDTH + TILE_WIDTH / 2, (yy - r.y0) * TILE_HEIGHT + TILE_HEIGHT / 2);
          }
        }
        rt.endDraw();
      };
      // Pass 1: ground (island floor tinted per biome, ocean under water/docks).
      for (let y = r.y0; y < r.y1; y += BAKE_ROWS_PER_SLICE) {
        rows(y, (x, yy, cx, cy) => {
          const sea = seaTileLayers(zone, x, yy);
          if (zone.tiles[yy]![x] === TileType.Floor && !sea?.base) {
            const biome = biomeAtIslandTile(x, yy);
            put(floorVariantKey(zone.id, x, yy), cx, cy, 0, false, biome ? ISLAND_BIOME_FLOOR_TINT[biome] : undefined);
          } else if (sea?.base) {
            put(sea.base, cx, cy);
          }
        });
        yield;
      }
      // Pass 2: shore pieces and piers above every ground tile.
      for (let y = r.y0; y < r.y1; y += BAKE_ROWS_PER_SLICE) {
        rows(y, (x, yy, cx, cy) => {
          for (const layer of seaTileLayers(zone, x, yy)?.overlays ?? []) {
            put(layer.key, cx, cy, layer.turns, layer.key !== "tile-pier");
          }
        });
        yield;
      }
    } finally {
      stamp.destroy();
    }
  }
}
