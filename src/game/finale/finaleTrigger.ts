import { worldState } from "../world/worldState";
import { notifyWorldChanged } from "../world/worldSaveSchedule";

/**
 * Finale card once per save (#399). The shrine finale dialogue emits
 * `story:finale-complete` on close; the card shows the first time only, and
 * the persisted flag keeps a replayed shrine scene or a reload from showing
 * it again. Returns true when the caller should launch the card now.
 */
export function claimFinaleCard(): boolean {
  if (worldState.storyFinaleCardShown) {
    return false;
  }
  worldState.storyFinaleCardShown = true;
  notifyWorldChanged();
  return true;
}
