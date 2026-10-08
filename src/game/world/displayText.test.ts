import { describe, expect, it } from "vitest";
import { capCodePoints, cleanDisplayText } from "./displayText";
import { normalizePlayerName } from "./playerName";
import { normalizeNickname } from "../companions/companionState";
import { sanitizeShareNickname } from "../share/shareCode";

describe("cleanDisplayText", () => {
  it("strips default-ignorable fillers and the Braille blank", () => {
    for (const blank of ["ㅤ", "ᅟᅠ", "⠀", "ﾠ", "͏", "᠎", "⁠", " ㅤ⠀ "]) {
      expect(cleanDisplayText(blank), JSON.stringify(blank)).toBe("");
    }
    expect(cleanDisplayText("AㅤB")).toBe("AB");
    expect(cleanDisplayText("A⠀B")).toBe("AB");
  });

  it("treats marks-only text as blank, but keeps marks on a base letter", () => {
    expect(cleanDisplayText("́́")).toBe("");
    expect(cleanDisplayText("́ ̀")).toBe("");
    expect(cleanDisplayText("é")).toBe("é");
    expect(cleanDisplayText("Zoë")).toBe("Zoë");
  });

  it("keeps ZWJ emoji sequences and variation selectors, strips stray joiners", () => {
    const family = "👨‍👩‍👧";
    expect(cleanDisplayText(family)).toBe(family);
    expect(cleanDisplayText("❤️")).toBe("❤️");
    expect(cleanDisplayText("❤️‍🔥")).toBe("❤️‍🔥");
    expect(cleanDisplayText("A‍B")).toBe("AB");
    expect(cleanDisplayText("‍👍")).toBe("👍");
    expect(cleanDisplayText("👍‍")).toBe("👍");
    expect(cleanDisplayText("‍‍")).toBe("");
  });

  it("still strips bidi, controls, lone surrogates and zalgo", () => {
    expect(cleanDisplayText("Ev‮il​\u0000\nBoy")).toBe("Evil Boy");
    expect(cleanDisplayText("Ivy\uD800x")).toBe("Ivyx");
    expect(cleanDisplayText("Z" + "́".repeat(30) + "a")).toBe("Ź́a");
  });

  it("capCodePoints never splits a pair", () => {
    expect(Array.from(capCodePoints("🦊".repeat(30), 16))).toHaveLength(16);
  });
});

describe("callers use the shared filter", () => {
  it("player name: invisible-only input is rejected", () => {
    expect(normalizePlayerName("ㅤㅤ")).toBeNull();
    expect(normalizePlayerName("⠀")).toBeNull();
    expect(normalizePlayerName("́")).toBeNull();
    expect(normalizePlayerName("  Rowan ")).toBe("Rowan");
    expect(normalizePlayerName("AㅤB")).toBe("AB");
  });

  it("nickname: invisible-only input falls back to the species name (undefined)", () => {
    expect(normalizeNickname("ㅤ")).toBeUndefined();
    expect(normalizeNickname("́́")).toBeUndefined();
    expect(normalizeNickname(" Sprout   Jr ")).toBe("Sprout Jr");
  });

  it("share nickname: same filter, blank becomes empty (no nickname)", () => {
    expect(sanitizeShareNickname("ㅤ⠀")).toBe("");
    expect(sanitizeShareNickname("Foxㅤy")).toBe("Foxy");
  });
});
