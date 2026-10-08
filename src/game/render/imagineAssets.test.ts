import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import {
  IMAGINE_ATLAS_KEY,
  creatureAnimKey,
  hasImagineFrame,
  hasWorldTexture,
  imagineTexture,
  playableAnimSpecs,
} from "./imagineAssets";

function sceneWith(atlasFrames: string[], standalone: string[]): Phaser.Scene {
  const frames = new Set(atlasFrames);
  const textures = {
    exists: (key: string) =>
      key === IMAGINE_ATLAS_KEY
        ? frames.size > 0
        : standalone.includes(key),
    get: (key: string) => {
      if (key !== IMAGINE_ATLAS_KEY) {
        throw new Error(`unexpected texture lookup: ${key}`);
      }
      return { has: (frame: string) => frames.has(frame) };
    },
  };
  return { textures } as unknown as Phaser.Scene;
}

describe("imagine atlas helpers (#193)", () => {
  it("resolves packed frames to the atlas texture", () => {
    const scene = sceneWith(["floor-grove-light"], []);
    expect(imagineTexture(scene, "floor-grove-light")).toEqual([
      IMAGINE_ATLAS_KEY,
      "floor-grove-light",
    ]);
    expect(hasImagineFrame(scene, "floor-grove-light")).toBe(true);
  });

  it("falls back to standalone keys for non-atlas textures", () => {
    const scene = sceneWith(["floor-grove-light"], ["creature-tide-sovereign"]);
    expect(imagineTexture(scene, "creature-tide-sovereign")).toEqual([
      "creature-tide-sovereign",
      undefined,
    ]);
  });

  it("hasWorldTexture accepts either source and rejects unknowns", () => {
    const scene = sceneWith(["prop-tree"], ["npc-villager"]);
    expect(hasWorldTexture(scene, "prop-tree")).toBe(true);
    expect(hasWorldTexture(scene, "npc-villager")).toBe(true);
    expect(hasWorldTexture(scene, "prop-missing")).toBe(false);
  });

  it("handles a missing atlas entirely (procedural-only boot)", () => {
    const scene = sceneWith([], ["floor-grove-light"]);
    expect(hasImagineFrame(scene, "floor-grove-light")).toBe(false);
    expect(imagineTexture(scene, "floor-grove-light")).toEqual([
      "floor-grove-light",
      undefined,
    ]);
  });
});

describe("rendered anim metadata (#360)", () => {
  const specs = [
    { key: "creature-mossling__idle", frames: ["a", "b"], frameRate: 8, repeat: -1 },
    { key: "creature-mossling-battle__hurt", frames: ["c", "missing"], frameRate: 10, repeat: 0 },
    { key: "empty__idle", frames: [], frameRate: 8, repeat: -1 },
  ];

  it("keeps only anims whose frames are all packed", () => {
    const packed = new Set(["a", "b", "c"]);
    expect(
      playableAnimSpecs(specs, (f) => packed.has(f)).map((s) => s.key),
    ).toEqual(["creature-mossling__idle"]);
  });

  it("tolerates a missing anim file", () => {
    expect(playableAnimSpecs(undefined, () => true)).toEqual([]);
  });

  it("names creature anims <poseKey>__<anim>", () => {
    expect(creatureAnimKey("creature-mossling-battle", "attack")).toBe(
      "creature-mossling-battle__attack",
    );
  });
});
