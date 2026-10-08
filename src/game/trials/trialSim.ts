import { matchupMultiplier, resolveMatchup, type FolkloreType } from "../creatures/folkloreTypes";
import type { BattleCombatant } from "../creatures/types";
import { chooseEnemyIntent, executeMove, isFainted, primeOpeningCooldowns } from "../battle/battleLogic";
import { moveRole } from "../battle/kits";
import { chooseMove, seededRng, simCombatant, type SparPolicy } from "../battle/sparSim";
import { tickStatuses } from "../battle/statusEffects";
import { MAX_LEVEL } from "../progression/leveling";
import type { BoonId } from "./boons";
import { scoreTrial, type TrialRoundRecord, type TrialScore } from "./scoring";
import { TrialBattle } from "./trialBattle";
import type { TrialPlan } from "./trialPlan";
import { applyMend, roundRecovery } from "./trialRules";
import type { TrialDay } from "./trialSeed";

/**
 * Headless Eclipse Trial (#420) on the same TrialBattle rules BattleScene
 * uses, with the sparSim move policies: five rounds in a row, HP carried
 * between them, a boon pick after every cleared round. Turn order mirrors
 * BattleScene (player first; boss transform is her turn; the foe's echo
 * follows its telegraphed move; ticks; Moonfed regen).
 */
export type TrialSimPolicy = Exclude<SparPolicy, "befriend">;

export type TrialSimSetup = {
  /** Party species, lead first. */
  party: readonly string[];
  level: number;
  policy: TrialSimPolicy;
  day: TrialDay;
};

export type TrialSimResult = {
  score: TrialScore;
  roundsCleared: number;
  cleared: boolean;
  boons: (BoonId | null)[];
};

const MAX_TURNS = 80;

function edge(mine: FolkloreType, theirs: FolkloreType): number {
  return (
    matchupMultiplier(resolveMatchup(mine, theirs)) /
    matchupMultiplier(resolveMatchup(theirs, mine))
  );
}

/** Policy boon pick; null = skip. Skilled reads HP first, then the next round's rules. */
export function chooseSimBoon(
  policy: TrialSimPolicy,
  offers: readonly BoonId[],
  hpShare: number,
  anyFainted: boolean,
  nextHasEntryStatus: boolean,
  rng: () => number,
): BoonId | null {
  if (policy === "random") {
    return offers[Math.floor(rng() * offers.length)] ?? null;
  }
  const has = (id: BoonId) => offers.includes(id);
  if (has("mend") && (anyFainted || hpShare < (policy === "skilled" ? 0.75 : 0.5))) {
    return "mend";
  }
  const order: BoonId[] =
    policy === "skilled"
      ? [...(nextHasEntryStatus ? (["pure-light"] as BoonId[]) : []), "keen-edge", "quickened", "moon-shield", "mend", "swift-swap", "pure-light"]
      : ["keen-edge", "quickened", "mend", "moon-shield", "swift-swap", "pure-light"];
  return order.find(has) ?? offers[0] ?? null;
}

type Member = { combatant: BattleCombatant; entered: boolean };

function runRound(
  battle: TrialBattle,
  members: Member[],
  policy: TrialSimPolicy,
  rng: () => number,
): boolean {
  const skilled = policy === "skilled";
  const foe = (): BattleCombatant => battle.foe;
  const standing = () => members.map((_, i) => i).filter((i) => !isFainted(members[i]!.combatant));
  let active = standing()[0];
  if (active === undefined) {
    return false;
  }
  const enter = (i: number): void => {
    const m = members[i]!;
    if (!m.entered) {
      m.entered = true;
      primeOpeningCooldowns(m.combatant);
      battle.decoratePlayer(m.combatant, true);
    }
  };
  const bestBench = (): number | undefined =>
    standing()
      .filter((i) => i !== active)
      .sort((a, b) => edge(members[b]!.combatant.folkloreType, foe().folkloreType) - edge(members[a]!.combatant.folkloreType, foe().folkloreType))[0];
  const benchBeats = (): number | undefined => {
    const c = bestBench();
    return c !== undefined &&
      edge(members[c]!.combatant.folkloreType, foe().folkloreType) >
        edge(members[active!]!.combatant.folkloreType, foe().folkloreType)
      ? c
      : undefined;
  };
  const replace = (): boolean => {
    const options = standing().filter((i) => i !== active);
    if (options.length === 0) {
      return false;
    }
    active = skilled ? bestBench()! : options[0]!;
    enter(active);
    return true;
  };
  enter(active);
  battle.startFoe();
  const intentFor = (p: BattleCombatant) =>
    battle.boss ? battle.boss.intentFor(p, rng) : { move: chooseEnemyIntent(foe(), p, rng, { matchupAware: true }).move };
  let player = members[active]!.combatant;
  let intent = intentFor(player);
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (skilled && battle.freeSwitchesLeft > 0) {
      const c = benchBeats();
      if (c !== undefined) {
        battle.takeFreeSwitch();
        active = c;
        enter(active);
        player = members[active]!.combatant;
      }
    }
    battle.notePlayerTurn();
    const swap = skilled && intent.move.power <= 0 ? benchBeats() : undefined;
    if (swap !== undefined) {
      active = swap;
      enter(active);
      player = members[active]!.combatant;
    } else {
      const move = chooseMove(policy, player, foe(), intent.move, rng);
      executeMove(player, move, foe(), rng);
      const transformed = battle.boss?.checkTransform() ?? null;
      if (isFainted(foe())) {
        return true;
      }
      tickStatuses(player);
      battle.playerEndTurn(player);
      if (isFainted(player)) {
        if (!replace()) return false;
        player = members[active]!.combatant;
        intent = intentFor(player);
        continue;
      }
      if (transformed) {
        intent = intentFor(player);
        continue;
      }
    }
    const guarded = player.guarding === true;
    const result = executeMove(foe(), intent.move, player, rng);
    battle.boss?.onFoeActed(intent.move, guarded, result);
    battle.noteFoeMove(guarded, moveRole(intent.move), result.attack?.kind === "hit");
    battle.afterFoeMove(foe(), player, intent.move, rng);
    player.guarding = false;
    tickStatuses(foe());
    battle.foeEndTurn(foe());
    battle.boss?.checkTransform();
    if (isFainted(foe())) {
      return true;
    }
    if (isFainted(player)) {
      if (!replace()) return false;
      player = members[active]!.combatant;
    }
    intent = intentFor(player);
  }
  return false;
}

