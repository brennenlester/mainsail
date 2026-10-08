import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { focusGameCanvas, initCanvasFocusReturn, resetCanvasFocusForTest } from "./canvasFocus";
import { popOverlay, pushOverlay, resetOverlayStack } from "./overlayStack";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function pointerClick(el: HTMLElement): void {
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  el.focus();
}

describe("canvas focus hand-back (#390)", () => {
  let canvas: HTMLCanvasElement;
  let hudButton: HTMLButtonElement;
  let input: HTMLInputElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="game"><canvas></canvas></div>
      <div id="status-panel">
        <button id="party-btn" type="button">Party</button>
        <input id="invite-url" />
      </div>
      <div id="party-overlay"><button id="party-close" type="button">×</button></div>`;
    canvas = document.querySelector("#game canvas")!;
    hudButton = document.querySelector("#party-btn")!;
    input = document.querySelector("#invite-url")!;
    resetOverlayStack();
    resetCanvasFocusForTest();
    initCanvasFocusReturn();
  });

  afterEach(() => {
    resetOverlayStack();
  });

  it("focuses the canvas without adding it to the Tab order", () => {
    expect(focusGameCanvas()).toBe(true);
    expect(document.activeElement).toBe(canvas);
    expect(canvas.tabIndex).toBe(-1);
  });

  it("returns focus to the canvas after a pointer click on a HUD button", async () => {
    pointerClick(hudButton);
    await tick();
    expect(document.activeElement).toBe(canvas);
  });

  it("returns focus when a HUD panel closes back onto its button", async () => {
    pointerClick(hudButton);
    pushOverlay("party", () => {});
    const close = document.querySelector<HTMLButtonElement>("#party-close")!;
    close.focus();
    await tick();
    // Panel open: its own controls keep focus.
    expect(document.activeElement).toBe(close);
    popOverlay("party");
    hudButton.focus(); // panels restore the previously focused element
    await tick();
    expect(document.activeElement).toBe(canvas);
  });

  it("leaves keyboard (Tab) navigation of the HUD alone", async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    hudButton.focus();
    await tick();
    expect(document.activeElement).toBe(hudButton);
  });

  it("never steals focus from a text field", async () => {
    pointerClick(input);
    await tick();
    expect(document.activeElement).toBe(input);
    window.dispatchEvent(new Event("focus"));
    await tick();
    expect(document.activeElement).toBe(input);
  });

  it("reclaims focus when the window regains focus", async () => {
    pointerClick(hudButton);
    await tick();
    hudButton.focus();
    window.dispatchEvent(new Event("focus"));
    await tick();
    expect(document.activeElement).toBe(canvas);
  });
});
