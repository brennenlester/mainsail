/**
 * Rare variant ("shiny") trait (#368). Rolled once when a creature joins the
 * party and stored as `rare: true` on the instance; absent means normal, so
 * older saves stay valid untouched.
 */

/** ~1 in 16 befriends. */
export const RARE_VARIANT_CHANCE = 1 / 16;

export function rollRareVariant(rng: () => number = Math.random): boolean {
  return rng() < RARE_VARIANT_CHANCE;
}

export function isRareVariant(creature: { rare?: boolean }): boolean {
  return creature.rare === true;
}

function speciesHash(speciesId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < speciesId.length; i += 1) {
    hash = Math.imul(hash ^ speciesId.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/** Deterministic per-species hue rotation in degrees (120–240, never subtle). */
export function rareHueShift(speciesId: string): number {
  return 120 + (speciesHash(speciesId) % 121);
}

/**
 * Multiply tint for Phaser sprites: a saturated pastel at the species' rare
 * hue, so full-colour art reads as a colour-shifted variant.
 */
export function rareVariantTint(speciesId: string): number {
  const hue = rareHueShift(speciesId) % 360;
  const s = 0.55;
  const l = 0.78;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}
