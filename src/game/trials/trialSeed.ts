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

/** First day with a fairness-gated plan (trialTable.json starts here); links never open earlier days. */
export const FIRST_TRIAL_DAY_KEY = "2026-10-01";
export const FIRST_TRIAL_DAY: TrialDay = Date.UTC(2026, 9, 1) / 86_400_000;

/** Links open days up to a year back, never a future day (no scouting tomorrow's lineup). */
export const TRIAL_LINK_MAX_AGE_DAYS = 366;

/**
 * Boot check for `?trial=` (just the day; the optional brag is decoded with
 * the lazy trial chunk). Never throws.
 */
export function readTrialDayParam(
  search: string,
  today: TrialDay = todayTrialDay(),
): { status: "absent" } | { status: "invalid" } | { status: "ok"; day: TrialDay } {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get(TRIAL_PARAM);
  } catch {
    return { status: "invalid" };
  }
  if (raw === null) {
    return { status: "absent" };
  }
  const day = parseTrialDayKey(raw);
  if (day === null || day > today || day < today - TRIAL_LINK_MAX_AGE_DAYS || day < FIRST_TRIAL_DAY) {
    return { status: "invalid" };
  }
  return { status: "ok", day };
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

/**
 * Local-time pointer to the next UTC-midnight trial (#423): an evening player
 * in the Americas sees tomorrow's date, so say when the next one starts.
 */
export function nextTrialIn(now = Date.now()): string {
  const left = Math.max(0, (todayTrialDay(now) + 1) * DAY_MS - now);
  const minutes = Math.ceil(left / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `new trial in ${h} h ${m} m` : `new trial in ${m} m`;
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
