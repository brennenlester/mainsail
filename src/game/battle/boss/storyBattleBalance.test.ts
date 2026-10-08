import { describe, expect, it } from "vitest";
import { storyPartyRate } from "./storyBattleBalance";
import { storyBattleStats } from "./storyBattleSim";

/**
 * Story battle floors and ceilings (#385). The #369 sim found the boss at
 * 96-100% for any 2+ party and the rival at 96-100% even for max-damage play.
 * Measured on the shared StoryBattle controller with the sparSim policies at
 * the expected beat levels (rival Lv 6, boss Lv 8). Wide bands: these pin the
 * shape (hard but fair, skill matters), not exact numbers.
 */
const SEEDS = 300;

describe("Cinder Matriarch balance", () => {
  const rate = (size: 1 | 2 | 3, policy: "random" | "max-damage" | "skilled") =>
    storyPartyRate("cinder-matriarch", size, policy, 8, SEEDS).winRate;

  it("is hard but fair for a skilled party of 1, 2 or 3 evolved companions", () => {
    const solo = rate(1, "skilled");
    const duo = rate(2, "skilled");
    const trio = rate(3, "skilled");
    expect(solo).toBeGreaterThanOrEqual(0.22);
    expect(solo).toBeLessThanOrEqual(0.45);
    expect(duo).toBeGreaterThanOrEqual(0.55);
    expect(duo).toBeLessThanOrEqual(0.75);
    expect(trio).toBeGreaterThanOrEqual(0.75);
    expect(trio).toBeLessThanOrEqual(0.92);
    // A bigger party still helps.
    expect(duo).toBeGreaterThan(solo);
    expect(trio).toBeGreaterThan(duo);
  });

  it("asks for the telegraph read: max-damage and random play are far behind", () => {
    for (const size of [1, 2, 3] as const) {
      const skilled = rate(size, "skilled");
      expect(rate(size, "max-damage"), `max-damage ${size}`).toBeLessThanOrEqual(skilled - 0.25);
      expect(rate(size, "random"), `random ${size}`).toBeLessThanOrEqual(0.15);
    }
  });

  it("always transforms in a skilled win, and the parry is part of winning", () => {
    const stats = storyPartyRate("cinder-matriarch", 3, "skilled", 8, SEEDS);
    expect(stats.transformRate).toBeGreaterThan(0.95);
    expect(stats.avgParries).toBeGreaterThan(1);
    expect(stats.avgAssists).toBeGreaterThan(2);
  });

  it("stays beatable for a woodland-only party the Cinder form hunts (#385 playtest)", () => {
    for (const party of [
      ["bramblewarden", "rootwalker"],
      ["bramblewarden", "mossling"],
    ]) {
      const win = storyBattleStats(
        { sparId: "cinder-matriarch", party, level: 8, policy: "skilled" },
        SEEDS,
      ).winRate;
      expect(win, party.join("+")).toBeGreaterThanOrEqual(0.25);
    }
  });

  it("holds its shape a couple of levels either side of the expected level", () => {
    for (const level of [6, 10]) {
      const trio = storyPartyRate("cinder-matriarch", 3, "skilled", level, SEEDS).winRate;
      const solo = storyPartyRate("cinder-matriarch", 1, "skilled", level, SEEDS).winRate;
      expect(trio, `trio Lv ${level}`).toBeGreaterThanOrEqual(0.6);
      expect(solo, `solo Lv ${level}`).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("Wren balance", () => {
  const rate = (size: 1 | 2 | 3, policy: "random" | "max-damage" | "skilled", rematch = false) =>
    storyPartyRate("rival-wren", size, policy, 6, SEEDS, rematch).winRate;

  it("is no longer a walkover for careless play", () => {
    for (const size of [2, 3] as const) {
      expect(rate(size, "max-damage"), `max-damage ${size}`).toBeLessThanOrEqual(0.75);
      expect(rate(size, "random"), `random ${size}`).toBeLessThanOrEqual(0.5);
      expect(rate(size, "skilled"), `skilled ${size}`).toBeGreaterThanOrEqual(0.8);
    }
    expect(rate(1, "skilled")).toBeGreaterThanOrEqual(0.55);
    expect(rate(1, "skilled")).toBeLessThanOrEqual(0.9);
  });

  it("escalates on rematch: harder than the first win, still winnable with a party", () => {
    for (const size of [2, 3] as const) {
      const rematch = rate(size, "skilled", true);
      expect(rematch, `rematch ${size}`).toBeLessThan(rate(size, "skilled"));
      expect(rematch, `rematch ${size}`).toBeGreaterThanOrEqual(0.6);
    }
  });
});
