import { beforeEach, describe, expect, it } from "vitest";
import { getMaterialForCreature } from "../inventory/materials";
import {
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { GATHERABLE_PROPS } from "../world/gatherNodes";
import { setVisitorMode } from "../world/worldSession";
import {
  setDiscoveredZones,
  setFirstIslandLanded,
  setHorizonFusionCount,
  setCairnSovereignObtained,
  setTideSovereignObtained,
  setOverworldUnlocked,
  setVillageGateUnlocked,
  worldState,
} from "../world/worldState";
import { setClaimedMinigameWins } from "../minigames/progress";
import { setSideQuestStatuses } from "../world/npcState";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { ZONE_ENCOUNTERS } from "../encounters/tables";
import {
  SECOND_ACT_WANT_AMOUNT,
  SECOND_ACT_WANT_MATERIAL_ID,
  STORY_QUEST_COUNT,
  claimSecondActWantOnIslandLand,
  consumeQuestToast,
  createEmptyQuestProgress,
  getActiveQuestId,
  getStoryStatusLine,
  getQuestHint,
  getQuestNpcLine,
  getQuestSummary,
  initQuestProgress,
  isFullQuestProgress,
  isLegacyQuestProgress,
  isStoryBeatSuppressingWild,
  isSpine18QuestProgress,
  mapRetiredStepToBeat,
  normalizeQuestProgress,
  questProgress,
  recordQuestEvent,
  restoreQuestProgress,
  syncMainQuestFromGameplay,
  syncStoryAfterWorldRestore,
} from "./questProgress";
import { QUEST_ORDER, QUESTS } from "./quests";
import {
  SPINE18_QUEST_IDS,
  type QuestId,
  type QuestStatus,
  type Spine18QuestId,
} from "./questTypes";

function lockedProgress(): Record<QuestId, QuestStatus> {
  return createEmptyQuestProgress();
}

function allQuestsComplete(): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "complete" as const]),
  ) as Record<QuestId, QuestStatus>;
}

/** Progress with every beat before `activeId` complete and `activeId` active. */
function progressAt(activeId: QuestId): Record<QuestId, QuestStatus> {
  const progress = lockedProgress();
  const index = QUEST_ORDER.indexOf(activeId);
  QUEST_ORDER.forEach((id, i) => {
    progress[id] = i < index ? "complete" : i === index ? "active" : "locked";
  });
  return progress;
}

/** A save written by the #312 18-step build, stopped on `activeId`. */
function spine18At(activeId: Spine18QuestId | "done"): Record<string, QuestStatus> {
  const index =
    activeId === "done"
      ? SPINE18_QUEST_IDS.length
      : SPINE18_QUEST_IDS.indexOf(activeId);
  return Object.fromEntries(
    SPINE18_QUEST_IDS.map((id, i) => [
      id,
      i < index ? "complete" : i === index ? "active" : "locked",
    ]),
  );
}

function creature(id: string, definitionId: string, speciesId = definitionId): CreatureInstance {
  return {
    instanceId: id,
    definitionId,
    speciesId,
    currentHp: 10,
    level: 2,
    xp: 0,
  } as CreatureInstance;
}

function resetWorld(): void {
  setVisitorMode(false);
  setOverworldUnlocked(false);
  setVillageGateUnlocked(false, false);
  setDiscoveredZones([]);
  setPartyFromSnapshot([], 1);
  setInventoryFromSnapshot({}, {});
  setClaimedMinigameWins([]);
  setSideQuestStatuses({});
  setFirstIslandLanded(false, false);
  setTideSovereignObtained(0, false);
  setCairnSovereignObtained(0, false);
  setHorizonFusionCount(0, false);
}

