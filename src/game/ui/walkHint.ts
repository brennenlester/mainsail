/**
 * Transient overworld hints (#391). At most one is on screen at a time:
 * quest beat > interact prompt > movement ghost. The movement ghost is
 * keyboard-only, once ever: it never returns after the player has walked
 * (including on Continue) or once the first story beat is done.
 */

export const WALK_HINT_TEXT = "WASD / arrows to walk";

/** Successful travel (grid tiles) that consumes the ghost. */
export const WALK_HINT_CONSUME_TILES = 1;

export type HintKind = "quest" | "interact" | "movement";

/** Highest priority first. */
export const HINT_PRIORITY: readonly HintKind[] = ["quest", "interact", "movement"];

/** The single hint allowed on screen, given which kinds want to show. */
export function pickTransientHint(
  wants: Partial<Record<HintKind, boolean>>,
): HintKind | null {
  return HINT_PRIORITY.find((kind) => wants[kind]) ?? null;
}

export function shouldShowWalkHint(travelTiles: number): boolean {
  return travelTiles < WALK_HINT_CONSUME_TILES;
}

/** Whether the movement ghost may be offered at all this session. */
export function movementHintEligible(input: {
  /** On-screen stick is visible: nobody needs WASD told to them. */
  touchControls: boolean;
  walkedBefore: boolean;
  /** Still on the very first story beat. */
  atFirstBeat: boolean;
  visitor: boolean;
}): boolean {
  return (
    !input.touchControls &&
    !input.walkedBefore &&
    input.atFirstBeat &&
    !input.visitor
  );
}

const WALKED_KEY = "ivyward-walked-v1";

export function hasWalkedBefore(): boolean {
  try {
    return localStorage.getItem(WALKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWalked(): void {
  try {
    localStorage.setItem(WALKED_KEY, "1");
  } catch {
    // ponytail: private mode re-offers the ghost on reload; harmless.
  }
}

/** New Game / Reset: a fresh world gets its one hint again. */
export function clearWalkedMemory(): void {
  try {
    localStorage.removeItem(WALKED_KEY);
  } catch {
    // ignore
  }
}
