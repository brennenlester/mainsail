import { beforeEach, describe, expect, it } from "vitest";
import {
  beginConversation,
  claimNpcGift,
  confirmOddRest,
  getActiveSideQuestHint,
  getClaimedNpcGifts,
  getOddRestCost,
  getSideQuestStatus,
  getSideQuestStatuses,
  hasClaimedNpcGift,
  hasPurchasedOddRest,
  isSideQuestObjectiveMet,
  openConversation,
  ODD_REST_FIRST_COST,
  ODD_REST_REPEAT_COST,
  resetNpcStateForTest,
  setClaimedNpcGifts,
  setOddRestPurchased,
  setSideQuestStatuses,
  tryConsumeDelivery,
} from "./npcState";
import { ALL_NPC_IDS, getNpcById, getZoneNpcs, NPCS } from "./npcs";
import { SIDE_QUESTS } from "./sideQuests";
import {
  getItemCount,
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { getEffectiveMaxHp, playerParty, setPartyFromSnapshot } from "../creatures/party";
import { setDiscoveredCreatures, setVillageGateUnlocked, worldState } from "./worldState";
import { setVisitorMode } from "./worldSession";
import { ZONES } from "./zones";
import { TileType, type ZoneId } from "./zoneTypes";

const BRYN = getNpcById("warden-bryn")!;
const SABLE = getNpcById("weaver-sable")!;
const ODD = getNpcById("hearthkeep-odd")!;

beforeEach(() => {
  resetNpcStateForTest();
  setInventoryFromSnapshot({}, {});
  setDiscoveredCreatures([]);
  setPartyFromSnapshot([], 1);
  setVisitorMode(false);
  setVillageGateUnlocked(false, false);
});

describe("npc placement", () => {
  it("puts every NPC on a walkable tile of its own zone", () => {
    for (const [zoneId, npcs] of Object.entries(NPCS)) {
      const zone = ZONES[zoneId as ZoneId];
      for (const npc of npcs ?? []) {
        expect(zone.tiles[npc.y][npc.x]).toBe(TileType.Floor);
      }
    }
  });

  it("keeps NPCs indoors only", () => {
    expect(getZoneNpcs("village")).toEqual([]);
    expect(getZoneNpcs("grove")).toEqual([]);
  });

  it("uses unique NPC ids", () => {
    expect(new Set(ALL_NPC_IDS).size).toBe(ALL_NPC_IDS.length);
  });
});

describe("claimNpcGift", () => {
  it("grants a material gift once", () => {
    expect(claimNpcGift(BRYN)).toContain("Wild Fiber×3");
    expect(getMaterialCount("wild-fiber")).toBe(3);
    expect(hasClaimedNpcGift(BRYN.id)).toBe(true);
  });

  it("grants an item gift once", () => {
    expect(claimNpcGift(ODD)).toContain("Brook Tonic×1");
    expect(getItemCount("brook-tonic")).toBe(1);
  });

  it("cannot be farmed by talking again", () => {
    claimNpcGift(BRYN);
    expect(claimNpcGift(BRYN)).toBeNull();
    expect(getMaterialCount("wild-fiber")).toBe(3);
  });

  it("does not re-grant after the claim is restored from a save", () => {
    setClaimedNpcGifts([BRYN.id]);
    expect(claimNpcGift(BRYN)).toBeNull();
    expect(getMaterialCount("wild-fiber")).toBe(0);
  });

  it("never gives a visitor anything", () => {
    setVisitorMode(true);
    expect(claimNpcGift(BRYN)).toBeNull();
    expect(getMaterialCount("wild-fiber")).toBe(0);
    expect(hasClaimedNpcGift(BRYN.id)).toBe(false);
  });
});

describe("openConversation gifts then side quests", () => {
  it("opens with the intro and the gift on a first visit", () => {
    const lines = openConversation(BRYN);
    expect(lines.slice(0, BRYN.introLines.length)).toEqual(BRYN.introLines);
    expect(lines.at(-1)).toContain("Wild Fiber×3");
    expect(getMaterialCount("wild-fiber")).toBe(3);
  });

  it("offers the side quest on the next visit after the gift", () => {
    openConversation(BRYN);
    const offer = openConversation(BRYN);
    expect(offer).toEqual(SIDE_QUESTS["bryn-ledger"].offerLines);
    expect(getSideQuestStatus("bryn-ledger")).toBe("active");
    expect(getActiveSideQuestHint()).toBe("Village ask: Fill the ledger");
  });

  it("nudges progress while the objective is unmet", () => {
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN); // offer
    expect(openConversation(BRYN)).toEqual([
      SIDE_QUESTS["bryn-ledger"].progressLine,
    ]);
  });

  it("turns in and rewards once the objective is met", () => {
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN);
    setDiscoveredCreatures(["a", "b", "c", "d", "e"]);
    const lines = openConversation(BRYN);
    expect(lines.at(0)).toContain("Five names");
    expect(lines.at(-1)).toContain("Brook Tonic×2");
    expect(getItemCount("brook-tonic")).toBe(2);
    expect(getSideQuestStatus("bryn-ledger")).toBe("complete");
    expect(openConversation(BRYN)).toEqual([
      SIDE_QUESTS["bryn-ledger"].completeLine,
    ]);
    expect(getItemCount("brook-tonic")).toBe(2);
  });

  it("hints at codex gaps without naming the achievement", () => {
    const chatter = Object.values(NPCS)
      .flatMap((npcs) => npcs ?? [])
      .flatMap((npc) => [...npc.introLines, ...npc.idleLines])
      .join(" ");
    expect(chatter).toMatch(/blank pages|gaps/i);
    expect(chatter).not.toMatch(/Codex Keeper|achievement/i);
  });
});

