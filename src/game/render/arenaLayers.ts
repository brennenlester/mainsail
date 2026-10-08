import type { ZoneId } from "../world/zoneTypes";

/** Rendered spar backdrops (#361). `grove` keeps the legacy unprefixed keys. */
export type ArenaVariant = "grove" | "village" | "night";

export type ArenaLayerKeys = { sky: string; hills: string; platform: string };

export function arenaLayerKeys(variant: ArenaVariant): ArenaLayerKeys {
  const prefix = variant === "grove" ? "arena" : `arena-${variant}`;
  return {
    sky: `${prefix}-sky`,
    hills: `${prefix}-hills`,
    platform: `${prefix}-platform`,
  };
}

/**
 * Which arena a spar uses: night after dusk anywhere outdoors, the meadow
 * dais in the Grove, the cobbled village dais everywhere else. For the
 * battle owner to wire into BattleScene.drawArena (fall back to
 * `arenaLayerKeys("grove")` when a variant's frames are missing).
 */
export function arenaVariantForZone(zoneId: ZoneId, night = false): ArenaVariant {
  if (night) {
    return "night";
  }
  return zoneId === "grove" ? "grove" : "village";
}
