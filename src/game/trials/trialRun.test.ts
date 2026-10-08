import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drainBondTierUps } from "../companions/bond";
import { getEffectiveMaxHp, playerParty, setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { getMaterialCount, setInventoryFromSnapshot } from "../inventory/playerInventory";
import { grantSparRewards } from "../battle/sparRewards";
import { resetStorySparForTest } from "../battle/storySpar";
import { createEmptyQuestProgress, restoreQuestProgress } from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import { getSparWinsForSpecies, setSparWinsBySpecies } from "../world/sparWins";
import { persistHostSave } from "../world/worldSave";
import { flushPendingHostSave, isHostPersistSuspended, notifyWorldChanged } from "../world/worldSaveSchedule";
import { setVisitorMode } from "../world/worldSession";
import { MEND_FRACTION } from "./boons";
import {
  abandonTrial,
  beginTrial,
  BORROWED_PARTY,
  chooseTrialBoon,
  currentBoonOffers,
  endTrialRound,
  finishTrial,
  getTrialRun,
  isTrialsUnlocked,
  resetTrialRunForTest,
  startTrialRound,
  trialBlockReason,
} from "./trialRun";
import { getTrialRecord, resetTrialRecordForTest } from "./trialState";
import { todayTrialDay } from "./trialSeed";
import { buildTrialPlan } from "./dailyTrial";
import { TRIAL_ROUND_RECOVERY } from "./trialRules";

const SAVE_KEY = "ivyward-save-v1";
const TODAY = todayTrialDay();

function member(id: string, definitionId: string, level: number, currentHp: number): CreatureInstance {
  return { instanceId: id, definitionId, speciesId: definitionId, currentHp, level, xp: 5 * (level - 1) ** 2 } as CreatureInstance;
}

function finishStory(done = true): void {
  const progress = createEmptyQuestProgress();
  for (const id of QUEST_ORDER) {
    progress[id] = done ? "complete" : "locked";
  }
  if (!done) {
    progress[QUEST_ORDER[0]!] = "active";
  }
  restoreQuestProgress(progress);
}

beforeEach(() => {
  localStorage.clear();
  setVisitorMode(false);
  resetTrialRunForTest();
  resetTrialRecordForTest();
  resetStorySparForTest();
  drainBondTierUps();
  setInventoryFromSnapshot({ "folklore-dust": 2 }, {});
  setSparWinsBySpecies({}, false);
  setPartyFromSnapshot(
    [member("a", "bramblewarden", 10, 20), member("b", "hearthflame", 10, 0), member("c", "brook-nymph", 10, 30)],
    4,
  );
  finishStory();
});

afterEach(() => {
  resetTrialRunForTest();
  setVisitorMode(false);
});

/** Win (or lose) the current round as if BattleScene played it. */
function playRound(won: boolean, hpLoss = 5): ReturnType<typeof endTrialRound> {
  const battle = startTrialRound()!;
  expect(battle).not.toBeNull();
  battle.notePlayerTurn();
  battle.notePlayerTurn();
  const lead = playerParty.creatures.find((c) => c.currentHp > 0)!;
  lead.currentHp = won ? Math.max(1, lead.currentHp - hpLoss) : 0;
  if (!won) {
    for (const c of playerParty.creatures) c.currentHp = 0;
  }
  return endTrialRound(won);
}

describe("Eclipse Trial unlock (#420)", () => {
  it("opens with the finale (old finished saves count) and is closed before it", () => {
    expect(isTrialsUnlocked()).toBe(true);
    expect(trialBlockReason()).toBeNull();
    finishStory(false);
    expect(isTrialsUnlocked()).toBe(false);
    expect(trialBlockReason()).toMatch(/sealed/);
    expect(beginTrial(TODAY, "host")).toBe(false);
    setVisitorMode(true);
    expect(trialBlockReason()).toMatch(/own world/);
  });
});

describe("Eclipse Trial sandboxing (#420)", () => {
  it("pauses saving, heals to full, and restores the party exactly afterwards", () => {
    const before = structuredClone(playerParty.creatures);
    expect(beginTrial(TODAY, "host")).toBe(true);
    expect(isHostPersistSuspended()).toBe(true);
    for (const c of playerParty.creatures) {
      expect(c.currentHp).toBe(getEffectiveMaxHp(c));
    }
    // A battle's reward path inside the trial (XP, Dust, bond, spar wins) never sticks.
    grantSparRewards("lantern-fox", 0, () => 0.99);
    expect(getSparWinsForSpecies("lantern-fox")).toBe(1);
    playRound(true);
    const outcome = finishTrial()!;
    expect(outcome.score.roundsCleared).toBe(1);
    expect(isHostPersistSuspended()).toBe(false);
    expect(playerParty.creatures).toEqual(before);
    expect(getSparWinsForSpecies("lantern-fox")).toBe(0);
    expect(drainBondTierUps()).toEqual([]);
    // One round is not a showing: no Dust, but the best score is kept.
    expect(getMaterialCount("folklore-dust")).toBe(2);
    expect(Object.keys(getTrialRecord().best)).toHaveLength(1);
  });

  it("walking away restores everything and records nothing", () => {
    const before = structuredClone(playerParty.creatures);
    beginTrial(TODAY, "host");
    playRound(true);
    abandonTrial();
    expect(getTrialRun()).toBeNull();
    expect(isHostPersistSuspended()).toBe(false);
    expect(playerParty.creatures).toEqual(before);
    expect(getTrialRecord().best).toEqual({});
  });

  it("a tab closed mid-trial keeps the pre-trial save byte for byte", () => {
    persistHostSave();
    const saved = localStorage.getItem(SAVE_KEY);
    expect(saved).not.toBeNull();
    beginTrial(TODAY, "host");
    playRound(true);
    chooseTrialBoon(currentBoonOffers()[0]!);
    notifyWorldChanged();
    flushPendingHostSave();
    persistHostSave();
    expect(localStorage.getItem(SAVE_KEY)).toBe(saved);
  });

  it("carries HP between rounds with a breather; Mend lifts the fallen", () => {
    beginTrial(TODAY, "host");
    const battle = startTrialRound()!;
    battle.notePlayerTurn();
    const [a, b] = playerParty.creatures;
    a!.currentHp = 10;
    b!.currentHp = 0;
    endTrialRound(true);
    expect(a!.currentHp).toBe(10 + Math.round(getEffectiveMaxHp(a!) * TRIAL_ROUND_RECOVERY.fraction));
    expect(b!.currentHp).toBe(0);
    const offers = currentBoonOffers();
    expect(offers).toEqual(buildTrialPlan(TODAY).boonOffers[0]);
    if (offers.includes("mend")) {
      chooseTrialBoon("mend");
      expect(b!.currentHp).toBe(Math.round(getEffectiveMaxHp(b!) * MEND_FRACTION));
    } else {
      expect(chooseTrialBoon("mend")).toBe(false);
    }
  });

  it("a boon shapes only the next round; skipping one scores instead", () => {
    beginTrial(TODAY, "host");
    playRound(true);
    const pick = currentBoonOffers().find((id) => id !== "mend")!;
    chooseTrialBoon(pick);
    expect(startTrialRound()!.boons).toEqual([pick]);
    endTrialRound(true);
    chooseTrialBoon(null);
    expect(startTrialRound()!.boons).toEqual([]);
    endTrialRound(false);
    const outcome = finishTrial()!;
    expect(outcome.score.boonsSkipped).toBe(1);
    expect(outcome.score.boonsUsed).toBe(1);
  });

  it("pays capped daily Dust on a full clear, once", () => {
    for (let run = 0; run < 2; run++) {
      beginTrial(TODAY, "host");
      for (let r = 0; r < 5; r++) {
        const verdict = playRound(true);
        if (!verdict.finished) {
          chooseTrialBoon(null);
        }
      }
      const outcome = finishTrial()!;
      expect(outcome.score.cleared).toBe(true);
      if (run === 0) {
        expect(outcome.rewards[0]).toBe("+7 Folklore Dust");
        expect(outcome.rewards).toHaveLength(2);
      } else {
        expect(outcome.rewards).toEqual([]);
      }
    }
    expect(getMaterialCount("folklore-dust")).toBe(2 + 7);
  });

  it("an old seed (not today) records nothing and pays nothing", () => {
    beginTrial(TODAY - 3, "host");
    for (let r = 0; r < 3; r++) {
      playRound(true);
      chooseTrialBoon(null);
    }
    // Rounds only start from the preview (after the boon pick).
    expect(chooseTrialBoon(null)).toBe(false);
    const outcome = finishTrial()!;
    expect(outcome.score.roundsCleared).toBe(3);
    expect(outcome.settlement).toBeNull();
    expect(getMaterialCount("folklore-dust")).toBe(2);
  });
});

describe("Eclipse Trial link sandbox (#420)", () => {
  it("borrows a party for a visitor with no finished game and never records", () => {
    finishStory(false);
    setVisitorMode(true);
    expect(beginTrial(TODAY, "sandbox")).toBe(true);
    expect(playerParty.creatures.map((c) => c.definitionId)).toEqual([...BORROWED_PARTY]);
    playRound(true);
    const outcome = finishTrial()!;
    expect(outcome.mode).toBe("sandbox");
    expect(outcome.settlement).toBeNull();
    expect(getTrialRecord().best).toEqual({});
    expect(getMaterialCount("folklore-dust")).toBe(2);
  });

  it("uses a finished visitor's own party (in memory)", () => {
    setVisitorMode(true);
    beginTrial(TODAY, "sandbox");
    expect(playerParty.creatures.map((c) => c.instanceId)).toEqual(["a", "b", "c"]);
    abandonTrial();
  });
});
