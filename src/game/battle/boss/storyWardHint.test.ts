import { describe, expect, it } from "vitest";
// The 640 px overlay design square (render/pixelRatio DESIGN_SIZE; that module needs Phaser).
const DESIGN_SIZE = 640;
import { getStorySpar, hearthWardTriesToNext } from "../../story/storySpars";
import { WARD_CHIP_FONT_PX, wardHintText } from "./wardHint";

describe("Hearth Ward hint (#399)", () => {
  it("counts losses until the ward's next step", () => {
    const boss = getStorySpar("cinder-matriarch");
    // Steps: after 2 losses (0.85), after 4 (0.75).
    expect(hearthWardTriesToNext(boss, 0)).toBe(2);
    expect(hearthWardTriesToNext(boss, 2)).toBe(2);
    expect(hearthWardTriesToNext(boss, 3)).toBe(1);
    expect(hearthWardTriesToNext(boss, 4)).toBeNull();
    expect(hearthWardTriesToNext(boss, 9)).toBeNull();
  });

  it("words the hint and hides it at the last step", () => {
    expect(wardHintText(2)).toBe("2 more tries until the ward strengthens");
    expect(wardHintText(1)).toBe("1 more try until the ward strengthens");
    expect(wardHintText(null)).toBeNull();
  });

  it("keeps the chip >= 11 CSS px on a 360 px wide phone", () => {
    expect(WARD_CHIP_FONT_PX * (360 / DESIGN_SIZE)).toBeGreaterThanOrEqual(11);
  });
});
