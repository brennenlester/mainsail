/** Canonical battle types (not habitats). */
export const FOLKLORE_TYPES = [
  "woodland",
  "ember",
  "water",
  "earth",
  "mist",
  "storm",
  "hearth",
  "twilight",
  "fen",
  "will-o-wisp",
] as const;

export type FolkloreType = (typeof FOLKLORE_TYPES)[number];

export const HUNTER_MULTIPLIER = 1.5;
/** A hunter shrugs off its prey: moves of the type a defender hunts are resisted. */
export const RESIST_MULTIPLIER = 0.5;

/** One clear hunter per type. */
export const HUNTER_CHART: Readonly<Record<FolkloreType, FolkloreType>> = {
  woodland: "fen",
  ember: "woodland",
  water: "ember",
  earth: "storm",
  mist: "twilight",
  storm: "water",
  hearth: "mist",
  twilight: "will-o-wisp",
  fen: "hearth",
  "will-o-wisp": "earth",
};

/**
 * Type-pair immunities. Only apply when the defender has rolled an immunity
 * trait (signature creatures) — not automatic for every creature of that type.
 */
export const IMMUNITY_CHART: Readonly<Partial<Record<FolkloreType, FolkloreType>>> =
  {
    mist: "earth",
    water: "ember",
    earth: "storm",
    twilight: "will-o-wisp",
  };

export function isFolkloreType(value: string): value is FolkloreType {
  return (FOLKLORE_TYPES as readonly string[]).includes(value);
}

export function getHunterTarget(attacker: FolkloreType): FolkloreType {
  return HUNTER_CHART[attacker];
}

export function getImmunityTo(defenderType: FolkloreType): FolkloreType | undefined {
  return IMMUNITY_CHART[defenderType];
}

export type MatchupResult = "neutral" | "hunter" | "resisted" | "immune";

export function resolveMatchup(
  moveType: FolkloreType,
  defenderType: FolkloreType,
  /** Rolled immunity target from the creature's trait, if any. */
  immunityTo?: FolkloreType,
): MatchupResult {
  if (immunityTo !== undefined && immunityTo === moveType) {
    return "immune";
  }
  if (HUNTER_CHART[moveType] === defenderType) {
    return "hunter";
  }
  if (HUNTER_CHART[defenderType] === moveType) {
    return "resisted";
  }
  return "neutral";
}

export function matchupMultiplier(matchup: MatchupResult): number {
  switch (matchup) {
    case "hunter":
      return HUNTER_MULTIPLIER;
    case "resisted":
      return RESIST_MULTIPLIER;
    case "immune":
      return 0;
    default:
      return 1;
  }
}
