import { CREATURE_MATERIALS } from "../inventory/materials";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ENCOUNTERABLE_CREATURE_IDS,
  getUnlockedAchievements,
  resetAchievementsForTest,
} from "../progression/achievements";
import {
  getItemCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { setVisitorMode } from "./worldSession";
import {
  getPlayerName,
  resetPlayerNameForTest,
  setPlayerName,
} from "./playerName";
import { getNpcById } from "./npcs";
import {
  claimNpcGift,
  getClaimedNpcGifts,
  getSideQuestStatuses,
  hasPurchasedOddRest,
  resetNpcStateForTest,
  setClaimedNpcGifts,
} from "./npcState";
import { resetMinigameProgressForTest } from "../minigames/progress";
import type { CreatureInstance } from "../creatures/types";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { QUEST_ORDER } from "../story/quests";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  isValidWorldSnapshot,
  migrateBoatStateToHarbor,
  repairLegacyArchipelagoLayoutPosition,
  repairLegacyOverworldShorePosition,
  repairLegacyVillageGateAccess,
  type WorldSnapshot,
} from "./worldSnapshot";
import { HARBOR_EMBARK_WATER } from "./dockBoat";
import { ARCHIPELAGO_ENTRY, islandTemplateAtIndex } from "./archipelagoStream";
import { getSparWinsForSpecies } from "./sparWins";
import {
  getCairnSovereignObtained,
  getHorizonFusionCount,
  getTideSovereignObtained,
  isEclipseFusionCompleted,
  isGodFusionCompleted,
  isGodLandEncounterClaimed,
  isGodSailEncounterClaimed,
  isStory1BefriendGuaranteeConsumed,
  setEclipseFusionCompleted,
  setGodFusionCompleted,
  setGodLandEncounterClaimed,
  setGodSailEncounterClaimed,
  setStory1BefriendGuaranteeConsumed,
  worldState,
} from "./worldState";
import { getNextInstanceId, playerParty } from "../creatures/party";
import {
  registerStagedCraftingSource,
  resetStagedCraftingSourcesForTest,
} from "../crafting/stagedMaterials";

function questProgress(
  overrides: Partial<Record<QuestId, QuestStatus>> = {},
): Record<QuestId, QuestStatus> {
  const base = Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
  return { ...base, "first-befriend": "active", ...overrides };
}

function partyMember(
  overrides: Partial<CreatureInstance> = {},
): CreatureInstance {
  return {
    instanceId: "1",
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 1,
    xp: 0,
    ...overrides,
  };
}

function validSnapshot(
  overrides: Partial<WorldSnapshot> = {},
): WorldSnapshot {
  return {
    version: 1,
    hostLabel: "test-host",
    overworldUnlocked: false,
    questProgress: questProgress(),
    party: [partyMember()],
    nextInstanceId: 2,
    materials: {},
    items: {},
    position: { zoneId: "grove", x: 5, y: 5 },
    ...overrides,
  };
}

beforeEach(() => {
  resetPlayerNameForTest();
  setVisitorMode(false);
});

