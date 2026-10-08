import type { StatusId } from "../creatures/types";
import { GUARD_DAMAGE_TAKEN, GUARD_FINISHER_DAMAGE_TAKEN } from "../battle/kits";
import { BURN_TICK_FRACTION, SOAKED_DAMAGE_TAKEN, SOAKED_STORM_DAMAGE_TAKEN } from "../battle/statusEffects";

/**
 * Eclipse modifiers (#420): data-driven round rules, shown as chips before
 * and during the round. Effects are applied by `TrialBattle` (trialBattle.ts)
 * for BattleScene and the headless sim alike — tune numbers here.
 */
export type ModifierId =
  | "kindled"
  | "twin-shadows"
  | "rootbound"
  | "glass-cannons"
  | "soaked-arena"
  | "moonfed"
  | "short-fuse"
  | "iron-hide";

export type ModifierEffect = {
  /** Status every combatant (both sides) gets when it enters. */
  entryStatus?: StatusId;
  /** The foe acts a second time on every Nth of its turns. */
  foeEchoEvery?: number;
  /** Extra multiplier on damage your guarding companions take. */
  playerGuardTaken?: number;
  /** Both sides: outgoing damage x `damage`, battle bulk x `bulk` (<1 = more fragile). */
  glass?: { damage: number; bulk: number };
  /** Foe heals this share of max HP after each of its turns. */
  foeRegen?: number;
  /** No opening finisher wind-up, for both sides. */
  finishersReady?: boolean;
  /** Foe max HP / outgoing damage multipliers. */
  foeHp?: number;
  foeDamage?: number;
};

export type ModifierDefinition = {
  id: ModifierId;
  name: string;
  /** One line shown on the chip tooltip and the round preview. */
  summary: string;
  /** Short chip label (fits a phone HUD strip). */
  chip: string;
  /** Letter drawn in the modifier icon (cards / HUD). */
  glyph: string;
  /** Chip colour (CSS hex). */
  color: string;
  /**
   * How much harder the round gets (negative = it helps you). A round's
   * modifiers stay inside its budget (trialPlan.ts) so no seed stacks into
   * an unwinnable round.
   */
  weight: number;
  /** Never rolled on the boss (its HP pool already carries the fight). */
  notOnBoss?: boolean;
  effect: ModifierEffect;
};

/** Effect numbers; the summaries below are written from them (modifiers.test.ts checks). */
export const TWIN_SHADOWS_EVERY = 4;
export const ROOTBOUND_GUARD_TAKEN = 0.5;
export const GLASS = { damage: 1.3, bulk: 0.7 } as const;
export const MOONFED_REGEN = 0.04;
export const IRON_HIDE = { hp: 1.35, damage: 0.9 } as const;

const pct = (x: number): number => Math.round(x * 100);
/** "1.86": two decimals at most. */
const times = (x: number): string => String(Math.round(x * 100) / 100);

