import { describe, expect, it } from "vitest";
import {
  ARCHIPELAGO_HEIGHT,
  ARCHIPELAGO_MAX_WIDTH,
  archipelagoHalfViewCols,
  archipelagoVisualWindow,
  islandBakeRegion,
  listIslandTemplates,
} from "../world/archipelagoStream";
import {
  ISLAND_BAKE_MAX_ISLANDS,
  ISLAND_BAKE_MAX_PIXELS,
  islandBakeScale,
  maxIslandBakePixels,
  planIslandBakes,
} from "./islandBakePlan";

const islands = () =>
  listIslandTemplates(ARCHIPELAGO_MAX_WIDTH).map((i) => ({ index: i.index, r: islandBakeRegion(i) }));

describe("planIslandBakes (#417)", () => {
  it("queues on-screen islands first, then nearest the player", () => {
    const win = archipelagoVisualWindow(14, 21, 100, ARCHIPELAGO_HEIGHT, 27);
    const plan = planIslandBakes(islands(), new Set(), win, { x: 14, y: 21 });
    expect(plan.queue.length).toBeGreaterThan(1);
    const urgentFlags = plan.queue.map((q) => q.urgent);
    // urgent entries form a prefix
    expect(urgentFlags).toEqual([...urgentFlags].sort((a, b) => Number(b) - Number(a)));
    const dist = (index: number) => {
      const r = islands().find((i) => i.index === index)!.r;
      return Math.hypot((r.x0 + r.x1) / 2 - 14, (r.y0 + r.y1) / 2 - 21);
    };
    const urgent = plan.queue.filter((q) => q.urgent).map((q) => dist(q.index));
    expect(urgent).toEqual([...urgent].sort((a, b) => a - b));
  });

  it("skips baked islands, keeps them while inside the margin, drops them past it", () => {
    const win = archipelagoVisualWindow(14, 21, 100, ARCHIPELAGO_HEIGHT, 27);
    const all = islands();
    const first = planIslandBakes(all, new Set(), win, { x: 14, y: 21 });
    const baked = new Set(first.keep);
    const again = planIslandBakes(all, baked, win, { x: 14, y: 21 });
    expect(again.queue).toEqual([]);
    expect([...again.keep].sort()).toEqual([...first.keep].sort());
    // Far east: the western islands are no longer kept.
    const east = archipelagoVisualWindow(90, 50, 100, ARCHIPELAGO_HEIGHT, 27);
    const far = planIslandBakes(all, baked, east, { x: 90, y: 50 });
    for (const index of far.keep) {
      expect(first.keep.has(index) && far.queue.some((q) => q.index === index)).toBe(false);
    }
    expect(far.keep.size).toBeLessThan(all.length);
  });

  it("never keeps more islands than the texture budget, at any position and aspect", () => {
    const all = islands();
    for (const aspect of [0.46, 1.6, 2.4]) {
      const half = archipelagoHalfViewCols(aspect);
      for (let x = 0; x <= 99; x += 3) {
        for (let y = 0; y <= 99; y += 3) {
          const win = archipelagoVisualWindow(x, y, 100, ARCHIPELAGO_HEIGHT, half);
          const { keep } = planIslandBakes(all, new Set(), win, { x, y });
          expect(keep.size, `${aspect} @ ${x},${y}`).toBeLessThanOrEqual(ISLAND_BAKE_MAX_ISLANDS);
        }
      }
    }
  });
});

describe("islandBakeScale (#417)", () => {
  it("stays 1x when the stage is not zoomed in", () => {
    expect(islandBakeScale(0.5)).toBe(1);
    expect(islandBakeScale(1)).toBe(1);
    expect(islandBakeScale(Number.NaN)).toBe(1);
  });

  it("bakes sharper for zoomed-in HiDPI stages (phone at DPR 3, retina laptop)", () => {
    expect(islandBakeScale(1.16)).toBeGreaterThan(1);
    expect(islandBakeScale(1.44)).toBeGreaterThan(1);
  });

  it("caps total island texture memory at every zoom", () => {
    const px = maxIslandBakePixels();
    for (const zoom of [0.3, 1, 1.2, 1.7, 2.5, 4, 10]) {
      const s = islandBakeScale(zoom);
      expect(s).toBeLessThanOrEqual(2);
      expect(ISLAND_BAKE_MAX_ISLANDS * px * s * s, `zoom ${zoom}`).toBeLessThanOrEqual(ISLAND_BAKE_MAX_PIXELS);
    }
  });
});
