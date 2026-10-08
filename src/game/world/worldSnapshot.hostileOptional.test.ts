/**
 * Hostile / future-version fixtures for every optional save field the Wow
 * Pass (#358) added (#399). None of them may reject the whole save: a bad
 * value is filtered or read as its default.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getStorySparLossStreaks,
  getStorySparLosses,
  setStorySparLossStreaks,
  setStorySparLosses,
} from "../battle/storySpar";
import { getClaimedSites, resetCompanionStateForTests } from "../companions/companionState";
import { PERSONALITY_IDS } from "../companions/personality";
import { BOND_MAX } from "../companions/bond";
import { playerParty } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { resetPlayerNameForTest } from "./playerName";
import { loadHostSave } from "./worldSave";
import { setVisitorMode } from "./worldSession";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  type WorldSnapshot,
} from "./worldSnapshot";
import { worldState } from "./worldState";

const SAVE_KEY = "ivyward-save-v1";

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

function member(overrides: Record<string, unknown> = {}): CreatureInstance {
  return {
    instanceId: "c-1",
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 1,
    xp: 0,
    ...overrides,
  } as CreatureInstance;
}

function snapshot(overrides: Record<string, unknown> = {}): WorldSnapshot {
  const questProgress = Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
  questProgress["first-befriend"] = "active";
  return {
    version: 1,
    hostLabel: "host",
    overworldUnlocked: false,
    questProgress,
    party: [member()],
    nextInstanceId: 4,
    materials: {},
    items: {},
    position: { zoneId: "grove", x: 5, y: 5 },
    ...overrides,
  } as WorldSnapshot;
}

/** Round-trip through localStorage + loadHostSave, as a real boot would. */
function loadThroughStorage(save: WorldSnapshot): WorldSnapshot | null {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  return loadHostSave();
}

const HOSTILE: readonly unknown[] = [null, 0, 7, "yes", [], ["x"], { a: 1 }, true, false];

beforeEach(() => {
  localStorage.clear();
  resetPlayerNameForTest();
  setVisitorMode(false);
  resetCompanionStateForTests();
  setStorySparLosses([]);
  setStorySparLossStreaks({});
  worldState.storyRelicBundleGiven = false;
  worldState.storyFinaleCardShown = false;
  worldState.firstEvolutionCelebrated = false;
});

afterEach(() => {
  setStorySparLosses([]);
  setStorySparLossStreaks({});
});

describe("optional Wow Pass save fields never reject the save (#399)", () => {
  const boolFields = [
    "storyRelicBundleGiven",
    "storyFinaleCardShown",
    "firstEvolutionCelebrated",
  ] as const;

  for (const field of boolFields) {
    it(`${field}: any non-true value loads as false`, () => {
      for (const value of HOSTILE) {
        if (value === true) continue;
        const loaded = loadThroughStorage(snapshot({ [field]: value }));
        expect(loaded, `${field}=${JSON.stringify(value)}`).not.toBeNull();
        worldState[field] = true;
        applyWorldSnapshot(loaded!);
        expect(worldState[field]).toBe(false);
      }
      applyWorldSnapshot(loadThroughStorage(snapshot({ [field]: true }))!);
      expect(worldState[field]).toBe(true);
    });
  }

  it("storySparLosses: non-arrays are ignored; unknown / non-string ids dropped", () => {
    for (const value of HOSTILE) {
      const loaded = loadThroughStorage(snapshot({ storySparLosses: value }));
      expect(loaded, JSON.stringify(value)).not.toBeNull();
      applyWorldSnapshot(loaded!);
      expect(getStorySparLosses()).toEqual([]);
    }
    applyWorldSnapshot(
      loadThroughStorage(snapshot({ storySparLosses: ["rival-wren", "future-rival", 3, null] }))!,
    );
    expect(getStorySparLosses()).toEqual(["rival-wren"]);
  });

  it("storySparLossStreaks: non-objects are ignored; bad counts dropped", () => {
    for (const value of HOSTILE) {
      const loaded = loadThroughStorage(snapshot({ storySparLossStreaks: value }));
      expect(loaded, JSON.stringify(value)).not.toBeNull();
      applyWorldSnapshot(loaded!);
      expect(getStorySparLossStreaks()).toEqual({});
    }
    applyWorldSnapshot(
      loadThroughStorage(
        snapshot({
          storySparLossStreaks: {
            "rival-wren": 2,
            "cinder-matriarch": "lots",
            "future-boss": 4,
            "__proto__": 5,
          },
        }),
      )!,
    );
    expect(getStorySparLossStreaks()).toEqual({ "rival-wren": 2 });
  });

  it("companionSitesClaimed: non-arrays ignored, unknown ids dropped", () => {
    for (const value of HOSTILE) {
      const loaded = loadThroughStorage(snapshot({ companionSitesClaimed: value }));
      expect(loaded, JSON.stringify(value)).not.toBeNull();
      applyWorldSnapshot(loaded!);
      expect(getClaimedSites().size).toBe(0);
    }
    applyWorldSnapshot(
      loadThroughStorage(snapshot({ companionSitesClaimed: ["fields-brush", "future-site", 3] }))!,
    );
    expect([...getClaimedSites()]).toEqual(["fields-brush"]);
  });

  it("companion fields on party members are repaired, never fatal", () => {
    const party = [
      member({ personality: "grumpy", bond: 9999, nickname: "  Pip  ", rare: "yes" }),
      member({ instanceId: "c-2", personality: 4, bond: -5, nickname: "x".repeat(40), rare: false }),
      member({ instanceId: "c-3", personality: null, bond: "lots", nickname: 7, rare: 1 }),
    ];
    const loaded = loadThroughStorage(snapshot({ party }));
    expect(loaded).not.toBeNull();
    applyWorldSnapshot(loaded!);
    const [a, b, c] = playerParty.creatures;
    for (const creature of [a, b, c]) {
      expect(PERSONALITY_IDS).toContain(creature!.personality);
      expect("rare" in creature!).toBe(false);
    }
    expect(a!.bond).toBe(BOND_MAX);
    expect(a!.nickname).toBe("Pip");
    expect(b!.bond).toBe(0);
    expect(c!.bond).toBeUndefined();
    expect(c!.nickname).toBeUndefined();
  });

  it("a save with every field hostile at once still loads and re-exports cleanly", () => {
    const hostile = snapshot({
      storyRelicBundleGiven: "yes",
      storyFinaleCardShown: { shown: true },
      firstEvolutionCelebrated: 1,
      storySparLosses: "rival-wren",
      storySparLossStreaks: [2, 4],
      companionSitesClaimed: { site: "fields-brush" },
      party: [member({ rare: "maybe", bond: "x", personality: 9 })],
      futureField: { nested: [1, 2, 3] },
    });
    expect(isValidWorldSnapshot(hostile)).toBe(true);
    const loaded = loadThroughStorage(hostile);
    expect(loaded).not.toBeNull();
    applyWorldSnapshot(loaded!);
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 });
    expect(isValidWorldSnapshot(exported)).toBe(true);
    expect(exported).toMatchObject({
      storyRelicBundleGiven: false,
      storyFinaleCardShown: false,
      firstEvolutionCelebrated: false,
      storySparLosses: [],
      storySparLossStreaks: {},
      companionSitesClaimed: [],
    });
  });
});
