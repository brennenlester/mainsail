import { FOLKLORE_TYPES, HUNTER_CHART, type FolkloreType } from "../creatures/folkloreTypes";
import type { MoveDefinition } from "../creatures/types";
import { deriveKit } from "../battle/kits";
import type { BossForm, StoryBattleDefinition } from "../story/storySpars";
import { ECLIPSE_BOSS_CREATURE, type TrialBossPlan } from "./trialPlan";

/**
 * The Eclipse Shade (#420): round 5 of every trial, on the existing boss
 * framework (battle/boss/storyBattle.ts). Two forms whose types come from
 * the day's seed. Form one runs a readable pattern; at half HP she sheds it,
 * and the second form telegraphs Umbral Eclipse (charge, then the
 * signature): Guard on the signature turn parries it and staggers her.
 * Wears the Eclipse Sovereign art, violet then ember-tinted.
 */

export const ECLIPSE_BOSS_ID = "eclipse-shade";
export const ECLIPSE_SIGNATURE_ID = "umbral-eclipse";
export const ECLIPSE_CHARGE_ID = "gathering-dark";

/**
 * Tuned with trialSim (trialBalance.test.ts). #426: the HP floor in
 * trialBattle.ts makes her pool ~1.5x larger, so she hits softer and a
 * parry punishes harder.
 */
export const ECLIPSE_BOSS_TUNING = {
  baseHp: 30,
  hpMult: 1.2,
  damageScale: 0.8,
  attack: [8, 9] as const,
  defense: [6, 5] as const,
  signaturePower: 20,
  staggerExposure: 1.5,
};

/** HP / damage by standing companions at the start of the boss round. */
export const ECLIPSE_CHALLENGER_SCALE = [
  { hp: 1, damage: 1 },
  { hp: 1.35, damage: 1.08 },
  { hp: 1.6, damage: 1.12 },
  { hp: 1.8, damage: 1.15 },
] as const;

const TYPE_LABEL: Readonly<Record<FolkloreType, string>> = {
  woodland: "Woodland",
  ember: "Ember",
  water: "Water",
  earth: "Earth",
  mist: "Mist",
  storm: "Storm",
  hearth: "Hearth",
  twilight: "Twilight",
  fen: "Fen",
  "will-o-wisp": "Will-o-wisp",
};

/** The type that hunts `type` (every type has exactly one). */
export function counterTypeOf(type: FolkloreType): FolkloreType {
  return FOLKLORE_TYPES.find((t) => HUNTER_CHART[t] === type) ?? type;
}

export function typeLabel(type: FolkloreType): string {
  return TYPE_LABEL[type];
}

/** Attack / guard / status / finisher kit for one form, from the shared kit rules. */
function formKit(type: FolkloreType, signature: boolean): MoveDefinition[] {
  const [attack, guard, status, finisher] = deriveKit({
    id: `eclipse-${type}`,
    folkloreType: type,
    moves: [
      { id: `shade-${type}-lash`, name: "Shade Lash", power: 8, type, accuracy: 95 },
      { id: `shade-${type}-fall`, name: "Nightfall", power: 12, type, accuracy: 90 },
    ],
  });
  if (!signature) {
    return [attack!, guard!, status!, finisher!];
  }
  return [
    attack!,
    status!,
    // Harmless wind-up: the second warning before the signature.
    { id: ECLIPSE_CHARGE_ID, name: "Gathering Dark", power: 0, type, accuracy: 100, role: "attack", cooldown: 0 },
    {
      id: ECLIPSE_SIGNATURE_ID,
      name: "Umbral Eclipse",
      power: ECLIPSE_BOSS_TUNING.signaturePower,
      type,
      accuracy: 100,
      role: "finisher",
      cooldown: 0,
    },
  ];
}

export function buildEclipseBossDef(plan: TrialBossPlan): StoryBattleDefinition {
  const [firstType, secondType] = plan.formTypes;
  const first = formKit(firstType, false);
  const second = formKit(secondType, true);
  const forms: BossForm[] = [
    {
      id: "waxing",
      label: "Waxing Shade",
      type: firstType,
      counterType: counterTypeOf(firstType),
      attack: ECLIPSE_BOSS_TUNING.attack[0],
      defense: ECLIPSE_BOSS_TUNING.defense[0],
      kit: first,
      pattern: [first[0]!.id, first[2]!.id, first[0]!.id, first[3]!.id, first[1]!.id],
      tint: 0xc8a8ff,
      telegraph: `Waxing Shade (${typeLabel(firstType)}). ${typeLabel(counterTypeOf(firstType))} hunts it.`,
      transformAt: 0.5,
    },
    {
      id: "total",
      label: "Total Eclipse",
      type: secondType,
      counterType: counterTypeOf(secondType),
      attack: ECLIPSE_BOSS_TUNING.attack[1],
      defense: ECLIPSE_BOSS_TUNING.defense[1],
      kit: second,
      pattern: [ECLIPSE_CHARGE_ID, ECLIPSE_SIGNATURE_ID, second[0]!.id, second[1]!.id],
      tint: 0xffb080,
      telegraph: `Total Eclipse (${typeLabel(secondType)}). ${typeLabel(counterTypeOf(secondType))} hunts it. Guard the turn AFTER she gathers the dark.`,
    },
  ];
  return {
    id: ECLIPSE_BOSS_ID,
    name: "Eclipse Shade",
    title: "The Eclipse Shade",
    theme: "boss",
    arena: "night",
    rounds: [],
    rematchRounds: [],
    rematchLevelBonus: 0,
    challengerScale: ECLIPSE_CHALLENGER_SCALE,
    boss: {
      spriteCreatureId: ECLIPSE_BOSS_CREATURE,
      // The round plan already adds the trial's level bonus.
      levelBonus: 0,
      baseHp: ECLIPSE_BOSS_TUNING.baseHp,
      hpMult: ECLIPSE_BOSS_TUNING.hpMult,
      damageScale: ECLIPSE_BOSS_TUNING.damageScale,
      signatureId: ECLIPSE_SIGNATURE_ID,
      chargeId: ECLIPSE_CHARGE_ID,
      staggerExposure: ECLIPSE_BOSS_TUNING.staggerExposure,
      forms,
    },
  };
}
