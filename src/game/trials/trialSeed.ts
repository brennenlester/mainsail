/**
 * Eclipse Trial seeds (#420). A trial is fully determined by its calendar
 * day (UTC): every friend who plays "2026-10-08" faces the same lineup,
 * modifiers and boon offers. The day travels in links as `?trial=YYYY-MM-DD`
 * — untrusted input, so the format is strict and the range bounded.
 */

export const TRIAL_PARAM = "trial";

/** Days since the Unix epoch (UTC). */
export type TrialDay = number;

/** Accepted day window (2024-01-01 .. 2079-12-31): anything else is a bad link. */
export const MIN_TRIAL_DAY = 19_723;
export const MAX_TRIAL_DAY = 40_176;

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's trial day: the UTC calendar date, so the seed flips at the same instant worldwide. */
export function todayTrialDay(now = Date.now()): TrialDay {
  return Math.floor(now / DAY_MS);
}

/** "2026-10-08" for a day number. */
export function trialDayKey(day: TrialDay): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Strict parse of "YYYY-MM-DD" (a real calendar date in range) -> day, else null. */
export function parseTrialDayKey(raw: unknown): TrialDay | null {
  if (typeof raw !== "string" || raw.length !== 10) {
    return null;
  }
  const match = DAY_KEY.exec(raw);
  if (!match) {
    return null;
  }
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(ms)) {
    return null;
  }
  const day = ms / DAY_MS;
  // Round-trip rejects 2026-02-31 style dates that Date.UTC rolls over.
  if (!isValidTrialDay(day) || trialDayKey(day) !== raw) {
    return null;
  }
  return day;
}

export function isValidTrialDay(day: unknown): day is TrialDay {
  return (
    typeof day === "number" &&
    Number.isInteger(day) &&
    day >= MIN_TRIAL_DAY &&
    day <= MAX_TRIAL_DAY
  );
}

/** "Oct 8, 2026" for cards and banners. */
export function formatTrialDay(day: TrialDay): string {
  return new Date(day * DAY_MS).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** FNV-1a over a string: stable across platforms. */
export function hashString(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic stream for one aspect of a day's trial. Each `stream` name
 * (lineup, modifiers, boons, boss, reward) gets its own sequence, so tuning
 * one never reshuffles the others.
 */
export function trialRng(day: TrialDay, stream: string): () => number {
  // mulberry32: tiny and stable; kept local so the save path stays light.
  let a = hashString(`eclipse:${day}:${stream}`);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
