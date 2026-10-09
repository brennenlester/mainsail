import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1 } } }));

vi.mock("./imagineAssets", () => ({ imagineTexture: () => ["boat", undefined] }));
vi.mock("./fx/fxTextures", () => ({ ensureFxTextures: () => undefined, FX_TEX: { glow: "glow" } }));

const { boatBob, boatPose, SailingBoat } = await import("./sailingBoat");
const { setEffectsEnabled } = await import("./fx/fxSettings");

function fakeScene() {
  const image = () => {
    const img: Record<string, unknown> = { width: 192, height: 160 };
    for (const m of ["setOrigin", "setDisplaySize", "setCrop", "setPosition", "setFlipX", "setAngle", "setDepth"]) {
      img[m] = () => img;
    }
    img.destroy = vi.fn();
    return img;
  };
  const emitters: { destroy: ReturnType<typeof vi.fn>; setPosition: () => void; setDepth: () => void; emitting: boolean }[] = [];
  const scene = {
    time: { now: 375 },
    add: {
      image,
      particles: () => {
        const e = { destroy: vi.fn(), setPosition: () => undefined, setDepth: () => undefined, emitting: false };
        emitters.push(e);
        return e;
      },
    },
  };
  return { scene, emitters };
}

describe("sailing boat Effects toggle is live (#423)", () => {
  it("drops and restores the wake and the bob while sailing", () => {
    const { scene, emitters } = fakeScene();
    setEffectsEnabled(true);
    const boat = new SailingBoat(scene as never, "boat");
    expect(boat.sync(0, 0, "east", true, 5)).toBeGreaterThan(1);
    expect(emitters).toHaveLength(1);

    setEffectsEnabled(false);
    expect(boat.sync(0, 0, "east", true, 5)).toBe(0);
    expect(emitters[0]!.destroy).toHaveBeenCalledTimes(1);

    setEffectsEnabled(true);
    expect(boat.sync(0, 0, "east", true, 5)).toBeGreaterThan(1);
    expect(emitters).toHaveLength(2);
    setEffectsEnabled(true);
  });
});

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