describe("isValidWorldSnapshot", () => {
  it("accepts a well-formed host snapshot", () => {
    expect(isValidWorldSnapshot(validSnapshot())).toBe(true);
  });

  it("accepts optional playerName when normalized", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ playerName: "Mira" })),
    ).toBe(true);
  });

  it("rejects empty, padded, or overlong playerName", () => {
    expect(isValidWorldSnapshot(validSnapshot({ playerName: "" }))).toBe(false);
    expect(isValidWorldSnapshot(validSnapshot({ playerName: " Mira" }))).toBe(
      false,
    );
    expect(
      isValidWorldSnapshot(validSnapshot({ playerName: "a".repeat(17) })),
    ).toBe(false);
  });

  it("accepts and rejects activePartyIds against the party roster", () => {
    const member = partyMember({ instanceId: "c-1" });
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          party: [member],
          activePartyIds: ["c-1"],
        }),
      ),
    ).toBe(true);
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          party: [member],
          activePartyIds: ["missing"],
        }),
      ),
    ).toBe(false);
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          party: [member],
          activePartyIds: ["c-1", "c-1"],
        }),
      ),
    ).toBe(false);
  });

  it("soft-adds and validates the god sail claim flag", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ godSailEncounterClaimed: true })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        godSailEncounterClaimed: "yes",
      }),
    ).toBe(false);
  });

  it("soft-adds and validates the Story 1 befriend guarantee flag", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ story1BefriendGuaranteeConsumed: true }),
      ),
    ).toBe(true);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        story1BefriendGuaranteeConsumed: "yes",
      }),
    ).toBe(false);
  });

  it("soft-adds and validates sparWinsBySpecies", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ sparWinsBySpecies: { mossling: 3 } }),
      ),
    ).toBe(true);
    expect(
      isValidWorldSnapshot(
        validSnapshot({ sparWinsBySpecies: { "not-a-creature": 1 } }),
      ),
    ).toBe(false);
    expect(
      isValidWorldSnapshot(
        validSnapshot({ sparWinsBySpecies: { mossling: -1 } }),
      ),
    ).toBe(false);
  });

  it("soft-adds and validates the god land claim flag", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ godLandEncounterClaimed: true })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        godLandEncounterClaimed: "yes",
      }),
    ).toBe(false);
  });

  it("soft-adds and validates the god fusion flag", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ godFusionCompleted: true })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        godFusionCompleted: "yes",
      }),
    ).toBe(false);
  });

  it("soft-adds and validates horizon fusion count and Eclipse flag", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ horizonFusionCount: 2 })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot(validSnapshot({ eclipseFusionCompleted: true })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        horizonFusionCount: 3,
      }),
    ).toBe(false);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        eclipseFusionCompleted: "yes",
      }),
    ).toBe(false);
  });

  it("accepts a known claimed NPC gift", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ claimedNpcGifts: ["warden-bryn"] })),
    ).toBe(true);
  });

  it("rejects an unknown claimed NPC gift", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ claimedNpcGifts: ["not-a-villager"] })),
    ).toBe(false);
  });

  it("soft-adds and validates the Odd rest purchase flag", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ oddRestPurchased: true })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot({
        ...validSnapshot(),
        oddRestPurchased: "yes",
      }),
    ).toBe(false);
  });

  it("accepts a save made inside a cottage", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ position: { zoneId: "warden-cottage", x: 3, y: 3 } }),
      ),
    ).toBe(true);
  });

  it("accepts known side-quest progress", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          npcSideQuests: { "bryn-ledger": "active", "sable-thread": "complete" },
        }),
      ),
    ).toBe(true);
  });

  it("rejects unknown side-quest ids", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          npcSideQuests: { "not-a-quest": "active" } as WorldSnapshot["npcSideQuests"],
        }),
      ),
    ).toBe(false);
  });

  it("rejects unknown zoneId", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          position: { zoneId: "nope" as WorldSnapshot["position"]["zoneId"], x: 5, y: 5 },
        }),
      ),
    ).toBe(false);
  });

  it("rejects unknown creature definitionId", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          party: [partyMember({ definitionId: "not-a-creature" })],
        }),
      ),
    ).toBe(false);
  });

  it("rejects invalid quest status", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          questProgress: questProgress({
            "first-befriend": "nope" as QuestStatus,
          }),
        }),
      ),
    ).toBe(false);
  });

  it("accepts legacy 4-step questProgress on load (#313)", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          questProgress: {
            "first-befriend": "complete",
            "first-spar": "complete",
            "reach-village": "complete",
            "shrine-craft": "complete",
          } as WorldSnapshot["questProgress"],
        }),
      ),
    ).toBe(true);
  });

  it("rejects non-walkable spawn", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          position: { zoneId: "grove", x: 0, y: 0 },
        }),
      ),
    ).toBe(false);
  });

  it("rejects legacy overworld y=13 water until shore repair runs", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          overworldUnlocked: true,
          position: { zoneId: "overworld", x: 6, y: 13 },
        }),
      ),
    ).toBe(false);
  });
});

