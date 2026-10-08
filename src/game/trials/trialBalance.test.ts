import { describe, expect, it } from "vitest";
import { buildTrialPlan, REFERENCE_LEVEL } from "./dailyTrial";
import { simulateTrial, trialStats, type TrialSimPolicy, type TrialSimStats } from "./trialSim";
import { parseTrialDayKey, type TrialDay } from "./trialSeed";

/**
 * Eclipse Trial balance (#420), on the same rules BattleScene plays (sparSim
 * move policies). Typical post-finale parties: 2-3 evolved companions, every
 * lead order. Targets: a typical party clears round 3-4 on a normal day;
 * full clear ~30-50% for skilled play, low single digits for random; and no
 * day is unwinnable — skilled clear rate >= 15% on each of 365 seeds.
 */

const PARTIES: readonly (readonly string[])[] = [
  ["bramblewarden", "hearthflame"],
  ["hearthflame", "bramblewarden"],
  ["bramblewarden", "hearthflame", "brook-nymph"],
  ["hearthflame", "brook-nymph", "bramblewarden"],
  ["brook-nymph", "bramblewarden", "hearthflame"],
];
const START = parseTrialDayKey("2027-01-01")!;
const SAMPLE_DAYS: TrialDay[] = Array.from({ length: 40 }, (_, i) => START + i * 9);

function averaged(policy: TrialSimPolicy): TrialSimStats {
  const all = PARTIES.map((party) => trialStats({ party, level: REFERENCE_LEVEL, policy }, SAMPLE_DAYS, 6, buildTrialPlan));
  const mean = (pick: (s: TrialSimStats) => number) => all.reduce((sum, s) => sum + pick(s), 0) / all.length;
  return {
    clearRate: mean((s) => s.clearRate),
    avgRounds: mean((s) => s.avgRounds),
    reached: [0, 1, 2, 3, 4].map((k) => mean((s) => s.reached[k]!)),
    avgScore: mean((s) => s.avgScore),
  };
}

describe("Eclipse Trial balance (#420)", () => {
  it("skilled ~30-50% full clear, typical play reaches rounds 3-4, random rarely clears", () => {
    const skilled = averaged("skilled");
    const typical = averaged("max-damage");
    const random = averaged("random");
    // Sim table (README): clear rate, mean rounds cleared, share reaching each round.
    for (const [name, s] of [["skilled", skilled], ["max-damage", typical], ["random", random]] as const) {
      console.info(
        `${name.padEnd(10)} clear ${(s.clearRate * 100).toFixed(1)}%  rounds ${s.avgRounds.toFixed(2)}  cleared>=1..5 ${s.reached
          .map((v) => `${Math.round(v * 100)}%`)
          .join(" / ")}  score ${Math.round(s.avgScore)}`,
      );
    }
    expect(skilled.clearRate).toBeGreaterThanOrEqual(0.3);
    expect(skilled.clearRate).toBeLessThanOrEqual(0.55);
    expect(skilled.avgRounds).toBeGreaterThanOrEqual(3);
    // Typical (max-damage) play clears 2-3 rounds and most runs reach round 3.
    expect(typical.avgRounds).toBeGreaterThanOrEqual(2);
    expect(typical.avgRounds).toBeLessThanOrEqual(4);
    expect(typical.reached[1]!).toBeGreaterThan(0.6);
    expect(random.clearRate).toBeLessThanOrEqual(0.06);
    expect(random.clearRate).toBeLessThan(typical.clearRate);
    expect(typical.clearRate).toBeLessThan(skilled.clearRate);
  }, 120_000);

  it("no seed is unwinnable: skilled clears >= 15% on each of 365 days", () => {
    let worst = { day: 0, rate: 1 };
    for (let day = START; day < START + 365; day++) {
      const plan = buildTrialPlan(day);
      let wins = 0;
      let runs = 0;
      PARTIES.forEach((party, p) => {
        for (let i = 0; i < 12; i++) {
          wins += simulateTrial({ party, level: REFERENCE_LEVEL, policy: "skilled", day }, day * 97 + p * 13 + i, plan).cleared ? 1 : 0;
          runs += 1;
        }
      });
      if (wins / runs < worst.rate) {
        worst = { day, rate: wins / runs };
      }
    }
    console.info(`worst day ${worst.day}: skilled clear ${(worst.rate * 100).toFixed(1)}%`);
    expect(worst.rate).toBeGreaterThanOrEqual(0.15);
  }, 180_000);
});
