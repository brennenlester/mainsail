import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initQuestProgress, questProgress } from "../story/questProgress";
import { setVisitorMode } from "../world/worldSession";
import { parseTrialDayKey } from "./trialSeed";
import {
  getTrialRecordSnapshot,
  hasAttemptedTrial,
  resetTrialRecordForTest,
  sanitizeTrialRecord,
  setTrialRecordFromSnapshot,
  settleTrialRun,
} from "./trialState";
import { claimEclipseGateToast, ECLIPSE_TRIAL_HINT, eclipseTrialHint } from "./trialUnlock";

const DAY = parseTrialDayKey("2026-10-08")!;

describe("Eclipse Trial hint lifecycle (#423)", () => {
  beforeEach(() => {
    initQuestProgress();
    resetTrialRecordForTest();
    setVisitorMode(false);
  });
  afterEach(() => {
    setVisitorMode(false);
    resetTrialRecordForTest();
  });

  it("stays hidden before the finale", () => {
    expect(eclipseTrialHint()).toBeNull();
  });

  it("shows after the finale and clears after the first played trial", () => {
    questProgress["shrine-finale"] = "complete";
    expect(eclipseTrialHint()).toBe(ECLIPSE_TRIAL_HINT);
    // A losing first run still counts as the attempt.
    settleTrialRun(DAY, { score: 120, rounds: 0, totalRounds: 5 }, true, DAY);
    expect(hasAttemptedTrial()).toBe(true);
    expect(eclipseTrialHint()).toBeNull();
  });

  it("is never shown to visitors", () => {
    questProgress["shrine-finale"] = "complete";
    setVisitorMode(true);
    expect(eclipseTrialHint()).toBeNull();
  });

  it("survives a save round-trip and treats old saves with scores as attempted", () => {
    questProgress["shrine-finale"] = "complete";
    settleTrialRun(DAY, { score: 0, rounds: 0, totalRounds: 5 }, true, DAY);
    const saved = getTrialRecordSnapshot();
    expect(saved?.attempted).toBe(true);
    resetTrialRecordForTest();
    expect(eclipseTrialHint()).toBe(ECLIPSE_TRIAL_HINT);
    setTrialRecordFromSnapshot(saved);
    expect(eclipseTrialHint()).toBeNull();
    expect(sanitizeTrialRecord({ best: { "2026-10-07": 900 } }, DAY).attempted).toBe(true);
    expect(sanitizeTrialRecord({}, DAY).attempted).toBe(false);
  });

  it("the one-time Gate toast fires once for a finished save, then never again (#423)", () => {
    questProgress["shrine-finale"] = "locked";
    expect(claimEclipseGateToast()).toBeNull();
    questProgress["shrine-finale"] = "complete";
    expect(claimEclipseGateToast()).toBe(ECLIPSE_TRIAL_HINT);
    expect(claimEclipseGateToast()).toBeNull();
    // Survives a save/load round-trip: no repeat on the next visit.
    const saved = getTrialRecordSnapshot();
    expect(saved?.eclipseGateToastShown).toBe(true);
    resetTrialRecordForTest();
    expect(claimEclipseGateToast()).toBe(ECLIPSE_TRIAL_HINT);
    resetTrialRecordForTest();
    setTrialRecordFromSnapshot(saved);
    expect(claimEclipseGateToast()).toBeNull();
  });

  it("never claims the Gate toast for visitors (flag stays unset) or after a played trial", () => {
    questProgress["shrine-finale"] = "complete";
    setVisitorMode(true);
    expect(claimEclipseGateToast()).toBeNull();
    expect(getTrialRecordSnapshot()).toBeUndefined();
    setVisitorMode(false);
    settleTrialRun(DAY, { score: 0, rounds: 0, totalRounds: 5 }, true, DAY);
    expect(claimEclipseGateToast()).toBeNull();
  });

  it("reads the flag leniently: only a literal true counts", () => {
    for (const bad of [1, "true", null, [], {}, "yes"]) {
      expect(sanitizeTrialRecord({ eclipseGateToastShown: bad }, DAY).eclipseGateToastShown).toBe(false);
    }
    expect(sanitizeTrialRecord("hostile", DAY).eclipseGateToastShown).toBe(false);
    expect(sanitizeTrialRecord({ eclipseGateToastShown: true }, DAY).eclipseGateToastShown).toBe(true);
    // A flag-only record still persists.
    setTrialRecordFromSnapshot({ eclipseGateToastShown: true });
    expect(getTrialRecordSnapshot()?.eclipseGateToastShown).toBe(true);
  });
});
