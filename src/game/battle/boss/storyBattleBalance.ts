import type { StorySparId } from "../../story/questTypes";
import { storyBattleStats, type StorySimSetup, type StorySimStats } from "./storyBattleSim";

/**
 * Reference parties for story battle tuning (#385): 1, 2 and 3 evolved
 * companions. Each size averages a few lead orders, since the lead (and so
 * the opening matchup) is the player's choice.
 */
export const STORY_PARTIES = {
  1: [["bramblewarden"], ["hearthflame"]],
  2: [
    ["bramblewarden", "hearthflame"],
    ["hearthflame", "bramblewarden"],
  ],
  3: [
    ["bramblewarden", "hearthflame", "brook-nymph"],
    ["hearthflame", "brook-nymph", "bramblewarden"],
    ["brook-nymph", "bramblewarden", "hearthflame"],
  ],
} as const satisfies Record<number, readonly (readonly string[])[]>;

export type StoryPartySize = keyof typeof STORY_PARTIES;

/** Expected party level when each beat is reached on a ~20 minute cold run. */
export const EXPECTED_LEVEL: Readonly<Record<StorySparId, number>> = {
  "rival-wren": 6,
  "cinder-matriarch": 8,
};

/** Mean stats over every lead order of one party size. */
export function storyPartyRate(
  sparId: StorySparId,
  size: StoryPartySize,
  policy: StorySimSetup["policy"],
  level = EXPECTED_LEVEL[sparId],
  seeds = 300,
  rematch = false,
  ward = 1,
): StorySimStats {
  const parties = STORY_PARTIES[size];
  const runs = parties.map((party) =>
    storyBattleStats({ sparId, party, level, policy, rematch, ward }, seeds),
  );
  const mean = (pick: (s: StorySimStats) => number) =>
    runs.reduce((sum, s) => sum + pick(s), 0) / runs.length;
  return {
    winRate: mean((s) => s.winRate),
    avgTurns: mean((s) => s.avgTurns),
    transformRate: mean((s) => s.transformRate),
    avgParries: mean((s) => s.avgParries),
    avgAssists: mean((s) => s.avgAssists),
  };
}
