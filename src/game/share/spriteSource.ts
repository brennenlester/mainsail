import type Phaser from "phaser";
import { getCreatureDefinition } from "../creatures/catalog";
import { IMAGINE_ATLAS_KEY } from "../render/imagineAssets";

/** A drawable crop of a loaded Phaser texture, usable with ctx.drawImage. */
export type SpriteCrop = {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export type SpriteLookup = (creatureId: string) => SpriteCrop | null;

function cropFromFrame(frame: Phaser.Textures.Frame | null | undefined): SpriteCrop | null {
  if (!frame || frame.cutWidth <= 0 || frame.cutHeight <= 0) {
    return null;
  }
  const image = frame.source?.image as CanvasImageSource | undefined;
  if (!image) {
    return null;
  }
  return {
    image,
    sx: frame.cutX,
    sy: frame.cutY,
    sw: frame.cutWidth,
    sh: frame.cutHeight,
  };
}

/**
 * Read creature art straight out of the Phaser texture manager (packed
 * Imagine atlas frames, standalone PNGs, or procedural canvas textures) so the
 * Companion Card matches what players see in-game. Prefers the encounter pose,
 * then idle art — same order as resolveCreaturePoseTexture. Call
 * ensureCreatureTextures first so procedural fallbacks exist.
 */
export function createSpriteLookup(game: Phaser.Game): SpriteLookup {
  const textures = game.textures;
  const atlas = textures.exists(IMAGINE_ATLAS_KEY)
    ? textures.get(IMAGINE_ATLAS_KEY)
    : null;
  return (creatureId) => {
    let spriteKey: string;
    try {
      spriteKey = getCreatureDefinition(creatureId).spriteKey;
    } catch {
      return null;
    }
    for (const key of [`${spriteKey}-encounter`, `${spriteKey}-idle`, spriteKey]) {
      if (atlas?.has(key)) {
        const crop = cropFromFrame(atlas.get(key));
        if (crop) {
          return crop;
        }
      }
      if (textures.exists(key)) {
        const crop = cropFromFrame(textures.get(key).get());
        if (crop) {
          return crop;
        }
      }
    }
    return null;
  };
}
