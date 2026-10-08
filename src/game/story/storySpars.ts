import type { FolkloreType } from "../creatures/folkloreTypes";
import type { MoveDefinition } from "../creatures/types";
import type { NpcGift } from "../world/npcs";
import type { StorySparId } from "./questTypes";

/**
 * Data for the main-arc story spars (#369, #385): Wren the rival and the
 * Cinder Matriarch boss. Each challenge is ONE BattleScene battle driven by
 * battle/boss/storyBattle.ts — Wren sends her creatures out one after another,
 * the Matriarch changes form inside the same fight. Tune here; the sim
 * (battle/boss/storyBattleSim.ts) pins the resulting win rates in tests.
 */
export type StorySparRound = {
  creatureId: string;
  /** Bespoke battle art (`creature-<id>` + `-battle`); species art when missing. */
  spriteKey?: string;
  /** Added to the party-average level for this creature. */
  levelBonus: number;
};

/** Pattern step: a move id from the form's kit. */
export type BossPatternStep = string;

export type BossForm = {
  id: string;
  /**
   * Bespoke art for this form (#392): `<key>` / `<key>-battle` atlas frames.
   * Falls back to the boss species art + `tint` until it exists.
   */
  spriteKey?: string;
  /** "Mire form" — shown on the boss bar and in the transformation banner. */
  label: string;
  type: FolkloreType;
  /** The type that hunts this form (the telegraph names it). */
  counterType: FolkloreType;
  /** Base stats before level scaling (HP is shared across forms). */
  attack: number;
  defense: number;
  kit: readonly MoveDefinition[];
  /** Fixed, readable intent cycle (move ids from `kit`). */
  pattern: readonly BossPatternStep[];
  /** Sprite tint for this form (null = untinted art). */
  tint: number | null;
  /** One line said when this form rises. */
  telegraph: string;
  /** The next form takes over when HP falls to this share of max HP. */
  transformAt?: number;
  /**
   * While Soaked, this form's moves hit as this type instead (her embers are
   * doused): the answer for a party her form hunts, via Wren's Drench or
   * your own Splash.
   */
  dousedType?: FolkloreType;
};

export type BossDefinition = {
  /** Species whose art the boss wears. */
  spriteCreatureId: string;
  levelBonus: number;
  baseHp: number;
  /** One HP pool for every form: base HP × this. */
  hpMult: number;
  /** Outgoing damage multiplier (like WILD_DAMAGE_SCALE). */
  damageScale: number;
  /** Move id of the telegraphed signature (Guard parries it and staggers her). */
  signatureId: string;
  /** Move id of the harmless wind-up that announces the signature. */
  chargeId: string;
  /** Damage-taken multiplier while staggered (after a parried signature). */
  staggerExposure: number;
  forms: readonly BossForm[];
};

/** Wren fights alongside you in the boss battle: one support action every `every` foe turns. */
export type StoryAssist = {
  name: string;
  every: number;
  /** Faster cadence while the boss's form hunts your lead (she drenches it). */
  huntedEvery: number;
  /** Heal share of the active companion's max HP when it is hurt. */
  healFraction: number;
  /** Heal share that comes with a status cleanse. */
  cleanseHealFraction: number;
  /** Below this HP share the assist heals instead of harrying the boss. */
  healBelow: number;
};

export type ChallengerScale = { hp: number; damage: number };

/**
 * Hearth Ward (#385 review): after `after` real losses in a row on this
 * challenge, the opposition's HP and damage are multiplied by `scale`. Cheap
 * catch-up for casual play; a first attempt is never softened.
 */
export type HearthWardStep = { after: number; scale: number };

export type StorySparDefinition = {
  id: StorySparId;
  /** Speaker / NPC id used for the dialogue around the spar. */
  npcId: string;
  name: string;
  /** Battle title (never "Training Spar"). */
  title: string;
  /** Battle theme: music loop + VS banner + arena. */
  theme: "rival" | "boss";
  /** Opponent creatures in order (rival). Empty for the boss. */
  rounds: readonly StorySparRound[];
  /** Rematches add these creatures after the usual roster. */
  rematchRounds: readonly StorySparRound[];
  /** Extra level on every creature for repeat challenges (rival rematches). */
  rematchLevelBonus: number;
  /**
   * The opposition rises to meet every challenger: HP and damage multipliers
   * by the number of standing companions at battle start (index 0 = one,
   * capped at the last entry). Bigger parties still win more often; they just
   * do not trivialize the arc (#369 sim finding: 96-100% for 2+ companions).
   */
  challengerScale: readonly ChallengerScale[];
  /** Rematches bring more creatures, so they scale on their own table. */
  rematchChallengerScale?: readonly ChallengerScale[];
  /** Catch-up steps by losses in a row (ascending `after`). */
  hearthWard: readonly HearthWardStep[];
  boss?: BossDefinition;
  assist?: StoryAssist;
  /** Granted once, on the first win (the quest beat). */
  firstWinReward: readonly NpcGift[];
  /**
   * Type coverage for what comes next (#385 playtest: a woodland-only party
   * hit a wall at Cinder form). On the first win — or later, from Wren's tip
   * — this companion joins if no party creature has `type` yet.
   */
  coverageGift?: { type: FolkloreType; creatureId: string; nickname: string };
};

