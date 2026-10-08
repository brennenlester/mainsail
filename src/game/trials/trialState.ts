import { isValidTrialDay, parseTrialDayKey, trialDayKey, trialRng, type TrialDay } from "./trialSeed";

/**
 * Eclipse Trial save record (#420): best score per day, streak, daily reward
 * claim. Stored as the optional `eclipseTrials` save field and repaired, never
 * rejected, on load — a hostile or future-version value just reads as "no
 * trials yet" (or keeps whatever parts are valid).
 */

export type TrialRecord = {
  /** Best score per day key ("2026-10-08"), most recent BEST_DAYS_KEPT days. */
  best: Record<string, number>;
  /** Days in a row with a showing (>= SHOWING_ROUNDS rounds cleared). */
  streak: number;
  /** Last day with a showing (drives the streak). */
  lastShowingDay: TrialDay | null;
  /** Last day the whole trial was cleared. */
  lastClearedDay: TrialDay | null;
  /** Daily Dust claim: the day and the most rounds already paid for. */
  claimDay: TrialDay | null;
  claimRounds: number;
  /** Day the first-full-clear bonus roll was spent. */
  bonusDay: TrialDay | null;
};

export const BEST_DAYS_KEPT = 30;
export const MAX_TRIAL_SCORE = 100_000;
export const MAX_STREAK = 9_999;
/** Rounds a run must clear to count for the streak and pay Dust. */
export const SHOWING_ROUNDS = 3;
/** Extra Dust for a full clear on top of one per round. */
export const FULL_CLEAR_DUST_BONUS = 2;
/** First full clear of the day: chance the lead gets the rare tint (else a bond bump). */
export const RARE_TINT_CHANCE = 0.12;
export const TRIAL_BOND_BUMP = 8;

export function emptyTrialRecord(): TrialRecord {
  return {
    best: {},
    streak: 0,
    lastShowingDay: null,
    lastClearedDay: null,
    claimDay: null,
    claimRounds: 0,
    bonusDay: null,
  };
}

let record: TrialRecord = emptyTrialRecord();

export function getTrialRecord(): Readonly<TrialRecord> {
  return record;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dayOrNull(value: unknown): TrialDay | null {
  return isValidTrialDay(value) ? value : null;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** Keep only the most recent `BEST_DAYS_KEPT` valid day keys. */
function trimBest(best: Record<string, number>): Record<string, number> {
  const keys = Object.keys(best)
    .filter((k) => parseTrialDayKey(k) !== null)
    .sort()
    .slice(-BEST_DAYS_KEPT);
  return Object.fromEntries(keys.map((k) => [k, best[k]!]));
}

/** Lenient repair of a saved record: every bad part falls back on its own. */
export function sanitizeTrialRecord(raw: unknown): TrialRecord {
  const out = emptyTrialRecord();
  if (!isPlainObject(raw)) {
    return out;
  }
  if (isPlainObject(raw.best)) {
    const best: Record<string, number> = {};
    for (const [key, score] of Object.entries(raw.best)) {
      if (
        parseTrialDayKey(key) !== null &&
        typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 0
      ) {
        best[key] = Math.min(MAX_TRIAL_SCORE, Math.floor(score));
      }
    }
    out.best = trimBest(best);
  }
  out.streak = intIn(raw.streak, 0, MAX_STREAK, 0);
  out.lastShowingDay = dayOrNull(raw.lastShowingDay);
  out.lastClearedDay = dayOrNull(raw.lastClearedDay);
  out.claimDay = dayOrNull(raw.claimDay);
  out.claimRounds = out.claimDay === null ? 0 : intIn(raw.claimRounds, 0, 5, 0);
  out.bonusDay = dayOrNull(raw.bonusDay);
  if (out.lastShowingDay === null) {
    out.streak = 0;
  }
  return out;
}

export function setTrialRecordFromSnapshot(raw: unknown): void {
  record = sanitizeTrialRecord(raw);
}

/** Save field value; undefined until the first trial (keeps old-shaped saves). */
export function getTrialRecordSnapshot(): TrialRecord | undefined {
  const r = record;
  const untouched =
    Object.keys(r.best).length === 0 &&
    r.streak === 0 &&
    r.lastShowingDay === null &&
    r.lastClearedDay === null &&
    r.claimDay === null &&
    r.bonusDay === null;
  return untouched ? undefined : structuredClone(r);
}

export function bestScoreFor(day: TrialDay): number | null {
  return record.best[trialDayKey(day)] ?? null;
}

/** Streak as of `today` (a missed day reads as 0 until the next showing). */
export function currentStreak(today: TrialDay): number {
  const last = record.lastShowingDay;
  return last !== null && today - last <= 1 ? record.streak : 0;
}

/** Folklore Dust a run is worth (before the daily cap): 1 per round from SHOWING_ROUNDS, +2 for a full clear. */
export function trialDustFor(rounds: number, totalRounds: number): number {
  if (rounds < SHOWING_ROUNDS) {
    return 0;
  }
  return rounds + (rounds >= totalRounds ? FULL_CLEAR_DUST_BONUS : 0);
}

export type TrialBonus = { kind: "rare" } | { kind: "bond"; amount: number };

export type TrialSettlement = {
  newBest: boolean;
  best: number;
  streak: number;
  /** Dust to grant now (top-up over what today already paid). */
  dust: number;
  /** First full clear of the day: the bonus roll (the caller applies it). */
  bonus: TrialBonus | null;
};

/**
 * Record a finished host run of `day` (today's seed) and work out the
 * capped rewards. Pure on the record: the caller grants Dust / bonus.
 */
export function settleTrialRun(
  day: TrialDay,
  run: { score: number; rounds: number; totalRounds: number },
  leadCanGoRare: boolean,
): TrialSettlement {
  const key = trialDayKey(day);
  const score = Math.min(MAX_TRIAL_SCORE, Math.max(0, Math.floor(run.score)));
  const prior = record.best[key];
  const newBest = prior === undefined || score > prior;
  if (newBest) {
    record.best = trimBest({ ...record.best, [key]: score });
  }
  if (run.rounds >= SHOWING_ROUNDS && record.lastShowingDay !== day) {
    record.streak =
      record.lastShowingDay !== null && day - record.lastShowingDay === 1
        ? Math.min(MAX_STREAK, record.streak + 1)
        : 1;
    record.lastShowingDay = day;
  }
  const cleared = run.rounds >= run.totalRounds;
  if (cleared) {
    record.lastClearedDay = day;
  }
  const paid = record.claimDay === day ? record.claimRounds : 0;
  const dust = Math.max(0, trialDustFor(run.rounds, run.totalRounds) - trialDustFor(paid, run.totalRounds));
  if (run.rounds > paid && run.rounds >= SHOWING_ROUNDS) {
    record.claimDay = day;
    record.claimRounds = Math.min(run.totalRounds, run.rounds);
  }
  let bonus: TrialBonus | null = null;
  if (cleared && record.bonusDay !== day) {
    record.bonusDay = day;
    const roll = trialRng(day, "reward")();
    bonus = leadCanGoRare && roll < RARE_TINT_CHANCE ? { kind: "rare" } : { kind: "bond", amount: TRIAL_BOND_BUMP };
  }
  return { newBest, best: record.best[key] ?? score, streak: currentStreak(day), dust, bonus };
}

/** Test-only reset. */
export function resetTrialRecordForTest(): void {
  record = emptyTrialRecord();
}
