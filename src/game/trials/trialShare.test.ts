import { describe, expect, it } from "vitest";
import { seededRng } from "../battle/sparSim";
import {
  buildTrialShareUrl,
  decodeTrialBrag,
  encodeTrialBrag,
  readTrialLink,
  TRIAL_BRAG_MAX_LENGTH,
  TRIAL_FALLBACK_NAME,
  type TrialBrag,
} from "./trialShare";
import { parseTrialDayKey } from "./trialSeed";
import { shouldResetHostSave } from "../world/bootParams";

const DAY = parseTrialDayKey("2026-10-08")!;
const BRAG: TrialBrag = { name: "Finn", score: 6420, rounds: 5, title: 4, party: ["bramblewarden", "hearthflame"] };

function code(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

describe("trial share links (#420)", () => {
  it("round-trips a result", () => {
    expect(decodeTrialBrag(encodeTrialBrag(BRAG))).toEqual(BRAG);
    const url = new URL(buildTrialShareUrl(DAY, BRAG, "https://example.test/play/?card=x&foo=1#h"));
    expect(url.pathname).toBe("/play/");
    expect([...url.searchParams.keys()]).toEqual(["trial", "by"]);
    expect(readTrialLink(url.search, DAY)).toEqual({ status: "ok", day: DAY, brag: BRAG });
    expect(readTrialLink(new URL(buildTrialShareUrl(DAY, null, "https://example.test/")).search, DAY)).toEqual({
      status: "ok",
      day: DAY,
      brag: null,
    });
  });

  it("clamps on encode and sanitizes names", () => {
    const encoded = decodeTrialBrag(
      encodeTrialBrag({ name: "  ", score: 1e9, rounds: 99, title: 42, party: ["mossling", "not-a-creature", ...Array(10).fill("mossling")] }),
    )!;
    expect(encoded.name).toBe(TRIAL_FALLBACK_NAME);
    expect(encoded.score).toBe(100_000);
    expect(encoded.rounds).toBe(5);
    expect(encoded.party).toHaveLength(7);
    expect(encoded.party).not.toContain("not-a-creature");
    const hostile = decodeTrialBrag(code({ v: 1, n: "<b>‮evil\u0000name</b>very long indeed", s: 1200, r: 1, t: 0, p: [] }))!;
    expect(hostile.name).not.toMatch(/[‮\u0000]/);
    expect(Array.from(hostile.name).length).toBeLessThanOrEqual(16);
  });

  it("a bad trial day blocks the link; a bad `by` just drops the brag", () => {
    expect(readTrialLink("")).toEqual({ status: "absent" });
    expect(readTrialLink("?card=abc")).toEqual({ status: "absent" });
    for (const bad of ["?trial=", "?trial=tomorrow", "?trial=2026-02-31", "?trial=1999-01-01", "?trial=2026-10-08x"]) {
      expect(readTrialLink(bad, DAY).status, bad).toBe("invalid");
    }
    expect(readTrialLink("?trial=2026-10-08&by=%%%", DAY)).toEqual({ status: "ok", day: DAY, brag: null });
    expect(readTrialLink("?trial=2026-10-08&by=" + "A".repeat(TRIAL_BRAG_MAX_LENGTH + 1), DAY)).toMatchObject({ brag: null });
  });

  it("opens past days up to a year back, never a future day", () => {
    expect(readTrialLink("?trial=2026-10-08", DAY).status).toBe("ok");
    expect(readTrialLink("?trial=2026-10-09", DAY).status).toBe("invalid");
    const later = parseTrialDayKey("2027-12-01")!;
    expect(readTrialLink("?trial=2026-12-01", later).status).toBe("ok");
    expect(readTrialLink("?trial=2026-11-29", later).status).toBe("invalid");
    // Never before the first fairness-gated day.
    expect(readTrialLink("?trial=2026-10-01", DAY).status).toBe("ok");
    expect(readTrialLink("?trial=2026-09-30", DAY).status).toBe("invalid");
  });

  it("drops a brag whose title or rounds don't match its score", () => {
    const ok = { v: 1, n: "Finn", s: 6420, r: 5, t: 4, p: [] };
    expect(decodeTrialBrag(code(ok))).not.toBeNull();
    expect(decodeTrialBrag(code({ ...ok, t: 5 }))).toBeNull();
    expect(decodeTrialBrag(code({ ...ok, t: 0 }))).toBeNull();
    expect(decodeTrialBrag(code({ ...ok, s: 3000, t: 2 }))).toBeNull();
    expect(decodeTrialBrag(code({ ...ok, s: 3000, t: 2, r: 3 }))).not.toBeNull();
  });

  it("rejects every off-shape payload", () => {
    const valid = { v: 1, n: "Finn", s: 1200, r: 1, t: 0, p: ["mossling"] };
    const variants: unknown[] = [
      null,
      [],
      "str",
      { ...valid, v: 2 },
      { ...valid, extra: 1 },
      { n: "Finn", s: 10, r: 1, t: 0, p: [] },
      { ...valid, n: 5 },
      { ...valid, s: -1 },
      { ...valid, s: 1.5 },
      { ...valid, s: 1e20 },
      { ...valid, r: 6 },
      { ...valid, t: 99 },
      { ...valid, p: "mossling" },
      { ...valid, p: [1] },
      { ...valid, p: ["__proto__"] },
      { ...valid, p: Array(8).fill("mossling") },
    ];
    for (const payload of variants) {
      expect(decodeTrialBrag(code(payload)), JSON.stringify(payload)).toBeNull();
    }
    expect(decodeTrialBrag(code(valid))).not.toBeNull();
    expect(decodeTrialBrag(null)).toBeNull();
    expect(decodeTrialBrag("")).toBeNull();
    expect(decodeTrialBrag("not base64 !")).toBeNull();
  });

  it("fuzz: random strings, bytes and mutated codes never throw", () => {
    const rng = seededRng(420);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=%&?#{}[]\":,.\\/ \u0000‮😀";
    const good = encodeTrialBrag(BRAG);
    for (let i = 0; i < 3000; i++) {
      const len = Math.floor(rng() * 80);
      let s = "";
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rng() * alphabet.length)];
      expect(() => decodeTrialBrag(s)).not.toThrow();
      expect(() => readTrialLink(`?trial=${s}&by=${s}`)).not.toThrow();
      expect(() => readTrialLink(s)).not.toThrow();
      // Flip a character of a valid code: decodes to a valid brag or null, never junk.
      const at = Math.floor(rng() * good.length);
      const mutated = good.slice(0, at) + alphabet[Math.floor(rng() * 64)] + good.slice(at + 1);
      const decoded = decodeTrialBrag(mutated);
      if (decoded) {
        expect(decoded.score).toBeGreaterThanOrEqual(0);
        expect(decoded.score).toBeLessThanOrEqual(100_000);
        expect(Array.from(decoded.name).length).toBeLessThanOrEqual(16);
      }
      // Random JSON shapes.
      const shape = { v: rng() < 0.8 ? 1 : rng(), n: s, s: Math.floor(rng() * 2e5) - 5e4, r: Math.floor(rng() * 8) - 1, t: Math.floor(rng() * 8) - 1, p: rng() < 0.5 ? [s] : ["mossling"] };
      expect(() => decodeTrialBrag(code(shape))).not.toThrow();
    }
  });

  it("?new=1 riding on a trial link never wipes a save", () => {
    expect(shouldResetHostSave("absent", new URLSearchParams("?trial=2026-10-08&new=1"))).toBe(false);
    expect(shouldResetHostSave("absent", new URLSearchParams("?new=1"))).toBe(true);
  });
});
