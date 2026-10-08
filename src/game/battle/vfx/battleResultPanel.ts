import Phaser from "phaser";
import { playUiClickSfx } from "../../audio/gameAudio";
import { CARD, CARD_FONT, CardButton } from "../../ui/encounterCard";
import { isDomKeyboardTarget } from "../../ui/canvasFocus";
import type { BattleFxMode } from "./battleTiming";
import { drawCardPanel, showKeyHints } from "./battleWidgets";
import { xpBarSegments, type VictorySummary } from "./victorySummary";

/**
 * End-of-spar cards (#365), in the encounter-card style (#404): navy card,
 * cream rim, rounded Continue button. Victory: XP bars fill (rolling over on
 * level-up), loot, stat gains, evolution hint. Defeat stays soft: no red,
 * no shake, a gentle nudge to rest. Both wait for Continue (tap / Enter / Space).
 */

const FONT = CARD_FONT;
const DEPTH = 30;
const PANEL_W = 460;
const BAR_W = 124;

export type ResultPanelOptions =
  | { tone: "victory"; summary: VictorySummary; extraLine?: string }
  | { tone: "special"; title: string; line: string }
  | { tone: "defeat"; line: string };

/** Where the battle layout wants the card: centre, chrome scale, room. */
export type ResultPanelFrame = { x: number; y: number; ui: number; maxW: number; maxH: number };

const CLASSIC_FRAME: ResultPanelFrame = { x: 320, y: 320, ui: 1, maxW: 600, maxH: 608 };

