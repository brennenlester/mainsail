import { describe, expect, it, vi } from "vitest";

// A stand-in Phaser: TrialScene only needs to be constructible here.
vi.mock("phaser", () => {
  const any: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === "prototype" ? {} : any),
    apply: () => any,
  });
  return { default: any };
});

const { TrialScene } = await import("./TrialScene");
const { freshTrialSceneState, teardownTrialSceneState } = await import("./trialSceneState");

type Internals = {
  s: ReturnType<typeof freshTrialSceneState>;
  ui: { destroy(): void } | null;
  init(data: unknown): void;
};

describe("TrialScene per-run state (#420 review)", () => {
  it("init() clears everything a previous run left (emitters, timers, listeners, overlay)", () => {
    const scene = new TrialScene() as unknown as Internals;
    const destroyed: string[] = [];
    const detach = vi.fn();
    const clear = vi.spyOn(window, "clearTimeout");
    scene.s = {
      sky: { destroy: () => destroyed.push("sky") },
      motes: { destroy: () => destroyed.push("motes") },
      confetti: {
        explode: () => undefined,
        destroy: () => {
          // A second run's emitter must never be this already-dead one.
          throw new Error("already destroyed");
        },
      },
      watchdog: 4242,
      detachBattle: detach,
      lastScore: 3200,
      exiting: true,
    };
    scene.ui = { destroy: () => destroyed.push("ui") };
    scene.init({ day: 20734, mode: "host" });
    expect(scene.s).toEqual(freshTrialSceneState());
    expect(scene.ui).toBeNull();
    expect(destroyed).toEqual(["sky", "motes", "ui"]);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(4242);
  });

  it("fresh state has nothing carried over and a new object every run", () => {
    const a = freshTrialSceneState();
    const b = teardownTrialSceneState(a);
    expect(b).not.toBe(a);
    expect(Object.values(b).every((v) => v === null || v === 0 || v === false)).toBe(true);
  });
});

describe("trial fault guard (#423)", () => {
  it("turns an error into a scored end, never a restart", async () => {
    const { trialFaultAction } = await import("./trialSceneState");
    expect(trialFaultAction("battle", false)).toBe("lose-round");
    expect(trialFaultAction("preview", false)).toBe("finish");
    expect(trialFaultAction("boon", false)).toBe("finish");
    expect(trialFaultAction("done", false)).toBe("ignore");
    expect(trialFaultAction(null, false)).toBe("ignore");
    expect(trialFaultAction("battle", true)).toBe("ignore");
  });
});
