import { beforeEach, describe, expect, it } from "vitest";
import {
  BEFRIEND_DUST_COST,
  canAffordBefriend,
  canAffordFlee,
  encounterBefriendButtonLabel,
  encounterFleeButtonLabel,
  encounterSparButtonLabel,
  encounterUnaffordableReasons,
  FLEE_DUST_COST,
  FOLKLORE_DUST_ID,
  getFolkloreDustCount,
  payBefriendCost,
  payFleeCost,
  SPAR_WILD_OPENING_TURNS,
  unaffordableBefriendReason,
  unaffordableFleeReason,
} from "./encounterEconomy";
import { TIDE_SOVEREIGN_ID } from "./godSail";
import {
  getMaterialCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { XP_PER_SPAR_WIN } from "../progression/leveling";

describe("encounterEconomy (#267 pinned costs)", () => {
  beforeEach(() => {
    setInventoryFromSnapshot({}, {});
  });

  it("pins Dust costs and wild-opening spar risk from #266", () => {
    expect(FOLKLORE_DUST_ID).toBe("folklore-dust");
    expect(BEFRIEND_DUST_COST).toBe(2);
    expect(FLEE_DUST_COST).toBe(1);
    expect(SPAR_WILD_OPENING_TURNS).toBe(1);
    expect(XP_PER_SPAR_WIN).toBe(70);
  });

  it("shows costs and spar risk on labels before commit", () => {
    expect(encounterBefriendButtonLabel("mossling")).toBe("Befriend 55% · 2 Dust");
    expect(encounterBefriendButtonLabel(TIDE_SOVEREIGN_ID)).toBe(
      "Befriend 8% · 2 Dust",
    );
    expect(encounterSparButtonLabel()).toBe("Spar · wild opens");
    expect(encounterFleeButtonLabel()).toBe("Flee · 1 Dust");
  });

  it("refuses unaffordable Befriend and Flee with a reason", () => {
    expect(canAffordBefriend(0)).toBe(false);
    expect(canAffordBefriend(1)).toBe(false);
    expect(canAffordBefriend(2)).toBe(true);
    expect(canAffordFlee(0)).toBe(false);
    expect(canAffordFlee(1)).toBe(true);

    expect(unaffordableBefriendReason()).toBe(
      "Need 2 Folklore Dust to Befriend",
    );
    expect(unaffordableFleeReason()).toBe("Need 1 Folklore Dust to Flee");
    expect(encounterUnaffordableReasons(0)).toEqual([
      "Need 2 Folklore Dust to Befriend",
      "Need 1 Folklore Dust to Flee",
    ]);
    expect(encounterUnaffordableReasons(1)).toEqual([
      "Need 2 Folklore Dust to Befriend",
    ]);
    expect(encounterUnaffordableReasons(2)).toEqual([]);
  });

  it("applies Befriend Dust cost on pay (attempt, not only success)", () => {
    setInventoryFromSnapshot({ [FOLKLORE_DUST_ID]: 3 }, {});
    expect(payBefriendCost()).toBe(true);
    expect(getMaterialCount(FOLKLORE_DUST_ID)).toBe(1);
    expect(getFolkloreDustCount()).toBe(1);
    expect(payBefriendCost()).toBe(false);
    expect(getMaterialCount(FOLKLORE_DUST_ID)).toBe(1);
  });

  it("applies Flee Dust cost on pay", () => {
    setInventoryFromSnapshot({ [FOLKLORE_DUST_ID]: 1 }, {});
    expect(payFleeCost()).toBe(true);
    expect(getMaterialCount(FOLKLORE_DUST_ID)).toBe(0);
    expect(payFleeCost()).toBe(false);
  });

  it("after exactly-2 Dust Befriend spend, Flee becomes unaffordable with reason", () => {
    setInventoryFromSnapshot({ [FOLKLORE_DUST_ID]: 2 }, {});
    expect(canAffordFlee()).toBe(true);
    expect(payBefriendCost()).toBe(true);
    expect(getFolkloreDustCount()).toBe(0);
    expect(canAffordFlee()).toBe(false);
    expect(encounterUnaffordableReasons()).toEqual([
      "Need 2 Folklore Dust to Befriend",
      "Need 1 Folklore Dust to Flee",
    ]);
  });
});
