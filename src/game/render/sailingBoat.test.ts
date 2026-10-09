import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1 } } }));

const { boatBob, boatPose } = await import("./sailingBoat");

describe("sailing boat (#423)", () => {
  it("mirrors for screen-left travel and tilts along the isometric slope", () => {
    expect(boatPose("east")).toEqual({ flipX: false, angle: 8 });
    expect(boatPose("north")).toEqual({ flipX: false, angle: -8 });
    expect(boatPose("west").flipX).toBe(true);
    expect(boatPose("south").flipX).toBe(true);
  });

  it("bobs gently, and not at all with motion off", () => {
    for (let t = 0; t < 3000; t += 100) {
      expect(Math.abs(boatBob(t, true))).toBeLessThanOrEqual(2);
      expect(boatBob(t, false)).toBe(0);
    }
    expect(boatBob(375, true)).toBeGreaterThan(1);
  });
});
