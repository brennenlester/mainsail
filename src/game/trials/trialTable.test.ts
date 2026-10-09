import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import table from "./trialTable.json";
import {
  CLASS_MIN,
  FAIR_MAX,
  FAIR_MIN,
  MAX_ATTEMPTS,
  PACE,
  paceExcess,
  referenceRates,
  selectTrialAttempt,
} from "./trialGate";
import { buildTrialPlan, TRIAL_TABLE_START, trialAttemptFor } from "./dailyTrial";
import { generateTrialPlan } from "./trialPlan";
import { FIRST_TRIAL_DAY, FIRST_TRIAL_DAY_KEY, parseTrialDayKey, todayTrialDay, trialDayKey } from "./trialSeed";

/**
 * The committed per-day re-roll table (#420). `npm run trials:table`
 * regenerates it (TRIAL_TABLE_WRITE=1); normal runs re-run the offline gate
 * on a spread of days and require the committed digits to match, so a
 * tuning change that moves the gate fails here until the table is rebuilt.
 *
 * #429: `gate` is a fingerprint of the gate's sims on a few fixed
 * candidates (and its thresholds). Any change to trial tuning or the sim
 * moves it, so a stale table fails here even when the spread check misses
 * it; and every committed day is re-checked against the pace gate.
 */

const WINDOW = { start: "2026-10-01", end: "2028-12-31" };

/** FNV-1a over the gate's view of a few fixed candidates (cheap: ~1 s). */
function gateFingerprint(): string {
  const start = parseTrialDayKey(WINDOW.start)!;
  const samples = [0, 1, 2].flatMap((d) =>
    [0, 1].map((attempt) => referenceRates(generateTrialPlan(start + d * 97, attempt), 4)),
  );
  const text = JSON.stringify({ samples, PACE, FAIR_MIN, FAIR_MAX, CLASS_MIN, MAX_ATTEMPTS });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

describe("trial table (#420)", () => {
  if (process.env.TRIAL_TABLE_WRITE === "1") {
    it("regenerates trialTable.json", { timeout: 3_600_000 }, () => {
      const start = parseTrialDayKey(WINDOW.start)!;
      const end = parseTrialDayKey(WINDOW.end)!;
      let attempts = "";
      for (let day = start; day <= end; day++) {
        attempts += selectTrialAttempt(day).toString(36);
      }
      const path = join(process.cwd(), "src/game/trials/trialTable.json");
      const gate = gateFingerprint();
      writeFileSync(path, `${JSON.stringify({ start: trialDayKey(start), gate, attempts }, null, 2)}\n`);
    });
    return;
  }

  it("starts at the first linkable day and still runs a year past today (else: npm run trials:table)", () => {
    expect(table.start).toBe(FIRST_TRIAL_DAY_KEY);
    expect(TRIAL_TABLE_START).toBe(FIRST_TRIAL_DAY);
    const last = TRIAL_TABLE_START + table.attempts.length - 1;
    expect(last - todayTrialDay(), "extend WINDOW.end and regenerate the table").toBeGreaterThanOrEqual(365);
  });

  it("covers the window with one valid digit per day", () => {
    expect(table.start).toBe(WINDOW.start);
    expect(table.attempts).toHaveLength(parseTrialDayKey(WINDOW.end)! - TRIAL_TABLE_START + 1);
    expect([...table.attempts].every((c) => parseInt(c, 36) < MAX_ATTEMPTS)).toBe(true);
  });

  it("was built by today's gate and sims (else: npm run trials:table)", { timeout: 30_000 }, () => {
    expect(table.gate).toBe(gateFingerprint());
  });

  it("every committed day passes the pace gate (#429)", { timeout: 120_000 }, () => {
    // The gate's own first look (same seeds) at each chosen plan: every class
    // keeps skilled rounds within PACE (mean and p90 turns).
    const slow: string[] = [];
    for (let i = 0; i < table.attempts.length; i++) {
      const day = TRIAL_TABLE_START + i;
      if (paceExcess(referenceRates(buildTrialPlan(day))) > 0) {
        slow.push(trialDayKey(day));
      }
    }
    expect(slow).toEqual([]);
  });

  it("matches the gate on a spread of regenerated days", { timeout: 120_000 }, () => {
    for (let i = 0; i < table.attempts.length; i += 41) {
      const day = TRIAL_TABLE_START + i;
      expect(trialAttemptFor(day), trialDayKey(day)).toBe(selectTrialAttempt(day));
    }
  });
});