describe("repairLegacyOverworldShorePosition", () => {
  it("moves stranded overworld y=13 water stands to the gate land spawn", () => {
    const snapshot = validSnapshot({
      overworldUnlocked: true,
      position: { zoneId: "overworld", x: 6, y: 13 },
    });
    repairLegacyOverworldShorePosition(snapshot);
    expect(snapshot.position).toEqual({ zoneId: "overworld", x: 7, y: 12 });
    expect(isValidWorldSnapshot(snapshot)).toBe(true);
  });

  it("leaves mid-sail alone only after Harbor migration", () => {
    const sailing = validSnapshot({
      overworldUnlocked: true,
      sailing: true,
      placedBoat: true,
      position: { zoneId: "overworld", x: 6, y: 13 },
    });
    migrateBoatStateToHarbor(sailing);
    repairLegacyOverworldShorePosition(sailing);
    expect(sailing.position).toEqual({
      zoneId: "harbor",
      x: HARBOR_EMBARK_WATER.x,
      y: HARBOR_EMBARK_WATER.y,
    });
    expect(isValidWorldSnapshot(sailing)).toBe(true);
  });

  it("leaves the pier and other zones alone", () => {
    const pier = validSnapshot({
      overworldUnlocked: true,
      position: { zoneId: "overworld", x: 7, y: 13 },
    });
    repairLegacyOverworldShorePosition(pier);
    expect(pier.position).toEqual({ zoneId: "overworld", x: 7, y: 13 });

    const grove = validSnapshot({
      position: { zoneId: "grove", x: 3, y: 7 },
    });
    repairLegacyOverworldShorePosition(grove);
    expect(grove.position).toEqual({ zoneId: "grove", x: 3, y: 7 });
  });
});

describe("repairLegacyArchipelagoLayoutPosition", () => {
  it("keeps east progress but moves sailing onto mid-ocean when land blocks old y", () => {
    // Pre-#108 / height-28 mid-band or island Floor underfoot while sailing.
    const sailing = validSnapshot({
      overworldUnlocked: true,
      sailing: true,
      placedBoat: true,
      position: { zoneId: "archipelago", x: 12, y: 12 },
    });
    expect(isValidWorldSnapshot(sailing)).toBe(false);
    repairLegacyArchipelagoLayoutPosition(sailing);
    expect(sailing.position).toEqual({
      zoneId: "archipelago",
      x: 12,
      y: ARCHIPELAGO_ENTRY.y,
    });
    expect(isValidWorldSnapshot(sailing)).toBe(true);
  });

  it("snaps invalid on-foot island stands to the nearest current pier", () => {
    // Open-water gap between columns is not a valid on-foot stand.
    const onFoot = validSnapshot({
      overworldUnlocked: true,
      sailing: false,
      placedBoat: true,
      position: { zoneId: "archipelago", x: 27, y: 10 },
    });
    expect(isValidWorldSnapshot(onFoot)).toBe(false);
    repairLegacyArchipelagoLayoutPosition(onFoot);
    const expected = islandTemplateAtIndex(1).pier;
    expect(onFoot.position).toEqual({
      zoneId: "archipelago",
      x: expected.x,
      y: expected.y,
    });
    expect(isValidWorldSnapshot(onFoot)).toBe(true);
  });

  it("leaves valid current archipelago stands alone", () => {
    const pier = islandTemplateAtIndex(0).pier;
    const onFoot = validSnapshot({
      overworldUnlocked: true,
      position: { zoneId: "archipelago", x: pier.x, y: pier.y },
    });
    repairLegacyArchipelagoLayoutPosition(onFoot);
    expect(onFoot.position).toEqual({
      zoneId: "archipelago",
      x: pier.x,
      y: pier.y,
    });
  });
});

describe("isValidWorldSnapshot inventory and discovery", () => {
  it("rejects negative inventory counts", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ materials: { wood: -1 } })),
    ).toBe(false);
  });

  it("rejects non-finite party HP", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          party: [partyMember({ currentHp: Number.NaN })],
        }),
      ),
    ).toBe(false);
  });

  it("accepts discoveredCreatures when all ids are known", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ discoveredCreatures: ["mossling", "ember-wisp"] }),
      ),
    ).toBe(true);
  });

  it("rejects unknown discoveredCreatures ids", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ discoveredCreatures: ["not-a-creature"] }),
      ),
    ).toBe(false);
  });

  it("accepts known unlockedAchievements", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ unlockedAchievements: ["full-codex"] }),
      ),
    ).toBe(true);
  });

  it("rejects unknown unlockedAchievements ids", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({ unlockedAchievements: ["not-an-achievement"] }),
      ),
    ).toBe(false);
  });
});

describe("playerName host save round-trip (#248)", () => {
  it("exports and restores the session player name", () => {
    expect(setPlayerName("Bren")).toBe(true);
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 3, y: 7 });
    expect(exported.playerName).toBe("Bren");
    resetPlayerNameForTest();
    applyWorldSnapshot(exported);
    expect(getPlayerName()).toBe("Bren");
  });

  it("omits playerName when unnamed, and visitor mode clears a restored host name", () => {
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 3, y: 7 });
    expect(exported.playerName).toBeUndefined();
    applyWorldSnapshot(validSnapshot({ playerName: "Host" }));
    expect(getPlayerName()).toBe("Host");
    setVisitorMode(true, "Host world");
    expect(getPlayerName()).toBeNull();
  });

  it("does not restore playerName when already in visitor mode", () => {
    setVisitorMode(true, "Friend's world");
    applyWorldSnapshot(validSnapshot({ playerName: "Host" }));
    expect(getPlayerName()).toBeNull();
  });
});

