import { describe, expect, it } from "vitest";
import { executeMove, primeOpeningCooldowns, resolveAttack, WILD_DAMAGE_SCALE } from "../battle/battleLogic";
import { moveRole } from "../battle/kits";
import { simCombatant } from "../battle/sparSim";
import { hasStatus } from "../battle/statusEffects";
import { STAGGER_MOVE_ID } from "../battle/boss/storyBattle";
import { KEEN_EDGE_DAMAGE, MOON_SHIELD_TAKEN, type BoonId } from "./boons";
import type { ModifierId } from "./modifiers";
import { TrialBattle, trialPartyScale } from "./trialBattle";
import { ECLIPSE_SIGNATURE_ID, ECLIPSE_CHARGE_ID, buildEclipseBossDef, counterTypeOf } from "./trialBoss";
import { generateTrialPlan, type TrialPlan, type TrialRoundPlan } from "./trialPlan";
import { parseTrialDayKey } from "./trialSeed";

const PLAN: TrialPlan = generateTrialPlan(parseTrialDayKey("2026-10-08")!);

function round(modifiers: ModifierId[], creatureId = "lantern-fox", index = 1): TrialRoundPlan {
  return { index, kind: "foe", creatureId, levelBonus: 1, modifiers };
}

function battle(modifiers: ModifierId[], boons: BoonId[] = [], creatureId = "lantern-fox", partySize = 2): TrialBattle {
  return new TrialBattle({ plan: PLAN, round: round(modifiers, creatureId), partyAverage: 10, partySize, boons, maxLevel: 50 });
}

/** A woodland companion (Burn / Soak both stick). */
function companion() {
  return primeOpeningCooldowns(simCombatant("bramblewarden", 10));
}

describe("Eclipse modifiers (#420)", () => {
  it("builds the foe off the party average + round bonus, scaled for the standing party", () => {
    const b = battle([], [], "lantern-fox", 2);
    const plain = simCombatant("lantern-fox", 11);
    expect(b.foeLevel).toBe(11);
    expect(b.foe.maxHp).toBe(Math.round(plain.maxHp * trialPartyScale(2).hp));
    expect(b.foe.damageScale).toBeCloseTo(WILD_DAMAGE_SCALE * trialPartyScale(2).damage);
    expect(trialPartyScale(1)).toEqual({ hp: 1, damage: 1 });
    expect(trialPartyScale(99)).toEqual(trialPartyScale(5));
  });

  it("Kindled burns everyone on entry; Soaked Arena soaks them", () => {
    const kindled = battle(["kindled"], [], "stone-hound");
    kindled.startFoe();
    expect(hasStatus(kindled.foe, "burn")).toBe(true);
    const mine = companion();
    kindled.decoratePlayer(mine, true);
    expect(hasStatus(mine, "burn")).toBe(true);
    // Back from the bench: no second entry status.
    const back = companion();
    kindled.decoratePlayer(back, false);
    expect(hasStatus(back, "burn")).toBe(false);

    const soaked = battle(["soaked-arena"], [], "stone-hound");
    soaked.startFoe();
    expect(hasStatus(soaked.foe, "soaked")).toBe(true);
    const wet = companion();
    soaked.decoratePlayer(wet, true);
    expect(hasStatus(wet, "soaked")).toBe(true);
  });

  it("Glass Cannons: both sides hit 30% harder and are 30% more fragile", () => {
    const glass = battle(["glass-cannons"]);
    const plain = battle([]);
    expect(glass.foe.damageScale! / plain.foe.damageScale!).toBeCloseTo(1.3);
    expect(glass.foe.bulk).toBeCloseTo(0.7);
    const mine = companion();
    glass.decoratePlayer(mine, true);
    expect(mine.damageScale).toBeCloseTo(1.3);
    expect(mine.bulk).toBeCloseTo(0.7);
  });

  it("Rootbound halves what a raised guard lets through", () => {
    const strong = companion();
    battle(["rootbound"]).decoratePlayer(strong, true);
    const normal = companion();
    strong.guarding = true;
    normal.guarding = true;
    const foe = simCombatant("stone-hound", 10);
    const hit = foe.moves.find((m) => moveRole(m) === "attack")!;
    const a = resolveAttack(foe, hit, strong, () => 0);
    const b = resolveAttack(foe, hit, normal, () => 0);
    expect(a.kind === "hit" && b.kind === "hit").toBe(true);
    if (a.kind === "hit" && b.kind === "hit") {
      expect(a.damage).toBeLessThan(b.damage);
      expect(a.damage).toBeCloseTo(b.damage / 2, -0.5);
    }
  });

  it("Moonfed heals the foe 4% after each of its turns", () => {
    const b = battle(["moonfed"]);
    b.foe.currentHp = 10;
    expect(b.foeEndTurn(b.foe)).toBe(Math.round(b.foe.maxHp * 0.04));
    expect(battle([]).foeEndTurn(battle([]).foe)).toBe(0);
  });

  it("Short Fuse: finishers ready from turn one, both sides", () => {
    const b = battle(["short-fuse"]);
    expect(b.foe.cooldowns).toEqual({});
    const mine = companion();
    expect(Object.keys(mine.cooldowns ?? {})).not.toHaveLength(0);
    b.decoratePlayer(mine, true);
    expect(mine.cooldowns).toEqual({});
  });

  it("Iron Hide: +35% foe HP, 10% softer hits", () => {
    const iron = battle(["iron-hide"]);
    const plain = battle([]);
    expect(iron.foe.maxHp).toBe(Math.round(plain.foe.maxHp * 1.35));
    expect(iron.foe.damageScale! / plain.foe.damageScale!).toBeCloseTo(0.9);
  });

  it("Twin Shadows: the foe strikes again on every 4th turn only", () => {
    const b = battle(["twin-shadows"], [], "stone-hound");
    const mine = companion();
    mine.maxHp = 9999;
    mine.currentHp = 9999;
    const attack = b.foe.moves.find((m) => moveRole(m) === "attack")!;
    const echoes: boolean[] = [];
    for (let turn = 1; turn <= 8; turn++) {
      expect(b.echoIn).toBe(4 - ((turn - 1) % 4));
      const result = executeMove(b.foe, attack, mine, () => 0);
      echoes.push(b.afterFoeMove(b.foe, mine, attack, () => 0) !== null);
      expect(result.attack?.kind).toBe("hit");
    }
    expect(echoes).toEqual([false, false, false, true, false, false, false, true]);
    expect(battle([]).afterFoeMove(battle([]).foe, mine, attack, () => 0)).toBeNull();
  });
});

