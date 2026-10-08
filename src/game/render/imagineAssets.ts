import type Phaser from "phaser";

export const IMAGINE_ATLAS_KEY = "imagine-atlas";

export const IMAGINE_ANIMS_KEY = "imagine-anims";

/**
 * Queue the packed sprite atlas: a multi-page, trimmed TexturePacker atlas
 * (`imagine-0.png`, `imagine-1.png`, ...) plus Blender animation metadata
 * (#360). Missing individual frames still fall through to procedural ensure*
 * helpers after promoteAtlasFrames runs.
 *
 * Trainer frames: `player-{facing}-0` idle, `player-{facing}-1..N` walk
 * (Blender renders true east/west, #360), `player-{facing}__idle_NN` breath.
 * Grove floors/props, the Mossling, and the spar arena are Blender renders
 * that override legacy Imagine PNGs at pack time.
 */
export function preloadImagineAssets(scene: Phaser.Scene): void {
  scene.load.multiatlas(
    IMAGINE_ATLAS_KEY,
    "assets/atlas/imagine.json",
    "assets/atlas",
  );
  scene.load.json(IMAGINE_ANIMS_KEY, "assets/atlas/imagine-anims.json");
}

export type ImagineAnimSpec = {
  key: string;
  frames: string[];
  frameRate: number;
  repeat: number;
};

/** Anim specs whose every frame is present in the atlas (pure; testable). */
export function playableAnimSpecs(
  specs: readonly ImagineAnimSpec[] | undefined,
  hasFrame: (frame: string) => boolean,
): ImagineAnimSpec[] {
  return (specs ?? []).filter(
    (spec) => spec.frames.length > 0 && spec.frames.every(hasFrame),
  );
}

/**
 * Register Phaser animations from `imagine-anims.json` (call once after
 * preload). Anim keys are `<asset>__<name>`, e.g. `creature-mossling__idle`,
 * `creature-mossling-battle__attack`, `player-east__walk`.
 */
export function createImagineAnims(scene: Phaser.Scene): number {
  const doc = scene.cache.json.get(IMAGINE_ANIMS_KEY) as
    | { anims?: ImagineAnimSpec[] }
    | undefined;
  let created = 0;
  for (const spec of playableAnimSpecs(doc?.anims, (frame) =>
    hasImagineFrame(scene, frame),
  )) {
    if (scene.anims.exists(spec.key)) {
      continue;
    }
    scene.anims.create({
      key: spec.key,
      frames: spec.frames.map((frame) => ({ key: IMAGINE_ATLAS_KEY, frame })),
      frameRate: spec.frameRate,
      repeat: spec.repeat,
    });
    created += 1;
  }
  return created;
}

export type CreatureAnim = "idle" | "attack" | "hurt";

/** Phaser anim key for a creature pose key (`creature-mossling-battle`) + anim. */
export function creatureAnimKey(poseKey: string, anim: CreatureAnim): string {
  return `${poseKey}__${anim}`;
}

/**
 * Play a rendered creature anim when it exists; returns false (sprite left
 * as-is) for creatures that only have static legacy art. Battle code can call
 * `playCreatureAnim(sprite, "creature-mossling-battle", "attack")` and chain
 * back to idle on `animationcomplete`.
 */
export function playCreatureAnim(
  sprite: Phaser.GameObjects.Sprite,
  poseKey: string,
  anim: CreatureAnim,
): boolean {
  const key = creatureAnimKey(poseKey, anim);
  if (!sprite.scene.anims.exists(key)) {
    return false;
  }
  sprite.play(key, true);
  return true;
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
