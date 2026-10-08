import { describe, expect, it } from "vitest";
import { HOTKEY_ARM_MS, HotkeyGuard, hotkeyAllowed } from "./hotkeyGuard";

describe("hotkeyAllowed (#418)", () => {
  const base = { openedAt: 1000, held: [] as string[] };

  it("ignores hotkeys for the arm window after the card opens", () => {
    expect(hotkeyAllowed({ ...base, now: 1000, code: "KeyS" })).toBe(false);
    expect(hotkeyAllowed({ ...base, now: 1000 + HOTKEY_ARM_MS - 1, code: "KeyS" })).toBe(false);
    expect(hotkeyAllowed({ ...base, now: 1000 + HOTKEY_ARM_MS, code: "KeyS" })).toBe(true);
  });

  it("ignores hotkeys while another movement key is still held", () => {
    const now = 1000 + HOTKEY_ARM_MS + 500;
    // Walking right with D, then S to step down: S must not Spar.
    expect(hotkeyAllowed({ ...base, now, code: "KeyS", held: ["KeyD", "KeyS"] })).toBe(false);
    expect(hotkeyAllowed({ ...base, now, code: "Digit2", held: ["ArrowUp", "Digit2"] })).toBe(false);
    // The pressed key itself is held during its own keydown.
    expect(hotkeyAllowed({ ...base, now, code: "KeyS", held: ["KeyS"] })).toBe(true);
    // Non-movement keys held alongside do not block.
    expect(hotkeyAllowed({ ...base, now, code: "KeyB", held: ["ShiftLeft", "KeyB"] })).toBe(true);
  });

  it("keeps 1-3 / B / F working once armed and hands-free", () => {
    const now = 1000 + HOTKEY_ARM_MS;
    for (const code of ["Digit1", "Digit2", "Digit3", "KeyB", "KeyF", "KeyS"]) {
      expect(hotkeyAllowed({ ...base, now, code, held: [code] })).toBe(true);
    }
  });

  it("HotkeyGuard arms after the window", () => {
    const guard = new HotkeyGuard(0);
    expect(guard.armed(HOTKEY_ARM_MS - 1)).toBe(false);
    expect(guard.armed(HOTKEY_ARM_MS)).toBe(true);
    expect(guard.allows({ code: "KeyF" }, 10)).toBe(false);
    expect(guard.allows({ code: "KeyF" }, HOTKEY_ARM_MS + 1)).toBe(true);
  });
});