describe("delivery side quest", () => {
  const quest = SIDE_QUESTS["sable-thread"];

  it("does not consume materials until every stack is ready", () => {
    setInventoryFromSnapshot({ wood: 5, "wild-fiber": 2 }, {});
    expect(isSideQuestObjectiveMet(quest)).toBe(false);
    expect(tryConsumeDelivery(quest)).toBe(false);
    expect(getMaterialCount("wood")).toBe(5);
    expect(getMaterialCount("wild-fiber")).toBe(2);
  });

  it("consumes materials exactly once on turn-in", () => {
    setClaimedNpcGifts([SABLE.id]);
    openConversation(SABLE);
    setInventoryFromSnapshot({ wood: 5, "wild-fiber": 3 }, {});
    const lines = openConversation(SABLE);
    expect(lines.at(-1)).toContain("Brook Tonic×2");
    expect(getMaterialCount("wood")).toBe(0);
    expect(getMaterialCount("wild-fiber")).toBe(0);
    expect(getSideQuestStatus("sable-thread")).toBe("complete");
    expect(openConversation(SABLE).at(-1)).not.toContain("Reward");
  });
});

describe("party-size side quest", () => {
  it("turns in when the party has three companions", () => {
    setClaimedNpcGifts([ODD.id]);
    openConversation(ODD);
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
        {
          instanceId: "2",
          definitionId: "ember-wisp",
          speciesId: "ember-wisp",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
        {
          instanceId: "3",
          definitionId: "brook-nymph",
          speciesId: "brook-nymph",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      4,
    );
    const lines = openConversation(ODD);
    expect(lines.at(-1)).toContain("Moonwake Draught×1");
    expect(getItemCount("moonwake-draught")).toBe(1);
    expect(getSideQuestStatus("odd-company")).toBe("complete");
    const restTalk = beginConversation(ODD);
    expect(restTalk.prompt).toEqual({ kind: "advance" });
    expect(restTalk.lines[0]).toContain("Wood ×20");
    expect(getItemCount("moonwake-draught")).toBe(1);
  });
});

describe("visitor side-quest lockout", () => {
  it("never offers, progresses, or turns in for visitors", () => {
    setClaimedNpcGifts([BRYN.id]);
    setVisitorMode(true);
    const lines = openConversation(BRYN);
    expect(lines).toEqual([BRYN.idleLines[0]]);
    expect(getSideQuestStatus("bryn-ledger")).toBe("locked");
  });

  it("leaves an already-active host quest untouched when a visitor talks", () => {
    setClaimedNpcGifts([BRYN.id]);
    setSideQuestStatuses({ "bryn-ledger": "active" });
    setDiscoveredCreatures(["a", "b", "c", "d", "e"]);
    setVisitorMode(true);
    expect(openConversation(BRYN)).toEqual([BRYN.idleLines[0]]);
    expect(getSideQuestStatus("bryn-ledger")).toBe("active");
    expect(getItemCount("brook-tonic")).toBe(0);
  });
});

describe("claim and side-quest persistence", () => {
  it("round-trips known gift ids and drops unknown ones", () => {
    setClaimedNpcGifts([BRYN.id, "not-a-villager"]);
    expect(getClaimedNpcGifts()).toEqual([BRYN.id]);
  });

  it("round-trips side-quest statuses and drops unknown ids", () => {
    setSideQuestStatuses({
      "bryn-ledger": "active",
      "not-a-quest": "complete",
      "sable-thread": "complete",
    });
    expect(getSideQuestStatuses()).toEqual({
      "bryn-ledger": "active",
      "sable-thread": "complete",
      "odd-company": "locked",
    });
  });
});

describe("Odd paid rest", () => {
  const restMaterials = {
    wood: 40,
    "wild-fiber": 40,
    pebble: 40,
  };

  function injuredCompanions() {
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
        {
          instanceId: "2",
          definitionId: "ember-wisp",
          speciesId: "ember-wisp",
          currentHp: 0,
          level: 1,
          xp: 0,
        },
      ],
      3,
    );
  }

  function unlockOddRest() {
    setClaimedNpcGifts([ODD.id]);
    setSideQuestStatuses({ "odd-company": "complete" });
    injuredCompanions();
  }

  it("does not offer rest before the side quest is complete", () => {
    setClaimedNpcGifts([ODD.id]);
    setInventoryFromSnapshot(restMaterials, {});
    injuredCompanions();
    const offer = beginConversation(ODD);
    expect(offer.prompt).toEqual({ kind: "advance" });
    expect(offer.lines).toEqual(SIDE_QUESTS["odd-company"].offerLines);
    expect(beginConversation(ODD).lines).toEqual([
      SIDE_QUESTS["odd-company"].progressLine,
    ]);
  });

  it("offers a confirmable first rest after the quest for 20 of each material", () => {
    unlockOddRest();
    setInventoryFromSnapshot(restMaterials, {});
    const talk = beginConversation(ODD);
    expect(talk.prompt).toEqual({ kind: "confirm-rest" });
    expect(talk.lines[0]).toContain("Wood ×20");
    expect(talk.lines[0]).toContain("Wild Fiber ×20");
    expect(talk.lines[0]).toContain("Pebble ×20");
    expect(getMaterialCount("wood")).toBe(40);
  });

  it("heals the whole party including fainted members on confirm", () => {
    unlockOddRest();
    setInventoryFromSnapshot(restMaterials, {});
    beginConversation(ODD);
    const lines = confirmOddRest();
    expect(lines[0]).toMatch(/whole again/i);
    expect(getMaterialCount("wood")).toBe(20);
    expect(getMaterialCount("wild-fiber")).toBe(20);
    expect(getMaterialCount("pebble")).toBe(20);
    expect(hasPurchasedOddRest()).toBe(true);
    expect(getOddRestCost()).toBe(ODD_REST_REPEAT_COST);
    expect(playerParty.creatures[0]!.currentHp).toBe(
      getEffectiveMaxHp(playerParty.creatures[0]!),
    );
    expect(playerParty.creatures[1]!.currentHp).toBe(
      getEffectiveMaxHp(playerParty.creatures[1]!),
    );
    expect(playerParty.creatures[0]!.currentHp).toBeGreaterThan(10);
    expect(playerParty.creatures[1]!.currentHp).toBeGreaterThan(0);
  });

  it("charges 5 of each after the first rest", () => {
    unlockOddRest();
    setInventoryFromSnapshot(restMaterials, {});
    confirmOddRest();
    injuredCompanions();
    const talk = beginConversation(ODD);
    expect(talk.prompt).toEqual({ kind: "confirm-rest" });
    expect(talk.lines[0]).toContain("Wood ×5");
    confirmOddRest();
    expect(getMaterialCount("wood")).toBe(15);
    expect(getMaterialCount("wild-fiber")).toBe(15);
    expect(getMaterialCount("pebble")).toBe(15);
  });

  it("keeps the cheaper price after the first-rest flag is restored", () => {
    setOddRestPurchased(true);
    unlockOddRest();
    setInventoryFromSnapshot(
      { wood: 5, "wild-fiber": 5, pebble: 5 },
      {},
    );
    expect(getOddRestCost()).toBe(ODD_REST_REPEAT_COST);
    expect(beginConversation(ODD).lines[0]).toContain("Wood ×5");
    confirmOddRest();
    expect(getMaterialCount("wood")).toBe(0);
  });

  it("does not consume or flag when materials are short", () => {
    unlockOddRest();
    setInventoryFromSnapshot(
      { wood: 19, "wild-fiber": 20, pebble: 20 },
      {},
    );
    const talk = beginConversation(ODD);
    expect(talk.prompt).toEqual({ kind: "advance" });
    expect(talk.lines[0]).toContain("Wood ×20");
    expect(confirmOddRest()[0]).toContain("Wood ×20");
    expect(getMaterialCount("wood")).toBe(19);
    expect(hasPurchasedOddRest()).toBe(false);
  });

  it("does not charge a full or empty party", () => {
    setClaimedNpcGifts([ODD.id]);
    setSideQuestStatuses({ "odd-company": "complete" });
    setInventoryFromSnapshot(restMaterials, {});
    expect(beginConversation(ODD).prompt).toEqual({ kind: "advance" });
    expect(confirmOddRest()[0]).toMatch(/already warm/i);
    expect(getMaterialCount("wood")).toBe(40);
    expect(hasPurchasedOddRest()).toBe(false);

    injuredCompanions();
    const maxHp = getEffectiveMaxHp(playerParty.creatures[0]!);
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: maxHp,
          level: 1,
          xp: 0,
        },
      ],
      2,
    );
    expect(beginConversation(ODD).prompt).toEqual({ kind: "advance" });
    confirmOddRest();
    expect(getMaterialCount("wood")).toBe(40);
    expect(hasPurchasedOddRest()).toBe(false);
  });

  it("never offers rest to a visitor", () => {
    unlockOddRest();
    setInventoryFromSnapshot(restMaterials, {});
    setVisitorMode(true);
    const talk = beginConversation(ODD);
    expect(talk.prompt).toEqual({ kind: "advance" });
    expect(talk.lines).toEqual([ODD.idleLines[0]]);
    confirmOddRest();
    expect(getMaterialCount("wood")).toBe(40);
    expect(hasPurchasedOddRest()).toBe(false);
  });

  it("does not consume if the player never confirms", () => {
    unlockOddRest();
    setInventoryFromSnapshot(restMaterials, {});
    beginConversation(ODD);
    expect(getMaterialCount("wood")).toBe(40);
    expect(hasPurchasedOddRest()).toBe(false);
    expect(ODD_REST_FIRST_COST).toBe(20);
  });
});

