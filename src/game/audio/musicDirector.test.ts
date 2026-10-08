import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAudioVolume,
  getDesiredMusicTrack,
  getSfxKeys,
  playBattleWinSfx,
  playMoveTypeSfx,
  playStepSfx,
  setAudioMuted,
  setAudioScreen,
  setAudioVolume,
  setAudioZone,
  tickMusic,
  unlockAudioFromGesture,
} from "./gameAudio";
import { MUSIC_TRACKS, type MusicTrackId } from "./musicTracks";
import { VOLUME_KEY } from "./audioSettings";

type FakeSound = {
  key: string;
  play: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const active = new Set<string>();
const sounds: FakeSound[] = [];

function makeScene() {
  return {
    cache: { audio: { exists: () => true } },
    sound: {
      play: vi.fn(),
      mute: false,
      volume: 1,
      unlock: vi.fn(),
      add: vi.fn((key: string) => {
        const s: FakeSound = { key, play: vi.fn(), setVolume: vi.fn(), destroy: vi.fn() };
        sounds.push(s);
        return s;
      }),
    },
    scene: { manager: { isActive: (k: string) => active.has(k) } },
    game: { events: { on: vi.fn() } },
  } as unknown as Phaser.Scene & {
    sound: { add: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; mute: boolean; volume: number };
  };
}

function liveKeys(): string[] {
  return sounds.filter((s) => s.destroy.mock.calls.length === 0).map((s) => s.key);
}

describe("music director", () => {
  const scene = makeScene();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 12, 0, 0)); // midday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays silent until the first user gesture, then plays the zone track", () => {
    setAudioZone("grove");
    expect(scene.sound.add).not.toHaveBeenCalled();

    unlockAudioFromGesture(scene);
    expect(scene.sound.unlock).toHaveBeenCalled();
    expect(scene.sound.add).toHaveBeenCalledWith("music-grove", { loop: true, volume: 0 });
    expect(sounds[0]!.play).toHaveBeenCalled();
    expect(scene.game.events.on).toHaveBeenCalledWith("poststep", expect.any(Function));
  });

  it("crossfades to the next zone's track and destroys the old one once silent", () => {
    tickMusic(1600); // grove fully faded in
    setAudioZone("shrine");
    expect(liveKeys()).toEqual(["music-grove", "music-shrine"]);

    tickMusic(800); // halfway through the 1600 ms fade
    const shrine = sounds.find((s) => s.key === "music-shrine")!;
    expect(shrine.setVolume.mock.lastCall![0]).toBeCloseTo(0.5 * MUSIC_TRACKS.shrine.gain);
    expect(liveKeys()).toContain("music-grove");

    tickMusic(900);
    expect(liveKeys()).toEqual(["music-shrine"]);
    expect(shrine.setVolume.mock.lastCall![0]).toBeCloseTo(MUSIC_TRACKS.shrine.gain);
  });

  it("switches to battle music while a battle scene is active", () => {
    active.add("BattleScene");
    tickMusic(300); // poll interval elapsed
    expect(getDesiredMusicTrack()).toBe("battle");
    expect(liveKeys()).toContain("music-battle");
  });

  it("plays the victory sting on a win, then returns to zone music, not battle", () => {
    playBattleWinSfx(scene);
    expect(getDesiredMusicTrack()).toBe("victory");
    expect(liveKeys()).toContain("music-victory");

    vi.setSystemTime(new Date(2026, 5, 1, 12, 0, 10));
    tickMusic(300);
    expect(getDesiredMusicTrack()).toBe("shrine"); // battle scene still open, but latched
    tickMusic(2000);
    expect(liveKeys()).toEqual(["music-shrine"]);

    active.delete("BattleScene");
    tickMusic(300);
    active.add("BattleScene");
    tickMusic(300);
    expect(getDesiredMusicTrack()).toBe("battle"); // next fight starts fresh
    active.delete("BattleScene");
    tickMusic(300);
  });

  it("uses the night variant after dark and the title screen when claimed", () => {
    vi.setSystemTime(new Date(2026, 5, 1, 22, 30, 0));
    setAudioZone("village");
    expect(getDesiredMusicTrack()).toBe("night");

    setAudioScreen("title", scene);
    expect(getDesiredMusicTrack()).toBe("title");
    setAudioScreen(undefined, scene);
    expect(getDesiredMusicTrack()).toBe("night");
  });

  it("applies mute and clamped, persisted volume to the sound manager", () => {
    setAudioMuted(true, scene);
    expect(scene.sound.mute).toBe(true);
    setAudioMuted(false, scene);
    expect(scene.sound.mute).toBe(false);

    setAudioVolume(5, scene);
    expect(getAudioVolume()).toBe(1);
    expect(scene.sound.volume).toBe(1);
    setAudioVolume(0.4, scene);
    expect(scene.sound.volume).toBe(0.4);
    expect(localStorage.getItem(VOLUME_KEY)).toBe("0.4");
  });

  it("picks the footstep sound by zone surface", () => {
    setAudioZone("harbor");
    playStepSfx(scene, 10_000);
    expect(scene.sound.play).toHaveBeenLastCalledWith("sfx-step-wood", expect.any(Object));
    setAudioZone("shrine");
    playStepSfx(scene, 20_000);
    expect(scene.sound.play).toHaveBeenLastCalledWith("sfx-step-stone", expect.any(Object));
  });

  it("plays a distinct sound per move type", () => {
    playMoveTypeSfx(scene, "ember");
    expect(scene.sound.play).toHaveBeenLastCalledWith("sfx-move-fire", expect.any(Object));
    playMoveTypeSfx(scene, "water");
    expect(scene.sound.play).toHaveBeenLastCalledWith("sfx-move-water", expect.any(Object));
    playMoveTypeSfx(scene, "woodland");
    expect(scene.sound.play).toHaveBeenLastCalledWith("sfx-move-grove", expect.any(Object));
    playMoveTypeSfx(scene, "storm");
    expect(scene.sound.play).toHaveBeenLastCalledWith("sfx-move-neutral", expect.any(Object));
  });

  it("does not play SFX while muted", () => {
    setAudioMuted(true, scene);
    const before = scene.sound.play.mock.calls.length;
    playMoveTypeSfx(scene, "ember");
    expect(scene.sound.play.mock.calls.length).toBe(before);
    setAudioMuted(false, scene);
  });
});

describe("audio assets on disk", () => {
  const dir = join(process.cwd(), "public", "assets", "audio");
  const files = readdirSync(dir);

  it("ships every SFX wav and a primary + fallback file for every music track", () => {
    for (const key of getSfxKeys()) {
      expect(files, key).toContain(`${key}.wav`);
    }
    for (const id of Object.keys(MUSIC_TRACKS) as MusicTrackId[]) {
      expect(files, id).toContain(`music-${id}.ogg`);
      expect(files, id).toContain(`music-${id}.m4a`);
    }
  });

  it("stays under the 6 MB audio budget", () => {
    const total = files.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
    expect(total).toBeLessThan(6 * 1024 * 1024);
  });
});
