import type Phaser from "phaser";
import type { ZoneId } from "../world/zoneTypes";
import {
  clampVolume,
  readMutedPreference,
  readVolumePreference,
  writeMutedPreference,
  writeVolumePreference,
} from "./audioSettings";
import {
  isNightHour,
  MUSIC_TRACKS,
  moveSfxCategory,
  selectMusicTrack,
  stepFade,
  stepSurfaceForZone,
  type MusicContext,
  type MusicTrackId,
  type StepSurface,
} from "./musicTracks";

const SFX = {
  step: "sfx-step",
  stepGrass: "sfx-step-grass",
  stepStone: "sfx-step-stone",
  stepWood: "sfx-step-wood",
  stepSand: "sfx-step-sand",
  gather: "sfx-gather",
  encounter: "sfx-encounter",
  shrine: "sfx-shrine",
  craft: "sfx-craft",
  craftSuccess: "sfx-craft-success",
  hitWild: "sfx-hit-wild",
  hitPlayer: "sfx-hit-player",
  faint: "sfx-faint",
  battleWin: "sfx-battle-win",
  uiClick: "sfx-ui-click",
  levelUp: "sfx-level-up",
  evolve: "sfx-evolve",
  ability: "sfx-ability",
  moveFire: "sfx-move-fire",
  moveWater: "sfx-move-water",
  moveGrove: "sfx-move-grove",
  moveNeutral: "sfx-move-neutral",
} as const;

/** Story battle sting (#385): compressed like music, loaded only by story battles. */
const BOSS_STING = {
  key: "sfx-boss-sting",
  urls: ["assets/audio/sfx-boss-sting.ogg", "assets/audio/sfx-boss-sting.m4a"],
} as const;

const STEP_BY_SURFACE: Record<StepSurface, string> = {
  grass: SFX.stepGrass,
  stone: SFX.stepStone,
  wood: SFX.stepWood,
  sand: SFX.stepSand,
};

const MOVE_BY_CATEGORY = {
  fire: SFX.moveFire,
  water: SFX.moveWater,
  grove: SFX.moveGrove,
  neutral: SFX.moveNeutral,
} as const;

/** Damage at or above this uses the strong hit visual/audio beat (#265). */
export const STRONG_HIT_DAMAGE = 12;

/** SFX cache keys — exported for tests / callers that need the map inventory. */
export function getSfxKeys(): readonly string[] {
  return Object.values(SFX);
}

const STEP_COOLDOWN_MS = 220;
/** How often the music director re-reads scene/clock context. */
const MUSIC_POLL_MS = 250;

let muted = readMutedPreference();
let volume = readVolumePreference();
let lastStepAt = 0;
let unlocked = false;
let hostScene: Phaser.Scene | null = null;

export function preloadGameAudio(scene: Phaser.Scene): void {
  hostScene = scene;
  // Older stub SFX plus the #371 set; all under public/assets/audio.
  for (const key of getSfxKeys()) {
    scene.load.audio(key, `assets/audio/${key}.wav`);
  }
  for (const cfg of Object.values(MUSIC_TRACKS)) {
    if (!cfg.lazy) {
      scene.load.audio(cfg.key, [...cfg.urls]);
    }
  }
}

// --------------------------------------------------------------------------
// Settings: mute + master volume
// --------------------------------------------------------------------------

export function isAudioMuted(): boolean {
  return muted;
}

export function getAudioVolume(): number {
  return volume;
}

function applySoundSettings(scene?: Phaser.Scene): void {
  const target = scene ?? hostScene;
  if (target?.sound) {
    target.sound.mute = muted;
    target.sound.volume = volume;
  }
}

export function setAudioMuted(next: boolean, scene?: Phaser.Scene): void {
  muted = next;
  writeMutedPreference(next);
  applySoundSettings(scene);
  if (!muted && scene) {
    ensureMusic(scene);
  }
  syncMuteButton();
}

export function setAudioVolume(next: number, scene?: Phaser.Scene): void {
  volume = clampVolume(next);
  writeVolumePreference(volume);
  applySoundSettings(scene);
  syncMuteButton();
}

export function syncMuteButton(): void {
  if (typeof document === "undefined") {
    return;
  }
  const btn = document.getElementById("mute-audio-btn");
  if (btn) {
    btn.textContent = muted ? "Unmute" : "Mute";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
  }
  const slider = document.getElementById("volume-audio-range") as HTMLInputElement | null;
  if (slider) {
    slider.value = String(Math.round(volume * 100));
  }
}

