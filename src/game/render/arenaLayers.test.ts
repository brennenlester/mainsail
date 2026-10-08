import { describe, expect, it } from "vitest";
import {
  arenaLayerKeys,
  arenaVariantForZone,
  noteArenaContext,
  resolveArenaLayers,
} from "./arenaLayers";

describe("arena layers (#361)", () => {
  it("keeps the grove keys and prefixes the others", () => {
    expect(arenaLayerKeys("grove").sky).toBe("arena-sky");
    expect(arenaLayerKeys("village").platform).toBe("arena-village-platform");
    expect(arenaLayerKeys("night").hills).toBe("arena-night-hills");
  });

  it("uses the plaza in Hearth Crossing, the meadow elsewhere, night when dark", () => {
    expect(arenaVariantForZone("grove")).toBe("grove");
    expect(arenaVariantForZone("shrine")).toBe("grove");
    expect(arenaVariantForZone("village")).toBe("village");
    expect(arenaVariantForZone("hearthkeep-cottage")).toBe("village");
    expect(arenaVariantForZone("grove", 0.9)).toBe("night");
  });

  it("falls back to the grove arena, then to null", () => {
    noteArenaContext("village", 0);
    expect(resolveArenaLayers(() => true)?.sky).toBe("arena-village-sky");
    expect(resolveArenaLayers((k) => !k.startsWith("arena-village"))?.sky).toBe("arena-sky");
    expect(resolveArenaLayers(() => false)).toBeNull();
    noteArenaContext("grove", 0);
  });

  it("lets a story battle force the ember arena, falling back to night (#385)", () => {
    expect(arenaVariantForZone("emberfen", 0.9)).not.toBe("ember");
    expect(resolveArenaLayers(() => true, "ember")?.sky).toBe("arena-ember-sky");
    expect(resolveArenaLayers((k) => !k.startsWith("arena-ember"), "ember")?.sky).toBe(
      "arena-night-sky",
    );
    expect(resolveArenaLayers(() => true, "village")?.sky).toBe("arena-village-sky");
  });
});
