import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { CREATURES, getCreatureDefinition } from "../creatures/catalog";
import { getHunterTarget } from "../creatures/folkloreTypes";
import { sparStats, type SparPolicy } from "./sparSim";

/**
 * Full balance report (slow; skipped by default). Run with
 *   SPAR_REPORT=/tmp/spar.txt npx vitest run src/game/battle/sparReport.test.ts
 * Optional: SPAR_SEEDS (default 100), SPAR_LEVELS (default 1,10,25,40).
 */
const OUT = process.env.SPAR_REPORT;
const SEEDS = Number(process.env.SPAR_SEEDS ?? 100);
const LEVELS = (process.env.SPAR_LEVELS ?? "1,10,25,40").split(",").map(Number);
const POLICIES: SparPolicy[] = ["random", "max-damage", "skilled"];

const EVOLVED = new Set(["bramblewarden", "hearthflame"]);
const SPECIES = CREATURES.filter((c) => !c.excludeFromCodex && !EVOLVED.has(c.id)).map(
  (c) => c.id,
);
const TUTORIAL = [
  ["mossling", "mossling"],
  ["mossling", "ember-wisp"],
  ["ember-wisp", "mossling"],
  ["ember-wisp", "ember-wisp"],
] as const;

function hunts(attacker: string, defender: string): boolean {
  return (
    getHunterTarget(getCreatureDefinition(attacker).folkloreType) ===
    getCreatureDefinition(defender).folkloreType
  );
}

/** First base species whose type hunts the wild's type. */
function answerFor(wildId: string): string {
  return SPECIES.find((id) => hunts(id, wildId))!;
}

const pct = (r: number) => `${Math.round(r * 100)}%`.padStart(4);

describe.skipIf(!OUT)("spar balance report", () => {
  it("writes the report", () => {
    const lines: string[] = [];
    lines.push(`seeds=${SEEDS}, ${SPECIES.length} species, ${SPECIES.length ** 2} pairs`);
    for (const [p, w] of TUTORIAL) {
      const row = POLICIES.map((policy) =>
        pct(sparStats({ party: [p], wild: w, policy, tutorial: true }, 200).winRate),
      );
      lines.push(`tutorial ${p} v ${w}: random/max/skilled ${row.join(" ")}`);
    }
    for (const level of LEVELS) {
      const sums: Record<string,{ win: number; turns: number; fin: number; st: number }> = {
        random: { win: 0, turns: 0, fin: 0, st: 0 },
        "max-damage": { win: 0, turns: 0, fin: 0, st: 0 },
        skilled: { win: 0, turns: 0, fin: 0, st: 0 },
      };
      const skilledRows: { pair: string; rate: number; counter: boolean }[] = [];
      for (const p of SPECIES) {
        for (const w of SPECIES) {
          for (const policy of POLICIES) {
            const s = sparStats({ party: [p], wild: w, policy, level }, SEEDS);
            sums[policy].win += s.winRate;
            sums[policy].turns += s.avgTurns;
            sums[policy].fin += s.avgFinishers;
            sums[policy].st += s.avgStatuses;
            if (policy === "skilled") {
              skilledRows.push({ pair: `${p} v ${w}`, rate: s.winRate, counter: hunts(w, p) });
            }
          }
        }
      }
      const n = SPECIES.length ** 2;
      lines.push(`\n== Lv ${level} ==`);
      for (const policy of POLICIES) {
        const s = sums[policy];
        lines.push(
          `${policy.padEnd(10)} win ${pct(s.win / n)}  turns ${(s.turns / n).toFixed(1)}  finishers ${(s.fin / n).toFixed(2)}  statuses ${(s.st / n).toFixed(2)}`,
        );
      }
      const open = skilledRows.filter((r) => !r.counter);
      const counters = skilledRows.filter((r) => r.counter);
      lines.push(
        `skilled non-counter pairs <20%: ${open.filter((r) => r.rate < 0.2).length}, <10%: ${open.filter((r) => r.rate < 0.1).length}; hard counters (${counters.length}) avg ${pct(counters.reduce((a, r) => a + r.rate, 0) / counters.length)}, <10%: ${counters.filter((r) => r.rate < 0.1).length}`,
      );
      const worst = [...open].sort((a, b) => a.rate - b.rate).slice(0, 8);
      lines.push(`worst non-counter: ${worst.map((r) => `${r.pair} ${pct(r.rate).trim()}`).join(", ")}`);
      const best = [...skilledRows].sort((a, b) => b.rate - a.rate).slice(0, 4);
      lines.push(`best: ${best.map((r) => `${r.pair} ${pct(r.rate).trim()}`).join(", ")}`);
      // Per-species skilled average (as player), to spot stat outliers.
      const perSpecies = SPECIES.map((sp) => {
        const rows = skilledRows.filter((r) => r.pair.startsWith(`${sp} v `));
        return { sp, rate: rows.reduce((a, r) => a + r.rate, 0) / rows.length };
      }).sort((a, b) => a.rate - b.rate);
      lines.push(`species (skilled as player): ${perSpecies.map((r) => `${r.sp} ${pct(r.rate).trim()}`).join(", ")}`);
    }
    // Hard counters (foe hunts the lead): 1v1 vs bringing a counter-pick partner.
    lines.push("\n== hard counters (Lv 10): 1v1 skilled -> party [lead, answer] skilled / max-damage ==");
    for (const p of SPECIES) {
      for (const w of SPECIES) {
        if (!hunts(w, p)) continue;
        const answer = answerFor(w);
        const solo = sparStats({ party: [p], wild: w, policy: "skilled", level: 10 }, SEEDS);
        const duo = sparStats({ party: [p, answer], wild: w, policy: "skilled", level: 10 }, SEEDS);
        const duoMax = sparStats({ party: [p, answer], wild: w, policy: "max-damage", level: 10 }, SEEDS);
        if (solo.winRate < 0.2) {
          lines.push(`${p} v ${w}: ${pct(solo.winRate)} -> +${answer} ${pct(duo.winRate)} / ${pct(duoMax.winRate)}`);
        }
      }
    }
    // Overworld: starter trio vs every wild at party level +0/+1/+2 (rarity bias).
    lines.push("\n== overworld: [mossling, ember-wisp, brook-nymph] Lv 5 vs wild Lv 5/6/7 ==");
    for (const policy of POLICIES) {
      const rates = [5, 6, 7].map((wildLevel) => {
        const total = SPECIES.reduce(
          (sum, w) =>
            sum +
            sparStats(
              { party: ["mossling", "ember-wisp", "brook-nymph"], wild: w, policy, level: 5, wildLevel },
              SEEDS,
            ).winRate,
          0,
        );
        return pct(total / SPECIES.length);
      });
      lines.push(`${policy.padEnd(10)} ${rates.join(" ")}`);
    }
    for (const policy of POLICIES) {
      const rates = [5, 6, 7].map((wildLevel) => {
        const total = SPECIES.reduce(
          (sum, w) =>
            sum + sparStats({ party: ["mossling"], wild: w, policy, level: 5, wildLevel }, SEEDS).winRate,
          0,
        );
        return pct(total / SPECIES.length);
      });
      lines.push(`solo mossling ${policy.padEnd(10)} ${rates.join(" ")}`);
    }
    writeFileSync(OUT!, lines.join("\n") + "\n");
  }, 600_000);
});
