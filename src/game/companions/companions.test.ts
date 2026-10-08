import { beforeEach, describe, expect, it } from "vitest";
import { CREATURES } from "../creatures/catalog";
import type { CreatureInstance } from "../creatures/types";
import { playerInventory } from "../inventory/playerInventory";
import { MATERIAL_NAMES } from "../inventory/materials";
import { getZone } from "../world/zones";
import { getZoneProps } from "../world/zoneProps";
import { TileType } from "../world/zoneTypes";
import { canOccupy } from "../world/collision";
import {
  canUseAbility,
  COMPANION_SITES,
  findAbilityUser,
  findSiteInteraction,
  grantsAbilityBond,
  isletTiles,
  siteHintYields,
  persistablePosition,
  revealedSiteProps,
} from "./abilities";
import {
  addBond,
  applyBondToCombatant,
  BOND_GAIN,
  BOND_MAX,
  BOND_TIER_THRESHOLDS,
  bondBattleBonus,
  bondGainFor,
  bondTier,
  bondTierProgress,
  drainBondTierUps,
  tickBattleBond,
  tickStoryWinBond,
} from "./bond";
import {
  claimSite,
  getClaimedSites,
  giftFavorite,
  GIFT_COOLDOWN_MS,
  GIFT_COST,
  normalizeNickname,
  resetCompanionStateForTests,
} from "./companionState";
import { FAVORITE_MATERIALS, getFavoriteMaterial } from "./favorites";
import { canOpenNicknamePrompt } from "../ui/nicknamePrompt";
import {
  curiousDetour,
  hashSeed,
  PERSONALITY_IDS,
  personalityBondMultiplier,
  personalityFollowerOffset,
  personalitySeed,
  pickBark,
  rollPersonality,
} from "./personality";

function creature(overrides: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    instanceId: "c-1",
    definitionId: "mossling",
    speciesId: "mossling",
    currentHp: 10,
    level: 1,
    xp: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetCompanionStateForTests();
  drainBondTierUps();
  playerInventory.materials = {};
  playerInventory.items = {};
});

describe("personality", () => {
  it("rolls the same trait for the same seed", () => {
    const seed = personalitySeed("Rowan", "c-3", "mossling");
    expect(rollPersonality(seed)).toBe(rollPersonality(seed));
    expect(hashSeed(seed)).toBe(hashSeed(seed));
  });

  it("varies across players and instances", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 40; i += 1) {
      seen.add(rollPersonality(personalitySeed("Rowan", `c-${i}`, "mossling")));
    }
    // 40 rolls over 8 traits should hit most of them.
    expect(seen.size).toBeGreaterThanOrEqual(6);
    expect(personalitySeed(null, "c-1", "mossling")).toBe("|c-1|mossling");
  });

  it("pins a known seed so saves stay stable across releases", () => {
    expect(rollPersonality("|c-1|mossling")).toBe(
      PERSONALITY_IDS[hashSeed("|c-1|mossling") % PERSONALITY_IDS.length],
    );
    expect(hashSeed("")).toBe(0x811c9dc5);
  });

  it("amplifies one bond source per trait", () => {
    expect(personalityBondMultiplier("loyal", "battle")).toBe(1.5);
    expect(personalityBondMultiplier("loyal", "gift")).toBe(1);
    expect(personalityBondMultiplier("greedy", "gift")).toBe(1.5);
    expect(personalityBondMultiplier("curious", "ability")).toBe(1.5);
    expect(personalityBondMultiplier(undefined, "battle")).toBe(1);
  });

  it("bold leads, shy lags, others keep formation", () => {
    const base = { dx: 0, dy: -14 };
    expect(personalityFollowerOffset("bold", "south", base)).toEqual({ dx: 0, dy: 14 });
    expect(personalityFollowerOffset("shy", "south", base).dy).toBeLessThan(-14);
    expect(personalityFollowerOffset("gentle", "south", base)).toEqual(base);
  });

  it("curious detour is bounded and eased", () => {
    const from = { x: 0, y: 0 };
    expect(curiousDetour(from, { x: 100, y: 0 }, 0)).toEqual(from);
    expect(curiousDetour(from, { x: 100, y: 0 }, 1).x).toBeLessThanOrEqual(26);
    expect(curiousDetour(from, { x: 4, y: 0 }, 1)).toEqual(from);
  });

  it("barks pick from the trait's lines", () => {
    expect(pickBark("sleepy", 0)).toBe("Zzz...");
    expect(pickBark("sleepy", 0.999)).toBeTypeOf("string");
  });
});

