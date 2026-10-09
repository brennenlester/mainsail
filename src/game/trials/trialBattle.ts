import type Phaser from "phaser";
import { getCreatureDefinition } from "../creatures/catalog";
import type { BattleCombatant, MoveDefinition, MoveRole, StatusId } from "../creatures/types";
import { scaledStat } from "../progression/leveling";
import {
  executeMove,
  primeOpeningCooldowns,
  WILD_DAMAGE_SCALE,
  type MoveResult,
} from "../battle/battleLogic";
import { getBattleKit, moveRole } from "../battle/kits";
import { applyStatus, type StatusApplyResult } from "../battle/statusEffects";
import { StoryBattle } from "../battle/boss/storyBattle";
import { KEEN_EDGE_DAMAGE, MOON_SHIELD_TAKEN, type BoonId } from "./boons";
import { combineModifiers, MOONFED_ROUND_CAP, type ModifierId } from "./modifiers";
import { buildEclipseBossDef } from "./trialBoss";
import type { TrialPlan, TrialRoundPlan } from "./trialPlan";

/**
 * One trial round's rules (#420), shared by BattleScene and the headless sim
 * (trialSim.ts) so the tuned numbers are the played numbers. No Phaser.
 *
 * - Regular rounds: one seeded foe, levelled off the party average plus the
 *   round's bonus, scaled for the number of standing companions.
 * - Boss round: a StoryBattle (forms, telegraphed signature, parry stagger)
 *   built from the day's boss plan.
 * - Modifiers / next-round boons act through a few hooks: player entry,
 *   foe start, the foe's turn (Twin Shadows echo, Moonfed regen) and the end
 *   of the player's turn (Pure Light).
 */

/**
 * Regular foes scale with the standing party (a 3-companion party faces a
 * sturdier foe). #429: HP x0.85 / damage x1.28 against #426 — same
 * difficulty in fewer turns (rounds 2-3 ran 11-25 turns in play).
 */
export const TRIAL_PARTY_SCALE: readonly { hp: number; damage: number }[] = [
  { hp: 0.94, damage: 1.34 },
  { hp: 1.33, damage: 1.66 },
  { hp: 1.56, damage: 1.75 },
  { hp: 1.73, damage: 1.82 },
  { hp: 1.87, damage: 1.88 },
];

/**
 * Rounds 1-2 tempo (#423): openers were 18-turn slogs of small hits, so foes
 * there hit harder. #426: the #423 HP cut (x0.75 / x0.85) overshot to ~7-turn
 * rounds and a ~5 minute trial. HP is back near full and the damage boost is
 * gone (with full HP it spiked early losses for non-starter parties), so the
 * openers run ~8 sim turns.
 */
export const EARLY_ROUND_TEMPO: readonly { hp: number; damage: number }[] = [
  { hp: 0.9, damage: 1 },
  { hp: 1, damage: 0.95 },
];

/**
 * Eclipse Shade HP floor (#426): her HP scales with the companions still
 * standing, so a lone survivor met a 40 HP Shade (20 per form) weaker than
 * round 3's foe. Her pool is now at least this many times round 3's foe HP
 * for the whole roster, however many are still standing. #429: 1.6 -> 1.4
 * (she hits ~10% harder instead) so the boss round stays inside the pace gate.
 */
export const ECLIPSE_HP_FLOOR = 1.4;

/**
 * Sudden death (#429): from the player's turn after this one, every further
 * turn of a round adds SUDDEN_DEATH_STEP to the foe's damage ("Eclipse
 * deepens"), so no round can stall however the matchup or modifiers fall.
 */
export const SUDDEN_DEATH_AFTER = 14;
export const SUDDEN_DEATH_STEP = 0.1;

export function trialPartyScale(size: number): { hp: number; damage: number } {
  const i = Math.min(TRIAL_PARTY_SCALE.length, Math.max(1, Math.floor(size))) - 1;
  return TRIAL_PARTY_SCALE[i]!;
}

/** A regular round foe's max HP before modifiers / party strength. */
export function regularFoeHp(creatureId: string, level: number, partySize: number, roundIndex: number): number {
  const tempo = EARLY_ROUND_TEMPO[roundIndex] ?? { hp: 1, damage: 1 };
  const hp = scaledStat(getCreatureDefinition(creatureId).maxHp, level) * trialPartyScale(partySize).hp * tempo.hp;
  return Math.max(1, Math.round(hp));
}

