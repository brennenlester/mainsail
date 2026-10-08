import { describe, expect, it } from "vitest";
import { buildTrialPlan } from "./dailyTrial";
import { REFERENCE_CLASSES, REFERENCE_LEVEL } from "./trialGate";
import { simulateTrial, trialStats, type TrialSimPolicy, type TrialSimStats } from "./trialSim";
import { parseTrialDayKey, type TrialDay } from "./trialSeed";

/**
 * Eclipse Trial balance (#420), on the same rules BattleScene plays (sparSim
 * move policies) and the committed day table. Party classes: evolved
 * starters, non-starters (Brook Nymph / Thunder Finch / Lantern Fox) and
 * unevolved starters, every lead order. Targets: typical play clears round
 * 3-4 on a normal day; full clear ~30-50% skilled, low single digits random;
 * every class keeps a skilled floor on the hardest of 365 days and a
 * ~30-50% median.
 */

const ALL_PARTIES = Object.values(REFERENCE_CLASSES).flat();
const START = parseTrialDayKey("2027-01-01")!;
const SAMPLE_DAYS: TrialDay[] = Array.from({ length: 40 }, (_, i) => START + i * 9);

function averaged(policy: TrialSimPolicy, parties = ALL_PARTIES): TrialSimStats {
  const all = parties.map((party) => trialStats({ party, level: REFERENCE_LEVEL, policy }, SAMPLE_DAYS, 6, buildTrialPlan));
  const mean = (pick: (s: TrialSimStats) => number) => all.reduce((sum, s) => sum + pick(s), 0) / all.length;
  return {
    clearRate: mean((s) => s.clearRate),
    avgRounds: mean((s) => s.avgRounds),
    reached: [0, 1, 2, 3, 4].map((k) => mean((s) => s.reached[k]!)),
    avgScore: mean((s) => s.avgScore),
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

describe("Eclipse Trial balance (#420)", () => {
  it("skilled ~30-50% full clear, typical play reaches rounds 3-4, random rarely clears", () => {
    const skilled = averaged("skilled");
    const typical = averaged("max-damage");
    const random = averaged("random");
    for (const [name, s] of [["skilled", skilled], ["max-damage", typical], ["random", random]] as const) {
      console.info(
        `${name.padEnd(10)} clear ${pct(s.clearRate)}  rounds ${s.avgRounds.toFixed(2)}  cleared>=1..5 ${s.reached.map(pct).join(" / ")}`,
      );
    }
    for (const [name, parties] of Object.entries(REFERENCE_CLASSES)) {
      const s = averaged("skilled", parties);
      const t = averaged("max-damage", parties);
      console.info(`${name.padEnd(12)} skilled ${pct(s.clearRate)} (${s.avgRounds.toFixed(2)} rounds)  max-damage ${pct(t.clearRate)} (${t.avgRounds.toFixed(2)})`);
    }
    expect(skilled.clearRate).toBeGreaterThanOrEqual(0.3);
    expect(skilled.clearRate).toBeLessThanOrEqual(0.55);
    expect(skilled.avgRounds).toBeGreaterThanOrEqual(3);
    expect(typical.avgRounds).toBeGreaterThanOrEqual(2);
    expect(typical.avgRounds).toBeLessThanOrEqual(4);
    expect(typical.reached[1]!).toBeGreaterThan(0.6);
    expect(random.clearRate).toBeLessThanOrEqual(0.06);
    expect(random.clearRate).toBeLessThan(typical.clearRate);
    expect(typical.clearRate).toBeLessThan(skilled.clearRate);
  }, 120_000);

  it("no class finds a day unwinnable: skilled floor >= 15% on each of 365 days, median 30-55%", () => {
    const rates: Record<string, number[]> = {};
    for (let day = START; day < START + 365; day++) {
      const plan = buildTrialPlan(day);
      for (const [name, parties] of Object.entries(REFERENCE_CLASSES)) {
        let wins = 0;
        let runs = 0;
        parties.forEach((party, p) => {
          for (let i = 0; i < 40; i++) {
            wins += simulateTrial({ party, level: REFERENCE_LEVEL, policy: "skilled", day }, day * 97 + p * 13 + i, plan).cleared ? 1 : 0;
            runs += 1;
          }
        });
        (rates[name] ??= []).push(wins / runs);
      }
    }
    for (const [name, list] of Object.entries(rates)) {
      const sorted = [...list].sort((a, b) => a - b);
      const worst = sorted[0]!;
      const median = sorted[Math.floor(sorted.length / 2)]!;
      console.info(`${name.padEnd(12)} worst day ${pct(worst)}  median ${pct(median)}`);
      expect(worst, name).toBeGreaterThanOrEqual(0.15);
      expect(median, name).toBeGreaterThanOrEqual(0.3);
      expect(median, name).toBeLessThanOrEqual(0.55);
    }
  }, 180_000);
});
