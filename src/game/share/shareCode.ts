import { CREATURES } from "../creatures/catalog";
import { MAX_LEVEL } from "../progression/leveling";
import { PLAYER_NAME_MAX_LENGTH } from "../world/playerName";
import { fromBase64Url, toBase64Url } from "../world/invite";
import { capCodePoints, cleanDisplayText } from "../world/displayText";

/**
 * Companion Card share code (#368): a compact, versioned party snapshot that
 * rides in `?card=`. Everything decoded here is untrusted URL input — callers
 * must only render it via textContent / canvas fillText.
 */

/**
 * v2 adds per-creature bond hearts; v3 adds a sanitized per-creature nickname
 * ("" = none). v1 / v2 links still decode (without the newer fields).
 */
export const SHARE_CODE_VERSION = 3;
const SUPPORTED_VERSIONS: ReadonlySet<unknown> = new Set([1, 2, 3]);
/** Nickname cap, in code points; matches NICKNAME_MAX_LENGTH in-game. */
export const SHARE_NICKNAME_MAX_LENGTH = 16;
/** Bond hearts on the card: 0 (none) … 5 (Kindred). */
export const SHARE_BOND_MAX = 5;
export const SHARE_PARTY_LIMIT = 7;
/** Hard cap on the raw `?card=` value, checked before any decoding. */
export const SHARE_CODE_MAX_LENGTH = 2048;
export const SHARE_PARAM = "card";
/** Decode-time sanity bound on a creature level before it is clamped to the game range. */
const MAX_SANE_LEVEL = 1_000_000;

export const SHARE_FLAG_RARE = 1;
export const SHARE_FLAG_EVOLVED = 2;
export const SHARE_FLAG_PRESENCE = 4;
const KNOWN_FLAGS = SHARE_FLAG_RARE | SHARE_FLAG_EVOLVED | SHARE_FLAG_PRESENCE;

/** Days since the Unix epoch; anything outside this window is rejected. */
const MIN_DAY = 19_000; // 2022
const MAX_DAY = 40_000; // 2079

const ALLOWED_IDS: ReadonlySet<string> = new Set(CREATURES.map((c) => c.id));

export type ShareCreature = {
  id: string;
  level: number;
  rare: boolean;
  evolved: boolean;
  presence: boolean;
  /** Bond hearts 0..SHARE_BOND_MAX; null for v1 links that predate bond. */
  bond: number | null;
  /** Sanitized display name (<=16 code points); carried by v3 links. */
  nickname?: string;
};

export type ShareSnapshot = {
  name: string;
  /** Days since epoch (UTC) when the card was made. */
  day: number;
  party: ShareCreature[];
};

export type ShareParseResult =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "ok"; snapshot: ShareSnapshot };

export const SHARE_FALLBACK_NAME = "A friend";

/** Shared display-text filter (see world/displayText), capped in code points. */
function cleanShareText(raw: string, max: number): string {
  return capCodePoints(cleanDisplayText(raw), max);
}

export function sanitizeShareName(raw: unknown): string {
  if (typeof raw !== "string") {
    return SHARE_FALLBACK_NAME;
  }
  const capped = cleanShareText(raw, PLAYER_NAME_MAX_LENGTH);
  return capped.length > 0 ? capped : SHARE_FALLBACK_NAME;
}

/** Same filter as the player name, capped at the nickname length; "" = none. */
export function sanitizeShareNickname(raw: unknown): string {
  return typeof raw === "string" ? cleanShareText(raw, SHARE_NICKNAME_MAX_LENGTH) : "";
}

export function clampShareLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(value)));
}

/**
 * Calendar day the card was made, as a day number. It is the player's *local*
 * date (not the UTC day, which flips hours early/late in most timezones), so
 * `formatShareDay` can render it verbatim.
 */
export function todayShareDay(
  now = Date.now(),
  tzOffsetMinutes = new Date(now).getTimezoneOffset(),
): number {
  return Math.floor((now - tzOffsetMinutes * 60_000) / 86_400_000);
}

/** Canonical play host (AGENTS.md); shown on cards made from preview builds. */
export const PRODUCTION_HOST = "mainsail-brennen1.vercel.app";

/**
 * Footer text for the Companion Card: the real host on a custom domain, the
 * production host for Vercel previews, and nothing on localhost / LAN dev.
 */
export function cardSiteLabel(host: string): string {
  const hostname = host.replace(/:[0-9]+$/, "").toLowerCase();
  if (
    hostname === "" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    /^[0-9]{1,3}([.][0-9]{1,3}){3}$/.test(hostname)
  ) {
    return "";
  }
  if (hostname.endsWith(".vercel.app")) {
    return PRODUCTION_HOST;
  }
  return hostname;
}