/**
 * Party strength (#420 review): a trial is tuned on evolved companions, so
 * an unevolved or non-starter party (~70% of their base HP x attack) faces
 * foes eased toward its own power. Species base stats only — level-free, so
 * the same party reads the same every day. 1 = evolved reference.
 */
export const STRENGTH_REFERENCE = ["bramblewarden", "hearthflame", "brook-nymph"] as const;
export const STRENGTH_FLOOR = 0.6;
/** Foe HP / damage ease = strength ^ these (tuned with trialSim). */
export const STRENGTH_EXP = { hp: 1.4, damage: 0.9 };

function basePower(id: string): number {
  const def = getCreatureDefinition(id);
  return Math.sqrt(def.maxHp * def.attack);
}

const REFERENCE_POWER = STRENGTH_REFERENCE.reduce((s, id) => s + basePower(id), 0) / STRENGTH_REFERENCE.length;

export function trialPartyStrength(speciesIds: readonly string[]): number {
  if (speciesIds.length === 0) {
    return 1;
  }
  const mean = speciesIds.reduce((s, id) => s + basePower(id), 0) / speciesIds.length;
  return Math.min(1, Math.max(STRENGTH_FLOOR, mean / REFERENCE_POWER));
}

export type TrialBattleContext = {
  plan: TrialPlan;
  round: TrialRoundPlan;
  /** Rounded active-party average level. */
  partyAverage: number;
  /** Standing companions when the round starts. */
  partySize: number;
  /** Active roster size, fainted included (boss HP floor). Default `partySize`. */
  rosterSize?: number;
  /** `trialPartyStrength` of the active party (default 1). */
  partyStrength?: number;
  /** Boons picked for this round (all but Mend, which acts at once). */
  boons: readonly BoonId[];
  maxLevel: number;
};

export type TrialRoundStats = {
  /** Player actions taken. */
  turns: number;
  /** Telegraphed finishers met with a raised guard. */
  parries: number;
};

/** The in-battle trial HUD BattleScene keeps (round pips, chips, score). */
export type TrialStrip = { refresh(): void; destroy(): void };

export class TrialBattle {
  readonly round: TrialRoundPlan;
  readonly modifiers: readonly ModifierId[];
  readonly boons: readonly BoonId[];
  /** Boss round controller (null for regular rounds). */
  readonly boss: StoryBattle | null;
  /** Regular foe (boss rounds read `boss.foe`). */
  private readonly regularFoe: BattleCombatant | null;
  readonly stats: TrialRoundStats = { turns: 0, parries: 0 };
  private readonly rules: ReturnType<typeof combineModifiers>;
  private foeTurns = 0;
  /** HP Moonfed has restored this round (capped at MOONFED_ROUND_CAP x max HP). */
  private regenHealed = 0;
  /** Foe damage scale before sudden death (captured on its first step). */
  private foeBaseDamage: number | null = null;
  private freeSwitches: number;
  private readonly strength: number;

  constructor(ctx: TrialBattleContext) {
    this.round = ctx.round;
    this.modifiers = ctx.round.modifiers;
    this.boons = ctx.boons;
    this.rules = combineModifiers(ctx.round.modifiers);
    this.strength = ctx.partyStrength ?? 1;
    this.freeSwitches = this.boons.includes("swift-swap") ? 2 : 1;
    const level = Math.min(ctx.maxLevel, Math.max(1, Math.round(ctx.partyAverage) + ctx.round.levelBonus));
    if (ctx.round.kind === "boss") {
      this.boss = new StoryBattle(buildEclipseBossDef(ctx.plan.boss), {
        partyAverage: level,
        partySize: ctx.partySize,
        rematch: false,
        maxLevel: ctx.maxLevel,
        bulk: this.rules.glassBulk,
      });
      this.regularFoe = null;
      this.decorateFoe(this.boss.foe, false);
      const floor = this.bossHpFloor(ctx);
      if (this.boss.foe.maxHp < floor) {
        this.boss.foe.maxHp = floor;
        this.boss.foe.currentHp = floor;
      }
    } else {
      this.boss = null;
      this.regularFoe = this.buildFoe(ctx.round.creatureId, level, ctx.partySize);
    }
  }

  get isBoss(): boolean {
    return this.boss !== null;
  }

