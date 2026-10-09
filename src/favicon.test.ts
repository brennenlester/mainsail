// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** #426: /favicon.ico used to 404; index.html links the icons it ships. */
const ROOT = path.resolve(__dirname, "..");

describe("favicon", () => {
  it("ships favicon.ico (an ICO) and every icon index.html links", () => {
    const ico = fs.readFileSync(path.join(ROOT, "public/favicon.ico"));
    // ICONDIR: reserved 0, type 1 (icon), at least one image.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(["favicon.ico", "apple-touch-icon.png"]);
    for (const href of hrefs) {
      expect(fs.existsSync(path.join(ROOT, "public", href)), href).toBe(true);
    }
  });
});
