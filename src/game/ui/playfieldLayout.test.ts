import { describe, expect, it } from "vitest";
import {
  computeStageSize,
  playfieldLayoutMode,
  usableViewport,
} from "./playfieldLayout";

describe("playfieldLayoutMode", () => {
  it("uses landscape for short wide phone viewports", () => {
    expect(playfieldLayoutMode(820, 366)).toBe("landscape");
    expect(playfieldLayoutMode(844, 390)).toBe("landscape");
    expect(playfieldLayoutMode(643, 351)).toBe("landscape");
  });

  it("keeps portrait for tall phone and desktop-tall landscape", () => {
    expect(playfieldLayoutMode(366, 820)).toBe("portrait");
    // 1024×768 and 1280×800 are taller than the compact phone band
    expect(playfieldLayoutMode(1024, 768)).toBe("portrait");
    expect(playfieldLayoutMode(1280, 800)).toBe("portrait");
  });
});

describe("usableViewport", () => {
  it("subtracts safe-area insets and never collapses to zero", () => {
    expect(
      usableViewport(844, 390, { top: 0, right: 44, bottom: 21, left: 44 }),
    ).toEqual({ width: 756, height: 369 });
    expect(usableViewport(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe("computeStageSize", () => {
  it("fills the width and all height the status dock leaves (portrait)", () => {
    expect(
      computeStageSize({
        viewportW: 390,
        viewportH: 844,
        statusHeight: 150,
        statusWidth: 390,
        mode: "portrait",
      }),
    ).toEqual({ width: 390, height: 694 });
    // Desktop: a wide rectangle, not a centered square.
    expect(
      computeStageSize({
        viewportW: 1280,
        viewportH: 800,
        statusHeight: 120,
        statusWidth: 1280,
        mode: "portrait",
      }),
    ).toEqual({ width: 1280, height: 680 });
  });

  it("docks status beside the stage in phone landscape", () => {
    const stage = computeStageSize({
      viewportW: 820,
      viewportH: 366,
      statusHeight: 220,
      statusWidth: 280,
      mode: "landscape",
    });
    expect(stage).toEqual({ width: 540, height: 366 });
    expect(stage.height).toBeGreaterThan(200);
  });

  it("takes the whole viewport when the status panel is hidden (title)", () => {
    expect(
      computeStageSize({
        viewportW: 360,
        viewportH: 640,
        statusHeight: 0,
        statusWidth: 0,
        mode: "portrait",
      }),
    ).toEqual({ width: 360, height: 640 });
  });
});
