import type { FolkloreType } from "../creatures/folkloreTypes";
import type { MoveDefinition } from "../creatures/types";

export type ShrineEffectType =
  | "attack-buff"
  | "health-buff"
  | "evolution"
  | "presence";

export type ShrineEffect = {
  creatureId: string;
  itemId: string;
  minLevel: number;
  effectType: ShrineEffectType;
  /** For attack buff: secondary element and bonus move (may be 5th slot). */
  secondaryElement?: FolkloreType;
  secondaryMove?: MoveDefinition;
  attackBonus?: number;
  /** For health buff: bonus max HP. */
  hpBonus?: number;
  /** For evolution: target creature definition id. */
  evolvesTo?: string;
};

/** Creature-specific item effects — data hooks for future pairs. */
export const SHRINE_EFFECTS: ShrineEffect[] = [
  {
    creatureId: "mossling",
    itemId: "ember-charm",
    minLevel: 3,
    effectType: "attack-buff",
    secondaryElement: "hearth",
    attackBonus: 4,
    secondaryMove: {
      id: "ember-lash",
      name: "Ember Lash",
      power: 9,
      type: "hearth",
      accuracy: 90,
    },
  },
  {
    creatureId: "ember-wisp",
    itemId: "moss-salve",
    minLevel: 3,
    effectType: "health-buff",
    hpBonus: 8,
  },
  {
    creatureId: "ember-wisp",
    itemId: "ember-charm",
    minLevel: 1,
    effectType: "evolution",
    evolvesTo: "hearthflame",
  },
  {
    creatureId: "mossling",
    itemId: "moss-salve",
    minLevel: 1,
    effectType: "evolution",
    evolvesTo: "bramblewarden",
  },
  {
    creatureId: "thunder-finch",
    itemId: "storm-charm",
    minLevel: 3,
    effectType: "presence",
  },
  {
    creatureId: "lantern-fox",
    itemId: "fox-fire-charm",
    minLevel: 3,
    effectType: "presence",
  },
  {
    creatureId: "peat-sprite",
    itemId: "fen-charm",
    minLevel: 3,
    effectType: "presence",
  },
  {
    creatureId: "brook-nymph",
    itemId: "nymph-charm",
    minLevel: 3,
    effectType: "presence",
  },
  {
    creatureId: "stone-hound",
    itemId: "hound-collar",
    minLevel: 3,
    effectType: "presence",
  },
];

export function getShrineEffect(
  creatureId: string,
  itemId: string,
): ShrineEffect | undefined {
  return SHRINE_EFFECTS.find(
    (e) => e.creatureId === creatureId && e.itemId === itemId,
  );
}

export function getEffectsForItem(itemId: string): ShrineEffect[] {
  return SHRINE_EFFECTS.filter((e) => e.itemId === itemId);
}

export function hasAppliedEffect(
  creature: { appliedEffects?: string[] },
  effectKey: string,
): boolean {
  return creature.appliedEffects?.includes(effectKey) ?? false;
}

export function effectKey(creatureId: string, itemId: string): string {
  return `${creatureId}:${itemId}`;
}