describe("quest registry (#369)", () => {
  it("defines an 8-beat linear main arc", () => {
    expect(STORY_QUEST_COUNT).toBe(8);
    expect(QUEST_ORDER).toEqual([
      "first-befriend",
      "first-spar",
      "shrine-craft",
      "first-evolution",
      "rival-wren",
      "reach-mistwood",
      "cinder-matriarch",
      "shrine-finale",
    ]);
  });

  it("gives every beat a HUD objective, a hint, and a payoff", () => {
    for (const id of QUEST_ORDER) {
      const quest = QUESTS[id];
      expect(quest.title.length, id).toBeGreaterThan(0);
      expect(quest.hint.length, id).toBeGreaterThan(0);
      expect(quest.payoff.length, id).toBeGreaterThan(0);
    }
  });

  it("keeps optional satellites out of the main arc", () => {
    const objectives = QUEST_ORDER.map((id) => QUESTS[id].objective.type);
    expect(objectives).not.toContain("complete_minigame");
    expect(objectives).not.toContain("party_size");
    expect(objectives).not.toContain("deliver_materials");
    expect(objectives).not.toContain("craft_item_id");
  });
});

describe("cold-start arc", () => {
  beforeEach(() => {
    resetWorld();
    restoreQuestProgress(lockedProgress());
    initQuestProgress();
    consumeQuestToast();
  });

  it("plays all eight beats with gates, HUD lines, and payoffs", () => {
    expect(getQuestSummary()).toBe("Story 1/8: Befriend your first companion");
    expect(getQuestHint()).toMatch(/^Next: /);

    expect(
      recordQuestEvent({ type: "befriend_creature", creatureId: "mossling" }),
    ).toBe(true);
    expect(consumeQuestToast()).toBe(
      "Quest complete: Befriend your first companion — Mossling joins — shy, stubborn, and loyal to the moss",
    );

    expect(getQuestSummary()).toMatch(/^Story 2\/8:/);
    expect(worldState.overworldUnlocked).toBe(false);
    expect(recordQuestEvent({ type: "win_spar" })).toBe(true);
    expect(worldState.overworldUnlocked).toBe(true);
    expect(consumeQuestToast()).toBe(
      "Quest complete: Win a training spar — Overworld gate opened!",
    );

    expect(getQuestSummary()).toMatch(/^Story 3\/8: Craft a relic/);
    expect(getQuestNpcLine()).toMatch(/^Weaver Sable:/);
    expect(worldState.villageGateUnlocked).toBe(false);
    expect(recordQuestEvent({ type: "craft_item" })).toBe(true);

    expect(getQuestSummary()).toMatch(/^Story 4\/8: Grow your first companion/);
    expect(worldState.villageGateUnlocked).toBe(true);
    expect(
      recordQuestEvent({ type: "evolve_creature", evolvesTo: "bramblewarden" }),
    ).toBe(true);

    expect(getQuestSummary()).toMatch(/^Story 5\/8: Beat Wren/);
    expect(getQuestNpcLine()).toMatch(/^Wren:/);
    expect(worldState.mistwoodPathOpen).toBe(false);
    expect(
      recordQuestEvent({ type: "win_story_spar", sparId: "cinder-matriarch" }),
    ).toBe(false);
    expect(
      recordQuestEvent({ type: "win_story_spar", sparId: "rival-wren" }),
    ).toBe(true);
    expect(worldState.mistwoodPathOpen).toBe(true);
    expect(consumeQuestToast()).toMatch(/Mistwood path opens/);

    expect(getQuestSummary()).toMatch(/^Story 6\/8: Walk the Mistwood path/);
    expect(recordQuestEvent({ type: "enter_zone", zoneId: "overworld" })).toBe(
      false,
    );
    expect(recordQuestEvent({ type: "enter_zone", zoneId: "mistwood" })).toBe(
      true,
    );

    expect(getQuestSummary()).toMatch(/^Story 7\/8: Face the Cinder Matriarch/);
    expect(
      recordQuestEvent({ type: "win_story_spar", sparId: "cinder-matriarch" }),
    ).toBe(true);

    expect(getQuestSummary()).toMatch(/^Story 8\/8: Return to the Moon Shrine/);
    expect(recordQuestEvent({ type: "story_finale" })).toBe(true);
    expect(consumeQuestToast()).toMatch(/main story is complete/);

    expect(getActiveQuestId()).toBeNull();
    expect(getQuestSummary()).toBe("Story: complete");
    // Finale hook: the optional Sovereign voyage, never a Story 9.
    expect(getQuestHint()).toMatch(/^Optional — Sovereign voyage: craft a Boat/);
  });

  it("completes the first-evolution beat with either Grove evolution", () => {
    restoreQuestProgress(progressAt("first-evolution"));
    expect(
      recordQuestEvent({ type: "evolve_creature", evolvesTo: "hearthflame" }),
    ).toBe(true);
    expect(getActiveQuestId()).toBe("rival-wren");
  });

  it("ignores mismatched objectives", () => {
    expect(recordQuestEvent({ type: "win_spar" })).toBe(false);
    expect(questProgress["first-befriend"]).toBe("active");
  });

  it("blocks progression while visiting", () => {
    setVisitorMode(true);
    expect(recordQuestEvent({ type: "befriend_creature" })).toBe(false);
    expect(questProgress["first-befriend"]).toBe("active");
  });

  it("uses a generic temperament for companions without one", () => {
    recordQuestEvent({ type: "befriend_creature", creatureId: "rootwalker" });
    expect(consumeQuestToast()).toMatch(/Rootwalker joins — quiet, watchful/);
  });
});

