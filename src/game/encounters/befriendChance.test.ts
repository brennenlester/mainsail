import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  afterBefriendMiss,
  battleBefriendAllowed,
  truncateLabel,
  BEFRIEND_BASE,
  BEFRIEND_FLEE_STREAK,
  BEFRIEND_MAX,
  BEFRIEND_MIN,
  befriendMissLine,
  computeBefriendOdds,
  formatBefriendBreakdown,
  formatBefriendOddsLabel,
  rollBefriendOdds,
  type BefriendInputs,
} from "./befriendChance";
import {
  availableOfferings,
  befriendOddsFor,
  consumeOffering,
  currentOffering,
  cycleOffering,
  offeringCostLine,
  resetOfferingChoiceForTest,
} from "./befriendRuntime";
import { setInventoryFromSnapshot, getItemCount, getMaterialCount } from "../inventory/playerInventory";
import { rollBefriendAttempt, GOD_BEFRIEND_CHANCE, TIDE_SOVEREIGN_ID } from "./godSail";
import { questProgress } from "../story/questProgress";
import { setStory1BefriendGuaranteeConsumed } from "../world/worldState";

const fresh: BefriendInputs = {
  rarityBias: 0,
  levelGap: 0,
  hpFraction: 1,
  statuses: [],
  offering: "none",
  leadBondTier: 0,
  habitatEdge: 0,
};

const fixed = (value: number) => () => value;

describe("befriend chance model (#366)", () => {
  it("a fresh, common, peer-level wild sits at the base chance", () => {
    const odds = computeBefriendOdds(fresh);
    expect(odds.chance).toBeCloseTo(BEFRIEND_BASE);
    expect(formatBefriendOddsLabel(odds.chance)).toBe("Befriend ~28%");
    expect(formatBefriendBreakdown(odds)).toEqual(["Base 28%"]);
  });

  it("weakening scales with missing HP", () => {
    const half = computeBefriendOdds({ ...fresh, hpFraction: 0.5 }).chance;
    const low = computeBefriendOdds({ ...fresh, hpFraction: 0.2 }).chance;
    expect(half).toBeGreaterThan(BEFRIEND_BASE);
    expect(low).toBeGreaterThan(half);
  });

  it("Rooted / Dazed help more than Burn / Soaked, and only the best status counts", () => {
    const rooted = computeBefriendOdds({ ...fresh, statuses: ["rooted"] }).chance;
    const burn = computeBefriendOdds({ ...fresh, statuses: ["burn"] }).chance;
    const both = computeBefriendOdds({ ...fresh, statuses: ["burn", "dazed"] }).chance;
    expect(rooted).toBeGreaterThan(burn);
    expect(both).toBeCloseTo(rooted);
  });

  it("Favorite Bait beats a Folk Seal", () => {
    const seal = computeBefriendOdds({ ...fresh, offering: "folk-seal" }).chance;
    const bait = computeBefriendOdds({ ...fresh, offering: "favorite-bait" }).chance;
    expect(seal).toBeGreaterThan(BEFRIEND_BASE);
    expect(bait).toBeGreaterThan(seal);
  });

  it("lead bond and a Curious / Loyal trait add a little", () => {
    const bond = computeBefriendOdds({ ...fresh, leadBondTier: 4 }).chance;
    const curious = computeBefriendOdds({ ...fresh, leadPersonality: "curious" }).chance;
    const bold = computeBefriendOdds({ ...fresh, leadPersonality: "bold" }).chance;
    expect(bond - BEFRIEND_BASE).toBeCloseTo(0.08);
    expect(curious).toBeGreaterThan(BEFRIEND_BASE);
    expect(bold).toBeCloseTo(BEFRIEND_BASE);
  });

  it("rare and higher-level wilds are harder", () => {
    const rare = computeBefriendOdds({ ...fresh, rarityBias: 2, levelGap: 2 });
    expect(rare.chance).toBeLessThan(BEFRIEND_BASE - 0.1);
    expect(formatBefriendBreakdown(rare)).toEqual(["Base 28%", "Rare −12%", "Wild +2 Lv −8%"]);
  });

  it("clamps to [min, max]", () => {
    const max = computeBefriendOdds({
      ...fresh,
      hpFraction: 0,
      statuses: ["rooted"],
      offering: "favorite-bait",
      leadBondTier: 4,
    });
    expect(max.chance).toBe(BEFRIEND_MAX);
    const min = computeBefriendOdds({ ...fresh, rarityBias: 2, levelGap: 10, habitatEdge: -1 });
    expect(min.chance).toBe(BEFRIEND_MIN);
  });

  it("Befriend in battle is opt-in: story spars and ghost fights never show it", () => {
    const open = { god: false, tutorial: false, visitor: false, owned: false, habitatOffers: true };
    expect(battleBefriendAllowed({ ...open, allowBefriend: true })).toBe(true);
    expect(battleBefriendAllowed(open)).toBe(false);
    expect(battleBefriendAllowed({ ...open, allowBefriend: false })).toBe(false);
    expect(battleBefriendAllowed({ ...open, allowBefriend: true, god: true })).toBe(false);
    expect(battleBefriendAllowed({ ...open, allowBefriend: true, tutorial: true })).toBe(false);
  });

  it("only the wild-encounter spar (and the dev preview) launch BattleScene with allowBefriend", () => {
    const root = path.join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) files.push(full);
      }
    };
    walk(root);
    const launchers = files.filter((f) => readFileSync(f, "utf8").includes('launch("BattleScene"'));
    // Story spars, ghost fights (share/challenge.ts) and future launchers default to false.
    expect(launchers.length).toBeGreaterThanOrEqual(2);
    for (const file of launchers) {
      const optsIn = readFileSync(file, "utf8").includes("allowBefriend: true");
      const allowed = file.endsWith("scenes/EncounterScene.ts") || file.endsWith("src/main.ts");
      expect(optsIn, path.relative(root, file)).toBe(allowed);
    }
  });

  it("long lead names are truncated so the breakdown never overflows", () => {
    expect(truncateLabel("Sir Fluffington the Third", 12)).toBe("Sir Fluffin…");
    const odds = computeBefriendOdds({ ...fresh, leadBondTier: 2, leadName: "Sir Fluffington the Third" });
    expect(formatBefriendBreakdown(odds)[1]).toBe("Sir Fluffin…'s bond +4%");
  });

  it("sovereigns keep their flat chance", () => {
    const odds = computeBefriendOdds({ ...fresh, godChance: 0.08, hpFraction: 0 });
    expect(odds.chance).toBe(0.08);
  });

  it("rolls against the shown chance with injected RNG", () => {
    const odds = computeBefriendOdds({ ...fresh, hpFraction: 0.5 });
    expect(rollBefriendOdds(odds, fixed(odds.chance - 0.001))).toBe(true);
    expect(rollBefriendOdds(odds, fixed(odds.chance))).toBe(false);
  });

  it("misses never hard-lock: the wild leaves only on a streak", () => {
    let misses = 0;
    for (let i = 1; i < BEFRIEND_FLEE_STREAK; i++) {
      const out = afterBefriendMiss(misses);
      expect(out.fled).toBe(false);
      misses = out.misses;
      expect(befriendMissLine("Mossling", out, false)).toContain("strikes first");
      expect(befriendMissLine("Mossling", out, true)).toContain("free turn");
    }
    const last = afterBefriendMiss(misses);
    expect(last.fled).toBe(true);
    expect(befriendMissLine("Mossling", last, true)).toContain("slipped away");
  });
});

