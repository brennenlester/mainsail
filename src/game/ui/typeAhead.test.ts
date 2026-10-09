import { describe, expect, it } from "vitest";
import { isComposingKey, stepTypeAhead } from "./typeAhead";

const key = (k: string, isComposing = false) => ({ key: k, isComposing });

describe("name type-ahead (#410)", () => {
  it("buffers printable keys and honours Backspace", () => {
    let buffer: string | null = "";
    for (const k of ["T", "e", "x", "Backspace", "s", "s"]) {
      buffer = stepTypeAhead(buffer!, key(k)).buffer;
    }
    expect(buffer).toBe("Tess");
  });

  it("turns Enter after a typed name into a submit intent (#423)", () => {
    expect(stepTypeAhead("Tess", key("Enter"))).toEqual({ buffer: "Tess", consumed: true, submit: true });
    // Nothing typed yet: the New Game Enter echo is not a submit.
    expect(stepTypeAhead("", key("Enter"))).toEqual({ buffer: "", consumed: false });
    expect(stepTypeAhead("  ", key("Enter")).submit).toBeUndefined();
  });

  it("ignores a leading space and named keys without consuming them", () => {
    expect(stepTypeAhead("", key(" "))).toEqual({ buffer: "", consumed: false });
    expect(stepTypeAhead("Ab", key("Shift"))).toEqual({ buffer: "Ab", consumed: false });
    expect(stepTypeAhead("Ab", key(" "))).toEqual({ buffer: "Ab ", consumed: true });
  });

  it("keeps the buffer through IME / dead keys and lets them through", () => {
    for (const ev of [key("Process"), key("Dead"), key("Unidentified"), key("a", true)]) {
      expect(isComposingKey(ev)).toBe(true);
      expect(stepTypeAhead("Te", ev)).toEqual({ buffer: "Te", consumed: false });
    }
    let buffer = "Te";
    for (const ev of [key("Process", true), key("Process", true), key("s"), key("s")]) {
      buffer = stepTypeAhead(buffer, ev).buffer ?? buffer;
    }
    expect(buffer).toBe("Tess");
  });
});
