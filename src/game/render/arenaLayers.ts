import type { ZoneId } from "../world/zoneTypes";

/**
 * Rendered spar backdrops (#361). `grove` keeps the legacy unprefixed keys.
 * `ember` is the Cinder Matriarch's arena (#385): standalone PNGs loaded by
 * the boss battle only, never chosen by zone.
 */
export type ArenaVariant = "grove" | "village" | "night" | "ember";

export type ArenaLayerKeys = { sky: string; hills: string; platform: string };

export function arenaLayerKeys(variant: ArenaVariant): ArenaLayerKeys {
  const prefix = variant === "grove" ? "arena" : `arena-${variant}`;
  return {
    sky: `${prefix}-sky`,
    hills: `${prefix}-hills`,
    platform: `${prefix}-platform`,
  };
}

/** Hearth Crossing and its cottages spar on the cobbled plaza dais. */
const VILLAGE_ARENA_ZONES = new Set<ZoneId>([
  "village",
  "warden-cottage",
  "weaver-cottage",
  "hearthkeep-cottage",
]);

/** Night sky once the overworld light is mostly dark (dayNight nightness). */
export const ARENA_NIGHT_THRESHOLD = 0.6;

/** Which arena a spar uses: night after dark, village plaza in Hearth Crossing, meadow elsewhere. */
export function arenaVariantForZone(zoneId: ZoneId, nightness = 0): ArenaVariant {
  if (nightness >= ARENA_NIGHT_THRESHOLD) {
    return "night";
  }
  return VILLAGE_ARENA_ZONES.has(zoneId) ? "village" : "grove";
}

// ponytail: module-level context written by OverworldFx each light refresh;
// battles launch from the overworld, so the last sample is the right one.
let context: { zoneId: ZoneId; nightness: number } = { zoneId: "grove", nightness: 0 };

export function noteArenaContext(zoneId: ZoneId, nightness: number): void {
  context = { zoneId, nightness };
}

/**
 * Layer keys for the current spar: `override` (story battles) or the
 * zone/night variant when all three frames exist; a missing ember arena
 * falls back to night. Else the grove arena, else null (procedural fallback).
 */
export function resolveArenaLayers(
  hasTexture: (key: string) => boolean,
  override?: ArenaVariant,
): ArenaLayerKeys | null {
  const has = (keys: ArenaLayerKeys) => hasTexture(keys.sky) && hasTexture(keys.hills) && hasTexture(keys.platform);
  const wanted = override ?? arenaVariantForZone(context.zoneId, context.nightness);
  const chain: ArenaVariant[] = wanted === "ember" ? ["ember", "night", "grove"] : [wanted, "grove"];
  for (const variant of chain) {
    const keys = arenaLayerKeys(variant);
    if (has(keys)) {
      return keys;
    }
  }
  return null;
}
