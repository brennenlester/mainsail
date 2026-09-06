import type { ZoneId } from "../world/zoneTypes";
import { ZONES } from "../world/zones";

/**
 * Habitat encounter variation (#275 / #268).
 * Axes only — species identity and zone tint are not profile fields.
 * Profiles must not denominate resource costs (#266/#267 own pricing).
 */

export type HabitatTrigger =
  | { kind: "chance"; chance: number }
  | { kind: "guaranteed" };

export type HabitatAvailability =
  | { kind: "always" }
  | { kind: "fleePersists" };

export type HabitatVerbs =
  | { kind: "all" }
  | { kind: "withholdSparUnlessFirstSpar" };

export type HabitatResolution =
  | { kind: "flat" }
  | { kind: "folkloreMatchup" };

export type HabitatReveal =
  | { kind: "shown" }
  | { kind: "concealedUntilAction" };

export type HabitatTableSource =
  | { kind: "zoneTable" }
  | {
      kind: "discoveredMinusParty";
      /** Pier / dock / East Landing stands only. */
      stands: "pierDockEastLanding";
      befriendOncePerSpecies: true;
    };

export type HabitatAftermath =
  | { kind: "none" }
  | { kind: "fleeFollow" };

export type HabitatProfile = {
  trigger: HabitatTrigger;
  availability: HabitatAvailability;
  verbs: HabitatVerbs;
  resolution: HabitatResolution;
  reveal: HabitatReveal;
  tableSource: HabitatTableSource;
  aftermath: HabitatAftermath;
};

/** Today's default wild encounter behavior (pre-#275). */
export const DEFAULT_PROFILE: HabitatProfile = {
  trigger: { kind: "chance", chance: 0.05 },
  availability: { kind: "always" },
  verbs: { kind: "all" },
  resolution: { kind: "flat" },
  reveal: { kind: "shown" },
  tableSource: { kind: "zoneTable" },
  aftermath: { kind: "none" },
};

/**
 * Whisper Grove density (#308). Elevated vs DEFAULT 5%, but not `guaranteed`
 * — guaranteed + 0.75 travel threshold fired an encounter every ~tile.
 */
export const GROVE_ENCOUNTER_CHANCE = 0.12;

/**
 * Archipelago on-foot chance (#338). Distinct from DEFAULT 5% and grove 12%
 * so the habitat stays unique after dropping one-per-landing.
 */
export const ARCHIPELAGO_ENCOUNTER_CHANCE = 0.08;

/** Non-interior habitats that must each differ from DEFAULT and each other. */
export const VARIATION_ZONE_IDS = [
  "grove",
  "shrine",
  "village",
  "overworld",
  "mistwood",
  "emberfen",
  "archipelago",
  "harbor",
] as const satisfies readonly ZoneId[];

export type VariationZoneId = (typeof VARIATION_ZONE_IDS)[number];

export const HABITAT_PROFILES: Record<VariationZoneId, HabitatProfile> = {
  grove: {
    ...DEFAULT_PROFILE,
    trigger: { kind: "chance", chance: GROVE_ENCOUNTER_CHANCE },
  },
  shrine: {
    ...DEFAULT_PROFILE,
    resolution: { kind: "folkloreMatchup" },
  },
  village: {
    ...DEFAULT_PROFILE,
    verbs: { kind: "withholdSparUnlessFirstSpar" },
  },
  overworld: {
    ...DEFAULT_PROFILE,
    aftermath: { kind: "fleeFollow" },
  },
  mistwood: {
    ...DEFAULT_PROFILE,
    reveal: { kind: "concealedUntilAction" },
  },
  emberfen: {
    ...DEFAULT_PROFILE,
    availability: { kind: "fleePersists" },
  },
  archipelago: {
    ...DEFAULT_PROFILE,
    trigger: { kind: "chance", chance: ARCHIPELAGO_ENCOUNTER_CHANCE },
  },
  harbor: {
    ...DEFAULT_PROFILE,
    tableSource: {
      kind: "discoveredMinusParty",
      stands: "pierDockEastLanding",
      befriendOncePerSpecies: true,
    },
  },
};

export function isInteriorZone(zoneId: ZoneId): boolean {
  return ZONES[zoneId]?.interior === true;
}

export function getHabitatProfile(zoneId: ZoneId): HabitatProfile {
  if (zoneId in HABITAT_PROFILES) {
    return HABITAT_PROFILES[zoneId as VariationZoneId];
  }
  return DEFAULT_PROFILE;
}

/** Stable deep equality for profile objects (no species/tint fields). */
export function profilesEqual(a: HabitatProfile, b: HabitatProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
