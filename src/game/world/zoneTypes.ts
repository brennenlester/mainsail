export type ZoneId =
  | "grove"
  | "shrine"
  | "village"
  | "overworld"
  | "harbor"
  | "archipelago"
  | "mistwood"
  | "emberfen"
  | "warden-cottage"
  | "weaver-cottage"
  | "hearthkeep-cottage"
  | "hermit-cottage";

export const TileType = {
  Wall: 0,
  Floor: 1,
  OverworldGate: 2,
  Water: 3,
  Dock: 4,
  /** Hearth Crossing east gate — opens at the first-evolution beat (#369). */
  VillageGate: 5,
  /** Folklore Fields → Mistwood exit — opens when the rival beat is won (#369). */
  MistwoodGate: 6,
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export type ZoneTransition = {
  x: number;
  y: number;
  targetZone: ZoneId;
  targetX: number;
  targetY: number;
};

/** Doorway entered with E rather than by walking onto the tile. */
export type ZoneDoor = {
  x: number;
  y: number;
  targetZone: ZoneId;
  targetX: number;
  targetY: number;
  label: string;
};

export type ZoneDefinition = {
  id: ZoneId;
  name: string;
  width: number;
  height: number;
  tiles: TileType[][];
  transitions: ZoneTransition[];
  /** Starting spawn when entering the confined region for the first time. */
  defaultSpawn?: { x: number; y: number };
  lightTint: number;
  darkTint: number;
  /** Optional interact point (e.g. Moon Shrine crafting altar). */
  shrineInteract?: { x: number; y: number };
  /** Doors requiring an E press, so walking past never yanks you indoors. */
  doors?: ZoneDoor[];
  /** True for cottage interiors — used for framing and safety rules. */
  interior?: boolean;
  /**
   * Safe zone (#411): no wild encounters roll here (town plaza). Interiors
   * are always safe; see `isSafeZone`.
   */
  safe?: boolean;
};
