/**
 * Retry policy for the lazy sailing-boat chunk (#423): a failed load (offline)
 * is retried after a pause, a few times, never once per frame. After the last
 * failure the boat simply stays hidden until the next voyage.
 */
export const BOAT_LOAD_RETRY_MS = 5000;
export const BOAT_LOAD_MAX_ATTEMPTS = 3;

export type BoatLoadState = {
  loading: boolean;
  failures: number;
  /** Earliest `now` (ms) a retry may start. */
  retryAt: number;
};

export function freshBoatLoadState(): BoatLoadState {
  return { loading: false, failures: 0, retryAt: 0 };
}

export function canStartBoatLoad(state: BoatLoadState, now: number): boolean {
  return !state.loading && state.failures < BOAT_LOAD_MAX_ATTEMPTS && now >= state.retryAt;
}

export function noteBoatLoadFailed(state: BoatLoadState, now: number): void {
  state.loading = false;
  state.failures += 1;
  state.retryAt = now + BOAT_LOAD_RETRY_MS;
}
