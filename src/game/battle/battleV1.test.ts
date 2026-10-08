import { describe, expect, it } from "vitest";
import {
  calcDamage,
  chooseEnemyIntent,
  effectiveAccuracy,
  executeMove,
  formatEncounterMatchup,
  formatMatchupBadge,
  getCooldown,
  BATTLE_DAMAGE_SCALE,
  DEFENSE_CURVE_K,
  isFainted,
  previewFixedDamage,
  primeOpeningCooldowns,
  readyMoves,
  resolveAttack,
  resolveFixedAttack,
  TUTORIAL_WILD_DAMAGE_SCALE,
  WILD_DAMAGE_SCALE,
  wildBattleTuning,
} from "./battleLogic";
import {
  deriveKit,
  FINISHER_DAMAGE_MULT,
  FINISHER_STATUS_BONUS,
  getBattleKit,
  GUARD_DAMAGE_TAKEN,
  GUARD_FINISHER_DAMAGE_TAKEN,
  isFullKit,
  KIT_ROLES,
  moveRole,
} from "./kits";
import {
  applyStatus,
  BURN_TICK_FRACTION,
  DAZED_ACCURACY_PENALTY,
  hasStatus,
  ROOTED_DAMAGE_DEALT,
  SOAKED_DAMAGE_TAKEN,
  SOAKED_STORM_DAMAGE_TAKEN,
  STATUS_DEFS,
  tickStatuses,
} from "./statusEffects";
import {
  HUNTER_MULTIPLIER,
  RESIST_MULTIPLIER,
  resolveMatchup,
} from "../creatures/folkloreTypes";
import { statMultForLevel } from "../progression/leveling";
import { CREATURES, getCreatureDefinition } from "../creatures/catalog";
import { SIGNATURE_TRAIT_KITS } from "../creatures/traits";
import type { BattleCombatant, MoveDefinition } from "../creatures/types";

function combatant(
  overrides: Partial<BattleCombatant> & Pick<BattleCombatant, "folkloreType">,
): BattleCombatant {
  return {
    name: "Test",
    maxHp: 40,
    currentHp: 40,
    attack: 8,
    defense: 4,
    moves: [],
    ...overrides,
  };
}

const strike: MoveDefinition = {
  id: "strike",
  name: "Strike",
  power: 10,
  type: "earth",
  accuracy: 100,
  role: "attack",
  cooldown: 0,
};
const guard: MoveDefinition = {
  id: "guard",
  name: "Guard",
  power: 0,
  type: "earth",
  accuracy: 100,
  role: "guard",
  cooldown: 2,
  heal: 0.25,
};
const soak: MoveDefinition = {
  id: "soak",
  name: "Soak",
  power: 3,
  type: "water",
  accuracy: 100,
  role: "status",
  cooldown: 2,
  inflicts: "soaked",
};
const finisher: MoveDefinition = {
  id: "fin",
  name: "Fin",
  power: 14,
  type: "earth",
  accuracy: 100,
  role: "finisher",
  cooldown: 3,
};

/** Unrounded Lv 1 hit before matchup / situational multipliers. */
function raw(power: number, attack: number, defense: number): number {
  return (
    (power + attack) *
    (DEFENSE_CURVE_K / (DEFENSE_CURVE_K + defense)) *
    BATTLE_DAMAGE_SCALE
  );
}

