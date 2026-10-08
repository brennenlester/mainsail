import { displayName } from "../creatures/displayName";
import {
  getCreatureInstance,
  getEffectiveMaxHp,
  playerParty,
} from "../creatures/party";
import { consumeItem, getItemCount } from "../inventory/playerInventory";
import { grantFlatLevel, MAX_LEVEL } from "../progression/leveling";
import { refreshPartyStatusLine } from "../ui/statusPanel";

export type ConsumableEffectType = "heal" | "revive" | "level";

type HpConsumableDefinition = {
  itemId: string;
  effectType: "heal" | "revive";
  /** Fraction of effective max HP restored or revived to. */
  hpFraction: number;
};

type LevelConsumableDefinition = {
  itemId: string;
  effectType: "level";
  itemCost: number;
};

export type ConsumableDefinition =
  | HpConsumableDefinition
  | LevelConsumableDefinition;

export const CONSUMABLE_ITEMS: ConsumableDefinition[] = [
  { itemId: "brook-tonic", effectType: "heal", hpFraction: 0.5 },
  { itemId: "moonwake-draught", effectType: "revive", hpFraction: 0.5 },
  { itemId: "brook-crystal", effectType: "level", itemCost: 2 },
];

export const FUSION_ITEM_IDS = [
  "sovereign-seal",
  "ember-charm",
  "moss-salve",
  "storm-charm",
  "fox-fire-charm",
  "fen-charm",
  "nymph-charm",
  "hound-collar",
] as const;

export const CONSUMABLE_ITEM_IDS = CONSUMABLE_ITEMS.map((c) => c.itemId);

const byItemId = new Map(CONSUMABLE_ITEMS.map((c) => [c.itemId, c]));

export function getConsumable(itemId: string): ConsumableDefinition | undefined {
  return byItemId.get(itemId);
}

export function isConsumableItem(itemId: string): boolean {
  return byItemId.has(itemId);
}

export type ConsumableResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function canUseConsumableOn(
  creature: { currentHp: number; level: number },
  consumable: ConsumableDefinition,
  maxHp: number,
): boolean {
  if (consumable.effectType === "heal") {
    return creature.currentHp > 0 && creature.currentHp < maxHp;
  }
  if (consumable.effectType === "revive") {
    return creature.currentHp <= 0;
  }
  return creature.level < MAX_LEVEL;
}

export function applyConsumable(
  instanceId: string,
  itemId: string,
): ConsumableResult {
  const consumable = getConsumable(itemId);
  if (!consumable) {
    return { ok: false, message: "That item cannot be used here." };
  }

  const creature = getCreatureInstance(instanceId);
  if (!creature) {
    return { ok: false, message: "Creature not found." };
  }

  const maxHp = getEffectiveMaxHp(creature);
  if (!canUseConsumableOn(creature, consumable, maxHp)) {
    if (consumable.effectType === "heal") {
      if (creature.currentHp <= 0) {
        return { ok: false, message: "Cannot heal a fainted creature." };
      }
      return { ok: false, message: "Creature is already at full health." };
    }
    if (consumable.effectType === "revive") {
      return { ok: false, message: "Creature is not fainted." };
    }
    return {
      ok: false,
      message: `${displayName(creature)} is already at max level ${MAX_LEVEL}.`,
    };
  }

  const itemCost = consumable.effectType === "level" ? consumable.itemCost : 1;
  if (getItemCount(itemId) < itemCost) {
    return consumable.effectType === "level"
      ? { ok: false, message: "You need 2 Brook Crystals." }
      : { ok: false, message: "You don't have that item." };
  }
  if (!consumeItem(itemId, itemCost)) {
    return { ok: false, message: "Could not use that item." };
  }

  if (consumable.effectType === "level") {
    grantFlatLevel(creature);
    refreshPartyStatusLine();
    return {
      ok: true,
      message: `${displayName(creature)} reached Lv.${creature.level}.`,
    };
  }

  const amount = Math.max(1, Math.floor(maxHp * consumable.hpFraction));

  if (consumable.effectType === "heal") {
    const before = creature.currentHp;
    creature.currentHp = Math.min(maxHp, creature.currentHp + amount);
    const gained = creature.currentHp - before;
    refreshPartyStatusLine();
    return {
      ok: true,
      message: `${displayName(creature)} recovered ${gained} HP (${creature.currentHp}/${maxHp}).`,
    };
  }

  creature.currentHp = amount;
  refreshPartyStatusLine();
  return {
    ok: true,
    message: `${displayName(creature)} was revived (${creature.currentHp}/${maxHp} HP).`,
  };
}

export function getEligibleCreaturesForConsumable(itemId: string): {
  instanceId: string;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  eligible: boolean;
  reason?: string;
}[] {
  const consumable = getConsumable(itemId);
  if (!consumable) {
    return [];
  }

  return playerParty.creatures.map((creature) => {
    const maxHp = getEffectiveMaxHp(creature);
    const eligible = canUseConsumableOn(creature, consumable, maxHp);
    let reason: string | undefined;
    if (!eligible) {
      if (consumable.effectType === "heal") {
        reason =
          creature.currentHp <= 0
            ? "Fainted"
            : creature.currentHp >= maxHp
              ? "Full HP"
              : undefined;
      } else if (consumable.effectType === "revive") {
        reason = "Not fainted";
      } else {
        reason = `Max level ${MAX_LEVEL}`;
      }
    }
    return {
      instanceId: creature.instanceId,
      name: displayName(creature),
      level: creature.level,
      currentHp: creature.currentHp,
      maxHp,
      eligible,
      reason,
    };
  });
}
