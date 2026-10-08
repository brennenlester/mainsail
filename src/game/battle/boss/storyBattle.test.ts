import { describe, expect, it } from "vitest";
import type { BattleCombatant } from "../../creatures/types";
import { MAX_LEVEL } from "../../progression/leveling";
import { getStorySpar } from "../../story/storySpars";
import { executeMove } from "../battleLogic";
import { simCombatant } from "../sparSim";
import { hasStatus } from "../statusEffects";
import { describeAssist, STAGGER_MOVE_ID, StoryBattle } from "./storyBattle";

const boss = (partySize = 1) =>
  new StoryBattle(getStorySpar("cinder-matriarch"), {
    partyAverage: 8,
    partySize,
    rematch: false,
    maxLevel: MAX_LEVEL,
  });

const noRng = () => 0;

describe("Cinder Matriarch phases (#385)", () => {
  it("is one combatant with one HP pool, scaled to the challengers", () => {
    const solo = boss(1);
    const trio = boss(3);
    expect(solo.isBoss).toBe(true);
    expect(solo.form?.id).toBe("mire");
    expect(solo.foe.folkloreType).toBe("fen");
    expect(solo.phaseMarks).toEqual([0.5]);
    expect(trio.foe.maxHp).toBeGreaterThan(solo.foe.maxHp * 1.5);
    expect(trio.foe.damageScale!).toBeGreaterThan(solo.foe.damageScale!);
    // Party size is capped at the last scale entry.
    expect(boss(7).foe.maxHp).toBe(trio.foe.maxHp);
  });

  it("runs a fixed pattern that does not advance on a re-read", () => {
    const battle = boss();
    const player = simCombatant("bramblewarden", 8);
    const first = battle.intentFor(player, noRng);
    expect(battle.intentFor(player, noRng).move.id).toBe(first.move.id);
    battle.onFoeActed(first.move, false, null);
    expect(battle.intentFor(player, noRng).move.id).toBe(battle.form!.pattern[1]);
  });

  it("clamps a big hit at half HP and transforms into Cinder form", () => {
    const battle = boss();
    battle.foe.currentHp = 1; // a hit far past the threshold
    const form = battle.checkTransform();
    expect(form?.id).toBe("cinder");
    expect(battle.foe.currentHp).toBe(Math.round(battle.foe.maxHp * 0.5));
    expect(battle.foe.folkloreType).toBe("ember");
    expect(battle.foe.moves.map((m) => m.id)).toContain("cinderfall");
    expect(battle.stats.transforms).toBe(1);
    // The new form opens on its harmless wind-up (the swap window).
    const intent = battle.intentFor(simCombatant("brook-nymph", 8), noRng);
    expect(intent.move.id).toBe("gather-embers");
    expect(battle.intentNote(intent.move)).toBe("charge");
    // No second transformation, no faint from the clamp.
    expect(battle.checkTransform()).toBeNull();
  });

  it("does not transform above the threshold", () => {
    const battle = boss();
    battle.foe.currentHp = Math.round(battle.foe.maxHp * 0.5) + 1;
    expect(battle.checkTransform()).toBeNull();
    expect(battle.form?.id).toBe("mire");
  });

  it("staggers and exposes her when Guard parries Cinderfall", () => {
    const battle = boss();
    battle.foe.currentHp = 1;
    battle.checkTransform();
    const player = simCombatant("brook-nymph", 8);
    battle.onFoeActed(battle.intentFor(player, noRng).move, false, null); // wind-up
    const signature = battle.intentFor(player, noRng);
    expect(battle.intentNote(signature.move)).toBe("signature");

    // Guarded: parried, so she staggers.
    player.guarding = true;
    const result = executeMove(battle.foe, signature.move, player, noRng);
    expect(battle.onFoeActed(signature.move, true, result).parried).toBe(true);
    expect(battle.isStaggered).toBe(true);
    expect(battle.foe.bulk).toBeLessThan(1);
    const stagger = battle.intentFor(player, noRng);
    expect(stagger.move.id).toBe(STAGGER_MOVE_ID);
    expect(stagger.move.power).toBe(0);
    battle.onFoeActed(stagger.move, false, null);
    expect(battle.isStaggered).toBe(false);
    expect(battle.foe.bulk).toBe(1);
    // The pattern resumes after the signature.
    expect(battle.intentFor(player, noRng).move.id).toBe("ember-lash");
  });

  it("does not stagger on an unguarded signature", () => {
    const battle = boss();
    battle.foe.currentHp = 1;
    battle.checkTransform();
    const player = simCombatant("bramblewarden", 8);
    battle.onFoeActed(battle.intentFor(player, noRng).move, false, null);
    const signature = battle.intentFor(player, noRng);
    const result = executeMove(battle.foe, signature.move, player, noRng);
    expect(battle.onFoeActed(signature.move, false, result).parried).toBe(false);
    expect(battle.isStaggered).toBe(false);
  });

  it("is doused while Soaked: her Cinder form hits and defends as hearth", () => {
    const battle = boss();
    battle.foe.currentHp = 1;
    battle.checkTransform();
    battle.foe.statuses = [{ id: "soaked", turns: 2 }];
    const player = simCombatant("bramblewarden", 8);
    battle.onFoeActed(battle.intentFor(player, noRng).move, false, null);
    const intent = battle.intentFor(player, noRng);
    expect(intent.move.type).toBe("hearth");
    expect(battle.foe.folkloreType).toBe("hearth");
    battle.foe.statuses = [];
    battle.checkTransform();
    expect(battle.foe.folkloreType).toBe("ember");
  });
});

