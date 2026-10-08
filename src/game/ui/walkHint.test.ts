import { beforeEach, describe, expect, it } from "vitest";
import {
  WALK_HINT_CONSUME_TILES,
  WALK_HINT_TEXT,
  clearWalkedMemory,
  hasWalkedBefore,
  markWalked,
  movementHintEligible,
  pickTransientHint,
  shouldShowWalkHint,
} from "./walkHint";

describe("walk hint", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("names WASD and arrows without asking for a click", () => {
    expect(WALK_HINT_TEXT).toBe("WASD / arrows to walk");
    expect(WALK_HINT_TEXT.toLowerCase()).not.toMatch(/click|tap|press ok/);
  });

  it("stays up until one tile of travel", () => {
    expect(shouldShowWalkHint(0)).toBe(true);
    expect(shouldShowWalkHint(WALK_HINT_CONSUME_TILES - 0.01)).toBe(true);
    expect(shouldShowWalkHint(WALK_HINT_CONSUME_TILES)).toBe(false);
    expect(shouldShowWalkHint(2)).toBe(false);
  });

  it("shows one hint at a time: quest beats interact beats movement", () => {
    expect(pickTransientHint({ quest: true, interact: true, movement: true })).toBe("quest");
    expect(pickTransientHint({ interact: true, movement: true })).toBe("interact");
    expect(pickTransientHint({ movement: true })).toBe("movement");
    expect(pickTransientHint({})).toBeNull();
  });

  it("is keyboard-only: touch layouts never get the WASD ghost", () => {
    const base = { walkedBefore: false, atFirstBeat: true, visitor: false };
    expect(movementHintEligible({ ...base, touchControls: false })).toBe(true);
    expect(movementHintEligible({ ...base, touchControls: true })).toBe(false);
  });

  it("never returns after the player has walked or left the first beat", () => {
    const base = { touchControls: false, visitor: false };
    expect(movementHintEligible({ ...base, walkedBefore: true, atFirstBeat: true })).toBe(false);
    expect(movementHintEligible({ ...base, walkedBefore: false, atFirstBeat: false })).toBe(false);
    expect(
      movementHintEligible({ ...base, walkedBefore: false, atFirstBeat: true, visitor: true }),
    ).toBe(false);
  });

  it("remembers the first walk across reloads (Continue) until a new game", () => {
    expect(hasWalkedBefore()).toBe(false);
    markWalked();
    expect(hasWalkedBefore()).toBe(true);
    clearWalkedMemory();
    expect(hasWalkedBefore()).toBe(false);
  });
});