/** Unlock WebAudio on first user gesture (browser autoplay policy). */
export function unlockAudioFromGesture(scene: Phaser.Scene): void {
  hostScene = scene;
  if (unlocked) {
    return;
  }
  unlocked = true;
  scene.sound.unlock();
  applySoundSettings(scene);
  installMusicDirector(scene);
  ensureMusic(scene);
}

// --------------------------------------------------------------------------
// SFX
// --------------------------------------------------------------------------

function playSfx(
  scene: Phaser.Scene | null | undefined,
  key: string,
  volumeScale = 0.45,
  rate?: number,
): void {
  if (!scene || muted || !scene.cache.audio.exists(key)) {
    return;
  }
  scene.sound.play(key, rate === undefined ? { volume: volumeScale } : { volume: volumeScale, rate });
}

function playSfxLater(key: string, volumeScale: number, delayMs: number, scene?: Phaser.Scene): void {
  const target = scene ?? hostScene;
  if (delayMs <= 0) {
    playSfx(target, key, volumeScale);
    return;
  }
  setTimeout(() => playSfx(target, key, volumeScale), delayMs);
}

export function playStepSfx(scene: Phaser.Scene, nowMs: number): void {
  unlockAudioFromGesture(scene);
  if (nowMs - lastStepAt < STEP_COOLDOWN_MS) {
    return;
  }
  lastStepAt = nowMs;
  const surfaceKey = ctx.zoneId ? STEP_BY_SURFACE[stepSurfaceForZone(ctx.zoneId)] : SFX.step;
  const key = scene.cache.audio.exists(surfaceKey) ? surfaceKey : SFX.step;
  // Small pitch wobble keeps repeated footfalls from sounding mechanical.
  playSfx(scene, key, 0.3, 0.92 + Math.random() * 0.16);
}

export function playGatherSfx(scene: Phaser.Scene): void {
  playSfx(scene, SFX.gather, 0.4);
}

export function playEncounterSfx(scene: Phaser.Scene): void {
  playSfx(scene, SFX.encounter, 0.5);
}

export function playShrineSfx(scene: Phaser.Scene): void {
  playSfx(scene, SFX.shrine, 0.45);
}

/** Craft thunk plus the success sparkle. */
export function playCraftSfx(scene: Phaser.Scene): void {
  playSfx(scene, SFX.craft, 0.4);
  playSfxLater(SFX.craftSuccess, 0.4, 140, scene);
}

/** Impact pitch by matchup (#365): effective hits ring higher, resisted ones thud lower. */
export function hitSfxRate(matchup?: string): number | undefined {
  return matchup === "hunter" ? 1.15 : matchup === "resisted" ? 0.85 : undefined;
}

/** Wild takes damage (player attack lands). */
export function playHitWildSfx(scene: Phaser.Scene, damage: number, matchup?: string): void {
  playSfx(scene, SFX.hitWild, damage >= STRONG_HIT_DAMAGE ? 0.62 : 0.42, hitSfxRate(matchup));
}

/** Player takes damage (wild attack lands). */
export function playHitPlayerSfx(scene: Phaser.Scene, damage: number, matchup?: string): void {
  playSfx(scene, SFX.hitPlayer, damage >= STRONG_HIT_DAMAGE ? 0.65 : 0.45, hitSfxRate(matchup));
}

/** Guard raised: soft ability chime (#365). */
export function playGuardSfx(scene: Phaser.Scene): void {
  playSfx(scene, SFX.ability, 0.32, 1.2);
}

export function playFaintSfx(scene: Phaser.Scene): void {
  playSfx(scene, SFX.faint, 0.5);
}

/** Win: plays the victory sting over the music when available, else the stub SFX. */
export function playBattleWinSfx(scene: Phaser.Scene): void {
  if (!startVictorySting(scene)) {
    playSfx(scene, SFX.battleWin, 0.55);
  }
}

export function playUiClickSfx(scene?: Phaser.Scene): void {
  playSfx(scene ?? hostScene, SFX.uiClick, 0.35);
}

/** Scene-less so logic modules can call it; `delayMs` lets it land after a sting. */
export function playLevelUpSfx(delayMs = 0, scene?: Phaser.Scene): void {
  playSfxLater(SFX.levelUp, 0.5, delayMs, scene);
}

/** Scene-less so logic modules can call it. */
export function playEvolveSfx(scene?: Phaser.Scene): void {
  playSfx(scene ?? hostScene, SFX.evolve, 0.6);
}

