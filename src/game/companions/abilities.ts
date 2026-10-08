/**
 * Overworld companion abilities (#367). Pure eligibility + site data; the
 * Phaser side lives in `overworldCompanions.ts`.
 */
import { getCreatureDefinition } from "../creatures/catalog";
import type { FolkloreType } from "../creatures/folkloreTypes";
import type { CreatureInstance } from "../creatures/types";
import type { PropKind } from "../world/zoneProps";
import type { ZoneId } from "../world/zoneTypes";

export type AbilityId = "burn" | "ford" | "sense";

export type AbilityDefinition = {
  id: AbilityId;
  label: string;
  /** Types that can perform it (primary or shrine secondary element). */
  types: readonly FolkloreType[];
  /** Shown when nobody in the active party can do it. */
  needHint: string;
  /** Verb phrase used in the prompt: "Press E — Mossling: <verb>". */
  verb: string;
  cooldownMs: number;
};

export const ABILITIES: Readonly<Record<AbilityId, AbilityDefinition>> = {
  burn: {
    id: "burn",
    label: "Burn",
    types: ["ember", "hearth"],
    needHint: "Dry brush. An ember or hearth companion could burn it away.",
    verb: "burn the brush",
    cooldownMs: 4000,
  },
  ford: {
    id: "ford",
    label: "Ford",
    types: ["water"],
    needHint: "Shallow water. A water companion could carry you across.",
    verb: "ford the shallows",
    cooldownMs: 1500,
  },
  sense: {
    id: "sense",
    label: "Sense",
    types: ["woodland", "fen"],
    needHint: "Something rustles here. A woodland or fen companion could find it.",
    verb: "sniff out the hidden node",
    cooldownMs: 4000,
  },
};

/** True when this creature (current form or shrine element) can use the ability. */
export function canUseAbility(
  creature: Pick<CreatureInstance, "definitionId" | "secondaryElement" | "currentHp">,
  ability: AbilityId,
): boolean {
  if (creature.currentHp <= 0) {
    return false;
  }
  const types = ABILITIES[ability].types;
  const primary = getCreatureDefinition(creature.definitionId).folkloreType;
  return (
    types.includes(primary) ||
    (creature.secondaryElement !== undefined && types.includes(creature.secondaryElement))
  );
}

/** First active creature (party order) able to perform the ability. */
export function findAbilityUser(
  actives: readonly CreatureInstance[],
  ability: AbilityId,
): CreatureInstance | undefined {
  return actives.find((creature) => canUseAbility(creature, ability));
}

export type SiteReward = { materials: Record<string, number> };

export type CompanionSite = {
  id: string;
  zoneId: ZoneId;
  ability: AbilityId;
  /** Interaction tile (brush / glimmer / shore tile for ford). */
  x: number;
  y: number;
  /** Stash reward granted when the site is resolved (ford: on the islet). */
  reward: SiteReward;
  /** Ford: islet landing tile. */
  landing?: { x: number; y: number };
  /** Ford: stash tile on the islet. */
  stash?: { x: number; y: number };
  /** Sense: gather prop that appears once revealed. */
  revealsProp?: PropKind;
};

/**
 * Optional companion sites. All sit off the main-quest path: corners of
 * existing zones and two islets in the Folklore Fields south bay.
 */
export const COMPANION_SITES: readonly CompanionSite[] = [
  {
    id: "fields-brush",
    zoneId: "overworld",
    ability: "burn",
    x: 2,
    y: 2,
    reward: { materials: { wood: 4, "ember-ash": 2, "folklore-dust": 3 } },
  },
  {
    id: "emberfen-brush",
    zoneId: "emberfen",
    ability: "burn",
    x: 9,
    y: 9,
    reward: { materials: { "cinder-scale": 2, "peat-tuft": 2, "folklore-dust": 4 } },
  },
  {
    id: "fields-west-islet",
    zoneId: "overworld",
    ability: "ford",
    x: 2,
    y: 12,
    landing: { x: 2, y: 14 },
    stash: { x: 3, y: 14 },
    reward: { materials: { "brook-pearl": 3, pebble: 4, "folklore-dust": 3 } },
  },
  {
    id: "fields-east-islet",
    zoneId: "overworld",
    ability: "ford",
    x: 12,
    y: 12,
    landing: { x: 12, y: 14 },
    stash: { x: 11, y: 14 },
    reward: { materials: { "storm-feather": 2, stone: 4, "folklore-dust": 3 } },
  },
  {
    id: "grove-hidden-fern",
    zoneId: "grove",
    ability: "sense",
    x: 8,
    y: 8,
    revealsProp: "fern",
    reward: { materials: { "moss-fiber": 3, "wild-fiber": 3 } },
  },
  {
    id: "mistwood-hidden-stone",
    zoneId: "mistwood",
    ability: "sense",
    x: 10,
    y: 10,
    revealsProp: "standing-stone",
    reward: { materials: { "mist-shard": 2, stone: 3, "folklore-dust": 3 } },
  },
];

