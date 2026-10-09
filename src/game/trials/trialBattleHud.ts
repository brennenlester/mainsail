import Phaser from "phaser";
import { MODIFIERS } from "./modifiers";
import type { TrialBattle } from "./trialBattle";

/**
 * In-battle Eclipse Trial strip (#420): round pips (the last one is the
 * boss), the round's modifier chips (Twin Shadows counts down to its echo)
 * and the score so far. Sits in the battle's top row, left of the Fast
 * toggle, and shrinks to fit a phone.
 */

const FONT = '"Source Sans 3", system-ui, sans-serif';
const GOLD = 0xffd27a;
const VIOLET = 0xb48cff;
const DIM = 0x4a3e66;

export class TrialBattleStrip {
  private readonly box: Phaser.GameObjects.Container;
  private readonly chips: { text: Phaser.GameObjects.Text; id: string }[] = [];
  private readonly trial: TrialBattle;
  /** Sudden death (#429): shown under the strip once the eclipse deepens. */
  private readonly deepens: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    trial: TrialBattle,
    area: { left: number; right: number; y: number },
    ui: number,
  ) {
    this.trial = trial;
    this.box = scene.add.container(area.left, area.y).setDepth(6);
    const total = trial.hud.roundsTotal;
    const current = trial.round.index;
    const g = scene.add.graphics();
    let x = 10;
    for (let i = 0; i < total; i++) {
      const boss = i === total - 1;
      const r = boss ? 8 : 6;
      const color = i < current ? GOLD : i === current ? VIOLET : DIM;
      g.fillStyle(color, i === current ? 1 : 0.95);
      if (boss) {
        g.fillPoints(
          [
            new Phaser.Math.Vector2(x + r, -r),
            new Phaser.Math.Vector2(x + 2 * r, 0),
            new Phaser.Math.Vector2(x + r, r),
            new Phaser.Math.Vector2(x, 0),
          ],
          true,
        );
      } else {
        g.fillCircle(x + r, 0, r);
      }
      if (i === current) {
        g.lineStyle(2, 0xffffff, 0.9);
        if (boss) {
          g.strokeRect(x - 1, -r - 1, 2 * r + 2, 2 * r + 2);
        } else {
          g.strokeCircle(x + r, 0, r + 2);
        }
      }
      x += 2 * r + 6;
    }
    // Backing plate first so pips and chips read on any arena sky.
    const plate = scene.add.graphics();
    this.box.add([plate, g]);
    x += 4;
    for (const id of trial.modifiers) {
      const def = MODIFIERS[id];
      const text = scene.add
        .text(x, 0, this.chipLabel(id, def.chip), {
          color: "#141018",
          backgroundColor: def.color,
          fontFamily: FONT,
          fontSize: "12px",
          fontStyle: "bold",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0, 0.5);
      this.box.add(text);
      this.chips.push({ text, id });
      x += text.width + 5;
    }
    const score = scene.add
      .text(x + 4, 0, `★ ${trial.hud.scoreSoFar.toLocaleString("en-US")}`, {
        color: "#ffe8b0",
        fontFamily: FONT,
        fontSize: "13px",
        fontStyle: "bold",
        stroke: "#140c14",
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);
    this.box.add(score);
    let width = score.x + score.width + 8;
    plate.fillStyle(0x140c1e, 0.78);
    plate.fillRoundedRect(0, -14, width, 28, 10);
    plate.lineStyle(1, VIOLET, 0.8);
    plate.strokeRoundedRect(0, -14, width, 28, 10);
    const room = Math.max(40, area.right - area.left);
    let scale = ui;
    if (width * scale > room) {
      scale = room / width;
    }
    if (scale < ui * 0.62) {
      // Too tight (narrow phone): the score moves to the round banner only.
      score.destroy();
      width = x + 4;
      plate.clear();
      plate.fillStyle(0x140c1e, 0.78);
      plate.fillRoundedRect(0, -14, width, 28, 10);
      scale = Math.min(ui, room / width);
    }
    this.deepens = scene.add
      .text(10, 26, "", {
        color: "#fff2f6",
        backgroundColor: "#8a2f6e",
        fontFamily: FONT,
        fontSize: "12px",
        fontStyle: "bold",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.box.add(this.deepens);
    this.box.setScale(scale);
    this.refresh();
  }

  /** Twin Shadows counts down to its echo turn; other chips are fixed. */
  private chipLabel(id: string, fallback: string): string {
    const echoIn = this.trial.echoIn;
    if (id !== "twin-shadows" || echoIn === null) {
      return fallback;
    }
    return echoIn <= 1 ? "TWIN ×2 NOW" : `TWIN ×2 in ${echoIn}`;
  }

  refresh(): void {
    for (const chip of this.chips) {
      chip.text.setText(this.chipLabel(chip.id, chip.text.text));
    }
    const bonus = this.trial.suddenDeathBonus;
    this.deepens.setVisible(bonus > 0);
    if (bonus > 0) {
      this.deepens.setText(`ECLIPSE DEEPENS +${Math.round(bonus * 100)}%`);
    }
  }

  destroy(): void {
    this.box.destroy(true);
  }
}
