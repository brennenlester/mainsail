import { describe, expect, it, beforeEach } from "vitest";
import { syncQuestHudPosition, refreshQuestHud } from "./questHud";
import {
  consumeQuestToast,
  initQuestProgress,
  recordQuestEvent,
  restoreQuestProgress,
} from "../story/questProgress";
import { setInventoryFromSnapshot } from "../inventory/playerInventory";

describe("syncQuestHudPosition", () => {
  it("pins the quest HUD to the game board top-right inside the playfield", () => {
    document.body.innerHTML = `
      <div id="playfield" style="position:relative;width:400px;height:500px">
        <div id="game" style="width:360px;height:360px;margin:0 auto"></div>
        <div id="quest-hud"></div>
        <div id="status-panel"></div>
      </div>
    `;

    const playfield = document.getElementById("playfield")!;
    const game = document.getElementById("game")!;
    const hud = document.getElementById("quest-hud")!;

    playfield.getBoundingClientRect = () =>
      ({
        top: 0,
        right: 400,
        bottom: 500,
        left: 0,
        width: 400,
        height: 500,
      }) as DOMRect;
    game.getBoundingClientRect = () =>
      ({
        top: 0,
        right: 360,
        bottom: 360,
        left: 20,
        width: 360,
        height: 360,
      }) as DOMRect;

    syncQuestHudPosition();

    expect(hud.style.top).toBe("8px");
    expect(hud.style.right).toBe("48px");
    expect(hud.style.left).toBe("auto");
  });
});

describe("refreshQuestHud", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="playfield" style="position:relative;width:400px;height:500px">
        <div id="game" style="width:360px;height:360px;margin:0 auto"></div>
        <div id="quest-hud">
          <div id="quest-hud-summary"></div>
          <div id="quest-hud-hint"></div>
          <div id="quest-hud-npc"></div>
        </div>
      </div>
    `;
    restoreQuestProgress({});
    initQuestProgress();
    consumeQuestToast();
  });

  it("shows quest completion in the tracker immediately", () => {
    recordQuestEvent({ type: "befriend_creature", creatureId: "ember-wisp" });

    const summary = document.getElementById("quest-hud-summary")!;
    const hint = document.getElementById("quest-hud-hint")!;

    expect(summary.textContent).toBe(
      "Quest complete: Befriend your first companion — Ember Wisp joins — restless, bright, and fond of warm hands",
    );
    expect(hint.textContent).toContain("Next:");
    expect(hint.textContent).toContain("Spar");
  });

  it("shows Story N/8 and the beat's villager or rival line (#369)", () => {
    const npc = document.getElementById("quest-hud-npc")!;
    const summary = () =>
      document.getElementById("quest-hud-summary")!.textContent;

    refreshQuestHud();
    expect(summary()).toMatch(/^Story 1\/8:/);
    expect(npc.textContent).toBe("");

    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "shrine-craft": "active",
    });
    refreshQuestHud();
    expect(summary()).toMatch(/^Story 3\/8:/);
    expect(npc.textContent).toContain("Weaver Sable:");

    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "shrine-craft": "complete",
      "first-evolution": "complete",
      "rival-wren": "active",
    });
    refreshQuestHud();
    expect(summary()).toBe("Story 5/8: Beat Wren, the rival");
    expect(npc.textContent).toMatch(/^Wren:/);
  });

  it("keeps an already-started Sovereign voyage visible as optional (#369)", () => {
    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "shrine-craft": "complete",
      "first-evolution": "complete",
      "rival-wren": "active",
    });
    setInventoryFromSnapshot({}, { boat: 1 });
    refreshQuestHud();
    const hint = document.getElementById("quest-hud-hint")!.textContent ?? "";
    expect(hint).toMatch(/^Next: Find Wren/);
    expect(hint).toContain("Optional — Sovereign voyage:");
    setInventoryFromSnapshot({}, {});
  });
});