export function showBattleResultPanel(
  scene: Phaser.Scene,
  opts: ResultPanelOptions,
  mode: BattleFxMode,
  xpFillMs: number,
  onContinue: () => void,
  frame: ResultPanelFrame = CLASSIC_FRAME,
): void {
  const victory = opts.tone !== "defeat";
  const rows = opts.tone === "victory" ? opts.summary.rows : [];
  const loot = opts.tone === "victory" ? opts.summary.loot : [];
  const hint = opts.tone === "victory" ? opts.summary.evolutionHint : undefined;
  const bodyLine = opts.tone === "victory" ? opts.extraLine : opts.line;

  const rowH = 44;
  const height =
    104 +
    rows.length * rowH +
    (loot.length > 0 ? 28 + loot.length * 22 : 0) +
    (hint ? 50 : 0) +
    (bodyLine ? 56 : 0) +
    76;
  const scale = Math.min(frame.ui, frame.maxW / (PANEL_W + 20), frame.maxH / (height + 20));
  const top = -height / 2;
  const left = -PANEL_W / 2 + 26;
  const right = PANEL_W / 2 - 26;

  const veil = scene.add
    .rectangle(frame.x, frame.y, 8000, 8000, CARD.veil, 0)
    .setDepth(DEPTH)
    .setInteractive();
  scene.tweens.add({ targets: veil, fillAlpha: victory ? 0.55 : 0.45, duration: 220 });

  const box = scene.add.container(frame.x, frame.y).setDepth(DEPTH).setScale(scale);
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    box.add(o);
    return o;
  };

  const panel = add(scene.add.graphics());
  drawCardPanel(panel, -PANEL_W / 2, top, PANEL_W, height, 26);
  if (victory) {
    // Gold inner glow line marks a win.
    panel.lineStyle(2, 0xffd860, 0.7);
    panel.strokeRoundedRect(-PANEL_W / 2 + 6, top + 6, PANEL_W - 12, height - 12, 21);
  }
  const titleText =
    opts.tone === "victory" ? opts.summary.title : opts.tone === "special" ? opts.title : "Spar over";
  const title = add(
    scene.add
      .text(0, top + 44, titleText, {
        fontFamily: FONT,
        fontStyle: "bold",
        fontSize: victory ? "36px" : "30px",
        color: victory ? "#ffe45a" : CARD.creamCss,
        stroke: victory ? "#5a1800" : CARD.inkCss,
        strokeThickness: victory ? 6 : 0,
      })
      .setOrigin(0.5),
  );
  if (!mode.reducedMotion && !mode.fast) {
    box.setScale(scale * 0.85).setAlpha(0);
    title.setScale(victory ? 1.5 : 1).setAlpha(0);
    scene.tweens.add({ targets: box, scale, alpha: 1, duration: 220, ease: "Back.easeOut" });
    scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, delay: 80, ease: "Back.easeOut" });
  }

  let y = top + 92;
  rows.forEach((row, i) => {
    const leveled = row.toLevel > row.fromLevel;
    add(
      scene.add
        .text(left, y, row.name, { fontFamily: FONT, fontStyle: "bold", fontSize: "17px", color: CARD.creamCss })
        .setOrigin(0, 0.5),
    );
    const lvText = add(
      scene.add
        .text(left + 150, y, `Lv ${row.fromLevel}`, { fontFamily: FONT, fontStyle: "bold", fontSize: "15px", color: CARD.mutedCss })
        .setOrigin(0, 0.5),
    );
    add(
      scene.add
        .text(right, y, `+${row.xpGained} XP`, { fontFamily: FONT, fontStyle: "bold", fontSize: "15px", color: "#9ad8ff" })
        .setOrigin(1, 0.5),
    );
    const barX = left + 214;
    add(scene.add.rectangle(barX, y, BAR_W, 10, CARD.panelDeep, 1).setOrigin(0, 0.5).setStrokeStyle(1, CARD.line, 1));
    const bar = add(scene.add.rectangle(barX, y, BAR_W * row.fromFill, 10, 0x6cc4ff, 1).setOrigin(0, 0.5));
    const gains = row.gains
      ? add(
          scene.add
            .text(
              left,
              y + 19,
              [`Lv ${row.toLevel}!`, row.gains.hp > 0 ? `HP +${row.gains.hp}` : "", row.gains.attack > 0 ? `ATK +${row.gains.attack}` : ""]
                .filter(Boolean)
                .join("  "),
              { fontFamily: FONT, fontStyle: "bold", fontSize: "14px", color: "#8fe88a" },
            )
            .setOrigin(0, 0.5)
            .setAlpha(0),
        )
      : undefined;

    const segments = xpBarSegments(row);
    const finish = (): void => {
      bar.width = BAR_W * row.toFill;
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
          bar.width = BAR_W * proxy.w;
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
        .text(left, y, "LOOT", { fontFamily: FONT, fontStyle: "bold", fontSize: "14px", color: CARD.goldCss, letterSpacing: 2 } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0, 0.5),
    );
    if (!mode.fast && !mode.reducedMotion) {
      // Arrives with its first line, so the header never sits alone.
      header.setAlpha(0);
      scene.tweens.add({ targets: header, alpha: 1, delay: 400, duration: 220 });
    }
    y += 24;
    loot.forEach((line, i) => {
      const t = add(
        scene.add.text(left + 8, y, `◆ ${line}`, { fontFamily: FONT, fontSize: "16px", color: CARD.creamCss }).setOrigin(0, 0.5),
      );
      if (!mode.fast && !mode.reducedMotion) {
        t.setAlpha(0).setX(left + 24);
        scene.tweens.add({ targets: t, alpha: 1, x: left + 8, delay: 400 + i * 140, duration: 220 });
      }
      y += 22;
    });
    y += 6;
  }

  if (hint) {
    y += 8;
    const g = add(scene.add.graphics());
    g.fillStyle(0x3a2a5a, 0.95);
    g.fillRoundedRect(left - 6, y - 12, right - left + 12, 40, 12);
    g.lineStyle(1, 0xd9a8ff, 0.9);
    g.strokeRoundedRect(left - 6, y - 12, right - left + 12, 40, 12);
    add(
      scene.add
        .text(0, y + 8, `✦ ${hint}`, {
          fontFamily: FONT,
          fontStyle: "bold",
          fontSize: "14px",
          color: "#ecd8ff",
          align: "center",
          wordWrap: { width: right - left - 16, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );
    y += 42;
  }

  if (bodyLine) {
    add(
      scene.add
        .text(0, y + 16, bodyLine, {
          fontFamily: FONT,
          fontSize: "17px",
          color: victory ? CARD.creamCss : "#d8ecf4",
          align: "center",
          lineSpacing: 2,
          wordWrap: { width: right - left, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );
    y += 56;
  }

  let done = false;
  const keys = scene.input.keyboard;
  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat || isDomKeyboardTarget(event.target as Element | null)) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      button.activate();
    }
  };
  const close = (): void => {
    if (done) {
      return;
    }
    done = true;
    playUiClickSfx(scene);
    keys?.off("keydown", onKey);
    onContinue();
  };
  const button = new CardButton(scene, 0, top + height - 44, {
    width: 220,
    height: 52,
    label: "Continue",
    tone: victory ? "primary" : "secondary",
    key: showKeyHints() ? "Enter" : undefined,
    onActivate: close,
  });
  button.setFocused(true);
  box.add(button.container);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keys?.off("keydown", onKey));
  // Keys / veil taps arm after a beat so a held key or tap from the last move doesn't skip the card.
  scene.time.delayedCall(mode.fast ? 150 : 600, () => {
    keys?.on("keydown", onKey);
    veil.on("pointerdown", close);
  });
}

/** Design-space px for a ~44 CSS px target when the 640 board is drawn 360 px wide. */
export const MIN_TOUCH_TARGET = Math.ceil((44 * 640) / 360);

/** Pad a text button's hit area to at least MIN_TOUCH_TARGET on each axis (visual size unchanged). */
export function setTouchHitArea(text: Phaser.GameObjects.Text, minTarget = MIN_TOUCH_TARGET): void {
  const w = Math.max(text.width, minTarget);
  const h = Math.max(text.height, minTarget);
  text.setInteractive({
    hitArea: new Phaser.Geom.Rectangle((text.width - w) / 2, (text.height - h) / 2, w, h),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
}
