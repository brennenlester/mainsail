import type Phaser from "phaser";
import { type AudioBootPhase, preloadGameAudio } from "../audio/gameAudio";
import { preloadImagineAssets } from "./imagineAssets";

/**
 * Boot manifest (#410). `title` is what the title screen needs to be
 * interactive; `world` (atlas, anims, SFX) streams in behind the title;
 * `music` is the rest of the soundtrack, queued once the world is playable
 * (#417); `all` is everything (routes that skip the title). Late-game art
 * never appears here (see lateAssets).
 */
export type BootPhase = AudioBootPhase;

/** Standalone (not atlas-packed) world PNGs the first zone can show. */
const WORLD_IMAGES: Readonly<Record<string, string>> = {
  "boundary-warden-cottage": "assets/world/boundary-cottage.png",
  "boundary-weaver-cottage": "assets/world/boundary-cottage.png",
  "boundary-hearthkeep-cottage": "assets/world/boundary-cottage.png",
  "boundary-hermit-cottage": "assets/world/boundary-cottage.png",
};

export function queueBootAssets(scene: Phaser.Scene, phase: BootPhase): void {
  if (phase === "world" || phase === "all") {
    preloadImagineAssets(scene);
    for (const [key, url] of Object.entries(WORLD_IMAGES)) {
      scene.load.image(key, url);
    }
  }
  preloadGameAudio(scene, phase);
}

let ready = false;
let progress = 0;
const waiters: Array<() => void> = [];
const progressListeners = new Set<(value: number) => void>();

/** World assets (atlas, anims, world audio) are loaded and anims registered. */
export function isWorldAssetsReady(): boolean {
  return ready;
}

export function getWorldAssetsProgress(): number {
  return ready ? 1 : progress;
}

export function setWorldAssetsProgress(value: number): void {
  progress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  for (const listener of progressListeners) {
    listener(progress);
  }
}

export function markWorldAssetsReady(): void {
  if (ready) {
    return;
  }
  ready = true;
  setWorldAssetsProgress(1);
  for (const run of waiters.splice(0)) {
    run();
  }
}

/** Run `cb` once world assets are ready (now, if they already are). */
export function whenWorldAssetsReady(
  cb: () => void,
  onProgress?: (value: number) => void,
): void {
  if (ready) {
    cb();
    return;
  }
  if (onProgress) {
    progressListeners.add(onProgress);
    onProgress(progress);
  }
  waiters.push(() => {
    if (onProgress) {
      progressListeners.delete(onProgress);
    }
    cb();
  });
}

/** Test hook: forget readiness between cases. */
export function resetWorldAssetsForTest(): void {
  ready = false;
  progress = 0;
  waiters.length = 0;
  progressListeners.clear();
}