describe("optional side threads never move the main arc", () => {
  beforeEach(() => {
    resetWorld();
  });

  it("ignores village asks, minigame wins, and a big party", () => {
    restoreQuestProgress(progressAt("rival-wren"));
    setClaimedMinigameWins(["hearth-lots", "ward-crossing", "loom-pattern"]);
    setSideQuestStatuses({
      "bryn-ledger": "complete",
      "sable-thread": "complete",
      "odd-company": "complete",
    });
    setPartyFromSnapshot(
      [creature("a", "mossling"), creature("b", "ember-wisp"), creature("c", "brook-nymph")],
      4,
    );
    syncMainQuestFromGameplay();
    expect(getActiveQuestId()).toBe("rival-wren");
  });

  it("opens the cottage gate at the first-evolution beat, not before", () => {
    restoreQuestProgress(progressAt("shrine-craft"));
    expect(worldState.villageGateUnlocked).toBe(false);
    restoreQuestProgress(progressAt("first-evolution"));
    expect(worldState.villageGateUnlocked).toBe(true);
  });

  it("writes the status line as player-facing story progress", () => {
    restoreQuestProgress(progressAt("shrine-craft"));
    expect(getStoryStatusLine()).toBe(
      "Story 3/8 — next: Craft a relic at Moon Shrine",
    );
    restoreQuestProgress(progressAt("rival-wren"));
    expect(getStoryStatusLine()).toMatch(/^Story 5\/8 — next: /);
    // No debug-style gate dump.
    expect(getStoryStatusLine()).not.toMatch(/LOCKED|OPEN|Overworld:/);
  });
});

