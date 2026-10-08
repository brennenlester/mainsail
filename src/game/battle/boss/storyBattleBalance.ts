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

/**
 * Typical party at Wren's arrival (#411 release-gate playthrough): one
 * required spar (70 XP) puts the lead at Lv 4, the evolution beat evolves it,
 * and the friend is Bryn's Lv 1 Grove gift or a befriended Lv 4 companion.
 * Wren's level follows the rounded party average, like the game.
 */
export const WREN_ARRIVAL_PARTIES: readonly { party: readonly string[]; levels: readonly number[] }[] = [
  { party: ["bramblewarden", "ember-wisp"], levels: [4, 1] },
  { party: ["hearthflame", "mossling"], levels: [4, 1] },
  { party: ["bramblewarden", "ember-wisp"], levels: [4, 4] },
  { party: ["hearthflame", "mossling"], levels: [4, 4] },
  { party: ["bramblewarden", "brook-nymph"], levels: [4, 4] },
];

/** The same leads alone: what the "bring a friend" nudge is for. */
export const WREN_LONE_PARTIES: readonly { party: readonly string[]; levels: readonly number[] }[] = [
  { party: ["bramblewarden"], levels: [4] },
  { party: ["hearthflame"], levels: [4] },
];

/** Expected party level when each beat is reached on a ~20 minute cold run. */
export const EXPECTED_LEVEL: Readonly<Record<StorySparId, number>> = {
  // #411: one required spar (70 XP) puts the arrival party at Lv 4.
  "rival-wren": 4,
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
