import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TitleMenu,
  navFromKey,
  titleMenuItems,
  wrapFocus,
  type TitleMenuOptions,
} from "./titleMenu";

function options(overrides: Partial<TitleMenuOptions> = {}): TitleMenuOptions {
  let effects = true;
  let muted = false;
  let volume = 0.8;
  return {
    hasSave: false,
    onContinue: vi.fn(),
    onNewGame: vi.fn(),
    settings: {
      effects: () => effects,
      setEffects: (on) => {
        effects = on;
      },
      muted: () => muted,
      setMuted: (m) => {
        muted = m;
      },
      volume: () => volume,
      setVolume: (v) => {
        volume = v;
      },
    },
    ...overrides,
  };
}

const labels = (menu: TitleMenu): string[] =>
  Array.from(menu.root.querySelectorAll(".title-menu__label")).map((el) => el.textContent ?? "");

describe("title menu model", () => {
  it("no save: New Game first, no Continue", () => {
    expect(titleMenuItems(false).map((i) => i.id)).toEqual(["new-game", "settings"]);
  });

  it("save present: Continue first (default focus), then New Game", () => {
    expect(titleMenuItems(true).map((i) => i.id)).toEqual(["continue", "new-game", "settings"]);
  });

  it("wraps focus both ways", () => {
    expect(wrapFocus(0, -1, 3)).toBe(2);
    expect(wrapFocus(2, 1, 3)).toBe(0);
    expect(wrapFocus(1, 1, 3)).toBe(2);
  });

  it("maps arrows / WASD / Escape to nav inputs", () => {
    expect(navFromKey("ArrowUp")).toBe("up");
    expect(navFromKey("s")).toBe("down");
    expect(navFromKey("Escape")).toBe("back");
    expect(navFromKey("Enter")).toBeNull();
  });
});

describe("TitleMenu (DOM)", () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="game"></div>';
    host = document.getElementById("game")!;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses New Game by default with no save and starts without a wipe", () => {
    const opts = options();
    const menu = new TitleMenu(host, opts);
    menu.show();
    expect(labels(menu)).toEqual(["New Game", "Settings"]);
    expect(document.activeElement?.id).toBe("title-new-game");
    menu.nav("activate");
    expect(opts.onNewGame).toHaveBeenCalledWith(false);
  });

  it("focuses Continue by default when a save exists (Enter resumes)", () => {
    const opts = options({ hasSave: true, continueDetail: "Mira" });
    const menu = new TitleMenu(host, opts);
    menu.show();
    expect(document.activeElement?.id).toBe("title-continue");
    expect(menu.root.textContent).toContain("Mira");
    menu.nav("activate");
    expect(opts.onContinue).toHaveBeenCalledTimes(1);
    // A second activation (double tap) must not start twice.
    (document.getElementById("title-continue") as HTMLButtonElement).click();
    expect(opts.onContinue).toHaveBeenCalledTimes(1);
  });

  it("New Game over a save asks to confirm; Keep returns, Erase wipes", () => {
    const opts = options({ hasSave: true });
    const menu = new TitleMenu(host, opts);
    menu.show();
    menu.nav("down");
    expect(document.activeElement?.id).toBe("title-new-game");
    menu.nav("activate");
    expect(menu.currentView).toBe("confirm");
    expect(document.activeElement?.id).toBe("title-confirm-cancel");
    menu.nav("activate");
    expect(menu.currentView).toBe("main");
    expect(opts.onNewGame).not.toHaveBeenCalled();

    menu.nav("down");
    menu.nav("activate");
    menu.nav("down");
    expect(document.activeElement?.id).toBe("title-confirm-wipe");
    menu.nav("activate");
    expect(opts.onNewGame).toHaveBeenCalledWith(true);
  });

  it("Escape backs out of confirm without wiping", () => {
    const opts = options({ hasSave: true });
    const menu = new TitleMenu(host, opts);
    menu.show();
    (document.getElementById("title-new-game") as HTMLButtonElement).click();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(menu.currentView).toBe("main");
    expect(opts.onNewGame).not.toHaveBeenCalled();
  });

  it("arrow keys move focus and wrap", () => {
    const menu = new TitleMenu(host, options({ hasSave: true }));
    menu.show();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement?.id).toBe("title-settings");
  });

  it("settings toggle Effects and Sound and step volume with left/right", () => {
    const opts = options();
    const menu = new TitleMenu(host, opts);
    menu.show();
    (document.getElementById("title-settings") as HTMLButtonElement).click();
    expect(menu.currentView).toBe("settings");
    expect(document.activeElement?.id).toBe("title-effects");
    menu.nav("activate");
    expect(opts.settings.effects()).toBe(false);
    expect(document.getElementById("title-effects")?.textContent).toContain("Off");
    menu.nav("down");
    menu.nav("activate");
    expect(opts.settings.muted()).toBe(true);
    menu.nav("down");
    expect(document.activeElement?.id).toBe("title-volume");
    menu.nav("left");
    expect(opts.settings.volume()).toBeCloseTo(0.75);
    menu.nav("back");
    expect(menu.currentView).toBe("main");
  });
});
