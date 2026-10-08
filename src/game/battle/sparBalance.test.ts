import { describe, expect, it } from "vitest";
import { CREATURES, getCreatureDefinition } from "../creatures/catalog";
import { getHunterTarget } from "../creatures/folkloreTypes";
import { outleveledWildBulk, OUTLEVELED_GAP } from "./battleLogic";
import { sparStats, winRate, type SparPolicy, type SparSetup } from "./sparSim";
import { BOND_MAX } from "../companions/bond";
import { getRarityBias } from "../progression/wildLevel";

/**
 * Seeded spar-balance floors (#364, #378). Policies (see sparSim.ts):
 * random, max-damage (best expected damage), skilled (reads the telegraph).
 * Full report: SPAR_REPORT=/tmp/spar.txt npx vitest run src/game/battle/sparReport.test.ts
 */
const EVOLVED = new Set(["bramblewarden", "hearthflame"]);
const BASE_SPECIES = CREATURES.filter(
  (c) => !c.excludeFromCodex && !EVOLVED.has(c.id),
).map((c) => c.id);
const TUTORIAL_PAIRS = [
  ["mossling", "mossling"],
  ["mossling", "ember-wisp"],
  ["ember-wisp", "mossling"],
  ["ember-wisp", "ember-wisp"],
] as const;
const LEVELS = [1, 10, 25, 40];
const SEEDS = 40;
/** Heavy sims can exceed the 5s default under load. */
const HEAVY_TIMEOUT = 30_000;
const POLICIES: SparPolicy[] = ["random", "max-damage", "skilled"];

function hunts(attackerId: string, defenderId: string): boolean {
  return (
    getHunterTarget(getCreatureDefinition(attackerId).folkloreType) ===
    getCreatureDefinition(defenderId).folkloreType
  );
}

/**
 * Explicit hard counter: the foe's type hunts the player's (×1.3 in, ×0.8 out).
 * Defined counterplay: bring a partner and use the free switch.
 */
function isHardCounter(playerId: string, wildId: string): boolean {
  return hunts(wildId, playerId);
}

/** First base species whose type hunts the wild's (the counter-pick). */
function answerFor(wildId: string): string {
  return BASE_SPECIES.find((id) => hunts(id, wildId))!;
}

