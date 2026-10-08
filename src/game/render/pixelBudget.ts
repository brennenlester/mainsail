// Pure (no Phaser) so unit tests can import it.

/** Device pixel ratio, capped at 2 so fill-rate stays reasonable on 3x phones. */
export const DEVICE_DPR_CAP = 2;

/** Total drawing-buffer pixel budget (~4K at 1x). Huge stages render below the device ratio. */
export const MAX_RENDER_PIXELS = 8_300_000;

/**
 * Buffer pixels per CSS pixel for a stage: the capped device ratio, lowered
 * on very large displays so width x height x ratio^2 stays within `maxPixels`.
 */
export function effectivePixelRatio(
  cssWidth: number,
  cssHeight: number,
  deviceRatio: number,
  maxPixels = MAX_RENDER_PIXELS,
): number {
  const wanted = Math.min(Math.max(deviceRatio || 1, 0.5), DEVICE_DPR_CAP);
  const area = Math.max(1, cssWidth * cssHeight);
  const budget = Math.sqrt(maxPixels / area);
  return Math.max(0.5, Math.min(wanted, budget));
}
