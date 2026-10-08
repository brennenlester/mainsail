import Phaser from "phaser";
import { playUiClickSfx } from "../../audio/gameAudio";
import type { BattleFxMode } from "./battleTiming";
import { xpBarSegments, type VictorySummary } from "./victorySummary";

/**
 * End-of-spar cards (#365). Victory: XP bars fill (rolling over on
 * level-up), loot, stat gains, evolution hint. Defeat stays soft: no red,
 * no shake, a gentle nudge to rest. Both wait for Continue (click / key).
 */

const FONT = '"Source Sans 3", system-ui, sans-serif';
const DEPTH = 30;
const BAR_W = 200;

export type ResultPanelOptions =
  | { tone: "victory"; summary: VictorySummary; extraLine?: string }
  | { tone: "special"; title: string; line: string }
  | { tone: "defeat"; line: string };

export function showBattleResultPanel(
  scene: Phaser.Scene,
  opts: ResultPanelOptions,
  mode: BattleFxMode,
  xpFillMs: number,
  onContinue: () => void,
): void {
  const cx = 320;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(DEPTH);
    objects.push(o);
    return o;
  };

  const victory = opts.tone !== "defeat";
  const rows = opts.tone === "victory" ? opts.summary.rows : [];
  const loot = opts.tone === "victory" ? opts.summary.loot : [];
  const hint = opts.tone === "victory" ? opts.summary.evolutionHint : undefined;
  const bodyLine =
    opts.tone === "victory" ? opts.extraLine : opts.line;

  const rowH = 40;
  const height =
    96 +
    rows.length * rowH +
    (loot.length > 0 ? 26 + loot.length * 20 : 0) +
    (hint ? 46 : 0) +
    (bodyLine ? 46 : 0) +
    44;
  const top = Math.max(16, cx - height / 2);

  const veil = add(scene.add.rectangle(cx, cx, 2000, 2000, victory ? 0x0b1420 : 0x1a2a3a, 0).setInteractive());
  scene.tweens.add({ targets: veil, fillAlpha: victory ? 0.45 : 0.35, duration: 220 });

  const panel = add(
    scene.add
      .rectangle(cx, top + height / 2, 440, height, victory ? 0x101c28 : 0x223444, 0.96)
      .setStrokeStyle(3, victory ? 0xffd860 : 0x9cc4d8, 0.95),
  );
  const title = add(
    scene.add
      .text(cx, top + 34, opts.tone === "victory" ? opts.summary.title : opts.tone === "special" ? opts.title : "Spar over", {
        fontFamily: FONT,
        fontStyle: "bold",
        fontSize: victory ? "34px" : "26px",
        color: victory ? "#ffe45a" : "#d8ecf4",
        stroke: victory ? "#5a1800" : "#1a2a3a",
        strokeThickness: victory ? 6 : 4,
      })
      .setOrigin(0.5),
  );
  if (!mode.reducedMotion && !mode.fast) {
    panel.setScale(0.85).setAlpha(0);
    title.setScale(victory ? 1.6 : 1).setAlpha(0);
    scene.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
    scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, delay: 80, ease: "Back.easeOut" });
  }

  let y = top + 76;
  rows.forEach((row, i) => {
    const leveled = row.toLevel > row.fromLevel;
    add(
      scene.add
        .text(cx - 196, y, row.name, { fontFamily: FONT, fontStyle: "bold", fontSize: "15px", color: "#fff7e0" })
        .setOrigin(0, 0.5),
    );
    const lvText = add(
      scene.add
        .text(cx - 60, y, `Lv ${row.fromLevel}`, { fontFamily: FONT, fontStyle: "bold", fontSize: "13px", color: "#c8d8e0" })
        .setOrigin(0, 0.5),
    );
    add(
      scene.add
        .text(cx + 196, y, `+${row.xpGained} XP`, { fontFamily: FONT, fontStyle: "bold", fontSize: "13px", color: "#9ad8ff" })
        .setOrigin(1, 0.5),
    );
    const barX = cx - 6;
    add(scene.add.rectangle(barX, y, BAR_W * 0.62, 8, 0x2a343c, 1).setOrigin(0, 0.5));
    const bar = add(scene.add.rectangle(barX, y, BAR_W * 0.62 * row.fromFill, 8, 0x6cc4ff, 1).setOrigin(0, 0.5));
    const fullW = BAR_W * 0.62;
    const gains = row.gains
      ? add(
          scene.add
            .text(cx - 196, y + 17, [`Lv ${row.toLevel}!`, row.gains.hp > 0 ? `HP +${row.gains.hp}` : "", row.gains.attack > 0 ? `ATK +${row.gains.attack}` : ""].filter(Boolean).join("  "), {
              fontFamily: FONT,
              fontStyle: "bold",
              fontSize: "12px",
              color: "#8fe88a",
            })
            .setOrigin(0, 0.5)
            .setAlpha(0),
        )
      : undefined;

    const segments = xpBarSegments(row);
    const finish = (): void => {
      bar.width = fullW * row.toFill;
      if (leveled) {
        lvText.setText(`Lv ${row.toLevel} ▲`).setColor("#8fe88a");
        bar.setFillStyle(0x8fe88a);
        gains?.setAlpha(1);
      }
    };
    if (xpFillMs <= 0) {
      finish();
    } else {
      const per = xpFillMs / segments.length;
      const proxy = { w: 0 };
      const chain = segments.map(([from, to], segIndex) => ({
        targets: proxy,
        w: { from, to },
        duration: per,
        delay: segIndex === 0 ? 260 + i * 120 : 60,
        ease: "Sine.easeOut",
        onUpdate: () => {
          bar.width = fullW * proxy.w;
        },
        onComplete: () => {
          if (segIndex < segments.length - 1) {
            lvText.setText(`Lv ${row.fromLevel + segIndex + 1} ▲`).setColor("#8fe88a");
            bar.setFillStyle(0x8fe88a);
            scene.tweens.add({ targets: lvText, scale: { from: 1.4, to: 1 }, duration: 220, ease: "Back.easeOut" });
          }
        },
      }));
      scene.tweens.chain({ tweens: chain, onComplete: finish });
      if (gains) {
        scene.tweens.add({ targets: gains, alpha: 1, delay: 260 + i * 120 + xpFillMs, duration: 200 });
      }
    }
    y += rowH;
  });

  if (loot.length > 0) {
    const header = add(
      scene.add
        .text(cx - 196, y, "Loot", { fontFamily: FONT, fontStyle: "bold", fontSize: "13px", color: "#ffd860" })
        .setOrigin(0, 0.5),
    );
    if (!mode.fast && !mode.reducedMotion) {
      // Arrives with its first line, so the header never sits alone.
      header.setAlpha(0);
      scene.tweens.add({ targets: header, alpha: 1, delay: 400, duration: 220 });
    }
    y += 22;
    loot.forEach((line, i) => {
      const t = add(
        scene.add
          .text(cx - 186, y, `◆ ${line}`, { fontFamily: FONT, fontSize: "14px", color: "#f4ecd8" })
          .setOrigin(0, 0.5),
      );
      if (!mode.fast && !mode.reducedMotion) {
        t.setAlpha(0).setX(cx - 170);
        scene.tweens.add({ targets: t, alpha: 1, x: cx - 186, delay: 400 + i * 140, duration: 220 });
      }
      y += 20;
    });
    y += 4;
  }

  if (hint) {
    y += 8;
    add(scene.add.rectangle(cx, y + 6, 400, 34, 0x3a2a5a, 0.95).setStrokeStyle(1, 0xd9a8ff, 0.9));
    add(
      scene.add
        .text(cx, y + 6, `✦ ${hint}`, {
          fontFamily: FONT,
          fontStyle: "bold",
          fontSize: "13px",
          color: "#ecd8ff",
          align: "center",
          wordWrap: { width: 384 },
        })
        .setOrigin(0.5),
    );
    y += 38;
  }

  if (bodyLine) {
    add(
      scene.add
        .text(cx, y + 10, bodyLine, {
          fontFamily: FONT,
          fontSize: "14px",
          color: victory ? "#f4ecd8" : "#d8ecf4",
          align: "center",
          wordWrap: { width: 400 },
        })
        .setOrigin(0.5),
    );
    y += 46;
  }

  const btn = add(
    scene.add
      .text(cx, top + height - 30, "Continue", {
        fontFamily: FONT,
        fontStyle: "bold",
        fontSize: "16px",
        color: "#1a3040",
        backgroundColor: victory ? "#ffe6a8" : "#dff4ec",
        padding: { x: 22, y: 8 },
      })
      .setOrigin(0.5),
  );

  let done = false;
  const close = (): void => {
    if (done) {
      return;
    }
    done = true;
    playUiClickSfx(scene);
    scene.input.keyboard?.off("keydown-SPACE", close);
    scene.input.keyboard?.off("keydown-ENTER", close);
    onContinue();
  };
  setTouchHitArea(btn);
  btn.on("pointerdown", close);
  // Keys / veil taps arm after a beat so a held key or tap from the last move doesn't skip the card.
  scene.time.delayedCall(mode.fast ? 150 : 600, () => {
    scene.input.keyboard?.once("keydown-SPACE", close);
    scene.input.keyboard?.once("keydown-ENTER", close);
    veil.on("pointerdown", close);
  });
}

/** Design-space px for a ~44 CSS px target when the 640 board is drawn 360 px wide. */
export const MIN_TOUCH_TARGET = Math.ceil((44 * 640) / 360);

/** Pad a text button's hit area to at least MIN_TOUCH_TARGET on each axis (visual size unchanged). */
export function setTouchHitArea(text: Phaser.GameObjects.Text): void {
  const w = Math.max(text.width, MIN_TOUCH_TARGET);
  const h = Math.max(text.height, MIN_TOUCH_TARGET);
  text.setInteractive({
    hitArea: new Phaser.Geom.Rectangle((text.width - w) / 2, (text.height - h) / 2, w, h),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
}