export const RIVAL_NPC_ID = "rival-wren";
export const BOSS_NPC_ID = "cinder-matriarch";

const MIRE_KIT: readonly MoveDefinition[] = [
  { id: "peat-slam", name: "Peat Slam", power: 8, type: "fen", accuracy: 95, role: "attack", cooldown: 0 },
  { id: "bog-splash", name: "Bog Splash", power: 3, type: "fen", accuracy: 95, role: "status", cooldown: 2, inflicts: "soaked" },
  { id: "mire-hide", name: "Mire Hide", power: 0, type: "fen", accuracy: 100, role: "guard", cooldown: 2, heal: 0.04 },
  { id: "sinkhole", name: "Sinkhole", power: 14, type: "fen", accuracy: 90, role: "finisher", cooldown: 3 },
];

const CINDER_KIT: readonly MoveDefinition[] = [
  { id: "ember-lash", name: "Ember Lash", power: 9, type: "ember", accuracy: 95, role: "attack", cooldown: 0 },
  { id: "ash-cloud", name: "Ash Cloud", power: 4, type: "ember", accuracy: 95, role: "status", cooldown: 2, inflicts: "burn" },
  // Harmless wind-up: the second warning before the signature.
  { id: "gather-embers", name: "Gathering Embers", power: 0, type: "ember", accuracy: 100, role: "attack", cooldown: 0 },
  { id: "cinderfall", name: "Cinderfall", power: 26, type: "ember", accuracy: 100, role: "finisher", cooldown: 0 },
];

export const STORY_SPARS: Record<StorySparId, StorySparDefinition> = {
  "rival-wren": {
    id: "rival-wren",
    npcId: RIVAL_NPC_ID,
    name: "Wren",
    title: "Wren, the Rival",
    theme: "rival",
    rounds: [
      { creatureId: "lantern-fox", levelBonus: 0 },
      { creatureId: "rootwalker", levelBonus: 1 },
    ],
    // Rematch escalation: her storm finch joins, and everyone trained.
    rematchRounds: [{ creatureId: "thunder-finch", levelBonus: 0 }],
    rematchLevelBonus: 1,
    // #411: gentle for the first gate. The old ×1.55 / ×1.22 duo scale made a
    // second, weaker companion a liability at the real arrival level (Lv 4,
    // one evolved): a friend must always help. Sim bands in
    // storyBattleBalance.test.ts (arrival parties).
    challengerScale: [
      { hp: 1, damage: 1 },
      { hp: 1.2, damage: 1.04 },
      { hp: 1.4, damage: 1.1 },
    ],
    // #417: the rematch already brings a third creature (+50% foe HP pool) and
    // +1 level, so a duo meets plain x1 scaling: sim pressure (turns x damage
    // multiplier) is ~1.15-1.2x the first fight instead of ~1.35-1.5x, which
    // had dropped a casual duo from 97% to 23-41% (storyBattleBalance.test.ts).
    // A trio must never find it harder than a duo does (it was 31-44% vs 74-87%).
    rematchChallengerScale: [
      { hp: 1, damage: 1 },
      { hp: 1, damage: 1 },
      { hp: 1.1, damage: 1.03 },
    ],
    hearthWard: [
      { after: 2, scale: 0.85 },
      { after: 4, scale: 0.75 },
    ],
    firstWinReward: [{ kind: "item", id: "brook-tonic", amount: 2 }],
    coverageGift: { type: "water", creatureId: "brook-nymph", nickname: "Pip" },
  },
  /**
   * One battle, two forms. Mire form (fen) runs a fixed pattern; at half HP
   * the hit is clamped, she transforms (her turn), and Cinder form (ember)
   * opens with a harmless wind-up so you can swap leads. Cinderfall is the
   * telegraphed signature: Guard parries it and staggers her for a turn.
   */
  "cinder-matriarch": {
    id: "cinder-matriarch",
    npcId: BOSS_NPC_ID,
    name: "Cinder Matriarch",
    title: "Cinder Matriarch",
    theme: "boss",
    rounds: [],
    rematchRounds: [],
    rematchLevelBonus: 0,
    hearthWard: [
      { after: 2, scale: 0.85 },
      { after: 4, scale: 0.75 },
    ],
    challengerScale: [
      { hp: 1, damage: 1 },
      { hp: 1.6, damage: 1.15 },
      { hp: 1.85, damage: 1.17 },
    ],
    boss: {
      spriteCreatureId: "cinder-toad",
      levelBonus: 1,
      baseHp: 30,
      hpMult: 3.4,
      damageScale: 1.45,
      signatureId: "cinderfall",
      chargeId: "gather-embers",
      staggerExposure: 1.6,
      forms: [
        {
          id: "mire",
          spriteKey: "creature-cinder-matriarch",
          label: "Mire form",
          type: "fen",
          counterType: "woodland",
          attack: 8,
          defense: 6,
          kit: MIRE_KIT,
          pattern: ["peat-slam", "bog-splash", "peat-slam", "sinkhole", "mire-hide"],
          tint: 0x8a7a5a,
          telegraph:
            "Mire form (fen) first. Woodland hunts fen: lead with Mossling or Bramblewarden.",
          transformAt: 0.5,
        },
        {
          id: "cinder",
          spriteKey: "creature-cinder-matriarch-phase2",
          label: "Cinder form",
          type: "ember",
          counterType: "water",
          attack: 9,
          defense: 5,
          kit: CINDER_KIT,
          pattern: ["gather-embers", "cinderfall", "ember-lash", "ash-cloud"],
          dousedType: "hearth",
          tint: null,
          telegraph:
            "Cinder form (ember) hunts woodland. Water hunts ember: swap in while she gathers. Soaked, her embers are doused. Guard the turn AFTER she gathers.",
        },
      ],
    },
    assist: {
      name: "Wren",
      every: 3,
      huntedEvery: 2,
      healFraction: 0.2,
      cleanseHealFraction: 0.1,
      healBelow: 0.6,
    },
    firstWinReward: [{ kind: "item", id: "moonwake-draught", amount: 1 }],
  },
};

