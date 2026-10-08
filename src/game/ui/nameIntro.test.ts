import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initNameIntro, isNameIntroOpen } from "./nameIntro";
import {
  getPlayerName,
  resetPlayerNameForTest,
  setPlayerName,
} from "../world/playerName";
import { setVisitorMode } from "../world/worldSession";

function mountIntroDom(): void {
  document.body.innerHTML = `
    <div id="playfield"></div>
    <div id="name-intro" class="name-intro" role="dialog" aria-modal="true" hidden>
      <form id="name-intro-form">
        <input id="name-intro-input" type="text" maxlength="16" />
        <p id="name-intro-error"></p>
        <button type="submit">Begin</button>
      </form>
    </div>
  `;
}

describe("initNameIntro", () => {
  beforeEach(() => {
    resetPlayerNameForTest();
    setVisitorMode(false);
    mountIntroDom();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetPlayerNameForTest();
  });

  it("shows the overlay when unnamed and hides after a valid submit", () => {
    expect(initNameIntro()).toBe(true);
    expect(isNameIntroOpen()).toBe(true);
    expect(document.getElementById("playfield")?.hasAttribute("inert")).toBe(
      true,
    );

    const form = document.getElementById("name-intro-form") as HTMLFormElement;
    const input = document.getElementById(
      "name-intro-input",
    ) as HTMLInputElement;
    input.value = "Mira";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    expect(isNameIntroOpen()).toBe(false);
    expect(getPlayerName()).toBe("Mira");
    expect(document.getElementById("playfield")?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("keeps the overlay open for empty names", () => {
    initNameIntro();
    const form = document.getElementById("name-intro-form") as HTMLFormElement;
    const input = document.getElementById(
      "name-intro-input",
    ) as HTMLInputElement;
    const error = document.getElementById("name-intro-error");
    input.value = "   ";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(isNameIntroOpen()).toBe(true);
    expect(error?.textContent).toMatch(/1–16/);
    expect(getPlayerName()).toBeNull();

    // Retry after a failed submit must still work (listener stays bound).
    input.value = "Mira";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(isNameIntroOpen()).toBe(false);
    expect(getPlayerName()).toBe("Mira");
  });

  it("keyboard gate: Escape and stray keys never skip into a nameless session", () => {
    const onNamed = vi.fn();
    initNameIntro(onNamed);
    const input = document.getElementById(
      "name-intro-input",
    ) as HTMLInputElement;
    for (const key of ["Escape", "Enter", " ", "e"]) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    document.getElementById("playfield")?.click();
    expect(isNameIntroOpen()).toBe(true);
    expect(getPlayerName()).toBeNull();
    expect(onNamed).not.toHaveBeenCalled();
  });

  it("runs the opening beat callback exactly once after naming (#363)", () => {
    const onNamed = vi.fn();
    initNameIntro(onNamed);
    const form = document.getElementById("name-intro-form") as HTMLFormElement;
    const input = document.getElementById(
      "name-intro-input",
    ) as HTMLInputElement;
    input.value = "Tess";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(onNamed).toHaveBeenCalledTimes(1);
  });

  it("does not run the opening callback for an already-named Continue", () => {
    setPlayerName("Kept");
    const onNamed = vi.fn();
    initNameIntro(onNamed);
    expect(onNamed).not.toHaveBeenCalled();
  });

  it("skips the overlay when a name is already set", () => {
    setPlayerName("Kept");
    expect(initNameIntro()).toBe(false);
    expect(isNameIntroOpen()).toBe(false);
  });
});
