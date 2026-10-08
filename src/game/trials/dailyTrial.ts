import { generateTrialPlan, type TrialPlan } from "./trialPlan";
import { simulateTrial } from "./trialSim";
import type { TrialDay } from "./trialSeed";

/**
 * The day's trial (#420), with a fairness gate: the Eclipse only offers a
 * gauntlet it has watched a skilled reference party clear. Each candidate is
 * run headless (trialSim, same rules as BattleScene) a few times per
 * reference party; the first candidate whose skilled clear rate lands in
 * [FAIR_MIN, FAIR_MAX] is the day's plan. Deterministic: every friend gets
 * the same candidate, and it is computed once per day (a few ms).
 */

/** Typical post-finale parties (2-3 evolved companions, lead orders vary). */
export const REFERENCE_PARTIES: readonly (readonly string[])[] = [
  ["bramblewarden", "hearthflame"],
  ["hearthflame", "bramblewarden"],
  ["bramblewarden", "hearthflame", "brook-nymph"],
  ["hearthflame", "brook-nymph", "bramblewarden"],
  ["brook-nymph", "bramblewarden", "hearthflame"],
];
export const REFERENCE_LEVEL = 9;
const RUNS_PER_PARTY = 12;
export const FAIR_MIN = 0.36;
export const FAIR_MAX = 0.5;
const MAX_ATTEMPTS = 8;

/** Skilled clear rate of `plan` over the reference parties. */
export function referenceClearRate(plan: TrialPlan, runs = RUNS_PER_PARTY): number {
  let wins = 0;
  REFERENCE_PARTIES.forEach((party, p) => {
    for (let i = 0; i < runs; i++) {
      const result = simulateTrial(
        { party, level: REFERENCE_LEVEL, policy: "skilled", day: plan.day },
        // A stream apart from the balance tests' seeds.
        plan.day * 131 + p * 17 + i + 7_000_000,
        plan,
      );
      wins += result.cleared ? 1 : 0;
    }
  });
  return wins / (REFERENCE_PARTIES.length * runs);
}

const cache = new Map<TrialDay, TrialPlan>();

export function buildTrialPlan(day: TrialDay): TrialPlan {
  const hit = cache.get(day);
  if (hit) {
    return hit;
  }
  // No candidate in the band: the hardest one still above FAIR_MIN (an easy
  // day beats an unwinnable one), else the easiest of the hard ones.
  let easiestHard: { plan: TrialPlan; rate: number } | null = null;
  let hardestEasy: { plan: TrialPlan; rate: number } | null = null;
  let chosen: TrialPlan | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const plan = generateTrialPlan(day, attempt);
    const rate = referenceClearRate(plan);
    if (rate >= FAIR_MIN && rate <= FAIR_MAX) {
      chosen = plan;
      break;
    }
    if (rate > FAIR_MAX && (!hardestEasy || rate < hardestEasy.rate)) {
      hardestEasy = { plan, rate };
    }
    if (rate < FAIR_MIN && (!easiestHard || rate > easiestHard.rate)) {
      easiestHard = { plan, rate };
    }
  }
  const plan = chosen ?? hardestEasy?.plan ?? easiestHard!.plan;
  cache.set(day, plan);
  return plan;
}

/** Test-only: forget cached plans (determinism checks rebuild from scratch). */
export function clearTrialPlanCacheForTest(): void {
  cache.clear();
}
