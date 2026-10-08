import { describe, expect, it } from "vitest";
import { CARD_BLOCK_BOTTOM, CARD_BLOCK_TOP, planCardLayout } from "./companionCard";

describe("planCardLayout (#409)", () => {
  it("centres a small party in the card instead of leaving an empty band", () => {
    for (const followers of [0, 1, 2, 3]) {
      const { dy, blockH } = planCardLayout(followers);
      const room = CARD_BLOCK_BOTTOM - CARD_BLOCK_TOP;
      expect(dy).toBeGreaterThan(0);
      // Equal space above and below (to the pixel).
      expect(Math.abs(room - blockH - 2 * dy)).toBeLessThanOrEqual(1);
    }
  });

  it("a full party fills the card with no offset and never overflows", () => {
    const { dy, blockH } = planCardLayout(6);
    expect(dy).toBe(0);
    expect(blockH).toBeLessThanOrEqual(CARD_BLOCK_BOTTOM - CARD_BLOCK_TOP);
    // Counts past the grid are clamped, not laid out further.
    expect(planCardLayout(20)).toEqual(planCardLayout(6));
  });

  it("a lone lead gets a taller hero panel", () => {
    expect(planCardLayout(0).heroH).toBeGreaterThan(planCardLayout(1).heroH);
  });

  it("only real followers are laid out: no placeholder slot adds height", () => {
    // One follower is one row; the old 'Room for more' slot made it two cells wide, never taller,
    // but 4 followers must not reserve a phantom third row.
    expect(planCardLayout(4).blockH).toBe(planCardLayout(6).blockH);
    expect(planCardLayout(3).blockH).toBe(planCardLayout(1).blockH);
  });
});
