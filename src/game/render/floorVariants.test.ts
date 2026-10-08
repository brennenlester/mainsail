import { describe, expect, it } from "vitest";
import { FLOOR_VARIANT_COUNT, floorVariantKey } from "./floorVariants";

describe("floorVariantKey (#361)", () => {
  it("is deterministic per tile", () => {
    expect(floorVariantKey("grove", 3, 4)).toBe(floorVariantKey("grove", 3, 4));
  });

  it("lays the path tile along a zone's path row", () => {
    expect(floorVariantKey("shrine", 2, 5)).toBe("floor-shrine-path");
    expect(floorVariantKey("grove", 7, 5)).toBe("floor-grove-path");
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
});