describe("Bryn Grove starter gift (#349)", () => {
  function onlyMossling() {
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      2,
    );
  }

  it("does not gift before the village gate opens", () => {
    onlyMossling();
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN);
    expect(playerParty.creatures.map((c) => c.definitionId)).toEqual(["mossling"]);
  });

  it("gifts Ember Wisp when Mossling is the only Grove line", () => {
    setVillageGateUnlocked(true, false);
    onlyMossling();
    setClaimedNpcGifts([BRYN.id]);
    const lines = openConversation(BRYN);
    expect(lines.join(" ")).toMatch(/Ember Wisp/);
    expect(playerParty.creatures.map((c) => c.definitionId).sort()).toEqual([
      "ember-wisp",
      "mossling",
    ]);
    expect(playerParty.creatures.find((c) => c.definitionId === "ember-wisp")?.level).toBe(
      1,
    );
  });

  it("gifts Mossling when Ember Wisp is the only Grove line", () => {
    setVillageGateUnlocked(true, false);
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "ember-wisp",
          speciesId: "ember-wisp",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      2,
    );
    setClaimedNpcGifts([BRYN.id]);
    const lines = openConversation(BRYN);
    expect(lines.join(" ")).toMatch(/Mossling/);
    expect(playerParty.creatures.some((c) => c.definitionId === "mossling")).toBe(
      true,
    );
  });

  it("gifts one starter per talk when both Grove lines are missing", () => {
    setVillageGateUnlocked(true, false);
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN);
    expect(playerParty.creatures.map((c) => c.definitionId)).toEqual(["mossling"]);
    openConversation(BRYN);
    expect(playerParty.creatures.map((c) => c.definitionId).sort()).toEqual([
      "ember-wisp",
      "mossling",
    ]);
    const third = openConversation(BRYN);
    expect(third.join(" ")).not.toMatch(/Take this/);
    expect(playerParty.creatures).toHaveLength(2);
  });

  it("does not gift when both Grove lines are already present", () => {
    setVillageGateUnlocked(true, false);
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
        {
          instanceId: "2",
          definitionId: "ember-wisp",
          speciesId: "ember-wisp",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      3,
    );
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN);
    expect(playerParty.creatures).toHaveLength(2);
  });

  it("counts evolved forms as having that Grove line", () => {
    setVillageGateUnlocked(true, false);
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "bramblewarden",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      2,
    );
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN);
    expect(playerParty.creatures.map((c) => c.definitionId).sort()).toEqual([
      "bramblewarden",
      "ember-wisp",
    ]);
    expect(playerParty.creatures.some((c) => c.definitionId === "mossling")).toBe(
      false,
    );
  });

  it("never gifts a visitor", () => {
    setVillageGateUnlocked(true, false);
    setVisitorMode(true);
    openConversation(BRYN);
    expect(playerParty.creatures).toHaveLength(0);
  });

  it("does not re-gift after save restore", () => {
    setVillageGateUnlocked(true, false);
    onlyMossling();
    setClaimedNpcGifts([BRYN.id]);
    openConversation(BRYN);
    expect(worldState.brynGroveStartersGifted).toEqual(["ember-wisp"]);
    setPartyFromSnapshot(
      [
        {
          instanceId: "1",
          definitionId: "mossling",
          speciesId: "mossling",
          currentHp: 10,
          level: 1,
          xp: 0,
        },
      ],
      2,
    );
    openConversation(BRYN);
    expect(playerParty.creatures.map((c) => c.definitionId)).toEqual(["mossling"]);
  });
});
