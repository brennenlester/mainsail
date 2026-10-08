import { describe, expect, it } from "vitest";
import { topHudInsetCss } from "./hudInset";

describe("topHudInsetCss", () => {
  it("keeps the base inset when no story card overlaps", () => {
    expect(topHudInsetCss(56, 0, 18)).toBe(56);
  });

  it("clears the story card for a centre-origin pill (360x640, #388)", () => {
    // card bottom 82 CSS px below the board top, 36px-tall pill centred on its origin
    const inset = topHudInsetCss(56, 82, 18);
    expect(inset - 18).toBeGreaterThanOrEqual(82 + 8);
  });

  it("keeps larger toast insets stacked below the card", () => {
    expect(topHudInsetCss(120, 82, 0)).toBe(82 + 8 + 64);
  });
});
