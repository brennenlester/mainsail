/** Hearth Ward row by the story foe's bar (#399). Pure for tests. */

/** Design px; x0.5625 at a 360 px phone = ~11.3 CSS px. */
export const WARD_CHIP_FONT_PX = 20;
export const WARD_HINT_FONT_PX = 20;
export const WARD_CHIP_TEXT = "HEARTH WARD";

/** "2 more tries until the ward strengthens" (null at the last step). */
export function wardHintText(nextIn: number | null): string | null {
  if (nextIn === null || nextIn < 1) {
    return null;
  }
  return `${nextIn} more ${nextIn === 1 ? "try" : "tries"} until the ward strengthens`;
}
