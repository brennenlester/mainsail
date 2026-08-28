import { describe, expect, it } from "vitest";
import { syncQuestHudPosition } from "./questHud";

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