/** Mulberry32 — tiny seeded rng for deterministic simulations. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("matchups", () => {
  it("a type resists moves of the type it hunts", () => {
    // ember hunts woodland, so ember shrugs off woodland moves.
    expect(resolveMatchup("woodland", "ember")).toBe("resisted");
    expect(resolveMatchup("ember", "woodland")).toBe("hunter");
    expect(resolveMatchup("storm", "mist")).toBe("neutral");
  });

  it("applies the resist multiplier to damage", () => {
    const attacker = combatant({ folkloreType: "woodland", attack: 8 });
    const defender = combatant({ folkloreType: "ember", defense: 4 });
    const move = { ...strike, type: "woodland" as const };
    const outcome = resolveAttack(attacker, move, defender, () => 0);
    expect(outcome).toEqual({
      kind: "hit",
      matchup: "resisted",
      damage: Math.round(raw(10, 8, 4) * RESIST_MULTIPLIER),
    });
  });

  it("formats badges for move buttons", () => {
    expect(formatMatchupBadge("hunter")).toBe(`×${HUNTER_MULTIPLIER}`);
    expect(formatMatchupBadge("resisted")).toBe(`resists ×${RESIST_MULTIPLIER}`);
    expect(formatMatchupBadge("immune")).toBe("immune");
    expect(formatMatchupBadge("neutral")).toBe("");
  });

  it("summarizes the lead matchup for the encounter panel", () => {
    expect(formatEncounterMatchup("Cinder Toad", "ember", "woodland")).toBe(
      `Cinder Toad: you hunt it ×${HUNTER_MULTIPLIER} · you resist it`,
    );
    expect(formatEncounterMatchup("Mossling", "woodland", "ember")).toBe(
      `Mossling: resists you · hunts you ×${HUNTER_MULTIPLIER}`,
    );
    expect(formatEncounterMatchup("Mossling", "woodland", "storm")).toBe(
      "Mossling: even matchup",
    );
  });
});

describe("situational damage", () => {
  const attacker = combatant({ folkloreType: "earth", attack: 8 });
  const base = raw(10, 8, 4);

  it("guard braces against a plain hit and parries a finisher", () => {
    const defender = combatant({ folkloreType: "earth", guarding: true });
    expect(calcDamage(attacker, strike, defender)).toBe(
      Math.round(base * GUARD_DAMAGE_TAKEN),
    );
    expect(calcDamage(attacker, finisher, defender)).toBe(
      Math.round(raw(14, 8, 4) * FINISHER_DAMAGE_MULT * GUARD_FINISHER_DAMAGE_TAKEN),
    );
    expect(GUARD_FINISHER_DAMAGE_TAKEN).toBeLessThan(GUARD_DAMAGE_TAKEN);
  });

  it("soaked takes more, storm conducts even more", () => {
    // Woodland: neutral to both earth and storm, so only Soaked scales damage.
    const defender = combatant({
      folkloreType: "woodland",
      statuses: [{ id: "soaked", turns: 2 }],
    });
    expect(calcDamage(attacker, strike, defender)).toBe(
      Math.round(base * SOAKED_DAMAGE_TAKEN),
    );
    const stormMove = { ...strike, type: "storm" as const };
    expect(calcDamage(attacker, stormMove, defender)).toBe(
      Math.round(base * SOAKED_STORM_DAMAGE_TAKEN),
    );
  });

  it("rooted attackers hit softer", () => {
    const rooted = { ...attacker, statuses: [{ id: "rooted" as const, turns: 1 }] };
    const defender = combatant({ folkloreType: "earth" });
    expect(calcDamage(rooted, strike, defender)).toBe(
      Math.round(base * ROOTED_DAMAGE_DEALT),
    );
  });

  it("finishers punish a statused target", () => {
    const clean = combatant({ folkloreType: "earth" });
    const burned = combatant({
      folkloreType: "earth",
      statuses: [{ id: "burn", turns: 2 }],
    });
    const hit = raw(14, 8, 4) * FINISHER_DAMAGE_MULT;
    expect(calcDamage(attacker, finisher, clean)).toBe(Math.round(hit));
    expect(calcDamage(attacker, finisher, burned)).toBe(
      Math.round(hit * FINISHER_STATUS_BONUS),
    );
  });

  it("dazed lowers accuracy and can turn a hit into a miss", () => {
    const dazed = { ...attacker, statuses: [{ id: "dazed" as const, turns: 1 }] };
    const move = { ...strike, accuracy: 90 };
    expect(effectiveAccuracy(dazed, move)).toBe(90 - DAZED_ACCURACY_PENALTY);
    const defender = combatant({ folkloreType: "earth" });
    expect(resolveAttack(attacker, move, defender, () => 0.7).kind).toBe("hit");
    expect(resolveAttack(dazed, move, defender, () => 0.7).kind).toBe("miss");
  });

  it("guard moves preview zero damage", () => {
    expect(calcDamage(attacker, guard, combatant({ folkloreType: "earth" }))).toBe(0);
  });
});

describe("defense curve, level scaling + wild tuning", () => {
  it("defense blunts but never erases a hit, and every point matters", () => {
    const weak = combatant({ folkloreType: "woodland", attack: 6 });
    const tangle = { ...strike, type: "woodland" as const, power: 6 };
    const wall = combatant({ folkloreType: "storm", defense: 20 });
    expect(calcDamage(weak, tangle, wall)).toBe(Math.round(raw(6, 6, 20)));
    expect(calcDamage(weak, tangle, wall)).toBeGreaterThan(0);
    const soft = combatant({ folkloreType: "storm", defense: 2 });
    const firm = combatant({ folkloreType: "storm", defense: 8 });
    expect(calcDamage(weak, tangle, soft)).toBeGreaterThan(calcDamage(weak, tangle, firm));
  });

  it("move power and defense scale with level, so equal-level hits track HP", () => {
    const at = (level: number) => {
      const mult = statMultForLevel(level);
      const user = combatant({ folkloreType: "earth", level, attack: 8 * mult });
      const foe = combatant({ folkloreType: "earth", level, defense: 4 });
      return calcDamage(user, { ...strike, power: 20 }, foe) / mult;
    };
    // Same share of a (level-scaled) HP bar at Lv 1 and Lv 40.
    expect(at(40)).toBeCloseTo(at(1), 0);
    // A higher-level defender shrugs off more of the same hit.
    const user = combatant({ folkloreType: "earth", attack: 8 });
    const lv1 = combatant({ folkloreType: "earth", defense: 6 });
    const lv20 = combatant({ folkloreType: "earth", defense: 6, level: 20 });
    expect(calcDamage(user, strike, lv20)).toBeLessThan(calcDamage(user, strike, lv1));
  });

  it("damageScale softens outgoing hits; the tutorial spar uses it", () => {
    const tuning = wildBattleTuning(true);
    expect(tuning).toEqual({
      damageScale: TUTORIAL_WILD_DAMAGE_SCALE,
      matchupAware: false,
    });
    expect(wildBattleTuning(false)).toEqual({
      damageScale: WILD_DAMAGE_SCALE,
      matchupAware: true,
    });
    const wild = combatant({ folkloreType: "earth", damageScale: tuning.damageScale });
    const target = combatant({ folkloreType: "earth" });
    expect(calcDamage(wild, strike, target)).toBe(
      Math.round(raw(10, 8, 4) * TUTORIAL_WILD_DAMAGE_SCALE),
    );
  });

  it("matchup-blind intents ignore hunter edges (tutorial)", () => {
    const enemy = combatant({ folkloreType: "ember", moves: [
      { ...strike, type: "ember" },
      { ...guard, type: "ember" },
    ] });
    const prey = combatant({ folkloreType: "woodland" });
    const neutral = combatant({ folkloreType: "earth" });
    const picks = (player: BattleCombatant, matchupAware: boolean) =>
      Array.from({ length: 50 }, (_, i) =>
        chooseEnemyIntent(enemy, player, seeded(i), { matchupAware }).move.id,
      );
    expect(picks(prey, false)).toEqual(picks(neutral, false));
    expect(picks(prey, true)).not.toEqual(picks(neutral, true));
  });
});

describe("sovereign fixed attacks", () => {
  it("respect Rooted and Guard", () => {
    const boss = combatant({ folkloreType: "water" });
    const target = combatant({ folkloreType: "earth" });
    expect(resolveFixedAttack(boss, 20, target, () => 0)).toEqual({
      kind: "hit",
      damage: 20,
      parryHealed: 0,
    });
    boss.statuses = [{ id: "rooted", turns: 1 }];
    target.guarding = true;
    // Every sovereign beat is telegraphed, so a guard always parries it.
    expect(previewFixedDamage(boss, 20, target)).toBe(
      Math.round(20 * ROOTED_DAMAGE_DEALT * GUARD_FINISHER_DAMAGE_TAKEN),
    );
  });

  it("a parried sovereign beat heals the guard user", () => {
    const boss = combatant({ folkloreType: "water" });
    const target = combatant({
      folkloreType: "earth",
      currentHp: 20,
      guarding: true,
      moves: [strike, guard],
    });
    const outcome = resolveFixedAttack(boss, 20, target, () => 0);
    expect(outcome).toEqual({
      kind: "hit",
      damage: Math.round(20 * GUARD_FINISHER_DAMAGE_TAKEN),
      parryHealed: 10,
    });
    expect(target.currentHp).toBe(30);
  });

  it("can miss while Dazed", () => {
    const boss = combatant({
      folkloreType: "water",
      statuses: [{ id: "dazed", turns: 1 }],
    });
    const target = combatant({ folkloreType: "earth" });
    expect(resolveFixedAttack(boss, 20, target, () => 0).kind).toBe("miss");
    expect(resolveFixedAttack(boss, 20, target, () => 0.99).kind).toBe("hit");
  });
});

describe("status effects", () => {
  it("respects type immunities", () => {
    const water = combatant({ folkloreType: "water" });
    expect(applyStatus(water, "burn")).toEqual({ kind: "immune", id: "burn" });
    expect(applyStatus(water, "soaked")).toEqual({ kind: "immune", id: "soaked" });
    const storm = combatant({ folkloreType: "storm" });
    expect(applyStatus(storm, "rooted").kind).toBe("immune");
    expect(hasStatus(storm, "rooted")).toBe(false);
    // Wisps are fire: they shrug off Burn but can be Rooted.
    const wisp = combatant({ folkloreType: "will-o-wisp" });
    expect(applyStatus(wisp, "burn").kind).toBe("immune");
    expect(applyStatus(wisp, "rooted").kind).toBe("applied");
  });

  it("soaking douses burn and blocks new burns", () => {
    const target = combatant({ folkloreType: "earth" });
    applyStatus(target, "burn");
    expect(hasStatus(target, "burn")).toBe(true);
    applyStatus(target, "soaked");
    expect(hasStatus(target, "burn")).toBe(false);
    expect(applyStatus(target, "burn")).toEqual({ kind: "doused", id: "burn" });
  });

  it("re-applying refreshes the duration instead of stacking", () => {
    const target = combatant({ folkloreType: "earth" });
    applyStatus(target, "rooted");
    tickStatuses(target);
    expect(target.statuses).toEqual([{ id: "rooted", turns: 1 }]);
    expect(applyStatus(target, "rooted").kind).toBe("refreshed");
    expect(target.statuses).toEqual([
      { id: "rooted", turns: STATUS_DEFS.rooted.turns },
    ]);
  });

  it("burn ticks for its full duration, then wears off", () => {
    const target = combatant({ folkloreType: "earth", maxHp: 50, currentHp: 50 });
    applyStatus(target, "burn");
    const perTick = Math.round(50 * BURN_TICK_FRACTION);
    const ticks = [];
    for (let i = 0; i < STATUS_DEFS.burn.turns; i++) {
      ticks.push(tickStatuses(target));
    }
    expect(ticks.map((t) => t.burnDamage)).toEqual([perTick, perTick, perTick]);
    expect(ticks[ticks.length - 1].expired).toEqual(["burn"]);
    expect(target.currentHp).toBe(50 - perTick * 3);
    expect(tickStatuses(target).burnDamage).toBe(0);
  });

  it("burn can knock out a creature", () => {
    const target = combatant({
      folkloreType: "earth",
      currentHp: 1,
      statuses: [{ id: "burn", turns: 3 }],
    });
    tickStatuses(target);
    expect(isFainted(target)).toBe(true);
  });
});

describe("executeMove + cooldowns", () => {
  it("guard raises a guard and goes on cooldown; it heals only on a parry", () => {
    const user = combatant({
      folkloreType: "earth",
      currentHp: 20,
      moves: [strike, guard],
    });
    const foe = combatant({ folkloreType: "earth", moves: [strike, finisher] });
    const result = executeMove(user, guard, foe, () => 0);
    expect(result.guarded).toBe(true);
    expect(result.healed).toBe(0);
    expect(user.currentHp).toBe(20);
    expect(user.guarding).toBe(true);
    expect(getCooldown(user, "guard")).toBe(2);
    expect(readyMoves(user).map((m) => m.id)).toEqual(["strike"]);

    // A plain hit into the guard: braced, no heal.
    const braced = executeMove(foe, strike, user, () => 0);
    expect(braced.parryHealed).toBeUndefined();

    // A finisher into a fresh guard: parried, and the guard heals (25% max HP).
    user.guarding = true;
    const before = user.currentHp;
    const parried = executeMove(foe, finisher, user, () => 0);
    const hit = parried.attack?.kind === "hit" ? parried.attack.damage : 0;
    expect(hit).toBe(
      Math.round(raw(14, 8, 4) * FINISHER_DAMAGE_MULT * GUARD_FINISHER_DAMAGE_TAKEN),
    );
    expect(parried.parryHealed).toBe(10);
    expect(user.currentHp).toBe(before - hit + 10);
    expect(user.guarding).toBe(false);
  });

  it("cooldowns count down on the user's own turns", () => {
    const user = combatant({ folkloreType: "earth", moves: [strike, finisher] });
    const foe = combatant({ folkloreType: "earth", maxHp: 999, currentHp: 999 });
    executeMove(user, finisher, foe, () => 0);
    expect(getCooldown(user, "fin")).toBe(3);
    executeMove(user, strike, foe, () => 0);
    expect(getCooldown(user, "fin")).toBe(2);
    executeMove(user, strike, foe, () => 0);
    executeMove(user, strike, foe, () => 0);
    expect(getCooldown(user, "fin")).toBe(0);
    expect(readyMoves(user)).toContain(finisher);
  });

  it("finishers open the battle charging and are ready from turn two", () => {
    const user = primeOpeningCooldowns(
      combatant({ folkloreType: "earth", moves: [strike, guard, finisher] }),
    );
    const foe = combatant({ folkloreType: "earth", maxHp: 999, currentHp: 999 });
    expect(readyMoves(user).map((m) => m.id)).toEqual(["strike", "guard"]);
    executeMove(user, strike, foe, () => 0);
    expect(readyMoves(user).map((m) => m.id)).toContain("fin");
  });

  it("a hit consumes the target's guard; acting drops your own", () => {
    const user = combatant({ folkloreType: "earth", moves: [strike] });
    const foe = combatant({ folkloreType: "earth", guarding: true });
    const result = executeMove(user, strike, foe, () => 0);
    expect(result.attack).toEqual({
      kind: "hit",
      matchup: "neutral",
      damage: Math.round(raw(10, 8, 4) * GUARD_DAMAGE_TAKEN),
    });
    expect(foe.guarding).toBe(false);

    user.guarding = true;
    executeMove(user, strike, foe, () => 0);
    expect(user.guarding).toBe(false);
  });

  it("status moves inflict on hit, not on miss", () => {
    const user = combatant({ folkloreType: "water", moves: [soak] });
    const foe = combatant({ folkloreType: "earth" });
    const missed = executeMove(user, { ...soak, accuracy: 0 }, foe, () => 0.5);
    expect(missed.status).toBeUndefined();
    expect(hasStatus(foe, "soaked")).toBe(false);
    const hit = executeMove(user, soak, foe, () => 0);
    expect(hit.status).toEqual({ kind: "applied", id: "soaked" });
    expect(hasStatus(foe, "soaked")).toBe(true);
  });
});

describe("chooseEnemyIntent", () => {
  const kit = [strike, guard, { ...soak, type: "earth" as const }, finisher];

  it("is deterministic for a given rng", () => {
    const enemy = combatant({ folkloreType: "earth", moves: kit });
    const player = combatant({ folkloreType: "woodland" });
    const a = Array.from({ length: 20 }, (_, i) =>
      chooseEnemyIntent(enemy, player, seeded(i)).move.id,
    );
    const b = Array.from({ length: 20 }, (_, i) =>
      chooseEnemyIntent(enemy, player, seeded(i)).move.id,
    );
    expect(a).toEqual(b);
    // Different seeds still produce more than one move (not a single dominant pick).
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it("never picks a move on cooldown", () => {
    const enemy = combatant({
      folkloreType: "earth",
      moves: kit,
      cooldowns: { fin: 2, guard: 1, soak: 1 },
    });
    const player = combatant({ folkloreType: "woodland" });
    for (let i = 0; i < 30; i++) {
      expect(chooseEnemyIntent(enemy, player, seeded(i)).move.id).toBe("strike");
    }
  });

  it("guards more when hurt, and skips statuses that cannot stick", () => {
    const count = (enemy: BattleCombatant, player: BattleCombatant, id: string) =>
      Array.from({ length: 200 }, (_, i) =>
        chooseEnemyIntent(enemy, player, seeded(i)).move.id,
      ).filter((m) => m === id).length;
    const healthy = combatant({ folkloreType: "earth", moves: kit });
    const hurt = combatant({ folkloreType: "earth", moves: kit, currentHp: 10 });
    const player = combatant({ folkloreType: "woodland" });
    expect(count(hurt, player, "guard")).toBeGreaterThan(count(healthy, player, "guard"));

    const soakImmune = combatant({ folkloreType: "water" });
    expect(count(healthy, soakImmune, "soak")).toBeLessThan(count(healthy, player, "soak"));
  });

  it("avoids moves the player is immune to", () => {
    const enemy = combatant({ folkloreType: "earth", moves: [strike, finisher] });
    const player = combatant({ folkloreType: "mist", immunityTo: "earth" });
    // All damaging moves are immune → weight 0 → falls back to the first ready move.
    expect(chooseEnemyIntent(enemy, player, () => 0.99).move.id).toBe("strike");
  });
});

describe("kits", () => {
  it("every creature gets a 4-slot kit covering all roles with unique ids", () => {
    for (const def of CREATURES) {
      const kit = getBattleKit(def);
      expect(kit).toHaveLength(4);
      expect(KIT_ROLES.every((r) => kit.some((m) => moveRole(m) === r))).toBe(true);
      expect(new Set(kit.map((m) => m.id)).size).toBe(4);
      for (const move of kit) {
        expect(move.accuracy).toBeGreaterThan(0);
        if (moveRole(move) === "status") {
          expect(move.inflicts).toBeDefined();
        }
      }
    }
  });

  it("starter-region creatures have authored kits", () => {
    for (const def of CREATURES.filter((c) => c.early)) {
      expect(isFullKit(def.moves)).toBe(true);
    }
  });

  it("signature damage-buff moves stay in the kit", () => {
    for (const [speciesId, sig] of Object.entries(SIGNATURE_TRAIT_KITS)) {
      const kit = getBattleKit(getCreatureDefinition(speciesId));
      expect(kit.map((m) => m.id)).toContain(sig.signatureMoveId);
    }
  });

  it("derives attack from the most reliable move and finisher from the hardest hitter", () => {
    const kit = deriveKit(getCreatureDefinition("thunder-finch"));
    const byRole = Object.fromEntries(kit.map((m) => [moveRole(m), m]));
    expect(byRole.attack.id).toBe("peck");
    expect(byRole.finisher.id).toBe("bolt");
    expect(byRole.finisher.power).toBe(14);
    expect(byRole.status.inflicts).toBe("dazed");
    expect(byRole.guard.heal).toBeGreaterThan(0);
  });

  it("handles a single-move definition without id collisions", () => {
    const kit = deriveKit({
      id: "solo",
      folkloreType: "fen",
      moves: [{ id: "mire", name: "Mire", power: 7, type: "fen", accuracy: 95 }],
    });
    expect(new Set(kit.map((m) => m.id)).size).toBe(4);
  });
});

describe("simulated spar", () => {
  /** Player always takes the strongest ready damage move; returns the turn log. */
  function simulate(seed: number): { winner: string; turns: number; log: string[] } {
    const rng = seeded(seed);
    const mossDef = getCreatureDefinition("mossling");
    const wispDef = getCreatureDefinition("ember-wisp");
    const player = combatant({
      name: "Mossling",
      folkloreType: mossDef.folkloreType,
      maxHp: mossDef.maxHp,
      currentHp: mossDef.maxHp,
      attack: mossDef.attack,
      defense: mossDef.defense,
      moves: getBattleKit(mossDef),
    });
    const wild = combatant({
      name: "Ember Wisp",
      folkloreType: wispDef.folkloreType,
      maxHp: wispDef.maxHp,
      currentHp: wispDef.maxHp,
      attack: wispDef.attack,
      defense: wispDef.defense,
      moves: getBattleKit(wispDef),
    });
    primeOpeningCooldowns(player);
    primeOpeningCooldowns(wild);
    const log: string[] = [];
    let intent = chooseEnemyIntent(wild, player, rng).move;
    for (let turn = 1; turn <= 40; turn++) {
      const choice = readyMoves(player).sort(
        (a, b) => calcDamage(player, b, wild) - calcDamage(player, a, wild),
      )[0];
      executeMove(player, choice, wild, rng);
      log.push(`P:${choice.id}:${wild.currentHp}`);
      if (isFainted(wild)) return { winner: "player", turns: turn, log };
      tickStatuses(player);
      if (isFainted(player)) return { winner: "wild", turns: turn, log };
      executeMove(wild, intent, player, rng);
      log.push(`W:${intent.id}:${player.currentHp}`);
      player.guarding = false;
      tickStatuses(wild);
      if (isFainted(wild)) return { winner: "player", turns: turn, log };
      if (isFainted(player)) return { winner: "wild", turns: turn, log };
      intent = chooseEnemyIntent(wild, player, rng).move;
    }
    return { winner: "none", turns: 40, log };
  }

  it("replays identically for the same seed and ends in a sane number of turns", () => {
    for (const seed of [1, 7, 42]) {
      const a = simulate(seed);
      const b = simulate(seed);
      expect(a).toEqual(b);
      expect(a.winner).not.toBe("none");
      expect(a.turns).toBeGreaterThanOrEqual(2);
      expect(a.turns).toBeLessThanOrEqual(16);
    }
  });

  it("the best move changes turn to turn (cooldowns rotate the kit)", () => {
    const { log } = simulate(3);
    const playerMoves = log.filter((l) => l.startsWith("P:")).map((l) => l.split(":")[1]);
    expect(new Set(playerMoves).size).toBeGreaterThan(1);
  });
});