describe("applyWorldSnapshot codex achievement", () => {
  beforeEach(() => {
    resetAchievementsForTest();
    setInventoryFromSnapshot({}, {});
    setVisitorMode(false);
    resetNpcStateForTest();
    resetMinigameProgressForTest();
    setGodSailEncounterClaimed(false, false);
    setStory1BefriendGuaranteeConsumed(false, false);
    setGodLandEncounterClaimed(false, false);
    setGodFusionCompleted(false, false);
    setEclipseFusionCompleted(false, false);
  });

  it("restores the god sail claim and defaults older saves to unclaimed", () => {
    applyWorldSnapshot(validSnapshot({ godSailEncounterClaimed: true }));
    expect(isGodSailEncounterClaimed()).toBe(true);

    applyWorldSnapshot(validSnapshot());
    expect(isGodSailEncounterClaimed()).toBe(false);
  });

  it("restores the Story 1 befriend guarantee and defaults older saves to unused", () => {
    applyWorldSnapshot(
      validSnapshot({ story1BefriendGuaranteeConsumed: true }),
    );
    expect(isStory1BefriendGuaranteeConsumed()).toBe(true);
    expect(
      exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 })
        .story1BefriendGuaranteeConsumed,
    ).toBe(true);

    applyWorldSnapshot(validSnapshot());
    expect(isStory1BefriendGuaranteeConsumed()).toBe(false);
  });

  it("round-trips sparWinsBySpecies and defaults older saves to empty", () => {
    applyWorldSnapshot(
      validSnapshot({ sparWinsBySpecies: { mossling: 4, "lantern-fox": 2 } }),
    );
    expect(getSparWinsForSpecies("mossling")).toBe(4);
    expect(getSparWinsForSpecies("lantern-fox")).toBe(2);
    expect(exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 }).sparWinsBySpecies).toEqual({
      mossling: 4,
      "lantern-fox": 2,
    });

    applyWorldSnapshot(validSnapshot());
    expect(getSparWinsForSpecies("mossling")).toBe(0);
  });

  it("restores the god land claim and defaults older saves to unclaimed", () => {
    applyWorldSnapshot(validSnapshot({ godLandEncounterClaimed: true }));
    expect(isGodLandEncounterClaimed()).toBe(true);

    applyWorldSnapshot(validSnapshot());
    expect(isGodLandEncounterClaimed()).toBe(false);
  });

  it("round-trips sovereign obtainment counts and infers two from an eclipse save", () => {
    applyWorldSnapshot(
      validSnapshot({
        tideSovereignObtained: 2,
        cairnSovereignObtained: 1,
      }),
    );
    expect(getTideSovereignObtained()).toBe(2);
    expect(getCairnSovereignObtained()).toBe(1);
    expect(exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 }).tideSovereignObtained).toBe(2);

    applyWorldSnapshot(validSnapshot({ eclipseFusionCompleted: true, horizonFusionCount: 2 }));
    expect(getTideSovereignObtained()).toBe(2);
    expect(getCairnSovereignObtained()).toBe(2);
  });

  it("round-trips villageGateUnlocked (#291)", () => {
    applyWorldSnapshot(validSnapshot({ villageGateUnlocked: true }));
    expect(worldState.villageGateUnlocked).toBe(true);
    expect(
      exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 }).villageGateUnlocked,
    ).toBe(true);

    applyWorldSnapshot(validSnapshot());
    expect(worldState.villageGateUnlocked).toBe(false);
  });

  it("round-trips Bryn Grove starter gifts (#349)", () => {
    applyWorldSnapshot(validSnapshot({ brynGroveStartersGifted: ["ember-wisp"] }));
    expect(worldState.brynGroveStartersGifted).toEqual(["ember-wisp"]);
    expect(
      exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 }).brynGroveStartersGifted,
    ).toEqual(["ember-wisp"]);

    expect(
      isValidWorldSnapshot(validSnapshot({ brynGroveStartersGifted: ["mossling"] })),
    ).toBe(true);
    expect(
      isValidWorldSnapshot(
        validSnapshot({ brynGroveStartersGifted: ["brook-nymph"] }),
      ),
    ).toBe(false);
  });

  it("reopens the cottage gate for Act 2 saves that stored it locked (#349)", () => {
    applyWorldSnapshot(
      validSnapshot({
        villageGateUnlocked: false,
        questProgress: questProgress({
          "first-befriend": "complete",
          "first-spar": "complete",
          "reach-village": "complete",
          "shrine-craft": "complete",
          "evolve-bramblewarden": "active",
        }),
      }),
    );
    expect(worldState.villageGateUnlocked).toBe(true);
  });

  it("grandfathers village gate for legacy cottage / villager saves (#291)", () => {
    const inCottage = validSnapshot({
      position: { zoneId: "warden-cottage", x: 3, y: 3 },
    });
    delete (inCottage as { villageGateUnlocked?: boolean }).villageGateUnlocked;
    repairLegacyVillageGateAccess(inCottage);
    expect(inCottage.villageGateUnlocked).toBe(true);

    const gifted = validSnapshot({
      claimedNpcGifts: ["weaver-sable"],
    });
    delete (gifted as { villageGateUnlocked?: boolean }).villageGateUnlocked;
    repairLegacyVillageGateAccess(gifted);
    expect(gifted.villageGateUnlocked).toBe(true);

    const eastYard = {
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: validSnapshot().questProgress,
      party: validSnapshot().party,
      nextInstanceId: 2,
      materials: {},
      items: {},
      position: { zoneId: "village", x: 12, y: 5 },
    };
    repairLegacyVillageGateAccess(eastYard);
    expect(eastYard.position).toEqual({ zoneId: "village", x: 7, y: 5 });

    const dividerColumn = {
      version: 1,
      hostLabel: "test",
      overworldUnlocked: true,
      questProgress: validSnapshot().questProgress,
      party: validSnapshot().party,
      nextInstanceId: 2,
      materials: {},
      items: {},
      position: { zoneId: "village", x: 8, y: 3 },
    };
    repairLegacyVillageGateAccess(dividerColumn);
    expect(dividerColumn.position).toEqual({ zoneId: "village", x: 7, y: 5 });

    const minigameOnly = validSnapshot({
      claimedMinigameWins: ["hearth-lots"],
    });
    delete (minigameOnly as { villageGateUnlocked?: boolean }).villageGateUnlocked;
    repairLegacyVillageGateAccess(minigameOnly);
    expect(minigameOnly.villageGateUnlocked).toBe(true);

    const giftedOnDivider = validSnapshot({
      claimedNpcGifts: ["warden-bryn"],
      position: { zoneId: "village", x: 8, y: 3 },
    });
    delete (giftedOnDivider as { villageGateUnlocked?: boolean })
      .villageGateUnlocked;
    repairLegacyVillageGateAccess(giftedOnDivider);
    expect(giftedOnDivider.villageGateUnlocked).toBe(true);
    expect(giftedOnDivider.position).toEqual({
      zoneId: "village",
      x: 7,
      y: 5,
    });

    const discoveredCottage = validSnapshot({
      discoveredZones: ["village", "warden-cottage"],
    });
    delete (discoveredCottage as { villageGateUnlocked?: boolean })
      .villageGateUnlocked;
    repairLegacyVillageGateAccess(discoveredCottage);
    expect(discoveredCottage.villageGateUnlocked).toBe(true);

    const malformed = validSnapshot({
      claimedNpcGifts: ["warden-bryn"],
      villageGateUnlocked: "yes" as unknown as boolean,
    });
    repairLegacyVillageGateAccess(malformed);
    expect(malformed.villageGateUnlocked).toBe("yes");
    expect(isValidWorldSnapshot(malformed)).toBe(false);
  });

  it("restores the god fusion flag and defaults older saves to incomplete", () => {
    applyWorldSnapshot(validSnapshot({ godFusionCompleted: true }));
    expect(isGodFusionCompleted()).toBe(true);

    applyWorldSnapshot(validSnapshot());
    expect(isGodFusionCompleted()).toBe(false);
  });

  it("treats a legacy Horizon-complete save as one fusion and reopens parent hunts", () => {
    applyWorldSnapshot(
      validSnapshot({
        godFusionCompleted: true,
        godSailEncounterClaimed: true,
        godLandEncounterClaimed: true,
        party: [
          partyMember({
            instanceId: "h1",
            definitionId: "horizon-sovereign",
            speciesId: "horizon-sovereign",
          }),
        ],
      }),
    );
    expect(isGodFusionCompleted()).toBe(true);
    expect(getHorizonFusionCount()).toBe(1);
    expect(isEclipseFusionCompleted()).toBe(false);
    expect(isGodSailEncounterClaimed()).toBe(false);
    expect(isGodLandEncounterClaimed()).toBe(false);

    const exported = exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 });
    expect(exported.horizonFusionCount).toBe(1);
    expect(exported.eclipseFusionCompleted).toBe(false);
  });

  it("round-trips Eclipse completion without reopening parent hunts", () => {
    applyWorldSnapshot(
      validSnapshot({
        godFusionCompleted: true,
        horizonFusionCount: 2,
        eclipseFusionCompleted: true,
        godSailEncounterClaimed: true,
        godLandEncounterClaimed: true,
      }),
    );
    expect(isEclipseFusionCompleted()).toBe(true);
    expect(getHorizonFusionCount()).toBe(2);
    expect(isGodSailEncounterClaimed()).toBe(true);
    expect(isGodLandEncounterClaimed()).toBe(true);
  });

  it("round-trips activePartyIds through apply and export", () => {
    const a = partyMember({ instanceId: "c-a", definitionId: "mossling" });
    const b = partyMember({ instanceId: "c-b", definitionId: "ember-wisp" });
    const c = partyMember({ instanceId: "c-c", definitionId: "brook-nymph" });
    applyWorldSnapshot(
      validSnapshot({
        party: [a, b, c],
        activePartyIds: ["c-c", "c-a"],
        nextInstanceId: 10,
      }),
    );
    expect(playerParty.activeInstanceIds).toEqual(["c-c", "c-a"]);
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 });
    expect(exported.activePartyIds).toEqual(["c-c", "c-a"]);
    expect(exported.party.map((m) => m.instanceId)).toEqual([
      "c-a",
      "c-b",
      "c-c",
    ]);
  });

  it("does not infer codex discovery from a saved Tide Sovereign", () => {
    applyWorldSnapshot(
      validSnapshot({
        discoveredCreatures: [],
        party: [
          partyMember({
            definitionId: "tide-sovereign",
            speciesId: "tide-sovereign",
            currentHp: 0,
          }),
        ],
      }),
    );

    expect(worldState.discoveredCreatures).not.toContain("tide-sovereign");
  });

  it("does not infer codex discovery from a saved Stone Sovereign", () => {
    applyWorldSnapshot(
      validSnapshot({
        discoveredCreatures: [],
        party: [
          partyMember({
            definitionId: "cairn-sovereign",
            speciesId: "cairn-sovereign",
            currentHp: 0,
          }),
        ],
      }),
    );

    expect(worldState.discoveredCreatures).not.toContain("cairn-sovereign");
  });

  it("awards a legacy full-codex save after the inventory is restored", () => {
    applyWorldSnapshot(
      validSnapshot({
        discoveredCreatures: [...ENCOUNTERABLE_CREATURE_IDS],
        unlockedAchievements: undefined,
      }),
    );

    expect(getUnlockedAchievements()).toEqual(["full-codex"]);
    expect(getItemCount("brook-tonic")).toBe(5);
    expect(getItemCount("moonwake-draught")).toBe(5);
  });

  it("does not re-award a save that already earned the achievement", () => {
    applyWorldSnapshot(
      validSnapshot({
        discoveredCreatures: [...ENCOUNTERABLE_CREATURE_IDS],
        unlockedAchievements: ["full-codex"],
        items: { "brook-tonic": 5, "moonwake-draught": 5 },
      }),
    );

    expect(getItemCount("brook-tonic")).toBe(5);
    expect(getItemCount("moonwake-draught")).toBe(5);
  });

  it("leaves an incomplete codex unrewarded", () => {
    // Drop a species the party cannot re-add on restore.
    const missing = "bog-lantern";
    expect(partyMember().definitionId).not.toBe(missing);
    applyWorldSnapshot(
      validSnapshot({
        discoveredCreatures: ENCOUNTERABLE_CREATURE_IDS.filter(
          (id) => id !== missing,
        ),
      }),
    );

    expect(getUnlockedAchievements()).toEqual([]);
    expect(getItemCount("brook-tonic")).toBe(0);
  });

  it("restores claimed NPC gifts so villagers do not pay out twice", () => {
    applyWorldSnapshot(validSnapshot({ claimedNpcGifts: ["warden-bryn"] }));

    expect(getClaimedNpcGifts()).toEqual(["warden-bryn"]);
    expect(claimNpcGift(getNpcById("warden-bryn")!)).toBeNull();
  });

  it("treats a save without the field as nobody having been visited", () => {
    setClaimedNpcGifts(["warden-bryn"]);
    applyWorldSnapshot(validSnapshot());

    expect(getClaimedNpcGifts()).toEqual([]);
  });

  it("restores Odd's first-rest purchase and defaults older saves to unpaid", () => {
    applyWorldSnapshot(validSnapshot({ oddRestPurchased: true }));
    expect(hasPurchasedOddRest()).toBe(true);

    applyWorldSnapshot(validSnapshot());
    expect(hasPurchasedOddRest()).toBe(false);

    applyWorldSnapshot(validSnapshot({ oddRestPurchased: true }));
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 });
    expect(exported.oddRestPurchased).toBe(true);
  });

  it("restores NPC side-quest progress", () => {
    applyWorldSnapshot(
      validSnapshot({
        npcSideQuests: { "bryn-ledger": "active", "sable-thread": "complete" },
      }),
    );

    expect(getSideQuestStatuses()).toEqual({
      "bryn-ledger": "active",
      "sable-thread": "complete",
      "odd-company": "locked",
    });
  });
});

