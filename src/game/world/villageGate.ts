/**
 * Hearth Crossing village gate (#291): east gate into the cottages.
 * Unlocks automatically when the first-evolution beat starts (#369) so Bryn
 * can gift a missing Grove starter (#349). No code entry.
 * Overworld (north) still opens via Story 2 / first-spar.
 */

/** East gate tile inside Hearth Crossing. */
export const VILLAGE_CODE_GATE = { x: 8, y: 5 } as const;

/** North overworld gate tile (Story 2). */
export const VILLAGE_OVERWORLD_GATE = { x: 5, y: 0 } as const;

/** Folklore Fields east exit into Mistwood Reach (region gate, #369). */
export const MISTWOOD_GATE = { x: 14, y: 7 } as const;

/** Cottage doors east of the gate. */
export const VILLAGE_COTTAGE_DOORS = {
  warden: { x: 11, y: 4 },
  weaver: { x: 14, y: 3 },
  hearthkeep: { x: 11, y: 8 },
} as const;
