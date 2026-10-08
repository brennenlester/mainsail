import { describe, expect, it } from "vitest";
import {
  HUNTER_MULTIPLIER,
  resolveMatchup,
} from "./folkloreTypes";
import { isSignatureSpecies, rollSignatureTrait } from "./traits";
import { ZONE_ENCOUNTERS } from "../encounters/tables";
import {
  calcDamage,
  resolveAttack,
} from "../battle/battleLogic";
import type { BattleCombatant, MoveDefinition } from "./types";

function combatant(
  overrides: Partial<BattleCombatant> & Pick<BattleCombatant, "folkloreType">,
): BattleCombatant {
  return {
    name: "Test",
    maxHp: 30,
    currentHp: 30,
    attack: 8,
    defense: 4,
    moves: [],
    ...overrides,
  };
}

const emberSpit: MoveDefinition = {
  id: "ember-spit",
  name: "Ember Spit",
  power: 10,
  type: "ember",
  accuracy: 100,
};

const coil: MoveDefinition = {
  id: "coil",
  name: "Coil",
  power: 10,
  type: "mist",
  accuracy: 100,
};

describe("resolveMatchup", () => {
  it("marks hunter edges", () => {
    expect(resolveMatchup("ember", "woodland")).toBe("hunter");
    expect(resolveMatchup("woodland", "fen")).toBe("hunter");
  });

  it("only applies immunity when trait.to matches the move type", () => {
    expect(resolveMatchup("earth", "mist")).toBe("neutral");
    expect(resolveMatchup("earth", "mist", "earth")).toBe("immune");
    // Wrong/stale immunity target must not block (uses trait.to, not chart alone).
    expect(resolveMatchup("earth", "mist", "storm")).toBe("neutral");
  });
});

describe("resolveAttack", () => {
  it("can miss on accuracy", () => {
    const attacker = combatant({ folkloreType: "ember" });
    const defender = combatant({ folkloreType: "woodland" });
    const move = { ...emberSpit, accuracy: 50 };
    const outcome = resolveAttack(attacker, move, defender, () => 0.9);
    expect(outcome.kind).toBe("miss");
  });

  it("applies hunter multiplier", () => {
    const attacker = combatant({ folkloreType: "ember", attack: 8 });
    const defender = combatant({ folkloreType: "woodland", defense: 4 });
    const outcome = resolveAttack(attacker, emberSpit, defender, () => 0);
    expect(outcome.kind).toBe("hit");
    if (outcome.kind === "hit") {
      const neutral = calcDamage(
        attacker,
        emberSpit,
        combatant({ folkloreType: "earth", defense: 4 }),
      );
      expect(outcome.damage).toBeGreaterThan(neutral);
      expect(outcome.damage / neutral).toBeCloseTo(HUNTER_MULTIPLIER, 0);
      expect(outcome.matchup).toBe("hunter");
    }
  });

  it("returns immune with zero damage", () => {
    const attacker = combatant({ folkloreType: "earth" });
    const defender = combatant({
      folkloreType: "mist",
      immunityTo: "earth",
    });
    const earthMove: MoveDefinition = {
      id: "ram",
      name: "Ram",
      power: 11,
      type: "earth",
      accuracy: 100,
    };
    const outcome = resolveAttack(attacker, earthMove, defender, () => 0);
    expect(outcome).toEqual({ kind: "immune", matchup: "immune", damage: 0 });
  });

  it("treats disabled defense as neutral and contributes zero defense", () => {
    const attacker = combatant({ folkloreType: "storm", attack: 13 });
    const sovereign = combatant({
      folkloreType: "water",
      defense: 99,
      defenseDisabled: true,
      immunityTo: "storm",
    });
    const stormMove: MoveDefinition = {
      id: "bolt",
      name: "Bolt",
      power: 12,
      type: "storm",
      accuracy: 100,
    };

    expect(resolveAttack(attacker, stormMove, sovereign, () => 0)).toEqual({
      kind: "hit",
      matchup: "neutral",
      damage: 25,
    });
    expect(calcDamage(attacker, stormMove, sovereign)).toBe(25);
  });

  it("applies signature damage buff to one move", () => {
    const attacker = combatant({
      folkloreType: "mist",
      attack: 9,
      damageBuff: { moveId: "coil", multiplier: 1.35 },
    });
    const defender = combatant({ folkloreType: "earth", defense: 4 });
    const buffed = calcDamage(attacker, coil, defender);
    const unbuffed = calcDamage(
      { ...attacker, damageBuff: undefined },
      coil,
      defender,
    );
    expect(buffed).toBeGreaterThan(unbuffed);
  });
});

describe("rollSignatureTrait", () => {
  it("returns undefined for non-signature species", () => {
    expect(rollSignatureTrait("mossling", "woodland", () => 0)).toBeUndefined();
  });

  it("rolls immunity when rng is low and chart allows it", () => {
    const trait = rollSignatureTrait("mist-serpent", "mist", () => 0.1);
    expect(trait).toEqual({ kind: "immunity", to: "earth" });
  });

  it("rolls damage-buff when rng is high", () => {
    const trait = rollSignatureTrait("mist-serpent", "mist", () => 0.9);
    expect(trait).toEqual({
      kind: "damage-buff",
      moveId: "coil",
      multiplier: 1.35,
    });
  });
});

describe("signature encounter weights", () => {
  it("keeps signature species at low weight in late zones", () => {
    for (const [zoneId, table] of Object.entries(ZONE_ENCOUNTERS)) {
      if (zoneId === "grove" || zoneId === "shrine" || zoneId === "village") {
        for (const entry of table) {
          expect(isSignatureSpecies(entry.id)).toBe(false);
        }
        continue;
      }
      for (const entry of table) {
        if (isSignatureSpecies(entry.id)) {
          expect(entry.weight).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});
