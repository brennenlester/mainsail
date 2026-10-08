/**
 * Pure maths for the zone edge vignette (no Phaser, so unit tests can import it).
 * See edgeVignette.ts.
 */
const NAVY = [0x1f, 0x2a, 0x44] as const;
/** Vignette alpha far from the tile edge. */
const VIGNETTE_MAX_ALPHA = 0.49;
/** World px over which the vignette deepens / the halo fades. */
const VIGNETTE_RAMP = 150;
const HALO_RAMP = 190;
const HALO_MAX_ALPHA = 0.8;

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Navy vignette alpha at `d` world px outside the tile edge (0 at and inside it). */
export function vignetteAlpha(d: number): number {
  return VIGNETTE_MAX_ALPHA * smooth(d / VIGNETTE_RAMP);
}

/** Halo alpha at `d` px outside the edge: strongest at the edge, gone by HALO_RAMP. */
export function haloAlpha(d: number): number {
  return d < 0 ? 0 : HALO_MAX_ALPHA * (1 - smooth(d / HALO_RAMP));
}

/** Distance outside an axis-aligned rect (0 inside), Euclidean so corners round. */
export function distanceOutside(
  x: number,
  y: number,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
  const dy = Math.max(rect.minY - y, 0, y - rect.maxY);
  return Math.hypot(dx, dy);
}

/** RGBA (0..255, alpha 0..1) of the vignette over an optional halo tone at distance `d`. */
export function vignettePixel(d: number, haloRgb?: readonly [number, number, number]): [number, number, number, number] {
  const v = vignetteAlpha(d);
  const h = haloRgb ? haloAlpha(d) : 0;
  // Navy over the halo tone, as one non-premultiplied pixel.
  const a = v + h * (1 - v);
  if (a <= 0) {
    return [0, 0, 0, 0];
  }
  const hw = (h * (1 - v)) / a;
  const vw = v / a;
  return [
    NAVY[0] * vw + (haloRgb?.[0] ?? 0) * hw,
    NAVY[1] * vw + (haloRgb?.[1] ?? 0) * hw,
    NAVY[2] * vw + (haloRgb?.[2] ?? 0) * hw,
    a,
  ];
}

