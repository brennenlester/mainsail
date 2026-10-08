import type { ZoneId } from "./zoneTypes";
import { getArchipelagoProps } from "./archipelagoStream";
import { MISTWOOD_GATE, VILLAGE_CODE_GATE } from "./villageGate";
import { worldState } from "./worldState";
import { revealedSiteProps } from "../companions/abilities";
import { getClaimedSites } from "../companions/companionState";

export type PropKind =
  | "tree"
  | "fern"
  | "shrine-altar"
  | "standing-stone"
  | "pebble-pile"
  | "hearth"
  | "cottage"
  | "gate"
  | "loom"
  | "shelf"
  // Decorative village / shrine dressing (#361); not gatherable.
  | "lantern"
  | "moon-lantern"
  | "banner"
  | "stall"
  // Biome dressing (#392); not gatherable.
  | "glowcap"
  | "fog"
  | "log"
  | "brazier"
  | "crates"
  | "hay"
  | "signpost"
  | "wildflowers"
  // Cottage interior furniture (#392).
  | "door"
  | "table"
  | "plant";

export type ZoneProp = {
  x: number;
  y: number;
  kind: PropKind;
};

export const ZONE_PROPS: Partial<Record<ZoneId, ZoneProp[]>> = {
  grove: [
    { x: 2, y: 3, kind: "tree" },
    { x: 7, y: 2, kind: "tree" },
    { x: 4, y: 6, kind: "fern" },
    { x: 7, y: 7, kind: "tree" },
    { x: 3, y: 5, kind: "fern" },
    { x: 6, y: 4, kind: "standing-stone" },
    { x: 1, y: 6, kind: "pebble-pile" },
  ],
  shrine: [
    { x: 5, y: 5, kind: "shrine-altar" },
    { x: 3, y: 3, kind: "standing-stone" },
    { x: 7, y: 3, kind: "standing-stone" },
    { x: 4, y: 7, kind: "standing-stone" },
    { x: 6, y: 6, kind: "pebble-pile" },
    { x: 2, y: 5, kind: "fern" },
    { x: 2, y: 4, kind: "moon-lantern" },
    { x: 8, y: 4, kind: "moon-lantern" },
  ],
  village: [
    // Plaza (west of code gate)
    { x: 5, y: 0, kind: "gate" },
    { x: 8, y: 5, kind: "gate" },
    { x: 3, y: 6, kind: "fern" },
    { x: 6, y: 3, kind: "pebble-pile" },
    { x: 3, y: 2, kind: "stall" },
    { x: 2, y: 4, kind: "lantern" },
    { x: 7, y: 4, kind: "lantern" },
    { x: 4, y: 1, kind: "banner" },
    { x: 6, y: 7, kind: "banner" },
    // Cottage yard (east of code gate)
    { x: 11, y: 3, kind: "cottage" },
    { x: 14, y: 2, kind: "cottage" },
    { x: 11, y: 7, kind: "cottage" },
    { x: 13, y: 2, kind: "pebble-pile" },
    { x: 9, y: 4, kind: "lantern" },
    { x: 13, y: 6, kind: "lantern" },
  ],
  "warden-cottage": [
    { x: 5, y: 1, kind: "hearth" },
    { x: 1, y: 1, kind: "shelf" },
    { x: 1, y: 4, kind: "table" },
    { x: 5, y: 5, kind: "plant" },
    { x: 3, y: 6, kind: "door" },
  ],
  "weaver-cottage": [
    { x: 5, y: 1, kind: "hearth" },
    { x: 1, y: 2, kind: "loom" },
    { x: 5, y: 4, kind: "table" },
    { x: 1, y: 5, kind: "plant" },
    { x: 3, y: 6, kind: "door" },
  ],
  "hearthkeep-cottage": [
    { x: 1, y: 1, kind: "hearth" },
    { x: 5, y: 3, kind: "shelf" },
    { x: 1, y: 4, kind: "table" },
    { x: 5, y: 1, kind: "plant" },
    { x: 3, y: 6, kind: "door" },
  ],
  "hermit-cottage": [
    { x: 5, y: 1, kind: "hearth" },
    { x: 1, y: 2, kind: "shelf" },
    { x: 5, y: 4, kind: "table" },
    { x: 1, y: 5, kind: "plant" },
    { x: 3, y: 6, kind: "door" },
  ],
  overworld: [
    // North gate → Harbor
    { x: 7, y: 0, kind: "gate" },
    { x: 6, y: 1, kind: "fern" },
    { x: 8, y: 1, kind: "fern" },
    // South approach (village gate)
    { x: 6, y: 12, kind: "fern" },
    { x: 8, y: 12, kind: "fern" },
    { x: 5, y: 11, kind: "pebble-pile" },
    { x: 9, y: 11, kind: "standing-stone" },
    // Central meadow (the road runs down x=7 and east along y=7, #392)
    { x: 4, y: 5, kind: "tree" },
    { x: 8, y: 3, kind: "tree" },
    { x: 10, y: 5, kind: "tree" },
    { x: 5, y: 7, kind: "fern" },
    { x: 9, y: 8, kind: "fern" },
    { x: 6, y: 9, kind: "standing-stone" },
    { x: 3, y: 8, kind: "pebble-pile" },
    { x: 11, y: 8, kind: "pebble-pile" },
    // East path toward Mistwood (region gate, #369)
    { x: MISTWOOD_GATE.x, y: MISTWOOD_GATE.y, kind: "gate" },
    { x: 12, y: 6, kind: "tree" },
    { x: 12, y: 8, kind: "fern" },
    { x: 11, y: 4, kind: "standing-stone" },
    // Meadow dressing (#392)
    { x: 8, y: 6, kind: "signpost" },
    { x: 3, y: 3, kind: "hay" },
    { x: 10, y: 10, kind: "hay" },
    { x: 5, y: 3, kind: "wildflowers" },
    { x: 9, y: 2, kind: "wildflowers" },
    { x: 3, y: 10, kind: "wildflowers" },
  ],
  harbor: [
    { x: 2, y: 3, kind: "standing-stone" },
    { x: 5, y: 3, kind: "fern" },
    { x: 8, y: 3, kind: "pebble-pile" },
    { x: 12, y: 3, kind: "fern" },
    { x: 14, y: 3, kind: "standing-stone" },
    // East Landing landmark pads
    { x: 15, y: 4, kind: "standing-stone" },
    { x: 16, y: 4, kind: "pebble-pile" },
    // Quay dressing (#392)
    { x: 1, y: 2, kind: "crates" },
    { x: 10, y: 2, kind: "crates" },
    { x: 6, y: 5, kind: "lantern" },
    { x: 11, y: 5, kind: "lantern" },
  ],
  mistwood: [
    { x: 2, y: 5, kind: "tree" },
    { x: 2, y: 7, kind: "tree" },
    { x: 4, y: 3, kind: "tree" },
    { x: 6, y: 2, kind: "tree" },
    { x: 8, y: 3, kind: "tree" },
    { x: 9, y: 5, kind: "tree" },
    { x: 9, y: 8, kind: "tree" },
    { x: 5, y: 5, kind: "standing-stone" },
    { x: 7, y: 7, kind: "standing-stone" },
    { x: 4, y: 8, kind: "fern" },
    { x: 6, y: 9, kind: "fern" },
    { x: 8, y: 7, kind: "fern" },
    { x: 3, y: 4, kind: "pebble-pile" },
    { x: 7, y: 4, kind: "pebble-pile" },
    // East path toward Emberfen
    { x: 10, y: 5, kind: "fern" },
    { x: 10, y: 7, kind: "pebble-pile" },
    // Forest dressing (#392)
    { x: 3, y: 9, kind: "glowcap" },
    { x: 8, y: 9, kind: "glowcap" },
    { x: 5, y: 3, kind: "glowcap" },
    { x: 1, y: 2, kind: "log" },
    { x: 3, y: 7, kind: "fog" },
    { x: 8, y: 5, kind: "fog" },
    { x: 5, y: 10, kind: "fog" },
  ],
  emberfen: [
    { x: 3, y: 3, kind: "tree" },
    { x: 7, y: 3, kind: "tree" },
    { x: 5, y: 2, kind: "standing-stone" },
    { x: 2, y: 4, kind: "fern" },
    { x: 4, y: 6, kind: "fern" },
    { x: 6, y: 4, kind: "fern" },
    { x: 8, y: 6, kind: "tree" },
    { x: 3, y: 8, kind: "standing-stone" },
    { x: 7, y: 8, kind: "pebble-pile" },
    { x: 5, y: 7, kind: "pebble-pile" },
    { x: 8, y: 4, kind: "standing-stone" },
    // Braziers light the cinder path to the Matriarch (#392)
    { x: 4, y: 4, kind: "brazier" },
    { x: 7, y: 6, kind: "brazier" },
    { x: 9, y: 3, kind: "brazier" },
  ],
};