export function simulateTrial(setup: TrialSimSetup, seed: number, plan: TrialPlan): TrialSimResult {
  const rng = seededRng(seed);
  // HP persists across rounds; battle-only state (statuses, cooldowns, scales) does not.
  const hp = setup.party.map((id) => simCombatant(id, setup.level).maxHp);
  const maxHp = [...hp];
  const records: TrialRoundRecord[] = [];
  const picked: (BoonId | null)[] = [];
  let pending: BoonId[] = [];
  for (const round of plan.rounds) {
    const standing = hp.filter((v) => v > 0).length;
    const battle = new TrialBattle({
      plan,
      round,
      partyAverage: setup.level,
      partySize: standing,
      boons: pending,
      maxLevel: MAX_LEVEL,
    });
    const members: Member[] = setup.party.map((id, i) => {
      const combatant = simCombatant(id, setup.level);
      combatant.currentHp = hp[i]!;
      return { combatant, entered: false };
    });
    const before = hp.reduce((a, b) => a + b, 0);
    const won = runRound(battle, members, setup.policy, rng);
    members.forEach((m, i) => {
      hp[i] = Math.max(0, Math.min(maxHp[i]!, m.combatant.currentHp));
    });
    const after = hp.reduce((a, b) => a + b, 0);
    records.push({
      cleared: won,
      boss: round.kind === "boss",
      turns: battle.stats.turns,
      damageTaken: Math.max(0, before - after),
      partyMaxHp: maxHp.reduce((a, b) => a + b, 0),
      parries: battle.stats.parries,
    });
    if (!won) {
      break;
    }
    const offers = plan.boonOffers[round.index];
    if (!offers) {
      break;
    }
    roundRecovery(hp, maxHp);
    const share = hp.reduce((a, b) => a + b, 0) / maxHp.reduce((a, b) => a + b, 0);
    const next = plan.rounds[round.index + 1]!;
    const boon = chooseSimBoon(
      setup.policy,
      offers,
      share,
      hp.some((v) => v <= 0),
      next.modifiers.some((m) => m === "kindled" || m === "soaked-arena"),
      rng,
    );
    picked.push(boon);
    if (boon === "mend") {
      applyMend(hp, maxHp);
    }
    pending = boon && boon !== "mend" ? [boon] : [];
  }
  const used = picked.filter((b) => b !== null).length;
  const score = scoreTrial(records, { used, skipped: picked.length - used }, plan.rounds.length);
  return { score, roundsCleared: score.roundsCleared, cleared: score.cleared, boons: picked };
}

export type TrialSimStats = {
  clearRate: number;
  avgRounds: number;
  /** Share of runs that cleared at least N rounds, by N (index 0 = 1 round). */
  reached: number[];
  avgScore: number;
};

export function trialStats(
  setup: Omit<TrialSimSetup, "day">,
  days: readonly TrialDay[],
  runsPerDay: number,
  planFor: (day: TrialDay) => TrialPlan,
): TrialSimStats {
  let clears = 0;
  let rounds = 0;
  let score = 0;
  let n = 0;
  const reached = [0, 0, 0, 0, 0];
  for (const day of days) {
    for (let i = 0; i < runsPerDay; i++) {
      const r = simulateTrial({ ...setup, day }, day * 1000 + i, planFor(day));
      clears += r.cleared ? 1 : 0;
      rounds += r.roundsCleared;
      score += r.score.total;
      for (let k = 0; k < r.roundsCleared; k++) reached[k]! += 1;
      n += 1;
    }
  }
  return {
    clearRate: clears / n,
    avgRounds: rounds / n,
    reached: reached.map((v) => v / n),
    avgScore: score / n,
  };
}
