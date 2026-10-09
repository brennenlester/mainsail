import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOSS_TITLE_INDEX, SCORE, scoreTrial, trialTitle, trialTitleIndex, TRIAL_TITLES, type TrialRoundRecord } from "./scoring";
import { parseTrialDayKey, trialDayKey } from "./trialSeed";
import {
  BEST_DAYS_KEPT,
  currentStreak,
  emptyTrialRecord,
  getTrialRecord,
  getTrialRecordSnapshot,
  resetTrialRecordForTest,
  sanitizeTrialRecord,
  setTrialRecordFromSnapshot,
  settleTrialRun,
  trialDustFor,
} from "./trialState";
import { exportWorldSnapshot, isValidWorldSnapshot, applyWorldSnapshot } from "../world/worldSnapshot";

const DAY = parseTrialDayKey("2026-10-08")!;

function cleared(turns: number, damage = 0, boss = false): TrialRoundRecord {
  return { cleared: true, boss, turns, damageTaken: damage, partyMaxHp: 150, parries: 0 };
}

describe("trial scoring (#420)", () => {
  it("adds rounds, speed, grit, parries and skipped boons", () => {
    const rounds = [cleared(4), cleared(10, 150), { ...cleared(6, 75), parries: 2 }];
    const score = scoreTrial(rounds, { used: 1, skipped: 1 }, 5);
    expect(score.roundsCleared).toBe(3);
    expect(score.cleared).toBe(false);
    expect(score.parts).toEqual({
      rounds: 3 * SCORE.round,
      speed: (SCORE.speedPar - 4) * SCORE.speedPerTurn + (SCORE.speedPar - 6) * SCORE.speedPerTurn,
      grit: SCORE.grit + 0 + Math.round(SCORE.grit * 0.5),
      parries: 2 * SCORE.parry,
      boons: SCORE.boonSkipped,
    });
    expect(score.total).toBe(Object.values(score.parts).reduce((a, b) => a + b, 0));
  });

  it("a lost round counts its turns and damage but scores nothing", () => {
    const score = scoreTrial([cleared(3), { ...cleared(5, 200), cleared: false }], { used: 0, skipped: 0 }, 5);
    expect(score.roundsCleared).toBe(1);
    expect(score.turns).toBe(8);
    expect(score.damageTaken).toBe(200);
    expect(score.parts.rounds).toBe(SCORE.round);
  });

  it("a full clear is at least Eclipse Ascendant; titles climb with score", () => {
    const full = scoreTrial([cleared(30, 999), cleared(30, 999), cleared(30, 999), cleared(30, 999), cleared(30, 999, true)], { used: 4, skipped: 0 }, 5);
    expect(full.cleared).toBe(true);
    expect(full.total).toBe(4 * SCORE.round + SCORE.boss);
    expect(trialTitle(full.total, 5)).toBe("Eclipse Ascendant");
    expect(trialTitle(0, 0)).toBe("Ember Initiate");
    expect(trialTitle(1499, 1)).toBe("Ember Initiate");
    expect(trialTitle(1500, 1)).toBe("Dusk Wanderer");
    expect(trialTitle(99_999, 5)).toBe("Eclipse Warden");
    for (let i = 1; i < TRIAL_TITLES.length; i++) {
      expect(TRIAL_TITLES[i]!.min).toBeGreaterThan(TRIAL_TITLES[i - 1]!.min);
      expect(trialTitleIndex(TRIAL_TITLES[i]!.min, 5)).toBe(i);
      expect(trialTitleIndex(TRIAL_TITLES[i]!.min - 1, 5)).toBe(i - 1);
    }
  });

  it("only a boss win earns Shade Breaker or above (#423)", () => {
    expect(TRIAL_TITLES[BOSS_TITLE_INDEX]!.title).toBe("Shade Breaker");
    // Four rounds with fast, clean fights can pass 4200 but still lost to the Shade.
    expect(trialTitle(4600, 4)).toBe("Moonlit Duelist");
    expect(trialTitle(7400, 4)).toBe("Moonlit Duelist");
    expect(trialTitle(4600, 5)).toBe("Shade Breaker");
    expect(trialTitle(2000, 2)).toBe("Dusk Wanderer");
  });
});

