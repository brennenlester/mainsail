/**
 * Companion personality (#367). One trait per creature, rolled once at
 * befriend and saved on the instance. Pure: no Phaser, no DOM.
 */

export const PERSONALITY_IDS = [
  "bold",
  "shy",
  "greedy",
  "sleepy",
  "curious",
  "loyal",
  "playful",
  "gentle",
] as const;

export type PersonalityId = (typeof PERSONALITY_IDS)[number];

/** Where a bond tick came from — personalities amplify one source each. */
/** `growth` (evolution) is never a personality affinity. */
export type BondSource = "battle" | "gift" | "ability" | "growth";

export type PersonalityDefinition = {
  id: PersonalityId;
  label: string;
  /** One-line party-panel blurb. */
  blurb: string;
  /** Idle overworld barks (kept short: they render in a small bubble). */
  barks: readonly string[];
  /** Bond source this trait cares most about (×1.5). */
  bondAffinity?: BondSource;
};

export const PERSONALITIES: Readonly<Record<PersonalityId, PersonalityDefinition>> = {
  bold: {
    id: "bold",
    label: "Bold",
    blurb: "Walks out front and loves a good spar.",
    barks: ["Onward!", "Let me go first.", "Bring it on!", "I'm not scared."],
    bondAffinity: "battle",
  },
  shy: {
    id: "shy",
    label: "Shy",
    blurb: "Hangs back, but warms to small kindnesses.",
    barks: ["...hi.", "Is it safe?", "Stay close?", "*peeks out*"],
    bondAffinity: "gift",
  },
  greedy: {
    id: "greedy",
    label: "Greedy",
    blurb: "Never says no to a treat.",
    barks: ["Snack time?", "Is that shiny?", "Mine!", "I smell treasure."],
    bondAffinity: "gift",
  },
  sleepy: {
    id: "sleepy",
    label: "Sleepy",
    blurb: "Dawdles behind and naps whenever you stop.",
    barks: ["Zzz...", "*yawn*", "Five more minutes.", "Nap here?"],
  },
  curious: {
    id: "curious",
    label: "Curious",
    blurb: "Wanders off to sniff at anything interesting.",
    barks: ["What's that?", "Ooh, look!", "Can we check?", "Hmm, a smell..."],
    bondAffinity: "ability",
  },
  loyal: {
    id: "loyal",
    label: "Loyal",
    blurb: "Sticks right by your side through every fight.",
    barks: ["Right here.", "Together!", "I've got you.", "Where you go, I go."],
    bondAffinity: "battle",
  },
  playful: {
    id: "playful",
    label: "Playful",
    blurb: "Turns every errand into a game.",
    barks: ["Tag! You're it!", "Race you!", "Hee hee!", "Again, again!"],
    bondAffinity: "ability",
  },
  gentle: {
    id: "gentle",
    label: "Gentle",
    blurb: "Calm and kind; steadies the whole party.",
    barks: ["Nice breeze.", "Take your time.", "Smell the moss.", "All is well."],
  },
};

const PERSONALITY_SET = new Set<string>(PERSONALITY_IDS);

export function isPersonalityId(value: unknown): value is PersonalityId {
  return typeof value === "string" && PERSONALITY_SET.has(value);
}

/** FNV-1a 32-bit — stable across platforms, cheap, good enough spread. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Seed for a befriend roll. Including the player name means two players'
 * first Mossling (both `c-1`) can differ, while reloading the same save
 * always rebuilds the same trait.
 */
export function personalitySeed(
  playerName: string | null | undefined,
  instanceId: string,
  speciesId: string,
): string {
  return `${playerName ?? ""}|${instanceId}|${speciesId}`;
}

/** Deterministic trait for a seed. */
export function rollPersonality(seed: string): PersonalityId {
  return PERSONALITY_IDS[hashSeed(seed) % PERSONALITY_IDS.length]!;
}

export function getPersonality(id: PersonalityId): PersonalityDefinition {
  return PERSONALITIES[id];
}

/** Bond gain multiplier for a trait + source (1.5 on affinity, else 1). */
export function personalityBondMultiplier(
  id: PersonalityId | undefined,
  source: BondSource,
): number {
  if (!id) {
    return 1;
  }
  return PERSONALITIES[id].bondAffinity === source ? 1.5 : 1;
}

/** Pick a bark line. `rand` in [0,1). */
export function pickBark(id: PersonalityId, rand: number): string {
  const barks = PERSONALITIES[id].barks;
  return barks[Math.min(barks.length - 1, Math.floor(rand * barks.length))]!;
}

export type FollowerOffset = { dx: number; dy: number };
export type FollowerFacing = "south" | "north" | "east" | "west";

/** Unit vector pointing where the player faces (screen space). */
function facingVector(facing: FollowerFacing): { x: number; y: number } {
  switch (facing) {
    case "south":
      return { x: 0, y: 1 };
    case "north":
      return { x: 0, y: -1 };
    case "east":
      return { x: 1, y: 0 };
    case "west":
      return { x: -1, y: 0 };
  }
}

/**
 * Personality spin on a follower's trailing offset (px, screen space).
 * Bold walks ahead of the player, shy/sleepy lag further behind, loyal hugs
 * close. Everyone else keeps the base formation.
 */
export function personalityFollowerOffset(
  id: PersonalityId | undefined,
  facing: FollowerFacing,
  base: FollowerOffset,
): FollowerOffset {
  const f = facingVector(facing);
  switch (id) {
    case "bold":
      // Mirror the trailing component so the follower walks in front.
      return {
        dx: f.x !== 0 ? -base.dx : base.dx,
        dy: f.y !== 0 ? -base.dy : base.dy,
      };
    case "shy":
      return { dx: base.dx - f.x * 14, dy: base.dy - f.y * 14 };
    case "sleepy":
      return { dx: base.dx - f.x * 8, dy: base.dy - f.y * 8 };
    case "loyal":
      return { dx: base.dx * 0.7, dy: base.dy * 0.7 };
    default:
      return base;
  }
}

/** Max px a curious follower strays toward something interesting. */
export const CURIOUS_DETOUR_PX = 26;

/**
 * Nudge a curious follower from `from` toward `target` by at most
 * CURIOUS_DETOUR_PX. `t` in [0,1] eases the detour in after stopping.
 */
export function curiousDetour(
  from: { x: number; y: number },
  target: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) {
    return { ...from };
  }
  const step = Math.min(dist - 8, CURIOUS_DETOUR_PX) * Math.max(0, Math.min(1, t));
  if (step <= 0) {
    return { ...from };
  }
  return { x: from.x + (dx / dist) * step, y: from.y + (dy / dist) * step };
}
