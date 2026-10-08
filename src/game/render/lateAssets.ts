/**
 * Post-game art that never rides the boot preload (#410): ~6.8 MB of
 * standalone PNGs only a late-game save ever shows.
 *
 * Fetches are game-wide, not scene-bound: one request per key no matter how
 * many scenes want it or which of them shut down meanwhile; the image goes
 * straight into the shared texture manager. Scenes hold their `create()` on
 * the same per-key promise (`waitForLateImages` in `lateAssetWait.ts`).
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

/** The slice of Phaser's TextureManager this module needs. */
export type LateTextures = {
  exists(key: string): boolean;
  addImage(key: string, source: HTMLImageElement): unknown;
};

type ImageLike = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

let makeImage = (): ImageLike => new Image() as unknown as ImageLike;
const fetches = new Map<string, Promise<boolean>>();
const failed = new Set<string>();

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

export type LateImageStatus = "ready" | "loading" | "failed" | "missing";

export function lateImageStatus(textures: LateTextures, key: string): LateImageStatus {
  if (textures.exists(key)) {
    return "ready";
  }
  if (fetches.has(key)) {
    return "loading";
  }
  return failed.has(key) ? "failed" : "missing";
}

/**
 * True while a late key has neither loaded nor failed: procedural fallbacks
 * must not claim the key in that window, or the real PNG could never land.
 */
export function isLateImagePending(textures: LateTextures, key: string): boolean {
  const status = lateImageStatus(textures, key);
  return isLateImageKey(key) && (status === "loading" || status === "missing");
}

/**
 * Fetch one late image (or join the fetch already running). Resolves true
 * once the texture exists, false if the fetch failed (procedural art stands
 * in). A failed key is only refetched with `retry`.
 */
export function fetchLateImage(
  textures: LateTextures,
  key: string,
  retry = false,
): Promise<boolean> {
  const url = LATE_IMAGES[key];
  if (!url) {
    return Promise.resolve(false);
  }
  if (textures.exists(key)) {
    return Promise.resolve(true);
  }
  const running = fetches.get(key);
  if (running) {
    return running;
  }
  if (failed.has(key) && !retry) {
    return Promise.resolve(false);
  }
  failed.delete(key);
  const fetch = new Promise<boolean>((resolve) => {
    const image = makeImage();
    image.onload = () => {
      fetches.delete(key);
      if (!textures.exists(key)) {
        textures.addImage(key, image as HTMLImageElement);
      }
      resolve(true);
    };
    image.onerror = () => {
      fetches.delete(key);
      failed.add(key);
      resolve(false);
    };
    image.src = url;
  });
  fetches.set(key, fetch);
  return fetch;
}

/** Fetch several late images; true when every one is renderable. */
export function fetchLateImages(
  textures: LateTextures,
  keys: Iterable<string>,
  retry = false,
): Promise<boolean> {
  const wanted = [...keys].filter(isLateImageKey);
  return Promise.all(wanted.map((key) => fetchLateImage(textures, key, retry))).then((all) =>
    all.every(Boolean),
  );
}

/** Test hooks. */
export function setLateImageFactoryForTest(factory: () => ImageLike): void {
  makeImage = factory;
}

export function resetLateImagesForTest(): void {
  fetches.clear();
  failed.clear();
  makeImage = () => new Image() as unknown as ImageLike;
}
