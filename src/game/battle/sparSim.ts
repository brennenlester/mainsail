import { getCreatureDefinition } from "../creatures/catalog";
import { matchupMultiplier, resolveMatchup } from "../creatures/folkloreTypes";
import type { BattleCombatant, MoveDefinition } from "../creatures/types";
import { scaledStat } from "../progression/leveling";
import {
  calcDamage,
  chooseEnemyIntent,
  effectiveAccuracy,
  executeMove,
  getMatchup,
  isFainted,
  outleveledWildBulk,
  primeOpeningCooldowns,
  readyMoves,
  wildBattleTuning,
} from "./battleLogic";
import { getBattleKit, moveRole } from "./kits";
import { canApplyStatus, hasAnyStatus, tickStatuses } from "./statusEffects";
import { applyBondToCombatant, bondTier } from "../companions/bond";
import {
  afterBefriendMiss,
  computeBefriendOdds,
  type BefriendOffering,
} from "../encounters/befriendChance";
import { getRarityBias } from "../progression/wildLevel";

/**
 * Headless spar used by balance tests (#364, #378). Same turn order, intent,
 * switch and tick rules as BattleScene: the player acts first, the foe
 * executes its telegraphed move, the first voluntary switch is free, a paid
 * switch eats the telegraphed hit, and a faint replacement re-rolls the intent.
 *
 * Policies:
 * - `random`: any ready move.
 * - `max-damage`: always the best expected-damage move.
 * - `skilled`: reads the telegraph: guards into a big finisher, sets up a
 *   status then cashes the finisher, never throws a finisher into a guard,
 *   and uses the free switch to leave a matchup where the foe hunts it.
 * - `befriend` (#366): skilled play that tries to recruit instead of KO —
 *   attempts Befriend once the odds reach `befriendAt` or the next hit
 *   would knock the wild out. `cardTry` spends the encounter card's single
 *   full-HP try first (a miss lets the wild open). A miss spends the turn;
 *   BEFRIEND_FLEE_STREAK misses (card included) and the wild slips away.
 */
export type SparPolicy = "random" | "max-damage" | "skilled" | "befriend";

export type SparSetup = {
  /** Player party, lead first. One id = a 1v1 spar. */
  party: readonly string[];
  wild: string;
  policy: SparPolicy;
  /** Player creature level (default 1). */
  level?: number;
  /** Wild level (default = player level). */
  wildLevel?: number;
  /** Story 2 tutorial tuning for the wild. */
  tutorial?: boolean;
  /** Bond points on every player creature (BattleScene applies the tier bonus). */
  bond?: number;
  /** `befriend` policy: attempt once odds reach this (0 = attempt at once). Default 0.7. */
  befriendAt?: number;
  /** `befriend` policy: spend the single encounter-card try first (full HP). */
  cardTry?: boolean;
  /** `befriend` policy: offering used on every attempt. */
  offering?: BefriendOffering;
};

export type SparResult = {
  won: boolean;
  /** Player actions taken (free switches excluded). */
  turns: number;
  /** Player finishers that hit. */
  finishers: number;
  /** Statuses the player landed (applied or refreshed). */
  statuses: number;
  switches: number;
  /** `befriend` policy: the wild joined. */
  recruited: boolean;
  befriendAttempts: number;
  /** `befriend` policy: the wild slipped away after a miss streak. */
  fled: boolean;
};

export type SparStats = {
  winRate: number;
  avgTurns: number;
  avgFinishers: number;
  avgStatuses: number;
  recruitRate: number;
  fleeRate: number;
  /** Mean befriend attempts over runs that recruited. */
  avgAttemptsToRecruit: number;
};

const MAX_TURNS = 60;

