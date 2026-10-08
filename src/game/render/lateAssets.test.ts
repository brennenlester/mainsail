import fs from "node:fs";
import path from "node:path";
import type Phaser from "phaser";
import { afterEach, describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import { HEARTH_LOTS_BOARD_TEXTURE } from "../minigames/hearthLots";
import {
  LATE_CREATURE_IDS,
  LATE_IMAGES,
  isLateImageKey,
  isLateImagePending,
  lateCreatureKeys,
  lateImageStatus,
  loadLateImages,
  queueLateImages,
  resetLateImagesForTest,
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

type Handler = (...args: unknown[]) => void;

function emitter() {
  const handlers = new Map<string, Set<Handler>>();
  const self = {
    on(e: string, h: Handler) {
      if (!handlers.has(e)) handlers.set(e, new Set());
      handlers.get(e)!.add(h);
      return self;
    },
    once(e: string, h: Handler) {
      const wrapped: Handler = (...a) => {
        self.off(e, wrapped);
        h(...a);
      };
      return self.on(e, wrapped);
    },
    off(e: string, h?: Handler) {
      if (h) handlers.get(e)?.delete(h);
      else handlers.delete(e);
      return self;
    },
    emit(e: string, ...a: unknown[]) {
      for (const h of [...(handlers.get(e) ?? [])]) h(...a);
    },
  };
  return self;
}

/** Minimal scene: an event-emitting loader, scene events and a texture set. */
function fakeScene(textures = new Set<string>()) {
  const queued: string[] = [];
  let loading = false;
  const load = Object.assign(emitter(), {
    image: (key: string) => queued.push(key),
    isLoading: () => loading,
    start: () => {
      loading = true;
    },
  });
  const events = emitter();
  const scene = { textures: { exists: (k: string) => textures.has(k) }, load, events };
  /** Finish the batch: keys in `fail` error, the rest land in the cache. */
  const finish = (fail: string[] = []): void => {
    for (const key of queued.splice(0)) {
      if (fail.includes(key)) load.emit("loaderror", { key });
      else textures.add(key);
    }
    loading = false;
    load.emit("complete");
  };
  return { scene: scene as unknown as Phaser.Scene, queued, finish, events };
}

describe("late image fetch state (#410)", () => {
  afterEach(() => resetLateImagesForTest());
  const KEY = "creature-tide-sovereign";

  it("never queues a key twice while it is in flight", () => {
    const a = fakeScene();
    const b = fakeScene();
    expect(queueLateImages(a.scene, [KEY], null)).toBe(1);
    expect(queueLateImages(a.scene, [KEY], null)).toBe(0);
    expect(queueLateImages(b.scene, [KEY], null)).toBe(0);
    expect(lateImageStatus(b.scene, KEY)).toBe("loading");
  });

  it("resolves a waiter on another scene once the fetch lands", async () => {
    const cache = new Set<string>();
    const a = fakeScene(cache);
    const b = fakeScene(cache);
    queueLateImages(a.scene, [KEY], null);
    const waiting = loadLateImages(b.scene, [KEY]);
    a.finish();
    await expect(waiting).resolves.toBe(true);
  });

  it("marks failures (fallback allowed) and refetches only on retry", async () => {
    const a = fakeScene();
    const first = loadLateImages(a.scene, [KEY]);
    a.finish([KEY]);
    await expect(first).resolves.toBe(false);
    expect(isLateImagePending(a.scene, KEY)).toBe(false);
    expect(queueLateImages(a.scene, [KEY], null)).toBe(0);
    const retry = loadLateImages(a.scene, [KEY], null, true);
    expect(a.queued).toEqual([KEY]);
    a.finish();
    await expect(retry).resolves.toBe(true);
  });

  it("frees a key whose scene shut down mid-fetch", async () => {
    const a = fakeScene();
    const waiting = loadLateImages(a.scene, [KEY]);
    a.events.emit("shutdown");
    await expect(waiting).resolves.toBe(false);
    expect(lateImageStatus(a.scene, KEY)).toBe("missing");
    expect(queueLateImages(fakeScene().scene, [KEY], null)).toBe(1);
  });
});
