import { describe, expect, it } from "vitest";
import { propTextureKey } from "./zoneProps";

describe("propTextureKey biome trees (#345)", () => {
  it("uses the grove tree by default and in Grove", () => {
    expect(propTextureKey("tree")).toBe("prop-tree");
    expect(propTextureKey("tree", true, "grove")).toBe("prop-tree");
  });

  it("uses mistwood and emberfen canopy variants", () => {
    expect(propTextureKey("tree", true, "mistwood")).toBe("prop-tree-mistwood");
    expect(propTextureKey("tree", true, "emberfen")).toBe("prop-tree-emberfen");
  });

  it("does not retarget non-tree props by biome", () => {
    expect(propTextureKey("fern", true, "mistwood")).toBe("prop-fern");
    expect(propTextureKey("fern", true, "emberfen")).toBe("prop-fern");
  });
});