  /**
   * `ECLIPSE_HP_FLOOR` x round 3's foe as it was built (its modifiers, this
   * party's strength) for the whole roster, so fainted companions cannot
   * shrink the Shade below the foe the party just beat.
   */
  private bossHpFloor(ctx: TrialBattleContext): number {
    const third = ctx.plan.rounds[2];
    if (!third || third.kind === "boss") {
      return 0;
    }
    const level = Math.min(ctx.maxLevel, Math.max(1, Math.round(ctx.partyAverage) + third.levelBonus));
    const size = Math.max(ctx.partySize, ctx.rosterSize ?? 0);
    const hp = regularFoeHp(third.creatureId, level, size, third.index) *
      combineModifiers(third.modifiers).foeHp *
      this.strength ** STRENGTH_EXP.hp;
    return Math.round(ECLIPSE_HP_FLOOR * hp);
  }

  /** The combatant on the other side right now. */
  get foe(): BattleCombatant {
    return this.boss ? this.boss.foe : this.regularFoe!;
  }

  get foeLevel(): number {
    return this.foe.level ?? 1;
  }

  /** Species whose art the foe wears. */
  get foeCreatureId(): string {
    return this.boss ? this.boss.spriteCreatureId : this.round.creatureId;
  }

  private buildFoe(creatureId: string, level: number, partySize: number): BattleCombatant {
    const def = getCreatureDefinition(creatureId);
    const scale = trialPartyScale(partySize);
    const tempo = EARLY_ROUND_TEMPO[this.round.index] ?? { hp: 1, damage: 1 };
    const maxHp = regularFoeHp(creatureId, level, partySize, this.round.index);
    const foe: BattleCombatant = primeOpeningCooldowns({
      name: def.name,
      level,
      maxHp,
      currentHp: maxHp,
      attack: scaledStat(def.attack, level),
      defense: def.defense,
      moves: getBattleKit(def),
      folkloreType: def.folkloreType,
      damageScale: WILD_DAMAGE_SCALE * scale.damage * tempo.damage,
      bulk: 1,
    });
    this.decorateFoe(foe, true);
    return foe;
  }

  /** Modifier stats on the foe (HP, damage, glass, finisher wind-up). */
  private decorateFoe(foe: BattleCombatant, regular: boolean): void {
    const r = this.rules;
    const hp = r.foeHp * this.strength ** STRENGTH_EXP.hp;
    if (hp !== 1) {
      foe.maxHp = Math.max(1, Math.round(foe.maxHp * hp));
      foe.currentHp = foe.maxHp;
    }
    foe.damageScale = (foe.damageScale ?? 1) * r.foeDamage * r.glassDamage * this.strength ** STRENGTH_EXP.damage;
    if (regular) {
      // The boss keeps its glass bulk through staggers via StoryBattle options.
      foe.bulk = (foe.bulk ?? 1) * r.glassBulk;
      if (r.finishersReady) {
        foe.cooldowns = {};
      }
    }
  }

  /**
   * Entry statuses on the foe as the round opens (call once, after the
   * battle is built). Returns what stuck, for the log.
   */
  startFoe(): StatusApplyResult[] {
    return this.rules.entryStatuses.map((id) => applyStatus(this.foe, id));
  }

  /**
   * A companion combatant was just built from a party member. Stats always
   * get the round's rules; `fresh` entrants (not back from the bench) also
   * get the entry statuses and the finisher rules.
   */
  decoratePlayer(player: BattleCombatant, fresh: boolean): StatusApplyResult[] {
    const r = this.rules;
    let damage = r.glassDamage;
    let bulk = r.glassBulk;
    if (this.boons.includes("keen-edge")) {
      damage *= KEEN_EDGE_DAMAGE;
    }
    if (this.boons.includes("moon-shield")) {
      bulk /= MOON_SHIELD_TAKEN;
    }
    player.damageScale = (player.damageScale ?? 1) * damage;
    player.bulk = (player.bulk ?? 1) * bulk;
    if (r.playerGuardTaken !== 1) {
      player.guardTakenScale = r.playerGuardTaken;
    }
    if (!fresh) {
      return [];
    }
    if (r.finishersReady || this.boons.includes("quickened")) {
      player.cooldowns = {};
    }
    if (this.boons.includes("pure-light")) {
      return [];
    }
    return r.entryStatuses.map((id) => applyStatus(player, id));
  }

  /** Free switches left this round (Swift Swap adds one). */
  get freeSwitchesLeft(): number {
    return this.freeSwitches;
  }

  /** Spend a free switch; true while another one remains. */
  takeFreeSwitch(): boolean {
    this.freeSwitches = Math.max(0, this.freeSwitches - 1);
    return this.freeSwitches > 0;
  }

  /** Every Nth foe turn echoes (Twin Shadows). Peek: the next foe turn. */
  get nextFoeTurnEchoes(): boolean {
    const every = this.rules.foeEchoEvery;
    return every !== null && (this.foeTurns + 1) % every === 0;
  }

