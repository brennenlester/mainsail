import { beforeEach, describe, expect, it } from "vitest";
import { playerParty } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { loadHostSave } from "../world/worldSave";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  type WorldSnapshot,
} from "../world/worldSnapshot";
import { resetPlayerNameForTest } from "../world/playerName";
import { setVisitorMode } from "../world/worldSession";
import { BOND_MAX } from "./bond";
import {
  getClaimedSites,
  resetCompanionStateForTests,
} from "./companionState";
import { PERSONALITY_IDS, personalitySeed, rollPersonality } from "./personality";

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

function questProgress(): Record<QuestId, QuestStatus> {
  const base = Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
  return { ...base, "first-befriend": "active" };
}

function member(overrides: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    instanceId: "c-1",
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 1,
    xp: 0,
    ...overrides,
  };
}

/** Shape of a pre-#367 save: no companion fields anywhere. */
function legacySnapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    version: 1,
    hostLabel: "test-host",
    playerName: "Rowan",
    overworldUnlocked: false,
    questProgress: questProgress(),
    party: [member(), member({ instanceId: "c-2", definitionId: "ember-wisp", speciesId: "ember-wisp" })],
    nextInstanceId: 3,
    materials: {},
    items: {},
    position: { zoneId: "grove", x: 5, y: 5 },
    sparWinsBySpecies: {},
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetPlayerNameForTest();
  resetCompanionStateForTests();
  setVisitorMode(false);
});

describe("companion save migration (#367)", () => {
  it("loads a pre-#367 save and backfills deterministic personalities", () => {
    const legacy = legacySnapshot();
    expect(isValidWorldSnapshot(legacy)).toBe(true);
    localStorage.setItem("ivyward-save-v1", JSON.stringify(legacy));
    const loaded = loadHostSave();
    expect(loaded).not.toBeNull();
    applyWorldSnapshot(loaded!);
    const [a, b] = playerParty.creatures;
    expect(a!.personality).toBe(rollPersonality(personalitySeed("Rowan", "c-1", "mossling")));
    expect(b!.personality).toBe(rollPersonality(personalitySeed("Rowan", "c-2", "ember-wisp")));
    expect(a!.bond).toBeUndefined();
    expect(getClaimedSites().size).toBe(0);

    // Re-applying the same legacy save rebuilds the same traits.
    applyWorldSnapshot(legacySnapshot());
    expect(playerParty.creatures[0]!.personality).toBe(a!.personality);
  });

  it("round-trips personality, bond, nickname, and claimed sites", () => {
    applyWorldSnapshot(
      legacySnapshot({
        party: [member({ personality: "shy", bond: 42, nickname: "Pip" })],
        companionSitesClaimed: ["grove-hidden-fern", "fields-brush"],
      }),
    );
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 });
    expect(isValidWorldSnapshot(exported)).toBe(true);
    expect(exported.party[0]).toMatchObject({ personality: "shy", bond: 42, nickname: "Pip" });
    expect(new Set(exported.companionSitesClaimed)).toEqual(
      new Set(["grove-hidden-fern", "fields-brush"]),
    );
    resetCompanionStateForTests();
    applyWorldSnapshot(exported);
    expect(getClaimedSites().has("fields-brush")).toBe(true);
  });

  it("rejects malformed companion fields", () => {
    const bad = (party: Partial<CreatureInstance>) =>
      isValidWorldSnapshot(legacySnapshot({ party: [member(party)] }));
    expect(bad({ personality: "grumpy" as never })).toBe(false);
    expect(bad({ bond: -1 })).toBe(false);
    expect(bad({ bond: BOND_MAX + 1 })).toBe(false);
    expect(bad({ bond: Number.NaN })).toBe(false);
    expect(bad({ nickname: "" })).toBe(false);
    expect(bad({ nickname: "x".repeat(40) })).toBe(false);
    expect(bad({ personality: PERSONALITY_IDS[0], bond: 0, nickname: "Ok" })).toBe(true);
    expect(isValidWorldSnapshot(legacySnapshot({ companionSitesClaimed: ["nope"] }))).toBe(false);
    expect(
      isValidWorldSnapshot(legacySnapshot({ companionSitesClaimed: "fields-brush" as never })),
    ).toBe(false);
  });

  it("accepts a stand on a ford islet", () => {
    expect(
      isValidWorldSnapshot(
        legacySnapshot({
          overworldUnlocked: true,
          position: { zoneId: "overworld", x: 2, y: 14 },
        }),
      ),
    ).toBe(true);
  });
});
