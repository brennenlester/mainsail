/**
 * Everything TrialScene holds for one run (#420 review). Phaser reuses the
 * scene object between launches, so a second trial must never see the
 * first one's destroyed emitters, timers or BattleScene listeners: init()
 * tears the old state down and starts from `freshTrialSceneState()`.
 */
export type Destroyable = { destroy(): void };

export type TrialSceneRunState = {
  sky: Destroyable | null;
  motes: Destroyable | null;
  confetti: (Destroyable & { explode(count: number, x: number, y: number): unknown }) | null;
  /** Battle start watchdog (window timer id). */
  watchdog: number | null;
  /** Removes this run's BattleScene create / shutdown listeners. */
  detachBattle: (() => void) | null;
  /** Score before the round in play (the boon screen's "+N"). */
  lastScore: number;
  exiting: boolean;
};

export function freshTrialSceneState(): TrialSceneRunState {
  return {
    sky: null,
    motes: null,
    confetti: null,
    watchdog: null,
    detachBattle: null,
    lastScore: 0,
    exiting: false,
  };
}

/** Release a run's resources (safe on already-destroyed objects) and return fresh state. */
export function teardownTrialSceneState(state: TrialSceneRunState): TrialSceneRunState {
  if (state.watchdog !== null) {
    window.clearTimeout(state.watchdog);
  }
  state.detachBattle?.();
  for (const part of [state.sky, state.motes, state.confetti]) {
    try {
      part?.destroy();
    } catch {
      // Already destroyed with the scene's display list.
    }
  }
  return freshTrialSceneState();
}

export type TrialFaultAction = "lose-round" | "finish" | "ignore";

/**
 * What a runtime error during a trial does (#423): never a silent restart.
 * Mid-battle the round counts as lost and the results screen comes up;
 * between rounds the run is scored as it stands; once results (or the exit)
 * are showing, nothing more happens.
 */
export function trialFaultAction(
  phase: "preview" | "battle" | "boon" | "done" | null,
  exiting: boolean,
): TrialFaultAction {
  if (exiting || phase === null || phase === "done") {
    return "ignore";
  }
  return phase === "battle" ? "lose-round" : "finish";
}