describe("befriend runtime (offerings, story guarantee)", () => {
  beforeEach(() => {
    setInventoryFromSnapshot({}, {});
    resetOfferingChoiceForTest();
  });

  it("offers bait only when the favorite material is in the bag", () => {
    setInventoryFromSnapshot({}, { "favorite-bait": 1, "folk-seal": 1 });
    expect(availableOfferings("mossling")).toEqual(["none", "folk-seal"]);
    setInventoryFromSnapshot({ "wild-fiber": 1 }, { "favorite-bait": 1, "folk-seal": 1 });
    expect(availableOfferings("mossling")).toEqual(["none", "favorite-bait", "folk-seal"]);
    // Offerings are opt-in: nothing is spent until the player picks one.
    expect(currentOffering("mossling")).toBe("none");
    expect(cycleOffering("mossling")).toBe("favorite-bait");
    expect(cycleOffering("mossling")).toBe("folk-seal");
    expect(cycleOffering("mossling")).toBe("none");
    expect(befriendOddsFor({ creatureId: "mossling", lead: null, wildLevel: 1 }).terms.length).toBe(1);
  });

  it("spells out what an offering costs", () => {
    expect(offeringCostLine("mossling", "favorite-bait")).toBe("Bait: −1 Bait, −1 Wild Fiber");
    expect(offeringCostLine("mossling", "folk-seal")).toBe("Seal: −1 Folk Seal");
    expect(offeringCostLine("mossling", "none")).toBe("");
  });

  it("spends the bait and one favorite material per attempt", () => {
    setInventoryFromSnapshot({ "wild-fiber": 2 }, { "favorite-bait": 2 });
    consumeOffering("mossling", "favorite-bait");
    expect(getItemCount("favorite-bait")).toBe(1);
    expect(getMaterialCount("wild-fiber")).toBe(1);
  });

  it("sovereigns never take offerings", () => {
    setInventoryFromSnapshot({}, { "folk-seal": 3 });
    expect(availableOfferings(TIDE_SOVEREIGN_ID)).toEqual(["none"]);
    expect(befriendOddsFor({ creatureId: TIDE_SOVEREIGN_ID }).chance).toBe(GOD_BEFRIEND_CHANCE);
  });

  it("the Story 1 guarantee still wins regardless of the computed chance", () => {
    const prev = questProgress["first-befriend"];
    questProgress["first-befriend"] = "active";
    setStory1BefriendGuaranteeConsumed(false);
    try {
      expect(rollBefriendAttempt("mossling", fixed(0.999), 0.05)).toBe(true);
      expect(rollBefriendAttempt("mossling", fixed(0.999), 0.05)).toBe(false);
    } finally {
      questProgress["first-befriend"] = prev;
      setStory1BefriendGuaranteeConsumed(false);
    }
  });
});
