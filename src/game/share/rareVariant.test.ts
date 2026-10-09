import { describe, expect, it } from "vitest";
import { rareSpriteLook, rareVariantTint } from "./rareVariant";

describe("rareSpriteLook (#423)", () => {
  it("is null for a normal creature", () => {
    expect(rareSpriteLook({ definitionId: "mossling" })).toBeNull();
    expect(rareSpriteLook({ definitionId: "mossling", rare: false })).toBeNull();
  });

  it("gives the species tint and halo for a rare one", () => {
    const look = rareSpriteLook({ definitionId: "mossling", rare: true });
    expect(look).toEqual({ tint: rareVariantTint("mossling"), glow: expect.any(Number) });
    expect(look!.tint).not.toBe(0xffffff);
  });

  it("keeps Cinderling's own ember art: no hue tint, ember halo", () => {
    expect(rareSpriteLook({ definitionId: "cinder-toad", speciesId: "cinder-toad", rare: true })).toEqual({
      tint: 0xffffff,
      glow: 0xff8a3a,
    });
  });
});
