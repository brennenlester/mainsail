/**
 * Retry policy for the lazy sailing-boat chunk (#423): a failed load (offline)
 * is retried after a pause, a few times, never once per frame. After the last
 * failure the boat simply stays hidden until the next voyage.
 *
 * A failed dynamic import is remembered by the browser's module map under its
 * URL (Chromium), so a plain second `import()` never reaches the network.
 * Retries therefore re-import the same chunk under a throwaway query string:
 * a new map entry and a real request, while the chunk's own relative imports
 * still resolve to the already-loaded shared modules.
 */
export const BOAT_LOAD_RETRY_MS = 5000;
export const BOAT_LOAD_MAX_ATTEMPTS = 3;

export type BoatLoadState = {
  loading: boolean;
  failures: number;
  /** Earliest `now` (ms) a retry may start. */
  retryAt: number;
  /** URL of the chunk that failed, when the browser's error names it. */
  failedUrl: string | null;
};

export function freshBoatLoadState(): BoatLoadState {
  return { loading: false, failures: 0, retryAt: 0, failedUrl: null };
}

export function canStartBoatLoad(state: BoatLoadState, now: number): boolean {
  return !state.loading && state.failures < BOAT_LOAD_MAX_ATTEMPTS && now >= state.retryAt;
}

/** Chunk URL named by a failed-import error (Chromium and Firefox word it differently), query stripped. */
export function failedModuleUrl(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /(https?:\/\/[^\s"'?#]+\.(?:js|mjs|ts))/.exec(message);
  return match ? match[1]! : null;
}

/** Specifier for the next attempt: the plain import first, a cache-busted URL once one failed. */
export function boatRetryUrl(state: BoatLoadState): string | null {
  return state.failedUrl ? `${state.failedUrl}?retry=${state.failures}` : null;
}

export function noteBoatLoadFailed(state: BoatLoadState, now: number, error?: unknown): void {
  state.failedUrl ??= failedModuleUrl(error);
  state.loading = false;
  state.failures += 1;
  state.retryAt = now + BOAT_LOAD_RETRY_MS;
}
