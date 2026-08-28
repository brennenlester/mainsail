import { getCreatureDefinition } from "../creatures/catalog";
import {
  getCreatureInstance,
  getEffectiveMaxHp,
  playerParty,
} from "../creatures/party";
import { consumeItem } from "../inventory/playerInventory";
import { recordQuestEvent } from "../story/questProgress";
import { isVisitorMode } from "../world/worldSession";
import {
  applyPresenceStatBoost,
  PRESENCE_ATTACK_BONUS,
  PRESENCE_HP_BONUS,
} from "./presence";
import {
  effectKey,
  getEffectsForItem,
  getShrineEffect,
  hasAppliedEffect,
  type ShrineEffect,
} from "./shrineEffects";

export type FusionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function applyShrineFusion(
  instanceId: string,
  itemId: string,
): FusionResult {
  if (isVisitorMode()) {
    return { ok: false, message: "Visitors cannot apply shrine effects." };
  }

  const creature = getCreatureInstance(instanceId);
  if (!creature) {
    return { ok: false, message: "Creature not found." };
  }

  const effect = getShrineEffect(creature.definitionId, itemId);
  if (!effect) {
    return {
      ok: false,
      message: "This item has no effect on that creature.",
    };
  }

  if (creature.level < effect.minLevel) {
    return {
      ok: false,
      message: `Requires level ${effect.minLevel} (currently Lv.${creature.level}).`,
    };
  }

  const key = effectKey(creature.definitionId, itemId);
  if (hasAppliedEffect(creature, key)) {
    return { ok: false, message: "This fusion was already applied." };
  }

  if (!consumeItem(itemId)) {
    return { ok: false, message: "You don't have that item." };
  }

  const message = applyEffect(creature, effect, key);
  if (effect.effectType === "evolution" && effect.evolvesTo) {
    recordQuestEvent({ type: "evolve_creature", evolvesTo: effect.evolvesTo });
  }
  return { ok: true, message };
}

function applyEffect(
  creature: NonNullable<ReturnType<typeof getCreatureInstance>>,
  effect: ShrineEffect,
  key: string,
): string {
  creature.appliedEffects = [...(creature.appliedEffects ?? []), key];

  switch (effect.effectType) {
    case "attack-buff": {
      creature.attackBonus = (creature.attackBonus ?? 0) + (effect.attackBonus ?? 0);
      creature.secondaryElement = effect.secondaryElement;
      creature.secondaryMove = effect.secondaryMove;
      const def = getCreatureDefinition(creature.definitionId);
      return `${def.name} gained ${effect.secondaryMove?.name ?? "a new attack"}!`;
    }
    case "health-buff": {
      const bonus = effect.hpBonus ?? 0;
      creature.hpBonus = (creature.hpBonus ?? 0) + bonus;
      creature.currentHp += bonus;
      const def = getCreatureDefinition(creature.definitionId);
      return `${def.name} gained +${bonus} max HP!`;
    }
    case "evolution": {
      if (!effect.evolvesTo) {
        return "Evolution failed.";
      }
      const prevName = getCreatureDefinition(creature.definitionId).name;
      const newDef = getCreatureDefinition(effect.evolvesTo);
      const oldMax = getEffectiveMaxHp(creature);
      const hpRatio = creature.currentHp / oldMax;

      creature.definitionId = effect.evolvesTo;
      creature.attackBonus = 0;
      creature.hpBonus = 0;
      creature.secondaryElement = undefined;
      creature.secondaryMove = undefined;

      const newMax = getEffectiveMaxHp(creature);
      creature.currentHp = Math.max(1, Math.round(newMax * hpRatio));
      return `${prevName} evolved into ${newDef.name}!`;
    }
    case "presence": {
      applyPresenceStatBoost(creature);
      const def = getCreatureDefinition(creature.definitionId);
      return `${def.name} shows a new presence in the world! (+${PRESENCE_ATTACK_BONUS} ATK, +${PRESENCE_HP_BONUS} HP)`;
    }
  }
}

export function getEligibleCreaturesForItem(itemId: string): {
  instanceId: string;
  name: string;
  level: number;
  eligible: boolean;
  reason?: string;
}[] {
  const effects = getEffectsForItem(itemId);
  if (effects.length === 0) {
    return [];
  }

  return playerParty.creatures
    .map((creature) => {
      const def = getCreatureDefinition(creature.definitionId);
      const effect = effects.find((e) => e.creatureId === creature.definitionId);
      if (!effect) {
        return null;
      }
      const key = effectKey(creature.definitionId, itemId);
      if (hasAppliedEffect(creature, key)) {
        return {
          instanceId: creature.instanceId,
          name: def.name,
          level: creature.level,
          eligible: false,
          reason: "Already applied",
        };
      }
      if (creature.level < effect.minLevel) {
        return {
          instanceId: creature.instanceId,
          name: def.name,
          level: creature.level,
          eligible: false,
          reason: `Need Lv.${effect.minLevel}`,
        };
      }
      return {
        instanceId: creature.instanceId,
        name: def.name,
        level: creature.level,
        eligible: true,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}
