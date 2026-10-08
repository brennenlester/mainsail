import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  bindCutscene,
  enterCutscene,
  HUD_LOCK_CLASSES,
  initHudLock,
  isCutsceneActive,
  isHudLocked,
  runCutsceneCreate,
  syncHudLock,
} from "./hudLock";

function fakeScene() {
  const handlers = new Map<string, () => void>();
  return {
    events: {
      once(event: string, fn: () => void) {
        handlers.set(event, fn);
      },
    },
    emit: (event: string) => handlers.get(event)?.(),
  };
}

describe("hud lock (#391)", () => {
  beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = '<div id="status-panel"></div><div id="status-overflow-menu"></div>';
  });
  afterEach(() => {
    document.body.className = "";
  });

  it("a cutscene sets the body class, makes the dock inert, and releases on shutdown", () => {
    const scene = fakeScene();
    bindCutscene(scene);
    expect(document.body.classList.contains("cutscene-active")).toBe(true);
    expect(isCutsceneActive()).toBe(true);
    expect(document.getElementById("status-panel")?.hasAttribute("inert")).toBe(true);
    scene.emit("shutdown");
    expect(document.body.classList.contains("cutscene-active")).toBe(false);
    expect(document.getElementById("status-panel")?.hasAttribute("inert")).toBe(false);
  });

  it("nested cutscenes keep the lock until the last one ends; release is idempotent", () => {
    const a = enterCutscene();
    const b = enterCutscene();
    a();
    a();
    expect(isHudLocked()).toBe(true);
    b();
    expect(isHudLocked()).toBe(false);
  });

  it("releases the lock when a cutscene's create() throws", () => {
    const scene = fakeScene();
    expect(() =>
      runCutsceneCreate(scene, () => {
        expect(isHudLocked()).toBe(true);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(isHudLocked()).toBe(false);
    expect(isCutsceneActive()).toBe(false);
  });

  it("locks the dock for battle and encounter classes too", () => {
    for (const cls of HUD_LOCK_CLASSES) {
      document.body.className = cls;
      syncHudLock();
      expect(document.getElementById("status-panel")?.hasAttribute("inert")).toBe(true);
    }
    document.body.className = "";
    syncHudLock();
    expect(document.getElementById("status-panel")?.hasAttribute("inert")).toBe(false);
  });

  it("follows body class changes once initialised", async () => {
    initHudLock();
    document.body.classList.add("battle-active");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById("status-panel")?.hasAttribute("inert")).toBe(true);
  });

  it("style.css hides the floating chrome for every lock class", () => {
    const css = readFileSync(path.join(process.cwd(), "src/style.css"), "utf8");
    for (const cls of HUD_LOCK_CLASSES) {
      expect(css).toContain(`body.${cls} #quest-hud`);
      expect(css).toContain(`body.${cls} .opening-caption`);
      expect(css).toContain(`body.${cls} .touch-controls`);
    }
  });
});
