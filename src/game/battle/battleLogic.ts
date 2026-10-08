import type { BattleCombatant, MoveDefinition } from "../creatures/types";
import {
  matchupMultiplier,
  resolveMatchup,
  type FolkloreType,
  type MatchupResult,
} from "../creatures/folkloreTypes";
import {
  FINISHER_DAMAGE_MULT,
  FINISHER_STATUS_BONUS,
  GUARD_DAMAGE_TAKEN,
  GUARD_FINISHER_DAMAGE_TAKEN,
  moveCooldown,
  moveRole,
} from "./kits";
import { statMultForLevel } from "../progression/leveling";
import {
  applyStatus,
  canApplyStatus,
  DAZED_ACCURACY_PENALTY,
  hasAnyStatus,
  hasStatus,
  ROOTED_DAMAGE_DEALT,
  SOAKED_DAMAGE_TAKEN,
  SOAKED_STORM_DAMAGE_TAKEN,
  type StatusApplyResult,
} from "./statusEffects";

export type AttackOutcome =
  | { kind: "miss"; matchup: MatchupResult }
  | { kind: "immune"; matchup: "immune"; damage: 0 }
  | { kind: "hit"; matchup: MatchupResult; damage: number };

/** Effective hit chance after Dazed. */
export function effectiveAccuracy(
  attacker: BattleCombatant,
  move: MoveDefinition,
): number {
  const penalty = hasStatus(attacker, "dazed") ? DAZED_ACCURACY_PENALTY : 0;
  return Math.max(0, move.accuracy - penalty);
}

export function rollAccuracy(
  move: MoveDefinition,
  rng: () => number = Math.random,
  attacker?: BattleCombatant,
): boolean {
  const accuracy = attacker ? effectiveAccuracy(attacker, move) : move.accuracy;
  return rng() * 100 < accuracy;
}

export function getMatchup(
  move: MoveDefinition,
  defender: BattleCombatant,
): MatchupResult {
  return defender.defenseDisabled
    ? "neutral"
    : resolveMatchup(move.type, defender.folkloreType, defender.immunityTo);
}

/** Preview damage assuming the move hits (for UI labels). 0 for guard moves. */
export function calcDamage(
  attacker: BattleCombatant,
  move: MoveDefinition,
  defender: BattleCombatant,
): number {
  if (move.power <= 0) {
    return 0;
  }
  const outcome = resolveAttack(attacker, move, defender, () => 0);
  if (outcome.kind === "immune") {
    return 0;
  }
  if (outcome.kind === "hit") {
    return outcome.damage;
  }
  return Math.max(1, Math.round(baseDamage(attacker, move, defender)));
}

function baseDamage(
  attacker: BattleCombatant,
  move: MoveDefinition,
  defender: BattleCombatant,
): number {
  let power = move.power;
  if (
    attacker.damageBuff &&
    attacker.damageBuff.moveId === move.id
  ) {
    power *= attacker.damageBuff.multiplier;
  }
  if (defender.defenseDisabled) {
    // Sovereigns keep their own tuning: flat power, no defense, no battle bulk.
    return power + attacker.attack;
  }
  const scaledPower = power * statMultForLevel(attacker.level ?? 1);
  return (
    (scaledPower + attacker.attack) *
    defenseFactor(attacker, defender) *
    BATTLE_DAMAGE_SCALE
  );
}

/**
 * Share of a hit that gets through defense: K / (K + defense), with defense
 * and K both measured at their creature's level so equal-level spars play
 * the same at Lv 1 and Lv 40. Smooth: every point of defense matters and no
 * hit is ever erased (replaces `power + atk − def` with a 60% floor).
 */
export function defenseFactor(
  attacker: Pick<BattleCombatant, "level">,
  defender: Pick<BattleCombatant, "level" | "defense">,
): number {
  const k = DEFENSE_CURVE_K * statMultForLevel(attacker.level ?? 1);
  return k / (k + defender.defense * statMultForLevel(defender.level ?? 1));
}

