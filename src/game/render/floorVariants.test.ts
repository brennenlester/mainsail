import { describe, expect, it } from "vitest";
import { FLOOR_VARIANT_COUNT, floorVariantKey } from "./floorVariants";

describe("floorVariantKey (#361)", () => {
  it("is deterministic per tile", () => {
    expect(floorVariantKey("grove", 3, 4)).toBe(floorVariantKey("grove", 3, 4));
  });

  it("lays the path tile along a zone's path row", () => {
    expect(floorVariantKey("shrine", 2, 5)).toBe("floor-shrine-path");
    expect(floorVariantKey("grove", 7, 5)).toBe("floor-grove-path");
    // Mid-grass end gets the rounded cap, not a square edge.
    expect(floorVariantKey("grove", 6, 5)).toBe("floor-grove-path-west");
    expect(floorVariantKey("grove", 2, 5)).not.toBe("floor-grove-path");
  });

  it("mixes every variant without a checkerboard", () => {
    const seen = new Map<string, number>();
    let checker = 0;
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        if (y === 5) continue;
        const key = floorVariantKey("village", x, y);
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if (key === floorVariantKey("village", x + 2, y)) checker += 1;
      }
    }
    expect(seen.size).toBe(FLOOR_VARIANT_COUNT);
    // Plain v0 dominates so detail reads as scattered, not tiled.
    expect(seen.get("floor-village-v0") ?? 0).toBeGreaterThan(30);
    // A period-2 pattern would repeat on every tile; hashed picks do not.
    expect(checker).toBeLessThan(80);
  });

  it("lays #392 roads, crossings, shores, piers and the cottage runner", () => {
    expect(floorVariantKey("overworld", 7, 3)).toBe("floor-overworld-path-v");
    expect(floorVariantKey("overworld", 10, 7)).toBe("floor-overworld-path");
    expect(floorVariantKey("overworld", 7, 7)).toBe("floor-overworld-path-cross");
    expect(floorVariantKey("overworld", 4, 12)).toBe("floor-overworld-shore");
    expect(floorVariantKey("overworld", 7, 13)).toBe("tile-dock-light");
    expect(floorVariantKey("overworld", 2, 14)).toBe("floor-overworld-islet");
    expect(floorVariantKey("harbor", 3, 6)).toBe("tile-dock-light");
    expect(floorVariantKey("emberfen", 7, 5)).toBe("floor-emberfen-path-east");
    // Every cottage shares one plank set; the rug runs from the door.
    expect(floorVariantKey("weaver-cottage", 3, 3)).toBe("floor-cottage-path-north");
    expect(floorVariantKey("hermit-cottage", 3, 5)).toBe("floor-cottage-path-v");
    expect(floorVariantKey("warden-cottage", 1, 1)).toMatch(/^floor-cottage-v[0-3]$/);
  });
});
