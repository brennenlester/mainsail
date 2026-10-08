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
  /** Base species (rare look survives evolution). */
  speciesId: string;
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
    speciesId: c.speciesId ?? c.definitionId,
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

/** Finale card geometry in design px (the recap card is drawn on a square stage). */
export const FINALE_CELL_H = 150;
export const FINALE_CELL_GAP = 12;
/** Companions per row; more wrap to a second row. */
export const FINALE_ROW_LIMIT = 4;
/** Where the first cell row sits before centring (the header ends just above). */
const FINALE_CELLS_TOP = 166;
const FINALE_CONTENT_TOP = 38;

export type FinaleLayout = {
  rows: number;
  /** Everything (header included) shifts down by this much to centre the card. */
  dy: number;
  cellsTop: number;
  summaryY: number;
  buttonsY: number;
};

/**
 * Header + cells + summary + buttons are one block, centred vertically so a
 * small party leaves no empty band under the title (#409).
 */
export function planFinaleLayout(companionCount: number, stageSize: number): FinaleLayout {
  const rows = companionCount > FINALE_ROW_LIMIT ? 2 : 1;
  const cellsBottom = FINALE_CELLS_TOP + rows * FINALE_CELL_H + (rows - 1) * FINALE_CELL_GAP;
  const summaryY = cellsBottom + 26;
  const buttonsY = summaryY + 52;
  const contentBottom = buttonsY + 24;
  const dy = Math.max(0, Math.round((stageSize - (contentBottom - FINALE_CONTENT_TOP)) / 2 - FINALE_CONTENT_TOP));
  return {
    rows,
    dy,
    cellsTop: FINALE_CELLS_TOP + dy,
    summaryY: summaryY + dy,
    buttonsY: buttonsY + dy,
  };
}
