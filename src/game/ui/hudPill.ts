import Phaser from "phaser";

/**
 * In-canvas prompt pills that match the DOM chrome (#361): rounded navy
 * plate, cream text, teal hairline. Phaser Text only draws square
 * backgrounds, so a Graphics plate follows the text (position, scale, depth,
 * visibility) every frame and is destroyed with it.
 */
export const HUD_PILL_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  color: "#f3ead3",
  fontFamily: "'Source Sans 3', system-ui, sans-serif",
  fontStyle: "bold",
  align: "center",
  padding: { x: 18, y: 9 },
};

const PILL_FILL = 0x1f2a44;
const PILL_STROKE = 0x6eb8a8;

export function attachHudPill(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  const scene = text.scene;
  const plate = scene.add.graphics();
  let drawnW = -1;
  let drawnH = -1;
  const sync = (): void => {
    if (!text.active) {
      return;
    }
    const w = text.width;
    const h = text.height;
    if (w !== drawnW || h !== drawnH) {
      drawnW = w;
      drawnH = h;
      plate.clear();
      plate.fillStyle(PILL_FILL, 0.9);
      // Single line = full pill; wrapped (phone) prompts get a rounded card.
      const r = Math.min(h / 2, 20);
      plate.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      plate.lineStyle(1.5, PILL_STROKE, 0.75);
      plate.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    }
    plate
      .setPosition(text.x + (0.5 - text.originX) * w * text.scaleX, text.y + (0.5 - text.originY) * h * text.scaleY)
      .setScale(text.scaleX, text.scaleY)
      .setScrollFactor(text.scrollFactorX, text.scrollFactorY)
      .setVisible(text.visible)
      .setAlpha(text.alpha)
      .setDepth(text.depth - 0.001);
  };
  sync();
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
  text.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
    plate.destroy();
  });
  return text;
}
