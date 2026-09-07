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

  it("does not retarget non-tree props by biome", () => {
    expect(propTextureKey("fern", true, "mistwood")).toBe("prop-fern");
    expect(propTextureKey("fern", true, "emberfen")).toBe("prop-fern");
  });
});
