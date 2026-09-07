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
  setOverworldUnlocked,
  worldState,
} from "../world/worldState";
import { setClaimedMinigameWins } from "../minigames/progress";
import { setSideQuestStatuses } from "../world/npcState";
import { setPartyFromSnapshot } from "../creatures/party";
import { ZONE_ENCOUNTERS } from "../encounters/tables";
import {
  SECOND_ACT_WANT_AMOUNT,
  SECOND_ACT_WANT_MATERIAL_ID,
  STORY_QUEST_COUNT,
  claimSecondActWantOnIslandLand,
  consumeQuestToast,
  createEmptyQuestProgress,
  getActiveQuestId,
  getQuestHint,
  getQuestNpcLine,
  getQuestSummary,
  initQuestProgress,
  isFullQuestProgress,
  isLegacyQuestProgress,
  normalizeQuestProgress,
  questProgress,
  recordCraftOutputQuestEvents,
  recordQuestEvent,
  restoreQuestProgress,
  syncMainQuestFromGameplay,
} from "./questProgress";
import { QUEST_ORDER, QUESTS } from "./quests";
import type { QuestId, QuestStatus } from "./questTypes";

function lockedProgress(): Record<QuestId, QuestStatus> {
  return createEmptyQuestProgress();
}

function allQuestsComplete(): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "complete" as const]),
  ) as Record<QuestId, QuestStatus>;
}

describe("quest registry", () => {
  it("defines 18 linear main-quest steps (#312)", () => {
    expect(STORY_QUEST_COUNT).toBe(18);
    expect(QUEST_ORDER).toHaveLength(18);
    expect(QUEST_ORDER[0]).toBe("first-befriend");
    expect(QUEST_ORDER[3]).toBe("shrine-craft");
    expect(QUEST_ORDER[17]).toBe("fuse-horizon");
  });

  it("keeps Act 1 NPC flavor on steps 3–4 and Act 2 speaker lines on steps 5–14", () => {
    expect(QUESTS["first-befriend"].npcLine).toBeUndefined();
    expect(QUESTS["first-spar"].npcLine).toBeUndefined();
    expect(QUESTS["reach-village"].npcLine?.speaker).toBe("Hearthkeep Odd");
    expect(QUESTS["shrine-craft"].npcLine?.speaker).toBe("Weaver Sable");
    expect(QUESTS["evolve-bramblewarden"].npcLine?.speaker).toBe("Warden Bryn");
    expect(QUESTS["evolve-hearthflame"].npcLine?.speaker).toBe("Warden Bryn");
    expect(QUESTS["open-village-gate"].npcLine?.speaker).toBe("Hearthkeep Odd");
    expect(QUESTS["odd-company"].npcLine?.speaker).toBe("Hearthkeep Odd");
    expect(QUESTS["hearth-lots"].npcLine?.speaker).toBe("Hearthkeep Odd");
    expect(QUESTS["bryn-ledger"].npcLine?.speaker).toBe("Warden Bryn");
    expect(QUESTS["ward-crossing"].npcLine?.speaker).toBe("Warden Bryn");
    expect(QUESTS["sable-thread"].npcLine?.speaker).toBe("Weaver Sable");
    expect(QUESTS["loom-pattern"].npcLine?.speaker).toBe("Weaver Sable");
    expect(QUESTS["craft-boat"].npcLine?.speaker).toBe("Hearthkeep Odd");
    expect(QUESTS["obtain-tide-sovereign"].npcLine).toBeUndefined();
  });
});

describe("normalizeQuestProgress", () => {
  it("migrates legacy 4-step saves into the 18-step registry", () => {
    const legacy = {
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "active",
    } as const;
    expect(isLegacyQuestProgress(legacy)).toBe(true);
    const normalized = normalizeQuestProgress(legacy);
    expect(normalized["shrine-craft"]).toBe("active");
    expect(normalized["evolve-bramblewarden"]).toBe("locked");
    expect(isFullQuestProgress(normalized)).toBe(true);
  });

  it("locks unknown ids when restoring partial progress", () => {
    const normalized = normalizeQuestProgress({
      "first-befriend": "complete",
    });
    expect(normalized["first-spar"]).toBe("locked");
    expect(normalized["fuse-horizon"]).toBe("locked");
  });
});

