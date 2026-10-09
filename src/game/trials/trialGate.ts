import { generateTrialPlan, type TrialPlan } from "./trialPlan";
import { simulateTrial } from "./trialSim";
import type { TrialDay } from "./trialSeed";

/**
 * Fairness gate for the daily trial (#420), run OFFLINE: the Eclipse only
 * offers a gauntlet it has watched every reference party class clear.
 * `npm run trials:table` runs it for each day of the table window and
 * commits the chosen re-roll per day to trialTable.json, so the game never
 * runs sims (trialTable.test.ts regenerates a sample and compares).
 *
 * A candidate is fair when the skilled clear rate over all reference
 * parties lands in [FAIR_MIN, FAIR_MAX] and every class clears at least
 * CLASS_MIN. Otherwise the next re-roll is tried; with none fair, the
 * hardest candidate whose worst class still clears CLASS_MIN wins (an easy
 * day beats an unwinnable one), else the one with the best worst class.
 *
 * Pacing (#429): a candidate must also keep every class's skilled rounds
 * short (`PACE`): mean and p90 turns per round, regular rounds and boss
 * apart. A slow candidate is never picked while a paced one exists.
 */

/** Typical post-finale parties by class (lead orders vary). */
export const REFERENCE_CLASSES: Readonly<Record<string, readonly (readonly string[])[]>> = {
  evolved: [
    ["bramblewarden", "hearthflame"],
    ["hearthflame", "brook-nymph", "bramblewarden"],
    ["brook-nymph", "bramblewarden", "hearthflame"],
  ],
  "non-starter": [
    ["brook-nymph", "thunder-finch"],
    ["thunder-finch", "brook-nymph", "lantern-fox"],
  ],
  unevolved: [
    ["mossling", "ember-wisp"],
    ["ember-wisp", "mossling", "brook-nymph"],
  ],
};
export const REFERENCE_LEVEL = 9;
const RUNS_PER_PARTY = 16;
export const FAIR_MIN = 0.38;
export const FAIR_MAX = 0.52;
export const CLASS_MIN = 0.36;
export const MAX_ATTEMPTS = 16;

/**
 * Skilled turns per round (#429), per reference class: the mean and the
 * 90th percentile over every played round (won or lost) may not exceed these.
 */
export const PACE = {
  regular: { mean: 11, p90: 16 },
  boss: { mean: 16, p90: 22 },
} as const;

export type GateRates = {
  overall: number;
  byClass: Record<string, number>;
  /** Turns of every played round, per class, per round index. */
  turns: Record<string, number[][]>;
};

export function referenceRates(plan: TrialPlan, runs = RUNS_PER_PARTY, stream = 0): GateRates {
  const byClass: Record<string, number> = {};
  const turns: Record<string, number[][]> = {};
  let wins = 0;
  let total = 0;
  for (const [name, parties] of Object.entries(REFERENCE_CLASSES)) {
    let classWins = 0;
    const classTurns: number[][] = plan.rounds.map(() => []);
    parties.forEach((party, p) => {
      for (let i = 0; i < runs; i++) {
        const result = simulateTrial(
          { party, level: REFERENCE_LEVEL, policy: "skilled", day: plan.day },
          // A stream apart from the balance tests' seeds.
          plan.day * 131 + p * 17 + name.length * 1009 + i + 7_000_000 + stream * 50_000_000,
          plan,
        );
        classWins += result.cleared ? 1 : 0;
        result.rounds.forEach((r, k) => classTurns[k]!.push(r.turns));
      }
    });
    byClass[name] = classWins / (parties.length * runs);
    turns[name] = classTurns;
    wins += classWins;
    total += parties.length * runs;
  }
  return { overall: wins / total, byClass, turns };
}

/** Mean and 90th-percentile turns of one round's samples (0 when unplayed). */
export function roundPace(samples: readonly number[]): { mean: number; p90: number } {
  if (samples.length === 0) {
    return { mean: 0, p90: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!,
  };
}

/** How far the slowest class/round overshoots PACE (<= 0 = paced). */
export function paceExcess(rates: GateRates): number {
  let excess = -Infinity;
  for (const rounds of Object.values(rates.turns)) {
    rounds.forEach((samples, k) => {
      const limit = k === rounds.length - 1 ? PACE.boss : PACE.regular;
      const { mean, p90 } = roundPace(samples);
      excess = Math.max(excess, mean - limit.mean, p90 - limit.p90);
    });
  }
  return excess;
}

const worstClass = (r: GateRates): number => Math.min(...Object.values(r.byClass));

const fair = (r: GateRates): boolean =>
  paceExcess(r) <= 0 && worstClass(r) >= CLASS_MIN && r.overall >= FAIR_MIN && r.overall <= FAIR_MAX;

function merge(a: GateRates, b: GateRates): GateRates {
  const byClass: Record<string, number> = {};
  const turns: Record<string, number[][]> = {};
  for (const key of Object.keys(a.byClass)) {
    byClass[key] = (a.byClass[key]! + b.byClass[key]!) / 2;
    turns[key] = a.turns[key]!.map((list, k) => [...list, ...b.turns[key]![k]!]);
  }
  return { overall: (a.overall + b.overall) / 2, byClass, turns };
}

/** The re-roll index the gate picks for `day` (deterministic). */
export function selectTrialAttempt(day: TrialDay): number {
  let easy: { attempt: number; overall: number } | null = null;
  let fallback: { attempt: number; worst: number; excess: number } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const plan = generateTrialPlan(day, attempt);
    let rates = referenceRates(plan);
    if (fair(rates)) {
      // Confirm on a fresh stream: picking the first lucky estimate biases
      // toward days that are harder than they looked.
      rates = merge(rates, referenceRates(plan, RUNS_PER_PARTY, 1));
      if (fair(rates)) {
        return attempt;
      }
    }
    const worst = worstClass(rates);
    const excess = Math.max(0, paceExcess(rates));
    if (excess === 0 && worst >= CLASS_MIN && (!easy || rates.overall < easy.overall)) {
      easy = { attempt, overall: rates.overall };
    }
    // Pace first: a slow candidate is never the fallback while a paced one exists.
    if (!fallback || excess < fallback.excess || (excess === fallback.excess && worst > fallback.worst)) {
      fallback = { attempt, worst, excess };
    }
  }
  return easy?.attempt ?? fallback!.attempt;
}
