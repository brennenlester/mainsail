import { CREATURES } from "../creatures/catalog";
import { fromBase64Url, toBase64Url } from "../world/invite";
import { capCodePoints, cleanDisplayText } from "../world/displayText";
import { PLAYER_NAME_MAX_LENGTH } from "../world/playerName";
import { SCORE, TRIAL_TITLES, trialTitleIndex } from "./scoring";
import { MAX_TRIAL_SCORE } from "./trialState";
import { readTrialDayParam, todayTrialDay, TRIAL_PARAM, trialDayKey, type TrialDay } from "./trialSeed";

export { TRIAL_LINK_MAX_AGE_DAYS } from "./trialSeed";

/**
 * Trial share links (#420): `?trial=YYYY-MM-DD` names the gauntlet; the
 * optional `&by=<code>` carries the sharer's result for the "Beat my score"
 * preview. Everything here is untrusted URL input: strict shapes, bounded
 * sizes, sanitized text, render via textContent / fillText only. A bad
 * `trial` blocks the link; a bad `by` is just dropped (the trial still works).
 */

export const TRIAL_BRAG_PARAM = "by";
export const TRIAL_BRAG_VERSION = 1;
export const TRIAL_BRAG_MAX_LENGTH = 512;
export const TRIAL_BRAG_PARTY_LIMIT = 7;
export const TRIAL_FALLBACK_NAME = "A friend";

const ALLOWED_IDS: ReadonlySet<string> = new Set(CREATURES.map((c) => c.id));

export type TrialBrag = {
  name: string;
  score: number;
  /** Rounds cleared 0..5. */
  rounds: number;
  /** Index into TRIAL_TITLES. */
  title: number;
  /** Species ids, lead first. */
  party: string[];
};


/** Least score `rounds` cleared rounds can carry (the round points alone). */
export function minScoreFor(rounds: number): number {
  return rounds >= 5 ? 4 * SCORE.round + SCORE.boss : rounds * SCORE.round;
}

export type TrialLinkResult =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "ok"; day: TrialDay; brag: TrialBrag | null };

export function sanitizeTrialName(raw: unknown): string {
  if (typeof raw !== "string") {
    return TRIAL_FALLBACK_NAME;
  }
  const name = capCodePoints(cleanDisplayText(raw), PLAYER_NAME_MAX_LENGTH);
  return name.length > 0 ? name : TRIAL_FALLBACK_NAME;
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function encodeTrialBrag(brag: TrialBrag): string {
  return toBase64Url(
    JSON.stringify({
      v: TRIAL_BRAG_VERSION,
      n: sanitizeTrialName(brag.name),
      s: Math.min(MAX_TRIAL_SCORE, Math.max(0, Math.floor(brag.score))),
      r: Math.min(5, Math.max(0, Math.floor(brag.rounds))),
      t: trialTitleIndex(Math.min(MAX_TRIAL_SCORE, Math.max(0, Math.floor(brag.score)))),
      p: brag.party.filter((id) => ALLOWED_IDS.has(id)).slice(0, TRIAL_BRAG_PARTY_LIMIT),
    }),
  );
}

/** Strict decode of a raw `by` value; null on anything off. Never throws. */
export function decodeTrialBrag(raw: string | null): TrialBrag | null {
  if (raw === null || raw.length === 0 || raw.length > TRIAL_BRAG_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(raw));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== "n,p,r,s,t,v" || o.v !== TRIAL_BRAG_VERSION) {
    return null;
  }
  if (
    typeof o.n !== "string" ||
    !isInt(o.s, 0, MAX_TRIAL_SCORE) ||
    !isInt(o.r, 0, 5) ||
    !isInt(o.t, 0, TRIAL_TITLES.length - 1) ||
    !Array.isArray(o.p) ||
    o.p.length > TRIAL_BRAG_PARTY_LIMIT ||
    !o.p.every((id) => typeof id === "string" && ALLOWED_IDS.has(id)) ||
    // A brag must be self-consistent: the title its score earns, rounds it could score.
    o.t !== trialTitleIndex(o.s) ||
    o.s < minScoreFor(o.r)
  ) {
    return null;
  }
  return { name: sanitizeTrialName(o.n), score: o.s, rounds: o.r, title: o.t, party: [...(o.p as string[])] };
}

/** Read `?trial=` (+ optional `by`) from a query string. Never throws. */
export function readTrialLink(search: string, today: TrialDay = todayTrialDay()): TrialLinkResult {
  const day = readTrialDayParam(search, today);
  if (day.status !== "ok") {
    return day;
  }
  let brag: TrialBrag | null = null;
  try {
    brag = decodeTrialBrag(new URLSearchParams(search).get(TRIAL_BRAG_PARAM));
  } catch {
    brag = null;
  }
  return { status: "ok", day: day.day, brag };
}

/** Clean share URL on this origin + path (drops every other param). */
export function buildTrialShareUrl(day: TrialDay, brag: TrialBrag | null, base = window.location.href): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set(TRIAL_PARAM, trialDayKey(day));
  if (brag) {
    url.searchParams.set(TRIAL_BRAG_PARAM, encodeTrialBrag(brag));
  }
  return url.toString();
}
