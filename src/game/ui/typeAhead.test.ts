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

  it("ignores a leading space and named keys without consuming them", () => {
    expect(stepTypeAhead("", key(" "))).toEqual({ buffer: "", consumed: false });
    expect(stepTypeAhead("Ab", key("Shift"))).toEqual({ buffer: "Ab", consumed: false });
    expect(stepTypeAhead("Ab", key(" "))).toEqual({ buffer: "Ab ", consumed: true });
  });

  it("stops buffering on IME / dead keys and lets them through", () => {
    for (const ev of [key("Process"), key("Dead"), key("Unidentified"), key("a", true)]) {
      expect(isComposingKey(ev)).toBe(true);
      expect(stepTypeAhead("Ab", ev)).toEqual({ buffer: null, consumed: false });
    }
  });
});
