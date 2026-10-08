import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import type { StorySparId } from "../../story/questTypes";
import { STORY_PARTIES, storyPartyRate, type StoryPartySize } from "./storyBattleBalance";

/**
 * Story battle balance report (#385; slow, skipped by default). Run with
 *   STORY_REPORT=/tmp/story.txt npx vitest run src/game/battle/boss/storyBattleReport.test.ts
 * Optional: STORY_SEEDS (default 300), STORY_LEVELS (default 5,8,12).
 */
const OUT = process.env.STORY_REPORT;
const SEEDS = Number(process.env.STORY_SEEDS ?? 300);
const LEVELS = (process.env.STORY_LEVELS ?? "5,8,12").split(",").map(Number);
const POLICIES = ["random", "max-damage", "skilled"] as const;
const SPARS: { id: StorySparId; rematch: boolean }[] = [
  { id: "rival-wren", rematch: false },
  { id: "rival-wren", rematch: true },
  { id: "cinder-matriarch", rematch: false },
];

const pct = (r: number) => `${Math.round(r * 100)}%`.padStart(5);

describe.skipIf(!OUT)("story battle report", () => {
  it("writes the win-rate table", () => {
    const lines: string[] = [];
    for (const spar of SPARS) {
      for (const level of LEVELS) {
        lines.push(`${spar.id}${spar.rematch ? " (rematch)" : ""} @ Lv ${level}`);
        lines.push(`  party   ${POLICIES.map((p) => p.padStart(10)).join("")}`);
        for (const size of Object.keys(STORY_PARTIES).map(Number) as StoryPartySize[]) {
          const cells = POLICIES.map((policy) =>
            pct(storyPartyRate(spar.id, size, policy, level, SEEDS, spar.rematch).winRate).padStart(10),
          );
          lines.push(`  ${String(size).padEnd(6)}  ${cells.join("")}`);
        }
      }
    }
    writeFileSync(OUT!, `${lines.join("\n")}\n`);
  }, 600_000);
});
