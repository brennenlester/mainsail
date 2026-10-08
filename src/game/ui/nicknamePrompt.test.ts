import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNicknamePromptBlocking,
  isNicknamePromptOpen,
  promptNickname,
  setNicknameKeyboardHandler,
} from "./nicknamePrompt";
import { getOverlayStackIds, resetOverlayStack } from "./overlayStack";
import type { CreatureInstance } from "../creatures/types";

function creature(): CreatureInstance {
  return {
    instanceId: "a",
    definitionId: "ember-wisp",
    speciesId: "ember-wisp",
    currentHp: 10,
    level: 3,
    xp: 0,
  };
}

function input(): HTMLInputElement {
  return document.getElementById("nickname-input") as HTMLInputElement;
}

describe("nickname prompt focus (#409)", () => {
  const captured: boolean[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    // happy-dom has no rAF-driven layout; run the queued focus callback.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    captured.length = 0;
    setNicknameKeyboardHandler((value) => captured.push(value));
  });

  afterEach(() => {
    document.getElementById("nickname-skip")?.dispatchEvent(new MouseEvent("click"));
    setNicknameKeyboardHandler(null);
    resetOverlayStack();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("ambient prompt (a companion just joined) never takes focus or the keyboard", async () => {
    void promptNickname(creature(), { ambient: true });
    vi.runAllTimers();
    expect(isNicknamePromptOpen()).toBe(true);
    expect(isNicknamePromptBlocking()).toBe(false);
    expect(document.activeElement).not.toBe(input());
    expect(document.getElementById("nickname-overlay")?.classList.contains("nickname-overlay--ambient")).toBe(true);
    // World keys keep working: the keyboard was never captured.
    expect(captured).toEqual([]);
    expect(getOverlayStackIds()).not.toContain("nickname");
  });

  it("an ambient prompt captures keys only while the input is focused", () => {
    void promptNickname(creature(), { ambient: true });
    input().dispatchEvent(new FocusEvent("focus"));
    expect(captured).toEqual([false]);
    input().dispatchEvent(new FocusEvent("blur"));
    expect(captured).toEqual([false, true]);
  });

  it("an ambient prompt stays skippable: Skip and Escape both close it", async () => {
    const done = promptNickname(creature(), { ambient: true });
    document.getElementById("nickname-skip")!.click();
    await done;
    expect(isNicknamePromptOpen()).toBe(false);

    const second = promptNickname(creature(), { ambient: true });
    document.querySelector("#nickname-overlay form")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await second;
    expect(isNicknamePromptOpen()).toBe(false);
  });

  it("an explicit prompt (Party panel Rename) is modal and focuses the input", () => {
    void promptNickname(creature());
    vi.runAllTimers();
    expect(isNicknamePromptBlocking()).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(captured).toEqual([false]);
    expect(getOverlayStackIds()).toContain("nickname");
    expect(document.getElementById("nickname-overlay")?.classList.contains("nickname-overlay--ambient")).toBe(false);
  });
});
