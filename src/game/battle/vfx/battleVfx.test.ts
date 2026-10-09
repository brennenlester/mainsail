import { beforeEach, describe, expect, it } from "vitest";
import type { CreatureInstance } from "../../creatures/types";
import { LEVEL_XP_THRESHOLDS } from "../../progression/leveling";
import type { SparRewardSummary } from "../sparRewards";
import {
  BASE_TIMINGS,
  battleTimings,
  fastBattleEnabled,
  fastBattleExplicit,
  noteBattleWonForFast,
  setFastBattleEnabled,
  burstCount,
  HIT_PAUSE_MAX_MS,
  HIT_PAUSE_MIN_MS,
  hitPauseMs,
  intentGlow,
  shakeFor,
  vfxFamily,
  zoomPunchFor,
  type BattleFxMode,
} from "./battleTiming";
import { damageNumberStyle } from "./damageNumbers";
import {
  buildVictorySummary,
  evolutionReadyItem,
  xpBarSegments,
  xpFill,
} from "./victorySummary";

const FULL: BattleFxMode = { fast: false, reducedMotion: false, particles: true };
const FAST: BattleFxMode = { fast: true, reducedMotion: false, particles: true };
const REDUCED: BattleFxMode = { fast: false, reducedMotion: true, particles: true };

describe("battle timing table", () => {
  it("full mode uses the base beats", () => {
    expect(battleTimings(FULL)).toEqual(BASE_TIMINGS);
  });

  it("fast mode zeroes every travel beat but keeps a readable turn gap", () => {
    const t = battleTimings(FAST);
    expect(t.entrance).toBe(0);
    expect(t.lunge).toBe(0);
    expect(t.projectile).toBe(0);
    expect(t.vsBanner).toBe(0);
    expect(t.xpFill).toBe(0);
    expect(t.turnGap).toBeGreaterThan(0);
    expect(t.turnGap).toBeLessThan(BASE_TIMINGS.turnGap);
  });

  it("reduced motion shortens travel beats", () => {
    const t = battleTimings(REDUCED);
    expect(t.lunge).toBeLessThan(BASE_TIMINGS.lunge);
    expect(t.entranceStagger).toBe(0);
  });
});

describe("hit-pause", () => {
  it("stays within 60-90ms and scales with severity", () => {
    const light = hitPauseMs(1, 60, {}, FULL);
    const heavy = hitPauseMs(30, 60, {}, FULL);
    expect(light).toBeGreaterThanOrEqual(HIT_PAUSE_MIN_MS);
    expect(heavy).toBe(HIT_PAUSE_MAX_MS);
    expect(light).toBeLessThan(heavy);
  });

  it("maxes out for effective hits and finishers", () => {
    expect(hitPauseMs(2, 100, { effective: true }, FULL)).toBe(HIT_PAUSE_MAX_MS);
    expect(hitPauseMs(2, 100, { finisher: true }, FULL)).toBe(HIT_PAUSE_MAX_MS);
  });

  it("is skipped in fast mode and for zero damage", () => {
    expect(hitPauseMs(20, 40, { finisher: true }, FAST)).toBe(0);
    expect(hitPauseMs(0, 40, {}, FULL)).toBe(0);
  });
});

describe("camera feel", () => {
  it("never shakes or zooms under reduced motion / fast", () => {
    expect(shakeFor(20, true, true, REDUCED).ms).toBe(0);
    expect(shakeFor(20, true, true, FAST).ms).toBe(0);
    expect(zoomPunchFor(true, REDUCED)).toBe(1);
    expect(zoomPunchFor(true, FAST)).toBe(1);
  });

  it("punches only on finishers", () => {
    expect(zoomPunchFor(true, FULL)).toBeGreaterThan(1);
    expect(zoomPunchFor(false, FULL)).toBe(1);
    expect(shakeFor(20, false, true, FULL).amp).toBeGreaterThan(shakeFor(20, true, false, FULL).amp);
  });
});

describe("vfx families + bursts", () => {
  it("maps folklore types to particle families", () => {
    expect(vfxFamily("ember")).toBe("ember");
    expect(vfxFamily("hearth")).toBe("ember");
    expect(vfxFamily("water")).toBe("tide");
    expect(vfxFamily("woodland")).toBe("grove");
    expect(vfxFamily("fen")).toBe("grove");
    expect(vfxFamily("storm")).toBe("storm");
    expect(vfxFamily("twilight")).toBe("mist");
    expect(vfxFamily("earth")).toBe("neutral");
  });

  it("bursts scale with role / effectiveness and vanish when effects are off", () => {
    expect(burstCount("finisher", false, FULL)).toBeGreaterThan(burstCount("attack", false, FULL));
    expect(burstCount("attack", true, FULL)).toBeGreaterThan(burstCount("attack", false, FULL));
    expect(burstCount("attack", true, FAST)).toBe(0);
    expect(burstCount("attack", true, { ...FULL, particles: false })).toBe(0);
  });
});

