import { describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import { BOON_IDS } from "./boons";
import { buildTrialPlan, clearTrialPlanCacheForTest, isInTrialTable, trialAttemptFor, TRIAL_TABLE_START } from "./dailyTrial";
import { MODIFIERS, modifiersClash } from "./modifiers";
import {
  BOSS_ROUND_INDEX,
  ECLIPSE_BOSS_CREATURE,
  generateTrialPlan,
  ROUND_LEVEL_BONUS,
  ROUND_MODIFIER_BUDGET,
  TRIAL_ROUNDS,
  TRIAL_SPECIES,
} from "./trialPlan";
import {
  formatTrialDay,
  isValidTrialDay,
  MAX_TRIAL_DAY,
  MIN_TRIAL_DAY,
  parseTrialDayKey,
  todayTrialDay,
  trialDayKey,
  trialRng,
} from "./trialSeed";

const DAY = parseTrialDayKey("2026-10-08")!;

describe("trial seeds (#420)", () => {
  it("is the UTC calendar day", () => {
    expect(todayTrialDay(Date.UTC(2026, 9, 8, 0, 0, 1))).toBe(DAY);
    expect(todayTrialDay(Date.UTC(2026, 9, 8, 23, 59, 59))).toBe(DAY);
    expect(todayTrialDay(Date.UTC(2026, 9, 9))).toBe(DAY + 1);
    expect(trialDayKey(DAY)).toBe("2026-10-08");
    expect(formatTrialDay(DAY)).toBe("Oct 8, 2026");
  });

  it("parses only real in-range YYYY-MM-DD dates", () => {
    expect(parseTrialDayKey("2024-01-01")).toBe(MIN_TRIAL_DAY);
    expect(parseTrialDayKey("2079-12-31")).toBe(MAX_TRIAL_DAY);
    for (const bad of [
      "2023-12-31",
      "2080-01-01",
      "2026-02-31",
      "2026-13-01",
      "2026-1-08",
      " 2026-10-08",
      "2026-10-08 ",
      "2026/10/08",
      "２０２６-10-08",
      "20261008",
      "",
      "2026-10-08T00:00",
    ]) {
      expect(parseTrialDayKey(bad), bad).toBeNull();
    }
    for (const bad of [null, undefined, 20734, {}, ["2026-10-08"]]) {
      expect(parseTrialDayKey(bad)).toBeNull();
    }
    expect(isValidTrialDay(DAY)).toBe(true);
    expect(isValidTrialDay(DAY + 0.5)).toBe(false);
  });

  it("gives every stream its own deterministic sequence", () => {
    const a = trialRng(DAY, "lineup");
    const b = trialRng(DAY, "lineup");
    const c = trialRng(DAY, "boons");
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("trial plan (#420)", () => {
  it("same seed -> same lineup, modifiers, boss and boon offers", () => {
    const first = JSON.stringify(buildTrialPlan(DAY));
    clearTrialPlanCacheForTest();
    expect(JSON.stringify(buildTrialPlan(DAY))).toBe(first);
    expect(JSON.stringify(generateTrialPlan(DAY, 2))).toBe(JSON.stringify(generateTrialPlan(DAY, 2)));
  });

  it("different days give different gauntlets", { timeout: 60_000 }, () => {
    const keys = new Set<string>();
    for (let d = DAY; d < DAY + 30; d++) {
      const plan = buildTrialPlan(d);
      keys.add(plan.rounds.map((r) => `${r.creatureId}:${r.modifiers.join("+")}`).join("|"));
    }
    expect(keys.size).toBeGreaterThan(25);
  });

  it("is five rounds of converted-art foes with rising levels and a boss last", () => {
    for (let d = DAY; d < DAY + 60; d++) {
      const plan = generateTrialPlan(d, d % 8);
      expect(plan.rounds).toHaveLength(TRIAL_ROUNDS);
      const foes = plan.rounds.slice(0, BOSS_ROUND_INDEX);
      expect(new Set(foes.map((r) => r.creatureId)).size).toBe(foes.length);
      for (const r of foes) {
        expect(r.kind).toBe("foe");
        expect(TRIAL_SPECIES).toContain(r.creatureId);
      }
      // Four different types: no single party type sweeps the day.
      expect(new Set(foes.map((r) => getCreatureDefinition(r.creatureId).folkloreType)).size).toBe(4);
      const boss = plan.rounds[BOSS_ROUND_INDEX]!;
      expect(boss).toMatchObject({ kind: "boss", creatureId: ECLIPSE_BOSS_CREATURE });
      expect(plan.rounds.map((r) => r.levelBonus)).toEqual([...ROUND_LEVEL_BONUS]);
      expect(plan.boss.formTypes[0]).not.toBe(plan.boss.formTypes[1]);
    }
  });

  it("rolls 1-2 modifiers per round inside the round's budget, never clashing", () => {
    for (let d = DAY; d < DAY + 120; d++) {
      for (const round of generateTrialPlan(d, d % 8).rounds) {
        expect(round.modifiers.length).toBeGreaterThanOrEqual(1);
        expect(round.modifiers.length).toBeLessThanOrEqual(round.index === 0 || round.kind === "boss" ? 1 : 2);
        const weight = round.modifiers.reduce((sum, id) => sum + MODIFIERS[id].weight, 0);
        expect(weight).toBeLessThanOrEqual(ROUND_MODIFIER_BUDGET[round.index]!);
        if (round.kind === "boss") {
          expect(round.modifiers.some((id) => MODIFIERS[id].notOnBoss)).toBe(false);
        }
        const [a, b] = round.modifiers;
        if (a && b) {
          expect(modifiersClash(a, b)).toBe(false);
          expect(a).not.toBe(b);
        }
      }
    }
  });

  it("never offers Quickened before a Short Fuse round (finishers are ready anyway)", () => {
    let checked = 0;
    for (let d = DAY; d < DAY + 300; d++) {
      for (const attempt of [0, 3]) {
        const plan = generateTrialPlan(d, attempt);
        plan.boonOffers.forEach((offers, i) => {
          if (plan.rounds[i + 1]!.modifiers.includes("short-fuse")) {
            checked += 1;
            expect(offers).not.toContain("quickened");
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("offers three different boons after every non-final round", () => {
    const plan = buildTrialPlan(DAY);
    expect(plan.boonOffers).toHaveLength(BOSS_ROUND_INDEX);
    for (const offers of plan.boonOffers) {
      expect(offers).toHaveLength(3);
      expect(new Set(offers).size).toBe(3);
      for (const id of offers) expect(BOON_IDS).toContain(id);
    }
  });

  it("builds each day from the committed gate table without running sims", () => {
    for (let d = TRIAL_TABLE_START; d < TRIAL_TABLE_START + 60; d++) {
      expect(JSON.stringify(buildTrialPlan(d))).toBe(JSON.stringify(generateTrialPlan(d, trialAttemptFor(d))));
    }
    // Outside the window: the first roll, still deterministic.
    expect(trialAttemptFor(TRIAL_TABLE_START - 1)).toBe(0);
    expect(isInTrialTable(TRIAL_TABLE_START - 1)).toBe(false);
  });
});
