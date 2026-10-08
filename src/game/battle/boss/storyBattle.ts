import { getCreatureDefinition } from "../../creatures/catalog";
import type { BattleCombatant, MoveDefinition, MoveRole, StatusId } from "../../creatures/types";
import { scaledStat } from "../../progression/leveling";
import {
  chooseEnemyIntent,
  outleveledWildBulk,
  primeOpeningCooldowns,
  WILD_DAMAGE_SCALE,
  type MoveResult,
} from "../battleLogic";
import { getBattleKit, moveRole } from "../kits";
import { HUNTER_CHART } from "../../creatures/folkloreTypes";
import { applyStatus, canApplyStatus, hasAnyStatus, hasStatus } from "../statusEffects";
import {
  challengerScaleFor,
  storySparRoster,
  storySparRoundLevel,
  type ChallengerScale,
  type BossForm,
  type StorySparDefinition,
  type StorySparRound,
} from "../../story/storySpars";

/**
 * One story battle (#385), shared by BattleScene and the headless sim so the
 * tuned numbers are the played numbers. No Phaser here.
 *
 * - Rival: Wren's creatures come out one after another in the same battle.
 * - Boss: one combatant, one HP pool, several forms. A hit that crosses a
 *   form threshold is clamped to it and the boss transforms (that costs her
 *   turn). Each form runs a fixed intent pattern; the signature is
 *   telegraphed, and a guarded (parried) signature staggers her for a turn.
 * - Assist: Wren acts every N foe turns in the boss fight (cleanse / heal /
 *   daze the boss), chosen from the battle state.
 */

export const STAGGER_MOVE_ID = "boss-staggered";

export type StoryIntent = { move: MoveDefinition; role: MoveRole };

export type AssistAction =
  | { kind: "cleanse"; cleared: StatusId[]; healed: number }
  | { kind: "heal"; healed: number }
  | { kind: "daze" }
  | { kind: "soak" };

export type StoryBattleOptions = {
  partyAverage: number;
  /** Hearth Ward multiplier on opposition HP and damage (1 = none). */
  ward?: number;
  /** Standing companions at battle start (the boss scales to challengers, up to 3). */
  partySize: number;
  rematch: boolean;
  maxLevel: number;
};

/** "Intent detail" variants the UI explains in words. */
export type IntentNote = "signature" | "charge" | "stagger" | null;

export class StoryBattle {
  readonly def: StorySparDefinition;
  readonly rematch: boolean;
  readonly roster: readonly StorySparRound[];
  readonly level: number;
  foe: BattleCombatant;
  /** Rival creature index or boss form index. */
  private stage = 0;
  private patternIndex = 0;
  private staggered = false;
  /** Foe turns since Wren last helped. */
  private assistWait = 0;
  private readonly options: StoryBattleOptions;
  /** Counters for the sim / tests. */
  readonly stats = { transforms: 0, signatures: 0, parries: 0, assists: 0 };

  constructor(def: StorySparDefinition, options: StoryBattleOptions) {
    this.def = def;
    this.options = options;
    this.rematch = options.rematch;
    this.roster = storySparRoster(def, options.rematch);
    if (def.boss) {
      this.level = this.levelFor(def.boss.levelBonus);
      this.foe = this.buildBoss();
    } else {
      if (this.roster.length === 0) {
        throw new Error(`Story spar ${def.id} has no opponents`);
      }
      this.level = this.levelFor(this.roster[0]!.levelBonus);
      this.foe = this.buildRivalFoe(0);
    }
  }

  /** HP / damage scale for the standing party at battle start. */
  private get scale(): ChallengerScale {
    return challengerScaleFor(this.def, this.options.partySize, this.rematch);
  }

  /** Hearth Ward multiplier in effect (1 = none). */
  get ward(): number {
    return this.options.ward ?? 1;
  }

  /** Bespoke art key for the foe right now (may not be loaded yet). */
  get foeArtKey(): string | undefined {
    return this.form?.spriteKey ?? (this.isBoss ? undefined : this.roster[this.stage]?.spriteKey);
  }

  get isBoss(): boolean {
    return this.def.boss !== undefined;
  }

  /** Species whose art the foe uses right now. */
  get spriteCreatureId(): string {
    return this.def.boss ? this.def.boss.spriteCreatureId : this.roster[this.stage]!.creatureId;
  }

  get foeLevel(): number {
    return this.foe.level ?? 1;
  }

  /** Boss form now on the field (null for the rival). */
  get form(): BossForm | null {
    return this.def.boss?.forms[this.stage] ?? null;
  }

  get formIndex(): number {
    return this.stage;
  }

