import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissAmbientNicknamePrompt,
  isNicknamePromptBlocking,
  isNicknamePromptOpen,
  promptNickname,
  resetDeferredNicknames,
  setNicknameKeyboardHandler,
  takeDeferredNicknames,
} from "./nicknamePrompt";
import { getOverlayStackIds, resetOverlayStack } from "./overlayStack";
import type { CreatureInstance } from "../creatures/types";

function creature(id = "a"): CreatureInstance {
  return {
    instanceId: id,
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
    resetDeferredNicknames();
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

  it("Rename on creature B while the docked prompt for A is up names only B", async () => {
    const a = creature("a");
    const b = creature("b");
    const docked = promptNickname(a, { ambient: true });
    const rename = promptNickname(b);
    // The docked prompt was closed (resolved) when the modal one took the form.
    await docked;
    vi.runAllTimers();
    expect(isNicknamePromptBlocking()).toBe(true);
    input().value = "Zed";
    document.querySelector("#nickname-overlay form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await rename;
    expect(b.nickname).toBe("Zed");
    expect(a.nickname).toBeUndefined();
    expect(isNicknamePromptOpen()).toBe(false);
    expect(getOverlayStackIds()).not.toContain("nickname");
  });

  it("the Rename prompt keeps its overlay entry when an older docked prompt closes", async () => {
    const docked = promptNickname(creature("a"), { ambient: true });
    void promptNickname(creature("b"));
    await docked;
    // A late dismiss of the (already closed) docked prompt must not touch B's modal state.
    dismissAmbientNicknamePrompt();
    expect(getOverlayStackIds()).toContain("nickname");
    expect(isNicknamePromptBlocking()).toBe(true);
  });

  it("Escape dismisses the docked prompt even when the input is not focused", async () => {
    const done = promptNickname(creature(), { ambient: true });
    expect(document.activeElement).not.toBe(input());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await done;
    expect(isNicknamePromptOpen()).toBe(false);
  });

  it("the docked prompt shows a name hint; the Party panel Rename does not (#429)", () => {
    const hint = (): HTMLElement => document.getElementById("nickname-hint")!;
    void promptNickname(creature(), { ambient: true });
    expect(hint().hidden).toBe(false);
    expect(hint().textContent).toBe("Tap or press N to name your companion (Esc to skip)");
    void promptNickname(creature("b"));
    expect(hint().hidden).toBe(true);
  });

  it("N focuses the docked input when nothing else owns the keyboard (#429)", () => {
    void promptNickname(creature(), { ambient: true });
    const other = new KeyboardEvent("keydown", { key: "w", cancelable: true });
    window.dispatchEvent(other);
    expect(document.activeElement).not.toBe(input());
    expect(other.defaultPrevented).toBe(false);

    const withCtrl = new KeyboardEvent("keydown", { key: "n", ctrlKey: true, cancelable: true });
    window.dispatchEvent(withCtrl);
    expect(document.activeElement).not.toBe(input());

    const press = new KeyboardEvent("keydown", { key: "n", cancelable: true });
    window.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(captured).toEqual([false]);
  });

  it("typing n inside a focused field is left alone, and N ignores other DOM inputs (#429)", () => {
    void promptNickname(creature(), { ambient: true });
    input().focus();
    const typed = new KeyboardEvent("keydown", { key: "n", cancelable: true });
    window.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);

    input().blur();
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "N" }));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("tapping the hint focuses the docked input (#429)", () => {
    void promptNickname(creature(), { ambient: true });
    document.getElementById("nickname-hint")!.click();
    expect(document.activeElement).toBe(input());
  });

  it("N does nothing once the prompt closed (#429)", async () => {
    const done = promptNickname(creature(), { ambient: true });
    document.getElementById("nickname-skip")!.click();
    await done;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    expect(document.activeElement).not.toBe(input());
  });

  it("dismissAmbientNicknamePrompt closes a docked prompt but not a modal one", async () => {
    const docked = promptNickname(creature(), { ambient: true });
    dismissAmbientNicknamePrompt();
    await docked;
    expect(isNicknamePromptOpen()).toBe(false);
    void promptNickname(creature());
    dismissAmbientNicknamePrompt();
    expect(isNicknamePromptOpen()).toBe(true);
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

describe("docked prompt deferral (#432)", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    resetDeferredNicknames();
  });

  afterEach(() => {
    document.getElementById("nickname-skip")?.dispatchEvent(new MouseEvent("click"));
    resetOverlayStack();
    resetDeferredNicknames();
  });

  it("an encounter closing the docked prompt defers its creature, once", async () => {
    const done = promptNickname(creature("a"), { ambient: true });
    dismissAmbientNicknamePrompt();
    dismissAmbientNicknamePrompt();
    await done;
    expect(isNicknamePromptOpen()).toBe(false);
    expect(takeDeferredNicknames()).toEqual(["a"]);
    expect(takeDeferredNicknames()).toEqual([]);
  });

  it("naming, Skip and Esc are answers: they never defer", async () => {
    const named = creature("a");
    const first = promptNickname(named, { ambient: true });
    (document.getElementById("nickname-input") as HTMLInputElement).value = "Pip";
    document.querySelector("#nickname-overlay form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await first;
    expect(named.nickname).toBe("Pip");

    const skipped = promptNickname(creature("b"), { ambient: true });
    document.getElementById("nickname-skip")!.click();
    await skipped;

    const esc = promptNickname(creature("c"), { ambient: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await esc;
    expect(takeDeferredNicknames()).toEqual([]);
  });

  it("two interrupted creatures are kept oldest first and can be re-docked in turn", async () => {
    const a = promptNickname(creature("a"), { ambient: true });
    dismissAmbientNicknamePrompt();
    await a;
    const b = promptNickname(creature("b"), { ambient: true });
    dismissAmbientNicknamePrompt();
    await b;
    expect(takeDeferredNicknames()).toEqual(["a", "b"]);

    // Re-docked and answered this time: nothing is deferred again.
    const again = promptNickname(creature("a"), { ambient: true });
    document.getElementById("nickname-skip")!.click();
    await again;
    expect(takeDeferredNicknames()).toEqual([]);
  });

  it("a modal Rename prompt is never deferred", async () => {
    const rename = promptNickname(creature("a"));
    dismissAmbientNicknamePrompt();
    expect(isNicknamePromptBlocking()).toBe(true);
    document.getElementById("nickname-skip")!.click();
    await rename;
    expect(takeDeferredNicknames()).toEqual([]);
  });
});
