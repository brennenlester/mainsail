import { SHRINE_EFFECTS } from "../shrine/shrineEffects";

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

/** Default rare glow (lavender), used on cards behind a rare companion. */
const RARE_GLOW_DEFAULT = 0xd4b0ff;

/**
 * Per-species rare looks that keep the base palette (#418). Cinderling — the
 * finale's rare Cinder Toad — is a warm ember-orange toad with an ember glow
 * on every screen (hatch, finale, party, share card, battle), not a
 * hue-rotated brown / teal one.
 */
const RARE_LOOKS: Readonly<Record<string, { hueShift: number; glow: number }>> = {
  "cinder-toad": { hueShift: 0, glow: 0xff8a3a },
};

/** Evolved form -> the species it grew from, so a rare keeps its look after evolving. */
const EVOLVED_FROM: ReadonlyMap<string, string> = new Map(
  SHRINE_EFFECTS.filter((e) => e.effectType === "evolution" && e.evolvesTo).map((e) => [e.evolvesTo!, e.creatureId]),
);

/** The species whose rare look applies to `id` (a species or an evolved form). */
export function rareLookSpecies(id: string): string {
  let species = id;
  for (let i = 0; i < 4 && EVOLVED_FROM.has(species); i += 1) {
    species = EVOLVED_FROM.get(species)!;
  }
  return species;
}

/** Deterministic per-species hue rotation in degrees (120–240, never subtle; 0 keeps the art). */
export function rareHueShift(id: string): number {
  const speciesId = rareLookSpecies(id);
  return RARE_LOOKS[speciesId]?.hueShift ?? 120 + (speciesHash(speciesId) % 121);
}

/** Glow colour behind a rare companion on cards (0xRRGGBB). */
export function rareVariantGlow(id: string): number {
  return RARE_LOOKS[rareLookSpecies(id)]?.glow ?? RARE_GLOW_DEFAULT;
}

/** Accent (rare chip, sparkles, star, border) as `#rrggbb`: lavender, or the species' own glow. */
export function rareVariantAccentCss(id: string): string {
  return `#${rareVariantGlow(id).toString(16).padStart(6, "0")}`;
}

/** `rgba(...)` form of the rare glow for canvas / CSS. */
export function rareVariantGlowCss(speciesId: string, alpha: number): string {
  const c = rareVariantGlow(speciesId);
  return `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${alpha})`;
}

/**
 * Multiply tint for Phaser sprites: a saturated pastel at the species' rare
 * hue, so full-colour art reads as a colour-shifted variant.
 */
export function rareVariantTint(speciesId: string): number {
  const hue = rareHueShift(speciesId) % 360;
  if (hue === 0) {
    return 0xffffff;
  }
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
