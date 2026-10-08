import { describe, expect, it } from "vitest";
import { toBase64Url } from "../world/invite";
import {
  buildShareUrl,
  decodeShareCode,
  encodeShareSnapshot,
  readShareParam,
  sanitizeShareName,
  SHARE_CODE_MAX_LENGTH,
  SHARE_FALLBACK_NAME,
  type ShareSnapshot,
} from "./shareCode";

const DAY = 20_733; // 2026-10-07

function sample(overrides: Partial<ShareSnapshot> = {}): ShareSnapshot {
  return {
    name: "Brennen",
    day: DAY,
    party: [
      { id: "bramblewarden", level: 14, rare: false, evolved: true, presence: false, bond: 4 },
      { id: "lantern-fox", level: 9, rare: true, evolved: false, presence: true, bond: 1 },
    ],
    ...overrides,
  };
}

function raw(payload: unknown): string {
  return toBase64Url(JSON.stringify(payload));
}

function expectInvalid(code: string | null): void {
  expect(decodeShareCode(code)).toEqual({ status: "invalid" });
}

describe("share code round trip", () => {
  it("encodes and decodes a party snapshot", () => {
    const decoded = decodeShareCode(encodeShareSnapshot(sample()));
    expect(decoded).toEqual({ status: "ok", snapshot: sample() });
  });

  it("stays compact for a full party", () => {
    const party = Array.from({ length: 7 }, () => ({
      id: "bramblewarden",
      level: 50,
      rare: true,
      evolved: true,
      presence: true,
      bond: 5,
    }));
    const code = encodeShareSnapshot(sample({ party, name: "Sixteen-chars-ok" }));
    expect(code.length).toBeLessThan(400);
    expect(decodeShareCode(code).status).toBe("ok");
  });

  it("clamps levels and caps the party on encode", () => {
    const party = Array.from({ length: 9 }, (_, i) => ({
      id: "mossling",
      level: i === 0 ? 999 : -4,
      rare: false,
      evolved: false,
      presence: false,
      bond: 0,
    }));
    const decoded = decodeShareCode(encodeShareSnapshot(sample({ party })));
    expect(decoded.status).toBe("ok");
    if (decoded.status !== "ok") return;
    expect(decoded.snapshot.party).toHaveLength(7);
    expect(decoded.snapshot.party[0].level).toBe(50);
    expect(decoded.snapshot.party[1].level).toBe(1);
  });

  it("clamps out-of-range levels in a crafted link", () => {
    const decoded = decodeShareCode(
      raw({ v: 1, n: "x", d: DAY, p: [["mossling", 9000.7, 0]] }),
    );
    expect(decoded.status === "ok" && decoded.snapshot.party[0].level).toBe(50);
  });

  it("builds a clean URL that drops other params", () => {
    const url = new URL(buildShareUrl(sample(), "https://example.test/play?join=zzz&new=1#x"));
    expect([...url.searchParams.keys()]).toEqual(["card"]);
    expect(url.hash).toBe("");
    expect(readShareParam(url.search).status).toBe("ok");
  });

  it("reports absent when there is no card param", () => {
    expect(readShareParam("?join=abc")).toEqual({ status: "absent" });
  });
});

describe("share code versions", () => {
  it("encodes v2 with bond hearts", () => {
    const code = encodeShareSnapshot(sample());
    const decoded = decodeShareCode(code);
    expect(decoded.status === "ok" && decoded.snapshot.party.map((c) => c.bond)).toEqual([4, 1]);
  });

  it("still accepts v1 links (no bond)", () => {
    const decoded = decodeShareCode(raw({ v: 1, n: "Old", d: DAY, p: [["mossling", 4, 1]] }));
    expect(decoded.status).toBe("ok");
    if (decoded.status !== "ok") return;
    expect(decoded.snapshot.party[0]).toEqual({
      id: "mossling",
      level: 4,
      rare: true,
      evolved: false,
      presence: false,
      bond: null,
    });
  });

  it("rejects bad v2 bond values and wrong tuple sizes", () => {
    expectInvalid(raw({ v: 2, n: "x", d: DAY, p: [["mossling", 1, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, 0, 2]] }));
    expectInvalid(raw({ v: 2, n: "x", d: DAY, p: [["mossling", 1, 0, 6]] }));
    expectInvalid(raw({ v: 2, n: "x", d: DAY, p: [["mossling", 1, 0, -1]] }));
    expectInvalid(raw({ v: 2, n: "x", d: DAY, p: [["mossling", 1, 0, 2.5]] }));
    expectInvalid(raw({ v: 2, n: "x", d: DAY, p: [["mossling", 1, 0, "5"]] }));
    expect(decodeShareCode(raw({ v: 2, n: "x", d: DAY, p: [["mossling", 1, 0, 5]] })).status).toBe("ok");
  });
});