describe("exportWorldSnapshot staged crafting", () => {
  beforeEach(() => {
    resetStagedCraftingSourcesForTest();
    setVisitorMode(false);
    setInventoryFromSnapshot({ wood: 2 }, {});
  });

  it("counts staged materials as still in the bag", () => {
    const stop = registerStagedCraftingSource(() => ({ wood: 1 }));
    const exported = exportWorldSnapshot({ zoneId: "grove", x: 5, y: 5 });
    expect(exported.materials.wood).toBe(3);
    stop();
  });
});

describe("party member validation hardening (#192)", () => {
  beforeEach(() => {
    resetAchievementsForTest();
    setInventoryFromSnapshot({}, {});
    setVisitorMode(false);
    resetNpcStateForTest();
    resetMinigameProgressForTest();
    setGodSailEncounterClaimed(false, false);
    setGodLandEncounterClaimed(false, false);
    setGodFusionCompleted(false, false);
    setEclipseFusionCompleted(false, false);
  });

  it("accepts a legacy member without speciesId", () => {
    const member = partyMember();
    delete (member as Partial<CreatureInstance>).speciesId;
    expect(isValidWorldSnapshot(validSnapshot({ party: [member] }))).toBe(true);
  });

  it("rejects a speciesId that names no real creature", () => {
    const member = partyMember({ speciesId: "not-a-creature" });
    expect(isValidWorldSnapshot(validSnapshot({ party: [member] }))).toBe(
      false,
    );
  });

  it("rejects malformed secondaryMove fields", () => {
    const badPower = partyMember({
      secondaryMove: {
        id: "m",
        name: "M",
        power: "x" as unknown as number,
        type: "ember",
        accuracy: 90,
      },
    });
    expect(isValidWorldSnapshot(validSnapshot({ party: [badPower] }))).toBe(
      false,
    );
    const badType = partyMember({
      secondaryMove: {
        id: "m",
        name: "M",
        power: 5,
        type: "lava" as unknown as CreatureInstance["secondaryElement"] &
          string,
        accuracy: 90,
      },
    });
    expect(isValidWorldSnapshot(validSnapshot({ party: [badType] }))).toBe(
      false,
    );
  });

  it("accepts a well-formed secondaryMove and secondaryElement", () => {
    const member = partyMember({
      secondaryElement: "ember",
      secondaryMove: {
        id: "cinder-lash",
        name: "Cinder Lash",
        power: 7,
        type: "ember",
        accuracy: 85,
      },
      appliedEffects: ["mossling:ember-charm"],
    });
    expect(isValidWorldSnapshot(validSnapshot({ party: [member] }))).toBe(true);
  });

  it("rejects malformed secondaryElement and appliedEffects", () => {
    const badElement = partyMember({
      secondaryElement: "lava" as CreatureInstance["secondaryElement"],
    });
    expect(isValidWorldSnapshot(validSnapshot({ party: [badElement] }))).toBe(
      false,
    );
    const badEffects = partyMember({
      appliedEffects: [42] as unknown as string[],
    });
    expect(isValidWorldSnapshot(validSnapshot({ party: [badEffects] }))).toBe(
      false,
    );
  });

  it("backfills speciesId from definitionId on apply", () => {
    const member = partyMember({ definitionId: "mossling" });
    delete (member as Partial<CreatureInstance>).speciesId;
    applyWorldSnapshot(validSnapshot({ party: [member] }));
    expect(playerParty.creatures[0]?.speciesId).toBe("mossling");
  });

  it("keeps an evolved member's original speciesId on apply", () => {
    const member = partyMember({
      definitionId: "bramblewarden",
      speciesId: "mossling",
    });
    applyWorldSnapshot(validSnapshot({ party: [member] }));
    expect(playerParty.creatures[0]?.speciesId).toBe("mossling");
  });

  it("keeps a claimed sovereign claimed when the save lacks speciesId", () => {
    const sovereign = partyMember({
      instanceId: "c-9",
      definitionId: "tide-sovereign",
    });
    delete (sovereign as Partial<CreatureInstance>).speciesId;
    applyWorldSnapshot(
      validSnapshot({
        party: [sovereign],
        godSailEncounterClaimed: true,
        nextInstanceId: 10,
      }),
    );
    expect(isGodSailEncounterClaimed()).toBe(true);
  });

  it("never mints an instance id that collides with a loaded c-<n> id", () => {
    const member = partyMember({ instanceId: "c-5" });
    applyWorldSnapshot(
      validSnapshot({ party: [member], nextInstanceId: 2 }),
    );
    expect(getNextInstanceId()).toBe(6);
  });

  it("ignores non-pattern instance ids for the mint floor", () => {
    const member = partyMember({ instanceId: "legacy-id" });
    applyWorldSnapshot(
      validSnapshot({ party: [member], nextInstanceId: 3 }),
    );
    expect(getNextInstanceId()).toBe(3);
  });
});

