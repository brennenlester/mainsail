import { beforeEach, describe, expect, it } from "vitest";
import { CREATURES } from "../creatures/catalog";
import {
  getActiveCreatures,
  getEffectiveMaxHp,
  playerParty,
  setPartyFromSnapshot,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import {
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import {
  createEmptyQuestProgress,
  restoreQuestProgress,
} from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import {
  beginStorySpar,
  resetStorySparForTest,
  resolveStorySparRound,
} from "../battle/storySpar";
import {
  grantSparRewards,
  healAfterSparWin,
  SPAR_WIN_HEAL_FRACTION,
} from "../battle/sparRewards";
import { sparStats } from "../battle/sparSim";
import { setVisitorMode } from "./worldSession";
import {
  isPartyStranded,
  SHRINE_HEAL_LINE,
  SHRINE_WAKE_SPOT,
  topUpStoryRelicMaterials,
  visitShrineAltar,
  wakeStrandedParty,
} from "./shrineHeal";
import { ZONES } from "./zones";
import { canOccupy } from "./collision";
import { isNearShrine } from "./interactProximity";

function progressAt(activeId: QuestId): Record<QuestId, QuestStatus> {
  const progress = createEmptyQuestProgress();
  const index = QUEST_ORDER.indexOf(activeId);
  QUEST_ORDER.forEach((id, i) => {
    progress[id] = i < index ? "complete" : i === index ? "active" : "locked";
  });
  return progress;
}

function member(id: string, currentHp: number, definitionId = "mossling"): CreatureInstance {
  return {
    instanceId: id,
    definitionId,
    speciesId: definitionId,
    currentHp,
    level: 3,
    xp: 0,
  } as CreatureInstance;
}

function maxHpOf(index: number): number {
  return getEffectiveMaxHp(playerParty.creatures[index]!);
}

beforeEach(() => {
  setVisitorMode(false);
  resetStorySparForTest();
  setInventoryFromSnapshot({}, {});
  setPartyFromSnapshot([member("a", 1), member("b", 0)], 3);
  restoreQuestProgress(progressAt("rival-wren"));
});

describe("Moon Shrine altar heal (#390)", () => {
  it("fully heals the whole party for free, fainted included", () => {
    const notice = visitShrineAltar();
    expect(notice).toBe(SHRINE_HEAL_LINE);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([
      maxHpOf(0),
      maxHpOf(1),
    ]);
    expect(getMaterialCount("folklore-dust")).toBe(0);
  });

  it("says nothing when everyone is already whole", () => {
    visitShrineAltar();
    expect(visitShrineAltar()).toBeNull();
  });

  it("does not heal a visitor's view of the host world", () => {
    setVisitorMode(true);
    expect(visitShrineAltar()).toBeNull();
    expect(playerParty.creatures[1]!.currentHp).toBe(0);
  });

  it("wakes the party on a walkable tile next to the altar", () => {
    const shrine = ZONES[SHRINE_WAKE_SPOT.zoneId];
    expect(canOccupy(shrine, SHRINE_WAKE_SPOT.x, SHRINE_WAKE_SPOT.y)).toBe(true);
    expect(isNearShrine(shrine, SHRINE_WAKE_SPOT.x, SHRINE_WAKE_SPOT.y)).toBe(true);
  });
});

describe("Story 4 relic materials (#390)", () => {
  it("tops up one relic's worth during the craft and evolve beats", () => {
    for (const beat of ["shrine-craft", "first-evolution"] as const) {
      restoreQuestProgress(progressAt(beat));
      setInventoryFromSnapshot({ "moss-fiber": 1 }, {});
      expect(topUpStoryRelicMaterials()).toMatch(/Moss Fiber ×1, Ember Ash ×2, Folklore Dust ×1/);
      expect(getMaterialCount("moss-fiber")).toBe(2);
      expect(getMaterialCount("ember-ash")).toBe(2);
      expect(getMaterialCount("folklore-dust")).toBe(1);
      // Already enough for a relic: nothing more.
      expect(topUpStoryRelicMaterials()).toBeNull();
    }
  });

  it("stops once a relic is held, and outside those beats", () => {
    restoreQuestProgress(progressAt("first-evolution"));
    setInventoryFromSnapshot({}, { "moss-salve": 1 });
    expect(topUpStoryRelicMaterials()).toBeNull();
    setInventoryFromSnapshot({}, {});
    restoreQuestProgress(progressAt("first-spar"));
    expect(topUpStoryRelicMaterials()).toBeNull();
    restoreQuestProgress(progressAt("rival-wren"));
    expect(topUpStoryRelicMaterials()).toBeNull();
  });

  it("comes with the altar visit and names what to craft", () => {
    restoreQuestProgress(progressAt("shrine-craft"));
    const notice = visitShrineAltar();
    expect(notice).toContain(SHRINE_HEAL_LINE);
    expect(notice).toContain("Craft Moss Salve or Ember Charm");
  });
});

describe("stranded party recovery (#390)", () => {
  it("wakes a fully fainted party at the shrine, healed, with nothing taken", () => {
    setPartyFromSnapshot([member("a", 0), member("b", 0)], 3);
    setInventoryFromSnapshot({ "folklore-dust": 5 }, { "brook-tonic": 1 });
    expect(isPartyStranded()).toBe(true);
    const wake = wakeStrandedParty(false);
    expect(wake?.spot).toEqual(SHRINE_WAKE_SPOT);
    expect(playerParty.creatures.every((c) => c.currentHp === getEffectiveMaxHp(c))).toBe(true);
    expect(getMaterialCount("folklore-dust")).toBe(5);
    expect(isPartyStranded()).toBe(false);
  });

  it("wakes in place while sailing", () => {
    setPartyFromSnapshot([member("a", 0)], 2);
    expect(wakeStrandedParty(true)?.spot).toBeNull();
    expect(playerParty.creatures[0]!.currentHp).toBe(maxHpOf(0));
  });

  it("does nothing while anyone active still stands, or with no party", () => {
    expect(wakeStrandedParty(false)).toBeNull();
    setPartyFromSnapshot([], 1);
    expect(wakeStrandedParty(false)).toBeNull();
  });

  it("never wakes mid story spar (its own loss rules own HP)", () => {
    beginStorySpar("rival-wren");
    for (const c of playerParty.creatures) c.currentHp = 0;
    expect(wakeStrandedParty(false)).toBeNull();
    resolveStorySparRound(false);
    // First real loss heals via storySpar itself, not the wake.
    expect(isPartyStranded()).toBe(false);
  });
});

describe("spar-win breather (#390)", () => {
  it("restores a fraction of max HP to standing actives only, capped at max", () => {
    setPartyFromSnapshot([member("a", 1), member("b", 0)], 3);
    const restored = healAfterSparWin();
    const step = Math.round(maxHpOf(0) * SPAR_WIN_HEAL_FRACTION);
    expect(restored).toBe(step);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([1 + step, 0]);
    playerParty.creatures[0]!.currentHp = maxHpOf(0);
    expect(healAfterSparWin()).toBe(0);
  });

  it("is part of a wild spar win's rewards", () => {
    setPartyFromSnapshot([member("a", 1)], 2);
    const reward = grantSparRewards("ember-wisp", 0, () => 0.99);
    expect(reward.hpRestored).toBeGreaterThan(0);
    expect(getActiveCreatures()[0]!.currentHp).toBe(1 + reward.hpRestored);
  });

  it("never heals inside a story spar: rounds, first win, or rematch", () => {
    beginStorySpar("rival-wren");
    for (const c of playerParty.creatures) c.currentHp = 2;
    const round = grantSparRewards("ember-wisp", 0, () => 0.99);
    expect(round.hpRestored).toBe(0);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([2, 2]);
    resolveStorySparRound(true);
    grantSparRewards("ember-wisp", 0, () => 0.99);
    resolveStorySparRound(true);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([2, 2]);

    // Rematch win: still exactly the HP you fought with.
    beginStorySpar("rival-wren");
    grantSparRewards("ember-wisp", 0, () => 0.99);
    resolveStorySparRound(true);
    grantSparRewards("ember-wisp", 0, () => 0.99);
    resolveStorySparRound(true);
    expect(playerParty.creatures.map((c) => c.currentHp)).toEqual([2, 2]);
  });

  it("gives back well under half of what an average win costs (sparSim)", () => {
    const ids = CREATURES.filter((c) => !c.excludeFromCodex)
      .map((c) => c.id)
      .slice(0, 8);
    let lost = 0;
    let n = 0;
    for (const p of ids) {
      for (const w of ids) {
        const stats = sparStats({ party: [p], wild: w, policy: "skilled" }, 10);
        if (stats.winRate > 0) {
          lost += 1 - stats.avgHpLeftOnWin;
          n += 1;
        }
      }
    }
    const avgLost = lost / n;
    expect(avgLost).toBeGreaterThan(0.4);
    expect(SPAR_WIN_HEAL_FRACTION).toBeLessThan(avgLost / 2);
  }, 30_000);
});