/** Overworld/companion ability use (hook point for #367). */
export function playAbilitySfx(scene?: Phaser.Scene): void {
  playSfx(scene ?? hostScene, SFX.ability, 0.45);
}

/** Story battle VS banner / boss transformation hit (#385). */
export function playBossStingSfx(scene: Phaser.Scene): void {
  playSfx(scene, BOSS_STING.key, 0.7);
}

/** Queue the story battle theme + sting in a scene's preload (no boot cost for everyone). */
export function preloadStoryAudio(scene: Phaser.Scene, theme: "boss" | "rival"): void {
  const cfg = MUSIC_TRACKS[theme];
  if (!scene.cache.audio.exists(cfg.key)) {
    scene.load.audio(cfg.key, [...cfg.urls]);
  }
  if (!scene.cache.audio.exists(BOSS_STING.key)) {
    scene.load.audio(BOSS_STING.key, [...BOSS_STING.urls]);
  }
}

/** Move cast sound by battle type: fire / water / grove / neutral. */
export function playMoveTypeSfx(scene: Phaser.Scene, type: string): void {
  playSfx(scene, MOVE_BY_CATEGORY[moveSfxCategory(type)], 0.4);
}

// --------------------------------------------------------------------------
// Music director: picks a track from context, crossfades, gated on first input
// --------------------------------------------------------------------------

type Voice = {
  id: MusicTrackId;
  sound: Phaser.Sound.BaseSound & { setVolume?: (v: number) => unknown };
  /** 0..1 fade level; actual volume is level * track gain. */
  level: number;
  target: number;
};

const ctx: MusicContext = {
  shrineOpen: false,
  battle: false,
  victory: false,
  night: false,
};
let voices: Voice[] = [];
let victoryUntil = 0;
/** Latched after a win so the still-open battle scene does not restart battle music. */
let battleWon = false;
let pollAccumMs = 0;
let directorInstalled = false;

export function setAudioZone(zoneId: ZoneId): void {
  ctx.zoneId = zoneId;
  if (hostScene && unlocked) {
    ensureMusic(hostScene);
  }
}

/** Story battles swap the spar loop for the boss / rival theme; undefined restores it. */
export function setBattleTheme(theme: "boss" | "rival" | undefined, scene?: Phaser.Scene): void {
  ctx.battleTheme = theme;
  const target = scene ?? hostScene;
  if (target && unlocked) {
    ensureMusic(target);
  }
}

/** Title (or other non-world) screens claim the music with `screen: "title"`. */
export function setAudioScreen(screen: "title" | undefined, scene?: Phaser.Scene): void {
  ctx.screen = screen;
  const target = scene ?? hostScene;
  if (target && unlocked) {
    ensureMusic(target);
  }
}

function isSceneActive(scene: Phaser.Scene, key: string): boolean {
  try {
    return scene.scene.manager.isActive(key);
  } catch {
    return false;
  }
}

/** Running or asleep: the shrine sleeps under EvolutionScene and resumes after (#399). */
function isSceneOpen(scene: Phaser.Scene, key: string): boolean {
  try {
    return scene.scene.manager.isActive(key) || scene.scene.manager.isSleeping(key);
  } catch {
    return false;
  }
}

function refreshContext(scene: Phaser.Scene | null): void {
  if (scene?.scene?.manager) {
    const active = isSceneActive(scene, "BattleScene") || isSceneActive(scene, "EncounterScene");
    if (!active) {
      battleWon = false;
    }
    ctx.battle = active && !battleWon;
    // A sleeping shrine (evolution cutscene on top) keeps the shrine track:
    // no swap to the zone theme and back mid-cutscene.
    ctx.shrineOpen = isSceneOpen(scene, "ShrineScene");
  }
  ctx.night = isNightHour(new Date().getHours());
  if (ctx.victory && Date.now() >= victoryUntil) {
    ctx.victory = false;
  }
}

/** Track the director currently wants (null before any zone/screen is known). */
export function getDesiredMusicTrack(): MusicTrackId | null {
  refreshContext(hostScene);
  return selectMusicTrack(ctx);
}

function startVictorySting(scene: Phaser.Scene): boolean {
  const cfg = MUSIC_TRACKS.victory;
  if (!unlocked || !scene.cache.audio.exists(cfg.key)) {
    return false;
  }
  battleWon = true;
  ctx.battle = false;
  ctx.victory = true;
  victoryUntil = Date.now() + (cfg.durationMs ?? 0);
  ensureMusic(scene);
  return true;
}

