import { describe, expect, it } from "vitest";
import { propTextureKey, resolvePropTextureKey } from "./zoneProps";

describe("propTextureKey biome trees (#345)", () => {
  it("uses the grove tree by default and in Grove", () => {
    expect(propTextureKey("tree")).toBe("prop-tree");
    expect(propTextureKey("tree", true, "grove")).toBe("prop-tree");
  });

  it("uses mistwood and emberfen canopy variants", () => {
    expect(propTextureKey("tree", true, "mistwood")).toBe("prop-tree-mistwood");
    expect(propTextureKey("tree", true, "emberfen")).toBe("prop-tree-emberfen");
  });

  it("falls back to the grove tree when a biome canopy is missing", () => {
    expect(
      resolvePropTextureKey("tree", true, "mistwood", () => false),
    ).toBe("prop-tree");
    expect(
      resolvePropTextureKey("tree", true, "emberfen", () => false),
    ).toBe("prop-tree");
    expect(
      resolvePropTextureKey(
        "tree",
        true,
        "mistwood",
        (key) => key === "prop-tree-mistwood",
      ),
    ).toBe("prop-tree-mistwood");
  });

  it("retargets gatherable props by biome and falls back to the base sheet (#392)", () => {
    expect(propTextureKey("fern", true, "mistwood")).toBe("prop-fern-mistwood");
    expect(propTextureKey("pebble-pile", true, "emberfen")).toBe("prop-pebble-pile-emberfen");
    expect(propTextureKey("standing-stone", true, "harbor")).toBe("prop-standing-stone-harbor");
    expect(propTextureKey("fern", true, "grove")).toBe("prop-fern");
    expect(propTextureKey("brazier", true, "emberfen")).toBe("prop-brazier");
    expect(resolvePropTextureKey("fern", true, "harbor", () => false)).toBe("prop-fern");
  });
});
