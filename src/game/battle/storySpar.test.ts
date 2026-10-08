import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { HUNTER_CHART } from "../creatures/folkloreTypes";
import { getEffectiveMaxHp, playerParty, setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import {
  getItemCount,
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import {
  ENCOUNTERABLE_CREATURE_IDS,
  resetAchievementsForTest,
} from "../progression/achievements";
import {
  createEmptyQuestProgress,
  getActiveQuestId,
  questProgress,
  restoreQuestProgress,
} from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { STORY_SPARS, storySparRoster } from "../story/storySpars";
import { getSparWinsForSpecies, setSparWinsBySpecies } from "../world/sparWins";
import { drainBondTierUps } from "../companions/bond";
import {
  isHostSaveLocked,
  loadHostSave,
  persistHostSave,
  restoreHostSave,
} from "../world/worldSave";
import { flushPendingHostSave, isHostPersistSuspended } from "../world/worldSaveSchedule";
import { setDiscoveredCreatures, worldState } from "../world/worldState";
import { grantSparRewards } from "./sparRewards";
import { setVisitorMode } from "../world/worldSession";
import {
  beginStorySpar,
  consumeStorySparOutcome,
  describeStorySparLineup,
  forfeitStorySpar,
  getActiveStorySpar,
  getStorySparNpcLine,
  launchStorySpar,
  reportStoryBattleResult,
  resetStorySparForTest,
  resolveStorySpar,
  setStorySparLosses,
  getStorySparLosses,
  getStorySparLossStreaks,
  getHearthWard,
  getStoryBattleInit,
  grantCoverageGift,
  setStorySparLossStreaks,
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

/** Minimal Phaser stand-in: records launches and fires BattleScene create / shutdown. */
function fakeScene() {
  const listeners = new Map<string, (() => void)[]>();
  const launches: { key: string; data: unknown }[] = [];
  const events = {
    once: (event: string, cb: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
    },
    off: (event: string, cb: () => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== cb));
    },
  };
  const fire = (event: string) => {
    const cbs = listeners.get(event) ?? [];
    listeners.set(event, []);
    cbs.forEach((cb) => cb());
  };
  const scene = {
    scene: {
      get: () => ({ events }),
      launch: (key: string, data: unknown) => launches.push({ key, data }),
    },
  } as unknown as Phaser.Scene;
  return {
    scene,
    launches,
    create: () => fire("create"),
    shutdown: () => fire("shutdown"),
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

describe("story spar data (#369, #385)", () => {
  it("gives the rival a scaled two-creature team and a third on rematches", () => {
    const def = STORY_SPARS["rival-wren"];
    expect(storySparRoster(def, false)).toHaveLength(2);
    expect(storySparRoster(def, true)).toHaveLength(3);
    expect(def.rematchLevelBonus).toBeGreaterThan(0);
    expect(def.title).toBe("Wren, the Rival");
  });

  it("keeps every boss form telegraph honest against the hunter chart", () => {
    const boss = STORY_SPARS["cinder-matriarch"].boss!;
    expect(boss.forms.length).toBeGreaterThanOrEqual(2);
    for (const form of boss.forms) {
      expect(HUNTER_CHART[form.counterType], form.id).toBe(form.type);
      expect(form.telegraph).toContain(`(${form.type})`);
      // Every pattern step is a real move of that form.
      for (const step of form.pattern) {
        expect(form.kit.some((m) => m.id === step), `${form.id}:${step}`).toBe(true);
      }
    }
    // The signature is announced by the wind-up in the same form.
    const cinder = boss.forms.find((f) => f.kit.some((m) => m.id === boss.signatureId))!;
    const steps = cinder.pattern;
    const sig = steps.indexOf(boss.signatureId);
    expect(steps[(sig - 1 + steps.length) % steps.length]).toBe(boss.chargeId);
    expect(STORY_SPARS["cinder-matriarch"].title).toBe("Cinder Matriarch");
  });

  it("describes the lineup with scaled levels", () => {
    expect(describeStorySparLineup("rival-wren")).toBe("Lantern Fox (Lv 4), then Rootwalker (Lv 5)");
    restoreQuestProgress(progressAt("reach-mistwood"));
    expect(describeStorySparLineup("rival-wren")).toBe(
      "Lantern Fox (Lv 5), then Rootwalker (Lv 6), then Thunder Finch (Lv 5)",
    );
  });
});

describe("story spar resolution", () => {
  it("completes the rival beat and grants the reward once on the first win", () => {
    beginStorySpar("rival-wren");
    expect(getActiveStorySpar()).toMatchObject({ id: "rival-wren", rematch: false });
    expect(resolveStorySpar(true)).toBe("won");
    expect(getActiveStorySpar()).toBeNull();
    expect(questProgress["rival-wren"]).toBe("complete");
    expect(getActiveQuestId()).toBe("reach-mistwood");
    expect(getItemCount("brook-tonic")).toBe(2);
    expect(consumeStorySparOutcome("rival-wren")).toEqual({
      result: "won",
      firstWin: true,
      healed: false,
      rewardText: "Brook Tonic×2",
      gift: "Pip the Brook Nymph",
    });
    expect(consumeStorySparOutcome("rival-wren")).toBeNull();
    // Type coverage for Cinder form (#385 playtest): a water companion joins.
    expect(playerParty.creatures.filter((c) => c.nickname === "Pip")).toHaveLength(1);

    // Rematch: no second reward, no quest movement.
    beginStorySpar("rival-wren");
    expect(getActiveStorySpar()?.rematch).toBe(true);
    resolveStorySpar(true);
    expect(getItemCount("brook-tonic")).toBe(2);
    expect(consumeStorySparOutcome("rival-wren")?.firstWin).toBe(false);
    expect(getActiveQuestId()).toBe("reach-mistwood");
  });

  it("skips the coverage gift when the party already has the type", () => {
    playerParty.creatures.push({ ...member("w", 4), definitionId: "brook-nymph", speciesId: "brook-nymph" });
    beginStorySpar("rival-wren");
    resolveStorySpar(true);
    expect(consumeStorySparOutcome("rival-wren")?.rewardText).toBe("Brook Tonic×2");
    expect(playerParty.creatures.some((c) => c.nickname === "Pip")).toBe(false);
    expect(grantCoverageGift("rival-wren")).toBeNull();
  });

  it("heals only the first real loss of the active beat", () => {
    beginStorySpar("rival-wren");
    expect(resolveStorySpar(false)).toBe("lost");
    expect(getActiveQuestId()).toBe("rival-wren");
    for (const creature of playerParty.creatures) {
      expect(creature.currentHp).toBe(getEffectiveMaxHp(creature));
    }
    expect(consumeStorySparOutcome("rival-wren")).toMatchObject({ result: "lost", healed: true });

    // Second loss: back to pre-spar HP, not a heal.
    for (const creature of playerParty.creatures) creature.currentHp = 3;
    beginStorySpar("rival-wren");
    for (const creature of playerParty.creatures) creature.currentHp = 0;
    resolveStorySpar(false);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([3, 3]);
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(false);
  });

  it("forfeit restores pre-spar HP and rolls back rewards, and is not a loss", () => {
    beginStorySpar("rival-wren");
    playerParty.creatures[0]!.xp += 50;
    playerParty.creatures[0]!.currentHp = 0;
    setInventoryFromSnapshot({ "folklore-dust": 2 }, {});
    forfeitStorySpar();
    expect(getActiveStorySpar()).toBeNull();
    expect(getActiveQuestId()).toBe("rival-wren");
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([1, 1]);
    expect(playerParty.creatures[0]!.xp).toBe(0);
    expect(getMaterialCount("folklore-dust")).toBe(0);
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(false);
    beginStorySpar("rival-wren");
    resolveStorySpar(false);
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(true);
  });

  it("gives rematches no heal and no XP / Dust farm", () => {
    restoreQuestProgress(progressAt("reach-mistwood"));
    beginStorySpar("rival-wren");
    setInventoryFromSnapshot({ "folklore-dust": 4 }, {});
    playerParty.creatures[0]!.xp += 40;
    resolveStorySpar(true);
    expect(getMaterialCount("folklore-dust")).toBe(0);
    expect(playerParty.creatures[0]!.xp).toBe(0);

    beginStorySpar("rival-wren");
    resolveStorySpar(false);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([1, 1]);
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(false);
  });

  it("grants the boss reward and moves to the finale", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    beginStorySpar("cinder-matriarch");
    resolveStorySpar(true);
    expect(getActiveQuestId()).toBe("shrine-finale");
    expect(getItemCount("moonwake-draught")).toBe(1);
  });

  it("refuses to start with a fully fainted party or for visitors", () => {
    for (const creature of playerParty.creatures) creature.currentHp = 0;
    expect(beginStorySpar("rival-wren")).toBe(false);
    for (const creature of playerParty.creatures) creature.currentHp = 1;
    setVisitorMode(true);
    expect(beginStorySpar("rival-wren")).toBe(false);
    expect(getActiveStorySpar()).toBeNull();
  });

  it("shows the rematch line after a loss on the Story 5 HUD", () => {
    expect(getStorySparNpcLine()).toBeNull();
    beginStorySpar("rival-wren");
    expect(getStorySparNpcLine()).toBeNull();
    resolveStorySpar(false);
    expect(getStorySparNpcLine()).toMatch(/rematch/);
  });

  it("marks story species discovered before the snapshot, so a codex reward survives rollback (#382)", () => {
    resetAchievementsForTest();
    setDiscoveredCreatures(ENCOUNTERABLE_CREATURE_IDS.filter((id) => id !== "rootwalker"));
    beginStorySpar("rival-wren");
    expect(worldState.discoveredCreatures).toContain("rootwalker");
    const tonics = getItemCount("brook-tonic");
    expect(tonics).toBeGreaterThan(0);
    resolveStorySpar(false);
    expect(getItemCount("brook-tonic")).toBe(tonics);
    resetAchievementsForTest();
  });

  it("does not mark rematch-only species on a first challenge", () => {
    setDiscoveredCreatures([]);
    beginStorySpar("rival-wren");
    expect(worldState.discoveredCreatures).not.toContain("thunder-finch");
    forfeitStorySpar();
  });
});

describe("launchStorySpar (BattleScene adapter)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("launches one battle with explicit story init data and reads the reported win", () => {
    const fake = fakeScene();
    beginStorySpar("rival-wren");
    const results: (string | null)[] = [];
    expect(launchStorySpar(fake.scene, (r) => results.push(r))).toBe(true);
    expect(fake.launches).toEqual([
      {
        key: "BattleScene",
        data: expect.objectContaining({
          wildCreatureId: "lantern-fox",
          story: { sparId: "rival-wren", rematch: false, ward: 1 },
        }),
      },
    ]);
    fake.create();
    reportStoryBattleResult("rival-wren", true);
    fake.shutdown();
    expect(results).toEqual(["won"]);
    expect(questProgress["rival-wren"]).toBe("complete");
  });

  it("treats a battle that closes without a verdict as a loss", () => {
    const fake = fakeScene();
    beginStorySpar("rival-wren");
    const results: (string | null)[] = [];
    launchStorySpar(fake.scene, (r) => results.push(r));
    fake.create();
    fake.shutdown();
    expect(results).toEqual(["lost"]);
  });

  it("launches the boss on her own art", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    const fake = fakeScene();
    beginStorySpar("cinder-matriarch");
    launchStorySpar(fake.scene, () => undefined);
    expect(fake.launches[0]!.data).toMatchObject({
      wildCreatureId: "cinder-toad",
      story: { sparId: "cinder-matriarch", rematch: false },
    });
  });

  it("ends the save pause when BattleScene never starts (#382)", () => {
    vi.useFakeTimers();
    const fake = fakeScene();
    beginStorySpar("rival-wren");
    expect(isHostPersistSuspended()).toBe(true);
    const results: (string | null)[] = [];
    launchStorySpar(fake.scene, (r) => results.push(r), 1000);
    vi.advanceTimersByTime(1001);
    expect(results).toEqual([null]);
    expect(getActiveStorySpar()).toBeNull();
    expect(isHostPersistSuspended()).toBe(false);
    expect(isHostSaveLocked()).toBe(false);
    // A forfeit, not a loss: the beat's one heal is still there.
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(false);
    // A late shutdown after the watchdog does nothing more.
    fake.shutdown();
    expect(results).toEqual([null]);
  });

  it("keeps the watchdog quiet once BattleScene is up", () => {
    vi.useFakeTimers();
    const fake = fakeScene();
    beginStorySpar("rival-wren");
    const results: (string | null)[] = [];
    launchStorySpar(fake.scene, (r) => results.push(r), 1000);
    fake.create();
    vi.advanceTimersByTime(5000);
    expect(results).toEqual([]);
    expect(getActiveStorySpar()).not.toBeNull();
    fake.shutdown();
    expect(results).toEqual(["lost"]);
  });

  it("refuses to launch without an active story spar", () => {
    const fake = fakeScene();
    expect(launchStorySpar(fake.scene, () => undefined)).toBe(false);
    expect(fake.launches).toEqual([]);
  });
});