/** Status / guard / finisher modifiers stacked on top of the matchup. */
function situationalMultiplier(
  attacker: BattleCombatant,
  move: MoveDefinition,
  defender: BattleCombatant,
): number {
  let mult = (attacker.damageScale ?? 1) / (defender.bulk ?? 1);
  if (hasStatus(defender, "soaked")) {
    mult *= move.type === "storm" ? SOAKED_STORM_DAMAGE_TAKEN : SOAKED_DAMAGE_TAKEN;
  }
  if (hasStatus(attacker, "rooted")) {
    mult *= ROOTED_DAMAGE_DEALT;
  }
  const finisher = moveRole(move) === "finisher";
  if (finisher) {
    mult *= FINISHER_DAMAGE_MULT;
    if (hasAnyStatus(defender)) {
      mult *= FINISHER_STATUS_BONUS;
    }
  }
  if (defender.guarding) {
    // Reading the telegraph pays: a guarded finisher is parried.
    mult *= finisher ? GUARD_FINISHER_DAMAGE_TAKEN : GUARD_DAMAGE_TAKEN;
  }
  return mult;
}

export function resolveAttack(
  attacker: BattleCombatant,
  move: MoveDefinition,
  defender: BattleCombatant,
  rng: () => number = Math.random,
): AttackOutcome {
  const matchup = getMatchup(move, defender);

  if (!rollAccuracy(move, rng, attacker)) {
    return { kind: "miss", matchup };
  }

  if (matchup === "immune") {
    return { kind: "immune", matchup: "immune", damage: 0 };
  }

  const mult = matchupMultiplier(matchup) * situationalMultiplier(attacker, move, defender);
  const damage = Math.max(1, Math.round(baseDamage(attacker, move, defender) * mult));

  return { kind: "hit", matchup, damage };
}

/**
 * Sovereign pattern hits have fixed damage, but still respect the attacker's
 * Dazed (miss chance) and Rooted, and the defender's Guard. Every beat of a
 * sovereign pattern is telegraphed, so a guard always parries it (and heals
 * the guard user before the hit lands; the caller applies the damage).
 */
export function resolveFixedAttack(
  attacker: BattleCombatant,
  fixedDamage: number,
  defender: BattleCombatant,
  rng: () => number = Math.random,
): { kind: "miss" } | { kind: "hit"; damage: number; parryHealed: number } {
  if (hasStatus(attacker, "dazed") && rng() * 100 < DAZED_ACCURACY_PENALTY) {
    return { kind: "miss" };
  }
  const damage = previewFixedDamage(attacker, fixedDamage, defender);
  const parryHealed = defender.guarding ? parryHeal(defender) : 0;
  return { kind: "hit", damage, parryHealed };
}

export function previewFixedDamage(
  attacker: BattleCombatant,
  fixedDamage: number,
  defender: BattleCombatant,
): number {
  let mult = 1;
  if (hasStatus(attacker, "rooted")) {
    mult *= ROOTED_DAMAGE_DEALT;
  }
  if (defender.guarding) {
    mult *= GUARD_FINISHER_DAMAGE_TAKEN;
  }
  return Math.max(1, Math.round(fixedDamage * mult));
}

export function applyDamage(target: BattleCombatant, amount: number): void {
  target.currentHp = Math.max(0, target.currentHp - amount);
}

export function isFainted(combatant: BattleCombatant): boolean {
  return combatant.currentHp <= 0;
}

// --- Cooldowns -------------------------------------------------------------

export function getCooldown(combatant: BattleCombatant, moveId: string): number {
  return combatant.cooldowns?.[moveId] ?? 0;
}

export function isMoveReady(
  combatant: BattleCombatant,
  move: MoveDefinition,
): boolean {
  return getCooldown(combatant, move.id) <= 0;
}

export function readyMoves(combatant: BattleCombatant): MoveDefinition[] {
  return combatant.moves.filter((m) => isMoveReady(combatant, m));
}

/**
 * Finishers enter battle charging (ready from the creature's second turn), so
 * neither side opens with its biggest hit and turn one is a setup decision.
 */
export function primeOpeningCooldowns(combatant: BattleCombatant): BattleCombatant {
  combatant.cooldowns = Object.fromEntries(
    combatant.moves
      .filter((m) => moveRole(m) === "finisher")
      .map((m) => [m.id, 1]),
  );
  return combatant;
}

/** After acting: every running cooldown drops by one, then the used move starts its own. */
function spendTurnCooldowns(combatant: BattleCombatant, used: MoveDefinition): void {
  const next: Record<string, number> = {};
  for (const [id, turns] of Object.entries(combatant.cooldowns ?? {})) {
    if (turns - 1 > 0) {
      next[id] = turns - 1;
    }
  }
  const cd = moveCooldown(used);
  if (cd > 0) {
    next[used.id] = cd;
  }
  combatant.cooldowns = next;
}

