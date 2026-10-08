/**
 * Finale card data prep (#393). Pure: turns the player's party into the
 * credits-card recap so layout code only draws.
 */
import { bondTier, bondTierName } from "../companions/bond";
import { getCreatureDefinition } from "../creatures/catalog";
import type { CreatureInstance } from "../creatures/types";
import { isRareVariant } from "../share/rareVariant";
import { SHARE_PARTY_LIMIT } from "../share/shareCode";
import { hasPresenceGrowth } from "../shrine/presence";

export const FINALE_TITLE = "Ivyward";
export const FINALE_TAGLINE = "Thanks for playing";
/** Recap slots on the card; matches the Companion Card party limit. */
export const FINALE_RECAP_LIMIT = SHARE_PARTY_LIMIT;

export type FinaleCompanion = {
  instanceId: string;
  definitionId: string;
  /** Nickname when set, else species name. */
  name: string;
  speciesName: string;
  level: number;
  evolved: boolean;
  presence: boolean;
  rare: boolean;
  bondName: string;
  /** 1..5, matching Companion Card hearts. */
  hearts: number;
};

export type FinaleRecap = {
  title: string;
  tagline: string;
  heading: string;
  companions: FinaleCompanion[];
  /** Party members beyond the recap limit ("+3 more"). */
  overflow: number;
  /** One-line journey summary, e.g. "5 companions · 2 grown · deepest bond: Kindred". */
  summary: string;
};

export type FinaleInput = {
  playerName: string | null | undefined;
  party: readonly CreatureInstance[];
};

function toCompanion(c: CreatureInstance): FinaleCompanion | null {
  let speciesName: string;
  try {
    speciesName = getCreatureDefinition(c.definitionId).name;
  } catch {
    return null;
  }
  const tier = bondTier(c.bond);
  return {
    instanceId: c.instanceId,
    definitionId: c.definitionId,
    name: c.nickname?.trim() || speciesName,
    speciesName,
    level: c.level,
    evolved: c.definitionId !== c.speciesId,
    presence: hasPresenceGrowth(c),
    rare: isRareVariant(c),
    bondName: bondTierName(tier),
    hearts: tier + 1,
  };
}

/** Lead = strongest bond, then highest level; original order breaks ties. */
function recapOrder(a: FinaleCompanion, b: FinaleCompanion): number {
  return b.hearts - a.hearts || b.level - a.level;
}

export function buildFinaleRecap(input: FinaleInput): FinaleRecap {
  const name = input.playerName?.trim();
  const all = input.party
    .map(toCompanion)
    .filter((c): c is FinaleCompanion => c !== null)
    .sort(recapOrder);
  const companions = all.slice(0, FINALE_RECAP_LIMIT);
  const grown = all.filter((c) => c.evolved || c.presence).length;
  const parts = [`${all.length} ${all.length === 1 ? "companion" : "companions"}`];
  if (grown > 0) {
    parts.push(`${grown} grown`);
  }
  if (all.length > 0) {
    parts.push(`deepest bond: ${all[0]!.bondName}`);
  }
  return {
    title: FINALE_TITLE,
    tagline: FINALE_TAGLINE,
    heading: name ? `${name} and companions` : "You and your companions",
    companions,
    overflow: Math.max(0, all.length - companions.length),
    summary: all.length > 0 ? parts.join(" · ") : "Your path is still open.",
  };
}

/** Instances (in recap order) to put on the shared Companion Card. */
export function finaleShareParty(
  recap: FinaleRecap,
  party: readonly CreatureInstance[],
): CreatureInstance[] {
  const byId = new Map(party.map((c) => [c.instanceId, c]));
  return recap.companions
    .map((c) => byId.get(c.instanceId))
    .filter((c): c is CreatureInstance => c !== undefined);
}