export function seededRng(seed: number): () => number {
  // Scramble small sequential seeds so seed 0..N streams are not correlated.
  let a = Math.imul((seed + 1) ^ 0x5bd1e995, 0x9e3779b1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mirrors BattleScene's combatant construction for a level-L creature. */
export function simCombatant(speciesId: string, level = 1): BattleCombatant {
  const def = getCreatureDefinition(speciesId);
  const maxHp = scaledStat(def.maxHp, level);
  return {
    name: def.name,
    folkloreType: def.folkloreType,
    level,
    maxHp,
    currentHp: maxHp,
    attack: scaledStat(def.attack, level),
    defense: def.defense,
    moves: getBattleKit(def),
  };
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
  exclude?: (m: MoveDefinition) => boolean,
): MoveDefinition {
  const ready = readyMoves(user);
  const hitting = ready.filter((m) => m.power > 0 && !exclude?.(m));
  const pool = hitting.length > 0 ? hitting : ready.length > 0 ? ready : user.moves;
  return [...pool].sort(
    (a, b) => expectedDamage(user, b, target) - expectedDamage(user, a, target),
  )[0];
}

/** Policy move pick, shared with the story battle sim (battle/boss). */
export function chooseMove(
  policy: SparPolicy,
  player: BattleCombatant,
  wild: BattleCombatant,
  intent: MoveDefinition,
  rng: () => number,
): MoveDefinition {
  if (policy === "random") {
    const ready = readyMoves(player);
    const pool = ready.length > 0 ? ready : player.moves;
    return pool[Math.floor(rng() * pool.length)];
  }
  const best = bestDamageMove(player, wild);
  if (policy === "max-damage") {
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
  if (guard && moveRole(intent) === "finisher" && incoming >= player.maxHp * 0.2) {
    return guard;
  }
  // Low and about to be hit: guard to blunt it and patch up.
  if (guard && incoming > 0 && player.currentHp <= player.maxHp * 0.35) {
    return guard;
  }
  const status = find("status");
  const statusUseful =
    status?.inflicts !== undefined &&
    !hasAnyStatus(wild) &&
    canApplyStatus(wild, status.inflicts) &&
    getMatchup(status, wild) !== "immune";
  // Never throw the finisher into a raised guard: set up or chip instead.
  if (wild.guarding) {
    if (statusUseful && status) {
      return status;
    }
    return bestDamageMove(player, wild, (m) => moveRole(m) === "finisher");
  }
  const finisher = find("finisher");
  if (finisher && hasAnyStatus(wild)) {
    return finisher;
  }
  if (statusUseful && status) {
    return status;
  }
  return best;
}

/** Outgoing vs incoming type edge of `speciesId` against the wild's type. */
function matchupScore(speciesId: string, wildId: string): number {
  const mine = getCreatureDefinition(speciesId).folkloreType;
  const theirs = getCreatureDefinition(wildId).folkloreType;
  return (
    matchupMultiplier(resolveMatchup(mine, theirs)) /
    matchupMultiplier(resolveMatchup(theirs, mine))
  );
}

export function simulateSpar(setup: SparSetup, seed: number): SparResult {
  const rng = seededRng(seed);
  const level = setup.level ?? 1;
  const tutorial = setup.tutorial ?? false;
  const tuning = wildBattleTuning(tutorial);
  const wildLevel = setup.wildLevel ?? level;
  const wild: BattleCombatant = {
    ...primeOpeningCooldowns(simCombatant(setup.wild, wildLevel)),
    damageScale: tuning.damageScale,
    // The whole sim party shares `level`, so it is also the party average.
    bulk: outleveledWildBulk(level, wildLevel),
  };
  // One combatant per party slot; HP, statuses and cooldowns persist on the bench.
  const roster = setup.party.map((id) => {
    const combatant = primeOpeningCooldowns(simCombatant(id, level));
    return setup.bond ? applyBondToCombatant(combatant, { bond: setup.bond }) : combatant;
  });
  let active = 0;
  let player = roster[active];
  let freeSwitch = true;
  const result: SparResult = {
    won: false,
    turns: 0,
    finishers: 0,
    statuses: 0,
    switches: 0,
    recruited: false,
    befriendAttempts: 0,
    fled: false,
  };
  const befriendAt = setup.befriendAt ?? 0.7;
  const skilledLike = setup.policy === "skilled" || setup.policy === "befriend";
  const befriendChance = () =>
    computeBefriendOdds({
      rarityBias: getRarityBias(setup.wild),
      levelGap: wildLevel - level,
      hpFraction: wild.currentHp / wild.maxHp,
      statuses: (wild.statuses ?? []).filter((s) => s.turns > 0).map((s) => s.id),
      offering: setup.offering ?? "none",
      leadBondTier: bondTier(setup.bond),
      habitatEdge: 0,
    }).chance;

  const pickIntent = () =>
    chooseEnemyIntent(wild, player, rng, { matchupAware: tuning.matchupAware }).move;
  const living = () =>
    roster.map((_, i) => i).filter((i) => i !== active && !isFainted(roster[i]));
  const bestBench = (): number | undefined =>
    [...living()].sort(
      (a, b) => matchupScore(setup.party[b], setup.wild) - matchupScore(setup.party[a], setup.wild),
    )[0];
  const replaceFainted = (): boolean => {
    const options = living();
    if (options.length === 0) {
      return false;
    }
    active = skilledLike ? bestBench()! : options[0];
    player = roster[active];
    return true;
  };

  let intent = pickIntent();
  if (setup.policy === "befriend" && setup.cardTry) {
    // One try on the encounter card at full HP; a miss makes the wild open the spar.
    result.befriendAttempts += 1;
    if (rng() < befriendChance()) {
      result.recruited = true;
      return result;
    }
    executeMove(wild, intent, player, rng);
    tickStatuses(wild);
    if (isFainted(player) && !replaceFainted()) {
      return result;
    }
    intent = pickIntent();
  }
  while (result.turns < MAX_TURNS) {
    // Skilled play spends the free switch to leave a bad matchup (no turn spent;
    // the telegraphed move now lands on the newcomer).
    if (skilledLike && freeSwitch) {
      const candidate = bestBench();
      if (
        candidate !== undefined &&
        matchupScore(setup.party[candidate], setup.wild) >
          matchupScore(setup.party[active], setup.wild)
      ) {
        freeSwitch = false;
        active = candidate;
        player = roster[active];
        result.switches += 1;
      }
    }

    result.turns += 1;
    const move = chooseMove(setup.policy, player, wild, intent, rng);
    const chance = setup.policy === "befriend" ? befriendChance() : 0;
    const wouldKo = expectedDamage(player, bestDamageMove(player, wild), wild) >= wild.currentHp;
    if (setup.policy === "befriend" && (chance >= befriendAt || wouldKo)) {
      result.befriendAttempts += 1;
      if (rng() < chance) {
        result.recruited = true;
        return result;
      }
      const miss = afterBefriendMiss(result.befriendAttempts - 1);
      if (miss.fled) {
        result.fled = true;
        return result;
      }
    } else {
      const outcome = executeMove(player, move, wild, rng);
      if (moveRole(move) === "finisher" && outcome.attack?.kind === "hit") {
        result.finishers += 1;
      }
      if (outcome.status?.kind === "applied" || outcome.status?.kind === "refreshed") {
        result.statuses += 1;
      }
      if (isFainted(wild)) {
        result.won = true;
        return result;
      }
    }
    tickStatuses(player);
    if (isFainted(player)) {
      if (!replaceFainted()) {
        return result;
      }
      intent = pickIntent();
      continue;
    }

    executeMove(wild, intent, player, rng);
    player.guarding = false;
    tickStatuses(wild);
    if (isFainted(wild)) {
      result.won = true;
      return result;
    }
    if (isFainted(player) && !replaceFainted()) {
      return result;
    }
    intent = pickIntent();
  }
  return result;
}

function hashSetup(setup: SparSetup): number {
  // Seeds for the pre-#366 fields are unchanged; new fields only extend the key.
  const extra = [setup.bond, setup.befriendAt, setup.offering, setup.cardTry].some((v) => v !== undefined)
    ? `|${setup.bond ?? ""}|${setup.befriendAt ?? ""}|${setup.offering ?? ""}|${setup.cardTry ? 1 : ""}`
    : "";
  const key = `${setup.party.join("+")}|${setup.wild}|${setup.level ?? 1}|${setup.wildLevel ?? ""}|${setup.tutorial ? 1 : 0}${extra}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return (h >>> 0) % 1_000_000_007;
}

export function sparStats(setup: SparSetup, seeds = 200): SparStats {
  let wins = 0;
  let turns = 0;
  let finishers = 0;
  let statuses = 0;
  let recruits = 0;
  let fled = 0;
  let recruitAttempts = 0;
  // Each matchup gets its own seed stream (shared across policies), so
  // averages over many pairs are not dominated by a few lucky seeds.
  const base = hashSetup(setup);
  for (let i = 0; i < seeds; i++) {
    const r = simulateSpar(setup, base + i);
    wins += r.won ? 1 : 0;
    turns += r.turns;
    finishers += r.finishers;
    statuses += r.statuses;
    fled += r.fled ? 1 : 0;
    if (r.recruited) {
      recruits += 1;
      recruitAttempts += r.befriendAttempts;
    }
  }
  return {
    winRate: wins / seeds,
    avgTurns: turns / seeds,
    avgFinishers: finishers / seeds,
    avgStatuses: statuses / seeds,
    recruitRate: recruits / seeds,
    fleeRate: fled / seeds,
    avgAttemptsToRecruit: recruits > 0 ? recruitAttempts / recruits : 0,
  };
}

/** 1v1 equal-level win rate (shorthand for the balance tests). */
export function winRate(
  playerId: string,
  wildId: string,
  policy: SparPolicy,
  seeds = 200,
  options: { level?: number; tutorial?: boolean } = {},
): number {
  return sparStats({ party: [playerId], wild: wildId, policy, ...options }, seeds).winRate;
}
