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
export const CLASS_MIN = 0.33;
export const MAX_ATTEMPTS = 16;

export type GateRates = { overall: number; byClass: Record<string, number> };

export function referenceRates(plan: TrialPlan, runs = RUNS_PER_PARTY, stream = 0): GateRates {
  const byClass: Record<string, number> = {};
  let wins = 0;
  let total = 0;
  for (const [name, parties] of Object.entries(REFERENCE_CLASSES)) {
    let classWins = 0;
    parties.forEach((party, p) => {
      for (let i = 0; i < runs; i++) {
        const won = simulateTrial(
          { party, level: REFERENCE_LEVEL, policy: "skilled", day: plan.day },
          // A stream apart from the balance tests' seeds.
          plan.day * 131 + p * 17 + name.length * 1009 + i + 7_000_000 + stream * 50_000_000,
          plan,
        ).cleared;
        classWins += won ? 1 : 0;
      }
    });
    byClass[name] = classWins / (parties.length * runs);
    wins += classWins;
    total += parties.length * runs;
  }
  return { overall: wins / total, byClass };
}

const worstClass = (r: GateRates): number => Math.min(...Object.values(r.byClass));

const fair = (r: GateRates): boolean =>
  worstClass(r) >= CLASS_MIN && r.overall >= FAIR_MIN && r.overall <= FAIR_MAX;

function merge(a: GateRates, b: GateRates): GateRates {
  const byClass: Record<string, number> = {};
  for (const key of Object.keys(a.byClass)) {
    byClass[key] = (a.byClass[key]! + b.byClass[key]!) / 2;
  }
  return { overall: (a.overall + b.overall) / 2, byClass };
}

/** The re-roll index the gate picks for `day` (deterministic). */
export function selectTrialAttempt(day: TrialDay): number {
  let easy: { attempt: number; overall: number } | null = null;
  let fallback: { attempt: number; worst: number } | null = null;
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
    if (worst >= CLASS_MIN && (!easy || rates.overall < easy.overall)) {
      easy = { attempt, overall: rates.overall };
    }
    if (!fallback || worst > fallback.worst) {
      fallback = { attempt, worst };
    }
  }
  return easy?.attempt ?? fallback!.attempt;
}
