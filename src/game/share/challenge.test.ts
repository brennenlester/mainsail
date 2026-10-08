import { describe, expect, it } from "vitest";
import { ghostLabel, roundTitle } from "./challenge";
import type { ShareSnapshot } from "./shareCode";

const snapshot: ShareSnapshot = {
  name: "Hollowmere",
  day: 20_733,
  party: [
    { id: "bramblewarden", level: 14, rare: false, evolved: true, presence: false, bond: 4, nickname: "Sir Mossington I" },
    { id: "lantern-fox", level: 9, rare: true, evolved: false, presence: true, bond: 1 },
  ],
};

describe("challenge ghost labels (#409)", () => {
  it("shows the sharer's nickname on the ghost plate, else the species name", () => {
    expect(ghostLabel(snapshot.party[0]!)).toBe("Sir Mossington I");
    expect(ghostLabel(snapshot.party[1]!)).toBe("Lantern Fox");
  });

  it("round titles are short enough to share the top row with the Fast toggle", () => {
    expect(roundTitle(snapshot, 0)).toBe("Hollowmere's ghost party · 1/2");
    expect(roundTitle(snapshot, 1)).toBe("Hollowmere's ghost party · 2/2");
    // Worst case: 16-character name, 7 ghosts.
    const long = { ...snapshot, name: "Sixteen-chars-ok" };
    expect(roundTitle(long, 0).length).toBeLessThanOrEqual(40);
  });
});