describe("Wren's assist", () => {
  function tickTo(battle: StoryBattle, player: BattleCombatant, turns: number) {
    const actions = [];
    for (let i = 0; i < turns; i++) {
      battle.onFoeActed(battle.intentFor(player, noRng).move, false, null);
      actions.push(battle.assistTick(player));
    }
    return actions;
  }

  it("acts every few foe turns and heals a hurt companion", () => {
    const battle = boss();
    const player = simCombatant("bramblewarden", 8);
    player.currentHp = Math.round(player.maxHp * 0.3);
    const actions = tickTo(battle, player, 3);
    expect(actions.slice(0, 2)).toEqual([null, null]);
    expect(actions[2]).toMatchObject({ kind: "heal" });
    expect(player.currentHp).toBeGreaterThan(Math.round(player.maxHp * 0.3));
  });

  it("cleanses a status", () => {
    const battle = boss();
    const player = simCombatant("bramblewarden", 8);
    player.statuses = [{ id: "rooted", turns: 2 }];
    const actions = tickTo(battle, player, 3);
    expect(actions[2]).toMatchObject({ kind: "cleanse", cleared: ["rooted"] });
    expect(player.statuses).toEqual([]);
  });

  it("drenches the boss, sooner, when her form hunts your lead", () => {
    const battle = boss();
    battle.foe.currentHp = 1;
    battle.checkTransform();
    const player = simCombatant("bramblewarden", 8);
    const actions = tickTo(battle, player, 2);
    expect(actions[1]).toEqual({ kind: "soak" });
    expect(hasStatus(battle.foe, "soaked")).toBe(true);
    expect(battle.foe.folkloreType).toBe("hearth");
    expect(describeAssist(actions[1]!, "Wren", "Bramblewarden", "Cinder Matriarch")).toMatch(/Soaked/);
  });

  it("dazes the boss when nobody needs help", () => {
    const battle = boss();
    const player = simCombatant("bramblewarden", 8);
    const actions = tickTo(battle, player, 3);
    expect(actions[2]).toEqual({ kind: "daze" });
    expect(hasStatus(battle.foe, "dazed")).toBe(true);
  });
});

describe("Wren's lineup", () => {
  it("sends her creatures one after another, and escalates on rematch", () => {
    const def = getStorySpar("rival-wren");
    const first = new StoryBattle(def, { partyAverage: 6, partySize: 2, rematch: false, maxLevel: MAX_LEVEL });
    expect(first.isBoss).toBe(false);
    expect(first.spriteCreatureId).toBe("lantern-fox");
    expect(first.remainingFoes).toBe(1);
    expect(first.nextFoe()?.name).toBe("Rootwalker");
    expect(first.spriteCreatureId).toBe("rootwalker");
    expect(first.nextFoe()).toBeNull();

    const rematch = new StoryBattle(def, { partyAverage: 6, partySize: 2, rematch: true, maxLevel: MAX_LEVEL });
    expect(rematch.remainingFoes).toBe(2);
    expect(rematch.foeLevel).toBe(first.level + def.rematchLevelBonus);
    // Never assists or transforms.
    expect(rematch.checkTransform()).toBeNull();
    expect(rematch.assistTick(simCombatant("bramblewarden", 6))).toBeNull();
  });
});