describe("spar balance (seeded sim)", () => {
  it("the Story 2 tutorial spar is easy even for max-damage play", () => {
    for (const [p, w] of TUTORIAL_PAIRS) {
      const opts = { tutorial: true };
      expect(winRate(p, w, "max-damage", 200, opts), `${p} v ${w}`).toBeGreaterThanOrEqual(0.85);
      expect(winRate(p, w, "random", 200, opts), `${p} v ${w}`).toBeGreaterThanOrEqual(0.75);
      expect(winRate(p, w, "skilled", 200, opts), `${p} v ${w}`).toBeGreaterThanOrEqual(0.95);
    }
  }, HEAVY_TIMEOUT);

  for (const level of LEVELS) {
    it(`Lv ${level} equal-level 1v1: skill matters, spars run long enough, no dead pairs`, () => {
      const sum = Object.fromEntries(
        POLICIES.map((p) => [p, { win: 0, turns: 0, finishers: 0, statuses: 0 }]),
      ) as Record<SparPolicy, { win: number; turns: number; finishers: number; statuses: number }>;
      let pairs = 0;
      for (const p of BASE_SPECIES) {
        for (const w of BASE_SPECIES) {
          pairs += 1;
          for (const policy of POLICIES) {
            const s = sparStats({ party: [p], wild: w, policy, level }, SEEDS);
            sum[policy].win += s.winRate;
            sum[policy].turns += s.avgTurns;
            sum[policy].finishers += s.avgFinishers;
            sum[policy].statuses += s.avgStatuses;
            if (policy === "skilled" && !isHardCounter(p, w)) {
              expect(s.winRate, `${p} v ${w} Lv ${level} (skilled)`).toBeGreaterThanOrEqual(0.2);
            }
          }
        }
      }
      const avg = (policy: SparPolicy, key: "win" | "turns" | "finishers" | "statuses") =>
        sum[policy][key] / pairs;
      // Targets: random ~40%, max-damage ~60%, skilled ~75%.
      expect(avg("random", "win")).toBeGreaterThanOrEqual(0.33);
      expect(avg("random", "win")).toBeLessThanOrEqual(0.48);
      expect(avg("max-damage", "win")).toBeGreaterThanOrEqual(0.5);
      expect(avg("max-damage", "win")).toBeLessThanOrEqual(0.65);
      expect(avg("skilled", "win")).toBeGreaterThanOrEqual(0.7);
      expect(avg("skilled", "win")).toBeLessThanOrEqual(0.85);
      expect(avg("max-damage", "win") - avg("random", "win")).toBeGreaterThanOrEqual(0.1);
      expect(avg("skilled", "win") - avg("max-damage", "win")).toBeGreaterThanOrEqual(0.12);
      // Spars last ~5-8 turns, finishers land 1-2 times, statuses get used.
      expect(avg("skilled", "turns")).toBeGreaterThanOrEqual(5);
      expect(avg("skilled", "turns")).toBeLessThanOrEqual(8);
      expect(avg("max-damage", "turns")).toBeGreaterThanOrEqual(5);
      expect(avg("skilled", "finishers")).toBeGreaterThanOrEqual(1);
      expect(avg("skilled", "finishers")).toBeLessThanOrEqual(2);
      expect(avg("skilled", "statuses")).toBeGreaterThanOrEqual(1.2);
    }, HEAVY_TIMEOUT);
  }

  it("hard counters stay winnable with their counterplay: a partner + the free switch", () => {
    for (const level of [1, 25]) {
      for (const p of BASE_SPECIES) {
        for (const w of BASE_SPECIES) {
          if (!isHardCounter(p, w)) {
            continue;
          }
          const duo = sparStats(
            { party: [p, answerFor(w)], wild: w, policy: "skilled", level },
            SEEDS,
          );
          expect(duo.winRate, `${p} + ${answerFor(w)} v ${w} Lv ${level}`).toBeGreaterThanOrEqual(0.9);
        }
      }
    }
  }, HEAVY_TIMEOUT);

  it("the overworld stays soft: a starter trio beats wilds up to +2 levels", () => {
    for (const w of BASE_SPECIES) {
      const s = sparStats(
        {
          party: ["mossling", "ember-wisp", "brook-nymph"],
          wild: w,
          policy: "max-damage",
          level: 5,
          wildLevel: 7,
        },
        SEEDS,
      );
      expect(s.winRate, w).toBeGreaterThanOrEqual(0.9);
    }
  }, HEAVY_TIMEOUT);

  it("previously broken pairs are fair at Lv 25-40 (#378)", () => {
    const checks: [string, string][] = [
      ["brook-nymph", "tide-urchin"],
      ["brook-nymph", "drift-kelpie"],
      ["brook-nymph", "stone-hound"],
      ["mossling", "stone-hound"],
      ["ember-wisp", "cinder-toad"],
    ];
    for (const level of [25, 40]) {
      for (const [p, w] of checks) {
        expect(winRate(p, w, "skilled", 200, { level }), `${p} v ${w} Lv ${level}`).toBeGreaterThanOrEqual(0.4);
      }
    }
  }, HEAVY_TIMEOUT);

  it("peer-level wilds keep full bulk, so the floors above are unchanged", () => {
    for (const level of LEVELS) {
      for (let wildBias = -(OUTLEVELED_GAP - 1); wildBias <= 2; wildBias++) {
        expect(outleveledWildBulk(level, level + wildBias)).toBe(1);
      }
    }
    expect(outleveledWildBulk(10, 10 - OUTLEVELED_GAP)).toBeLessThan(1);
  });

  it("clearly outleveled wilds (party avg +3 or more) fold in <= 4 turns", () => {
    for (const level of [5, 10, 25, 40]) {
      for (const gap of [OUTLEVELED_GAP, OUTLEVELED_GAP + 3]) {
        for (const party of [["mossling"], ["mossling", "ember-wisp", "brook-nymph"]]) {
          let turns = 0;
          let wins = 0;
          for (const w of BASE_SPECIES) {
            const s = sparStats(
              { party, wild: w, policy: "skilled", level, wildLevel: level - gap },
              SEEDS,
            );
            turns += s.avgTurns;
            wins += s.winRate;
          }
          const label = `Lv ${level} gap ${gap} party ${party.length}`;
          expect(turns / BASE_SPECIES.length, label).toBeLessThanOrEqual(4);
          expect(wins / BASE_SPECIES.length, label).toBeGreaterThanOrEqual(0.95);
        }
      }
    }
  }, HEAVY_TIMEOUT);
});

