import type { ZoneId } from "./zoneTypes";
import { getArchipelagoProps } from "./archipelagoStream";
import { VILLAGE_CODE_GATE } from "./villageGate";

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
  | "shelf";

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
  ],
  village: [
    // Plaza (west of code gate)
    { x: 5, y: 0, kind: "gate" },
    { x: 8, y: 5, kind: "gate" },
    { x: 3, y: 6, kind: "fern" },
    { x: 6, y: 3, kind: "pebble-pile" },
    // Cottage yard (east of code gate)
    { x: 11, y: 3, kind: "cottage" },
    { x: 14, y: 2, kind: "cottage" },
    { x: 11, y: 7, kind: "cottage" },
    { x: 13, y: 2, kind: "pebble-pile" },
  ],
  "warden-cottage": [
    { x: 5, y: 1, kind: "hearth" },
    { x: 1, y: 1, kind: "shelf" },
  ],
  "weaver-cottage": [
    { x: 5, y: 1, kind: "hearth" },
    { x: 1, y: 2, kind: "loom" },
  ],
  "hearthkeep-cottage": [
    { x: 1, y: 1, kind: "hearth" },
    { x: 5, y: 3, kind: "shelf" },
  ],
  "hermit-cottage": [
    { x: 5, y: 1, kind: "hearth" },
    { x: 1, y: 2, kind: "shelf" },
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
    // Central meadow
    { x: 4, y: 5, kind: "tree" },
    { x: 7, y: 4, kind: "tree" },
    { x: 10, y: 5, kind: "tree" },
    { x: 5, y: 7, kind: "fern" },
    { x: 9, y: 7, kind: "fern" },
    { x: 7, y: 8, kind: "standing-stone" },
    { x: 3, y: 8, kind: "pebble-pile" },
    { x: 11, y: 8, kind: "pebble-pile" },
    // East path toward Mistwood
    { x: 12, y: 6, kind: "tree" },
    { x: 12, y: 8, kind: "fern" },
    { x: 11, y: 4, kind: "standing-stone" },
  ],
  harbor: [
    { x: 2, y: 3, kind: "standing-stone" },
    { x: 5, y: 4, kind: "fern" },
    { x: 8, y: 3, kind: "pebble-pile" },
    { x: 12, y: 4, kind: "fern" },
    { x: 14, y: 3, kind: "standing-stone" },
    // East Landing landmark pads
    { x: 15, y: 4, kind: "standing-stone" },
    { x: 16, y: 4, kind: "pebble-pile" },
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
    { x: 7, y: 6, kind: "standing-stone" },
    { x: 4, y: 8, kind: "fern" },
    { x: 6, y: 9, kind: "fern" },
    { x: 8, y: 7, kind: "fern" },
    { x: 3, y: 4, kind: "pebble-pile" },
    { x: 7, y: 4, kind: "pebble-pile" },
    // East path toward Emberfen
    { x: 10, y: 5, kind: "fern" },
    { x: 10, y: 7, kind: "pebble-pile" },
  ],
  emberfen: [
    { x: 3, y: 3, kind: "tree" },
    { x: 7, y: 3, kind: "tree" },
    { x: 5, y: 2, kind: "standing-stone" },
    { x: 2, y: 5, kind: "fern" },
    { x: 4, y: 6, kind: "fern" },
    { x: 6, y: 5, kind: "fern" },
    { x: 8, y: 6, kind: "tree" },
    { x: 3, y: 8, kind: "standing-stone" },
    { x: 7, y: 8, kind: "pebble-pile" },
    { x: 5, y: 7, kind: "pebble-pile" },
    { x: 8, y: 4, kind: "standing-stone" },
  ],
};

export function getZoneProps(zoneId: ZoneId): ZoneProp[] {
  if (zoneId === "archipelago") {
    return getArchipelagoProps();
  }
  return ZONE_PROPS[zoneId] ?? [];
}

export function propTextureKey(
  kind: PropKind,
  gateOpen = true,
  zoneId?: ZoneId,
): string {
  if (kind === "gate") {
    return gateOpen ? "prop-gate" : "prop-gate-locked";
  }
  if (kind === "tree" && zoneId === "mistwood") {
    return "prop-tree-mistwood";
  }
  if (kind === "tree" && zoneId === "emberfen") {
    return "prop-tree-emberfen";
  }
  return `prop-${kind}`;
}

/** Prefer biome canopy sheets; fall back to `prop-tree` when those frames are missing. */
export function resolvePropTextureKey(
  kind: PropKind,
  gateOpen: boolean,
  zoneId: ZoneId | undefined,
  hasTexture: (key: string) => boolean,
): string {
  const key = propTextureKey(kind, gateOpen, zoneId);
  if (hasTexture(key)) {
    return key;
  }
  return kind === "tree" ? "prop-tree" : key;
}

/** Which unlock flag drives a village/overworld gate prop (#291). */
export function isGatePropOpen(
  zoneId: ZoneId,
  prop: ZoneProp,
  overworldUnlocked: boolean,
  villageGateUnlocked: boolean,
): boolean {
  if (prop.kind !== "gate") {
    return true;
  }
  if (zoneId === "village" && prop.x === VILLAGE_CODE_GATE.x && prop.y === VILLAGE_CODE_GATE.y) {
    return villageGateUnlocked;
  }
  return overworldUnlocked;
}