  /** HP shares where the boss changes form (boss bar pips). */
  get phaseMarks(): number[] {
    return (this.def.boss?.forms ?? [])
      .map((f) => f.transformAt)
      .filter((v): v is number => v !== undefined);
  }

  /** Rival: creatures still to come after the current one. */
  get remainingFoes(): number {
    return this.isBoss ? 0 : this.roster.length - 1 - this.stage;
  }

  get isStaggered(): boolean {
    return this.staggered;
  }

  private levelFor(bonus: number): number {
    return storySparRoundLevel(
      { levelBonus: bonus },
      this.options.partyAverage,
      this.rematch,
      this.def.rematchLevelBonus,
      this.options.maxLevel,
    );
  }

  private buildBoss(): BattleCombatant {
    const boss = this.def.boss!;
    const form = boss.forms[0]!;
    const scale = this.scale;
    const maxHp = Math.round(
      scaledStat(boss.baseHp, this.level) * boss.hpMult * scale.hp * this.ward,
    );
    return {
      name: this.def.name,
      level: this.level,
      maxHp,
      currentHp: maxHp,
      attack: scaledStat(form.attack, this.level),
      defense: form.defense,
      moves: [...form.kit],
      folkloreType: form.type,
      damageScale: boss.damageScale * scale.damage * this.ward,
      bulk: 1,
      cooldowns: {},
    };
  }

  private buildRivalFoe(index: number): BattleCombatant {
    const round = this.roster[index]!;
    const def = getCreatureDefinition(round.creatureId);
    const level = this.levelFor(round.levelBonus);
    const maxHp = Math.round(scaledStat(def.maxHp, level) * this.scale.hp * this.ward);
    return primeOpeningCooldowns({
      name: def.name,
      level,
      maxHp,
      currentHp: maxHp,
      attack: scaledStat(def.attack, level),
      defense: def.defense,
      moves: getBattleKit(def),
      folkloreType: def.folkloreType,
      damageScale: WILD_DAMAGE_SCALE * this.scale.damage * this.ward,
      bulk: outleveledWildBulk(this.options.partyAverage, level),
    });
  }

  /**
   * Call after anything damages the boss. When HP reaches the current form's
   * threshold, HP is clamped to it and the next form takes over (new type,
   * kit and pattern; statuses and guard burn off). Returns the new form.
   */
  checkTransform(): BossForm | null {
    this.syncDouse();
    const boss = this.def.boss;
    const form = this.form;
    if (!boss || !form || form.transformAt === undefined) {
      return null;
    }
    const threshold = Math.round(this.foe.maxHp * form.transformAt);
    if (this.foe.currentHp > threshold) {
      return null;
    }
    const next = boss.forms[this.stage + 1];
    if (!next) {
      return null;
    }
    this.stage += 1;
    this.foe.currentHp = Math.max(1, threshold);
    this.foe.folkloreType = next.type;
    this.foe.moves = [...next.kit];
    this.foe.attack = scaledStat(next.attack, this.level);
    this.foe.defense = next.defense;
    this.foe.statuses = [];
    this.foe.cooldowns = {};
    this.foe.guarding = false;
    this.patternIndex = 0;
    this.setStaggered(false);
    this.stats.transforms += 1;
    return next;
  }

  /** Rival: send the next creature after a faint. Null when Wren is out of creatures. */
  nextFoe(): BattleCombatant | null {
    if (this.isBoss || this.stage >= this.roster.length - 1) {
      return null;
    }
    this.stage += 1;
    this.foe = this.buildRivalFoe(this.stage);
    return this.foe;
  }

  /**
   * The foe's next action (telegraphed one turn ahead). Boss intents come
   * from the pattern and do not advance on a re-read (faint replacement);
   * they advance in `onFoeActed`.
   */
  intentFor(
    player: BattleCombatant,
    rng: () => number,
  ): StoryIntent {
    this.syncDouse();
    const form = this.form;
    if (!form) {
      const { move } = chooseEnemyIntent(this.foe, player, rng, { matchupAware: true });
      return { move, role: moveRole(move) };
    }
    if (this.staggered) {
      const move: MoveDefinition = {
        id: STAGGER_MOVE_ID,
        name: "Staggered",
        power: 0,
        type: form.type,
        accuracy: 100,
        role: "attack",
      };
      return { move, role: "attack" };
    }
    const id = form.pattern[this.patternIndex % form.pattern.length]!;
    const move = form.kit.find((m) => m.id === id) ?? form.kit[0]!;
    if (form.dousedType && move.power > 0 && this.isDoused) {
      return { move: { ...move, type: form.dousedType }, role: moveRole(move) };
    }
    return { move, role: moveRole(move) };
  }