describe("bond battle bonus (#366 wiring of #367)", () => {
  it("max bond is a small edge: floors hold, gains stay under 10 points", () => {
    const level = 10;
    for (const policy of POLICIES) {
      let base = 0;
      let bonded = 0;
      let bondedTurns = 0;
      let pairs = 0;
      for (const p of BASE_SPECIES) {
        for (const w of BASE_SPECIES) {
          base += sparStats({ party: [p], wild: w, policy, level }, 20).winRate;
          const s = sparStats({ party: [p], wild: w, policy, level, bond: BOND_MAX }, 20);
          bonded += s.winRate;
          bondedTurns += s.avgTurns;
          pairs += 1;
        }
      }
      const gain = (bonded - base) / pairs;
      expect(gain, policy).toBeGreaterThanOrEqual(0);
      expect(gain, policy).toBeLessThanOrEqual(0.1);
      expect(bondedTurns / pairs, policy).toBeGreaterThanOrEqual(5);
      if (policy === "skilled") {
        expect(bonded / pairs).toBeLessThanOrEqual(0.85);
      }
    }
  }, HEAVY_TIMEOUT);
});

describe("befriend in a spar (#366)", () => {
  const COMMON = BASE_SPECIES.filter((id) => getRarityBias(id) === 0);
  const RARE = BASE_SPECIES.filter((id) => getRarityBias(id) === 2);
  const TRIO = ["mossling", "ember-wisp", "brook-nymph"];

  function recruit(wilds: readonly string[], extra: Partial<SparSetup>) {
    let recruitRate = 0;
    let attempts = 0;
    let n = 0;
    for (const wild of wilds) {
      for (const level of [5, 15]) {
        const s = sparStats(
          {
            party: TRIO,
            wild,
            policy: "befriend",
            level,
            wildLevel: level + getRarityBias(wild),
            ...extra,
          },
          SEEDS,
        );
        recruitRate += s.recruitRate;
        attempts += s.avgAttemptsToRecruit;
        n += 1;
      }
    }
    return { recruitRate: recruitRate / n, attempts: attempts / n };
  }

  // Realistic play: the single card try at full HP, then a spar (3-miss streak, the card miss counts).
  const SENSIBLE: Partial<SparSetup> = { cardTry: true, befriendAt: 0.6 };
  const NAIVE: Partial<SparSetup> = { cardTry: true, befriendAt: 0 };

  it("a sensible player (card try, then weaken and befriend) recruits commons ~85% in 1-3 attempts", () => {
    const sensible = recruit(COMMON, SENSIBLE);
    expect(sensible.recruitRate).toBeGreaterThanOrEqual(0.8);
    expect(sensible.recruitRate).toBeLessThanOrEqual(0.93);
    expect(sensible.attempts).toBeGreaterThanOrEqual(1);
    expect(sensible.attempts).toBeLessThanOrEqual(3);
  }, HEAVY_TIMEOUT);

  it("befriending at full HP is a gamble (~50-60%), so weakening is worth it", () => {
    const naive = recruit(COMMON, NAIVE);
    const sensible = recruit(COMMON, SENSIBLE);
    expect(naive.recruitRate).toBeGreaterThanOrEqual(0.45);
    expect(naive.recruitRate).toBeLessThanOrEqual(0.65);
    expect(sensible.recruitRate - naive.recruitRate).toBeGreaterThanOrEqual(0.2);
  }, HEAVY_TIMEOUT);

  it("rare, higher-level wilds are harder (~60% weakened); a Favorite Bait closes the gap", () => {
    const common = recruit(COMMON, SENSIBLE);
    const rare = recruit(RARE, SENSIBLE);
    const baited = recruit(RARE, { ...SENSIBLE, offering: "favorite-bait" });
    expect(rare.recruitRate).toBeLessThan(common.recruitRate - 0.15);
    expect(rare.recruitRate).toBeGreaterThanOrEqual(0.5);
    expect(rare.recruitRate).toBeLessThanOrEqual(0.7);
    expect(baited.recruitRate).toBeGreaterThan(rare.recruitRate + 0.05);
  }, HEAVY_TIMEOUT);
});
