import { getCreatureDefinition } from "../creatures/catalog";
import { FOLKLORE_TYPES, HUNTER_CHART, type FolkloreType } from "../creatures/folkloreTypes";
import { BOON_IDS, type BoonId } from "./boons";
import { MODIFIER_IDS, MODIFIERS, modifiersClash, type ModifierId } from "./modifiers";
import { trialRng, type TrialDay } from "./trialSeed";

/**
 * One day's Eclipse Trial (#420), derived only from the day: lineup, levels,
 * modifiers, boss forms and boon offers. Pure and deterministic — the
 * runtime, the sim and the share card all read the same plan.
 */

export const TRIAL_ROUNDS = 5;
export const BOSS_ROUND_INDEX = TRIAL_ROUNDS - 1;

/**
 * Lineup pool: species with converted battle art (idle / battle frames in
 * the atlas), so a trial never shows placeholder art. Sovereigns and
 * archipelago-only species stay out.
 */
export const TRIAL_SPECIES: readonly string[] = [
  "mossling",
  "ember-wisp",
  "brook-nymph",
  "stone-hound",
  "rootwalker",
  "lantern-fox",
  "thunder-finch",
  "bramblewarden",
  "hearthflame",
  "peat-sprite",
  "cinder-toad",
  "bog-lantern",
  "mist-serpent",
];

/** Levels over the party average, rising per round (the boss uses the last). */
export const ROUND_LEVEL_BONUS: readonly number[] = [0, 1, 2, 3, 3];

/** Chance a middle round rolls a second modifier. */
const SECOND_MODIFIER_CHANCE = 0.5;

export type TrialRoundPlan = {
  index: number;
  kind: "foe" | "boss";
  /** Foe species (boss: the art it wears). */
  creatureId: string;
  levelBonus: number;
  modifiers: ModifierId[];
};

export type TrialBossPlan = {
  /** Form types in order: the second form is the telegraphed signature form. */
  formTypes: readonly [FolkloreType, FolkloreType];
};

export type TrialPlan = {
  day: TrialDay;
  rounds: TrialRoundPlan[];
  boss: TrialBossPlan;
  /** Three boon offers after each non-final round (index = round just cleared). */
  boonOffers: BoonId[][];
};

export const ECLIPSE_BOSS_CREATURE = "eclipse-sovereign";

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Four foes, preferring a new type each round so one party type can't sweep. */
function pickLineup(day: TrialDay, attempt: number): string[] {
  const rng = trialRng(day, salted("lineup", attempt));
  const order = shuffle(TRIAL_SPECIES, rng);
  const picked: string[] = [];
  const types = new Set<FolkloreType>();
  for (const id of order) {
    const type = getCreatureDefinition(id).folkloreType;
    if (!types.has(type)) {
      picked.push(id);
      types.add(type);
    }
    if (picked.length === BOSS_ROUND_INDEX) {
      return picked;
    }
  }
  for (const id of order) {
    if (picked.length === BOSS_ROUND_INDEX) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked;
}

/**
 * Most a round's modifier weights may add up to (see ModifierDefinition):
 * the +3 round and the boss get less room, so a harsh roll lands early.
 */
export const ROUND_MODIFIER_BUDGET: readonly number[] = [1.5, 2.5, 2.5, 2, 1];

/** Evolved foes already hit like a modifier: they spend part of the round's budget. */
export const EVOLVED_FOE_WEIGHT = 1;
const EVOLVED_FOES: ReadonlySet<string> = new Set(["bramblewarden", "hearthflame"]);

function pickModifiers(day: TrialDay, lineup: readonly string[], attempt: number): ModifierId[][] {
  const rng = trialRng(day, salted("modifiers", attempt));
  return Array.from({ length: TRIAL_ROUNDS }, (_, index) => {
    const boss = index === BOSS_ROUND_INDEX;
    const middle = index > 0 && !boss;
    const count = middle && rng() < SECOND_MODIFIER_CHANCE ? 2 : 1;
    const evolved = !boss && EVOLVED_FOES.has(lineup[index] ?? "");
    const budget = (ROUND_MODIFIER_BUDGET[index] ?? 2) - (evolved ? EVOLVED_FOE_WEIGHT : 0);
    const order = shuffle(MODIFIER_IDS, rng);
    const chosen: ModifierId[] = [];
    let weight = 0;
    for (const id of order) {
      if (chosen.length >= count) break;
      const def = MODIFIERS[id];
      if (
        (boss && def.notOnBoss) ||
        weight + def.weight > budget ||
        chosen.some((other) => modifiersClash(id, other))
      ) {
        continue;
      }
      chosen.push(id);
      weight += def.weight;
    }
    return chosen;
  });
}

/**
 * Boss forms: two different types whose counters differ, so a party needs
 * two answers (or a good guard read) instead of one hunter lead.
 */
function pickBoss(day: TrialDay, attempt: number): TrialBossPlan {
  const rng = trialRng(day, salted("boss", attempt));
  const types = shuffle(FOLKLORE_TYPES, rng);
  const first = types[0]!;
  const counterOf = (type: FolkloreType): FolkloreType | undefined =>
    FOLKLORE_TYPES.find((t) => HUNTER_CHART[t] === type);
  const second =
    types.find((t) => t !== first && counterOf(t) !== counterOf(first)) ?? types[1]!;
  return { formTypes: [first, second] };
}

function pickBoons(day: TrialDay): BoonId[][] {
  const rng = trialRng(day, "boons");
  return Array.from({ length: BOSS_ROUND_INDEX }, () => shuffle(BOON_IDS, rng).slice(0, 3));
}

/** Stream name for a re-roll (attempt 0 keeps the plain name). */
function salted(stream: string, attempt: number): string {
  return attempt === 0 ? stream : `${stream}#${attempt}`;
}

/**
 * Candidate plan for `day`. `attempt` re-rolls the lineup, modifiers and boss
 * (boon offers stay) — dailyTrial.ts picks the first fair candidate.
 */
export function generateTrialPlan(day: TrialDay, attempt = 0): TrialPlan {
  const lineup = pickLineup(day, attempt);
  const modifiers = pickModifiers(day, lineup, attempt);
  const rounds: TrialRoundPlan[] = Array.from({ length: TRIAL_ROUNDS }, (_, index) => ({
    index,
    kind: index === BOSS_ROUND_INDEX ? "boss" : "foe",
    creatureId: index === BOSS_ROUND_INDEX ? ECLIPSE_BOSS_CREATURE : lineup[index]!,
    levelBonus: ROUND_LEVEL_BONUS[index] ?? 0,
    modifiers: modifiers[index]!,
  }));
  return { day, rounds, boss: pickBoss(day, attempt), boonOffers: pickBoons(day) };
}
