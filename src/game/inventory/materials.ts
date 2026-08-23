/** Creature-specific spar-win materials keyed by creature definition id. */
export const CREATURE_MATERIALS: Record<string, string> = {
  "mossling": "moss-fiber",
  "ember-wisp": "ember-ash",
  "brook-nymph": "brook-pearl",
  "stone-hound": "stone-chip",
  "mist-serpent": "mist-shard",
  "rootwalker": "root-bark",
  "lantern-fox": "lantern-wick",
  "thunder-finch": "storm-feather",
  "peat-sprite": "peat-tuft",
  "cinder-toad": "cinder-scale",
  "bog-lantern": "bog-wick",
  "isle-fernling": "isle-frond",
  "salt-scuttle": "salt-shard",
  "shoal-wisp": "shoal-mist",
  "tide-urchin": "tide-spine",
  "coral-skitter": "coral-chip",
  "drift-kelpie": "kelp-strand",
  "dune-hermit": "dune-shell",
  "brackish-newt": "brackish-scale",
  "pearl-moth": "pearl-dust",
  "reef-spinner": "reef-thread",
  "mist-anemone": "mist-tendril",
  "barnacle-toad": "barnacle-plate",
  "gulf-lantern": "gulf-wick",
  "spray-finch": "spray-feather",
  "lagoon-hare": "lagoon-fur",
  "atoll-wisp": "atoll-mist",
};

export const MATERIAL_NAMES: Record<string, string> = {
  wood: "Wood",
  stone: "Stone",
  "wild-fiber": "Wild Fiber",
  pebble: "Pebble",
  "moss-fiber": "Moss Fiber",
  "ember-ash": "Ember Ash",
  "brook-pearl": "Brook Pearl",
  "stone-chip": "Stone Chip",
  "mist-shard": "Mist Shard",
  "root-bark": "Root Bark",
  "lantern-wick": "Lantern Wick",
  "storm-feather": "Storm Feather",
  "peat-tuft": "Peat Tuft",
  "cinder-scale": "Cinder Scale",
  "bog-wick": "Bog Wick",
  "isle-frond": "Isle Frond",
  "salt-shard": "Salt Shard",
  "shoal-mist": "Shoal Mist",
  "tide-spine": "Tide Spine",
  "coral-chip": "Coral Chip",
  "kelp-strand": "Kelp Strand",
  "dune-shell": "Dune Shell",
  "brackish-scale": "Brackish Scale",
  "pearl-dust": "Pearl Dust",
  "reef-thread": "Reef Thread",
  "mist-tendril": "Mist Tendril",
  "barnacle-plate": "Barnacle Plate",
  "gulf-wick": "Gulf Wick",
  "spray-feather": "Spray Feather",
  "lagoon-fur": "Lagoon Fur",
  "atoll-mist": "Atoll Mist",
  "folklore-dust": "Folklore Dust",
};

export const ITEM_NAMES: Record<string, string> = {
  "tide-cleaver": "Tide Cleaver",
  "cairn-maul": "Cairn Maul",
  "sovereign-seal": "Sovereign Seal",
  "sovereign-plate": "Sovereign Plate",
  "tide-crown": "Tide Crown",
  "boulder-crown": "Boulder Crown",
  "wood-cudgel": "Wood Cudgel",
  "stone-knife": "Stone Knife",
  "ember-charm": "Ember Charm",
  "moss-salve": "Moss Salve",
  "storm-charm": "Storm Charm",
  "fox-fire-charm": "Fox-fire Charm",
  "fen-charm": "Fen Charm",
  "nymph-charm": "Nymph Charm",
  "hound-collar": "Hound Collar",
  "brook-tonic": "Brook Tonic",
  "brook-crystal": "Brook Crystal",
  "moonwake-draught": "Moonwake Draught",
  "portable-moonshrine": "Portable Moonshrine",
  boat: "Boat",
};

export function getMaterialForCreature(creatureId: string): string | undefined {
  return CREATURE_MATERIALS[creatureId];
}

/** @deprecated Recipe-grid subset; icons now cover full catalogs (#218). */
export const CRAFT_MATERIAL_ICON_IDS = [
  "wood",
  "stone",
  "wild-fiber",
  "moss-fiber",
  "ember-ash",
  "brook-pearl",
  "pebble",
  "folklore-dust",
  "storm-feather",
  "mist-shard",
  "lantern-wick",
  "peat-tuft",
  "tide-crown",
  "boulder-crown",
] as const;

function assetPrefix(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}

export function getMaterialIconSrc(materialId: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(MATERIAL_NAMES, materialId)) {
    return undefined;
  }
  return `${assetPrefix()}assets/materials/${materialId}.png`;
}

export function getItemIconSrc(itemId: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(ITEM_NAMES, itemId)) {
    return undefined;
  }
  return `${assetPrefix()}assets/items/${itemId}.png`;
}

/** Material or craft-item id → public PNG path when catalogued. */
export function getIngredientIconSrc(id: string): string | undefined {
  return getMaterialIconSrc(id) ?? getItemIconSrc(id);
}

export function getIngredientName(id: string): string {
  return MATERIAL_NAMES[id] ?? ITEM_NAMES[id] ?? id;
}

export function getMaterialName(materialId: string): string {
  return getIngredientName(materialId);
}

export function getItemName(itemId: string): string {
  return ITEM_NAMES[itemId] ?? itemId;
}

export function isCraftItemIngredient(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEM_NAMES, id);
}
