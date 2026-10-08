import fs from "node:fs";
import path from "node:path";
import type Phaser from "phaser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BootPhase,
  isWorldAssetsReady,
  markWorldAssetsReady,
  queueBootAssets,
  resetWorldAssetsForTest,
  setWorldAssetsProgress,
  whenWorldAssetsReady,
} from "./bootAssets";
import { LATE_IMAGES } from "./lateAssets";

const ROOT = path.resolve(__dirname, "../../..");
const PUBLIC = path.join(ROOT, "public");

type Queued = { kind: string; key: string; urls: string[] };

/** Run the boot manifest against a recording loader. */
function manifest(phase: BootPhase): Queued[] {
  const queued: Queued[] = [];
  const record =
    (kind: string) =>
    (key: string, url?: string | string[], extra?: string): void => {
      const urls = [url ?? [], extra ?? []].flat();
      queued.push({ kind, key, urls });
    };
  const scene = {
    load: {
      image: record("image"),
      audio: record("audio"),
      json: record("json"),
      multiatlas: record("multiatlas"),
    },
  } as unknown as Phaser.Scene;
  queueBootAssets(scene, phase);
  return queued;
}

/** Bytes a browser fetches for one queued entry (first audio format only). */
function entryBytes(entry: Queued): number {
  if (entry.kind === "multiatlas") {
    const json = path.join(PUBLIC, entry.urls[0]);
    const doc = JSON.parse(fs.readFileSync(json, "utf8")) as { textures: { image: string }[] };
    return (
      fs.statSync(json).size +
      doc.textures.reduce(
        (sum, page) => sum + fs.statSync(path.join(PUBLIC, entry.urls[1], page.image)).size,
        0,
      )
    );
  }
  return fs.statSync(path.join(PUBLIC, entry.urls[0])).size;
}

/** Title art keys from TitleScene (importing it would pull in Phaser). */
function titleArtBytes(): number {
  const src = fs.readFileSync(path.join(ROOT, "src/game/scenes/TitleScene.ts"), "utf8");
  const block = /export const TITLE_ART = \{([^}]*)\}/.exec(src)?.[1] ?? "";
  const keys = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  expect(keys.length).toBeGreaterThan(0);
  return keys.reduce(
    (sum, key) => sum + fs.statSync(path.join(PUBLIC, "assets/title", `${key}.png`)).size,
    0,
  );
}

const MB = 1024 * 1024;

describe("boot preload manifest (#410)", () => {
  const lateKeys = Object.keys(LATE_IMAGES);
  const lateUrls = Object.values(LATE_IMAGES);

  it.each<BootPhase>(["title", "world", "music", "all"])(
    "never queues late-game art in the %s phase",
    (phase) => {
      for (const entry of manifest(phase)) {
        expect(lateKeys).not.toContain(entry.key);
        for (const url of entry.urls) {
          expect(lateUrls).not.toContain(url);
        }
      }
    },
  );

  it("keeps late-game art out of PreloadScene's own loader calls", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/game/scenes/PreloadScene.ts"), "utf8");
    for (const key of lateKeys) {
      expect(src).not.toContain(`"${key}"`);
    }
    for (const url of lateUrls) {
      expect(src).not.toContain(url);
    }
  });

  it("lets the title open without the atlas or world audio", () => {
    const title = manifest("title");
    expect(title.map((e) => e.kind)).not.toContain("multiatlas");
    expect(title.map((e) => e.key).sort()).toEqual(["music-title", "sfx-ui-click"]);
  });

  it("splits 'all' exactly into the title, world and music phases", () => {
    const keys = (phase: BootPhase) => manifest(phase).map((e) => `${e.kind}:${e.key}`);
    expect([...keys("title"), ...keys("world"), ...keys("music")].sort()).toEqual(keys("all").sort());
  });

  it("holds the soundtrack back until the world is playable (#417)", () => {
    const tracks = (phase: BootPhase) =>
      manifest(phase)
        .filter((e) => e.key.startsWith("music-"))
        .map((e) => e.key)
        .sort();
    expect(tracks("title")).toEqual(["music-title"]);
    // The world phase (what New Game waits on) carries no music at all.
    expect(tracks("world")).toEqual([]);
    expect(tracks("music")).toEqual([
      "music-battle",
      "music-grove",
      "music-night",
      "music-shrine",
      "music-victory",
      "music-village",
    ]);
    // Story-battle themes stay lazy: they never ride the boot at all.
    expect(tracks("all")).not.toContain("music-boss");
    expect(tracks("all")).not.toContain("music-rival");
    const sum = (phase: BootPhase) => manifest(phase).reduce((s, e) => s + entryBytes(e), 0);
    // ~1 MB of tracks no longer sits in the phase New Game blocks on.
    expect(sum("music")).toBeGreaterThan(0.9 * MB);
  });

  it("stays inside the boot payload budget", () => {
    const sum = (phase: BootPhase) => manifest(phase).reduce((s, e) => s + entryBytes(e), 0);
    // Blocking before the title is interactive: title art + theme + click.
    expect(sum("title") + titleArtBytes()).toBeLessThan(0.75 * MB); // ~0.49 MB
    // Everything a first session downloads before its first battle.
    expect(sum("all") + titleArtBytes()).toBeLessThan(6.25 * MB); // ~5.66 MB
  });
});

describe("world asset readiness", () => {
  afterEach(() => resetWorldAssetsForTest());

  it("defers waiters until ready and reports progress meanwhile", () => {
    const done = vi.fn();
    const progress = vi.fn();
    whenWorldAssetsReady(done, progress);
    expect(progress).toHaveBeenLastCalledWith(0);
    setWorldAssetsProgress(0.5);
    expect(progress).toHaveBeenLastCalledWith(0.5);
    expect(done).not.toHaveBeenCalled();
    markWorldAssetsReady();
    expect(done).toHaveBeenCalledTimes(1);
    expect(isWorldAssetsReady()).toBe(true);
    setWorldAssetsProgress(0.2);
    expect(progress).not.toHaveBeenLastCalledWith(0.2);
  });

  it("runs immediately once ready", () => {
    markWorldAssetsReady();
    const done = vi.fn();
    whenWorldAssetsReady(done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