describe("mint-floor integrity (#192 gate finding)", () => {
  it("rejects a non-integer nextInstanceId", () => {
    expect(isValidWorldSnapshot(validSnapshot({ nextInstanceId: 2.5 }))).toBe(
      false,
    );
    expect(
      isValidWorldSnapshot(
        validSnapshot({ nextInstanceId: 9007199254740993 }),
      ),
    ).toBe(false);
  });

  it("rejects beyond-safe-integer id suffixes at validation", () => {
    const member = partyMember({ instanceId: "c-9007199254740992" });
    expect(
      isValidWorldSnapshot(validSnapshot({ party: [member] })),
    ).toBe(false);
  });
});

describe("mint counter ceiling (#192 round-2 finding)", () => {
  it("rejects nextInstanceId above the counter ceiling", () => {
    expect(
      isValidWorldSnapshot(validSnapshot({ nextInstanceId: 1_000_000_001 })),
    ).toBe(false);
    expect(
      isValidWorldSnapshot(
        validSnapshot({ nextInstanceId: 9007199254740991 }),
      ),
    ).toBe(false);
  });

  it("rejects mint-pattern instance ids above the counter ceiling", () => {
    const boundary = partyMember({ instanceId: "c-9007199254740991" });
    expect(
      isValidWorldSnapshot(validSnapshot({ party: [boundary] })),
    ).toBe(false);
    const overCap = partyMember({ instanceId: "c-1000000001" });
    expect(isValidWorldSnapshot(validSnapshot({ party: [overCap] }))).toBe(
      false,
    );
  });

  it("accepts and advances past a large but legitimate suffix", () => {
    const member = partyMember({ instanceId: "c-999999999" });
    const snapshot = validSnapshot({
      party: [member],
      nextInstanceId: 5,
    });
    expect(isValidWorldSnapshot(snapshot)).toBe(true);
    applyWorldSnapshot(snapshot);
    expect(getNextInstanceId()).toBe(1_000_000_000);
  });
});

describe("dailyAsk snapshot field", () => {
  const sampleMaterial = Object.values(CREATURE_MATERIALS)[0]!;

  it("accepts a well-formed dailyAsk", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          dailyAsk: {
            dayKey: "2026-08-21",
            materialId: sampleMaterial,
            amount: 4,
            npcId: "warden-bryn",
            status: "active",
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects unknown dailyAsk materials and npc ids", () => {
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          dailyAsk: {
            dayKey: "2026-08-21",
            materialId: "not-a-material",
            amount: 4,
            npcId: "warden-bryn",
            status: "active",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isValidWorldSnapshot(
        validSnapshot({
          dailyAsk: {
            dayKey: "2026-08-21",
            materialId: sampleMaterial,
            amount: 4,
            npcId: "not-an-npc",
            status: "active",
          },
        }),
      ),
    ).toBe(false);
  });
});

