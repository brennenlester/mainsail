/**
 * Hearth Crossing village gate (#291): east gate into the cottages.
 * Unlocks automatically at Act 2 start (evolve-bramblewarden) so Bryn can
 * gift a missing Grove starter before steps 5–6 (#349). No code entry.
 * Overworld (north) still opens via Story 2 / first-spar.
 */

/** East gate tile inside Hearth Crossing. */
export const VILLAGE_CODE_GATE = { x: 8, y: 5 } as const;

/** North overworld gate tile (Story 2). */
export const VILLAGE_OVERWORLD_GATE = { x: 5, y: 0 } as const;

/** Cottage interiors east of the gate — stepping in completes Story step 7 (#317). */
export const VILLAGE_COTTAGE_ZONE_IDS = [
  "warden-cottage",
  "weaver-cottage",
  "hearthkeep-cottage",
] as const;

/** True when the player walked into a cottage from a different zone, not a same-zone redraw. */
export function isCottageEntryFromAnotherZone(
  previousZoneId: string | undefined,
  zoneId: string,
): boolean {
  if (!previousZoneId || previousZoneId === zoneId) {
    return false;
  }
  return (VILLAGE_COTTAGE_ZONE_IDS as readonly string[]).includes(zoneId);
}
export const VILLAGE_COTTAGE_DOORS = {
  warden: { x: 11, y: 4 },
  weaver: { x: 14, y: 3 },
  hearthkeep: { x: 11, y: 8 },
} as const;