describe("recordQuestEvent", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setOverworldUnlocked(false);
    restoreQuestProgress(lockedProgress());
    initQuestProgress();
  });

  it("advances first-befriend then activates first-spar", () => {
    expect(getActiveQuestId()).toBe("first-befriend");
    expect(recordQuestEvent({ type: "befriend_creature" })).toBe(true);
    expect(questProgress["first-befriend"]).toBe("complete");
    expect(questProgress["first-spar"]).toBe("active");
    expect(getActiveQuestId()).toBe("first-spar");
  });

  it("unlocks overworld when first-spar completes", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "active",
    });
    expect(recordQuestEvent({ type: "win_spar" })).toBe(true);
    expect(questProgress["first-spar"]).toBe("complete");
    expect(worldState.overworldUnlocked).toBe(true);
    expect(getActiveQuestId()).toBe("reach-village");
  });

  it("completes reach-village on entering the village zone", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "active",
    });
    expect(recordQuestEvent({ type: "enter_zone", zoneId: "grove" })).toBe(
      false,
    );
    expect(recordQuestEvent({ type: "enter_zone", zoneId: "village" })).toBe(
      true,
    );
    expect(questProgress["reach-village"]).toBe("complete");
    expect(getActiveQuestId()).toBe("shrine-craft");
  });

  it("plays Act 1 as Story 1–4 of 18 then activates step 5", () => {
    expect(getQuestSummary()).toMatch(/^Story 1\/18:/);
    expect(getQuestNpcLine()).toBeNull();

    expect(recordQuestEvent({ type: "befriend_creature" })).toBe(true);
    expect(getQuestSummary()).toMatch(/^Story 2\/18:/);
    expect(getQuestNpcLine()).toBeNull();

    expect(recordQuestEvent({ type: "win_spar" })).toBe(true);
    expect(worldState.overworldUnlocked).toBe(true);
    expect(getQuestSummary()).toMatch(/^Story 3\/18:/);
    expect(getQuestSummary()).toContain("Reach Hearth Crossing");
    expect(getQuestNpcLine()).toMatch(/^Hearthkeep Odd:/);

    expect(recordQuestEvent({ type: "enter_zone", zoneId: "village" })).toBe(
      true,
    );
    expect(getQuestSummary()).toMatch(/^Story 4\/18:/);
    expect(getQuestSummary()).toContain("Craft a relic at Moon Shrine");
    expect(getQuestNpcLine()).toMatch(/^Weaver Sable:/);

    expect(recordQuestEvent({ type: "craft_item" })).toBe(true);
    expect(getActiveQuestId()).toBe("evolve-bramblewarden");
    expect(getQuestSummary()).toMatch(/^Story 5\/18:/);
    expect(getQuestNpcLine()).toMatch(/^Warden Bryn:/);
  });

  it("activates evolve-bramblewarden after shrine-craft", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "active",
    });
    expect(recordQuestEvent({ type: "craft_item" })).toBe(true);
    expect(getActiveQuestId()).toBe("evolve-bramblewarden");
  });

  it("matches evolve_creature objectives by evolvesTo", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "active",
    });
    expect(
      recordQuestEvent({
        type: "evolve_creature",
        evolvesTo: "hearthflame",
      }),
    ).toBe(false);
    expect(
      recordQuestEvent({
        type: "evolve_creature",
        evolvesTo: "bramblewarden",
      }),
    ).toBe(true);
    expect(getActiveQuestId()).toBe("evolve-hearthflame");
  });

  it("unlocks the cottage gate when Act 2 evolutions become active (#349)", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "active",
    });
    expect(worldState.villageGateUnlocked).toBe(true);
  });

  it("leaves open-village-gate active until a cottage is entered (#317)", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "complete",
      "evolve-hearthflame": "active",
    });
    expect(worldState.villageGateUnlocked).toBe(true);

    expect(
      recordQuestEvent({
        type: "evolve_creature",
        evolvesTo: "hearthflame",
      }),
    ).toBe(true);

    expect(worldState.villageGateUnlocked).toBe(true);
    expect(questProgress["open-village-gate"]).toBe("active");
    expect(getActiveQuestId()).toBe("open-village-gate");
    expect(getQuestHint()).toMatch(/step inside a house/i);

    expect(recordQuestEvent({ type: "unlock_village_gate" })).toBe(true);
    expect(questProgress["open-village-gate"]).toBe("complete");
    expect(getActiveQuestId()).toBe("odd-company");
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
});