describe("intent glow", () => {
  it("escalates as the finisher approaches", () => {
    expect(intentGlow("attack", 3).level).toBe(0);
    expect(intentGlow("attack", null).level).toBe(0);
    const charging = intentGlow("attack", 1);
    const now = intentGlow("finisher", 0);
    expect(charging.level).toBe(1);
    expect(now.level).toBe(2);
    expect(now.periodMs).toBeLessThan(charging.periodMs);
    expect(now.minAlpha).toBeLessThan(charging.minAlpha);
  });
});

describe("damage numbers", () => {
  it("styles a plain hit by side", () => {
    const out = damageNumberStyle({ kind: "hit", amount: 7, matchup: "neutral", target: "wild" });
    const inc = damageNumberStyle({ kind: "hit", amount: 7, matchup: "neutral", target: "player" });
    expect(out.text).toBe("−7");
    expect(out.color).not.toBe(inc.color);
    expect(out.callout).toBeUndefined();
  });

  it("makes effective hits big, gold and flashing", () => {
    const s = damageNumberStyle({ kind: "hit", amount: 14, matchup: "hunter", target: "wild" });
    expect(s.fontSize).toBeGreaterThanOrEqual(30);
    expect(s.callout?.text).toBe("Effective!");
    expect(s.screenFlash).toBeGreaterThan(0);
  });

  it("shrinks resisted hits", () => {
    const s = damageNumberStyle({ kind: "hit", amount: 3, matchup: "resisted", strong: true, target: "wild" });
    expect(s.fontSize).toBeLessThanOrEqual(18);
    expect(s.callout?.text).toBe("Resisted");
    expect(s.screenFlash).toBeUndefined();
  });

  it("gives strong hits and finishers the crit beat", () => {
    const strong = damageNumberStyle({ kind: "hit", amount: 13, matchup: "neutral", strong: true, target: "player" });
    expect(strong.fontSize).toBe(30);
    expect(strong.pop).toBeGreaterThan(1.3);
    const fin = damageNumberStyle({ kind: "hit", amount: 9, matchup: "neutral", finisher: true, target: "wild" });
    expect(fin.callout?.text).toBe("Finisher!");
  });

  it("covers miss / immune / heal / burn", () => {
    expect(damageNumberStyle({ kind: "miss", amount: 0, target: "wild" }).text).toBe("miss");
    expect(damageNumberStyle({ kind: "immune", amount: 0, target: "wild" }).callout?.text).toBe("No effect");
    expect(damageNumberStyle({ kind: "heal", amount: 4, target: "player" }).text).toBe("+4");
    expect(damageNumberStyle({ kind: "burn", amount: 2, target: "wild" }).text).toBe("−2");
  });
});

function creature(partial: Partial<CreatureInstance>): CreatureInstance {
  return {
    instanceId: "a",
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 1,
    xp: 0,
    ...partial,
  };
}

const reward: SparRewardSummary = {
  materialId: "moss-tuft",
  dustGained: 1,
  xpGained: 70,
  leveledUp: true,
  xpShares: [],
  bonusDrop: { label: "Lucky scrap", materialId: "folklore-dust", amount: 1 },
};

const deps = {
  definition: () => ({ name: "Mossling", maxHp: 30, attack: 10 }),
  materialName: (id: string) => ({ "moss-tuft": "Moss Tuft", "folklore-dust": "Folklore Dust", "moss-salve": "Moss Salve" })[id] ?? id,
};