describe("save migration from the 18-step and 4-step arcs (#369)", () => {
  beforeEach(() => {
    resetWorld();
  });

  it("recognises both retired save shapes", () => {
    expect(isSpine18QuestProgress(spine18At("odd-company"))).toBe(true);
    expect(isSpine18QuestProgress(progressAt("rival-wren"))).toBe(false);
    expect(
      isLegacyQuestProgress({
        "first-befriend": "complete",
        "first-spar": "complete",
        "reach-village": "complete",
        "shrine-craft": "active",
      }),
    ).toBe(true);
  });

  const fixtures: [Spine18QuestId | "done", QuestId | null][] = [
    ["first-befriend", "first-befriend"],
    ["first-spar", "first-spar"],
    ["reach-village", "shrine-craft"],
    ["shrine-craft", "shrine-craft"],
    ["evolve-bramblewarden", "first-evolution"],
    ["evolve-hearthflame", "rival-wren"],
    ["open-village-gate", "rival-wren"],
    ["odd-company", "rival-wren"],
    ["bryn-ledger", "rival-wren"],
    ["loom-pattern", "rival-wren"],
    ["craft-boat", "rival-wren"],
    ["obtain-tide-sovereign", "rival-wren"],
    ["obtain-cairn-sovereign", "rival-wren"],
    ["fuse-horizon", "rival-wren"],
    ["done", null],
  ];

  for (const [oldStep, expected] of fixtures) {
    it(`maps an old save on ${oldStep} to ${expected ?? "complete"}`, () => {
      const normalized = normalizeQuestProgress(spine18At(oldStep));
      expect(isFullQuestProgress(normalized)).toBe(true);
      expect(Object.keys(normalized).sort()).toEqual([...QUEST_ORDER].sort());
      const active = QUEST_ORDER.filter((id) => normalized[id] === "active");
      if (expected === null) {
        expect(active).toEqual([]);
        expect(QUEST_ORDER.every((id) => normalized[id] === "complete")).toBe(true);
        return;
      }
      expect(active).toEqual([expected]);
      const index = QUEST_ORDER.indexOf(expected);
      QUEST_ORDER.forEach((id, i) => {
        expect(normalized[id], id).toBe(
          i < index ? "complete" : i === index ? "active" : "locked",
        );
      });
    });
  }

  it("never maps a later old step to an earlier beat (no regression)", () => {
    let previous = -1;
    for (let i = 0; i < SPINE18_QUEST_IDS.length; i += 1) {
      const beat = mapRetiredStepToBeat(i);
      expect(beat).toBeGreaterThanOrEqual(previous);
      previous = beat;
    }
  });

  it("maps legacy 4-step saves onto the new beats", () => {
    expect(
      normalizeQuestProgress({
        "first-befriend": "complete",
        "first-spar": "complete",
        "reach-village": "active",
        "shrine-craft": "locked",
      })["shrine-craft"],
    ).toBe("active");
    const finished = normalizeQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
    });
    expect(finished["shrine-craft"]).toBe("complete");
    expect(finished["first-evolution"]).toBe("active");
  });

  it("locks unknown ids when restoring partial current progress", () => {
    const normalized = normalizeQuestProgress({ "first-befriend": "complete" });
    expect(normalized["first-spar"]).toBe("locked");
    expect(normalized["shrine-finale"]).toBe("locked");
  });

  it("does not catch up from a stale party during restore (only after world restore)", () => {
    setPartyFromSnapshot([creature("a", "bramblewarden", "mossling")], 2);
    restoreQuestProgress(spine18At("evolve-bramblewarden"));
    expect(getActiveQuestId()).toBe("first-evolution");
  });

  it("catches an old evolve save with an evolved companion up to the rival", () => {
    restoreQuestProgress(spine18At("evolve-bramblewarden"));
    expect(getActiveQuestId()).toBe("first-evolution");
    setPartyFromSnapshot([creature("a", "bramblewarden", "mossling")], 2);
    syncStoryAfterWorldRestore();
    expect(getActiveQuestId()).toBe("rival-wren");
  });

  it("keeps the Mistwood path open for saves that already walked it", () => {
    restoreQuestProgress(spine18At("craft-boat"));
    expect(getActiveQuestId()).toBe("rival-wren");
    setDiscoveredZones(["grove", "overworld", "mistwood", "emberfen"]);
    syncStoryAfterWorldRestore();
    expect(worldState.mistwoodPathOpen).toBe(true);
    // Rival is still the beat; the walked region auto-completes after it.
    expect(getActiveQuestId()).toBe("rival-wren");
    recordQuestEvent({ type: "win_story_spar", sparId: "rival-wren" });
    expect(getActiveQuestId()).toBe("cinder-matriarch");
  });

  it("locks the Mistwood path for an old save that never went there", () => {
    restoreQuestProgress(spine18At("odd-company"));
    setDiscoveredZones(["grove", "shrine", "village", "overworld"]);
    syncStoryAfterWorldRestore();
    expect(worldState.mistwoodPathOpen).toBe(false);
  });

  it("keeps a finished old save finished", () => {
    restoreQuestProgress(spine18At("done"));
    expect(getQuestSummary()).toBe("Story: complete");
    expect(worldState.mistwoodPathOpen).toBe(true);
    expect(worldState.villageGateUnlocked).toBe(true);
  });
});