describe("Act 2 main quest bridge (#317)", () => {
  beforeEach(() => {
    setVisitorMode(false);
    restoreQuestProgress(createEmptyQuestProgress());
  });

  it("does not advance odd-company from party size alone", () => {
    restoreQuestProgress({
      ...createEmptyQuestProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "complete",
      "evolve-hearthflame": "complete",
      "open-village-gate": "complete",
      "odd-company": "active",
    });
    setPartyFromSnapshot(
      [
        { instanceId: "a", definitionId: "mossling", speciesId: "mossling", currentHp: 10, level: 1, xp: 0 },
        { instanceId: "b", definitionId: "ember-wisp", speciesId: "ember-wisp", currentHp: 10, level: 1, xp: 0 },
        { instanceId: "c", definitionId: "brook-nymph", speciesId: "brook-nymph", currentHp: 10, level: 1, xp: 0 },
      ],
      3,
    );

    syncMainQuestFromGameplay();

    expect(questProgress["odd-company"]).toBe("active");
    expect(getActiveQuestId()).toBe("odd-company");
  });

  it("advances odd-company after Odd's village ask is turned in", () => {
    restoreQuestProgress({
      ...createEmptyQuestProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "complete",
      "evolve-hearthflame": "complete",
      "open-village-gate": "complete",
      "odd-company": "active",
    });
    setSideQuestStatuses({ "odd-company": "complete" });

    syncMainQuestFromGameplay();

    expect(questProgress["odd-company"]).toBe("complete");
    expect(getActiveQuestId()).toBe("hearth-lots");
  });

  it("catches up minigame wins on restore", () => {
    restoreQuestProgress({
      ...createEmptyQuestProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "complete",
      "evolve-hearthflame": "complete",
      "open-village-gate": "complete",
      "odd-company": "complete",
      "hearth-lots": "active",
    });
    setClaimedMinigameWins(["hearth-lots"]);

    syncMainQuestFromGameplay();

    expect(questProgress["hearth-lots"]).toBe("complete");
    expect(getActiveQuestId()).toBe("bryn-ledger");
  });
});

describe("Act 3 quest events", () => {
  beforeEach(() => {
    setVisitorMode(false);
    restoreQuestProgress(createEmptyQuestProgress());
  });

  function activate(questId: QuestId): void {
    restoreQuestProgress({
      ...createEmptyQuestProgress(),
      [questId]: "active",
    });
  }

  it("advances craft-boat on boat craft output", () => {
    activate("craft-boat");
    recordCraftOutputQuestEvents("boat");
    expect(questProgress["craft-boat"]).toBe("complete");
    expect(getActiveQuestId()).toBe("obtain-tide-sovereign");
  });

  it("advances obtain-tide-sovereign on sovereign obtain event", () => {
    activate("obtain-tide-sovereign");
    expect(
      recordQuestEvent({
        type: "obtain_creature",
        creatureId: "tide-sovereign",
      }),
    ).toBe(true);
    expect(getActiveQuestId()).toBe("obtain-cairn-sovereign");
  });

  it("advances craft-sovereign-seal and fuse-horizon", () => {
    const progress = createEmptyQuestProgress();
    for (const id of QUEST_ORDER) {
      progress[id] =
        id === "craft-sovereign-seal"
          ? "active"
          : id === "fuse-horizon"
            ? "locked"
            : "complete";
    }
    restoreQuestProgress(progress);
    recordCraftOutputQuestEvents("sovereign-seal");
    expect(getActiveQuestId()).toBe("fuse-horizon");
    expect(recordQuestEvent({ type: "fuse_horizon" })).toBe(true);
    expect(questProgress["fuse-horizon"]).toBe("complete");
  });
});

