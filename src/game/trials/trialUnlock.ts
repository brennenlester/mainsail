import { isMainStoryComplete, questProgress } from "../story/questProgress";
import { isVisitorMode } from "../world/worldSession";
import { hasAttemptedTrial, hasShownEclipseGateToast, markEclipseGateToastShown } from "./trialState";

/**
 * Finale done: the Eclipse Gate is open (#420). Old saves that finished the
 * story before trials existed count too. Kept tiny: the boot bundle checks it,
 * the trial runtime itself loads on demand.
 */
export function isTrialsUnlocked(): boolean {
  return questProgress["shrine-finale"] === "complete" || isMainStoryComplete();
}

export const ECLIPSE_TRIAL_HINT = "Eclipse Trial: a new daily challenge awaits at the Moon Shrine";

/**
 * Pointer to the Eclipse Gate (#423): shown in the quest HUD from the finale
 * until the first trial is played. Never in a friend's world.
 */
export function eclipseTrialHint(): string | null {
  return isTrialsUnlocked() && !isVisitorMode() && !hasAttemptedTrial() ? ECLIPSE_TRIAL_HINT : null;
}

/**
 * The one-time Gate toast (#423): the hint text the first time a host sees an
 * open Gate (finale card or, for saves finished before the toast existed, the
 * next world load), then null. Marks the flag; the caller saves the world.
 */
export function claimEclipseGateToast(): string | null {
  const hint = eclipseTrialHint();
  if (!hint || hasShownEclipseGateToast()) {
    return null;
  }
  markEclipseGateToastShown();
  return hint;
}
