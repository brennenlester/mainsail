import { beforeEach, describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { HUNTER_CHART } from "../creatures/folkloreTypes";
import { getCreatureDefinition } from "../creatures/catalog";
import { getEffectiveMaxHp, playerParty, setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import {
  getItemCount,
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { getWildEffectiveLevel } from "../progression/wildLevel";
import {
  createEmptyQuestProgress,
  getActiveQuestId,
  questProgress,
  restoreQuestProgress,
} from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { STORY_SPARS } from "../story/storySpars";
import { recordSparWin, setSparWinsBySpecies } from "../world/sparWins";
import { setVisitorMode } from "../world/worldSession";
import {
  beginStorySpar,
  consumeStorySparOutcome,
  forfeitStorySpar,
  getActiveStorySpar,
  getCurrentStorySparRound,
  launchStorySparRound,
  resetStorySparForTest,
  resolveStorySparRound,
} from "./storySpar";

function progressAt(activeId: QuestId): Record<QuestId, QuestStatus> {
  const progress = createEmptyQuestProgress();
  const index = QUEST_ORDER.indexOf(activeId);
  QUEST_ORDER.forEach((id, i) => {
    progress[id] = i < index ? "complete" : i === index ? "active" : "locked";
  });
  return progress;
}

function member(id: string, level: number, currentHp = 1): CreatureInstance {
  return {
    instanceId: id,
    definitionId: "bramblewarden",
    speciesId: "mossling",
    currentHp,
    level,
    xp: 0,
  } as CreatureInstance;
}

/** Minimal Phaser stand-in: records launches and fires BattleScene shutdown. */
function fakeScene() {
  const listeners: (() => void)[] = [];
  const launches: { key: string; data: unknown }[] = [];
  const scene = {
    scene: {
      get: () => ({
        events: {
          once: (_event: string, cb: () => void) => listeners.push(cb),
        },
      }),
      launch: (key: string, data: unknown) => launches.push({ key, data }),
    },
  } as unknown as Phaser.Scene;
  return {
    scene,
    launches,
    shutdown: () => listeners.splice(0).forEach((cb) => cb()),
  };
}

beforeEach(() => {
  setVisitorMode(false);
  resetStorySparForTest();
  setInventoryFromSnapshot({}, {});
  setSparWinsBySpecies({}, false);
  setPartyFromSnapshot([member("a", 4), member("b", 4)], 3);
  restoreQuestProgress(progressAt("rival-wren"));
});

describe("story spar data (#369)", () => {
  it("gives the rival a scaled two-creature party", () => {
    expect(STORY_SPARS["rival-wren"].rounds).toHaveLength(2);
  });

  it("keeps every boss telegraph honest against the hunter chart", () => {
    for (const round of STORY_SPARS["cinder-matriarch"].rounds) {
      expect(round.telegraph, round.creatureId).toBeTruthy();
      expect(round.counterType, round.creatureId).toBeDefined();
      const foeType = getCreatureDefinition(round.creatureId).folkloreType;
      expect(HUNTER_CHART[round.counterType!]).toBe(foeType);
      expect(round.telegraph).toContain(`(${foeType})`);
    }
  });
});

describe("story spar rounds", () => {
  it("scales round levels from the party average", () => {
    beginStorySpar("rival-wren");
    expect(getCurrentStorySparRound()?.level).toBe(4);
    expect(resolveStorySparRound(true)).toBe("next-round");
    expect(getCurrentStorySparRound()).toMatchObject({
      level: 5,
      roundNumber: 2,
      roundCount: 2,
    });
  });

  it("completes the rival beat and grants the reward once on the first win", () => {
    beginStorySpar("rival-wren");
    resolveStorySparRound(true);
    expect(resolveStorySparRound(true)).toBe("won");
    expect(getActiveStorySpar()).toBeNull();
    expect(questProgress["rival-wren"]).toBe("complete");
    expect(getActiveQuestId()).toBe("reach-mistwood");
    expect(getItemCount("brook-tonic")).toBe(2);
    expect(consumeStorySparOutcome("rival-wren")).toEqual({
      result: "won",
      firstWin: true,
      rewardText: "Brook Tonic×2",
    });
    expect(consumeStorySparOutcome("rival-wren")).toBeNull();

    // Rematch: harder, no second reward, no quest movement.
    beginStorySpar("rival-wren");
    expect(getCurrentStorySparRound()?.level).toBe(5);
    resolveStorySparRound(true);
    resolveStorySparRound(true);
    expect(getItemCount("brook-tonic")).toBe(2);
    expect(consumeStorySparOutcome("rival-wren")?.firstWin).toBe(false);
    expect(getActiveQuestId()).toBe("reach-mistwood");
  });

  it("restores the party on a loss and keeps the beat active", () => {
    beginStorySpar("rival-wren");
    expect(resolveStorySparRound(false)).toBe("lost");
    expect(getActiveQuestId()).toBe("rival-wren");
    for (const creature of playerParty.creatures) {
      expect(creature.currentHp).toBe(getEffectiveMaxHp(creature));
    }
    expect(consumeStorySparOutcome("rival-wren")?.result).toBe("lost");
  });

  it("treats walking away between rounds as a forfeit", () => {
    beginStorySpar("rival-wren");
    resolveStorySparRound(true);
    forfeitStorySpar();
    expect(getActiveStorySpar()).toBeNull();
    expect(getActiveQuestId()).toBe("rival-wren");
  });

  it("grants the boss reward and moves to the finale", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    beginStorySpar("cinder-matriarch");
    expect(getCurrentStorySparRound()?.round.creatureId).toBe("peat-sprite");
    resolveStorySparRound(true);
    expect(getCurrentStorySparRound()?.round.creatureId).toBe("cinder-toad");
    resolveStorySparRound(true);
    expect(getActiveQuestId()).toBe("shrine-finale");
    expect(getMaterialCount("folklore-dust")).toBe(5);
    expect(getItemCount("moonwake-draught")).toBe(1);
  });

  it("does not start for visitors", () => {
    setVisitorMode(true);
    expect(beginStorySpar("rival-wren")).toBe(false);
    expect(getActiveStorySpar()).toBeNull();
  });
});

describe("launchStorySparRound (BattleScene adapter)", () => {
  it("pins the wild level, launches BattleScene, and reads a win from spar wins", () => {
    const fake = fakeScene();
    beginStorySpar("rival-wren");
    const results: (string | null)[] = [];
    expect(launchStorySparRound(fake.scene, (r) => results.push(r))).toBe(true);
    expect(fake.launches).toEqual([
      {
        key: "BattleScene",
        data: expect.objectContaining({ wildCreatureId: "lantern-fox" }),
      },
    ]);
    // Level is pinned while the round runs, released afterwards.
    expect(getWildEffectiveLevel("lantern-fox", 1)).toBe(4);
    recordSparWin("lantern-fox", false);
    fake.shutdown();
    expect(results).toEqual(["next-round"]);
    expect(getWildEffectiveLevel("lantern-fox", 1)).not.toBe(4);
  });

  it("reads a loss when the spar-win counter did not move", () => {
    const fake = fakeScene();
    beginStorySpar("rival-wren");
    const results: (string | null)[] = [];
    launchStorySparRound(fake.scene, (r) => results.push(r));
    fake.shutdown();
    expect(results).toEqual(["lost"]);
  });

  it("refuses to launch without an active story spar", () => {
    const fake = fakeScene();
    expect(launchStorySparRound(fake.scene, () => undefined)).toBe(false);
    expect(fake.launches).toEqual([]);
  });
});
