import { beforeEach, describe, expect, it } from "vitest";
import { loadHostSave } from "./worldSave";
import { applyWorldSnapshot, exportWorldSnapshot, isValidWorldSnapshot } from "./worldSnapshot";
import { STARTING_ZONE_ID } from "./zones";
import { parseInviteParam, toBase64Url } from "./invite";
import { clearPlayerName, DEFAULT_PLAYER_NAME, getPlayerName, PLAYER_NAME_MAX_LENGTH } from "./playerName";
import { setVisitorMode } from "./worldSession";
import { playerParty } from "../creatures/party";

// Same in-memory Storage shim as worldSave.test.ts.
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

/**
 * Names the old trim()-only normalizer accepted (or that a hand-edited save
 * carries). A cosmetic difference must never cost a player their save (#409).
 */
const LEGACY_NAMES: ReadonlyArray<readonly [label: string, name: string]> = [
  ["double space", "Ann  Lee"],
  ["tab", "Ann\tLee"],
  ["NBSP", "Ann Lee"],
  ["ZWNJ (Persian)", "می‌خواهم"],
  ["soft hyphen", "Ann­Lee"],
  ["tag-sequence flag", "Eng \u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}"],
  ["16 emoji", "🦊".repeat(16)],
  ["accented", "Zoë Müller"],
  ["CJK", "山田太郎"],
  ["Thai", "สวัสดีครับ"],
  ["Devanagari (ZWJ)", "क्‍ष"],
  ["empty", ""],
  ["whitespace only", "   \t "],
  ["invisible only", "ㅤ⠀"],
  ["40 chars", "n".repeat(40)],
];

function snapshotWithName(name: string): Record<string, unknown> {
  const snapshot = exportWorldSnapshot({ zoneId: STARTING_ZONE_ID, x: 3, y: 7 }) as unknown as Record<string, unknown>;
  snapshot.playerName = name;
  return snapshot;
}

describe("legacy player names never cost a save (#409)", () => {
  beforeEach(() => {
    localStorage.clear();
    setVisitorMode(false);
    clearPlayerName();
  });

  for (const [label, name] of LEGACY_NAMES) {
    it(`host save loads and keeps its storage entry: ${label}`, () => {
      const raw = JSON.stringify(snapshotWithName(name));
      localStorage.setItem(STORAGE_KEY, raw);
      const loaded = loadHostSave();
      expect(loaded, label).not.toBeNull();
      expect(localStorage.getItem(STORAGE_KEY), label).not.toBeNull();
      expect(isValidWorldSnapshot(loaded)).toBe(true);
    });

    it(`applying it sets a readable, in-limit name: ${label}`, () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWithName(name)));
      const loaded = loadHostSave()!;
      applyWorldSnapshot(loaded);
      const applied = getPlayerName();
      if (name === "") {
        // An empty stored name means "unnamed": the name intro runs as before.
        expect(applied).toBeNull();
        return;
      }
      expect(applied, label).not.toBeNull();
      expect(Array.from(applied!).length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
      expect(applied!.trim()).toBe(applied);
    });

    it(`an invite link still works: ${label}`, () => {
      const snapshot = { ...snapshotWithName(name), hostLabel: "host" };
      window.history.replaceState({}, "", `/?join=${toBase64Url(JSON.stringify(snapshot))}`);
      const result = parseInviteParam();
      expect(result.status, label).toBe("ok");
    });
  }

  it("keeps meaningful joiners and the tag-flag; fills in a default for unreadable names", () => {
    for (const [name, expected] of [
      ["می‌خواهم", "می‌خواهم"],
      ["Ann  Lee", "Ann Lee"],
      ["Ann Lee", "Ann Lee"],
      ["Ann­Lee", "AnnLee"],
      ["ㅤ⠀", DEFAULT_PLAYER_NAME],
      ["n".repeat(40), "n".repeat(16)],
    ] as const) {
      clearPlayerName();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWithName(name)));
      applyWorldSnapshot(loadHostSave()!);
      expect(getPlayerName(), JSON.stringify(name)).toBe(expected);
    }
    clearPlayerName();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWithName(LEGACY_NAMES[5]![1])));
    applyWorldSnapshot(loadHostSave()!);
    expect(getPlayerName()).toContain("\u{E0067}");
  });

  it("legacy nicknames load as cleaned text instead of being dropped", () => {
    const snapshot = snapshotWithName("Ann") as { party: Array<Record<string, unknown>> };
    snapshot.party = [
      {
        instanceId: "c-1",
        definitionId: "mossling",
        speciesId: "mossling",
        currentHp: 10,
        level: 3,
        xp: 0,
        nickname: "Sir  Moss­ington the Third of Many",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    applyWorldSnapshot(loadHostSave()!);
    const nickname = playerParty.creatures[0]?.nickname;
    expect(nickname).toBe("Sir Mossington t");
  });
});
