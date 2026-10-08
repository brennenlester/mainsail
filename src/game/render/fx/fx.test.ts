import { describe, expect, it } from "vitest";
import {
  ambientLayersFor,
  emitIntervalMs,
  targetAlive,
  timeWeight,
} from "./ambientProfiles";
import {
  colorMatrixFor,
  dayNightPhase,
  DAY_CYCLE_MS,
  labelForPhase,
  MIN_LUMINANCE,
  sampleDayNight,
  sampleLuminance,
  SESSION_START_PHASE,
} from "./dayNight";
import { floorTintAt } from "./floorTint";
import { followerPose, nextEmoteDelayMs, pickEmote } from "./followerMotion";
import { parseForcedPhase, parseForcedQuality, toggleLabel } from "./fxSettings";
import { createGovernor, stepGovernor, WARMUP_MS } from "./qualityGovernor";
import type { ZoneId } from "../../world/zoneTypes";

const ZONES: ZoneId[] = [
  "grove",
  "shrine",
  "village",
  "overworld",
  "harbor",
  "archipelago",
  "mistwood",
  "emberfen",
  "warden-cottage",
  "weaver-cottage",
  "hearthkeep-cottage",
  "hermit-cottage",
];

describe("day/night curve", () => {
  it("never drops below the readability floor", () => {
    for (let i = 0; i <= 1000; i += 1) {
      expect(sampleLuminance(sampleDayNight(i / 1000))).toBeGreaterThanOrEqual(
        MIN_LUMINANCE,
      );
    }
  });

  it("is bright at noon and night at midnight", () => {
    expect(sampleDayNight(0.5).nightness).toBe(0);
    expect(sampleDayNight(0.5).label).toBe("afternoon");
    expect(sampleDayNight(0).nightness).toBe(1);
    expect(sampleDayNight(0.75).label).toBe("dusk");
  });

  it("is continuous, including across the wrap", () => {
    for (let i = 0; i < 1000; i += 1) {
      const a = sampleDayNight(i / 1000);
      const b = sampleDayNight((i + 1) / 1000);
      expect(Math.abs(a.r - b.r)).toBeLessThan(0.05);
      expect(Math.abs(a.nightness - b.nightness)).toBeLessThan(0.08);
    }
  });

  it("starts the session in daylight and loops", () => {
    expect(dayNightPhase(0)).toBeCloseTo(SESSION_START_PHASE);
    expect(sampleDayNight(dayNightPhase(0)).nightness).toBe(0);
    expect(dayNightPhase(DAY_CYCLE_MS)).toBeCloseTo(SESSION_START_PHASE);
    expect(labelForPhase(-0.5)).toBe(labelForPhase(0.5));
  });

  it("builds an identity matrix for neutral light", () => {
    const m = colorMatrixFor({
      r: 1,
      g: 1,
      b: 1,
      saturation: 1,
      nightness: 0,
      label: "afternoon",
    });
    expect(m).toHaveLength(20);
    expect(m).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });

  it("keeps grey grey under desaturation (rows sum to the tint)", () => {
    const sample = sampleDayNight(0);
    const m = colorMatrixFor(sample);
    expect(m[0]! + m[1]! + m[2]!).toBeCloseTo(sample.r);
    expect(m[5]! + m[6]! + m[7]!).toBeCloseTo(sample.g);
    expect(m[10]! + m[11]! + m[12]!).toBeCloseTo(sample.b);
  });
});

describe("ambient profiles", () => {
  it("covers every zone within a particle budget", () => {
    for (const zone of ZONES) {
      const layers = ambientLayersFor(zone);
      expect(layers.length).toBeGreaterThan(0);
      const peak = layers.reduce((n, l) => n + targetAlive(l, "high", 1, false), 0);
      expect(peak).toBeLessThanOrEqual(80);
    }
  });

  it("fades fireflies in only after dusk", () => {
    expect(timeWeight("night", 0)).toBe(0);
    expect(timeWeight("night", 1)).toBe(1);
    expect(timeWeight("day", 1)).toBeLessThan(0.2);
    expect(timeWeight("any", 0.5)).toBe(1);
  });

  it("scales down for low quality, off, and reduced motion", () => {
    const leaves = { kind: "leaves" as const, alive: 10, time: "any" as const };
    const fireflies = { kind: "fireflies" as const, alive: 20, time: "night" as const };
    expect(targetAlive(leaves, "high", 0, false)).toBe(10);
    expect(targetAlive(leaves, "low", 0, false)).toBeLessThan(5);
    expect(targetAlive(leaves, "off", 0, false)).toBe(0);
    expect(targetAlive(leaves, "high", 0, true)).toBe(0);
    expect(targetAlive(fireflies, "high", 1, true)).toBe(10);
  });

  it("derives a flow interval from the target count", () => {
    expect(emitIntervalMs(0, 5000)).toBe(-1);
    expect(emitIntervalMs(10, 5000)).toBe(500);
    expect(emitIntervalMs(1000, 100)).toBe(16);
  });
});

