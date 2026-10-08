import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import table from "./trialTable.json";
import { selectTrialAttempt, MAX_ATTEMPTS } from "./trialGate";
import { TRIAL_TABLE_START, trialAttemptFor } from "./dailyTrial";
import { FIRST_TRIAL_DAY, FIRST_TRIAL_DAY_KEY, parseTrialDayKey, todayTrialDay, trialDayKey } from "./trialSeed";

/**
 * The committed per-day re-roll table (#420). `npm run trials:table`
 * regenerates it (TRIAL_TABLE_WRITE=1); normal runs re-run the offline gate
 * on a spread of days and require the committed digits to match, so a
 * tuning change that moves the gate fails here until the table is rebuilt.
 */

const WINDOW = { start: "2026-10-01", end: "2028-12-31" };

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
      writeFileSync(path, `${JSON.stringify({ start: trialDayKey(start), attempts }, null, 2)}\n`);
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

  it("matches the gate on a spread of regenerated days", { timeout: 120_000 }, () => {
    for (let i = 0; i < table.attempts.length; i += 41) {
      const day = TRIAL_TABLE_START + i;
      expect(trialAttemptFor(day), trialDayKey(day)).toBe(selectTrialAttempt(day));
    }
  });
});
