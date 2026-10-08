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
import { FLOOR_DISPLAY } from "./displaySizes";
import { hasWorldTexture, imagineTexture } from "./imagineAssets";

/**
 * Archipelago islands drawn as one RenderTexture each (#412): floor tiles,
 * the shallow ring, shore pieces and the pier are stamped once when the
 * island enters the visual window instead of living as ~300 sprites. Only
 * props, NPCs and the boat stay separate objects.
 */
export const ISLAND_BAKE_DEPTH = -500;

export class IslandBakes {
  private readonly baked = new Map<number, Phaser.GameObjects.RenderTexture>();

  private readonly scene: Phaser.Scene;
  private readonly origin: () => { x: number; y: number };

  constructor(scene: Phaser.Scene, origin: () => { x: number; y: number }) {
    this.scene = scene;
    this.origin = origin;
  }

  /** Bake islands that touch `win`; free the ones that left it. */
  sync(zone: ZoneDefinition, win: ArchipelagoVisualWindow): void {
    for (const island of listIslandTemplates(ARCHIPELAGO_MAX_WIDTH)) {
      const r = islandBakeRegion(island);
      const visible = r.x0 < win.xMax && r.x1 > win.xMin && r.y0 < win.yMax && r.y1 > win.yMin;
      const rt = this.baked.get(island.index);
      if (visible && !rt) {
        this.baked.set(island.index, this.bake(zone, r));
      } else if (!visible && rt) {
        rt.destroy();
        this.baked.delete(island.index);
      }
    }
  }

  /** Destroy every baked island (zone unload: removeAll does not destroy). */
  clear(): void {
    for (const rt of this.baked.values()) {
      rt.destroy();
    }
    this.baked.clear();
  }

  get size(): number {
    return this.baked.size;
  }

  private bake(zone: ZoneDefinition, r: ReturnType<typeof islandBakeRegion>): Phaser.GameObjects.RenderTexture {
    const o = this.origin();
    const rt = this.scene.add
      .renderTexture(o.x + r.x0 * TILE_WIDTH, o.y + r.y0 * TILE_HEIGHT, (r.x1 - r.x0) * TILE_WIDTH, (r.y1 - r.y0) * TILE_HEIGHT)
      .setOrigin(0, 0)
      .setDepth(ISLAND_BAKE_DEPTH);
    const stamp = this.scene.make.image({ x: 0, y: 0, key: "__WHITE" }, false);
    // Shore pieces are NE quadrants pivoting on the tile centre.
    const put = (key: string, cx: number, cy: number, turns = 0, quad = false, tint?: number) => {
      if (!hasWorldTexture(this.scene, key)) {
        return;
      }
      stamp.setTexture(...imagineTexture(this.scene, key));
      stamp.setOrigin(quad ? 0 : 0.5, quad ? 1 : 0.5);
      stamp.setRotation((turns * Math.PI) / 2);
      const w = quad ? FLOOR_DISPLAY.width / 2 : FLOOR_DISPLAY.width;
      const h = quad ? FLOOR_DISPLAY.height / 2 : FLOOR_DISPLAY.height;
      stamp.setDisplaySize(w, h);
      if (tint === undefined) stamp.clearTint();
      else stamp.setTint(tint);
      rt.batchDraw(stamp, cx, cy);
    };
    const cells: { x: number; y: number; cx: number; cy: number }[] = [];
    for (let y = r.y0; y < r.y1; y += 1) {
      for (let x = r.x0; x < r.x1; x += 1) {
        cells.push({ x, y, cx: (x - r.x0) * TILE_WIDTH + TILE_WIDTH / 2, cy: (y - r.y0) * TILE_HEIGHT + TILE_HEIGHT / 2 });
      }
    }
    rt.beginDraw();
    // Pass 1: ground (island floor tinted per biome, ocean under water/docks).
    for (const c of cells) {
      const sea = seaTileLayers(zone, c.x, c.y);
      if (zone.tiles[c.y]![c.x] === TileType.Floor && !sea?.base) {
        const biome = biomeAtIslandTile(c.x, c.y);
        put(floorVariantKey(zone.id, c.x, c.y), c.cx, c.cy, 0, false, biome ? ISLAND_BIOME_FLOOR_TINT[biome] : undefined);
      } else if (sea?.base) {
        put(sea.base, c.cx, c.cy);
      }
    }
    // Pass 2: shore pieces and piers above every ground tile.
    for (const c of cells) {
      for (const layer of seaTileLayers(zone, c.x, c.y)?.overlays ?? []) {
        put(layer.key, c.cx, c.cy, layer.turns, layer.key !== "tile-pier");
      }
    }
    rt.endDraw();
    stamp.destroy();
    return rt;
  }
}