export function encodeShareSnapshot(snapshot: ShareSnapshot): string {
  const party = snapshot.party
    .filter((c) => ALLOWED_IDS.has(c.id))
    .slice(0, SHARE_PARTY_LIMIT)
    .map((c) => [
      c.id,
      clampShareLevel(c.level),
      (c.rare ? SHARE_FLAG_RARE : 0) |
        (c.evolved ? SHARE_FLAG_EVOLVED : 0) |
        (c.presence ? SHARE_FLAG_PRESENCE : 0),
      Math.min(SHARE_BOND_MAX, Math.max(0, Math.floor(c.bond ?? 0))),
      sanitizeShareNickname(c.nickname),
    ]);
  return toBase64Url(
    JSON.stringify({
      v: SHARE_CODE_VERSION,
      n: sanitizeShareName(snapshot.name),
      d: Math.floor(snapshot.day),
      p: party,
    }),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseCreature(entry: unknown, version: number): ShareCreature | null {
  if (!Array.isArray(entry) || entry.length !== (version === 1 ? 3 : version === 2 ? 4 : 5)) {
    return null;
  }
  const [id, level, flags, bond, nickname] = entry as unknown[];
  if (version === 3 && typeof nickname !== "string") {
    return null;
  }
  if (
    version !== 1 &&
    (typeof bond !== "number" ||
      !Number.isInteger(bond) ||
      bond < 0 ||
      bond > SHARE_BOND_MAX)
  ) {
    return null;
  }
  if (typeof id !== "string" || !ALLOWED_IDS.has(id)) {
    return null;
  }
  // Slightly-off levels clamp; absurd magnitudes (1e308) mean a tampered link.
  if (typeof level !== "number" || !Number.isFinite(level) || Math.abs(level) > MAX_SANE_LEVEL) {
    return null;
  }
  if (
    typeof flags !== "number" ||
    !Number.isInteger(flags) ||
    flags < 0 ||
    // Range check first: bitwise ops truncate to 32 bits (2^32 & ~7 === 0).
    flags > KNOWN_FLAGS ||
    (flags & ~KNOWN_FLAGS) !== 0
  ) {
    return null;
  }
  const nick = version === 3 ? sanitizeShareNickname(nickname) : "";
  return {
    id,
    level: clampShareLevel(level),
    rare: (flags & SHARE_FLAG_RARE) !== 0,
    evolved: (flags & SHARE_FLAG_EVOLVED) !== 0,
    presence: (flags & SHARE_FLAG_PRESENCE) !== 0,
    bond: version === 1 ? null : (bond as number),
    ...(nick ? { nickname: nick } : {}),
  };
}

/** Strict decode of a raw `?card=` value. Never throws. */
export function decodeShareCode(raw: string | null): ShareParseResult {
  if (raw === null) {
    return { status: "absent" };
  }
  if (
    raw.length === 0 ||
    raw.length > SHARE_CODE_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(raw)
  ) {
    return { status: "invalid" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(raw));
  } catch {
    return { status: "invalid" };
  }
  if (!isPlainObject(parsed)) {
    return { status: "invalid" };
  }
  const keys = Object.keys(parsed).sort().join(",");
  if (keys !== "d,n,p,v" || !SUPPORTED_VERSIONS.has(parsed.v)) {
    return { status: "invalid" };
  }
  if (typeof parsed.n !== "string") {
    return { status: "invalid" };
  }
  const day = parsed.d;
  if (
    typeof day !== "number" ||
    !Number.isInteger(day) ||
    day < MIN_DAY ||
    day > MAX_DAY
  ) {
    return { status: "invalid" };
  }
  const list = parsed.p;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.length > SHARE_PARTY_LIMIT
  ) {
    return { status: "invalid" };
  }
  const party: ShareCreature[] = [];
  for (const entry of list) {
    const creature = parseCreature(entry, parsed.v as number);
    if (!creature) {
      return { status: "invalid" };
    }
    party.push(creature);
  }
  return {
    status: "ok",
    snapshot: { name: sanitizeShareName(parsed.n), day, party },
  };
}

export function readShareParam(search = window.location.search): ShareParseResult {
  return decodeShareCode(new URLSearchParams(search).get(SHARE_PARAM));
}

/** Clean share URL on the current origin + path (drops every other param). */
export function buildShareUrl(snapshot: ShareSnapshot, base = window.location.href): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set(SHARE_PARAM, encodeShareSnapshot(snapshot));
  return url.toString();
}

/** Date label for a share day number (a calendar date), e.g. "Oct 7, 2026". */
export function formatShareDay(day: number): string {
  return new Date(day * 86_400_000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
