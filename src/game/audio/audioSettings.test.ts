import { describe, expect, it } from "vitest";
import {
  clampVolume,
  DEFAULT_VOLUME,
  LEGACY_MUTE_KEY,
  MUTE_KEY,
  readMutedPreference,
  readVolumePreference,
  VOLUME_KEY,
  writeMutedPreference,
  writeVolumePreference,
  type SettingsStorage,
} from "./audioSettings";

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const throwingStorage: SettingsStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("clampVolume", () => {
  it("clamps to 0..1 and rounds to whole percent", () => {
    expect(clampVolume(-3)).toBe(0);
    expect(clampVolume(7)).toBe(1);
    expect(clampVolume(0.456)).toBe(0.46);
    expect(clampVolume("0.5")).toBe(0.5);
  });

  it("falls back to the default for non-numbers", () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume("loud")).toBe(DEFAULT_VOLUME);
    expect(clampVolume(undefined)).toBe(DEFAULT_VOLUME);
  });
});

describe("persistence", () => {
  it("round-trips volume and mute", () => {
    const store = memoryStorage();
    writeVolumePreference(0.35, store);
    writeMutedPreference(true, store);
    expect(store.data[VOLUME_KEY]).toBe("0.35");
    expect(readVolumePreference(store)).toBe(0.35);
    expect(readMutedPreference(store)).toBe(true);
  });

  it("defaults when nothing is stored and clamps corrupt values", () => {
    expect(readVolumePreference(memoryStorage())).toBe(DEFAULT_VOLUME);
    expect(readMutedPreference(memoryStorage())).toBe(false);
    expect(readVolumePreference(memoryStorage({ [VOLUME_KEY]: "9" }))).toBe(1);
    expect(readVolumePreference(memoryStorage({ [VOLUME_KEY]: "junk" }))).toBe(DEFAULT_VOLUME);
  });

  it("migrates the legacy mute key", () => {
    const store = memoryStorage({ [LEGACY_MUTE_KEY]: "1" });
    expect(readMutedPreference(store)).toBe(true);
    expect(store.data[MUTE_KEY]).toBe("1");
    expect(LEGACY_MUTE_KEY in store.data).toBe(false);
  });

  it("survives blocked storage (private mode) without throwing", () => {
    expect(readMutedPreference(throwingStorage)).toBe(false);
    expect(readVolumePreference(throwingStorage)).toBe(DEFAULT_VOLUME);
    expect(() => writeMutedPreference(true, throwingStorage)).not.toThrow();
    expect(() => writeVolumePreference(0.2, throwingStorage)).not.toThrow();
    expect(() => readMutedPreference(null)).not.toThrow();
  });
});
