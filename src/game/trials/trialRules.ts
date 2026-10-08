import { MEND_FRACTION } from "./boons";

/**
 * Between-round HP rules (#420), on plain HP arrays so the runtime (party
 * creatures) and the sim share them.
 */

/** Standing companions catch their breath between rounds (fainted stay down). Tuned with trialSim. */
export const TRIAL_ROUND_RECOVERY = { fraction: 0.35 };

export function roundRecovery(hp: number[], maxHp: readonly number[], fraction = TRIAL_ROUND_RECOVERY.fraction): void {
  hp.forEach((value, i) => {
    const max = maxHp[i]!;
    if (value > 0 && fraction > 0) {
      hp[i] = Math.min(max, value + Math.max(1, Math.round(max * fraction)));
    }
  });
}

/** Moonlit Mend: every companion +MEND_FRACTION of max; the fainted get back up. */
export function applyMend(hp: number[], maxHp: readonly number[], fraction = MEND_FRACTION): void {
  hp.forEach((value, i) => {
    const max = maxHp[i]!;
    hp[i] = Math.min(max, Math.max(0, value) + Math.max(1, Math.round(max * fraction)));
  });
}
