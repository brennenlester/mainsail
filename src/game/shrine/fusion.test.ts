import { beforeEach, describe, expect, it } from "vitest";
import { getCreatureDefinition } from "../creatures/catalog";
import { playerParty, setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import {
  getItemCount,
  setInventoryFromSnapshot,
} from "../inventory/playerInventory";
import { LEVEL_XP_THRESHOLDS } from "../progression/leveling";
import {
  applyWorldSnapshot,
  exportWorldSnapshot,
  type WorldSnapshot,
} from "../world/worldSnapshot";
import { setVisitorMode } from "../world/worldSession";
import {
  createEmptyQuestProgress,
  getActiveQuestId,
  restoreQuestProgress,
} from "../story/questProgress";
import { applyShrineFusion } from "./fusion";
import { effectKey } from "./shrineEffects";
import {
  hasPresenceGrowth,
  migrateLegacyPresenceCharmBuffs,
  PRESENCE_ATTACK_BONUS,
  PRESENCE_HP_BONUS,
  presenceShinyColor,
  presenceTintForCreature,
  selectOverworldFollowers,
} from "./presence";

function member(
  overrides: Partial<CreatureInstance> &
    Pick<CreatureInstance, "instanceId" | "definitionId">,
): CreatureInstance {
  return {
    speciesId: overrides.definitionId,
    currentHp: 28,
    level: 5,
    xp: LEVEL_XP_THRESHOLDS[5],
    ...overrides,
  };
}

describe("Growth unlock fusion (#296)", () => {
  beforeEach(() => {
    setPartyFromSnapshot([], 1);
    setInventoryFromSnapshot({}, {});
    setVisitorMode(false);
  });

  it("evolves mossling with moss-salve and persists through save round-trip", () => {
    const mossling = member({ instanceId: "c-m", definitionId: "mossling" });
    setPartyFromSnapshot([mossling], 1);
    setInventoryFromSnapshot({}, { "moss-salve": 1 });

    expect(applyShrineFusion(mossling.instanceId, "moss-salve")).toEqual({
      ok: true,
      message: "Mossling evolved into Bramblewarden!",
    });
    const evolved = playerParty.creatures.find(
      (c) => c.instanceId === mossling.instanceId,
    )!;
    expect(evolved.definitionId).toBe("bramblewarden");
    expect(evolved.appliedEffects).toContain(
      effectKey("mossling", "moss-salve"),
    );

    const snapshot = exportWorldSnapshot({ zoneId: "grove", x: 3, y: 7 });
    setPartyFromSnapshot([], 1);
    applyWorldSnapshot(snapshot);
    const restored = playerParty.creatures.find(
      (c) => c.instanceId === mossling.instanceId,
    );
    expect(restored?.definitionId).toBe("bramblewarden");
    expect(restored?.appliedEffects).toContain(
      effectKey("mossling", "moss-salve"),
    );
  });

  it("advances evolve-bramblewarden when mossling evolves (#317)", () => {
    restoreQuestProgress({
      ...createEmptyQuestProgress(),
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "active",
    });
    const mossling = member({ instanceId: "c-m", definitionId: "mossling" });
    setPartyFromSnapshot([mossling], 1);
    setInventoryFromSnapshot({}, { "moss-salve": 1 });

    expect(applyShrineFusion(mossling.instanceId, "moss-salve").ok).toBe(true);
    expect(getActiveQuestId()).toBe("evolve-hearthflame");
  });

  it("applies presence to lantern-fox and round-trips appliedEffects", () => {
    const fox = member({ instanceId: "c-f", definitionId: "lantern-fox" });
    setPartyFromSnapshot([fox], 1);
    setInventoryFromSnapshot({}, { "fox-fire-charm": 1 });

    expect(applyShrineFusion(fox.instanceId, "fox-fire-charm")).toEqual({
      ok: true,
      message:
        "Lantern Fox shows a new presence in the world! (+2 ATK, +4 HP)",
    });
    const updated = playerParty.creatures.find(
      (c) => c.instanceId === fox.instanceId,
    )!;
    expect(hasPresenceGrowth(updated)).toBe(true);
    expect(updated.attackBonus).toBe(PRESENCE_ATTACK_BONUS);
    expect(updated.hpBonus).toBe(PRESENCE_HP_BONUS);

    const snapshot = exportWorldSnapshot({ zoneId: "grove", x: 3, y: 7 });
    setPartyFromSnapshot([], 1);
    applyWorldSnapshot(snapshot);
    const restored = playerParty.creatures.find(
      (c) => c.instanceId === fox.instanceId,
    );
    expect(hasPresenceGrowth(restored!)).toBe(true);
  });

  it("rejects visitors, double-apply, wrong creature, and missing item", () => {
    const fox = member({ instanceId: "c-f", definitionId: "lantern-fox" });
    setPartyFromSnapshot([fox], 1);
    setInventoryFromSnapshot({}, { "fox-fire-charm": 1 });

    setVisitorMode(true);
    expect(applyShrineFusion(fox.instanceId, "fox-fire-charm")).toEqual({
      ok: false,
      message: "Visitors cannot apply shrine effects.",
    });
    setVisitorMode(false);

    expect(applyShrineFusion(fox.instanceId, "fox-fire-charm").ok).toBe(true);
    expect(applyShrineFusion(fox.instanceId, "fox-fire-charm")).toEqual({
      ok: false,
      message: "This fusion was already applied.",
    });

    const mossling = member({ instanceId: "c-m", definitionId: "mossling" });
    setPartyFromSnapshot([mossling], 1);
    expect(applyShrineFusion(mossling.instanceId, "fox-fire-charm")).toEqual({
      ok: false,
      message: "This item has no effect on that creature.",
    });

    setInventoryFromSnapshot({}, {});
    expect(applyShrineFusion(mossling.instanceId, "moss-salve")).toEqual({
      ok: false,
      message: "You don't have that item.",
    });
  });
});

describe("presence overworld tell seam (#296)", () => {
  it("hue-shifts spriteColor like a shiny when presence growth is applied", () => {
    const fox = member({ instanceId: "c-f", definitionId: "lantern-fox" });
    const base = getCreatureDefinition("lantern-fox").spriteColor;
    expect(presenceTintForCreature(fox)).toBe(base);

    fox.appliedEffects = [effectKey("lantern-fox", "fox-fire-charm")];
    expect(hasPresenceGrowth(fox)).toBe(true);
    const shiny = presenceTintForCreature(fox);
    expect(shiny).toBe(presenceShinyColor(base, "lantern-fox"));
    expect(shiny).not.toBe(base);
  });

  it("derives a stable shiny palette per species", () => {
    const base = getCreatureDefinition("lantern-fox").spriteColor;
    expect(presenceShinyColor(base, "lantern-fox")).toBe(
      presenceShinyColor(base, "lantern-fox"),
    );
    expect(presenceShinyColor(base, "lantern-fox")).not.toBe(
      presenceShinyColor(base, "thunder-finch"),
    );
  });

  it("prioritizes presence companions in overworld follower selection", () => {
    const actives = [
      member({ instanceId: "c-1", definitionId: "mossling" }),
      member({ instanceId: "c-2", definitionId: "brook-nymph" }),
      member({ instanceId: "c-3", definitionId: "stone-hound" }),
      member({ instanceId: "c-4", definitionId: "lantern-fox" }),
    ];
    actives[3]!.appliedEffects = [effectKey("lantern-fox", "fox-fire-charm")];

    const visible = selectOverworldFollowers(actives, 3);
    expect(visible.map((c) => c.instanceId)).toEqual(["c-4", "c-1", "c-2"]);
  });

  it("strips legacy combat buffs when remapped presence keys load from save", () => {
    const finch = member({
      instanceId: "c-t",
      definitionId: "thunder-finch",
      attackBonus: 4,
      secondaryElement: "storm",
      secondaryMove: {
        id: "tempest-peck",
        name: "Tempest Peck",
        power: 9,
        type: "storm",
        accuracy: 90,
      },
      appliedEffects: [effectKey("thunder-finch", "storm-charm")],
    });

    migrateLegacyPresenceCharmBuffs(finch);
    expect(finch.attackBonus).toBe(PRESENCE_ATTACK_BONUS);
    expect(finch.hpBonus).toBe(PRESENCE_HP_BONUS);
    expect(finch.secondaryElement).toBeUndefined();
    expect(finch.secondaryMove).toBeUndefined();
  });
});
