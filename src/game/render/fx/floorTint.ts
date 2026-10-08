/**
 * Cheap ground variation over the checker floor (#362): soften the light/dark
 * checker and add low-frequency patches so tiles read as terrain, not a debug
 * grid. Tint-only (multiply) — floor textures are owned elsewhere.
 */

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise in [0,1] with cells `scale` tiles wide. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function channel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

/**
 * Multiply tint for one floor tile. Light checker squares are pulled down
 * toward the dark ones (halving visible contrast), then a broad patch noise
 * and a small per-tile jitter shift brightness and warmth.
 */
export function floorTintAt(
  x: number,
  y: number,
  light: boolean,
  strength = 1,
): number {
  const patch = valueNoise(x, y, 3.5, 11);
  const warm = valueNoise(x, y, 5, 29) - 0.5;
  const jitter = hash2(x, y, 7) - 0.5;
  const checker = light ? 0.8 : 1;
  const base = checker * (0.86 + 0.14 * patch + 0.04 * jitter);
  const k = (v: number) => 1 - (1 - v) * strength;
  const r = k(base * (1 + 0.06 * warm));
  const g = k(base);
  const b = k(base * (1 - 0.08 * warm));
  return (channel(r) << 16) | (channel(g) << 8) | channel(b);
}