export function getZoneProps(zoneId: ZoneId): ZoneProp[] {
  if (zoneId === "archipelago") {
    return getArchipelagoProps();
  }
  const base = ZONE_PROPS[zoneId] ?? [];
  // Gather nodes a companion has sniffed out (#367).
  const revealed = revealedSiteProps(zoneId, getClaimedSites());
  return revealed.length > 0 ? [...base, ...revealed] : base;
}

/**
 * Gatherable kinds with a biome-specific look (`prop-<kind>-<zone>`, #345 /
 * #392); the kind (and so the gather action) stays the same.
 */
const ZONE_PROP_VARIANTS: Partial<Record<ZoneId, readonly PropKind[]>> = {
  mistwood: ["tree", "fern", "standing-stone", "pebble-pile"],
  emberfen: ["tree", "fern", "standing-stone", "pebble-pile"],
  harbor: ["fern", "standing-stone", "pebble-pile"],
};

export function propTextureKey(
  kind: PropKind,
  gateOpen = true,
  zoneId?: ZoneId,
): string {
  if (kind === "gate") {
    return gateOpen ? "prop-gate" : "prop-gate-locked";
  }
  if (zoneId && ZONE_PROP_VARIANTS[zoneId]?.includes(kind)) {
    return `prop-${kind}-${zoneId}`;
  }
  return `prop-${kind}`;
}

/** Prefer the biome sheet; fall back to the base `prop-<kind>` when missing. */
export function resolvePropTextureKey(
  kind: PropKind,
  gateOpen: boolean,
  zoneId: ZoneId | undefined,
  hasTexture: (key: string) => boolean,
): string {
  const key = propTextureKey(kind, gateOpen, zoneId);
  if (hasTexture(key) || kind === "gate") {
    return key;
  }
  return `prop-${kind}`;
}

/** Which unlock flag drives a village/overworld gate prop (#291). */
export function isGatePropOpen(
  zoneId: ZoneId,
  prop: ZoneProp,
  overworldUnlocked: boolean,
  villageGateUnlocked: boolean,
  mistwoodPathOpen = worldState.mistwoodPathOpen,
): boolean {
  if (prop.kind !== "gate") {
    return true;
  }
  if (zoneId === "village" && prop.x === VILLAGE_CODE_GATE.x && prop.y === VILLAGE_CODE_GATE.y) {
    return villageGateUnlocked;
  }
  if (zoneId === "overworld" && prop.x === MISTWOOD_GATE.x && prop.y === MISTWOOD_GATE.y) {
    return mistwoodPathOpen;
  }
  return overworldUnlocked;
}