const SITE_IDS = new Set(COMPANION_SITES.map((site) => site.id));

export function isCompanionSiteId(value: unknown): value is string {
  return typeof value === "string" && SITE_IDS.has(value);
}

export function getCompanionSite(id: string): CompanionSite | undefined {
  return COMPANION_SITES.find((site) => site.id === id);
}

export function sitesInZone(zoneId: ZoneId): CompanionSite[] {
  return COMPANION_SITES.filter((site) => site.zoneId === zoneId);
}

/** Islet tiles (landing + stash) that ford sites carve out of the water. */
export function isletTiles(zoneId: ZoneId): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (const site of sitesInZone(zoneId)) {
    if (site.landing) tiles.push(site.landing);
    if (site.stash) tiles.push(site.stash);
  }
  return tiles;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export type SiteInteraction =
  | { kind: "use"; site: CompanionSite }
  | { kind: "ford-back"; site: CompanionSite }
  | { kind: "stash"; site: CompanionSite };

/**
 * What E would do at this tile. `claimed` = resolved site ids. Ford sites stay
 * usable after the stash is taken so the player can always get off the islet.
 */
export function findSiteInteraction(
  zoneId: ZoneId,
  tileX: number,
  tileY: number,
  claimed: ReadonlySet<string>,
): SiteInteraction | undefined {
  for (const site of sitesInZone(zoneId)) {
    if (site.ability === "ford" && site.landing && site.stash) {
      const onIslet =
        chebyshev(tileX, tileY, site.landing.x, site.landing.y) === 0 ||
        chebyshev(tileX, tileY, site.stash.x, site.stash.y) === 0;
      if (onIslet) {
        if (!claimed.has(site.id) && chebyshev(tileX, tileY, site.stash.x, site.stash.y) <= 1) {
          return { kind: "stash", site };
        }
        return { kind: "ford-back", site };
      }
      if (chebyshev(tileX, tileY, site.x, site.y) <= 1 && tileY <= site.y) {
        return { kind: "use", site };
      }
      continue;
    }
    if (claimed.has(site.id)) {
      continue;
    }
    if (chebyshev(tileX, tileY, site.x, site.y) <= 1) {
      return { kind: "use", site };
    }
  }
  return undefined;
}

/**
 * Whether an ability site's hint should give way: with no companion able to
 * act, a nearby gather node keeps the prompt and the E press.
 */
export function siteHintYields(hasAbleCompanion: boolean, gatherNearby: boolean): boolean {
  return !hasAbleCompanion && gatherNearby;
}

/**
 * Ability bond is paid once per site, on the claim: burn/sense claim on use,
 * ford claims when the islet stash opens. Re-fording an emptied islet pays
 * nothing, so bond can't be farmed on the 1.5s ford cooldown.
 */
export function grantsAbilityBond(
  hit: SiteInteraction,
  claimed: ReadonlySet<string>,
): boolean {
  if (claimed.has(hit.site.id)) return false;
  if (hit.kind === "stash") return true;
  return hit.kind === "use" && hit.site.ability !== "ford";
}

/**
 * Position to persist for a stand. Islets are only reachable by ford, and
 * pre-#367 builds read them as water, so saves record the ford shore instead
 * (rollback-safe); the islet itself is only re-entered via the ability.
 */
export function persistablePosition(
  zoneId: ZoneId,
  x: number,
  y: number,
): { x: number; y: number } {
  const tx = Math.round(x);
  const ty = Math.round(y);
  for (const site of sitesInZone(zoneId)) {
    const onIslet =
      (site.landing && site.landing.x === tx && site.landing.y === ty) ||
      (site.stash && site.stash.x === tx && site.stash.y === ty);
    if (onIslet) return { x: site.x, y: site.y };
  }
  return { x, y };
}

/** Sense sites already revealed become ordinary gather props. */
export function revealedSiteProps(
  zoneId: ZoneId,
  claimed: ReadonlySet<string>,
): { x: number; y: number; kind: PropKind }[] {
  return sitesInZone(zoneId)
    .filter((site) => site.revealsProp && claimed.has(site.id))
    .map((site) => ({ x: site.x, y: site.y, kind: site.revealsProp! }));
}

/** Nearest unresolved site within `radius` tiles (curious followers detour to it). */
export function nearestCuriousSpot(
  zoneId: ZoneId,
  tileX: number,
  tileY: number,
  claimed: ReadonlySet<string>,
  radius = 3,
): { x: number; y: number } | undefined {
  let best: { x: number; y: number; d: number } | undefined;
  for (const site of sitesInZone(zoneId)) {
    if (claimed.has(site.id)) continue;
    const d = chebyshev(tileX, tileY, site.x, site.y);
    if (d <= radius && (!best || d < best.d)) {
      best = { x: site.x, y: site.y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : undefined;
}