export const MODIFIERS: Readonly<Record<ModifierId, ModifierDefinition>> = {
  kindled: {
    id: "kindled",
    name: "Kindled",
    summary: `Everyone enters Burned — ${pct(BURN_TICK_FRACTION)}% max HP each turn.`,
    chip: "KINDLED",
    glyph: "K",
    color: "#ff8a4c",
    weight: 1,
    notOnBoss: true,
    effect: { entryStatus: "burn" },
  },
  "twin-shadows": {
    id: "twin-shadows",
    name: "Twin Shadows",
    summary: `Every ${TWIN_SHADOWS_EVERY}th foe turn ends with an extra basic strike (not when it guarded, charged or reeled).`,
    chip: "TWIN ×2",
    glyph: "T",
    color: "#c49cff",
    weight: 1.5,
    effect: { foeEchoEvery: TWIN_SHADOWS_EVERY },
  },
  rootbound: {
    id: "rootbound",
    name: "Rootbound",
    summary: `Guard blocks twice as much: guarded hits land at ${pct(GUARD_DAMAGE_TAKEN * ROOTBOUND_GUARD_TAKEN)}% (finishers ${pct(GUARD_FINISHER_DAMAGE_TAKEN * ROOTBOUND_GUARD_TAKEN)}%).`,
    chip: "ROOTBOUND",
    glyph: "R",
    color: "#8fd36a",
    weight: -1,
    effect: { playerGuardTaken: ROOTBOUND_GUARD_TAKEN },
  },
  "glass-cannons": {
    id: "glass-cannons",
    name: "Glass Cannons",
    summary: `Everyone hits ${pct(GLASS.damage - 1)}% harder and takes ${pct(1 / GLASS.bulk - 1)}% more: every hit lands ×${times(GLASS.damage / GLASS.bulk)}.`,
    chip: `GLASS ×${times(GLASS.damage / GLASS.bulk)}`,
    glyph: "G",
    color: "#ffd27a",
    weight: 1,
    notOnBoss: true,
    effect: { glass: GLASS },
  },
  "soaked-arena": {
    id: "soaked-arena",
    name: "Soaked Arena",
    summary: `Everyone enters Soaked — takes ×${times(SOAKED_DAMAGE_TAKEN)} (storm ×${times(SOAKED_STORM_DAMAGE_TAKEN)}), can't Burn.`,
    chip: "SOAKED",
    glyph: "S",
    color: "#6cc4ff",
    weight: 0.5,
    effect: { entryStatus: "soaked" },
  },
  moonfed: {
    id: "moonfed",
    name: "Moonfed",
    summary: `The foe heals ${pct(MOONFED_REGEN)}% max HP after each of its turns.`,
    chip: "MOONFED",
    glyph: "M",
    color: "#e8d8ff",
    weight: 2,
    notOnBoss: true,
    effect: { foeRegen: MOONFED_REGEN },
  },
  "short-fuse": {
    id: "short-fuse",
    name: "Short Fuse",
    summary: "Finishers are ready from turn one — for both sides.",
    chip: "SHORT FUSE",
    glyph: "F",
    color: "#ff7a5c",
    weight: 0.5,
    effect: { finishersReady: true },
  },
  "iron-hide": {
    id: "iron-hide",
    name: "Iron Hide",
    summary: `The foe has +${pct(IRON_HIDE.hp - 1)}% HP but hits ${pct(1 - IRON_HIDE.damage)}% softer.`,
    chip: "IRON HIDE",
    glyph: "I",
    color: "#b8c4d0",
    weight: 2,
    notOnBoss: true,
    effect: { foeHp: IRON_HIDE.hp, foeDamage: IRON_HIDE.damage },
  },
};

export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];

export function isModifierId(value: unknown): value is ModifierId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MODIFIERS, value);
}

/** Pairs that cancel or say the same thing: never rolled into one round. */
const CLASHES: readonly (readonly [ModifierId, ModifierId])[] = [
  // Soaked douses Burn: the pair would read as a bug.
  ["kindled", "soaked-arena"],
  // Two "the foe is tankier" rules stack into a slog.
  ["moonfed", "iron-hide"],
];

export function modifiersClash(a: ModifierId, b: ModifierId): boolean {
  return CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Merged effect of a round's modifiers (multipliers multiply, flags OR). */
export function combineModifiers(ids: readonly ModifierId[]): Required<
  Pick<ModifierEffect, "playerGuardTaken" | "foeRegen" | "foeHp" | "foeDamage">
> & {
  entryStatuses: StatusId[];
  foeEchoEvery: number | null;
  glassDamage: number;
  glassBulk: number;
  finishersReady: boolean;
} {
  const out = {
    entryStatuses: [] as StatusId[],
    foeEchoEvery: null as number | null,
    playerGuardTaken: 1,
    glassDamage: 1,
    glassBulk: 1,
    foeRegen: 0,
    finishersReady: false,
    foeHp: 1,
    foeDamage: 1,
  };
  for (const id of ids) {
    const e = MODIFIERS[id].effect;
    if (e.entryStatus && !out.entryStatuses.includes(e.entryStatus)) {
      out.entryStatuses.push(e.entryStatus);
    }
    if (e.foeEchoEvery) {
      out.foeEchoEvery = Math.min(out.foeEchoEvery ?? e.foeEchoEvery, e.foeEchoEvery);
    }
    out.playerGuardTaken *= e.playerGuardTaken ?? 1;
    out.glassDamage *= e.glass?.damage ?? 1;
    out.glassBulk *= e.glass?.bulk ?? 1;
    out.foeRegen += e.foeRegen ?? 0;
    out.finishersReady ||= e.finishersReady === true;
    out.foeHp *= e.foeHp ?? 1;
    out.foeDamage *= e.foeDamage ?? 1;
  }
  return out;
}
