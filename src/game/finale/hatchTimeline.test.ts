import { describe, expect, it } from "vitest";
import { HATCH_BEAT_ORDER, hatchLength, hatchTimeline, wobbleAngle } from "./hatchTimeline";

describe("hatch cutscene timeline (#401)", () => {
  it("runs dim -> light -> wobble -> crack -> flash -> pop -> card -> Wren, back to back", () => {
    const beats = hatchTimeline({ fast: false, reducedMotion: false });
    let at = 0;
    for (const id of HATCH_BEAT_ORDER) {
      expect(beats[id].start).toBe(at);
      expect(beats[id].duration).toBeGreaterThan(0);
      at += beats[id].duration;
    }
    expect(hatchLength(beats)).toBe(at);
    // A real payoff, but not a long one.
    expect(at).toBeGreaterThan(5000);
    expect(at).toBeLessThan(8000);
  });

  it("Fast compresses the whole scene", () => {
    const fast = hatchLength(hatchTimeline({ fast: true, reducedMotion: false }));
    expect(fast).toBeLessThan(2500);
  });

  it("reduced motion keeps the length but trades wobble for glow", () => {
    const normal = hatchTimeline({ fast: false, reducedMotion: false });
    const calm = hatchTimeline({ fast: false, reducedMotion: true });
    expect(calm.wobble.duration).toBeLessThan(normal.wobble.duration);
    expect(calm.light.duration).toBeGreaterThan(normal.light.duration);
    expect(hatchLength(calm)).toBe(hatchLength(normal));
  });

  it("the egg rocks harder as it nears hatching", () => {
    const peak = (from: number, to: number): number => {
      let max = 0;
      for (let p = from; p <= to; p += 0.005) max = Math.max(max, Math.abs(wobbleAngle(p)));
      return max;
    };
    expect(peak(0, 0.25)).toBeLessThan(peak(0.75, 1));
    expect(peak(0, 1)).toBeLessThanOrEqual(14);
  });
});
