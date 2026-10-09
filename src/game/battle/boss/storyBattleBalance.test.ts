import { describe, expect, it } from "vitest";
import { getStorySpar, hearthWardScale } from "../../story/storySpars";
import { storyPartyRate, WREN_ARRIVAL_PARTIES, WREN_LONE_PARTIES } from "./storyBattleBalance";
import { storyBattleStats } from "./storyBattleSim";

/**
 * Story battle floors and ceilings (#385). The #369 sim found the boss at
 * 96-100% for any 2+ party and the rival at 96-100% even for max-damage play.
 * Measured on the shared StoryBattle controller with the sparSim policies at
 * the expected beat levels (rival Lv 6, boss Lv 8). Wide bands: these pin the
 * shape (hard but fair, skill matters), not exact numbers. #411 re-pinned Wren
 * on the real arrival party (Lv 4, one evolved + a friend); the boss bands
 * are unchanged.
 */
const SEEDS = 300;

describe("Cinder Matriarch balance", () => {
  const rate = (size: 1 | 2 | 3, policy: "random" | "max-damage" | "skilled") =>
    storyPartyRate("cinder-matriarch", size, policy, 8, SEEDS).winRate;

  it("is hard but fair for a skilled party of 1, 2 or 3 evolved companions", () => {
    const solo = rate(1, "skilled");
    const duo = rate(2, "skilled");
    const trio = rate(3, "skilled");
    expect(solo).toBeGreaterThanOrEqual(0.25);
    expect(solo).toBeLessThanOrEqual(0.4);
    expect(duo).toBeGreaterThanOrEqual(0.55);
    expect(duo).toBeLessThanOrEqual(0.72);
    expect(trio).toBeGreaterThanOrEqual(0.75);
    expect(trio).toBeLessThanOrEqual(0.88);
    // A bigger party still helps.
    expect(duo).toBeGreaterThan(solo);
    expect(trio).toBeGreaterThan(duo);
  });

  it("is a fight, not a slog: duo / trio battles run ~18-23 turns (#426)", () => {
    // The #385 tune ran 28-34 sim turns (25-30 played) and read as "press the highest number".
    for (const size of [2, 3] as const) {
      for (const policy of ["skilled", "guard-read"] as const) {
        const turns = storyPartyRate("cinder-matriarch", size, policy, 8, SEEDS).avgTurns;
        expect(turns, `${policy} ${size}`).toBeGreaterThanOrEqual(16);
        expect(turns, `${policy} ${size}`).toBeLessThanOrEqual(23);
      }
    }
  });

  it("asks for the telegraph read on a first attempt: max-damage is far behind skilled", () => {
    for (const size of [1, 2, 3] as const) {
      expect(rate(size, "max-damage"), `max-damage ${size}`).toBeLessThanOrEqual(rate(size, "skilled") - 0.25);
    }
  });

  it("Hearth Ward makes her winnable for casual play after repeated losses", () => {
    const def = getStorySpar("cinder-matriarch");
    const after2 = hearthWardScale(def, 2);
    const after4 = hearthWardScale(def, 4);
    expect(hearthWardScale(def, 1)).toBe(1);
    for (const size of [1, 2, 3] as const) {
      const warded = (policy: "random" | "max-damage" | "guard-read", ward: number) =>
        storyPartyRate("cinder-matriarch", size, policy, 8, SEEDS, false, ward).winRate;
      // Learned only "Guard Cinderfall": real odds after two losses.
      expect(warded("guard-read", after2), `guard-read ${size}`).toBeGreaterThanOrEqual(0.3);
      // Never guards at all: still winnable after four.
      expect(warded("max-damage", after4), `max-damage ${size}`).toBeGreaterThanOrEqual(0.2);
      expect(warded("random", after4), `random ${size}`).toBeGreaterThanOrEqual(0.15);
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

  /*
   * #411: the release-gate playthrough arrived at Lv 4 with one evolved
   * companion, and the old 2-companion scale (HP ×1.55, damage ×1.22) made a
   * second, weaker companion a liability (Bramblewarden alone 44% max-damage,
   * + Bryn's Lv 1 Ember Wisp 13%). Bands now pin the arrival party: a
   * sensible first try (max-damage: best hit every turn, no swaps) wins
   * ~65-80%; reading matchups (skilled) wins more; mashing (random) can lose.
   * Evolved duos / trios at Lv 6 are over-prepared for the first gate and may
   * cruise; the boss is where they are tested.
   */
  const arrival = (
    entry: { party: readonly string[]; levels: readonly number[] },
    policy: "random" | "max-damage" | "skilled",
    ward = 1,
  ) =>
    storyBattleStats(
      { sparId: "rival-wren", party: entry.party, level: entry.levels[0]!, levels: entry.levels, policy, ward },
      SEEDS,
    ).winRate;

  it("is fair on a first try for the typical arrival party (evolved Lv 4 lead + a friend)", () => {
    const sensible = WREN_ARRIVAL_PARTIES.map((p) => arrival(p, "max-damage"));
    const mean = sensible.reduce((a, b) => a + b, 0) / sensible.length;
    expect(mean).toBeGreaterThanOrEqual(0.65);
    expect(mean).toBeLessThanOrEqual(0.8);
    for (const [i, p] of WREN_ARRIVAL_PARTIES.entries()) {
      const label = `${p.party.join("+")} Lv ${p.levels.join("/")}`;
      expect(sensible[i]!, label).toBeGreaterThanOrEqual(0.55);
      expect(sensible[i]!, label).toBeLessThanOrEqual(0.85);
      expect(arrival(p, "skilled"), label).toBeGreaterThanOrEqual(0.85);
      expect(arrival(p, "random"), label).toBeLessThanOrEqual(0.7);
    }
  });

  it("rewards bringing a friend: every arrival duo beats its lead alone", () => {
    for (const lone of WREN_LONE_PARTIES) {
      const alone = arrival(lone, "max-damage");
      expect(alone, `${lone.party[0]} alone`).toBeLessThanOrEqual(0.5);
      for (const duo of WREN_ARRIVAL_PARTIES.filter((p) => p.party[0] === lone.party[0])) {
        expect(arrival(duo, "max-damage"), duo.party.join("+")).toBeGreaterThan(alone + 0.15);
      }
    }
    // An unevolved lone companion is a wall: the nudge names Bryn's gift.
    expect(arrival({ party: ["mossling"], levels: [4] }, "max-damage")).toBeLessThanOrEqual(0.1);
  });

  it("Hearth Ward lifts a lone evolved companion after two and four losses", () => {
    const def = getStorySpar("rival-wren");
    for (const lone of WREN_LONE_PARTIES) {
      expect(arrival(lone, "max-damage", hearthWardScale(def, 2)), lone.party[0]).toBeGreaterThanOrEqual(0.5);
      expect(arrival(lone, "max-damage", hearthWardScale(def, 4)), lone.party[0]).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("over-prepared parties still need care alone, and skilled play wins with a party", () => {
    for (const size of [2, 3] as const) {
      expect(rate(size, "skilled"), `skilled ${size}`).toBeGreaterThanOrEqual(0.9);
    }
    expect(rate(1, "skilled")).toBeGreaterThanOrEqual(0.55);
    expect(rate(1, "skilled")).toBeLessThanOrEqual(0.9);
    expect(rate(1, "random")).toBeLessThanOrEqual(0.4);
  });

  it("rematch Hearth Ward keeps casual rematches winnable after losses", () => {
    const after4 = hearthWardScale(getStorySpar("rival-wren"), 4);
    for (const size of [1, 2, 3] as const) {
      expect(
        storyPartyRate("rival-wren", size, "max-damage", 6, SEEDS, true, after4).winRate,
        `rematch max-damage ${size}`,
      ).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("rematch pressure for two companions stays within ~1.2x of the first fight (#417)", () => {
    // Pressure = average fight length x foe damage multiplier: how much damage
    // a party soaks, without the win-rate saturation near 100%. The rematch
    // adds a third creature, so it cannot be equal, but it must not be a wall.
    const def = getStorySpar("rival-wren");
    const damage = (rematch: boolean) =>
      (rematch ? def.rematchChallengerScale! : def.challengerScale)[1]!.damage;
    for (const level of [4, 6, 8]) {
      for (const policy of ["max-damage", "skilled"] as const) {
        const first = storyPartyRate("rival-wren", 2, policy, level, SEEDS, false);
        const again = storyPartyRate("rival-wren", 2, policy, level, SEEDS, true);
        const pressure = (again.avgTurns * damage(true)) / (first.avgTurns * damage(false));
        expect(pressure, `${policy} Lv ${level}`).toBeGreaterThan(1);
        expect(pressure, `${policy} Lv ${level}`).toBeLessThanOrEqual(1.25);
        // A casual rematch is a fight, not a coin flip against a wall.
        if (policy === "max-damage") {
          expect(again.winRate, `max-damage Lv ${level}`).toBeGreaterThanOrEqual(0.65);
          expect(again.winRate, `max-damage Lv ${level}`).toBeLessThan(first.winRate);
        }
      }
    }
  });

  it("a trio never finds the rematch harder than a duo does (#417)", () => {
    const def = getStorySpar("rival-wren");
    for (const level of [4, 6, 8]) {
      for (const policy of ["random", "max-damage", "skilled"] as const) {
        for (const losses of [0, 2, 4]) {
          const ward = hearthWardScale(def, losses);
          const duo = storyPartyRate("rival-wren", 2, policy, level, SEEDS, true, ward).winRate;
          const trio = storyPartyRate("rival-wren", 3, policy, level, SEEDS, true, ward).winRate;
          expect(trio, `${policy} Lv ${level} after ${losses} losses`).toBeGreaterThanOrEqual(duo);
        }
      }
    }
    // First fight and the boss are untouched: a trio still wins the first fight at least as often.
    expect(def.challengerScale[2]).toEqual({ hp: 1.4, damage: 1.1 });
  });

  it("escalates on rematch: harder than the first win, still winnable with a party", () => {
    for (const size of [2, 3] as const) {
      const rematch = rate(size, "skilled", true);
      expect(rematch, `rematch ${size}`).toBeLessThan(rate(size, "skilled"));
      expect(rematch, `rematch ${size}`).toBeGreaterThanOrEqual(0.6);
    }
  });
});
