import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import { HEARTH_LOTS_BOARD_TEXTURE } from "../minigames/hearthLots";
import {
  LATE_CREATURE_IDS,
  LATE_IMAGES,
  type LateTextures,
  fetchLateImage,
  fetchLateImages,
  isLateImageKey,
  isLateImagePending,
  lateCreatureKeys,
  lateImageStatus,
  resetLateImagesForTest,
  setLateImageFactoryForTest,
} from "./lateAssets";

const PUBLIC = path.resolve(__dirname, "../../../public");

describe("late-game images (#410)", () => {
  it("points every late key at a file that exists", () => {
    for (const url of Object.values(LATE_IMAGES)) {
      expect(fs.existsSync(path.join(PUBLIC, url)), url).toBe(true);
    }
  });

  it("covers the four sovereigns and the Hearth Lots board", () => {
    for (const id of LATE_CREATURE_IDS) {
      expect(isLateImageKey(getCreatureDefinition(id).spriteKey)).toBe(true);
    }
    expect(isLateImageKey(HEARTH_LOTS_BOARD_TEXTURE)).toBe(true);
  });

  it("maps creature ids to late keys, ignoring atlas creatures", () => {
    expect(lateCreatureKeys(["mossling", "tide-sovereign", "tide-sovereign"])).toEqual([
      "creature-tide-sovereign",
    ]);
    expect(lateCreatureKeys([])).toEqual([]);
  });
});

type FakeImage = { onload: (() => void) | null; onerror: (() => void) | null; src: string };

describe("shared late image fetch (#410)", () => {
  const KEY = "creature-horizon-sovereign";
  let requests: FakeImage[];
  let textures: LateTextures & { added: string[] };

  beforeEach(() => {
    requests = [];
    setLateImageFactoryForTest(() => {
      const image: FakeImage = { onload: null, onerror: null, src: "" };
      requests.push(image);
      return image;
    });
    const cache = new Set<string>();
    textures = {
      added: [],
      exists: (key) => cache.has(key),
      addImage(key) {
        cache.add(key);
        this.added.push(key);
      },
    };
  });
  afterEach(() => resetLateImagesForTest());

  it("serves two concurrent consumers from one request", async () => {
    // e.g. the shrine prefetch, then an encounter scene's preload.
    const prefetch = fetchLateImages(textures, [KEY]);
    expect(lateImageStatus(textures, KEY)).toBe("loading");
    expect(isLateImagePending(textures, KEY)).toBe(true);
    const encounter = fetchLateImage(textures, KEY);
    expect(requests).toHaveLength(1);
    expect(requests[0].src).toBe(LATE_IMAGES[KEY]);
    requests[0].onload!();
    await expect(Promise.all([prefetch, encounter])).resolves.toEqual([true, true]);
    expect(textures.added).toEqual([KEY]);
    expect(lateImageStatus(textures, KEY)).toBe("ready");
    await fetchLateImage(textures, KEY);
    expect(requests).toHaveLength(1);
  });

  it("marks failures (fallback allowed) and refetches only on retry", async () => {
    const first = fetchLateImage(textures, KEY);
    requests[0].onerror!();
    await expect(first).resolves.toBe(false);
    expect(isLateImagePending(textures, KEY)).toBe(false);
    await expect(fetchLateImage(textures, KEY)).resolves.toBe(false);
    expect(requests).toHaveLength(1);
    const retry = fetchLateImage(textures, KEY, true);
    expect(requests).toHaveLength(2);
    requests[1].onload!();
    await expect(retry).resolves.toBe(true);
  });

  it("ignores keys that are not late art", async () => {
    await expect(fetchLateImages(textures, ["creature-mossling"])).resolves.toBe(true);
    expect(requests).toHaveLength(0);
  });
});
