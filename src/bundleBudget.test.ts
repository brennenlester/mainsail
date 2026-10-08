// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Bundle budget (#410): a production build of the app entry must stay small
 * enough for a fast first run. Raise a budget only on purpose.
 */
const ROOT = path.resolve(__dirname, "..");
const KB = 1024;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ivy-bundle-"));

afterAll(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe("bundle budget", () => {
  it("keeps index.js and the phaser chunk inside budget", async () => {
    await build({
      root: ROOT,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true, copyPublicDir: false },
    });
    const assets = fs.readdirSync(path.join(outDir, "assets"));
    const size = (prefix: string) => {
      const file = assets.find((f) => f.startsWith(prefix) && f.endsWith(".js"));
      expect(file, `${prefix}*.js`).toBeDefined();
      const bytes = fs.readFileSync(path.join(outDir, "assets", file!));
      return { raw: bytes.length, gzip: gzipSync(bytes).length };
    };
    const index = size("index-");
    const phaser = size("phaser-");
    // index.js ~540 KB raw / ~171 KB gzip at #410.
    expect(index.raw).toBeLessThan(600 * KB);
    expect(index.gzip).toBeLessThan(190 * KB);
    // The vendored engine changes only on dependency bumps (~1.45 MB raw).
    expect(phaser.raw).toBeLessThan(1550 * KB);
    // Boot JS a cold first run downloads before anything draws.
    expect(index.gzip + phaser.gzip).toBeLessThan(540 * KB);
  }, 120_000);
});