describe("post-story HUD (finale hook)", () => {
  beforeEach(() => {
    resetWorld();
    setOverworldUnlocked(true);
    restoreQuestProgress(allQuestsComplete());
  });

  it("walks the optional voyage hint from boat to Horizon", () => {
    expect(getQuestHint()).toMatch(/Sovereign voyage: craft a Boat/);
    setInventoryFromSnapshot({}, { boat: 1 });
    expect(getQuestHint()).toMatch(/Tide Sovereign/);
    setTideSovereignObtained(1, false);
    expect(getQuestHint()).toMatch(/due south .* Stone Sovereign/);
    setCairnSovereignObtained(1, false);
    expect(getQuestHint()).toMatch(/craft a Sovereign Seal/);
    setInventoryFromSnapshot({}, { "sovereign-seal": 1 });
    expect(getQuestHint()).toMatch(/fuse Tide and Stone into Horizon/);
    setHorizonFusionCount(1, false);
    expect(getQuestHint().startsWith("All story beats finished")).toBe(true);
    expect(getQuestSummary()).toBe("Story: complete");
  });

  it("grants Folklore Dust on first island land", () => {
    setDiscoveredZones(["harbor", "archipelago"]);
    expect(getMaterialCount(SECOND_ACT_WANT_MATERIAL_ID)).toBe(0);
    expect(claimSecondActWantOnIslandLand()).toBe(true);
    expect(getMaterialCount(SECOND_ACT_WANT_MATERIAL_ID)).toBe(
      SECOND_ACT_WANT_AMOUNT,
    );
    expect(consumeQuestToast()).toBe(
      `Island bounty: Folklore Dust×${SECOND_ACT_WANT_AMOUNT}`,
    );
    expect(worldState.firstIslandLanded).toBe(true);
  });

  it("does not re-grant after an already-landed save", () => {
    setFirstIslandLanded(true, false);
    setInventoryFromSnapshot({ [SECOND_ACT_WANT_MATERIAL_ID]: 2 }, {});
    expect(claimSecondActWantOnIslandLand()).toBe(false);
    expect(getMaterialCount(SECOND_ACT_WANT_MATERIAL_ID)).toBe(2);
    expect(consumeQuestToast()).toBeNull();
  });

  it("does not grant Dust to visitors on island land", () => {
    setVisitorMode(true);
    expect(claimSecondActWantOnIslandLand()).toBe(false);
    expect(getMaterialCount(SECOND_ACT_WANT_MATERIAL_ID)).toBe(0);
    expect(worldState.firstIslandLanded).toBe(true);
    expect(consumeQuestToast()).toBeNull();
  });
});

describe("second-act Want exclusivity (AC3)", () => {
  it("keeps Folklore Dust out of starter-zone creature drops and gather nodes", () => {
    const starterZones = ["grove", "shrine", "village"] as const;
    for (const zoneId of starterZones) {
      for (const entry of ZONE_ENCOUNTERS[zoneId]) {
        expect(getMaterialForCreature(entry.id)).not.toBe(
          SECOND_ACT_WANT_MATERIAL_ID,
        );
      }
    }
    for (const action of Object.values(GATHERABLE_PROPS)) {
      expect(action?.materialId).not.toBe(SECOND_ACT_WANT_MATERIAL_ID);
    }
  });
});

describe("story beats keep wild encounters away (#418)", () => {
  beforeEach(() => resetWorld());

  it("finale pending: the shrine is quiet, every other zone keeps its encounters", () => {
    restoreQuestProgress(progressAt("shrine-finale"));
    expect(isStoryBeatSuppressingWild("shrine")).toBe(true);
    for (const zone of ["overworld", "emberfen", "mistwood", "grove", "archipelago"] as const) {
      expect(isStoryBeatSuppressingWild(zone)).toBe(false);
    }
    // Cleared once the finale is done.
    restoreQuestProgress(allQuestsComplete());
    expect(isStoryBeatSuppressingWild("shrine")).toBe(false);
  });

  it("the Moon Shrine is quiet during its altar beats only", () => {
    restoreQuestProgress(progressAt("shrine-craft"));
    expect(isStoryBeatSuppressingWild("shrine")).toBe(true);
    expect(isStoryBeatSuppressingWild("overworld")).toBe(false);
    restoreQuestProgress(progressAt("rival-wren"));
    expect(isStoryBeatSuppressingWild("shrine")).toBe(false);
    restoreQuestProgress(allQuestsComplete());
    expect(isStoryBeatSuppressingWild("shrine")).toBe(false);
  });
});