describe("victory summary", () => {
  it("computes xp fill within a level", () => {
    expect(xpFill(LEVEL_XP_THRESHOLDS[3]!, 3)).toBe(0);
    const mid = (LEVEL_XP_THRESHOLDS[3]! + LEVEL_XP_THRESHOLDS[4]!) / 2;
    expect(xpFill(mid, 3)).toBeCloseTo(0.5);
  });

  it("builds rows with level-up stat gains, loot and the evolution hint", () => {
    const before = [{ instanceId: "a", definitionId: "mossling", level: 1, xp: 0 }];
    const after = [creature({ level: 3, xp: 25 })];
    const s = buildVictorySummary(before, after, reward, deps);
    expect(s.rows).toHaveLength(1);
    const row = s.rows[0]!;
    expect(row.xpGained).toBe(25);
    expect(row.fromLevel).toBe(1);
    expect(row.toLevel).toBe(3);
    expect(row.gains?.hp).toBeGreaterThan(0);
    expect(s.loot).toEqual(["+1 Moss Tuft", "+1 Folklore Dust", "Lucky scrap: +1 Folklore Dust"]);
    expect(s.evolutionHint).toContain("Moss Salve");
  });

  it("tells the player when spar bond is capped for today (#417)", () => {
    const before = [{ instanceId: "a", definitionId: "mossling", level: 1, xp: 0 }];
    const after = [creature({ level: 1, xp: 5 })];
    const one = buildVictorySummary(before, after, { ...reward, bondFullNames: ["Pip"] }, deps);
    expect(one.loot.at(-1)).toBe("Bond full for today: Pip");
    const two = buildVictorySummary(before, after, { ...reward, bondFullNames: ["Pip", "Moss", "Fern"] }, deps);
    expect(two.loot.at(-1)).toBe("Bond full for today: Pip +2");
  });

  it("skips creatures that gained nothing and evolutions already taken", () => {
    const before = [
      { instanceId: "a", definitionId: "mossling", level: 2, xp: 5 },
      { instanceId: "b", definitionId: "mossling", level: 2, xp: 5 },
    ];
    const after = [
      creature({ instanceId: "a", level: 2, xp: 12, appliedEffects: ["mossling:moss-salve"] }),
      creature({ instanceId: "b", level: 2, xp: 5 }),
    ];
    const s = buildVictorySummary(before, after, { ...reward, bonusDrop: undefined }, deps);
    expect(s.rows.map((r) => r.instanceId)).toEqual(["a"]);
    expect(s.rows[0]!.gains).toBeUndefined();
    expect(s.evolutionHint).toBeUndefined();
    expect(evolutionReadyItem(creature({ definitionId: "stone-hound" }))).toBeUndefined();
  });

  it("splits xp bar animation at each level boundary", () => {
    expect(xpBarSegments({ fromLevel: 2, toLevel: 2, fromFill: 0.2, toFill: 0.6 })).toEqual([[0.2, 0.6]]);
    expect(xpBarSegments({ fromLevel: 2, toLevel: 4, fromFill: 0.5, toFill: 0.25 })).toEqual([
      [0.5, 1],
      [0, 1],
      [0, 0.25],
    ]);
  });
});

describe("Fast battles turn on after the second win (#426)", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults off, turns on after two won battles, and saves it", () => {
    expect(fastBattleEnabled()).toBe(false);
    expect(noteBattleWonForFast()).toBe(false);
    expect(fastBattleEnabled()).toBe(false);
    expect(noteBattleWonForFast()).toBe(true);
    expect(fastBattleEnabled()).toBe(true);
    expect(window.localStorage.getItem("ivyward-fast-battle")).toBe("1");
  });

  it("never overrides a choice the player made", () => {
    setFastBattleEnabled(false);
    for (let i = 0; i < 5; i++) {
      expect(noteBattleWonForFast()).toBe(false);
    }
    expect(fastBattleEnabled()).toBe(false);
  });

  it("does not count wins until the first evolution is complete", () => {
    for (let i = 0; i < 5; i++) {
      expect(noteBattleWonForFast(false)).toBe(false);
    }
    expect(fastBattleEnabled()).toBe(false);
    expect(window.localStorage.getItem("ivyward-fast-battle-wins")).toBeNull();
    noteBattleWonForFast(true);
    expect(noteBattleWonForFast(true)).toBe(true);
  });

  it("only a deliberate Fast counts for cutscenes, not the auto default", () => {
    noteBattleWonForFast();
    noteBattleWonForFast();
    expect(fastBattleEnabled()).toBe(true);
    expect(fastBattleExplicit()).toBe(false);
    setFastBattleEnabled(true);
    expect(fastBattleExplicit()).toBe(true);
    setFastBattleEnabled(false);
    expect(fastBattleExplicit()).toBe(false);
  });

  it("a saved Fast with no auto marker counts as explicit", () => {
    window.localStorage.setItem("ivyward-fast-battle", "1");
    expect(fastBattleExplicit()).toBe(true);
  });

  it("turning it off after the auto switch sticks", () => {
    noteBattleWonForFast();
    noteBattleWonForFast();
    setFastBattleEnabled(false);
    noteBattleWonForFast();
    noteBattleWonForFast();
    expect(fastBattleEnabled()).toBe(false);
  });
});