describe("bond math", () => {
  it("maps points to five tiers", () => {
    expect(bondTier(0)).toBe(0);
    expect(bondTier(undefined)).toBe(0);
    expect(bondTier(BOND_TIER_THRESHOLDS[1]! - 1)).toBe(0);
    expect(bondTier(BOND_TIER_THRESHOLDS[1]!)).toBe(1);
    expect(bondTier(BOND_TIER_THRESHOLDS[4]!)).toBe(4);
    expect(bondTier(99999)).toBe(4);
    expect(bondTier(Number.NaN)).toBe(0);
  });

  it("reports progress within a tier", () => {
    expect(bondTierProgress(0)).toBe(0);
    expect(bondTierProgress(35)).toBeCloseTo(0.5);
    expect(bondTierProgress(BOND_MAX)).toBe(1);
  });

  it("applies personality multipliers with a floor of 1", () => {
    expect(bondGainFor(4, "ability", "curious")).toBe(6);
    expect(bondGainFor(1, "battle", undefined)).toBe(1);
    expect(bondGainFor(0, "battle", "loyal")).toBe(0);
  });

  it("caps at BOND_MAX and queues tier-ups once", () => {
    const c = creature({ bond: 18 });
    const tick = addBond(c, 4, "ability");
    expect(c.bond).toBe(22);
    expect(tick.tierUp).toBe(1);
    expect(drainBondTierUps()).toEqual([{ instanceId: "c-1", tier: 1 }]);
    expect(drainBondTierUps()).toEqual([]);
    c.bond = BOND_MAX - 1;
    addBond(c, 50, "gift");
    expect(c.bond).toBe(BOND_MAX);
  });

  it("battle ticks favor the fighter", () => {
    const a = creature({ instanceId: "c-1" });
    const b = creature({ instanceId: "c-2" });
    tickBattleBond([a, b], 1);
    expect(a.bond).toBe(BOND_GAIN.battleBench);
    expect(b.bond).toBe(BOND_GAIN.battleFighter);
  });

  it("a typical arc ends Close on the lead and Friendly on the rest (#418)", () => {
    // Scripted ~20 minute arc, neutral personalities: 8 wild spar wins with
    // the lead fighting, the rival + boss first wins, one evolution of the
    // lead, two favorite gifts to the lead, two first-claim ability uses by
    // the second companion.
    const lead = creature({ instanceId: "lead", personality: undefined });
    const second = creature({ instanceId: "second", personality: undefined });
    const third = creature({ instanceId: "third", personality: undefined });
    const party = [lead, second, third];
    for (let i = 0; i < 8; i += 1) tickBattleBond(party, 0);
    tickStoryWinBond(party); // rival
    addBond(lead, BOND_GAIN.evolution, "growth");
    addBond(lead, BOND_GAIN.gift, "gift");
    addBond(lead, BOND_GAIN.gift, "gift");
    addBond(second, BOND_GAIN.ability, "ability");
    addBond(second, BOND_GAIN.ability, "ability");
    tickStoryWinBond(party); // Matriarch
    drainBondTierUps();
    expect(bondTier(lead.bond)).toBeGreaterThanOrEqual(2);
    expect(bondTier(lead.bond)).toBeLessThanOrEqual(3);
    for (const other of [second, third]) {
      expect(bondTier(other.bond)).toBeGreaterThanOrEqual(1);
      expect(bondTier(other.bond)).toBeLessThanOrEqual(2);
    }
    // Not trivial: Kindred still takes a long grind of wild spars.
    expect(Math.ceil(BOND_TIER_THRESHOLDS[4]! / BOND_GAIN.battleFighter)).toBeGreaterThanOrEqual(30);
  });

  it("exposes a small pure battle bonus", () => {
    expect(bondBattleBonus(0)).toEqual({ tier: 0, damageScale: 1 });
    expect(bondBattleBonus(BOND_MAX).damageScale).toBeCloseTo(1.08);
    const combatant = { damageScale: 0.5 };
    applyBondToCombatant(combatant, { bond: BOND_MAX });
    expect(combatant.damageScale).toBeCloseTo(0.54);
  });
});