describe("Eclipse boons (#420)", () => {
  it("Keen Edge and Moon Shield scale the next round", () => {
    const keen = companion();
    battle([], ["keen-edge"]).decoratePlayer(keen, true);
    expect(keen.damageScale).toBeCloseTo(KEEN_EDGE_DAMAGE);
    const shield = companion();
    battle([], ["moon-shield"]).decoratePlayer(shield, true);
    expect(shield.bulk).toBeCloseTo(1 / MOON_SHIELD_TAKEN);
  });

  it("Quickened refunds finisher cooldowns", () => {
    const mine = companion();
    battle([], ["quickened"]).decoratePlayer(mine, true);
    expect(mine.cooldowns).toEqual({});
  });

  it("Pure Light blocks entry statuses and sheds statuses after each turn", () => {
    const b = battle(["kindled"], ["pure-light"], "stone-hound");
    const mine = companion();
    b.decoratePlayer(mine, true);
    expect(hasStatus(mine, "burn")).toBe(false);
    mine.statuses = [{ id: "rooted", turns: 2 }];
    expect(b.playerEndTurn(mine)).toEqual(["rooted"]);
    expect(mine.statuses).toEqual([]);
    const plain = companion();
    plain.statuses = [{ id: "rooted", turns: 2 }];
    expect(battle([]).playerEndTurn(plain)).toEqual([]);
  });

  it("Swift Swap gives a second free switch", () => {
    const swift = battle([], ["swift-swap"]);
    expect(swift.freeSwitchesLeft).toBe(2);
    expect(swift.takeFreeSwitch()).toBe(true);
    expect(swift.takeFreeSwitch()).toBe(false);
    const plain = battle([]);
    expect(plain.takeFreeSwitch()).toBe(false);
  });
});

describe("Eclipse Shade boss round (#420)", () => {
  const bossRound: TrialRoundPlan = { index: 4, kind: "boss", creatureId: "eclipse-sovereign", levelBonus: 3, modifiers: ["soaked-arena"] };

  it("runs on the boss framework: two forms, telegraphed signature, parry stagger", () => {
    const b = new TrialBattle({ plan: PLAN, round: bossRound, partyAverage: 10, partySize: 3, boons: [], maxLevel: 50 });
    expect(b.isBoss).toBe(true);
    const boss = b.boss!;
    expect(boss.def.boss?.forms).toHaveLength(2);
    expect(boss.foeLevel).toBe(13);
    expect(boss.def.arena).toBe("night");
    // Cross the threshold: Total Eclipse opens with the wind-up, then the signature.
    boss.foe.currentHp = Math.round(boss.foe.maxHp * 0.5);
    expect(boss.checkTransform()?.id).toBe("total");
    const mine = companion();
    const charge = boss.intentFor(mine, () => 0);
    expect(charge.move.id).toBe(ECLIPSE_CHARGE_ID);
    boss.onFoeActed(charge.move, false, null);
    const signature = boss.intentFor(mine, () => 0);
    expect(signature.move.id).toBe(ECLIPSE_SIGNATURE_ID);
    mine.guarding = true;
    const hit = executeMove(boss.foe, signature.move, mine, () => 0);
    expect(boss.onFoeActed(signature.move, true, hit).parried).toBe(true);
    expect(boss.intentFor(mine, () => 0).move.id).toBe(STAGGER_MOVE_ID);
  });

  it("keeps Glass Cannons' fragility through a stagger", () => {
    const b = new TrialBattle({
      plan: PLAN,
      round: { ...bossRound, modifiers: ["glass-cannons"] },
      partyAverage: 10,
      partySize: 2,
      boons: [],
      maxLevel: 50,
    });
    expect(b.foe.bulk).toBeCloseTo(0.7);
  });

  it("names the counter type of each form", () => {
    const def = buildEclipseBossDef({ formTypes: ["ember", "fen"] });
    expect(def.boss!.forms[0]!.counterType).toBe(counterTypeOf("ember"));
    expect(counterTypeOf("ember")).toBe("water");
    expect(def.boss!.forms[1]!.telegraph).toMatch(/Woodland hunts it/);
  });
});
