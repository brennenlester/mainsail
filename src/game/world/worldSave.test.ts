import { beforeEach, describe, expect, it } from "vitest";
import { clearHostSave, loadHostSave, resetHostGame, updateHostPosition } from "./worldSave";
import { resumeHostPersist, suspendHostPersist } from "./worldSaveSchedule";
import { flushPendingHostSave } from "./worldSaveSchedule";
import { setVisitorMode } from "./worldSession";
import { STARTING_ZONE_ID as SPAWN_ZONE } from "./zones";
import { exportWorldSnapshot, type WorldSnapshot } from "./worldSnapshot";
import { STARTING_ZONE_ID } from "./zones";

// Neither Node's experimental localStorage global nor happy-dom's window
// expose a working Storage in this vitest environment; give the module under
// test a real in-memory store so assertions read what it writes.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage(),
  configurable: true,
  writable: true,
});

const STORAGE_KEY = "ivyward-save-v1";
const BACKUP_STORAGE_KEY = "ivyward-save-v1-backup";

function storedSnapshot(position: WorldSnapshot["position"]): Record<
  string,
  unknown
> {
  return exportWorldSnapshot(position) as unknown as Record<string, unknown>;
}

beforeEach(() => {
  localStorage.clear();
});

describe("loadHostSave repair path (#190)", () => {
  it("repairs a save whose only defect is an invalid position", () => {
    const snapshot = storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 });
    snapshot.position = { zoneId: STARTING_ZONE_ID, x: 9999, y: 9999 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    const loaded = loadHostSave();

    expect(loaded).not.toBeNull();
    expect(loaded?.position).toEqual({
      zoneId: STARTING_ZONE_ID,
      x: 3,
      y: 7,
    });
    expect(loaded?.party).toEqual(snapshot.party);
    expect(loaded?.materials).toEqual(snapshot.materials);
    expect(loaded?.questProgress).toEqual(snapshot.questProgress);
    expect(loaded?.achievements).toEqual(snapshot.achievements);
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBeNull();
  });

  it("grounds a mid-sail flag when the default spawn repairs the save", () => {
    const snapshot = storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 });
    snapshot.position = { zoneId: "mistwood", x: 9999, y: 9999 };
    snapshot.sailing = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    const loaded = loadHostSave();

    expect(loaded).not.toBeNull();
    expect(loaded?.position.zoneId).toBe(STARTING_ZONE_ID);
    expect(loaded?.sailing).toBe(false);
  });

  it("quarantines non-position corruption instead of normalizing it", () => {
    const snapshot = storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 });
    snapshot.sailing = "garbage";
    const raw = JSON.stringify(snapshot);
    localStorage.setItem(STORAGE_KEY, raw);

    const loaded = loadHostSave();

    expect(loaded).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe(raw);
  });

  it("clearHostSave / resetHostGame are no-ops in visitor or card sandboxes (#368)", () => {
    const kept = JSON.stringify({ keep: 1 });
    localStorage.setItem(STORAGE_KEY, kept);
    suspendHostPersist();
    try {
      clearHostSave();
      resetHostGame();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(kept);
    } finally {
      resumeHostPersist();
    }
    setVisitorMode(true, "x");
    try {
      clearHostSave();
      expect(localStorage.getItem(STORAGE_KEY)).toBe(kept);
    } finally {
      setVisitorMode(false);
    }
    clearHostSave();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("readOnly load never writes storage (share-card sandbox, #368)", () => {
    const snapshot = storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 });
    snapshot.sailing = "garbage";
    const raw = JSON.stringify(snapshot);
    localStorage.setItem(STORAGE_KEY, raw);
    expect(loadHostSave({ readOnly: true })).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBeNull();

    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadHostSave({ readOnly: true })).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("{not json");

    localStorage.clear();
    const legacy = JSON.stringify(storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 }));
    localStorage.setItem("poke-save-v1", legacy);
    expect(loadHostSave({ readOnly: true })).not.toBeNull();
    expect(localStorage.getItem("poke-save-v1")).toBe(legacy);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("quarantines non-object JSON payloads", () => {
    for (const raw of ["null", "[3]", "42"]) {
      localStorage.clear();
      localStorage.setItem(STORAGE_KEY, raw);
      expect(loadHostSave()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe(raw);
    }
  });

  it("backs up an unrepairable save instead of deleting it", () => {
    const snapshot = storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 });
    snapshot.party = "garbage";
    const raw = JSON.stringify(snapshot);
    localStorage.setItem(STORAGE_KEY, raw);

    const loaded = loadHostSave();

    expect(loaded).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe(raw);
  });

  it("backs up unparseable JSON instead of deleting it", () => {
    const raw = '{"broken": tru';
    localStorage.setItem(STORAGE_KEY, raw);

    const loaded = loadHostSave();

    expect(loaded).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe(raw);
  });

  it("still loads a fully valid save unchanged", () => {
    const snapshot = storedSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

    const loaded = loadHostSave();

    expect(loaded).toEqual(snapshot);
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBeNull();
  });

  it("never persists on flush in visitor mode (#191)", () => {
    setVisitorMode(true, "host");
    try {
      updateHostPosition(SPAWN_ZONE, 3, 7);
      flushPendingHostSave();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      setVisitorMode(false);
    }
  });

  it("persists a pending change on flush for the host (#191)", () => {
    updateHostPosition(SPAWN_ZONE, 3, 7);
    flushPendingHostSave();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("clearHostSave cancels pending flush so pagehide cannot resurrect the save (#250)", () => {
    updateHostPosition(SPAWN_ZONE, 4, 5);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // still debounced
    clearHostSave();
    flushPendingHostSave(); // simulates pagehide after Reset
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("clearHostSave leaves the backup key intact", () => {
    localStorage.setItem(BACKUP_STORAGE_KEY, "keep-me");
    clearHostSave();
    expect(localStorage.getItem(BACKUP_STORAGE_KEY)).toBe("keep-me");
  });

  it("frees the primary slot when quota blocks the backup write", () => {
    // Simulate quota: the backup write throws while the primary is present
    // and succeeds once the primary slot has been freed.
    const base = localStorage;
    let primaryPresent = true;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        ...baseStorageShim(base),
        setItem: (key: string, value: string) => {
          if (key === BACKUP_STORAGE_KEY && primaryPresent) {
            throw new Error("QuotaExceededError");
          }
          base.setItem(key, value);
        },
        removeItem: (key: string) => {
          if (key === STORAGE_KEY) {
            primaryPresent = false;
          }
          base.removeItem(key);
        },
      },
    });
    try {
      const raw = '{"broken": tru';
      base.setItem(STORAGE_KEY, raw);

      expect(loadHostSave()).toBeNull();
      expect(base.getItem(STORAGE_KEY)).toBeNull();
      expect(base.getItem(BACKUP_STORAGE_KEY)).toBe(raw);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: base,
      });
    }
  });

  it("restores the primary key when the backup write is impossible", () => {
    const base = localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        ...baseStorageShim(base),
        setItem: (key: string, value: string) => {
          if (key === BACKUP_STORAGE_KEY) {
            throw new Error("QuotaExceededError");
          }
          base.setItem(key, value);
        },
      },
    });
    try {
      const raw = '{"broken": tru';
      base.setItem(STORAGE_KEY, raw);

      expect(loadHostSave()).toBeNull();
      expect(base.getItem(STORAGE_KEY)).toBe(raw);
      expect(base.getItem(BACKUP_STORAGE_KEY)).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        writable: true,
        value: base,
      });
    }
  });
});

function baseStorageShim(base: Storage): Storage {
  return {
    get length() {
      return base.length;
    },
    clear: () => base.clear(),
    getItem: (key: string) => base.getItem(key),
    key: (index: number) => base.key(index),
    removeItem: (key: string) => base.removeItem(key),
    setItem: (key: string, value: string) => base.setItem(key, value),
  };
}
