import { beforeEach, describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import {
  addToParty,
  hasCreature,
  playerParty,
  setPartyFromSnapshot,
} from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import {
  getItemCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { LEVEL_XP_THRESHOLDS } from "../progression/leveling";
import { applyShrineFusion } from "./fusion";
import {
  applyEclipseFusion,
  applyGodFusion,
  ECLIPSE_SOVEREIGN_ID,
  HORIZON_SOVEREIGN_ID,
  reopenParentSovereignEncounters,
  SOVEREIGN_SEAL_ID,
} from "./godFusion";
import { CAIRN_SOVEREIGN_ID } from "../encounters/godLand";
import { TIDE_SOVEREIGN_ID } from "../encounters/godSail";
import { setVisitorMode } from "../world/worldSession";
import {
  getHorizonFusionCount,
  isEclipseFusionCompleted,
  isGodFusionCompleted,
  isGodLandEncounterClaimed,
  isGodSailEncounterClaimed,
  setCairnSovereignObtained,
  setEclipseFusionCompleted,
  setGodFusionCompleted,
  setGodLandEncounterClaimed,
  setGodSailEncounterClaimed,
  setHorizonFusionCount,
  setTideSovereignObtained,
} from "../world/worldState";

function member(
  overrides: Partial<CreatureInstance> &
    Pick<CreatureInstance, "instanceId" | "definitionId">,
): CreatureInstance {
  return {
    speciesId: overrides.definitionId,
    currentHp: 10,
    level: 1,
    xp: 0,
    ...overrides,
  };
}

describe("dual-god fusion", () => {
  beforeEach(() => {
    setPartyFromSnapshot([], 1);
    setInventoryFromSnapshot({}, {});
    setVisitorMode(false);
    setGodFusionCompleted(false, false);
    setEclipseFusionCompleted(false, false);
    setHorizonFusionCount(0, false);
    setGodSailEncounterClaimed(false, false);
    setGodLandEncounterClaimed(false, false);
    setTideSovereignObtained(0, false);
    setCairnSovereignObtained(0, false);
  });

  it("refuses visitors, missing Sovereign Seal, missing gods, and the wrong item", () => {
    setPartyFromSnapshot(
      [
        member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID, level: 40 }),
        member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID, level: 30 }),
      ],
      3,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });

    setVisitorMode(true);
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID).ok).toBe(false);
    setVisitorMode(false);

    expect(applyGodFusion("t", "c", "ember-charm").ok).toBe(false);
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID).ok).toBe(true);

    setGodFusionCompleted(false, false);
    setInventoryFromSnapshot({}, {});
    setPartyFromSnapshot(
      [
        member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID }),
        member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID }),
      ],
      3,
    );
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID).message).toBe(
      "You need a Sovereign Seal.",
    );

    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
    setPartyFromSnapshot(
      [member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID })],
      2,
    );
    expect(applyGodFusion("t", "missing", SOVEREIGN_SEAL_ID).message).toMatch(
      /Requires Tide Sovereign and Stone Sovereign/,
    );
  });

  it("allows a second Horizon fusion after the first and unclaims parent hunts", () => {
    setGodSailEncounterClaimed(true, false);
    setGodLandEncounterClaimed(true, false);
    setPartyFromSnapshot(
      [
        member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID }),
        member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID }),
      ],
      3,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID).ok).toBe(true);
    expect(getHorizonFusionCount()).toBe(1);
    expect(isGodSailEncounterClaimed()).toBe(false);
    expect(isGodLandEncounterClaimed()).toBe(false);

    setPartyFromSnapshot(
      [
        member({ instanceId: "h1", definitionId: HORIZON_SOVEREIGN_ID, level: 40 }),
        member({ instanceId: "t2", definitionId: TIDE_SOVEREIGN_ID, level: 20 }),
        member({ instanceId: "c2", definitionId: CAIRN_SOVEREIGN_ID, level: 33 }),
      ],
      6,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
    setGodSailEncounterClaimed(true, false);
    setGodLandEncounterClaimed(true, false);
    expect(applyGodFusion("t2", "c2", SOVEREIGN_SEAL_ID).ok).toBe(true);
    expect(getHorizonFusionCount()).toBe(2);
    expect(
      playerParty.creatures.filter((c) => c.definitionId === HORIZON_SOVEREIGN_ID),
    ).toHaveLength(2);
    expect(isGodSailEncounterClaimed()).toBe(true);
    expect(isGodLandEncounterClaimed()).toBe(true);
  });

  it("refuses a third Horizon fusion", () => {
    setHorizonFusionCount(2, false);
    setPartyFromSnapshot(
      [
        member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID }),
        member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID }),
      ],
      3,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID)).toEqual({
      ok: false,
      message: "Fuse the two Horizon Sovereigns instead.",
    });
    expect(getItemCount(SOVEREIGN_SEAL_ID)).toBe(1);
  });

  it("refuses Horizon fusion when two Horizons are already in the party", () => {
    setHorizonFusionCount(1, false);
    setPartyFromSnapshot(
      [
        member({ instanceId: "h1", definitionId: HORIZON_SOVEREIGN_ID }),
        member({ instanceId: "h2", definitionId: HORIZON_SOVEREIGN_ID }),
        member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID }),
        member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID }),
      ],
      5,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID)).toEqual({
      ok: false,
      message: "Fuse the two Horizon Sovereigns instead.",
    });
  });

  it("does not reopen parent hunts after two of that parent have been obtained", () => {
    setHorizonFusionCount(1, false);
    setTideSovereignObtained(2, false);
    setCairnSovereignObtained(2, false);
    setGodSailEncounterClaimed(true, false);
    setGodLandEncounterClaimed(true, false);
    reopenParentSovereignEncounters();
    expect(isGodSailEncounterClaimed()).toBe(true);
    expect(isGodLandEncounterClaimed()).toBe(true);
  });

  it("consumes both parents and the Sovereign Seal, then adds Horizon Sovereign", () => {
    setPartyFromSnapshot(
      [
        member({
          instanceId: "t",
          definitionId: TIDE_SOVEREIGN_ID,
          level: 40,
          currentHp: 0,
        }),
        member({
          instanceId: "c",
          definitionId: CAIRN_SOVEREIGN_ID,
          level: 47,
          currentHp: 0,
        }),
      ],
      3,
    );
    setInventoryFromSnapshot(
      {},
      { [SOVEREIGN_SEAL_ID]: 1, "tide-cleaver": 1, "cairn-maul": 1 },
    );

    const result = applyGodFusion("t", "c", SOVEREIGN_SEAL_ID);
    expect(result).toEqual({
      ok: true,
      message:
        "Tide Sovereign and Stone Sovereign fused into Horizon Sovereign!",
    });
    expect(hasCreature(TIDE_SOVEREIGN_ID)).toBe(false);
    expect(hasCreature(CAIRN_SOVEREIGN_ID)).toBe(false);
    expect(hasCreature(HORIZON_SOVEREIGN_ID)).toBe(true);
    expect(getItemCount(SOVEREIGN_SEAL_ID)).toBe(0);
    expect(getItemCount("tide-cleaver")).toBe(1);
    expect(getItemCount("cairn-maul")).toBe(1);
    expect(isGodFusionCompleted()).toBe(true);

    const fused = playerParty.creatures[0];
    expect(fused).toMatchObject({
      definitionId: HORIZON_SOVEREIGN_ID,
      level: 47,
      xp: LEVEL_XP_THRESHOLDS[47],
    });
    expect(fused?.currentHp).toBe(
      Math.floor(
        getCreatureDefinition(HORIZON_SOVEREIGN_ID).maxHp *
          (1 + (47 - 1) * (2.25 / 49)),
      ),
    );
    expect(fused?.attackBonus).toBeUndefined();
    expect(fused?.hpBonus).toBeUndefined();
    expect(fused?.appliedEffects).toBeUndefined();
    expect(getCreatureDefinition(HORIZON_SOVEREIGN_ID).excludeFromCodex).toBe(
      true,
    );
  });

  it("carries the rare variant through fusion when either parent is rare (#368)", () => {
    const fuse = (tideRare: boolean): boolean | undefined => {
      setPartyFromSnapshot(
        [
          member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID, ...(tideRare ? { rare: true as const } : {}) }),
          member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID }),
        ],
        3,
      );
      setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
      setGodFusionCompleted(false, false);
      setHorizonFusionCount(0, false);
      expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID).ok).toBe(true);
      return playerParty.creatures[0]?.rare;
    };
    expect(fuse(true)).toBe(true);
    expect(fuse(false)).toBeUndefined();
  });

  it("fuses two Horizons into Eclipse Sovereign", () => {
    setHorizonFusionCount(2, false);
    setPartyFromSnapshot(
      [
        member({
          instanceId: "h1",
          definitionId: HORIZON_SOVEREIGN_ID,
          level: 41,
        }),
        member({
          instanceId: "h2",
          definitionId: HORIZON_SOVEREIGN_ID,
          level: 48,
        }),
      ],
      4,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });

    const result = applyEclipseFusion("h1", "h2", SOVEREIGN_SEAL_ID);
    expect(result).toEqual({
      ok: true,
      message: "Horizon Sovereigns fused into Eclipse Sovereign!",
    });
    expect(hasCreature(HORIZON_SOVEREIGN_ID)).toBe(false);
    expect(hasCreature(ECLIPSE_SOVEREIGN_ID)).toBe(true);
    expect(getItemCount(SOVEREIGN_SEAL_ID)).toBe(0);
    expect(isEclipseFusionCompleted()).toBe(true);

    const fused = playerParty.creatures[0];
    expect(fused).toMatchObject({
      definitionId: ECLIPSE_SOVEREIGN_ID,
      level: 48,
      xp: LEVEL_XP_THRESHOLDS[48],
    });
    expect(fused?.currentHp).toBe(
      Math.floor(
        getCreatureDefinition(ECLIPSE_SOVEREIGN_ID).maxHp *
          (1 + (48 - 1) * (2.25 / 49)),
      ),
    );
    expect(getCreatureDefinition(ECLIPSE_SOVEREIGN_ID)).toMatchObject({
      folkloreType: "mist",
      maxHp: 144,
      attack: 24,
      defense: 22,
      excludeFromCodex: true,
    });
  });

  it("refuses Eclipse fusion for visitors, missing seal, same instance, and a second Eclipse", () => {
    setPartyFromSnapshot(
      [
        member({ instanceId: "h1", definitionId: HORIZON_SOVEREIGN_ID }),
        member({ instanceId: "h2", definitionId: HORIZON_SOVEREIGN_ID }),
      ],
      4,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });

    setVisitorMode(true);
    expect(applyEclipseFusion("h1", "h2", SOVEREIGN_SEAL_ID).ok).toBe(false);
    setVisitorMode(false);

    expect(applyEclipseFusion("h1", "h1", SOVEREIGN_SEAL_ID).message).toMatch(
      /Requires two Horizon Sovereigns/,
    );

    setEclipseFusionCompleted(true, false);
    expect(applyEclipseFusion("h1", "h2", SOVEREIGN_SEAL_ID)).toEqual({
      ok: false,
      message: "Eclipse Sovereign has already been fused.",
    });
    expect(getItemCount(SOVEREIGN_SEAL_ID)).toBe(1);

    setEclipseFusionCompleted(false, false);
    setInventoryFromSnapshot({}, {});
    expect(applyEclipseFusion("h1", "h2", SOVEREIGN_SEAL_ID).message).toBe(
      "You need a Sovereign Seal.",
    );
    expect(applyEclipseFusion("h1", "h2", "tide-crown").message).toBe(
      "That item cannot fuse the sovereigns.",
    );
  });

  it("treats a legacy Horizon-complete flag as one fusion, not Eclipse", () => {
    setGodFusionCompleted(true, false);
    expect(getHorizonFusionCount()).toBe(1);
    expect(isEclipseFusionCompleted()).toBe(false);
    setPartyFromSnapshot(
      [
        member({ instanceId: "t", definitionId: TIDE_SOVEREIGN_ID }),
        member({ instanceId: "c", definitionId: CAIRN_SOVEREIGN_ID }),
      ],
      3,
    );
    setInventoryFromSnapshot({}, { [SOVEREIGN_SEAL_ID]: 1 });
    expect(applyGodFusion("t", "c", SOVEREIGN_SEAL_ID).ok).toBe(true);
    expect(getHorizonFusionCount()).toBe(2);
  });

  it("leaves ember-charm fusion working", () => {
    addToParty("mossling");
    const mossling = playerParty.creatures[0]!;
    mossling.level = 3;
    setInventoryFromSnapshot({}, { "ember-charm": 1 });
    const result = applyShrineFusion(mossling.instanceId, "ember-charm");
    expect(result.ok).toBe(true);
    expect(mossling.secondaryMove?.id).toBe("ember-lash");
  });
});