/** Ward multiplier for `losses` real losses in a row (1 = no ward). */
export function hearthWardScale(def: StorySparDefinition, losses: number): number {
  let scale = 1;
  for (const step of def.hearthWard) {
    if (losses >= step.after) {
      scale = step.scale;
    }
  }
  return scale;
}

/**
 * More real losses before the ward's next, stronger step (null when the ward
 * is already at its last step). Drives the battle hint (#399).
 */
export function hearthWardTriesToNext(def: StorySparDefinition, losses: number): number | null {
  const next = def.hearthWard.find((step) => step.after > losses);
  return next ? next.after - losses : null;
}

/** Scale for a party of `size` standing companions (1 when the table is empty). */
export function challengerScaleFor(
  def: StorySparDefinition,
  size: number,
  rematch = false,
): ChallengerScale {
  const table = (rematch ? def.rematchChallengerScale : undefined) ?? def.challengerScale;
  const index = Math.min(table.length, Math.max(1, Math.floor(size))) - 1;
  return table[index] ?? { hp: 1, damage: 1 };
}

export function getStorySpar(id: StorySparId): StorySparDefinition {
  return STORY_SPARS[id];
}

/** Opponent roster for this challenge (rematches add the escalation creatures). */
export function storySparRoster(
  def: StorySparDefinition,
  rematch: boolean,
): readonly StorySparRound[] {
  return rematch ? [...def.rounds, ...def.rematchRounds] : def.rounds;
}

/** Level for one opponent, scaled from the party average (never below 1). */
export function storySparRoundLevel(
  round: Pick<StorySparRound, "levelBonus">,
  partyAverage: number,
  rematch: boolean,
  rematchLevelBonus: number,
  maxLevel: number,
): number {
  const level =
    Math.round(partyAverage) + round.levelBonus + (rematch ? rematchLevelBonus : 0);
  return Math.min(maxLevel, Math.max(1, level));
}

/** Every species this challenge puts on the field (codex discovery before the snapshot). */
export function storySparSpecies(def: StorySparDefinition, rematch: boolean): string[] {
  const ids = storySparRoster(def, rematch).map((r) => r.creatureId);
  if (def.boss) {
    ids.push(def.boss.spriteCreatureId);
  }
  return [...new Set(ids)];
}

/** The Cinderling: the Matriarch's ember egg hatches at the Moon Shrine (beat 8). */
export const FINALE_HATCHLING = {
  creatureId: "cinder-toad",
  nickname: "Cinderling",
  /** The Matriarch's spark: a signature buff on its finisher. */
  trait: { kind: "damage-buff", moveId: "ember-spit", multiplier: 1.25 },
} as const;
