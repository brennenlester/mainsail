import { describe, expect, it } from "vitest";
import { GUARD_DAMAGE_TAKEN, GUARD_FINISHER_DAMAGE_TAKEN } from "../battle/kits";
import { BURN_TICK_FRACTION, SOAKED_DAMAGE_TAKEN, SOAKED_STORM_DAMAGE_TAKEN } from "../battle/statusEffects";
import { BOONS, KEEN_EDGE_DAMAGE, MEND_FRACTION, MOON_SHIELD_TAKEN } from "./boons";
import { MODIFIERS, MODIFIER_IDS, type ModifierId } from "./modifiers";

/** Every number a player reads must be the number the rules use (#420 review). */
const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => `×${Math.round(x * 100) / 100}`;

function effect(id: ModifierId) {
  return MODIFIERS[id].effect;
}

describe("modifier and boon text matches the numbers (#420)", () => {
  const glass = effect("glass-cannons").glass!;
  const table: [ModifierId, string[]][] = [
    ["kindled", [pct(BURN_TICK_FRACTION)]],
    ["twin-shadows", [`${effect("twin-shadows").foeEchoEvery}th`]],
    [
      "rootbound",
      [
        pct(GUARD_DAMAGE_TAKEN * effect("rootbound").playerGuardTaken!),
        pct(GUARD_FINISHER_DAMAGE_TAKEN * effect("rootbound").playerGuardTaken!),
        "twice",
      ],
    ],
    ["glass-cannons", [pct(glass.damage - 1), pct(1 / glass.bulk - 1), times(glass.damage / glass.bulk)]],
    ["soaked-arena", [times(SOAKED_DAMAGE_TAKEN), times(SOAKED_STORM_DAMAGE_TAKEN)]],
    ["moonfed", [pct(effect("moonfed").foeRegen!)]],
    ["iron-hide", [`+${pct(effect("iron-hide").foeHp! - 1)}`, pct(1 - effect("iron-hide").foeDamage!)]],
    ["short-fuse", ["turn one"]],
  ];

  it.each(table)("%s says %j", (id, numbers) => {
    for (const n of numbers) {
      expect(MODIFIERS[id].summary).toContain(n);
    }
  });

  it("covers every modifier; glass reads 30% / 43% / ×1.86", () => {
    expect(table.map(([id]) => id).sort()).toEqual([...MODIFIER_IDS].sort());
    expect(MODIFIERS["glass-cannons"].summary).toContain("×1.86");
    expect(MODIFIERS["glass-cannons"].chip).toBe("GLASS ×1.86");
    expect(1 / glass.bulk).toBeCloseTo(1.43, 2);
  });

  it("boon text matches its constants", () => {
    expect(BOONS.mend.summary).toContain(pct(MEND_FRACTION));
    expect(BOONS["keen-edge"].summary).toContain(pct(KEEN_EDGE_DAMAGE - 1));
    expect(BOONS["moon-shield"].summary).toContain(pct(1 - MOON_SHIELD_TAKEN));
  });
});
