import type Phaser from "phaser";
import { hideLoadingVeil, showLoadingVeil } from "../ui/loadingVeil";

/**
 * Post-game art that never rides the boot preload (#410): ~6.8 MB of
 * standalone PNGs only a late-game save ever shows. The scene that first
 * shows one queues it in its own `preload()` (Phaser holds `create()` until
 * it lands, so there is no missing-texture frame) or fetches it ahead with
 * `loadLateImages`.
 */
export const LATE_IMAGES: Readonly<Record<string, string>> = {
  "creature-tide-sovereign": "assets/creatures/creature-tide-sovereign.png",
  "creature-cairn-sovereign": "assets/creatures/creature-cairn-sovereign.png",
  "creature-horizon-sovereign": "assets/creatures/creature-horizon-sovereign.png",
  "creature-eclipse-sovereign": "assets/creatures/creature-eclipse-sovereign.png",
  "minigame-hearth-lots-board": "assets/minigames/hearth-lots-board.png",
};

/** Creature ids whose only art is a late image (their `spriteKey` is `creature-<id>`). */
export const LATE_CREATURE_IDS: readonly string[] = [
  "tide-sovereign",
  "cairn-sovereign",
  "horizon-sovereign",
  "eclipse-sovereign",
];

const failed = new Set<string>();
const inflight = new Set<string>();

export function isLateImageKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(LATE_IMAGES, key);
}

/** Late image keys for these creature ids (others are atlas / procedural). */
export function lateCreatureKeys(creatureIds: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const id of creatureIds) {
    if (LATE_CREATURE_IDS.includes(id)) {
      keys.add(`creature-${id}`);
    }
  }
  return [...keys];
}

/**
 * True while a late key has neither loaded nor failed: procedural fallbacks
 * must not claim the key in that window, or the real PNG could never load.
 */
export function isLateImagePending(scene: Phaser.Scene, key: string): boolean {
  return isLateImageKey(key) && !failed.has(key) && !scene.textures.exists(key);
}

/**
 * Queue missing late images on the scene loader; returns how many were
 * queued. A slow fetch shows the loading veil with `caption` (null: never,
 * e.g. while the boot loader already shows progress).
 */
export function queueLateImages(
  scene: Phaser.Scene,
  keys: Iterable<string>,
  caption: string | null = "Something stirs…",
): number {
  let queued = 0;
  for (const key of keys) {
    const url = LATE_IMAGES[key];
    if (!url || failed.has(key) || scene.textures.exists(key)) {
      continue;
    }
    scene.load.image(key, url);
    queued += 1;
  }
  if (queued === 0) {
    return 0;
  }
  const onError = (file: { key: string }): void => {
    if (isLateImageKey(file.key)) {
      // ensure* procedural art fills in for this key from now on.
      failed.add(file.key);
    }
  };
  scene.load.on("loaderror", onError);
  let progress = 0;
  let shown = false;
  const onProgress = (value: number): void => {
    progress = value;
    if (shown && caption) {
      showLoadingVeil(caption, progress);
    }
  };
  scene.load.on("progress", onProgress);
  // Only veil a slow fetch; a cached PNG lands before anyone would notice.
  const veil =
    caption === null
      ? undefined
      : window.setTimeout(() => {
          shown = true;
          showLoadingVeil(caption, progress);
        }, 150);
  scene.load.once("complete", () => {
    window.clearTimeout(veil);
    scene.load.off("loaderror", onError);
    scene.load.off("progress", onProgress);
    if (shown) {
      hideLoadingVeil();
    }
  });
  return queued;
}

/**
 * Fetch late images outside `preload()` (prefetch on approach, or before an
 * action that will show them). Resolves once every key has loaded or failed
 * (a failed key falls back to procedural art). Safe to call repeatedly.
 */
export function loadLateImages(
  scene: Phaser.Scene,
  keys: Iterable<string>,
  caption: string | null = "Something stirs…",
): Promise<void> {
  const wanted = [...keys].filter((key) => isLateImagePending(scene, key));
  const fresh = wanted.filter((key) => !inflight.has(key));
  if (queueLateImages(scene, fresh, caption) > 0) {
    for (const key of fresh) {
      inflight.add(key);
    }
    if (!scene.load.isLoading()) {
      scene.load.start();
    }
  }
  return Promise.all(
    wanted.map(
      (key) =>
        new Promise<void>((resolve) => {
          const settle = (): void => {
            if (!isLateImagePending(scene, key)) {
              inflight.delete(key);
              scene.load.off("complete", settle);
              scene.textures.off("addtexture", settle);
              resolve();
            }
          };
          // `complete` follows every batch, loaded or failed; `addtexture`
          // covers a fetch already running on another scene's loader.
          scene.load.on("complete", settle);
          scene.textures.on("addtexture", settle);
          settle();
        }),
    ),
  ).then(() => undefined);
}
