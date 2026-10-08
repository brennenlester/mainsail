import { describe, expect, it } from "vitest";
import {
  FLOOR_VARIANT_COUNT,
  floorVariantKey,
  nearShore,
  seaCellAt,
  seaTileLayers,
  waterVariantKey,
} from "./floorVariants";
import { TileType } from "../world/zoneTypes";
import { getZone } from "../world/zones";

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

describe("ocean + shore layers (#412)", () => {
  // 7x6 sea with a 3x2 island (x 2..4, y 2..3) and a dock under its middle.
  const rows = [".......", ".......", "..LLL..", "..LLL..", "...D...", "......."];
  const tiles = rows.map((r) =>
    [...r].map((c) => (c === "L" ? TileType.Floor : c === "D" ? TileType.Dock : TileType.Water)),
  );
  const sea = { id: "archipelago" as const, tiles, width: 7, height: 6 };

  it("hashes ocean variants instead of a light/dark checker", () => {
    const seen = new Set<string>();
    let checker = 0;
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        const key = waterVariantKey(x, y, false);
        seen.add(key);
        if (key === waterVariantKey(x + 2, y, false)) checker += 1;
      }
    }
    expect(seen.size).toBe(FLOOR_VARIANT_COUNT);
    expect(checker).toBeLessThan(80);
    expect(waterVariantKey(3, 4, true)).toMatch(/^tile-sea-shallow-v[0-3]$/);
  });

  it("uses shallow water next to land and deep water in the open", () => {
    expect(nearShore(sea, 1, 1)).toBe(true);
    expect(nearShore(sea, 6, 0)).toBe(false);
    expect(seaTileLayers(sea, 6, 0)?.base).toMatch(/^tile-sea-deep-v/);
    expect(seaTileLayers(sea, 3, 1)?.base).toMatch(/^tile-sea-shallow-v/);
  });

  it("lays beach quadrants on water facing the island", () => {
    // North of the island's middle: both southern quadrants face land.
    expect(seaTileLayers(sea, 3, 1)?.overlays).toEqual([
      { key: "shore-sand-edge-e", turns: 1 },
      { key: "shore-sand-edge-n", turns: 2 },
    ]);
    // Diagonal to the NE corner: only the SW quadrant, as an outer corner.
    expect(seaTileLayers(sea, 5, 1)?.overlays).toEqual([{ key: "shore-sand-outer", turns: 2 }]);
    // North of the NE corner tile: the SE quadrant is where the coast ends.
    expect(seaTileLayers(sea, 4, 1)?.overlays).toEqual([
      { key: "shore-sand-end-e", turns: 1 },
      { key: "shore-sand-edge-n", turns: 2 },
    ]);
  });

  it("rims island tiles with sand and rounds their convex corners", () => {
    const corner = seaTileLayers(sea, 4, 2);
    expect(corner?.base).toBeUndefined();
    expect(corner?.overlays).toEqual([
      { key: "shore-land-inner", turns: 0 },
      { key: "shore-land-edge-n", turns: 1 },
      { key: "shore-land-edge-e", turns: 3 },
    ]);
    expect(seaTileLayers(sea, 3, 2)?.overlays).toHaveLength(2);
  });

  it("draws docks as planks over water, beach underneath", () => {
    expect(seaTileLayers(sea, 3, 4)).toEqual({
      base: expect.stringMatching(/^tile-sea-shallow-v/),
      overlays: [
        { key: "shore-sand-edge-n", turns: 0 },
        { key: "shore-sand-edge-e", turns: 3 },
        { key: "tile-pier", turns: 0 },
      ],
    });
    // The island tile above the dock keeps its beach (a dock is not land).
    expect(seaTileLayers(sea, 3, 3)?.overlays).toEqual([
      { key: "shore-land-edge-e", turns: 1 },
      { key: "shore-land-edge-n", turns: 2 },
    ]);
  });

  it("foams Harbor + Fields bay water against land and keeps other zones plain", () => {
    const harbor = { ...sea, id: "harbor" as const };
    expect(seaTileLayers(harbor, 3, 1)?.overlays.map((l) => l.key)).toEqual([
      "shore-foam-edge-e",
      "shore-foam-edge-n",
    ]);
    expect(seaTileLayers(harbor, 3, 2)).toBeNull();
    expect(seaTileLayers({ ...sea, id: "overworld" }, 3, 1)?.overlays[0]?.key).toBe("shore-foam-edge-e");
    expect(seaTileLayers({ ...sea, id: "grove" }, 3, 1)).toBeNull();
    // Fields bay islets keep their own tile and get no foam box around them.
    const bay = getZone("overworld");
    expect(seaTileLayers(bay, 2, 14)).toBeNull();
    expect(seaCellAt(bay, 2, 14)).toBe("water");
    expect(seaTileLayers(bay, 4, 13)?.overlays.map((l) => l.key)).toContain("shore-foam-edge-n");
  });
});
