import { describe, expect, it } from "vitest";
import { distanceOutside, haloAlpha, vignetteAlpha, vignettePixel } from "./edgeVignetteMath";

const RECT = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

describe("edge vignette (#417)", () => {
  it("deepens smoothly with distance, no ring steps", () => {
    let prev = vignetteAlpha(0);
    expect(prev).toBe(0);
    let maxStep = 0;
    for (let d = 1; d <= 300; d += 1) {
      const a = vignetteAlpha(d);
      expect(a).toBeGreaterThanOrEqual(prev);
      maxStep = Math.max(maxStep, a - prev);
      prev = a;
    }
    // The old 6px rings stepped ~0.017 alpha every 6px (0.0028/px peaks aside);
    // a smooth ramp changes under 0.005 per px.
    expect(maxStep).toBeLessThan(0.005);
    expect(prev).toBeCloseTo(0.49, 2);
  });

  it("fades the tile-sea halo from strong at the edge to nothing", () => {
    expect(haloAlpha(-10)).toBe(0);
    expect(haloAlpha(0)).toBeGreaterThan(0.7);
    expect(haloAlpha(400)).toBe(0);
    let prev = haloAlpha(0);
    for (let d = 1; d <= 250; d += 1) {
      const a = haloAlpha(d);
      expect(a).toBeLessThanOrEqual(prev);
      expect(prev - a).toBeLessThan(0.01);
      prev = a;
    }
  });

  it("measures distance to the tile rect (0 inside, rounded corners)", () => {
    expect(distanceOutside(50, 50, RECT)).toBe(0);
    expect(distanceOutside(130, 50, RECT)).toBe(30);
    expect(distanceOutside(130, 140, RECT)).toBe(50);
  });

  it("is transparent inside the tiles and at the edge colour matches the halo tone", () => {
    expect(vignettePixel(-20, [80, 149, 187])[3]).toBe(0);
    const [r, g, b, a] = vignettePixel(0, [80, 149, 187]);
    expect([r, g, b]).toEqual([80, 149, 187]);
    expect(a).toBeCloseTo(0.8, 2);
    // Far out only the navy vignette remains.
    const far = vignettePixel(1000, [80, 149, 187]);
    expect(far.slice(0, 3)).toEqual([0x1f, 0x2a, 0x44]);
    expect(far[3]).toBeCloseTo(0.49, 2);
  });

  it("without a halo is pure navy at the vignette alpha", () => {
    const [r, g, b, a] = vignettePixel(60);
    expect([r, g, b]).toEqual([0x1f, 0x2a, 0x44]);
    expect(a).toBeCloseTo(vignetteAlpha(60), 5);
  });
});