describe("Hearth Ward catch-up (#385 review)", () => {
  it("softens the next attempt after repeated real losses, and a win resets it", () => {
    restoreQuestProgress(progressAt("cinder-matriarch"));
    expect(getHearthWard("cinder-matriarch")).toBe(1);
    const lose = () => {
      beginStorySpar("cinder-matriarch");
      resolveStorySpar(false);
    };
    lose();
    expect(getHearthWard("cinder-matriarch")).toBe(1);
    lose();
    expect(getHearthWard("cinder-matriarch")).toBe(0.85);
    // A forfeit is not a loss.
    beginStorySpar("cinder-matriarch");
    forfeitStorySpar();
    expect(getHearthWard("cinder-matriarch")).toBe(0.85);
    lose();
    lose();
    expect(getHearthWard("cinder-matriarch")).toBe(0.75);
    beginStorySpar("cinder-matriarch");
    expect(getStoryBattleInit()).toMatchObject({ ward: 0.75 });
    resolveStorySpar(true);
    expect(getHearthWard("cinder-matriarch")).toBe(1);
  });

  it("persists streaks, dropping unknown ids and bad counts", () => {
    setStorySparLossStreaks({ "rival-wren": 3, ghost: 5, "cinder-matriarch": -1 });
    expect(getStorySparLossStreaks()).toEqual({ "rival-wren": 3 });
    expect(getHearthWard("rival-wren")).toBe(0.85);
    persistHostSave();
    resetStorySparForTest();
    restoreHostSave(loadHostSave()!);
    expect(getHearthWard("rival-wren")).toBe(0.85);
    setStorySparLossStreaks({});
  });
});

