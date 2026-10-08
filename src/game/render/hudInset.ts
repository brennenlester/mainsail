/**
 * CSS-px distance from the board top to a top-anchored HUD text's origin.
 * The origin may sit mid-text (pill), so keep `originOffsetCss` (height above
 * origin) clear of the story card as well as the 8px gap (#388).
 */
export function topHudInsetCss(inset: number, cardBottomCss: number, originOffsetCss: number): number {
  const extra = inset - 56 > 0 ? inset - 56 : 0;
  return Math.max(inset, cardBottomCss + 8 + originOffsetCss + extra);
}