  /** Turns until the next echo (null without Twin Shadows); 1 = this coming turn. */
  get echoIn(): number | null {
    const every = this.rules.foeEchoEvery;
    return every === null ? null : every - (this.foeTurns % every);
  }

  /**
   * After the foe resolved its telegraphed move: count the turn, and on an
   * echo turn strike again with its basic attack. Cooldowns are left as the
   * main move set them. Null when there is no echo.
   */
  afterFoeMove(
    foe: BattleCombatant,
    player: BattleCombatant,
    main: MoveDefinition,
    rng: () => number,
  ): MoveResult | null {
    const echo = this.nextFoeTurnEchoes;
    this.foeTurns += 1;
    if (!echo || main.power <= 0 || moveRole(main) === "guard" || foe.currentHp <= 0 || player.currentHp <= 0) {
      return null;
    }
    const move = foe.moves.find((m) => moveRole(m) === "attack" && m.power > 0);
    if (!move) {
      return null;
    }
    const cooldowns = { ...(foe.cooldowns ?? {}) };
    const result = executeMove(foe, move, player, rng);
    foe.cooldowns = cooldowns;
    return result;
  }

  /** End of the foe's turn: Moonfed regen, up to its per-round cap. Returns HP restored. */
  foeEndTurn(foe: BattleCombatant): number {
    if (this.rules.foeRegen <= 0 || foe.currentHp <= 0) {
      return 0;
    }
    const room = Math.round(foe.maxHp * MOONFED_ROUND_CAP) - this.regenHealed;
    const heal = Math.min(room, Math.max(1, Math.round(foe.maxHp * this.rules.foeRegen)));
    if (heal <= 0) {
      return 0;
    }
    const before = foe.currentHp;
    foe.currentHp = Math.min(foe.maxHp, foe.currentHp + heal);
    this.regenHealed += foe.currentHp - before;
    return foe.currentHp - before;
  }

  /** Moonfed has no healing left this round (always false without Moonfed). */
  get regenSpent(): boolean {
    return this.rules.foeRegen > 0 && this.regenHealed >= Math.round(this.foe.maxHp * MOONFED_ROUND_CAP);
  }

  /** Sudden-death steps so far this round (0 until turn SUDDEN_DEATH_AFTER + 1). */
  get suddenDeathSteps(): number {
    return Math.max(0, this.stats.turns - SUDDEN_DEATH_AFTER);
  }

  /** Extra foe damage from sudden death, as a share (0.2 = +20%). */
  get suddenDeathBonus(): number {
    return this.suddenDeathSteps * SUDDEN_DEATH_STEP;
  }

  /** End of the player's turn: Pure Light sheds statuses. Returns what was cleared. */
  playerEndTurn(player: BattleCombatant): StatusId[] {
    if (!this.boons.includes("pure-light") || player.currentHp <= 0) {
      return [];
    }
    const cleared = (player.statuses ?? []).filter((s) => s.turns > 0).map((s) => s.id);
    player.statuses = [];
    return cleared;
  }

  /** BattleScene's verdict before it closes (null = no verdict = a loss). */
  verdict: boolean | null = null;
  /**
   * In-battle HUD factory. TrialScene plugs in the Phaser strip
   * (trialBattleHud.ts), keeping this module (and BattleScene's import of
   * it) free of trial UI code.
   */
  createStrip: (scene: Phaser.Scene, area: { left: number; right: number; y: number }, ui: number) => TrialStrip =
    () => ({ refresh: () => undefined, destroy: () => undefined });
  /** Shown on the in-battle strip; the runner fills it in. */
  readonly hud = { roundsTotal: 5, scoreSoFar: 0 };

  reportResult(won: boolean): void {
    this.verdict = won;
  }

  /**
   * Counts a player action. Past SUDDEN_DEATH_AFTER turns the eclipse
   * deepens: the foe's damage rises a step. Returns true on a turn that
   * raised it (for the battle log).
   */
  notePlayerTurn(): boolean {
    this.stats.turns += 1;
    if (this.suddenDeathSteps <= 0) {
      return false;
    }
    const foe = this.foe;
    this.foeBaseDamage ??= foe.damageScale ?? 1;
    foe.damageScale = this.foeBaseDamage * (1 + this.suddenDeathBonus);
    return true;
  }

  /** A telegraphed finisher met a raised guard and landed: a perfect parry. */
  noteFoeMove(guarded: boolean, role: MoveRole, landed: boolean): void {
    if (guarded && role === "finisher" && landed) {
      this.stats.parries += 1;
    }
  }
}
