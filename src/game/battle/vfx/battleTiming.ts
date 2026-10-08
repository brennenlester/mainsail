/**
 * Battle presentation timing + mode (#365). Pure: no Phaser, so the beat
 * table, hit-pause curve and type → VFX family map are unit-tested.
 */

import type { MoveRole } from "../../creatures/types";

const FAST_KEY = "ivyward-fast-battle";

export type BattleFxMode = {
  /** "Fast battle": skip lunges, particles, pauses; keep numbers + flashes. */
  fast: boolean;
  /** prefers-reduced-motion: no shake / zoom / big travel; fades instead. */
  reducedMotion: boolean;
  /** Effects toggle (shared with the overworld juice engine). */
  particles: boolean;
};

export function fastBattleEnabled(): boolean {
  try {
    return window.localStorage.getItem(FAST_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFastBattleEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(FAST_KEY, enabled ? "1" : "0");
  } catch {
    // Storage blocked: the toggle still applies for this battle.
  }
}

export function fastBattleLabel(enabled: boolean): string {
  return enabled ? "Fast ▸▸ On" : "Fast ▸▸ Off";
}

/** Beat lengths in ms. Every beat collapses to 0 in fast mode. */
export type BattleTimings = {
  entrance: number;
  entranceStagger: number;
  vsBanner: number;
  lunge: number;
  projectile: number;
  recoil: number;
  faint: number;
  /** Gap between the player's move resolving and the foe acting. */
  turnGap: number;
  xpFill: number;
};

export const BASE_TIMINGS: Readonly<BattleTimings> = {
  entrance: 520,
  entranceStagger: 140,
  vsBanner: 1150,
  lunge: 170,
  projectile: 240,
  recoil: 240,
  faint: 720,
  turnGap: 700,
  xpFill: 700,
};

/** Shortest beats that still read: fast mode keeps a short turn gap so the log is visible. */
export const FAST_TIMINGS: Readonly<BattleTimings> = {
  entrance: 0,
  entranceStagger: 0,
  vsBanner: 0,
  lunge: 0,
  projectile: 0,
  recoil: 0,
  faint: 160,
  turnGap: 320,
  xpFill: 0,
};

export function battleTimings(mode: BattleFxMode): BattleTimings {
  if (mode.fast) {
    return { ...FAST_TIMINGS };
  }
  if (mode.reducedMotion) {
    // Same pacing, but no travel-heavy beats.
    return { ...BASE_TIMINGS, entrance: 260, entranceStagger: 0, lunge: 90 };
  }
  return { ...BASE_TIMINGS };
}

export const HIT_PAUSE_MIN_MS = 60;
export const HIT_PAUSE_MAX_MS = 90;

/**
 * Freeze-frame on contact: 60ms for a scratch, 90ms for a heavy hit
 * (a third of max HP or more), always the max for effective hits and finishers.
 */
export function hitPauseMs(
  damage: number,
  targetMaxHp: number,
  opts: { effective?: boolean; finisher?: boolean },
  mode: BattleFxMode,
): number {
  if (mode.fast || damage <= 0) {
    return 0;
  }
  if (opts.effective || opts.finisher) {
    return HIT_PAUSE_MAX_MS;
  }
  const severity = Math.min(1, damage / Math.max(1, targetMaxHp / 3));
  return Math.round(HIT_PAUSE_MIN_MS + (HIT_PAUSE_MAX_MS - HIT_PAUSE_MIN_MS) * severity);
}

/** Camera shake intensity for a hit; zero when motion is reduced or fast. */
export function shakeFor(
  damage: number,
  strong: boolean,
  finisher: boolean,
  mode: BattleFxMode,
): { ms: number; amp: number } {
  if (mode.fast || mode.reducedMotion || damage <= 0) {
    return { ms: 0, amp: 0 };
  }
  if (finisher) {
    return { ms: 260, amp: 0.012 };
  }
  return strong ? { ms: 200, amp: 0.008 } : { ms: 110, amp: 0.0035 };
}

/** Zoom punch on finishers (multiplier on the camera's base zoom). */
export function zoomPunchFor(finisher: boolean, mode: BattleFxMode): number {
  if (!finisher || mode.fast || mode.reducedMotion) {
    return 1;
  }
  return 1.08;
}

export type VfxFamily = "ember" | "tide" | "grove" | "storm" | "mist" | "neutral";

/** Folklore type → particle recipe family. */
export function vfxFamily(type: string): VfxFamily {
  switch (type) {
    case "ember":
    case "hearth":
      return "ember";
    case "water":
      return "tide";
    case "woodland":
    case "fen":
      return "grove";
    case "storm":
      return "storm";
    case "mist":
    case "twilight":
    case "will-o-wisp":
      return "mist";
    default:
      return "neutral";
  }
}

/** Particles per impact burst; heavier for effective hits and finishers. */
export function burstCount(
  role: MoveRole,
  effective: boolean,
  mode: BattleFxMode,
): number {
  if (mode.fast || !mode.particles) {
    return 0;
  }
  const base = role === "finisher" ? 26 : role === "status" ? 14 : 16;
  return effective ? Math.round(base * 1.5) : base;
}

/** Ranged roles throw a projectile; plain attacks are a body lunge. */
export function usesProjectile(role: MoveRole): boolean {
  return role === "status" || role === "finisher";
}

/**
 * Intent plate glow: 0 calm, 1 "finisher charging" (ready next turn),
 * 2 finisher telegraphed now. Higher level = faster, deeper pulse.
 */
export type IntentGlow = { level: 0 | 1 | 2; periodMs: number; minAlpha: number };

export function intentGlow(
  role: MoveRole,
  finisherTurnsLeft: number | null,
): IntentGlow {
  if (role === "finisher") {
    return { level: 2, periodMs: 360, minAlpha: 0.35 };
  }
  if (finisherTurnsLeft !== null && finisherTurnsLeft <= 1) {
    return { level: 1, periodMs: 760, minAlpha: 0.6 };
  }
  return { level: 0, periodMs: 0, minAlpha: 1 };
}
