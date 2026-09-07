import { describe, expect, it, beforeEach } from "vitest";
import { syncQuestHudPosition, refreshQuestHud } from "./questHud";
import {
  consumeQuestToast,
  initQuestProgress,
  recordQuestEvent,
  restoreQuestProgress,
} from "../story/questProgress";

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
    recordQuestEvent({ type: "befriend_creature" });

    const summary = document.getElementById("quest-hud-summary")!;
    const hint = document.getElementById("quest-hud-hint")!;

    expect(summary.textContent).toBe("Quest complete: Befriend a wild creature");
    expect(hint.textContent).toContain("Next:");
    expect(hint.textContent).toContain("Spar");
  });

  it("shows Act 1 NPC flavor on steps 3–4 and Act 2 speaker lines after", () => {
    const npc = document.getElementById("quest-hud-npc")!;

    refreshQuestHud();
    expect(document.getElementById("quest-hud-summary")!.textContent).toMatch(
      /^Story 1\/18:/,
    );
    expect(npc.textContent).toBe("");

    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "active",
    });
    refreshQuestHud();
    expect(document.getElementById("quest-hud-summary")!.textContent).toMatch(
      /^Story 3\/18:/,
    );
    expect(npc.textContent).toContain("Hearthkeep Odd:");

    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "active",
    });
    refreshQuestHud();
    expect(document.getElementById("quest-hud-summary")!.textContent).toMatch(
      /^Story 4\/18:/,
    );
    expect(npc.textContent).toContain("Weaver Sable:");

    restoreQuestProgress({
      "first-befriend": "complete",
      "first-spar": "complete",
      "reach-village": "complete",
      "shrine-craft": "complete",
      "evolve-bramblewarden": "active",
    });
    refreshQuestHud();
    expect(document.getElementById("quest-hud-summary")!.textContent).toMatch(
      /^Story 5\/18:/,
    );
    expect(npc.textContent).toContain("Warden Bryn:");
  });
});
