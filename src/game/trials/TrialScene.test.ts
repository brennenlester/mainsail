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
  it("an error ends the run unscored, never a restart", async () => {
    const { trialFaultAction } = await import("./trialSceneState");
    expect(trialFaultAction("battle", false)).toBe("stop-battle");
    expect(trialFaultAction("preview", false)).toBe("abort");
    expect(trialFaultAction("boon", false)).toBe("abort");
    expect(trialFaultAction("done", false)).toBe("ignore");
    expect(trialFaultAction(null, false)).toBe("ignore");
    expect(trialFaultAction("battle", true)).toBe("ignore");
  });

  it("a forced throw mid-battle shows the note and records nothing", async () => {
    const { setPartyFromSnapshot, playerParty } = await import("../creatures/party");
    const { createEmptyQuestProgress, restoreQuestProgress } = await import("../story/questProgress");
    const { QUEST_ORDER } = await import("../story/quests");
    const { beginTrial, startTrialRound, getTrialRun, resetTrialRunForTest } = await import("./trialRun");
    const { getTrialRecordSnapshot, hasAttemptedTrial, resetTrialRecordForTest } = await import("./trialState");
    const { isHostPersistSuspended } = await import("../world/worldSaveSchedule");
    const { setDiscoveredCreatures, worldState } = await import("../world/worldState");
    const { todayTrialDay } = await import("./trialSeed");

    const progress = createEmptyQuestProgress();
    for (const id of QUEST_ORDER) {
      progress[id] = "complete";
    }
    restoreQuestProgress(progress);
    resetTrialRunForTest();
    resetTrialRecordForTest();
    setDiscoveredCreatures([]);
    setPartyFromSnapshot(
      [{ instanceId: "a", definitionId: "bramblewarden", speciesId: "bramblewarden", currentHp: 7, level: 10, xp: 405 } as never],
      4,
    );
    const before = structuredClone(playerParty.creatures);
    expect(beginTrial(todayTrialDay(), "host")).toBe(true);
    expect(startTrialRound()).not.toBeNull();

    const scene = new TrialScene() as unknown as {
      s: ReturnType<typeof freshTrialSceneState>;
      ui: unknown;
      scene: unknown;
      game: unknown;
      fitStage: () => void;
      onFault: (event: ErrorEvent) => void;
    };
    const renderMessage = vi.fn();
    const stop = vi.fn();
    const resume = vi.fn();
    const sleep = vi.fn();
    const wake = vi.fn();
    scene.s = freshTrialSceneState();
    scene.ui = { renderMessage, destroy: () => undefined };
    scene.scene = { stop, resume };
    scene.game = { loop: { sleep, wake } };
    scene.fitStage = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    scene.onFault(new ErrorEvent("error", { error: new Error("forced") }));

    expect(stop).toHaveBeenCalledWith("BattleScene");
    expect(renderMessage).toHaveBeenCalledTimes(1);
    expect(renderMessage.mock.calls[0]![1]).toMatch(/this run was not scored/);
    expect(sleep).toHaveBeenCalled();
    expect(wake).toHaveBeenCalled();
    expect(getTrialRun()).toBeNull();
    expect(isHostPersistSuspended()).toBe(false);
    expect(playerParty.creatures).toEqual(before);
    expect(hasAttemptedTrial()).toBe(false);
    expect(getTrialRecordSnapshot()).toBeUndefined();
    expect(worldState.discoveredCreatures).toEqual([]);

    // A second error event (after the note is up) does nothing more.
    scene.onFault(new ErrorEvent("error", { error: new Error("again") }));
    expect(renderMessage).toHaveBeenCalledTimes(1);
    // An error with no Error object (ResizeObserver notice) is ignored.
    scene.onFault(new ErrorEvent("error", { message: "ResizeObserver loop" }));
    expect(renderMessage).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
