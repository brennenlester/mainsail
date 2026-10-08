/**
 * Auto-fallback to low FX quality when the frame rate sags (#362).
 * ponytail: one-way downgrade per session; no re-upgrade to avoid flapping.
 */

export type GovernorState = {
  low: boolean;
  /** Smoothed FPS (exponential moving average). */
  avgFps: number;
  /** Time spent sampling, so boot hitches don't count. */
  warmupMs: number;
  /** Continuous time the smoothed FPS has been under the floor. */
  slowMs: number;
};

export const FPS_FLOOR = 45;
export const WARMUP_MS = 2500;
export const SUSTAIN_MS = 3000;
/** Larger deltas mean a hidden tab or a pause, not slow rendering. */
const MAX_SAMPLE_DT_MS = 250;

export function createGovernor(): GovernorState {
  return { low: false, avgFps: 60, warmupMs: 0, slowMs: 0 };
}

export function stepGovernor(
  state: GovernorState,
  fps: number,
  dtMs: number,
): GovernorState {
  if (state.low || dtMs <= 0 || dtMs > MAX_SAMPLE_DT_MS || !Number.isFinite(fps)) {
    return state;
  }
  const avgFps = state.avgFps + (fps - state.avgFps) * Math.min(1, dtMs / 500);
  const warmupMs = state.warmupMs + dtMs;
  if (warmupMs < WARMUP_MS) {
    return { ...state, avgFps, warmupMs };
  }
  const slowMs = avgFps < FPS_FLOOR ? state.slowMs + dtMs : 0;
  return { low: slowMs >= SUSTAIN_MS, avgFps, warmupMs, slowMs };
}
