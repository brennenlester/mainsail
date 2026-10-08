/**
 * Party follower idle life (#362): breathing at rest, a trotting hop while
 * walking, a staggered "we stopped" hop, and occasional emotes. Pure so the
 * motion stays bounded and testable.
 */

export type FollowerPose = { dy: number; scaleX: number; scaleY: number };

export type EmoteKind = "heart" | "note" | "dots" | "spark";

const IDENTITY: FollowerPose = { dy: 0, scaleX: 1, scaleY: 1 };

const STOP_HOP_MS = 300;
const STOP_STAGGER_MS = 110;
const STOP_HOP_PX = 5;
const TROT_HZ = 2.6;
const TROT_PX = 3;
const BREATHE_HZ = 0.55;

export function followerPose(
  timeMs: number,
  index: number,
  moving: boolean,
  sinceStopMs: number,
  reducedMotion: boolean,
): FollowerPose {
  if (reducedMotion) {
    return IDENTITY;
  }
  const t = timeMs / 1000;
  if (moving) {
    const s = Math.abs(Math.sin(Math.PI * (t * TROT_HZ + index * 0.37)));
    return { dy: -s * TROT_PX, scaleX: 1 - 0.03 * s, scaleY: 1 + 0.04 * s };
  }
  const local = sinceStopMs - index * STOP_STAGGER_MS;
  if (local >= 0 && local < STOP_HOP_MS) {
    const arc = Math.sin((Math.PI * local) / STOP_HOP_MS);
    return { dy: -arc * STOP_HOP_PX, scaleX: 1 - 0.04 * arc, scaleY: 1 + 0.06 * arc };
  }
  const breathe = Math.sin(2 * Math.PI * (t * BREATHE_HZ) + index * 1.7);
  return { dy: 0, scaleX: 1 - 0.012 * breathe, scaleY: 1 + 0.028 * breathe };
}

const EMOTES: readonly EmoteKind[] = ["heart", "note", "dots", "spark"];

/** Idle gap before the next emote: 5–10 s. `rand` in [0,1). */
export function nextEmoteDelayMs(rand: number): number {
  return 5000 + Math.floor(rand * 5000);
}

export function pickEmote(rand: number): EmoteKind {
  return EMOTES[Math.min(EMOTES.length - 1, Math.floor(rand * EMOTES.length))]!;
}