// --- Executing a move ------------------------------------------------------

export type MoveResult = {
  move: MoveDefinition;
  /** Present for any move with power > 0. */
  attack?: AttackOutcome;
  healed: number;
  guarded: boolean;
  status?: StatusApplyResult;
  /** HP the target's guard restored by parrying this finisher. */
  parryHealed?: number;
};

/** A parried finisher lets the guard user patch up by its guard move's heal. */
function parryHeal(target: BattleCombatant): number {
  const heal = target.moves.find((m) => moveRole(m) === "guard")?.heal ?? 0;
  if (heal <= 0) {
    return 0;
  }
  const before = target.currentHp;
  target.currentHp = Math.min(
    target.maxHp,
    target.currentHp + Math.max(1, Math.round(target.maxHp * heal)),
  );
  return target.currentHp - before;
}

/**
 * Resolve one action end to end: drops the user's previous guard, rolls the
 * hit, applies damage / heal / guard / status, and starts the cooldown.
 * Deterministic for a given `rng`.
 */
export function executeMove(
  user: BattleCombatant,
  move: MoveDefinition,
  target: BattleCombatant,
  rng: () => number = Math.random,
): MoveResult {
  user.guarding = false;
  const role = moveRole(move);
  const result: MoveResult = { move, healed: 0, guarded: false };

  if (role === "guard") {
    user.guarding = true;
    result.guarded = true;
  }

  if (move.power > 0) {
    const outcome = resolveAttack(user, move, target, rng);
    result.attack = outcome;
    if (outcome.kind === "hit") {
      applyDamage(target, outcome.damage);
      if (target.guarding && role === "finisher" && target.currentHp > 0) {
        result.parryHealed = parryHeal(target);
      }
      // A guard soaks one hit, then drops.
      target.guarding = false;
      if (move.inflicts && target.currentHp > 0) {
        result.status = applyStatus(target, move.inflicts);
      }
    }
  } else if (move.inflicts) {
    result.status = applyStatus(target, move.inflicts);
  }

  spendTurnCooldowns(user, move);
  return result;
}

// --- Enemy intent ----------------------------------------------------------

export type Intent = {
  move: MoveDefinition;
};

/**
 * Pick the enemy's next move (shown to the player one turn ahead).
 * Weighted by role and situation, scaled by matchup vs the current player
 * creature, and rolled with the injected rng so tests are deterministic.
 */
/** Defense curve: a defender whose defense equals K halves (power + attack). */
export const DEFENSE_CURVE_K = 10;
/**
 * Battle-only bulk (#378): creature-vs-creature hits are scaled down so a
 * spar lasts ~5-8 turns without touching saved HP. Sovereigns (defense
 * disabled, fixed patterns) keep their own tuned numbers.
 */
export const BATTLE_DAMAGE_SCALE = 0.5;

/** Story 2 tutorial spar: wild hits are softened so a new player can win it. */
export const TUTORIAL_WILD_DAMAGE_SCALE = 0.6;
/**
 * Every other wild hits a little harder than its stats, offsetting the
 * player's first move and telegraph read: equal-level 1v1 lands at ~40%
 * random / ~60% max-damage / ~77% skilled (sparBalance.test.ts). Parties
 * keep the overworld soft.
 */
export const WILD_DAMAGE_SCALE = 1.08;

/** Party average this many levels above the wild = a trivial fight. */
export const OUTLEVELED_GAP = 3;
export const OUTLEVELED_BULK = 0.45;
/** Each level past the gap trims a little more, down to the floor. */
export const OUTLEVELED_BULK_STEP = 0.05;
export const OUTLEVELED_BULK_FLOOR = 0.3;

/**
 * Wild bulk when the party clearly outlevels it, so trivial overworld fights
 * end in ~3-4 turns instead of grinding 7-10 (#378). Peer-level fights (gap
 * under OUTLEVELED_GAP) keep bulk 1. Not for sovereigns (fixed tuning).
 */
export function outleveledWildBulk(partyAverageLevel: number, wildLevel: number): number {
  const gap = partyAverageLevel - wildLevel;
  if (gap < OUTLEVELED_GAP) {
    return 1;
  }
  return Math.max(
    OUTLEVELED_BULK_FLOOR,
    OUTLEVELED_BULK - (gap - OUTLEVELED_GAP) * OUTLEVELED_BULK_STEP,
  );
}

