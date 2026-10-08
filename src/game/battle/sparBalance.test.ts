import { describe, expect, it } from "vitest";
import { CREATURES, getCreatureDefinition } from "../creatures/catalog";
import { getHunterTarget } from "../creatures/folkloreTypes";
import { sparStats, winRate, type SparPolicy } from "./sparSim";

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
  });

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
    });
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
  });

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
  });

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
  });
});
