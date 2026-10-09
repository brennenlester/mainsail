import { describe, expect, it } from "vitest";
import {
  BOAT_LOAD_MAX_ATTEMPTS,
  BOAT_LOAD_RETRY_MS,
  canStartBoatLoad,
  freshBoatLoadState,
  noteBoatLoadFailed,
} from "./boatLoadRetry";

describe("boat chunk load retry (#423)", () => {
  it("starts at once, then never twice at the same time", () => {
    const s = freshBoatLoadState();
    expect(canStartBoatLoad(s, 0)).toBe(true);
    s.loading = true;
    expect(canStartBoatLoad(s, 1e6)).toBe(false);
  });

  it("waits out the backoff after a failure instead of retrying every frame", () => {
    const s = freshBoatLoadState();
    s.loading = true;
    noteBoatLoadFailed(s, 1000);
    for (let t = 1000; t < 1000 + BOAT_LOAD_RETRY_MS; t += 16) {
      expect(canStartBoatLoad(s, t)).toBe(false);
    }
    expect(canStartBoatLoad(s, 1000 + BOAT_LOAD_RETRY_MS)).toBe(true);
  });

  it("gives up after the last attempt", () => {
    const s = freshBoatLoadState();
    let now = 0;
    for (let i = 0; i < BOAT_LOAD_MAX_ATTEMPTS; i++) {
      expect(canStartBoatLoad(s, now)).toBe(true);
      s.loading = true;
      noteBoatLoadFailed(s, now);
      now += BOAT_LOAD_RETRY_MS;
    }
    expect(canStartBoatLoad(s, now + 1e9)).toBe(false);
  });
});
