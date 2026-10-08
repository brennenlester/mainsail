/**
 * Eclipse Trial score and title (#420). Clearing rounds is most of it; speed
 * (few turns), grit (little damage taken), perfect parries and skipped
 * boons separate a good run from a great one on the same seed.
 */

export const SCORE = {
  /** Each regular round cleared. */
  round: 1000,
  /** The Eclipse Shade. */
  boss: 2000,
  /** Per turn under SPEED_PAR in a cleared round. */
  speedPerTurn: 30,
  speedPar: 10,
  /** Per cleared round: full when no damage was taken, 0 at a whole party's HP. */
  grit: 250,
  parry: 75,
  /** A boon left on the table. */
  boonSkipped: 150,
} as const;

export type TrialRoundRecord = {
  cleared: boolean;
  boss: boolean;
  turns: number;
  /** HP lost by the party this round (net of in-round heals). */
  damageTaken: number;
  /** Party max HP when the round started (normalises damage across levels). */
  partyMaxHp: number;
  parries: number;
};

export type TrialScore = {
  total: number;
  roundsCleared: number;
  cleared: boolean;
  turns: number;
  damageTaken: number;
  parries: number;
  boonsUsed: number;
  boonsSkipped: number;
  parts: { rounds: number; speed: number; grit: number; parries: number; boons: number };
};

export function scoreTrial(
  rounds: readonly TrialRoundRecord[],
  boons: { used: number; skipped: number },
  totalRounds: number,
): TrialScore {
  let roundPts = 0;
  let speed = 0;
  let grit = 0;
  let parries = 0;
  let turns = 0;
  let damage = 0;
  let cleared = 0;
  for (const r of rounds) {
    turns += Math.max(0, r.turns);
    damage += Math.max(0, r.damageTaken);
    parries += Math.max(0, r.parries);
    if (!r.cleared) {
      continue;
    }
    cleared += 1;
    roundPts += r.boss ? SCORE.boss : SCORE.round;
    speed += Math.max(0, SCORE.speedPar - r.turns) * SCORE.speedPerTurn;
    const share = r.partyMaxHp > 0 ? Math.max(0, r.damageTaken) / r.partyMaxHp : 1;
    grit += Math.round(SCORE.grit * Math.max(0, 1 - share));
  }
  const parryPts = parries * SCORE.parry;
  const boonPts = Math.max(0, boons.skipped) * SCORE.boonSkipped;
  return {
    total: roundPts + speed + grit + parryPts + boonPts,
    roundsCleared: cleared,
    cleared: cleared >= totalRounds,
    turns,
    damageTaken: damage,
    parries,
    boonsUsed: Math.max(0, boons.used),
    boonsSkipped: Math.max(0, boons.skipped),
    parts: { rounds: roundPts, speed, grit, parries: parryPts, boons: boonPts },
  };
}

/** Titles by minimum score, ascending. */
export const TRIAL_TITLES: readonly { min: number; title: string }[] = [
  { min: 0, title: "Ember Initiate" },
  { min: 1500, title: "Dusk Wanderer" },
  { min: 2800, title: "Moonlit Duelist" },
  { min: 4200, title: "Shade Breaker" },
  { min: 6000, title: "Eclipse Ascendant" },
  { min: 7400, title: "Eclipse Warden" },
];

export function trialTitleIndex(score: number): number {
  let index = 0;
  TRIAL_TITLES.forEach((t, i) => {
    if (score >= t.min) {
      index = i;
    }
  });
  return index;
}

export function trialTitle(score: number): string {
  return TRIAL_TITLES[trialTitleIndex(score)]!.title;
}
