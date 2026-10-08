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

  it("stays under the 12 MB atlas budget (#361)", () => {
    const bytes = atlas.textures.reduce(
      (n, p) => n + fs.statSync(path.join(ATLAS_DIR, p.image)).size,
      0,
    );
    expect(bytes).toBeLessThan(12 * 1024 * 1024);
  });

  it("ships the first-hour creature roster with battle anims (#361)", () => {
    const keys = new Set(anims.anims.map((a) => a.key));
    for (const id of [
      "mossling",
      "bramblewarden",
      "ember-wisp",
      "hearthflame",
      "brook-nymph",
      "thunder-finch",
      "cinder-toad",
      "rootwalker",
      "lantern-fox",
      "stone-hound",
    ]) {
      expect(frames.has(`creature-${id}-encounter`), id).toBe(true);
      expect(keys.has(`creature-${id}__idle`), id).toBe(true);
      for (const anim of ["idle", "attack", "hurt", "faint"]) {
        expect(keys.has(`creature-${id}-battle__${anim}`), `${id} ${anim}`).toBe(true);
      }
    }
    for (const npc of ["warden-bryn", "weaver-sable", "hearthkeep-odd"]) {
      expect(keys.has(`npc-${npc}__idle`) && keys.has(`npc-${npc}__talk`), npc).toBe(true);
    }
  });

  it("keeps texture memory bounded: at most 8 pages of 2048² (#392)", () => {
    expect(atlas.textures.length).toBeLessThanOrEqual(8);
  });

  it("ships the #392 biome kits, Wren and the Fields/Mistwood/Emberfen roster", () => {
    for (const zone of ["overworld", "mistwood", "emberfen", "harbor", "cottage"]) {
      for (let v = 0; v < 4; v += 1) {
        expect(frames.has(`floor-${zone}-v${v}`), `${zone} v${v}`).toBe(true);
      }
    }
    for (const key of [
      "floor-overworld-path-v",
      "floor-overworld-path-cross",
      "floor-overworld-shore",
      "floor-harbor-shore",
      "floor-cottage-path-north",
      "tile-water-light",
      "tile-dock-light",
      "wall-cottage-face",
      "wall-cottage-top",
      "prop-brazier",
      "prop-glowcap",
      "prop-door",
      "npc-rival-wren",
      "npc-rival-wren-portrait",
    ]) {
      expect(frames.has(key), key).toBe(true);
    }
    const keys = new Set(anims.anims.map((a) => a.key));
    for (const facing of ["south", "north", "east", "west"]) {
      expect(keys.has(`npc-rival-wren-${facing}__walk`), facing).toBe(true);
    }
    expect(keys.has("npc-rival-wren__talk") && keys.has("npc-rival-wren-portrait__talk")).toBe(true);
    for (const id of [
      "peat-sprite",
      "bog-lantern",
      "mist-serpent",
      "cinder-matriarch",
      "cinder-matriarch-phase2",
    ]) {
      expect(frames.has(`creature-${id}-encounter`), id).toBe(true);
      for (const anim of ["idle", "attack", "hurt", "faint"]) {
        expect(keys.has(`creature-${id}-battle__${anim}`), `${id} ${anim}`).toBe(true);
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
