import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the committed output of `npm run pack:atlas` (#360).
const ATLAS_DIR = path.resolve(__dirname, "../../../public/assets/atlas");

type Frame = { filename: string };
type Page = { image: string; size: { w: number; h: number }; frames: Frame[] };

const atlas = JSON.parse(
  fs.readFileSync(path.join(ATLAS_DIR, "imagine.json"), "utf8"),
) as { textures: Page[] };
const anims = JSON.parse(
  fs.readFileSync(path.join(ATLAS_DIR, "imagine-anims.json"), "utf8"),
) as { anims: { key: string; frames: string[] }[] };
const frames = new Set(atlas.textures.flatMap((p) => p.frames.map((f) => f.filename)));
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

describe("packed atlas manifest", () => {
  it("uses power-of-two pages that exist on disk", () => {
    expect(atlas.textures.length).toBeGreaterThan(0);
    for (const page of atlas.textures) {
      expect(isPow2(page.size.w) && isPow2(page.size.h)).toBe(true);
      expect(page.size.w).toBeLessThanOrEqual(2048);
      expect(fs.existsSync(path.join(ATLAS_DIR, page.image))).toBe(true);
    }
  });

  it("packs each frame key once", () => {
    const total = atlas.textures.reduce((n, p) => n + p.frames.length, 0);
    expect(frames.size).toBe(total);
  });

  it("only references packed frames from anim metadata", () => {
    for (const anim of anims.anims) {
      for (const frame of anim.frames) {
        expect(frames.has(frame), `${anim.key} -> ${frame}`).toBe(true);
      }
    }
  });

  it("ships the Blender player walk (6 per facing) and Mossling sets", () => {
    for (const facing of ["south", "north", "east", "west"]) {
      for (let i = 0; i <= 6; i += 1) {
        expect(frames.has(`player-${facing}-${i}`)).toBe(true);
      }
    }
    const keys = anims.anims.map((a) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "creature-mossling__idle",
        "creature-mossling-battle__attack",
        "creature-mossling-battle__hurt",
      ]),
    );
  });
});
