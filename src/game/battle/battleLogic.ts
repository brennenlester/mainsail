import type { BattleCombatant, MoveDefinition } from "../creatures/types";
import {
  matchupMultiplier,
  resolveMatchup,
  type FolkloreType,
  type MatchupResult,
} from "../creatures/folkloreTypes";
import {
  FINISHER_STATUS_BONUS,
  GUARD_DAMAGE_TAKEN,
  moveCooldown,
  moveRole,
} from "./kits";
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
  return baseDamage(attacker, move, defender);
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
    power = Math.round(power * attacker.damageBuff.multiplier);
  }
  const defense = defender.defenseDisabled ? 0 : defender.defense;
  // Defense can blunt a hit but never erase it: low-attack creatures still matter.
  const floor = Math.ceil((power + attacker.attack) * MIN_DAMAGE_FRACTION);
  return Math.max(1, floor, power + attacker.attack - defense);
}

/** Status / guard / finisher modifiers stacked on top of the matchup. */
function situationalMultiplier(
  attacker: BattleCombatant,
  move: MoveDefinition,
  defender: BattleCombatant,
): number {
  let mult = attacker.damageScale ?? 1;
  if (hasStatus(defender, "soaked")) {
    mult *= move.type === "storm" ? SOAKED_STORM_DAMAGE_TAKEN : SOAKED_DAMAGE_TAKEN;
  }
  if (hasStatus(attacker, "rooted")) {
    mult *= ROOTED_DAMAGE_DEALT;
  }
  if (moveRole(move) === "finisher" && hasAnyStatus(defender)) {
    mult *= FINISHER_STATUS_BONUS;
  }
  if (defender.guarding) {
    mult *= GUARD_DAMAGE_TAKEN;
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

  let damage = baseDamage(attacker, move, defender);
  const mult = matchupMultiplier(matchup) * situationalMultiplier(attacker, move, defender);
  if (mult !== 1) {
    damage = Math.max(1, Math.round(damage * mult));
  }

  return { kind: "hit", matchup, damage };
}

/**
 * Sovereign pattern hits have fixed damage, but still respect the attacker's
 * Dazed (miss chance) and Rooted, and the defender's Guard.
 */
export function resolveFixedAttack(
  attacker: BattleCombatant,
  fixedDamage: number,
  defender: BattleCombatant,
  rng: () => number = Math.random,
): { kind: "miss" } | { kind: "hit"; damage: number } {
  if (hasStatus(attacker, "dazed") && rng() * 100 < DAZED_ACCURACY_PENALTY) {
    return { kind: "miss" };
  }
  return { kind: "hit", damage: previewFixedDamage(attacker, fixedDamage, defender) };
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
    mult *= GUARD_DAMAGE_TAKEN;
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
};

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
    if (move.heal && move.heal > 0) {
      const before = user.currentHp;
      user.currentHp = Math.min(
        user.maxHp,
        user.currentHp + Math.max(1, Math.round(user.maxHp * move.heal)),
      );
      result.healed = user.currentHp - before;
    }
  }

  if (move.power > 0) {
    const outcome = resolveAttack(user, move, target, rng);
    result.attack = outcome;
    if (outcome.kind === "hit") {
      applyDamage(target, outcome.damage);
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
/** Share of (power + attack) that always gets through defense. */
export const MIN_DAMAGE_FRACTION = 0.6;

/** Story 2 tutorial spar: wild hits are softened so a new player can win it. */
export const TUTORIAL_WILD_DAMAGE_SCALE = 0.75;

export type WildBattleTuning = { damageScale: number; matchupAware: boolean };

/** Tutorial wilds hit softer and don't lean into hunter matchups. */
export function wildBattleTuning(tutorial: boolean): WildBattleTuning {
  return tutorial
    ? { damageScale: TUTORIAL_WILD_DAMAGE_SCALE, matchupAware: false }
    : { damageScale: 1, matchupAware: true };
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
  let weight: number;
  switch (role) {
    case "guard":
      weight = hpRatio < 0.5 ? 2.5 : 0.4;
      break;
    case "status":
      weight =
        move.inflicts &&
        !hasStatus(player, move.inflicts) &&
        canApplyStatus(player, move.inflicts)
          ? 2.5
          : 0.2;
      break;
    case "finisher":
      weight = hasAnyStatus(player) ? 4 : 3;
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
