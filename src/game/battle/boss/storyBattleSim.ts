import { matchupMultiplier, resolveMatchup, type FolkloreType } from "../../creatures/folkloreTypes";
import type { BattleCombatant } from "../../creatures/types";
import { MAX_LEVEL } from "../../progression/leveling";
import type { StorySparId } from "../../story/questTypes";
import { getStorySpar } from "../../story/storySpars";
import { executeMove, isFainted, primeOpeningCooldowns } from "../battleLogic";
import { moveRole } from "../kits";
import { chooseMove, seededRng, simCombatant, type SparPolicy } from "../sparSim";
import { tickStatuses } from "../statusEffects";
import { StoryBattle } from "./storyBattle";

/**
 * Headless story battle (#385) on the same StoryBattle controller BattleScene
 * uses, with the sparSim move policies. Turn order mirrors BattleScene: the
 * player acts, a form threshold crossed by that hit transforms the boss (her
 * turn), otherwise the foe resolves its telegraphed move, ticks, then Wren's
 * assist (boss fight) and the next telegraph.
 *
 * Switching: `skilled` spends the first (free) switch on the best type edge
 * against the current foe, and after a transformation swaps leads on the
 * boss's harmless wind-up (a paid switch that costs nothing). `max-damage` and
 * `random` only switch when a companion faints.
 */
export type StorySimSetup = {
  sparId: StorySparId;
  /** Player party, lead first. */
  party: readonly string[];
  level: number;
  /**
   * `guard-read`: casual play that only learned the boss lesson: max-damage,
   * except Guard into a telegraphed finisher (Cinderfall) when Guard is ready.
   */
  policy: Exclude<SparPolicy, "befriend"> | "guard-read";
  rematch?: boolean;
  /** Hearth Ward multiplier (1 = none). */
  ward?: number;
};

export type StorySimResult = {
  won: boolean;
  turns: number;
  transformed: boolean;
  signatures: number;
  parries: number;
  assists: number;
};

const MAX_TURNS = 80;

function edge(mine: FolkloreType, theirs: FolkloreType): number {
  return (
    matchupMultiplier(resolveMatchup(mine, theirs)) /
    matchupMultiplier(resolveMatchup(theirs, mine))
  );
}

export function simulateStoryBattle(setup: StorySimSetup, seed: number): StorySimResult {
  const rng = seededRng(seed);
  const battle = new StoryBattle(getStorySpar(setup.sparId), {
    partyAverage: setup.level,
    partySize: setup.party.length,
    ward: setup.ward ?? 1,
    rematch: setup.rematch ?? false,
    maxLevel: MAX_LEVEL,
  });
  const roster: BattleCombatant[] = setup.party.map((id) =>
    primeOpeningCooldowns(simCombatant(id, setup.level)),
  );
  const skilled = setup.policy === "skilled";
  let active = 0;
  let player = roster[0]!;
  let freeSwitch = true;
  let turns = 0;
  const result = (won: boolean): StorySimResult => ({
    won,
    turns,
    transformed: battle.stats.transforms > 0,
    signatures: battle.stats.signatures,
    parries: battle.stats.parries,
    assists: battle.stats.assists,
  });
  const living = () => roster.map((_, i) => i).filter((i) => i !== active && !isFainted(roster[i]!));
  const bestBench = (): number | undefined =>
    [...living()].sort(
      (a, b) =>
        edge(roster[b]!.folkloreType, battle.foe.folkloreType) -
        edge(roster[a]!.folkloreType, battle.foe.folkloreType),
    )[0];
  const benchBeatsActive = (): number | undefined => {
    const candidate = bestBench();
    return candidate !== undefined &&
      edge(roster[candidate]!.folkloreType, battle.foe.folkloreType) >
        edge(player.folkloreType, battle.foe.folkloreType)
      ? candidate
      : undefined;
  };
  const replaceFainted = (): boolean => {
    const options = living();
    if (options.length === 0) {
      return false;
    }
    active = skilled ? bestBench()! : options[0]!;
    player = roster[active]!;
    return true;
  };

  let intent = battle.intentFor(player, rng);
  while (turns < MAX_TURNS) {
    if (skilled && freeSwitch) {
      const candidate = benchBeatsActive();
      if (candidate !== undefined) {
        freeSwitch = false;
        active = candidate;
        player = roster[active]!;
      }
    }
    turns += 1;
    // Skilled: a harmless telegraph (wind-up / stagger) is the window for a paid swap.
    const swap = skilled && intent.move.power <= 0 ? benchBeatsActive() : undefined;
    if (swap !== undefined) {
      active = swap;
      player = roster[active]!;
    } else {
      const guard = player.moves.find((m) => moveRole(m) === "guard" && (player.cooldowns?.[m.id] ?? 0) <= 0);
      const move =
        setup.policy === "guard-read"
          ? guard && moveRole(intent.move) === "finisher"
            ? guard
            : chooseMove("max-damage", player, battle.foe, intent.move, rng)
          : chooseMove(setup.policy, player, battle.foe, intent.move, rng);
      executeMove(player, move, battle.foe, rng);
      const transformed = battle.checkTransform();
      if (isFainted(battle.foe)) {
        // Rival KO: her next creature comes out; the turn ends there.
        if (!battle.nextFoe()) {
          return result(true);
        }
        intent = battle.intentFor(player, rng);
        continue;
      }
      tickStatuses(player);
      if (isFainted(player)) {
        if (!replaceFainted()) {
          return result(false);
        }
        intent = battle.intentFor(player, rng);
        continue;
      }
      if (transformed) {
        // The transformation is her turn; the new form telegraphs next.
        intent = battle.intentFor(player, rng);
        continue;
      }
    }

    const guarded = player.guarding === true;
    const outcome = executeMove(battle.foe, intent.move, player, rng);
    battle.onFoeActed(intent.move, guarded, outcome);
    player.guarding = false;
    tickStatuses(battle.foe);
    battle.checkTransform();
    if (!isFainted(player) && !isFainted(battle.foe)) {
      battle.assistTick(player);
    }
    if (isFainted(battle.foe) && !battle.nextFoe()) {
      return result(true);
    }
    if (isFainted(player) && !replaceFainted()) {
      return result(false);
    }
    intent = battle.intentFor(player, rng);
  }
  return result(false);
}

export type StorySimStats = {
  winRate: number;
  avgTurns: number;
  transformRate: number;
  avgParries: number;
  avgAssists: number;
};

export function storyBattleStats(setup: StorySimSetup, seeds = 300): StorySimStats {
  let wins = 0;
  let turns = 0;
  let transforms = 0;
  let parries = 0;
  let assists = 0;
  const key = `${setup.sparId}|${setup.party.join("+")}|${setup.level}|${setup.rematch ? 1 : 0}`;
  // Same seed stream with or without the ward, so the ward's effect is isolated.
  let base = 2166136261;
  for (let i = 0; i < key.length; i++) {
    base = Math.imul(base ^ key.charCodeAt(i), 16777619);
  }
  base = (base >>> 0) % 1_000_000_007;
  for (let i = 0; i < seeds; i++) {
    const r = simulateStoryBattle(setup, base + i);
    wins += r.won ? 1 : 0;
    turns += r.turns;
    transforms += r.transformed ? 1 : 0;
    parries += r.parries;
    assists += r.assists;
  }
  return {
    winRate: wins / seeds,
    avgTurns: turns / seeds,
    transformRate: transforms / seeds,
    avgParries: parries / seeds,
    avgAssists: assists / seeds,
  };
}
