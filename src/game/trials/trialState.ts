import { isValidTrialDay, parseTrialDayKey, todayTrialDay, trialDayKey, trialRng, type TrialDay } from "./trialSeed";

/**
 * Eclipse Trial save record (#420): best score per day, streak, daily reward
 * claim. Stored as the optional `eclipseTrials` save field and repaired, never
 * rejected, on load — a hostile or future-version value just reads as "no
 * trials yet" (or keeps whatever parts are valid).
 *
 * Multi-tab: like the rest of the host save, the last tab to save wins. Each
 * tab writes its whole world (inventory included), so two tabs cannot stack
 * a day's rewards — the other tab's run (and its payout) is simply lost.
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
  /**
   * Daily Dust claims: rounds already paid for, per day key, for the last
   * CLAIM_DAYS_KEPT days (a clock toggled back to an earlier day finds its
   * claim; older days never pay).
   */
  claims: Record<string, number>;
  /** Day the first-full-clear bonus roll was spent. */
  bonusDays: string[];
  /** A host trial has been played to its end once (drives the Gate pointer, #423). */
  attempted: boolean;
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
/** Recent days whose claims are remembered; a day older than the newest claim by this many never pays. */
export const CLAIM_DAYS_KEPT = 7;

export function emptyTrialRecord(): TrialRecord {
  return {
    best: {},
    streak: 0,
    lastShowingDay: null,
    lastClearedDay: null,
    claims: {},
    bonusDays: [],
    attempted: false,
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

/** Keep only the most recent `keep` valid day keys. */
function trimDays(map: Record<string, number>, keep: number): Record<string, number> {
  const keys = Object.keys(map)
    .filter((k) => parseTrialDayKey(k) !== null)
    .sort()
    .slice(-keep);
  return Object.fromEntries(keys.map((k) => [k, map[k]!]));
}

function trimBest(best: Record<string, number>): Record<string, number> {
  return trimDays(best, BEST_DAYS_KEPT);
}

/** Lenient repair of a saved record: every bad part falls back on its own. */
export function sanitizeTrialRecord(raw: unknown, today: TrialDay = todayTrialDay()): TrialRecord {
  const out = emptyTrialRecord();
  // Days past tomorrow come from a clock set forward or a hostile save: never trusted.
  const notFuture = (key: string): boolean => {
    const day = parseTrialDayKey(key);
    return day !== null && day <= today + 1;
  };
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
  if (out.lastShowingDay !== null && out.lastShowingDay > today + 1) {
    out.lastShowingDay = null;
  }
  out.lastClearedDay = dayOrNull(raw.lastClearedDay);
  if (isPlainObject(raw.claims)) {
    const claims: Record<string, number> = {};
    for (const [key, rounds] of Object.entries(raw.claims)) {
      if (notFuture(key)) {
        claims[key] = intIn(rounds, 0, 5, 5);
      }
    }
    out.claims = trimDays(claims, CLAIM_DAYS_KEPT);
  }
  if (Array.isArray(raw.bonusDays)) {
    const days = [...new Set(raw.bonusDays.filter((k): k is string => typeof k === "string" && notFuture(k)))].sort();
    out.bonusDays = days.slice(-CLAIM_DAYS_KEPT);
  }
  if (out.lastShowingDay === null) {
    out.streak = 0;
  }
  // Older saves never stored the flag: any recorded score means a trial was played.
  out.attempted = raw.attempted === true || Object.keys(out.best).length > 0;
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
    Object.keys(r.claims).length === 0 &&
    r.bonusDays.length === 0 &&
    !r.attempted;
  return untouched ? undefined : structuredClone(r);
}

/** True once a host trial has been settled (any outcome). */
export function hasAttemptedTrial(): boolean {
  return record.attempted;
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
  /** The day had already been paid for (or is too old to pay). */
  claimed: boolean;
};

/**
 * Record a finished host run of `day` (today's seed) and work out the
 * capped rewards. Pure on the record: the caller grants Dust / bonus.
 */
export function settleTrialRun(
  day: TrialDay,
  run: { score: number; rounds: number; totalRounds: number },
  leadCanGoRare: boolean,
  today: TrialDay = todayTrialDay(),
): TrialSettlement {
  const key = trialDayKey(day);
  record.attempted = true;
  const score = Math.min(MAX_TRIAL_SCORE, Math.max(0, Math.floor(run.score)));
  const prior = record.best[key];
  const newBest = prior === undefined || score > prior;
  if (newBest) {
    record.best = trimBest({ ...record.best, [key]: score });
  }
  // Only a later day moves the streak: replaying an earlier day (clock set back) never resets it.
  if (run.rounds >= SHOWING_ROUNDS && (record.lastShowingDay === null || day > record.lastShowingDay)) {
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
  // Claims dated past tomorrow (clock moved forward once) never count as "newest".
  const known = Object.keys(record.claims)
    .map((k) => parseTrialDayKey(k)!)
    .filter((d) => d <= today + 1);
  const newest = known.length > 0 ? Math.max(...known) : day;
  // A clock set back past the remembered window never pays again.
  const tooOld = day <= newest - CLAIM_DAYS_KEPT;
  const paid = tooOld ? run.totalRounds : (record.claims[key] ?? 0);
  const dust = Math.max(0, trialDustFor(run.rounds, run.totalRounds) - trialDustFor(paid, run.totalRounds));
  if (!tooOld && run.rounds > paid && run.rounds >= SHOWING_ROUNDS) {
    record.claims = trimDays({ ...record.claims, [key]: Math.min(run.totalRounds, run.rounds) }, CLAIM_DAYS_KEPT);
  }
  let bonus: TrialBonus | null = null;
  const bonusSpent = tooOld || record.bonusDays.includes(key);
  if (cleared && !bonusSpent) {
    record.bonusDays = [...record.bonusDays, key].sort().slice(-CLAIM_DAYS_KEPT);
    const roll = trialRng(day, "reward")();
    bonus = leadCanGoRare && roll < RARE_TINT_CHANCE ? { kind: "rare" } : { kind: "bond", amount: TRIAL_BOND_BUMP };
  }
  return { newBest, best: record.best[key] ?? score, streak: currentStreak(day), dust, bonus, claimed: paid > 0 };
}

/** Test-only reset. */
export function resetTrialRecordForTest(): void {
  record = emptyTrialRecord();
}
