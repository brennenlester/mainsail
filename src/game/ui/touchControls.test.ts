import { describe, expect, it } from "vitest";
import { areTouchControlsVisible, TOUCH_CONTROLS_MEDIA } from "./touchControls";

describe("areTouchControlsVisible (#404)", () => {
  const media = (matches: boolean) => (query: string) => ({ matches: matches && query === TOUCH_CONTROLS_MEDIA });

  it("follows the touch / narrow layout query", () => {
    expect(areTouchControlsVisible(media(true))).toBe(true);
    expect(areTouchControlsVisible(media(false))).toBe(false);
  });

  it("ignores the stick being hidden by a battle / encounter / cutscene", () => {
    const root = document.createElement("div");
    root.id = "touch-controls";
    root.style.display = "none";
    document.body.appendChild(root);
    document.body.classList.add("battle-active");
    try {
      // Still a touch layout: prompts keep "Tap E" after the battle.
      expect(areTouchControlsVisible(media(true))).toBe(true);
    } finally {
      root.remove();
      document.body.classList.remove("battle-active");
    }
  });

  it("is false without matchMedia", () => {
    expect(areTouchControlsVisible(undefined)).toBe(false);
  });
});
