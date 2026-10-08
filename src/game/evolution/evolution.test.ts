import { beforeEach, describe, expect, it } from "vitest";
import { setPartyFromSnapshot } from "../creatures/party";
import type { CreatureInstance } from "../creatures/types";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";
import { LEVEL_XP_THRESHOLDS } from "../progression/leveling";
import { applyShrineFusion } from "../shrine/fusion";
import { setVisitorMode } from "../world/worldSession";
import { worldState } from "../world/worldState";
import {
  buildGrowthReveal,
  growthHeadline,
  growthSummaryLines,
  isFirstEvolution,
} from "./growthReveal";
import {
  acceptsResultKey,
  RESULT_KEY_DEBOUNCE_MS,
  BEAT_ORDER,
  evolutionDurations,
  evolutionTimeline,
  flickerSchedule,
  shouldOfferShare,
  timelineEnd,
} from "./timeline";

function member(
  overrides: Partial<CreatureInstance> &
    Pick<CreatureInstance, "instanceId" | "definitionId">,
): CreatureInstance {
  return {
    speciesId: overrides.definitionId,
    currentHp: 20,
    level: 3,
    xp: LEVEL_XP_THRESHOLDS[3],
    ...overrides,
  };
}

const NORMAL = { fast: false, reducedMotion: false };

describe("evolution timeline (#393)", () => {
  it("runs beats back to back in order", () => {
    const beats = evolutionTimeline("evolution", NORMAL);
    let at = 0;
    for (const id of BEAT_ORDER) {
      expect(beats[id].start).toBe(at);
      at += beats[id].duration;
    }
    expect(timelineEnd(beats)).toBe(at);
  });

  it("builds up before the flash and reveals right after it", () => {
    const b = evolutionTimeline("evolution", NORMAL);
    expect(b.buildUp.duration).toBeGreaterThan(1500);
    expect(b.flicker.duration).toBeGreaterThan(0);
    expect(b.reveal.start).toBe(b.flash.start + b.flash.duration);
    // Room for the 1.45 s sting rise before the flash.
    expect(b.flash.start).toBeGreaterThanOrEqual(1450);
  });

  it("presence is a lighter, shorter variant with no silhouette swap", () => {
    const evo = timelineEnd(evolutionTimeline("evolution", NORMAL));
    const presence = evolutionTimeline("presence", NORMAL);
    expect(presence.flicker.duration).toBe(0);
    expect(timelineEnd(presence)).toBeLessThan(evo);
  });

  it("Fast collapses the cutscene to about a second", () => {
    const fast = evolutionTimeline("evolution", { fast: true, reducedMotion: false });
    expect(timelineEnd(fast)).toBeLessThanOrEqual(1500);
    expect(fast.flicker.duration).toBe(0);
  });

  it("reduced motion drops the flicker but keeps total pacing calm", () => {
    const d = evolutionDurations("evolution", { fast: false, reducedMotion: true });
    expect(d.flicker).toBe(0);
    expect(d.buildUp).toBeGreaterThan(evolutionDurations("evolution", NORMAL).buildUp);
  });

  it("flicker accelerates and ends on the after form", () => {
    const times = flickerSchedule(1000);
    expect(times.length % 2).toBe(1);
    expect(times.at(-1)!).toBeLessThanOrEqual(1000);
    const gaps = times.map((t, i) => t - (times[i - 1] ?? 0));
    expect(gaps[gaps.length - 1]!).toBeLessThan(gaps[0]!);
    expect(flickerSchedule(0)).toEqual([]);
  });

  it("offers Share only on the first evolution when sharing works", () => {
    expect(shouldOfferShare({ kind: "evolution", firstEvolution: true }, true)).toBe(true);
    expect(shouldOfferShare({ kind: "evolution", firstEvolution: true }, false)).toBe(false);
    expect(shouldOfferShare({ kind: "evolution", firstEvolution: false }, true)).toBe(false);
    expect(shouldOfferShare({ kind: "presence", firstEvolution: true }, true)).toBe(false);
  });
});

