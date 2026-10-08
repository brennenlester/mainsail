/**
 * Favorite material per species (#367). Gifting the favorite raises bond.
 * Early species favor gatherables so the loop is reachable in the first zone.
 * Keyed by species (original befriend id) so evolved forms keep the taste.
 */
export const FAVORITE_MATERIALS: Readonly<Record<string, string>> = {
  mossling: "wild-fiber",
  "ember-wisp": "wood",
  "brook-nymph": "pebble",
  "stone-hound": "stone",
  "mist-serpent": "brook-pearl",
  rootwalker: "moss-fiber",
  "lantern-fox": "ember-ash",
  "thunder-finch": "wood",
  bramblewarden: "wild-fiber",
  hearthflame: "wood",
  "peat-sprite": "moss-fiber",
  "cinder-toad": "ember-ash",
  "bog-lantern": "peat-tuft",
  "isle-fernling": "wild-fiber",
  "salt-scuttle": "pebble",
  "shoal-wisp": "brook-pearl",
  "tide-urchin": "coral-chip",
  "coral-skitter": "pebble",
  "drift-kelpie": "isle-frond",
  "dune-hermit": "salt-shard",
  "brackish-newt": "kelp-strand",
  "pearl-moth": "lantern-wick",
  "reef-spinner": "coral-chip",
  "mist-anemone": "shoal-mist",
  "barnacle-toad": "stone",
  "gulf-lantern": "bog-wick",
  "spray-finch": "wild-fiber",
  "lagoon-hare": "isle-frond",
  "atoll-wisp": "pearl-dust",
};

/** Sovereigns and anything unlisted share a taste for Folklore Dust. */
export const DEFAULT_FAVORITE_MATERIAL = "folklore-dust";

export function getFavoriteMaterial(speciesId: string): string {
  return FAVORITE_MATERIALS[speciesId] ?? DEFAULT_FAVORITE_MATERIAL;
}
