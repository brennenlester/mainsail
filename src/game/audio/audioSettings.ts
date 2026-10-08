/** Persisted mute + master volume (#371). Pure helpers; storage is injectable for tests. */

export type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const MUTE_KEY = "ivyward-audio-muted";
/** Pre-rename key; migrate on read so mute preference is not lost. */
export const LEGACY_MUTE_KEY = "poke-audio-muted";
export const VOLUME_KEY = "ivyward-audio-volume";

export const DEFAULT_VOLUME = 0.8;

/** Clamp to 0..1, rounded to whole percent. Non-numbers fall back to the default. */
export function clampVolume(value: unknown): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return DEFAULT_VOLUME;
  }
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function defaultStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readMutedPreference(storage: SettingsStorage | null = defaultStorage()): boolean {
  try {
    const current = storage?.getItem(MUTE_KEY) ?? null;
    if (current !== null) {
      return current === "1";
    }
    const legacy = storage?.getItem(LEGACY_MUTE_KEY) ?? null;
    if (legacy === null) {
      return false;
    }
    storage?.setItem(MUTE_KEY, legacy);
    storage?.removeItem(LEGACY_MUTE_KEY);
    return legacy === "1";
  } catch {
    return false;
  }
}

export function writeMutedPreference(
  muted: boolean,
  storage: SettingsStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? "1" : "0");
    storage?.removeItem(LEGACY_MUTE_KEY);
  } catch {
    // ponytail: ignore quota/private-mode failures; the setting just won't persist
  }
}

export function readVolumePreference(storage: SettingsStorage | null = defaultStorage()): number {
  try {
    const raw = storage?.getItem(VOLUME_KEY) ?? null;
    return raw === null ? DEFAULT_VOLUME : clampVolume(raw);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function writeVolumePreference(
  volume: number,
  storage: SettingsStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(VOLUME_KEY, String(clampVolume(volume)));
  } catch {
    // ponytail: see writeMutedPreference
  }
}