describe("quality governor", () => {
  const run = (fps: number, ms: number) => {
    let s = createGovernor();
    for (let t = 0; t < ms; t += 16) s = stepGovernor(s, fps, 16);
    return s;
  };

  it("ignores boot warmup and stays high at 60 fps", () => {
    expect(run(20, WARMUP_MS - 100).low).toBe(false);
    expect(run(60, 20000).low).toBe(false);
  });

  it("drops to low after sustained low FPS and stays there", () => {
    let s = run(25, 8000);
    expect(s.low).toBe(true);
    s = stepGovernor(s, 60, 16);
    expect(s.low).toBe(true);
  });

  it("ignores hidden-tab sized frame gaps", () => {
    const s = createGovernor();
    expect(stepGovernor(s, 2, 5000)).toBe(s);
  });
});

describe("floor tint", () => {
  const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

  it("is deterministic, in range, and darkens light squares", () => {
    expect(floorTintAt(3, 4, true)).toBe(floorTintAt(3, 4, true));
    let light = 0;
    let dark = 0;
    for (let x = 0; x < 20; x += 1) {
      for (let y = 0; y < 20; y += 1) {
        for (const ch of channels(floorTintAt(x, y, true))) {
          expect(ch).toBeGreaterThan(150);
          light += ch;
        }
        for (const ch of channels(floorTintAt(x, y, false))) dark += ch;
      }
    }
    expect(light).toBeLessThan(dark);
  });

  it("varies across the field and fades with strength", () => {
    const seen = new Set<number>();
    for (let x = 0; x < 10; x += 1) seen.add(floorTintAt(x, 2, false));
    expect(seen.size).toBeGreaterThan(3);
    expect(floorTintAt(5, 5, true, 0)).toBe(0xffffff);
  });
});

describe("follower motion", () => {
  it("is still under reduced motion", () => {
    expect(followerPose(1234, 1, true, 0, true)).toEqual({ dy: 0, scaleX: 1, scaleY: 1 });
  });

  it("stays bounded in every state", () => {
    for (let t = 0; t < 5000; t += 37) {
      for (const moving of [true, false]) {
        const p = followerPose(t, 2, moving, t % 900, false);
        expect(p.dy).toBeLessThanOrEqual(0);
        expect(p.dy).toBeGreaterThanOrEqual(-5);
        expect(Math.abs(p.scaleY - 1)).toBeLessThan(0.07);
      }
    }
  });

  it("hops in a stagger after the player stops", () => {
    expect(followerPose(0, 0, false, 150, false).dy).toBeLessThan(-4);
    expect(followerPose(0, 2, false, 150, false).dy).toBe(0);
    expect(followerPose(0, 2, false, 370, false).dy).toBeLessThan(-4);
  });

  it("picks emotes and delays deterministically from rand", () => {
    expect(pickEmote(0)).toBe("heart");
    expect(pickEmote(0.999)).toBe("spark");
    expect(nextEmoteDelayMs(0)).toBe(5000);
    expect(nextEmoteDelayMs(0.999)).toBeLessThan(10000);
  });
});

describe("fx settings", () => {
  it("parses ?time and ?fx overrides", () => {
    expect(parseForcedPhase("?time=0.8")).toBeCloseTo(0.8);
    expect(parseForcedPhase("?time=1.25")).toBeCloseTo(0.25);
    expect(parseForcedPhase("?time=abc")).toBeUndefined();
    expect(parseForcedPhase("?new=1")).toBeUndefined();
    expect(parseForcedQuality("?fx=low")).toBe("low");
    expect(parseForcedQuality("?fx=ultra")).toBeUndefined();
    expect(toggleLabel(false)).toBe("Effects: Off");
  });
});
