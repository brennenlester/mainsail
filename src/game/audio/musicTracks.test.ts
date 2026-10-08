import { describe, expect, it } from "vitest";
import { FOLKLORE_TYPES } from "../creatures/folkloreTypes";
import type { ZoneId } from "../world/zoneTypes";
import { ZONES } from "../world/zones";
import {
  isNightHour,
  MUSIC_TRACKS,
  moveSfxCategory,
  selectMusicTrack,
  stepFade,
  stepSurfaceForZone,
  zoneMusicTrack,
  type MusicContext,
} from "./musicTracks";

const base: MusicContext = { shrineOpen: false, battle: false, victory: false, night: false };

describe("zoneMusicTrack", () => {
  it("maps the three signature zones by day", () => {
    expect(zoneMusicTrack("grove", false)).toBe("grove");
    expect(zoneMusicTrack("shrine", false)).toBe("shrine");
    expect(zoneMusicTrack("village", false)).toBe("village");
  });

  it("swaps outdoor zones to the night variant after dark, not the shrine or interiors", () => {
    expect(zoneMusicTrack("grove", true)).toBe("night");
    expect(zoneMusicTrack("village", true)).toBe("night");
    expect(zoneMusicTrack("shrine", true)).toBe("shrine");
    expect(zoneMusicTrack("warden-cottage", true)).toBe("village");
  });

  it("keeps Mistwood in the night variant by day", () => {
    expect(zoneMusicTrack("mistwood", false)).toBe("night");
  });

  it("returns a real track for every zone", () => {
    for (const id of Object.keys(ZONES) as ZoneId[]) {
      expect(MUSIC_TRACKS[zoneMusicTrack(id, false)]).toBeDefined();
      expect(MUSIC_TRACKS[zoneMusicTrack(id, true)]).toBeDefined();
    }
  });
});

describe("selectMusicTrack", () => {
  it("has no track before a zone or screen is known", () => {
    expect(selectMusicTrack(base)).toBeNull();
  });

  it("follows the zone", () => {
    expect(selectMusicTrack({ ...base, zoneId: "village" })).toBe("village");
  });

  it("prioritizes victory > battle > title > shrine overlay > zone", () => {
    const all: MusicContext = {
      screen: "title",
      zoneId: "grove",
      shrineOpen: true,
      battle: true,
      victory: true,
      night: false,
    };
    expect(selectMusicTrack(all)).toBe("victory");
    expect(selectMusicTrack({ ...all, victory: false })).toBe("battle");
    expect(selectMusicTrack({ ...all, victory: false, battle: false })).toBe("title");
    expect(selectMusicTrack({ ...all, victory: false, battle: false, screen: undefined })).toBe("shrine");
    expect(
      selectMusicTrack({ ...all, victory: false, battle: false, screen: undefined, shrineOpen: false }),
    ).toBe("grove");
  });

  it("only the victory sting is a one-shot", () => {
    const oneShots = Object.entries(MUSIC_TRACKS).filter(([, c]) => !c.loop);
    expect(oneShots.map(([id]) => id)).toEqual(["victory"]);
    expect(MUSIC_TRACKS.victory.durationMs).toBeGreaterThan(0);
  });
});

describe("isNightHour", () => {
  it("is night from 20:00 to 05:59", () => {
    expect([0, 5, 20, 23].every(isNightHour)).toBe(true);
    expect([6, 12, 19].some(isNightHour)).toBe(false);
  });
});

describe("stepSurfaceForZone", () => {
  it("varies by zone", () => {
    expect(stepSurfaceForZone("grove")).toBe("grass");
    expect(stepSurfaceForZone("shrine")).toBe("stone");
    expect(stepSurfaceForZone("harbor")).toBe("wood");
    expect(stepSurfaceForZone("archipelago")).toBe("sand");
    expect(stepSurfaceForZone("hermit-cottage")).toBe("wood");
  });
});

describe("moveSfxCategory", () => {
  it("maps battle types onto fire / water / grove / neutral", () => {
    expect(moveSfxCategory("ember")).toBe("fire");
    expect(moveSfxCategory("water")).toBe("water");
    expect(moveSfxCategory("woodland")).toBe("grove");
    expect(moveSfxCategory("fen")).toBe("grove");
    expect(moveSfxCategory("earth")).toBe("neutral");
  });

  it("covers every folklore type", () => {
    for (const type of FOLKLORE_TYPES) {
      expect(["fire", "water", "grove", "neutral"]).toContain(moveSfxCategory(type));
    }
  });
});

describe("stepFade", () => {
  it("moves linearly and never overshoots", () => {
    expect(stepFade(0, 1, 500, 1000)).toBeCloseTo(0.5);
    expect(stepFade(0.9, 1, 500, 1000)).toBe(1);
    expect(stepFade(1, 0, 250, 1000)).toBeCloseTo(0.75);
    expect(stepFade(0.1, 0, 500, 1000)).toBe(0);
  });

  it("jumps when the fade is instant or the step covers it", () => {
    expect(stepFade(0, 1, 16, 0)).toBe(1);
    expect(stepFade(0.2, 1, 5000, 1000)).toBe(1);
  });
});
