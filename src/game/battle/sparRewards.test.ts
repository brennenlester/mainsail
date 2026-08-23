import { beforeEach, describe, expect, it } from "vitest";
import {
  formatRewardMessage,
  grantSparRewards,
  SPAR_WIN_DUST_GAIN,
  splitSparXp,
} from "./sparRewards";
import {
  playerParty,
  setPartyFromSnapshot,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import {
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { XP_PER_SPAR_WIN } from "../progression/leveling";
import { restoreQuestProgress } from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import type { QuestId, QuestStatus } from "../story/questTypes";
import { getSparWinsForSpecies, setSparWinsBySpecies } from "../world/sparWins";
import { SPAR_WILD_OPENING_TURNS } from "../encounters/encounterEconomy";

function member(
  overrides: Partial<CreatureInstance> & Pick<CreatureInstance, "instanceId">,
): CreatureInstance {
  return {
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 1,
    xp: 0,
    ...overrides,
  };
}

function lockedProgress(): Record<QuestId, QuestStatus> {
  return Object.fromEntries(
    QUEST_ORDER.map((id) => [id, "locked" as const]),
  ) as Record<QuestId, QuestStatus>;
}

describe("splitSparXp", () => {
  it("splits evenly when divisible", () => {
    expect(splitSparXp(10, 2, 0)).toEqual([5, 5]);
    expect(splitSparXp(10, 5, 2)).toEqual([2, 2, 2, 2, 2]);
  });

  it("gives remainder XP to the fighter", () => {
    expect(splitSparXp(10, 3, 0)).toEqual([4, 3, 3]);
    expect(splitSparXp(10, 3, 1)).toEqual([3, 4, 3]);
    expect(splitSparXp(10, 3, 2)).toEqual([3, 3, 4]);
  });
});

describe("grantSparRewards XP share", () => {
  beforeEach(() => {
    restoreQuestProgress(lockedProgress());
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot([], 1);
    setSparWinsBySpecies({}, false);
  });

  it("pins #267 spar-win rewards: +1 Dust, +1 material, +70 XP; wild opens", () => {
    expect(SPAR_WIN_DUST_GAIN).toBe(1);
    expect(XP_PER_SPAR_WIN).toBe(70);
    expect(SPAR_WILD_OPENING_TURNS).toBe(1);

    const a = member({ instanceId: "a" });
    setPartyFromSnapshot([a], 4, ["a"]);
    const reward = grantSparRewards("mossling", 0);
    expect(reward.dustGained).toBe(1);
    expect(reward.xpGained).toBe(70);
    expect(reward.materialId).toBeTruthy();
    expect(getMaterialCount("folklore-dust")).toBe(1);
    expect(getMaterialCount(reward.materialId!)).toBe(1);
  });

  it("shares XP across the active party and leaves reserve untouched", () => {
    const a = member({ instanceId: "a", definitionId: "mossling", speciesId: "mossling" });
    const b = member({
      instanceId: "b",
      definitionId: "ember-wisp",
      speciesId: "ember-wisp",
    });
    const c = member({
      instanceId: "c",
      definitionId: "brook-nymph",
      speciesId: "brook-nymph",
    });
    setPartyFromSnapshot([a, b, c], 4, ["a", "b"]);

    const reward = grantSparRewards("mossling", 0);
    expect(reward.xpGained).toBe(XP_PER_SPAR_WIN);
    expect(reward.xpShares).toHaveLength(2);
    expect(playerParty.creatures.find((x) => x.instanceId === "a")?.xp).toBe(35);
    expect(playerParty.creatures.find((x) => x.instanceId === "b")?.xp).toBe(35);
    expect(playerParty.creatures.find((x) => x.instanceId === "c")?.xp).toBe(0);
    expect(getSparWinsForSpecies("mossling")).toBe(1);
  });

  it("gives remainder to the fighter when shares are uneven", () => {
    const creatures = [
      member({ instanceId: "a" }),
      member({ instanceId: "b", definitionId: "ember-wisp", speciesId: "ember-wisp" }),
      member({
        instanceId: "c",
        definitionId: "brook-nymph",
        speciesId: "brook-nymph",
      }),
    ];
    setPartyFromSnapshot(creatures, 4, ["a", "b", "c"]);
    grantSparRewards("mossling", 1);
    expect(playerParty.creatures.map((x) => x.xp)).toEqual([23, 24, 23]);
  });

  it("does not record spar wins for sovereigns", () => {
    setPartyFromSnapshot([member({ instanceId: "a" })], 2, ["a"]);
    grantSparRewards("tide-sovereign", 0);
    expect(getSparWinsForSpecies("tide-sovereign")).toBe(0);
  });

  it("formats shared XP without understating totals", () => {
    const message = formatRewardMessage({
      dustGained: 1,
      xpGained: 10,
      leveledUp: true,
      newLevel: 2,
      creatureName: "Mossling",
      xpShares: [
        { creatureName: "Mossling", xpGained: 5, leveledUp: true, newLevel: 2 },
        { creatureName: "Ember Wisp", xpGained: 5, leveledUp: false },
      ],
    });
    expect(message).toContain("Shared XP: Mossling +5, Ember Wisp +5.");
    expect(message).toContain("Mossling leveled up to Lv.2!");
  });
});
