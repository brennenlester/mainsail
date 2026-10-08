/**
 * Growth unlock reveal data (#393). Captured by `applyShrineFusion` around the
 * party mutation so EvolutionScene only animates — the save never depends on
 * the cutscene finishing.
 */
import { bondTier, bondTierName } from "../companions/bond";
import { getCreatureDefinition } from "../creatures/catalog";
import { getEffectiveAttack, getEffectiveMaxHp } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";

export type GrowthKind = "evolution" | "presence";

/** What a creature looked like on one side of the growth. */
export type GrowthSide = {
  definitionId: string;
  name: string;
  maxHp: number;
  attack: number;
  moves: string[];
};

export type GrowthStatLine = { label: string; before: number; after: number };

export type GrowthReveal = {
  kind: GrowthKind;
  instanceId: string;
  level: number;
  before: GrowthSide;
  after: GrowthSide;
  /** Changed stats only. */
  stats: GrowthStatLine[];
  /** Move names the after form has that the before form did not. */
  newMoves: string[];
  bondName: string;
  /** 1..5 hearts (tier + 1), matching the Companion Card. */
  bondHearts: number;
  /** No party member had evolved before this one (drives the share nudge). */
  firstEvolution: boolean;
};

export function captureGrowthSide(creature: CreatureInstance): GrowthSide {
  const def = getCreatureDefinition(creature.definitionId);
  const moves = def.moves.map((m) => m.name);
  if (creature.secondaryMove && !moves.includes(creature.secondaryMove.name)) {
    moves.push(creature.secondaryMove.name);
  }
  return {
    definitionId: creature.definitionId,
    // Species names, not nicknames: "Fern → Fern" would hide the growth.
    name: def.name,
    maxHp: getEffectiveMaxHp(creature),
    attack: getEffectiveAttack(creature),
    moves,
  };
}

/** True when nobody in the party has evolved yet (call before applying). */
export function isFirstEvolution(
  party: readonly Pick<CreatureInstance, "definitionId" | "speciesId">[],
): boolean {
  return party.every((c) => c.definitionId === c.speciesId);
}

export function buildGrowthReveal(input: {
  kind: GrowthKind;
  instanceId: string;
  level: number;
  before: GrowthSide;
  after: GrowthSide;
  bond: number | undefined;
  firstEvolution: boolean;
}): GrowthReveal {
  const { before, after } = input;
  const stats: GrowthStatLine[] = [
    { label: "Max HP", before: before.maxHp, after: after.maxHp },
    { label: "Attack", before: before.attack, after: after.attack },
  ].filter((line) => line.before !== line.after);
  const tier = bondTier(input.bond);
  return {
    kind: input.kind,
    instanceId: input.instanceId,
    level: input.level,
    before,
    after,
    stats,
    newMoves: after.moves.filter((m) => !before.moves.includes(m)),
    bondName: bondTierName(tier),
    bondHearts: tier + 1,
    firstEvolution: input.kind === "evolution" && input.firstEvolution,
  };
}

/** Name card headline: "Mossling → Bramblewarden" or "Lantern Fox". */
export function growthHeadline(reveal: GrowthReveal): string {
  return reveal.kind === "evolution"
    ? `${reveal.before.name} → ${reveal.after.name}`
    : reveal.after.name;
}

export function growthSubtitle(reveal: GrowthReveal): string {
  return reveal.kind === "evolution"
    ? "grew at the Moon Shrine"
    : "found a new presence in the world";
}

/** "Unlocked" summary rows, short enough for a phone-width panel. */
export function growthSummaryLines(reveal: GrowthReveal): string[] {
  const lines = reveal.stats.map(
    (s) => `${s.label} ${s.before} → ${s.after}`,
  );
  if (reveal.newMoves.length > 0) {
    lines.push(`New moves: ${reveal.newMoves.join(", ")}`);
  }
  if (reveal.kind === "presence") {
    lines.push("Overworld: shimmering moon presence");
  }
  lines.push(`Bond: ${reveal.bondName} ${"♥".repeat(reveal.bondHearts)}`);
  return lines;
}
