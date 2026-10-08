import { beforeEach, describe, expect, it } from "vitest";
import {
  FIGHTER_XP_SHARE,
  formatRewardMessage,
  grantSparRewards,
  rollSparBonusDrop,
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
import { getLevelForXp, XP_PER_SPAR_WIN } from "../progression/leveling";
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

/** rng that never triggers a bonus drop. */
const NO_BONUS = () => 0.99;

describe("splitSparXp", () => {
  it("gives a lone fighter the whole pool", () => {
    expect(splitSparXp(70, 1, 0)).toEqual([70]);
  });

  it("splits evenly between two actives", () => {
    expect(splitSparXp(10, 2, 0)).toEqual([5, 5]);
  });

  it("gives the fighter FIGHTER_XP_SHARE and the bench the rest", () => {
    expect(FIGHTER_XP_SHARE).toBe(0.5);
    expect(splitSparXp(70, 7, 0)).toEqual([35, 6, 6, 6, 6, 6, 5]);
    expect(splitSparXp(70, 3, 2)).toEqual([18, 17, 35]);
  });

  it("gives leftover bench XP in order and always conserves the pool", () => {
    expect(splitSparXp(10, 5, 2)).toEqual([2, 1, 5, 1, 1]);
    for (let n = 1; n <= 7; n++) {
      for (let f = 0; f < n; f++) {
        const shares = splitSparXp(70, n, f);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(70);
        shares.forEach((x, i) => {
          if (i !== f) expect(shares[f]!).toBeGreaterThanOrEqual(x);
        });
      }
    }
  });
});

describe("rollSparBonusDrop", () => {
  it("maps the injected roll onto the table with variance", () => {
    expect(rollSparBonusDrop(() => 0)?.label).toBe("Moonlit find");
    expect(rollSparBonusDrop(() => 0.1)?.label).toBe("Lucky scrap");
    expect(rollSparBonusDrop(() => 0.3)?.label).toBe("Bonus haul");
    expect(rollSparBonusDrop(() => 0.5)).toBeUndefined();
    expect(rollSparBonusDrop(() => 0.99)).toBeUndefined();
  });
});

describe("grantSparRewards XP share", () => {
  beforeEach(() => {
    restoreQuestProgress(lockedProgress());
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot([], 1);
    setSparWinsBySpecies({}, false);
  });

  it("pins #267 spar-win rewards: +1 Dust, +1 material, +70 XP; player opens", () => {
    expect(SPAR_WIN_DUST_GAIN).toBe(1);
    expect(XP_PER_SPAR_WIN).toBe(70);
    expect(SPAR_WILD_OPENING_TURNS).toBe(0);

    const a = member({ instanceId: "a" });
    setPartyFromSnapshot([a], 4, ["a"]);
    const reward = grantSparRewards("mossling", 0, NO_BONUS);
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

    const reward = grantSparRewards("mossling", 0, NO_BONUS);
    expect(reward.xpGained).toBe(XP_PER_SPAR_WIN);
    expect(reward.xpShares).toHaveLength(2);
    expect(playerParty.creatures.find((x) => x.instanceId === "a")?.xp).toBe(35);
    expect(playerParty.creatures.find((x) => x.instanceId === "b")?.xp).toBe(35);
    expect(playerParty.creatures.find((x) => x.instanceId === "c")?.xp).toBe(0);
    expect(getSparWinsForSpecies("mossling")).toBe(1);
  });

  it("favors the active fighter over benched actives", () => {
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
    grantSparRewards("mossling", 1, NO_BONUS);
    expect(playerParty.creatures.map((x) => x.xp)).toEqual([18, 35, 17]);
  });

  it("levels a fighter to Lv5 in 3 wins with a 7-slot party, Lv10 in 12", () => {
    const creatures = Array.from({ length: 7 }, (_, i) =>
      member({ instanceId: `m${i}` }),
    );
    setPartyFromSnapshot(creatures, 7, creatures.map((c) => c.instanceId));
    const levelAfter = (wins: number) => {
      let xp = 0;
      for (let i = 0; i < wins; i++) xp += splitSparXp(XP_PER_SPAR_WIN, 7, 0)[0]!;
      return getLevelForXp(xp);
    };
    expect(levelAfter(2)).toBe(4);
    expect(levelAfter(3)).toBe(5);
    expect(levelAfter(11)).toBe(9);
    expect(levelAfter(12)).toBe(10);
  });

  it("applies bonus drops from the injected rng", () => {
    setPartyFromSnapshot([member({ instanceId: "a" })], 2, ["a"]);
    const rare = grantSparRewards("mossling", 0, () => 0);
    expect(rare.bonusDrop).toEqual({
      label: "Moonlit find",
      materialId: "folklore-dust",
      amount: 3,
    });
    expect(getMaterialCount("folklore-dust")).toBe(4);
    expect(formatRewardMessage(rare)).toContain("Moonlit find! +3 Folklore Dust.");

    const haul = grantSparRewards("mossling", 0, () => 0.3);
    expect(haul.bonusDrop?.materialId).toBe("moss-fiber");
    expect(getMaterialCount("moss-fiber")).toBe(3);

    const plain = grantSparRewards("mossling", 0, NO_BONUS);
    expect(plain.bonusDrop).toBeUndefined();
    expect(getMaterialCount("moss-fiber")).toBe(4);
  });

  it("does not record spar wins for sovereigns", () => {
    setPartyFromSnapshot([member({ instanceId: "a" })], 2, ["a"]);
    grantSparRewards("tide-sovereign", 0, NO_BONUS);
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
