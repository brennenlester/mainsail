import type { FolkloreType } from "../creatures/folkloreTypes";
import type { ZoneId } from "../world/zoneTypes";

/** Pure music/SFX selection logic (#371). No Phaser, no DOM. */

export type MusicTrackId =
  | "title"
  | "grove"
  | "shrine"
  | "village"
  | "battle"
  | "night"
  | "victory"
  | "boss"
  | "rival";

export type MusicTrackConfig = {
  /** Phaser cache key. */
  key: string;
  /** Ogg Vorbis first, AAC fallback for Safari (Phaser picks the first playable). */
  urls: readonly string[];
  loop: boolean;
  /** Per-track level before master volume. */
  gain: number;
  /** Milliseconds to fade in when this track starts. */
  fadeInMs: number;
  /** Milliseconds to fade out when another track replaces it. */
  fadeOutMs: number;
  /** One-shot length; only set for non-looping tracks. */
  durationMs?: number;
};

function track(id: string, extra: Partial<MusicTrackConfig> = {}): MusicTrackConfig {
  return {
    key: `music-${id}`,
    urls: [`assets/audio/music-${id}.ogg`, `assets/audio/music-${id}.m4a`],
    loop: true,
    gain: 0.3,
    fadeInMs: 1600,
    fadeOutMs: 1600,
    ...extra,
  };
}

export const MUSIC_TRACKS: Readonly<Record<MusicTrackId, MusicTrackConfig>> = {
  title: track("title"),
  grove: track("grove"),
  shrine: track("shrine", { gain: 0.34 }),
  village: track("village"),
  battle: track("battle", { gain: 0.26, fadeInMs: 400, fadeOutMs: 700 }),
  night: track("night", { gain: 0.32 }),
  // Story battles (#385): the Cinder Matriarch and Wren have their own themes.
  boss: track("boss", { gain: 0.3, fadeInMs: 300, fadeOutMs: 900 }),
  rival: track("rival", { gain: 0.28, fadeInMs: 300, fadeOutMs: 700 }),
  victory: track("victory", {
    loop: false,
    gain: 0.38,
    fadeInMs: 60,
    fadeOutMs: 500,
    durationMs: 5800,
  }),
};

export type MusicContext = {
  /** Non-world screens (title). */
  screen?: "title";
  zoneId?: ZoneId;
  /** Shrine altar overlay is open. */
  shrineOpen: boolean;
  /** Encounter or battle scene is active and not yet won. */
  battle: boolean;
  /** Story battle theme replacing the spar loop (#385). */
  battleTheme?: "boss" | "rival";
  /** Victory sting window after a win. */
  victory: boolean;
  night: boolean;
};

/** Local clock night: 20:00 to 05:59. */
export function isNightHour(hour: number): boolean {
  return hour >= 20 || hour < 6;
}

function isInterior(zoneId: ZoneId): boolean {
  return zoneId.endsWith("-cottage");
}

/** Base track for a zone; the night variant replaces outdoor tracks after dark. */
export function zoneMusicTrack(zoneId: ZoneId, night: boolean): MusicTrackId {
  if (zoneId === "mistwood") {
    return "night"; // always dusk-lit
  }
  if (zoneId === "shrine") {
    return "shrine";
  }
  const base: MusicTrackId =
    zoneId === "village" || zoneId === "harbor" || isInterior(zoneId) ? "village" : "grove";
  return night && !isInterior(zoneId) ? "night" : base;
}

export function selectMusicTrack(ctx: MusicContext): MusicTrackId | null {
  if (ctx.victory) {
    return "victory";
  }
  if (ctx.battle) {
    return ctx.battleTheme ?? "battle";
  }
  if (ctx.screen === "title") {
    return "title";
  }
  if (ctx.shrineOpen) {
    return "shrine";
  }
  return ctx.zoneId ? zoneMusicTrack(ctx.zoneId, ctx.night) : null;
}

export type StepSurface = "grass" | "stone" | "wood" | "sand";

export function stepSurfaceForZone(zoneId: ZoneId): StepSurface {
  switch (zoneId) {
    case "shrine":
    case "emberfen":
      return "stone";
    case "harbor":
      return "wood";
    case "village":
    case "archipelago":
      return "sand";
    default:
      return isInterior(zoneId) ? "wood" : "grass";
  }
}

export type MoveSfxCategory = "fire" | "water" | "grove" | "neutral";

export function moveSfxCategory(type: FolkloreType | string): MoveSfxCategory {
  switch (type) {
    case "ember":
      return "fire";
    case "water":
      return "water";
    case "woodland":
    case "fen":
      return "grove";
    default:
      return "neutral";
  }
}

/** Move a 0..1 fade level toward `target` at 1.0 per `fadeMs`; instant when fadeMs <= 0. */
export function stepFade(current: number, target: number, dtMs: number, fadeMs: number): number {
  if (fadeMs <= 0 || dtMs >= fadeMs) {
    return target;
  }
  const step = dtMs / fadeMs;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
