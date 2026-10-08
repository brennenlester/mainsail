import table from "./trialTable.json";
import { generateTrialPlan, type TrialPlan } from "./trialPlan";
import { parseTrialDayKey, type TrialDay } from "./trialSeed";

/**
 * The day's trial (#420). Which re-roll a day uses was chosen offline by
 * the fairness gate (trialGate.ts) and committed in trialTable.json — one base-36
 * character per day — so building a plan is instant and runs no sims. Days
 * outside the table window use the first roll (still deterministic).
 */

export const TRIAL_TABLE_START: TrialDay = parseTrialDayKey(table.start)!;

/** Gate-chosen re-roll for `day`, or 0 outside the table. */
export function trialAttemptFor(day: TrialDay): number {
  const i = day - TRIAL_TABLE_START;
  const digit = i >= 0 && i < table.attempts.length ? parseInt(table.attempts[i]!, 36) : 0;
  return Number.isInteger(digit) ? digit : 0;
}

export function isInTrialTable(day: TrialDay): boolean {
  const i = day - TRIAL_TABLE_START;
  return i >= 0 && i < table.attempts.length;
}

const cache = new Map<TrialDay, TrialPlan>();

export function buildTrialPlan(day: TrialDay): TrialPlan {
  let plan = cache.get(day);
  if (!plan) {
    plan = generateTrialPlan(day, trialAttemptFor(day));
    cache.set(day, plan);
  }
  return plan;
}

/** Test-only: forget cached plans (determinism checks rebuild from scratch). */
export function clearTrialPlanCacheForTest(): void {
  cache.clear();
}
