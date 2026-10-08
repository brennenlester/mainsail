import { describe, expect, it } from "vitest";
import { arenaLayerKeys, arenaVariantForZone } from "./arenaLayers";

describe("arena layers (#361)", () => {
  it("keeps the grove keys and prefixes the others", () => {
    expect(arenaLayerKeys("grove").sky).toBe("arena-sky");
    expect(arenaLayerKeys("village").platform).toBe("arena-village-platform");
    expect(arenaLayerKeys("night").hills).toBe("arena-night-hills");
  });

  it("picks village outside the grove and night when dark", () => {
    expect(arenaVariantForZone("grove")).toBe("grove");
    expect(arenaVariantForZone("shrine")).toBe("village");
    expect(arenaVariantForZone("grove", true)).toBe("night");
  });
});
