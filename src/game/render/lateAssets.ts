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

/** Fetches in flight (on any scene's loader) and fetches that failed. */
const inflight = new Set<string>();
const failed = new Set<string>();
const settleListeners = new Set<() => void>();

function notifySettled(): void {
  for (const listener of [...settleListeners]) {
    listener();
  }
}

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

export type LateImageStatus = "ready" | "loading" | "failed" | "missing";

export function lateImageStatus(scene: Phaser.Scene, key: string): LateImageStatus {
  if (scene.textures.exists(key)) {
    return "ready";
  }
  if (inflight.has(key)) {
    return "loading";
  }
  return failed.has(key) ? "failed" : "missing";
}

/**
 * Queue missing late images on the scene loader; returns how many were
 * queued. Keys already loaded or in flight anywhere are skipped (no
 * duplicate-key loads). A slow fetch shows the loading veil with `caption`
 * (null: never, e.g. a silent prefetch). `retry` re-queues failed keys.
 */
export function queueLateImages(
  scene: Phaser.Scene,
  keys: Iterable<string>,
  caption: string | null = "Something stirs…",
  retry = false,
): number {
  const queued: string[] = [];
  for (const key of keys) {
    const url = LATE_IMAGES[key];
    if (!url || inflight.has(key) || scene.textures.exists(key) || (failed.has(key) && !retry)) {
      continue;
    }
    failed.delete(key);
    inflight.add(key);
    scene.load.image(key, url);
    queued.push(key);
  }
  if (queued.length === 0) {
    return 0;
  }
  const mine = new Set(queued);
  const onError = (file: { key: string }): void => {
    if (mine.has(file.key)) {
      // ensure* procedural art fills in for this key until a retry lands.
      failed.add(file.key);
    }
  };
  let progress = 0;
  let shown = false;
  const onProgress = (value: number): void => {
    progress = value;
    if (shown && caption) {
      showLoadingVeil(caption, progress);
    }
  };
  // Only veil a slow fetch; a cached PNG lands before anyone would notice.
  const veil =
    caption === null
      ? undefined
      : window.setTimeout(() => {
          shown = true;
          showLoadingVeil(caption, progress);
        }, 150);
  const cleanup = (): void => {
    window.clearTimeout(veil);
    scene.load.off("loaderror", onError);
    scene.load.off("progress", onProgress);
    scene.load.off("complete", cleanup);
    scene.events.off("shutdown", abort);
    if (shown) {
      hideLoadingVeil();
    }
    // Textures join the cache when the batch completes. A key with neither a
    // texture nor an error (scene shut down mid-fetch) is free to refetch.
    for (const key of mine) {
      inflight.delete(key);
    }
    mine.clear();
    notifySettled();
  };
  // The scene shut down mid-fetch (its loader is reset): nothing will settle.
  const abort = (): void => cleanup();
  scene.load.on("loaderror", onError);
  scene.load.on("progress", onProgress);
  scene.load.once("complete", cleanup);
  scene.events.once("shutdown", abort);
  return queued.length;
}

/**
 * Fetch late images outside `preload()` (prefetch on approach, or before an
 * action that will show them). Resolves true once every key is renderable,
 * false if any fetch failed (procedural art stands in). Safe to call
 * repeatedly; `retry` re-fetches failed keys.
 */
export function loadLateImages(
  scene: Phaser.Scene,
  keys: Iterable<string>,
  caption: string | null = null,
  retry = false,
): Promise<boolean> {
  const wanted = [...keys].filter((key) => isLateImageKey(key));
  if (queueLateImages(scene, wanted, caption, retry) > 0 && !scene.load.isLoading()) {
    scene.load.start();
  }
  return new Promise((resolve) => {
    const check = (): void => {
      const states = wanted.map((key) => lateImageStatus(scene, key));
      if (states.includes("loading")) {
        return;
      }
      settleListeners.delete(check);
      resolve(states.every((s) => s === "ready"));
    };
    settleListeners.add(check);
    check();
  });
}

/** Test hook: forget fetch state between cases. */
export function resetLateImagesForTest(): void {
  inflight.clear();
  failed.clear();
  settleListeners.clear();
}
