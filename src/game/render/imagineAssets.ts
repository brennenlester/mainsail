import type Phaser from "phaser";

export const IMAGINE_ATLAS_KEY = "imagine-atlas";

/**
 * Queue the packed Imagine atlas (PNG + JSON). Missing individual frames still
 * fall through to procedural ensure* helpers after promoteAtlasFrames runs.
 *
 * Trainer frames (hybrid #134/#135): E/W idle+walk1–4 → `player-{east|west}-0..4`
 * (east = hflip west). S/N idle+walk1–2 → `player-{south|north}-0..2` (south-2
 * keeps staff side). Distance-synced multi-frame gait is wired in #136.
 * Grove/Mistwood/Emberfen floors, borders, and canopy props are unique packed sheets (#345).
 */
export function preloadImagineAssets(scene: Phaser.Scene): void {
  scene.load.atlas(
    IMAGINE_ATLAS_KEY,
    "assets/atlas/imagine.png",
    "assets/atlas/imagine.json",
  );
}

/**
 * True when the packed atlas carries this key as a frame.
 */
export function hasImagineFrame(
  scene: Phaser.Scene,
  key: string,
): boolean {
  return (
    scene.textures.exists(IMAGINE_ATLAS_KEY) &&
    scene.textures.get(IMAGINE_ATLAS_KEY).has(key)
  );
}

/**
 * Texture arguments for a logical key: the packed atlas frame when it exists
 * (keeps WebGL batching on one texture, #193), else the standalone key
 * (individually loaded PNGs and procedural fallbacks). Spread into
 * `add.image` / `add.sprite` / `setTexture`.
 */
export function imagineTexture(
  scene: Phaser.Scene,
  key: string,
): [string, string | undefined] {
  return hasImagineFrame(scene, key)
    ? [IMAGINE_ATLAS_KEY, key]
    : [key, undefined];
}

/**
 * True when the key is renderable at all — as an atlas frame or a standalone
 * texture. Procedural ensure* helpers use this to skip generation.
 */
export function hasWorldTexture(scene: Phaser.Scene, key: string): boolean {
  return hasImagineFrame(scene, key) || scene.textures.exists(key);
}