describe("growth reveal data (#393)", () => {
  beforeEach(() => {
    setPartyFromSnapshot([], 1);
    setInventoryFromSnapshot({}, {});
    setVisitorMode(false);
    worldState.firstEvolutionCelebrated = false;
  });

  it("detects the first evolution from the party", () => {
    expect(isFirstEvolution([{ definitionId: "mossling", speciesId: "mossling" }])).toBe(true);
    expect(
      isFirstEvolution([
        { definitionId: "mossling", speciesId: "mossling" },
        { definitionId: "hearthflame", speciesId: "ember-wisp" },
      ]),
    ).toBe(false);
  });

  it("evolution returns before/after, stat deltas, new moves and bond", () => {
    const moss = member({ instanceId: "c-m", definitionId: "mossling", bond: 55 });
    setPartyFromSnapshot([moss], 1);
    setInventoryFromSnapshot({}, { "moss-salve": 1 });
    const result = applyShrineFusion("c-m", "moss-salve");
    expect(result.ok).toBe(true);
    const growth = result.ok ? result.growth : undefined;
    expect(growth).toBeDefined();
    expect(growth!.kind).toBe("evolution");
    expect(growthHeadline(growth!)).toBe("Mossling → Bramblewarden");
    expect(growth!.firstEvolution).toBe(true);
    expect(growth!.stats.map((s) => s.label)).toEqual(["Max HP", "Attack"]);
    expect(growth!.stats[0]!.after).toBeGreaterThan(growth!.stats[0]!.before);
    expect(growth!.newMoves).toContain("Thornquake");
    expect(growth!.newMoves).toEqual(["Bramble", "Ward", "Spore", "Thornquake"]);
    expect(growth!.bondName).toBe("Close");
    const lines = growthSummaryLines(growth!);
    expect(lines.at(-1)).toBe("Bond: Close ♥♥♥");
  });

  it("is not the first evolution once someone already grew", () => {
    const moss = member({ instanceId: "c-m", definitionId: "mossling" });
    const flame = member({ instanceId: "c-h", definitionId: "hearthflame", speciesId: "ember-wisp" });
    setPartyFromSnapshot([moss, flame], 1);
    setInventoryFromSnapshot({}, { "moss-salve": 1 });
    const result = applyShrineFusion("c-m", "moss-salve");
    expect(result.ok && result.growth?.firstEvolution).toBe(false);
  });

  it("the share nudge is once per save, even after the evolved companion is released (#399)", () => {
    setPartyFromSnapshot([member({ instanceId: "c-m", definitionId: "mossling" })], 1);
    setInventoryFromSnapshot({}, { "moss-salve": 2 });
    const first = applyShrineFusion("c-m", "moss-salve");
    expect(first.ok && first.growth?.firstEvolution).toBe(true);
    expect(worldState.firstEvolutionCelebrated).toBe(true);
    // Released: the party has no evolved member any more.
    setPartyFromSnapshot([member({ instanceId: "c-2", definitionId: "mossling" })], 3);
    const second = applyShrineFusion("c-2", "moss-salve");
    expect(second.ok && second.growth?.firstEvolution).toBe(false);
  });

  it("presence returns a lighter reveal on the same species", () => {
    const fox = member({ instanceId: "c-f", definitionId: "lantern-fox" });
    setPartyFromSnapshot([fox], 1);
    setInventoryFromSnapshot({}, { "fox-fire-charm": 1 });
    const result = applyShrineFusion("c-f", "fox-fire-charm");
    const growth = result.ok ? result.growth : undefined;
    expect(growth?.kind).toBe("presence");
    expect(growth?.before.definitionId).toBe(growth?.after.definitionId);
    expect(growth?.firstEvolution).toBe(false);
    expect(growthSummaryLines(growth!)).toContain("Overworld: shimmering moon presence");
  });

  it("non-growth buffs carry no reveal", () => {
    const moss = member({ instanceId: "c-m", definitionId: "mossling" });
    setPartyFromSnapshot([moss], 1);
    setInventoryFromSnapshot({}, { "ember-charm": 1 });
    const result = applyShrineFusion("c-m", "ember-charm");
    expect(result.ok).toBe(true);
    expect(result.ok && result.growth).toBeUndefined();
  });

  it("ignores result keys briefly after the panel appears (key-repeat / double press, #399)", () => {
    expect(acceptsResultKey(1000, 1000)).toBe(false);
    expect(acceptsResultKey(1000, 1000 + RESULT_KEY_DEBOUNCE_MS - 1)).toBe(false);
    expect(acceptsResultKey(1000, 1000 + RESULT_KEY_DEBOUNCE_MS)).toBe(true);
  });

  it("builder keeps only changed stats", () => {
    const side = { definitionId: "x", name: "X", maxHp: 10, attack: 5, moves: ["A"] };
    const reveal = buildGrowthReveal({
      kind: "presence",
      instanceId: "i",
      level: 1,
      before: side,
      after: { ...side, attack: 7 },
      bond: 0,
      firstEvolution: true,
    });
    expect(reveal.stats).toEqual([{ label: "Attack", before: 5, after: 7 }]);
    expect(reveal.firstEvolution).toBe(false);
  });
});