export type WildBattleTuning ={ damageScale: number; matchupAware: boolean };

/** Tutorial wilds hit softer and don't lean into hunter matchups. */
export function wildBattleTuning(tutorial: boolean): WildBattleTuning {
  return tutorial
    ? { damageScale: TUTORIAL_WILD_DAMAGE_SCALE, matchupAware: false }
    : { damageScale: WILD_DAMAGE_SCALE, matchupAware: true };
}

export type IntentOptions = {
  /** Lean into hunter matchups / away from resisted ones. Off for the tutorial spar. */
  matchupAware?: boolean;
};

export function chooseEnemyIntent(
  enemy: BattleCombatant,
  player: BattleCombatant,
  rng: () => number = Math.random,
  options: IntentOptions = {},
): Intent {
  const matchupAware = options.matchupAware ?? true;
  const ready = readyMoves(enemy);
  const pool = ready.length > 0 ? ready : enemy.moves;
  const weights = pool.map((move) =>
    intentWeight(enemy, move, player, matchupAware),
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return { move: pool[0] };
  }
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      return { move: pool[i] };
    }
  }
  return { move: pool[pool.length - 1] };
}

function intentWeight(
  enemy: BattleCombatant,
  move: MoveDefinition,
  player: BattleCombatant,
  matchupAware: boolean,
): number {
  const role = moveRole(move);
  const hpRatio = enemy.currentHp / enemy.maxHp;
  // A ready status move that would stick: set up before cashing the finisher.
  const setupReady = readyMoves(enemy).some(
    (m) =>
      moveRole(m) === "status" &&
      m.inflicts !== undefined &&
      !hasAnyStatus(player) &&
      canApplyStatus(player, m.inflicts),
  );
  let weight: number;
  switch (role) {
    case "guard":
      // Raise the guard for the turn the player's finisher comes off cooldown.
      weight =
        (hpRatio < 0.5 ? 1.2 : 0.3) +
        (player.moves.some(
          (m) => moveRole(m) === "finisher" && getCooldown(player, m.id) === 1,
        )
          ? 2
          : 0);
      break;
    case "status":
      weight =
        move.inflicts &&
        !hasStatus(player, move.inflicts) &&
        canApplyStatus(player, move.inflicts)
          ? 3
          : 0.2;
      break;
    case "finisher":
      weight = hasAnyStatus(player) ? 5 : setupReady ? 1.5 : 3;
      break;
    default:
      weight = 1.5;
  }
  if (move.power > 0) {
    const matchup = getMatchup(move, player);
    // Never telegraph a move that cannot land; otherwise only lean in when allowed.
    if (matchup === "immune") {
      return 0;
    }
    if (matchupAware) {
      weight *= matchupMultiplier(matchup);
    }
  }
  return weight;
}

// --- Labels ----------------------------------------------------------------

export function formatMatchupHint(matchup: MatchupResult): string {
  if (matchup === "hunter") {
    return " (hunter!)";
  }
  if (matchup === "resisted") {
    return " (resisted)";
  }
  if (matchup === "immune") {
    return " (immune!)";
  }
  return "";
}

/** Compact badge for move buttons / intent: "×1.5", "resists", "immune", "". */
export function formatMatchupBadge(matchup: MatchupResult): string {
  if (matchup === "hunter") {
    return `×${matchupMultiplier("hunter")}`;
  }
  if (matchup === "resisted") {
    return `resists ×${matchupMultiplier("resisted")}`;
  }
  if (matchup === "immune") {
    return "immune";
  }
  return "";
}

/** Encounter panel line: how the lead companion and the wild hit each other. */
export function formatEncounterMatchup(
  leadName: string,
  leadType: FolkloreType,
  wildType: FolkloreType,
): string {
  const parts: string[] = [];
  const outgoing = resolveMatchup(leadType, wildType);
  const incoming = resolveMatchup(wildType, leadType);
  if (outgoing === "hunter") {
    parts.push(`you hunt it ×${matchupMultiplier("hunter")}`);
  } else if (outgoing === "resisted") {
    parts.push("resists you");
  }
  if (incoming === "hunter") {
    parts.push(`hunts you ×${matchupMultiplier("hunter")}`);
  } else if (incoming === "resisted") {
    parts.push("you resist it");
  }
  return `${leadName}: ${parts.length > 0 ? parts.join(" · ") : "even matchup"}`;
}