describe("trial record (#420)", () => {
  beforeEach(() => {
    resetTrialRecordForTest();
    // Every DAY+N in these tests is in the past.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("pays Dust once per day as a top-up, capped at a full clear", () => {
    expect(trialDustFor(2, 5)).toBe(0);
    expect(trialDustFor(3, 5)).toBe(3);
    expect(trialDustFor(5, 5)).toBe(7);
    expect(settleTrialRun(DAY, { score: 1000, rounds: 2, totalRounds: 5 }, true).dust).toBe(0);
    expect(settleTrialRun(DAY, { score: 3000, rounds: 3, totalRounds: 5 }, true).dust).toBe(3);
    expect(settleTrialRun(DAY, { score: 3500, rounds: 3, totalRounds: 5 }, true).dust).toBe(0);
    const full = settleTrialRun(DAY, { score: 7000, rounds: 5, totalRounds: 5 }, true);
    expect(full.dust).toBe(4);
    expect(full.bonus).not.toBeNull();
    // No farming: a second full clear the same day pays nothing.
    const again = settleTrialRun(DAY, { score: 7100, rounds: 5, totalRounds: 5 }, true);
    expect(again).toMatchObject({ dust: 0, bonus: null, newBest: true });
    // Tomorrow is a new day.
    expect(settleTrialRun(DAY + 1, { score: 6000, rounds: 5, totalRounds: 5 }, true).dust).toBe(7);
  });

  it("toggling the clock between days never pays a day twice; old days never pay", () => {
    expect(settleTrialRun(DAY, { score: 7000, rounds: 5, totalRounds: 5 }, true)).toMatchObject({ dust: 7, claimed: false });
    expect(settleTrialRun(DAY - 1, { score: 7000, rounds: 5, totalRounds: 5 }, true).dust).toBe(7);
    // Back and forth: both days remembered.
    for (const d of [DAY, DAY - 1, DAY, DAY - 1]) {
      expect(settleTrialRun(d, { score: 7000, rounds: 5, totalRounds: 5 }, true)).toMatchObject({ dust: 0, bonus: null, claimed: true });
    }
    // A day older than the remembered window pays nothing, even unclaimed.
    expect(settleTrialRun(DAY - 9, { score: 7000, rounds: 5, totalRounds: 5 }, true)).toMatchObject({ dust: 0, bonus: null });
    expect(Object.keys(getTrialRecord().claims).length).toBeLessThanOrEqual(7);
  });

  it("a future-dated claim (clock moved forward, hostile 2079 key) never blocks real days", () => {
    const today = DAY + 10;
    // Hostile save: a 2079 claim and a +400-day claim are dropped on load.
    setTrialRecordFromSnapshot({ claims: { "2079-12-01": 5, [trialDayKey(today + 400)]: 5, [trialDayKey(today)]: 3 } });
    expect(Object.keys(getTrialRecord().claims)).toEqual([trialDayKey(today)]);
    resetTrialRecordForTest();
    // Clock moved forward once: that claim is recorded, but real days still pay.
    settleTrialRun(today + 400, { score: 7000, rounds: 5, totalRounds: 5 }, true, today + 400);
    expect(settleTrialRun(today, { score: 7000, rounds: 5, totalRounds: 5 }, true, today).dust).toBe(7);
    expect(settleTrialRun(today + 1, { score: 7000, rounds: 5, totalRounds: 5 }, true, today + 1).dust).toBe(7);
  });

  it("replaying an earlier day (clock set back) never resets the streak", () => {
    settleTrialRun(DAY, { score: 3000, rounds: 3, totalRounds: 5 }, true);
    expect(settleTrialRun(DAY + 1, { score: 3000, rounds: 3, totalRounds: 5 }, true).streak).toBe(2);
    settleTrialRun(DAY, { score: 3500, rounds: 3, totalRounds: 5 }, true);
    expect(getTrialRecord().streak).toBe(2);
    expect(getTrialRecord().lastShowingDay).toBe(DAY + 1);
  });

  it("the bonus roll is seeded by the day: rare tint or a bond bump", () => {
    const kinds = new Set<string>();
    for (let d = DAY; d < DAY + 200; d++) {
      resetTrialRecordForTest();
      const bonus = settleTrialRun(d, { score: 6500, rounds: 5, totalRounds: 5 }, true).bonus!;
      kinds.add(bonus.kind);
      resetTrialRecordForTest();
      expect(settleTrialRun(d, { score: 6500, rounds: 5, totalRounds: 5 }, true).bonus).toEqual(bonus);
      resetTrialRecordForTest();
      // A lead that is already rare gets the bond bump instead.
      expect(settleTrialRun(d, { score: 6500, rounds: 5, totalRounds: 5 }, false).bonus?.kind).toBe("bond");
    }
    expect(kinds).toEqual(new Set(["rare", "bond"]));
  });

  it("keeps the best score per day and a streak of showing days", () => {
    settleTrialRun(DAY, { score: 4000, rounds: 4, totalRounds: 5 }, true);
    expect(settleTrialRun(DAY, { score: 3000, rounds: 3, totalRounds: 5 }, true).newBest).toBe(false);
    expect(getTrialRecord().best["2026-10-08"]).toBe(4000);
    expect(settleTrialRun(DAY + 1, { score: 3200, rounds: 3, totalRounds: 5 }, true).streak).toBe(2);
    // A run that clears under three rounds keeps the record but not the streak.
    settleTrialRun(DAY + 2, { score: 900, rounds: 1, totalRounds: 5 }, true);
    expect(currentStreak(DAY + 2)).toBe(2);
    expect(currentStreak(DAY + 3)).toBe(0);
    expect(settleTrialRun(DAY + 4, { score: 3300, rounds: 3, totalRounds: 5 }, true).streak).toBe(1);
  });

  it("keeps only the most recent days", () => {
    for (let d = DAY; d < DAY + BEST_DAYS_KEPT + 10; d++) {
      settleTrialRun(d, { score: 100, rounds: 0, totalRounds: 5 }, true);
    }
    expect(Object.keys(getTrialRecord().best)).toHaveLength(BEST_DAYS_KEPT);
  });

  it("repairs hostile saved values part by part, never throwing", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      "trials",
      [],
      [1, 2],
      { best: null },
      { best: [] },
      { best: { "2026-10-08": "9000", "2026-02-31": 5, nope: 3, "__proto__": 1 } },
      { best: { "2026-10-08": Infinity } },
      { best: { "2026-10-08": -5 } },
      { best: { "2026-10-08": 1e12 } },
      { streak: -1, lastShowingDay: "2026-10-08" },
      { streak: 1.5, lastShowingDay: DAY },
      { streak: 3, lastShowingDay: 99_999_999 },
      { claims: { "2026-10-08": 99, nope: 3, "2026-10-09": "x" } },
      { claims: [] },
      { bonusDays: [DAY, "2026-10-08", "2026-10-08", null] },
      { bonusDays: "2026-10-08" },
      JSON.parse('{"__proto__": {"polluted": true}, "best": {"__proto__": {"x": 1}}}'),
    ];
    for (const raw of hostile) {
      const record = sanitizeTrialRecord(raw);
      expect(record.streak).toBeGreaterThanOrEqual(0);
      for (const [key, rounds] of Object.entries(record.claims)) {
        expect(parseTrialDayKey(key)).not.toBeNull();
        expect(Number.isInteger(rounds) && rounds >= 0 && rounds <= 5).toBe(true);
      }
      expect(record.bonusDays.every((k) => parseTrialDayKey(k) !== null)).toBe(true);
      expect(new Set(record.bonusDays).size).toBe(record.bonusDays.length);
      for (const [key, score] of Object.entries(record.best)) {
        expect(parseTrialDayKey(key)).not.toBeNull();
        expect(Number.isFinite(score) && score >= 0 && score <= 100_000).toBe(true);
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(sanitizeTrialRecord({ best: { "2026-10-08": 1e12 } }).best["2026-10-08"]).toBe(100_000);
    expect(sanitizeTrialRecord({ streak: 3, lastShowingDay: DAY }).streak).toBe(3);
    expect(sanitizeTrialRecord({ streak: 3 }).streak).toBe(0);
    expect(sanitizeTrialRecord("x")).toEqual(emptyTrialRecord());
  });

  it("an old-shaped save carries no field; a hostile field never rejects the save", () => {
    const snapshot = exportWorldSnapshot({ zoneId: "shrine", x: 5, y: 5 });
    expect("eclipseTrials" in snapshot).toBe(false);
    expect(getTrialRecordSnapshot()).toBeUndefined();
    for (const hostile of [null, "x", 5, [], { best: "nope" }, { streak: "∞" }, { best: { a: { b: 1 } } }]) {
      const save = { ...snapshot, eclipseTrials: hostile };
      expect(isValidWorldSnapshot(save)).toBe(true);
      expect(() => applyWorldSnapshot(save)).not.toThrow();
      expect(getTrialRecord().streak).toBe(0);
    }
    // Round trip keeps a real record.
    setTrialRecordFromSnapshot({ best: { "2026-10-08": 5000 }, streak: 2, lastShowingDay: DAY });
    const saved = exportWorldSnapshot({ zoneId: "shrine", x: 5, y: 5 });
    resetTrialRecordForTest();
    applyWorldSnapshot(saved);
    expect(getTrialRecord().best).toEqual({ "2026-10-08": 5000 });
    expect(currentStreak(DAY)).toBe(2);
  });
});
