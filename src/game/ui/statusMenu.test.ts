import { describe, expect, it } from "vitest";
import { chooseMenuPlacement } from "./statusPanel";

describe("chooseMenuPlacement (#391)", () => {
  it("opens above when the dock sits at the bottom of a tall screen", () => {
    const placement = chooseMenuPlacement({
      anchorTop: 760,
      anchorBottom: 804,
      viewportHeight: 844,
      menuHeight: 240,
    });
    expect(placement.side).toBe("above");
    expect(placement.offset).toBe(844 - 760 + 6);
  });

  it("opens below in phone landscape where the button is near the top", () => {
    // 844x390: the button sits at the top of the right-hand dock.
    const placement = chooseMenuPlacement({
      anchorTop: 12,
      anchorBottom: 56,
      viewportHeight: 390,
      menuHeight: 240,
    });
    expect(placement.side).toBe("below");
    expect(placement.offset).toBe(56 + 6);
    expect(placement.maxHeight).toBeGreaterThanOrEqual(240);
  });

  it("falls back to the roomier side and caps height so the menu scrolls", () => {
    const placement = chooseMenuPlacement({
      anchorTop: 150,
      anchorBottom: 194,
      viewportHeight: 360,
      menuHeight: 400,
    });
    expect(placement.side).toBe("below");
    expect(placement.maxHeight).toBeLessThan(400);
    expect(placement.offset + placement.maxHeight).toBeLessThanOrEqual(360);
  });
});
