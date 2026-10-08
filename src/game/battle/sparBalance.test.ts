import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { CREATURES, getCreatureDefinition } from "../creatures/catalog";
import { getHunterTarget } from "../creatures/folkloreTypes";
import { winRate } from "./sparSim";

/**
 * Equal-level (Lv 1) 1v1 win-rate floors with a seeded rng (#364 review).
 * "sloppy" = always the best expected-damage move; "skilled" = guards into
 * telegraphed finishers, sets up a status, then cashes the finisher.
 */
const EVOLVED = new Set(["bramblewarden", "hearthflame"]);
const BASE_SPECIES = CREATURES.filter(
  (c) => !c.excludeFromCodex && !EVOLVED.has(c.id),
).map((c) => c.id);
const TUTORIAL_PAIRS = [
  ["mossling", "mossling"],
  ["mossling", "ember-wisp"],
  ["ember-wisp", "mossling"],
  ["ember-wisp", "ember-wisp"],
] as const;

/** The foe's type hunts the player's: a hard counter the player should switch out of. */
function isHardCounter(playerId: string, wildId: string): boolean {
  return (
    getHunterTarget(getCreatureDefinition(wildId).folkloreType) ===
    getCreatureDefinition(playerId).folkloreType
  );
}

const SEEDS = 40;
const rows: string[] = [];

describe("spar balance (seeded sim)", () => {
  it("the Story 2 tutorial spar is winnable even with sloppy play", () => {
    for (const [p, w] of TUTORIAL_PAIRS) {
      const sloppy = winRate(p, w, "sloppy", 200, true);
      const skilled = winRate(p, w, "skilled", 200, true);
      rows.push(`tutorial ${p} v ${w}: sloppy ${pct(sloppy)} skilled ${pct(skilled)}`);
      expect(sloppy, `${p} v ${w}`).toBeGreaterThanOrEqual(0.7);
      expect(skilled, `${p} v ${w}`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("equal-level baseline: sloppy ~mid, skilled clearly better, no dead matchups", () => {
    const totals = { sloppy: 0, skilled: 0 };
    let pairs = 0;
    for (const p of BASE_SPECIES) {
      for (const w of BASE_SPECIES) {
        const sloppy = winRate(p, w, "sloppy", SEEDS);
        const skilled = winRate(p, w, "skilled", SEEDS);
        totals.sloppy += sloppy;
        totals.skilled += skilled;
        pairs += 1;
        if (!isHardCounter(p, w)) {
          expect(skilled, `${p} v ${w} (skilled)`).toBeGreaterThanOrEqual(0.1);
        }
      }
    }
    const sloppy = totals.sloppy / pairs;
    const skilled = totals.skilled / pairs;
    rows.push(`overall (${pairs} pairs): sloppy ${pct(sloppy)} skilled ${pct(skilled)}`);
    expect(sloppy).toBeGreaterThanOrEqual(0.45);
    expect(sloppy).toBeLessThanOrEqual(0.65);
    expect(skilled).toBeGreaterThanOrEqual(0.65);
    expect(skilled).toBeLessThanOrEqual(0.85);
    expect(skilled - sloppy).toBeGreaterThanOrEqual(0.1);
  });

  it("previously broken pairs recover", () => {
    const checks: [string, string, number][] = [
      ["mossling", "brook-nymph", 0.85],
      ["brook-nymph", "thunder-finch", 0.5],
      ["mossling", "mossling", 0.9],
      ["ember-wisp", "mossling", 0.7],
    ];
    for (const [p, w, floor] of checks) {
      const sloppy = winRate(p, w, "sloppy", 200);
      const skilled = winRate(p, w, "skilled", 200);
      rows.push(`${p} v ${w}: sloppy ${pct(sloppy)} skilled ${pct(skilled)}`);
      expect(skilled, `${p} v ${w}`).toBeGreaterThanOrEqual(floor);
    }
  });

  afterAll(() => {
    // Set SPAR_BALANCE_OUT=/path to dump the win-rate table.
    if (process.env.SPAR_BALANCE_OUT) {
      writeFileSync(process.env.SPAR_BALANCE_OUT, rows.join("\n"));
    }
  });
});

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
