import type { StatusId } from "../creatures/types";

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

export const MODIFIERS: Readonly<Record<ModifierId, ModifierDefinition>> = {
  kindled: {
    id: "kindled",
    name: "Kindled",
    summary: "Everyone enters Burned — 5% max HP each turn.",
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
    summary: "Every 4th turn the foe acts twice.",
    chip: "TWIN ×2",
    glyph: "T",
    color: "#c49cff",
    weight: 1.5,
    effect: { foeEchoEvery: 4 },
  },
  rootbound: {
    id: "rootbound",
    name: "Rootbound",
    summary: "Your Guard is twice as strong: guarded hits land at half.",
    chip: "ROOTBOUND",
    glyph: "R",
    color: "#8fd36a",
    weight: -1,
    effect: { playerGuardTaken: 0.5 },
  },
  "glass-cannons": {
    id: "glass-cannons",
    name: "Glass Cannons",
    summary: "Everyone deals +30% damage and is 30% more fragile.",
    chip: "GLASS +30%",
    glyph: "G",
    color: "#ffd27a",
    weight: 1,
    notOnBoss: true,
    effect: { glass: { damage: 1.3, bulk: 0.7 } },
  },
  "soaked-arena": {
    id: "soaked-arena",
    name: "Soaked Arena",
    summary: "Everyone enters Soaked — takes ×1.25 (storm ×1.5), can't Burn.",
    chip: "SOAKED",
    glyph: "S",
    color: "#6cc4ff",
    weight: 0.5,
    effect: { entryStatus: "soaked" },
  },
  moonfed: {
    id: "moonfed",
    name: "Moonfed",
    summary: "The foe heals 4% max HP after each of its turns.",
    chip: "MOONFED",
    glyph: "M",
    color: "#e8d8ff",
    weight: 2,
    notOnBoss: true,
    effect: { foeRegen: 0.04 },
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
    summary: "The foe has +35% HP but hits 10% softer.",
    chip: "IRON HIDE",
    glyph: "I",
    color: "#b8c4d0",
    weight: 2,
    notOnBoss: true,
    effect: { foeHp: 1.35, foeDamage: 0.9 },
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
