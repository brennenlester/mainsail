import { cleanDisplayText } from "./displayText";

/** Local player display name (overworld + Hearth Lots nametag). Not invite hostLabel. */

export const PLAYER_NAME_MAX_LENGTH = 16;

type NameListener = () => void;

let playerName: string | null = null;
const listeners = new Set<NameListener>();

/** Strip invisibles, trim and enforce the max length. Empty / invisible-only → null. */
export function normalizePlayerName(raw: string): string | null {
  const trimmed = cleanDisplayText(raw);
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > PLAYER_NAME_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

export function getPlayerName(): string | null {
  return playerName;
}

export function hasPlayerName(): boolean {
  return playerName !== null;
}

/**
 * Set the session display name. Returns false if invalid.
 * Host saves persist via exportWorldSnapshot; visitors keep session-only.
 */
export function setPlayerName(raw: string): boolean {
  const normalized = normalizePlayerName(raw);
  if (!normalized) {
    return false;
  }
  if (playerName === normalized) {
    return true;
  }
  playerName = normalized;
  for (const listener of listeners) {
    listener();
  }
  return true;
}

/** Clear session name (visitor mode entry, tests, unnamed boot). */
export function clearPlayerName(): void {
  if (playerName === null) {
    return;
  }
  playerName = null;
  for (const listener of listeners) {
    listener();
  }
}

export function onPlayerNameChange(listener: NameListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — reset module state. */
export function resetPlayerNameForTest(): void {
  playerName = null;
  listeners.clear();
}