describe("persisted losses", () => {
  it("drops unknown ids instead of failing (#382)", () => {
    setStorySparLosses(["rival-wren", "old-rival", 42 as unknown as string]);
    expect(getStorySparLosses()).toEqual(["rival-wren"]);
  });
});

describe("no farming through side effects or reloads (#369 review)", () => {
  beforeEach(() => {
    localStorage.clear();
    drainBondTierUps();
  });

  it("rolls back bond, tier-ups, XP, Dust, items and spar-win counts on a rematch win", () => {
    restoreQuestProgress(progressAt("reach-mistwood"));
    const progressBefore = { ...questProgress };
    const bondBefore = playerParty.creatures.map((c) => c.bond ?? 0);
    beginStorySpar("rival-wren");
    // The battle's real reward path (XP, Dust, bond, spar wins).
    grantSparRewards("thunder-finch", 0, () => 0.99);
    expect(playerParty.creatures[0]!.bond ?? 0).toBeGreaterThan(bondBefore[0]!);
    expect(getSparWinsForSpecies("thunder-finch")).toBe(1);
    resolveStorySpar(true);
    expect(playerParty.creatures.map((c) => c.bond ?? 0)).toEqual(bondBefore);
    expect(playerParty.creatures.map((c) => c.xp)).toEqual([0, 0]);
    expect(getSparWinsForSpecies("thunder-finch")).toBe(0);
    expect(getMaterialCount("folklore-dust")).toBe(0);
    expect(getItemCount("brook-tonic")).toBe(0);
    expect(drainBondTierUps()).toEqual([]);
    expect({ ...questProgress }).toEqual(progressBefore);
  });

  it("rolls back the same on a first-beat loss", () => {
    beginStorySpar("rival-wren");
    grantSparRewards("lantern-fox", 0, () => 0.99);
    resolveStorySpar(false);
    expect(getSparWinsForSpecies("lantern-fox")).toBe(0);
    expect(playerParty.creatures.map((c) => c.xp)).toEqual([0, 0]);
    expect(getMaterialCount("folklore-dust")).toBe(0);
    expect(getActiveQuestId()).toBe("rival-wren");
  });

  it("keeps the pre-spar save when the tab closes mid-spar, then reloads", () => {
    restoreQuestProgress(progressAt("reach-mistwood"));
    persistHostSave();
    beginStorySpar("rival-wren");
    grantSparRewards("lantern-fox", 0, () => 0.99);
    // BattleScene notifies at the end; pagehide flushes — neither may write.
    flushPendingHostSave();
    persistHostSave();

    resetStorySparForTest(); // reload: module state is gone
    const saved = loadHostSave();
    expect(saved).not.toBeNull();
    expect(saved!.materials["folklore-dust"] ?? 0).toBe(0);
    expect(saved!.party.map((c) => c.xp)).toEqual([0, 0]);
    expect(saved!.sparWinsBySpecies?.["lantern-fox"] ?? 0).toBe(0);
    restoreHostSave(saved!);
    expect(getMaterialCount("folklore-dust")).toBe(0);
  });

  it("remembers a healed loss across reloads (one heal per beat)", () => {
    beginStorySpar("rival-wren");
    resolveStorySpar(false);
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(true);
    persistHostSave();

    resetStorySparForTest();
    restoreHostSave(loadHostSave()!);
    for (const creature of playerParty.creatures) creature.currentHp = 2;
    beginStorySpar("rival-wren");
    resolveStorySpar(false);
    expect(consumeStorySparOutcome("rival-wren")?.healed).toBe(false);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([2, 2]);
  });
});
