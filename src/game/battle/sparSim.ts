import { getCreatureDefinition } from "../creatures/catalog";
import type { BattleCombatant, MoveDefinition } from "../creatures/types";
import {
  calcDamage,
  chooseEnemyIntent,
  effectiveAccuracy,
  executeMove,
  getMatchup,
  isFainted,
  primeOpeningCooldowns,
  readyMoves,
  wildBattleTuning,
} from "./battleLogic";
import { getBattleKit, moveRole } from "./kits";
import { canApplyStatus, hasAnyStatus, tickStatuses } from "./statusEffects";

/**
 * Headless 1v1 spar used by balance tests: same turn order, intent and tick
 * rules as BattleScene (player acts first, foe executes its telegraphed move).
 */
export type SparPolicy = "sloppy" | "skilled";

export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function levelOneCombatant(speciesId: string): BattleCombatant {
  const def = getCreatureDefinition(speciesId);
  return primeOpeningCooldowns({
    name: def.name,
    folkloreType: def.folkloreType,
    maxHp: def.maxHp,
    currentHp: def.maxHp,
    attack: def.attack,
    defense: def.defense,
    moves: getBattleKit(def),
  });
}

function expectedDamage(
  user: BattleCombatant,
  move: MoveDefinition,
  target: BattleCombatant,
): number {
  return (calcDamage(user, move, target) * effectiveAccuracy(user, move)) / 100;
}

function bestDamageMove(
  user: BattleCombatant,
  target: BattleCombatant,
): MoveDefinition {
  const ready = readyMoves(user).filter((m) => m.power > 0);
  const pool = ready.length > 0 ? ready : readyMoves(user);
  return [...pool].sort(
    (a, b) => expectedDamage(user, b, target) - expectedDamage(user, a, target),
  )[0];
}

function chooseMove(
  policy: SparPolicy,
  player: BattleCombatant,
  wild: BattleCombatant,
  intent: MoveDefinition,
): MoveDefinition {
  const best = bestDamageMove(player, wild);
  if (policy === "sloppy") {
    return best;
  }
  const ready = readyMoves(player);
  const find = (role: string) => ready.find((m) => moveRole(m) === role);
  // Take the knockout when it is likely.
  if (expectedDamage(player, best, wild) >= wild.currentHp) {
    return best;
  }
  const guard = find("guard");
  const incoming =
    intent.power > 0 && getMatchup(intent, player) !== "immune"
      ? calcDamage(wild, intent, { ...player, guarding: false })
      : 0;
  if (guard && moveRole(intent) === "finisher" && incoming >= player.maxHp * 0.25) {
    return guard;
  }
  const finisher = find("finisher");
  if (finisher && hasAnyStatus(wild)) {
    return finisher;
  }
  const status = find("status");
  if (
    status?.inflicts &&
    !hasAnyStatus(wild) &&
    canApplyStatus(wild, status.inflicts) &&
    getMatchup(status, wild) !== "immune"
  ) {
    return status;
  }
  return best;
}

export type SparResult = { won: boolean; turns: number };

export function simulateSpar(
  playerId: string,
  wildId: string,
  seed: number,
  policy: SparPolicy,
  tutorial = false,
): SparResult {
  const rng = seededRng(seed);
  const tuning = wildBattleTuning(tutorial);
  const player = levelOneCombatant(playerId);
  const wild = { ...levelOneCombatant(wildId), damageScale: tuning.damageScale };
  const pickIntent = () =>
    chooseEnemyIntent(wild, player, rng, { matchupAware: tuning.matchupAware }).move;
  let intent = pickIntent();
  for (let turn = 1; turn <= 40; turn++) {
    executeMove(player, chooseMove(policy, player, wild, intent), wild, rng);
    if (isFainted(wild)) return { won: true, turns: turn };
    tickStatuses(player);
    if (isFainted(player)) return { won: false, turns: turn };
    executeMove(wild, intent, player, rng);
    player.guarding = false;
    tickStatuses(wild);
    if (isFainted(wild)) return { won: true, turns: turn };
    if (isFainted(player)) return { won: false, turns: turn };
    intent = pickIntent();
  }
  return { won: false, turns: 40 };
}

export function winRate(
  playerId: string,
  wildId: string,
  policy: SparPolicy,
  seeds = 200,
  tutorial = false,
): number {
  let wins = 0;
  for (let seed = 0; seed < seeds; seed++) {
    if (simulateSpar(playerId, wildId, seed, policy, tutorial).won) {
      wins += 1;
    }
  }
  return wins / seeds;
}
