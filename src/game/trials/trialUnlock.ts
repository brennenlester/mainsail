import { isMainStoryComplete, questProgress } from "../story/questProgress";

/**
 * Finale done: the Eclipse Gate is open (#420). Old saves that finished the
 * story before trials existed count too. Kept tiny: the boot bundle checks it,
 * the trial runtime itself loads on demand.
 */
export function isTrialsUnlocked(): boolean {
  return questProgress["shrine-finale"] === "complete" || isMainStoryComplete();
}
