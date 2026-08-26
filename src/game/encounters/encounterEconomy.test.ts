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

describe("encounterEconomy (#306 free verbs)", () => {
  beforeEach(() => {
    setInventoryFromSnapshot({}, {});
  });

  it("pins free Dust costs and wild-opening spar risk", () => {
    expect(FOLKLORE_DUST_ID).toBe("folklore-dust");
    expect(BEFRIEND_DUST_COST).toBe(0);
    expect(FLEE_DUST_COST).toBe(0);
    expect(SPAR_WILD_OPENING_TURNS).toBe(1);
    expect(XP_PER_SPAR_WIN).toBe(70);
  });

  it("shows odds / spar risk on labels without Dust costs", () => {
    expect(encounterBefriendButtonLabel("mossling")).toBe("Befriend 55%");
    expect(encounterBefriendButtonLabel(TIDE_SOVEREIGN_ID)).toBe(
      "Befriend 8%",
    );
    expect(encounterSparButtonLabel()).toBe("Spar · wild opens");
    expect(encounterFleeButtonLabel()).toBe("Flee");
  });

  it("always affords Befriend and Flee with no unaffordable reasons", () => {
    expect(canAffordBefriend(0)).toBe(true);
    expect(canAffordFlee(0)).toBe(true);
    expect(unaffordableBefriendReason()).toBe("");
    expect(unaffordableFleeReason()).toBe("");
    expect(encounterUnaffordableReasons(0)).toEqual([]);
  });

  it("pay helpers never consume Folklore Dust", () => {
    setInventoryFromSnapshot({ [FOLKLORE_DUST_ID]: 3 }, {});
    expect(payBefriendCost()).toBe(true);
    expect(payFleeCost()).toBe(true);
    expect(getMaterialCount(FOLKLORE_DUST_ID)).toBe(3);
    expect(getFolkloreDustCount()).toBe(3);
  });
});