describe("post-story HUD Next", () => {
  beforeEach(() => {
    setVisitorMode(false);
    setOverworldUnlocked(true);
    setDiscoveredZones([]);
    setFirstIslandLanded(false, false);
    setInventoryFromSnapshot({}, {});
    restoreQuestProgress(allQuestsComplete());
  });

  it("shows Harbor Next only after all 18 main-quest steps", () => {
    restoreQuestProgress({
      ...allQuestsComplete(),
      "fuse-horizon": "active",
    });
    expect(getQuestSummary()).toMatch(/^Story 18\/18:/);
    restoreQuestProgress(allQuestsComplete());
    expect(getQuestSummary()).toBe("Next: reach Moonwake Harbor");
    expect(getQuestHint()).toBe("");
  });

  it("names Folklore Dust on the pre-boarding sail Next (AC1)", () => {
    setDiscoveredZones(["harbor"]);
    expect(getQuestSummary()).toBe("Next: sail east for Folklore Dust");
    expect(getQuestSummary()).toMatch(/Folklore Dust/);
    expect(getQuestSummary()).not.toMatch(/^Next: sail east from East Landing$/);
  });

  it("names Folklore Dust on the islands Next until first land", () => {
    setDiscoveredZones(["harbor", "archipelago"]);
    expect(getQuestSummary()).toBe("Next: claim Folklore Dust ashore");
  });

  it("clears the Next chain after first island landing", () => {
    setDiscoveredZones(["harbor", "archipelago"]);
    setFirstIslandLanded(true, false);
    expect(getQuestSummary()).toBe("Story: complete");
    expect(getQuestHint().startsWith("All story beats finished")).toBe(true);
    expect(getQuestHint()).not.toMatch(/invite|press I/i);
  });

  it("persists chain progress via restore of zones and island flag", () => {
    setDiscoveredZones(["harbor"]);
    expect(getQuestSummary()).toBe("Next: sail east for Folklore Dust");
    restoreQuestProgress(allQuestsComplete());
    expect(getQuestSummary()).toBe("Next: sail east for Folklore Dust");
  });

  it("leaves pre-complete Story N/18 display unchanged", () => {
    restoreQuestProgress({
      ...lockedProgress(),
      "first-befriend": "complete",
      "first-spar": "active",
    });
    expect(getQuestSummary()).toMatch(/^Story 2\/18:/);
    expect(getQuestHint().startsWith("Next:")).toBe(true);
  });

  it("grants Folklore Dust on first island land and clears Next (AC2)", () => {
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
    expect(getQuestSummary()).toBe("Story: complete");
  });

  it("does not re-grant after an already-landed save (AC4)", () => {
    setDiscoveredZones(["harbor", "archipelago"]);
    setFirstIslandLanded(true, false);
    setInventoryFromSnapshot({ [SECOND_ACT_WANT_MATERIAL_ID]: 2 }, {});
    expect(claimSecondActWantOnIslandLand()).toBe(false);
    expect(getMaterialCount(SECOND_ACT_WANT_MATERIAL_ID)).toBe(2);
    expect(consumeQuestToast()).toBeNull();
    expect(getQuestSummary()).toBe("Story: complete");
  });

  it("keeps sail Next for a completed-story save that never boarded (AC4)", () => {
    setDiscoveredZones(["harbor"]);
    expect(worldState.firstIslandLanded).toBe(false);
    expect(getQuestSummary()).toBe("Next: sail east for Folklore Dust");
  });

  it("does not grant Dust to visitors on island land", () => {
    setVisitorMode(true);
    setDiscoveredZones(["harbor", "archipelago"]);
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