describe("share code validation (untrusted input)", () => {
  it("rejects empty, garbage and non-base64url input", () => {
    expectInvalid("");
    expectInvalid("%%%");
    expectInvalid("abc def");
    expectInvalid("abc+/=");
    expectInvalid("!!!!");
    expectInvalid("bm90LWpzb24"); // "not-json"
    expectInvalid(toBase64Url("null"));
    expectInvalid(toBase64Url("[]"));
    expectInvalid(toBase64Url('"string"'));
  });

  it("rejects oversized codes before decoding", () => {
    expectInvalid("A".repeat(SHARE_CODE_MAX_LENGTH + 1));
    const bloated = raw({ v: 1, n: "x".repeat(2000), d: DAY, p: [["mossling", 1, 0]] });
    expect(bloated.length).toBeGreaterThan(SHARE_CODE_MAX_LENGTH);
    expectInvalid(bloated);
  });

  it("rejects wrong or missing versions", () => {
    expectInvalid(raw({ v: 3, n: "x", d: DAY, p: [["mossling", 1, 0, 0]] }));
    expectInvalid(raw({ v: "1", n: "x", d: DAY, p: [["mossling", 1, 0]] }));
    expectInvalid(raw({ n: "x", d: DAY, p: [["mossling", 1, 0]] }));
  });

  it("rejects unknown or extra keys (incl. __proto__)", () => {
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, 0]], x: 1 }));
    expectInvalid(
      toBase64Url(`{"v":1,"n":"x","d":${DAY},"p":[["mossling",1,0]],"__proto__":{"a":1}}`),
    );
  });

  it("rejects unknown species ids", () => {
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["missingno", 5, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["__proto__", 5, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["toString", 5, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [[1, 5, 0]] }));
  });

  it("rejects malformed party entries and sizes", () => {
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [] }));
    expectInvalid(
      raw({ v: 1, n: "x", d: DAY, p: Array.from({ length: 8 }, () => ["mossling", 1, 0]) }),
    );
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", "5", 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", null, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, 8]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, -1]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, 1.5]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, 4294967296]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: [["mossling", 1, 4294967303]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY, p: { 0: ["mossling", 1, 0] } }));
  });

  it("rejects bad dates and non-string names", () => {
    expectInvalid(raw({ v: 1, n: "x", d: 5, p: [["mossling", 1, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: 1e12, p: [["mossling", 1, 0]] }));
    expectInvalid(raw({ v: 1, n: "x", d: DAY + 0.5, p: [["mossling", 1, 0]] }));
    expectInvalid(raw({ v: 1, n: { a: 1 }, d: DAY, p: [["mossling", 1, 0]] }));
  });
});

describe("sanitizeShareName", () => {
  it("keeps markup inert text and caps the length", () => {
    const name = sanitizeShareName('<img src=x onerror="alert(1)">');
    expect(name).toBe("<img src=x onerr");
    expect(Array.from(name).length).toBeLessThanOrEqual(16);
  });

  it("strips control, bidi and zero-width characters", () => {
    expect(sanitizeShareName("Ev‮il​\u0000\nName")).toBe("Evil Name");
  });

  it("falls back when nothing printable remains", () => {
    expect(sanitizeShareName("​‮  ")).toBe(SHARE_FALLBACK_NAME);
    expect(sanitizeShareName(42)).toBe(SHARE_FALLBACK_NAME);
  });

  it("strips lone surrogates", () => {
    expect(sanitizeShareName("Ivy\uD800\uDFFFx\uDC00")).toBe("Ivyx");
    expect(sanitizeShareName("🦊Ivy")).toBe("🦊Ivy");
  });

  it("caps combining marks at two per base character (zalgo)", () => {
    const zalgo = "Z" + "\u0301".repeat(40) + "a" + "\u0300\u0301";
    expect(sanitizeShareName(zalgo)).toBe("Z\u0301\u0301a\u0300\u0301");
    expect(sanitizeShareName("Zoë")).toBe("Zoë");
  });

  it("caps by code points, not UTF-16 units", () => {
    expect(Array.from(sanitizeShareName("🦊".repeat(30)))).toHaveLength(16);
  });
});
