import { addBond, BOND_HALVED_ABOVE_TIER, drainBondTierUps } from "../companions/bond";
import { getCreatureDefinition } from "../creatures/catalog";
import { displayNameIn } from "../creatures/displayName";
import {
  ACTIVE_PARTY_LIMIT,
  addToParty,
  getActiveCreatures,
  getEffectiveMaxHp,
  playerParty,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { addMaterial, playerInventory, setInventoryFromSnapshot } from "../inventory/playerInventory";
import { MAX_LEVEL } from "../progression/leveling";
import { getActiveStorySpar } from "../battle/storySpar";
import { isTrialsUnlocked } from "./trialUnlock";
import { setSparWinsBySpecies, sparWinsBySpecies } from "../world/sparWins";
import {
  flushPendingHostSave,
  notifyWorldChanged,
  resumeHostPersist,
  suspendHostPersist,
} from "../world/worldSaveSchedule";
import { isVisitorMode } from "../world/worldSession";
import { markCreatureDiscovered } from "../world/worldState";
import type { BoonId } from "./boons";
import { buildTrialPlan } from "./dailyTrial";
import { scoreTrial, trialTitle, type TrialRoundRecord, type TrialScore } from "./scoring";
import { TrialBattle, trialPartyStrength } from "./trialBattle";
import { BOSS_ROUND_INDEX, type TrialPlan, type TrialRoundPlan } from "./trialPlan";
import { applyMend, roundRecovery } from "./trialRules";
import { todayTrialDay, type TrialDay } from "./trialSeed";
import { settleTrialRun, SHOWING_ROUNDS, type TrialSettlement } from "./trialState";

/**
 * Eclipse Trial runtime (#420): one gauntlet from Begin to the results card.
 *
 * Soft overworld rules: a trial is a sandbox on the real party. Everything a
 * battle could change (HP, XP, levels, bond, materials, items, spar-win
 * counts) is snapshotted at the start and restored exactly at the end, win
 * or lose — the only lasting effects are the capped daily rewards and the
 * trial record, applied after the restore. Host persistence is paused for
 * the whole run (story-spar pattern, #382), so closing the tab mid-trial
 * reloads the pre-trial save with no rewards.
 *
 * Link sessions (`?trial=`) run in "sandbox" mode inside the card sandbox
 * (visitor mode + persistence never resumed, main.ts): no rewards, no record.
 */

export type TrialMode = "host" | "sandbox";

/** Borrowed party for link visitors without a finished game (sandbox memory only). */
export const BORROWED_PARTY = ["bramblewarden", "hearthflame", "brook-nymph"] as const;
export const BORROWED_LEVEL = 9;

type Snapshot = {
  creatures: CreatureInstance[];
  activeIds: string[];
  materials: Record<string, number>;
  items: Record<string, number>;
  sparWins: Record<string, number>;
};

export type TrialRunState = {
  day: TrialDay;
  mode: TrialMode;
  plan: TrialPlan;
  /** Round being played or offered next. */
  roundIndex: number;
  records: TrialRoundRecord[];
  /** One entry per boon screen: the pick, or null when skipped. */
  boonPicks: (BoonId | null)[];
  /** Boons that shape the next round (Mend already applied). */
  pendingBoons: BoonId[];
  /** The round in progress (null between rounds). */
  battle: TrialBattle | null;
  /** Party HP total when the current round started. */
  roundHpBefore: number;
  /** Species actually fought; they reach the codex once the run settles. */
  faced: string[];
  phase: "preview" | "battle" | "boon" | "done";
};

export type TrialOutcome = {
  day: TrialDay;
  mode: TrialMode;
  score: TrialScore;
  title: string;
  /** Modifiers of every round reached, in order (for the result card). */
  modifiers: TrialRoundPlan["modifiers"][];
  /** Species ids of the party that ran it (for the result card). */
  party: { id: string; nickname?: string; rare: boolean }[];
  settlement: TrialSettlement | null;
  /** Reward lines for the results screen. */
  rewards: string[];
  /** Why nothing was paid (shown on the results screen), or null. */
  noRewardReason: string | null;
};

let run: TrialRunState | null = null;
let snapshot: Snapshot | null = null;
let lastOutcome: TrialOutcome | null = null;

export { isTrialsUnlocked };

export function getTrialRun(): Readonly<TrialRunState> | null {
  return run;
}

export function isTrialActive(): boolean {
  return run !== null;
}

/** Why a host trial can't start now (null = it can). */
export function trialBlockReason(): string | null {
  if (isVisitorMode()) {
    return "Trials run in your own world.";
  }
  if (!isTrialsUnlocked()) {
    return "The Eclipse Gate is sealed until the story is complete.";
  }
  if (getActiveStorySpar() !== null || run !== null) {
    return "Finish the current battle first.";
  }
  if (getActiveCreatures().length === 0) {
    return "Add a companion to your active party first.";
  }
  return null;
}

function takeSnapshot(): Snapshot {
  return {
    creatures: structuredClone(playerParty.creatures),
    activeIds: [...playerParty.activeInstanceIds],
    materials: { ...playerInventory.materials },
    items: { ...playerInventory.items },
    sparWins: { ...sparWinsBySpecies },
  };
}

/** Exact restore, keeping creature object identity (overworld followers hold them). */
function restoreSnapshot(before: Snapshot): void {
  setInventoryFromSnapshot(before.materials, before.items);
  setSparWinsBySpecies(before.sparWins, false);
  drainBondTierUps();
  const byId = new Map(playerParty.creatures.map((c) => [c.instanceId, c]));
  playerParty.creatures.length = 0;
  for (const saved of before.creatures) {
    const live = byId.get(saved.instanceId);
    if (live) {
      for (const key of Object.keys(live)) {
        if (!(key in saved)) {
          delete (live as Record<string, unknown>)[key];
        }
      }
      Object.assign(live, structuredClone(saved));
      playerParty.creatures.push(live);
    } else {
      playerParty.creatures.push(structuredClone(saved));
    }
  }
  playerParty.activeInstanceIds = [...before.activeIds];
}

/** Link visitors: their own finished party when the read-only save has one, else the loaners. */
function ensureSandboxParty(): void {
  if (isTrialsUnlocked() && playerParty.creatures.length > 0) {
    if (playerParty.activeInstanceIds.length === 0) {
      playerParty.activeInstanceIds = playerParty.creatures
        .slice(0, ACTIVE_PARTY_LIMIT)
        .map((c) => c.instanceId);
    }
    return;
  }
  // ponytail: sandbox memory only; the read-only save is never written (main.ts).
  playerParty.creatures.length = 0;
  playerParty.activeInstanceIds = [];
  for (const id of BORROWED_PARTY) {
    addToParty(id, BORROWED_LEVEL);
  }
}

function partyHp(): { hp: number[]; max: number[] } {
  const actives = getActiveCreatures();
  return {
    hp: actives.map((c) => Math.max(0, c.currentHp)),
    max: actives.map((c) => getEffectiveMaxHp(c)),
  };
}

function writePartyHp(hp: readonly number[]): void {
  getActiveCreatures().forEach((c, i) => {
    c.currentHp = Math.max(0, Math.min(getEffectiveMaxHp(c), hp[i] ?? c.currentHp));
  });
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * Start a trial for `day`. Host runs need the Gate open (see
 * `trialBlockReason`); sandbox runs (share links) borrow a party if needed.
 */
export function beginTrial(day: TrialDay = todayTrialDay(), mode: TrialMode = "host"): boolean {
  if (run) {
    return false;
  }
  if (mode === "host" && trialBlockReason() !== null) {
    return false;
  }
  if (mode === "sandbox") {
    ensureSandboxParty();
  }
  if (getActiveCreatures().length === 0) {
    return false;
  }
  const plan = buildTrialPlan(day);
  // Persist the pre-trial world now, then hold persistence until the end:
  // a reload mid-trial restores exactly this state.
  flushPendingHostSave();
  suspendHostPersist();
  snapshot = takeSnapshot();
  // Every trial starts fresh: full HP, whatever the overworld left.
  for (const creature of getActiveCreatures()) {
    creature.currentHp = getEffectiveMaxHp(creature);
  }
  run = {
    day,
    mode,
    plan,
    roundIndex: 0,
    records: [],
    boonPicks: [],
    pendingBoons: [],
    battle: null,
    roundHpBefore: 0,
    faced: [],
    phase: "preview",
  };
  lastOutcome = null;
  return true;
}

function activeAverageLevel(): number {
  const actives = getActiveCreatures();
  return Math.max(1, Math.round(sum(actives.map((c) => c.level)) / Math.max(1, actives.length)));
}

/** Foe level of the round about to be played (preview / boon screens). */
export function previewRoundLevel(): number {
  const round = run?.plan.rounds[run.roundIndex];
  return Math.min(MAX_LEVEL, Math.max(1, activeAverageLevel() + (round?.levelBonus ?? 0)));
}

/** Build the next round's battle (rules + foe). BattleScene takes it as `trial` init data. */
export function startTrialRound(): TrialBattle | null {
  if (!run || run.phase !== "preview") {
    return null;
  }
  const round = run.plan.rounds[run.roundIndex];
  if (!round) {
    return null;
  }
  const standing = getActiveCreatures().filter((c) => c.currentHp > 0);
  run.battle = new TrialBattle({
    plan: run.plan,
    round,
    partyAverage: activeAverageLevel(),
    partySize: standing.length,
    partyStrength: trialPartyStrength(getActiveCreatures().map((c) => c.definitionId)),
    boons: run.pendingBoons,
    maxLevel: MAX_LEVEL,
  });
  run.battle.hud.roundsTotal = run.plan.rounds.length;
  run.battle.hud.scoreSoFar = runningScore();
  run.roundHpBefore = sum(partyHp().hp);
  if (!getCreatureDefinition(round.creatureId).excludeFromCodex && !run.faced.includes(round.creatureId)) {
    run.faced.push(round.creatureId);
  }
  run.phase = "battle";
  return run.battle;
}

export type RoundVerdict = { won: boolean; finished: boolean };

/**
 * Settle the round after its battle closed (`won` = the foe fell). A loss
 * (or the last round) finishes the trial; otherwise the boon screen is next.
 */
export function endTrialRound(won: boolean): RoundVerdict {
  if (!run || run.phase !== "battle" || !run.battle) {
    return { won: false, finished: true };
  }
  const battle = run.battle;
  const { hp, max } = partyHp();
  run.records.push({
    cleared: won,
    boss: battle.isBoss,
    turns: battle.stats.turns,
    damageTaken: Math.max(0, run.roundHpBefore - sum(hp)),
    partyMaxHp: sum(max),
    parries: battle.stats.parries,
  });
  run.battle = null;
  run.pendingBoons = [];
  if (!won || run.roundIndex >= BOSS_ROUND_INDEX) {
    run.phase = "done";
    return { won, finished: true };
  }
  roundRecovery(hp, max);
  writePartyHp(hp);
  run.roundIndex += 1;
  run.phase = "boon";
  return { won, finished: false };
}

/** Score of the rounds played so far (the HUD ticker). */
export function runningScore(): number {
  if (!run) {
    return 0;
  }
  const used = run.boonPicks.filter((b) => b !== null).length;
  return scoreTrial(run.records, { used, skipped: run.boonPicks.length - used }, run.plan.rounds.length).total;
}

/** Boon offers for the screen after the round just cleared. */
export function currentBoonOffers(): BoonId[] {
  if (!run || run.phase !== "boon") {
    return [];
  }
  return run.plan.boonOffers[run.roundIndex - 1] ?? [];
}

/** Take a boon (or null = skip it for score). Mend heals now; the rest shape the next round. */
export function chooseTrialBoon(id: BoonId | null): boolean {
  if (!run || run.phase !== "boon") {
    return false;
  }
  if (id !== null && !currentBoonOffers().includes(id)) {
    return false;
  }
  run.boonPicks.push(id);
  if (id === "mend") {
    const { hp, max } = partyHp();
    applyMend(hp, max);
    writePartyHp(hp);
  } else if (id !== null) {
    run.pendingBoons = [id];
  }
  run.phase = "preview";
  return true;
}

/** Any standing companion left for the next round? */
export function trialPartyStanding(): boolean {
  return getActiveCreatures().some((c) => c.currentHp > 0);
}

function grantRewards(day: TrialDay, score: TrialScore, totalRounds: number): { settlement: TrialSettlement; lines: string[] } {
  const lead = getActiveCreatures()[0];
  const settlement = settleTrialRun(
    day,
    { score: score.total, rounds: score.roundsCleared, totalRounds },
    Boolean(lead && lead.rare !== true),
  );
  const lines: string[] = [];
  if (settlement.dust > 0) {
    addMaterial("folklore-dust", settlement.dust);
    lines.push(`+${settlement.dust} Folklore Dust`);
  }
  if (settlement.bonus && lead) {
    const name = displayNameIn(lead, getActiveCreatures());
    if (settlement.bonus.kind === "rare") {
      lead.rare = true;
      lines.push(`${name} drank the eclipse light — a rare tint!`);
    } else {
      // Same daily cap and halving as spar bond (#421).
      const gained = addBond(lead, settlement.bonus.amount, "battle", {
        capped: true,
        halveAboveTier: BOND_HALVED_ABOVE_TIER,
      }).gained;
      lines.push(gained > 0 ? `${name}: bond +${gained}` : `${name}'s bond is full for today`);
    }
  }
  return { settlement, lines };
}

/**
 * End the trial: score it, restore the pre-trial world exactly, then (host,
 * today's seed only) record it and grant the capped rewards, and resume
 * saving. Safe to call in any phase; a run that never cleared a round still
 * records nothing beyond its best score.
 */
export function finishTrial(): TrialOutcome | null {
  if (!run || !snapshot) {
    return null;
  }
  const current = run;
  const total = current.plan.rounds.length;
  const used = current.boonPicks.filter((b) => b !== null).length;
  const score = scoreTrial(current.records, { used, skipped: current.boonPicks.length - used }, total);
  const party = getActiveCreatures().map((c) => ({
    id: c.definitionId,
    ...(c.nickname ? { nickname: c.nickname } : {}),
    rare: c.rare === true,
  }));
  restoreSnapshot(snapshot);
  recordDiscoveries(current);
  const reached = Math.min(total, current.records.length);
  const modifiers = current.plan.rounds.slice(0, Math.max(1, reached)).map((r) => r.modifiers);
  let settlement: TrialSettlement | null = null;
  let rewards: string[] = [];
  let noRewardReason: string | null = null;
  const today = todayTrialDay();
  if (current.mode !== "host" || isVisitorMode()) {
    noRewardReason = "Practice run — nothing is saved.";
  } else if (current.day !== today && current.day !== today - 1) {
    noRewardReason = "That trial's day has passed — rewards come from today's trial.";
  } else {
    // A run that started before UTC midnight still pays, keyed to its start day.
    const granted = grantRewards(current.day, score, total);
    settlement = granted.settlement;
    rewards = granted.lines;
    if (rewards.length === 0) {
      noRewardReason =
        score.roundsCleared < SHOWING_ROUNDS
          ? `Clear ${SHOWING_ROUNDS} rounds for the day's Folklore Dust.`
          : settlement.dust === 0 && settlement.claimed
            ? "This day's rewards are already claimed — the score still counts."
            : "Rewards are paid once per day.";
    }
  }
  run = null;
  snapshot = null;
  resumeHostPersist();
  notifyWorldChanged();
  lastOutcome = {
    day: current.day,
    mode: current.mode,
    score,
    title: trialTitle(score.total, score.roundsCleared, total),
    modifiers,
    party,
    settlement,
    rewards,
    noRewardReason,
  };
  return lastOutcome;
}

/** Walk away / a battle that never came up: restore everything, record nothing. */
export function abandonTrial(): void {
  if (!run) {
    return;
  }
  if (snapshot) {
    restoreSnapshot(snapshot);
  }
  recordDiscoveries(run);
  run = null;
  snapshot = null;
  resumeHostPersist();
  notifyWorldChanged();
}

/** Foes actually fought join the codex after the restore (host world only). */
function recordDiscoveries(current: TrialRunState): void {
  if (current.mode !== "host" || isVisitorMode()) {
    return;
  }
  for (const id of current.faced) {
    markCreatureDiscovered(id);
  }
}

export function getLastTrialOutcome(): TrialOutcome | null {
  return lastOutcome;
}

/** Test-only reset. */
export function resetTrialRunForTest(): void {
  if (run) {
    resumeHostPersist();
  }
  run = null;
  snapshot = null;
  lastOutcome = null;
}
