import { describe, expect, it } from "vitest";
import { DEVICE_DPR_CAP, effectivePixelRatio, MAX_RENDER_PIXELS } from "./pixelBudget";

const pixels = (w: number, h: number, ratio: number): number => w * ratio * (h * ratio);

describe("effectivePixelRatio (#391)", () => {
  it("keeps the capped device ratio on normal screens", () => {
    expect(effectivePixelRatio(390, 700, 3)).toBe(DEVICE_DPR_CAP);
    expect(effectivePixelRatio(1280, 680, 1)).toBe(1);
    expect(effectivePixelRatio(1280, 680, 2)).toBe(2);
  });

  it("lowers the ratio on huge displays so the buffer stays within budget", () => {
    // 5K retina-class stage: 2x would be ~29M pixels.
    const ratio = effectivePixelRatio(2560, 1400, 2);
    expect(ratio).toBeLessThan(2);
    expect(pixels(2560, 1400, ratio)).toBeLessThanOrEqual(MAX_RENDER_PIXELS + 1);
    expect(pixels(2560, 1400, 2)).toBeGreaterThan(MAX_RENDER_PIXELS);
  });

  it("never returns an unusable ratio", () => {
    expect(effectivePixelRatio(8000, 6000, 1)).toBeGreaterThanOrEqual(0.5);
    expect(effectivePixelRatio(0, 0, 0)).toBeGreaterThan(0);
  });
});