describe("favorites + gifts", () => {
  it("every favorite is a real material", () => {
    for (const materialId of Object.values(FAVORITE_MATERIALS)) {
      expect(MATERIAL_NAMES[materialId]).toBeDefined();
    }
    expect(getFavoriteMaterial("tide-sovereign")).toBe("folklore-dust");
    const codexIds = CREATURES.filter((c) => !c.excludeFromCodex).map((c) => c.id);
    for (const id of codexIds) {
      expect(getFavoriteMaterial(id)).toBeTypeOf("string");
    }
  });

  it("gifting the favorite costs materials, raises bond, then cools down", () => {
    const c = creature();
    expect(giftFavorite(c, 1000).ok).toBe(false);
    playerInventory.materials["wild-fiber"] = GIFT_COST * 2;
    const first = giftFavorite(c, 1000);
    expect(first.ok).toBe(true);
    expect(c.bond).toBe(BOND_GAIN.gift);
    expect(playerInventory.materials["wild-fiber"]).toBe(GIFT_COST);
    expect(giftFavorite(c, 1000 + GIFT_COOLDOWN_MS - 1).ok).toBe(false);
    expect(giftFavorite(c, 1000 + GIFT_COOLDOWN_MS).ok).toBe(true);
  });
});

describe("nicknames", () => {
  it("normalizes", () => {
    expect(normalizeNickname("  Sir   Moss ")).toBe("Sir Moss");
    expect(normalizeNickname("   ")).toBeUndefined();
    expect(normalizeNickname("x".repeat(17))).toBeUndefined();
  });
});