/** Music gain multiplier for cutscene stings (#393); 1 = no duck. */
let musicDuck = 1;

function setVoiceVolume(voice: Voice): void {
  voice.sound.setVolume?.(voice.level * MUSIC_TRACKS[voice.id].gain * musicDuck);
}

/** Duck (0..1) or restore (1) the music under a sting; applies immediately. */
export function setMusicDuck(level: number): void {
  musicDuck = Math.max(0, Math.min(1, level));
  for (const v of voices) {
    setVoiceVolume(v);
  }
}

function startVoice(scene: Phaser.Scene, id: MusicTrackId): void {
  const cfg = MUSIC_TRACKS[id];
  if (!scene.cache.audio.exists(cfg.key)) {
    return;
  }
  const revived = voices.find((v) => v.id === id && v.target === 0);
  if (revived) {
    revived.target = 1;
    return;
  }
  const sound = scene.sound.add(cfg.key, { loop: cfg.loop, volume: 0 }) as Voice["sound"];
  const voice: Voice = { id, sound, level: 0, target: 1 };
  voices.push(voice);
  setVoiceVolume(voice);
  sound.play();
}

/** Re-evaluate context and crossfade to the right track. Safe to call often. */
export function ensureMusic(scene: Phaser.Scene): void {
  hostScene = scene;
  if (!unlocked) {
    return;
  }
  refreshContext(scene);
  const wanted = selectMusicTrack(ctx);
  const current = voices.find((v) => v.target === 1);
  if (current?.id === wanted) {
    return;
  }
  for (const v of voices) {
    if (v.target === 1) {
      v.target = 0;
    }
  }
  if (wanted) {
    startVoice(scene, wanted);
  }
}

/** Legacy name kept so existing call sites keep working; now context-driven. */
export function ensureGroveMusic(scene: Phaser.Scene): void {
  ensureMusic(scene);
}

/** One director tick: fades every voice and (throttled) re-reads context. Exported for tests. */
export function tickMusic(dtMs: number): void {
  pollAccumMs += dtMs;
  if (hostScene && pollAccumMs >= MUSIC_POLL_MS) {
    pollAccumMs = 0;
    ensureMusic(hostScene);
  }
  for (const v of voices) {
    const cfg = MUSIC_TRACKS[v.id];
    v.level = stepFade(v.level, v.target, dtMs, v.target === 1 ? cfg.fadeInMs : cfg.fadeOutMs);
    setVoiceVolume(v);
  }
  const done = voices.filter((v) => v.target === 0 && v.level === 0);
  if (done.length > 0) {
    voices = voices.filter((v) => !done.includes(v));
    for (const v of done) {
      v.sound.destroy();
    }
  }
}

function installMusicDirector(scene: Phaser.Scene): void {
  if (directorInstalled || !scene.game?.events) {
    return;
  }
  directorInstalled = true;
  scene.game.events.on("poststep", (_time: number, delta: number) => tickMusic(delta));
}

// --------------------------------------------------------------------------
// HUD controls and global input hooks
// --------------------------------------------------------------------------

let gestureHooksInstalled = false;

/** First pointer/key anywhere unlocks audio; every HUD button click gets a UI tick. */
function installGlobalAudioHooks(scene: Phaser.Scene): void {
  if (gestureHooksInstalled || typeof document === "undefined") {
    return;
  }
  gestureHooksInstalled = true;
  const unlock = () => {
    if (hostScene) {
      unlockAudioFromGesture(hostScene);
    }
  };
  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest?.("button");
    if (button && !(button as HTMLButtonElement).disabled) {
      playUiClickSfx(scene);
    }
  });
}

export function initMuteControl(scene: Phaser.Scene): void {
  hostScene = scene;
  applySoundSettings(scene);
  syncMuteButton();
  installGlobalAudioHooks(scene);
  const btn = document.getElementById("mute-audio-btn");
  if (btn && btn.dataset.bound !== "1") {
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      unlockAudioFromGesture(scene);
      setAudioMuted(!muted, scene);
    });
  }
  const slider = document.getElementById("volume-audio-range") as HTMLInputElement | null;
  if (slider && slider.dataset.bound !== "1") {
    slider.dataset.bound = "1";
    slider.addEventListener("input", () => {
      unlockAudioFromGesture(scene);
      setAudioVolume(Number(slider.value) / 100, scene);
    });
  }
}