  /** Soaked in a form with `dousedType`: her hits lose their element. */
  get isDoused(): boolean {
    return this.form?.dousedType !== undefined && hasStatus(this.foe, "soaked");
  }

  /**
   * Doused, she also defends as `dousedType` (her ember hide no longer
   * shrugs off the types it hunts). Called after every action.
   */
  syncDouse(): void {
    const form = this.form;
    if (form?.dousedType) {
      this.foe.folkloreType = this.isDoused ? form.dousedType : form.type;
    }
  }

  /** How the UI should explain an intent (signature / wind-up / stagger). */
  intentNote(move: MoveDefinition): IntentNote {
    const boss = this.def.boss;
    if (!boss) {
      return null;
    }
    if (move.id === STAGGER_MOVE_ID) {
      return "stagger";
    }
    if (move.id === boss.signatureId) {
      return "signature";
    }
    if (move.id === boss.chargeId) {
      return "charge";
    }
    return null;
  }

  /**
   * After the foe resolves its telegraphed move. A signature that met a
   * raised guard is parried: the boss staggers and loses her next action.
   */
  onFoeActed(
    move: MoveDefinition,
    playerWasGuarding: boolean,
    result: MoveResult | null,
  ): { parried: boolean } {
    const boss = this.def.boss;
    if (!boss) {
      return { parried: false };
    }
    if (move.id === STAGGER_MOVE_ID) {
      this.setStaggered(false);
      return { parried: false };
    }
    this.patternIndex += 1;
    if (move.id !== boss.signatureId) {
      return { parried: false };
    }
    this.stats.signatures += 1;
    const parried = playerWasGuarding && result?.attack?.kind === "hit";
    if (parried) {
      this.setStaggered(true);
      this.stats.parries += 1;
    }
    return { parried };
  }

  /**
   * A staggered boss is exposed: she takes `staggerExposure`x damage until
   * she recovers (battle-only bulk). The punish window that lets any party,
   * even one her form hunts, turn a good read into real damage.
   */
  private setStaggered(on: boolean): void {
    this.staggered = on;
    const exposure = this.def.boss?.staggerExposure ?? 1;
    this.foe.bulk = on ? 1 / exposure : 1;
  }

  /**
   * Wren's support turn (boss fight only), every `assist.every` foe turns:
   * cleanse a status (+ a little HP), heal a hurt companion, or daze the boss.
   * Applies the effect; the caller presents it. Null when she holds back.
   */
  assistTick(player: BattleCombatant): AssistAction | null {
    const assist = this.def.assist;
    if (!assist || player.currentHp <= 0) {
      return null;
    }
    this.assistWait += 1;
    const hunted = HUNTER_CHART[this.form?.type ?? this.foe.folkloreType] === player.folkloreType;
    if (this.assistWait < (hunted ? assist.huntedEvery : assist.every)) {
      return null;
    }
    this.assistWait = 0;
    this.stats.assists += 1;
    const heal = (share: number): number => {
      const before = player.currentHp;
      player.currentHp = Math.min(
        player.maxHp,
        player.currentHp + Math.max(1, Math.round(player.maxHp * share)),
      );
      return player.currentHp - before;
    };
    // Her form hunts your lead: Wren's Brook Nymph drenches her (Soaked, x1.25 taken).
    if (
      hunted &&
      canApplyStatus(this.foe, "soaked") &&
      !hasStatus(this.foe, "soaked")
    ) {
      applyStatus(this.foe, "soaked");
      this.syncDouse();
      return { kind: "soak" };
    }
    if (hasAnyStatus(player)) {
      const cleared = (player.statuses ?? []).filter((s) => s.turns > 0).map((s) => s.id);
      player.statuses = [];
      return { kind: "cleanse", cleared, healed: heal(assist.cleanseHealFraction) };
    }
    if (player.currentHp < player.maxHp * assist.healBelow || !canApplyStatus(this.foe, "dazed")) {
      return { kind: "heal", healed: heal(assist.healFraction) };
    }
    applyStatus(this.foe, "dazed");
    return { kind: "daze" };
  }
}

/** Short log line for an assist action. */
export function describeAssist(
  assist: AssistAction,
  helper: string,
  playerName: string,
  foeName: string,
): string {
  switch (assist.kind) {
    case "cleanse":
      return `${helper}'s Rootwalker washes ${playerName} clean${assist.healed > 0 ? ` (+${assist.healed} HP)` : ""}!`;
    case "heal":
      return `${helper}'s Rootwalker blooms: ${playerName} +${assist.healed} HP!`;
    case "daze":
      return `${helper}'s Lantern Fox dazzles ${foeName} — Dazed!`;
    case "soak":
      return `${helper}'s Brook Nymph drenches ${foeName} — Soaked, she takes more damage!`;
  }
}