describe("abilities", () => {
  it("eligibility follows current type, shrine element, and HP", () => {
    const ember = creature({ definitionId: "ember-wisp", speciesId: "ember-wisp" });
    expect(canUseAbility(ember, "burn")).toBe(true);
    expect(canUseAbility(ember, "ford")).toBe(false);
    expect(canUseAbility({ ...ember, currentHp: 0 }, "burn")).toBe(false);
    const moss = creature();
    expect(canUseAbility(moss, "sense")).toBe(true);
    expect(canUseAbility({ ...moss, secondaryElement: "water" }, "ford")).toBe(true);
    const brook = creature({ definitionId: "brook-nymph", speciesId: "brook-nymph" });
    expect(findAbilityUser([moss, brook], "ford")).toBe(brook);
    expect(findAbilityUser([moss], "burn")).toBeUndefined();
  });

  it("ships at least three abilities across optional sites", () => {
    const abilities = new Set(COMPANION_SITES.map((s) => s.ability));
    expect(abilities).toEqual(new Set(["burn", "ford", "sense"]));
    expect(new Set(COMPANION_SITES.map((s) => s.id)).size).toBe(COMPANION_SITES.length);
    for (const site of COMPANION_SITES) {
      for (const id of Object.keys(site.reward.materials)) {
        expect(MATERIAL_NAMES[id]).toBeDefined();
      }
    }
  });

  it("sites sit on walkable floor clear of existing props", () => {
    for (const site of COMPANION_SITES) {
      const zone = getZone(site.zoneId);
      expect(canOccupy(zone, site.x, site.y)).toBe(true);
      const clash = getZoneProps(site.zoneId).some((p) => p.x === site.x && p.y === site.y);
      expect(clash).toBe(false);
    }
  });

  it("islets are floor surrounded by water, unreachable on foot", () => {
    const zone = getZone("overworld");
    for (const tile of isletTiles("overworld")) {
      expect(zone.tiles[tile.y]![tile.x]).toBe(TileType.Floor);
      expect(zone.tiles[tile.y - 1]![tile.x]).toBe(TileType.Water);
    }
  });

  it("ford: use from shore, stash on islet, always a way back", () => {
    const claimed = new Set<string>();
    expect(findSiteInteraction("overworld", 2, 12, claimed)?.kind).toBe("use");
    expect(findSiteInteraction("overworld", 2, 14, claimed)?.kind).toBe("stash");
    claimed.add("fields-west-islet");
    expect(findSiteInteraction("overworld", 2, 14, claimed)?.kind).toBe("ford-back");
    expect(findSiteInteraction("overworld", 7, 7, claimed)).toBeUndefined();
  });

  it("pays ability bond once per site (no ford farming)", () => {
    const claimed = new Set<string>();
    const ford = findSiteInteraction("overworld", 2, 12, claimed)!;
    // Fording itself never pays; the stash claim does, once.
    expect(grantsAbilityBond(ford, claimed)).toBe(false);
    const stash = findSiteInteraction("overworld", 2, 14, claimed)!;
    expect(grantsAbilityBond(stash, claimed)).toBe(true);
    claimed.add("fields-west-islet");
    expect(grantsAbilityBond(findSiteInteraction("overworld", 2, 12, claimed)!, claimed)).toBe(false);
    expect(grantsAbilityBond(findSiteInteraction("overworld", 2, 14, claimed)!, claimed)).toBe(false);
    const brush = findSiteInteraction("overworld", 2, 2, new Set())!;
    expect(grantsAbilityBond(brush, new Set())).toBe(true);
    expect(grantsAbilityBond(brush, new Set(["fields-brush"]))).toBe(false);
  });

  it("site hints yield E to gathering only when no companion can act", () => {
    expect(siteHintYields(false, true)).toBe(true);
    expect(siteHintYields(false, false)).toBe(false);
    expect(siteHintYields(true, true)).toBe(false);
  });

  it("defers the nickname prompt while anything else is open", () => {
    const base = { queued: 1, promptOpen: false, busy: false, topOverlay: null };
    expect(canOpenNicknamePrompt(base)).toBe(true);
    expect(canOpenNicknamePrompt({ ...base, queued: 0 })).toBe(false);
    expect(canOpenNicknamePrompt({ ...base, promptOpen: true })).toBe(false);
    expect(canOpenNicknamePrompt({ ...base, busy: true })).toBe(false);
    expect(canOpenNicknamePrompt({ ...base, topOverlay: "party" })).toBe(false);
  });

  it("persists islet stands at the ford shore", () => {
    expect(persistablePosition("overworld", 3, 14)).toEqual({ x: 2, y: 12 });
    expect(persistablePosition("overworld", 12.2, 13.8)).toEqual({ x: 12, y: 12 });
    expect(persistablePosition("overworld", 7, 7)).toEqual({ x: 7, y: 7 });
    expect(persistablePosition("grove", 2, 14)).toEqual({ x: 2, y: 14 });
  });

  it("claims once and reveals sensed gather nodes", () => {
    expect(claimSite("grove-hidden-fern")).toContain("Moss Fiber");
    expect(claimSite("grove-hidden-fern")).toBeUndefined();
    expect(playerInventory.materials["moss-fiber"]).toBe(3);
    expect(revealedSiteProps("grove", getClaimedSites())).toEqual([
      { x: 8, y: 8, kind: "fern" },
    ]);
    expect(getZoneProps("grove").some((p) => p.x === 8 && p.y === 8)).toBe(true);
    expect(findSiteInteraction("grove", 8, 8, getClaimedSites())).toBeUndefined();
  });
});
