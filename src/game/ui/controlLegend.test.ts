import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTROL_LEGEND_NARROW_MAX_PX,
  CONTROL_LEGEND_TEXT,
  shouldShowControlLegend,
} from "./controlLegend";

const INDEX_HTML = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
const STYLE_CSS = readFileSync(path.join(process.cwd(), "src/style.css"), "utf8");

function cssBlockStartingAt(source: string, needle: string): string {
  const start = source.indexOf(needle);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  expect(open).toBeGreaterThan(start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unclosed CSS block after ${needle}`);
}

describe("control legend", () => {
  it("uses the decided HUD copy and is not a click-to-dismiss control", () => {
    expect(CONTROL_LEGEND_TEXT).toBe("E interact · WASD move");
    expect(CONTROL_LEGEND_TEXT.toLowerCase()).not.toMatch(/click|tap|dismiss|ok/);
  });

  it("places the quest HUD on the playfield over the game board", () => {
    const playfieldAt = INDEX_HTML.indexOf('id="playfield"');
    const gameAt = INDEX_HTML.indexOf('id="game"');
    const questHudAt = INDEX_HTML.indexOf('id="quest-hud"');
    const statusAt = INDEX_HTML.indexOf('id="status-panel"');
    const legendAt = INDEX_HTML.indexOf('id="status-control-legend"');
    expect(playfieldAt).toBeGreaterThan(-1);
    expect(gameAt).toBeGreaterThan(playfieldAt);
    expect(questHudAt).toBeGreaterThan(gameAt);
    expect(statusAt).toBeGreaterThan(questHudAt);
    expect(legendAt).toBeGreaterThan(-1);
    expect(INDEX_HTML).not.toContain('id="status-quest"');
    expect(INDEX_HTML).toContain(CONTROL_LEGEND_TEXT);
  });

  it("hides the HUD legend in the same style.css media query as the touch overlay", () => {
    const query = `@media (hover: none) and (pointer: coarse), (max-width: ${CONTROL_LEGEND_NARROW_MAX_PX}px)`;
    const block = cssBlockStartingAt(STYLE_CSS, query);
    expect(block).toMatch(/\.touch-controls\s*\{[^}]*display:\s*block/);
    expect(block).toMatch(/\.status-control-legend\s*\{[^}]*display:\s*none/);
  });

  it("shows on a wide hover desktop and hides with the touch overlay rule", () => {
    expect(
      shouldShowControlLegend({
        hover: true,
        pointerCoarse: false,
        viewportWidthPx: 1280,
      }),
    ).toBe(true);
    expect(
      shouldShowControlLegend({
        hover: true,
        pointerCoarse: false,
        viewportWidthPx: CONTROL_LEGEND_NARROW_MAX_PX,
      }),
    ).toBe(false);
    expect(
      shouldShowControlLegend({
        hover: false,
        pointerCoarse: true,
        viewportWidthPx: 1280,
      }),
    ).toBe(false);
  });
});
