import type { FolkloreType } from "../creatures/folkloreTypes";
import type { NpcGift } from "../world/npcs";
import type { StorySparId } from "./questTypes";

/**
 * Data for the scripted multi-round spars on the #369 main arc (rival + boss).
 * Rounds run as consecutive existing BattleScene spars via battle/storySpar.ts;
 * HP carries over between rounds. Tune here — no scene code needed.
 */
export type StorySparRound = {
  creatureId: string;
  /** Added to the party-average wild level for this round. */
  levelBonus: number;
  /**
   * Telegraph shown before this round starts (boss phase pattern). The first
   * round's telegraph is part of the challenge; later ones show between rounds.
   */
  telegraph?: string;
  /** Type the telegraph names as the counter (must hunt this round's creature). */
  counterType?: FolkloreType;
};

export type StorySparDefinition = {
  id: StorySparId;
  /** Speaker / NPC id used for the dialogue around the spar. */
  npcId: string;
  name: string;
  rounds: readonly StorySparRound[];
  /** Extra level on every round for repeat challenges (rival rematches). */
  rematchLevelBonus: number;
  /** Granted once, on the first win (the quest beat). */
  firstWinReward: readonly NpcGift[];
};

export const RIVAL_NPC_ID = "rival-wren";
export const BOSS_NPC_ID = "cinder-matriarch";

export const STORY_SPARS: Record<StorySparId, StorySparDefinition> = {
  "rival-wren": {
    id: "rival-wren",
    npcId: RIVAL_NPC_ID,
    name: "Wren",
    rounds: [
      { creatureId: "lantern-fox", levelBonus: 0 },
      { creatureId: "rootwalker", levelBonus: 1 },
    ],
    rematchLevelBonus: 1,
    firstWinReward: [{ kind: "item", id: "brook-tonic", amount: 2 }],
  },
  /**
   * Boss mechanic: a telegraphed form pattern. Each phase is announced (form +
   * the type that hunts it) before it rises, so the decision is who leads.
   * ponytail: per-turn intent comes from Battle v1 (#375) once merged; a fixed
   * per-phase move pattern can be wired into BattleScene intent after that.
   */
  "cinder-matriarch": {
    id: "cinder-matriarch",
    npcId: BOSS_NPC_ID,
    name: "Cinder Matriarch",
    rounds: [
      {
        creatureId: "peat-sprite",
        levelBonus: 1,
        telegraph:
          "The Matriarch sinks into the peat — Mire form (fen). Woodland hunts fen: lead with Mossling or Bramblewarden.",
        counterType: "woodland",
      },
      {
        creatureId: "cinder-toad",
        levelBonus: 2,
        telegraph:
          "Her back splits with embers — Cinder form (ember), and ember hunts woodland. Water hunts ember: swap in Brook Nymph, or Switch in the spar.",
        counterType: "water",
      },
    ],
    rematchLevelBonus: 0,
    firstWinReward: [
      { kind: "material", id: "folklore-dust", amount: 5 },
      { kind: "item", id: "moonwake-draught", amount: 1 },
    ],
  },
};

export function getStorySpar(id: StorySparId): StorySparDefinition {
  return STORY_SPARS[id];
}

/** Level for one round, scaled from the party average (never below 1). */
export function storySparRoundLevel(
  round: StorySparRound,
  partyAverage: number,
  rematch: boolean,
  rematchLevelBonus: number,
  maxLevel: number,
): number {
  const level =
    Math.round(partyAverage) + round.levelBonus + (rematch ? rematchLevelBonus : 0);
  return Math.min(maxLevel, Math.max(1, level));
}
