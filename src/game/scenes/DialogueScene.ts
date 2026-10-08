import Phaser from "phaser";
import { NPC_DISPLAY } from "../render/displaySizes";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { applyNpcSprite } from "../render/worldTextures";
import { getNpcById, type NpcDefinition } from "../world/npcs";
import {
  beginConversation,
  confirmOddRest,
  type ConversationPrompt,
} from "../world/npcState";
import { refreshPartyStatusLine } from "../ui/statusPanel";

const PANEL_WIDTH = 470;
const PANEL_HEIGHT = 220;
const PANEL_PADDING = 26;

const TEXT_STYLE = {
  fontFamily: "Source Sans 3, system-ui, sans-serif",
} as const;

/**
 * Villager conversation overlay. Pauses IsometricScene the same way the
 * encounter and shrine overlays do, and resumes it on close.
 */
export class DialogueScene extends Phaser.Scene {
  private npc!: NpcDefinition;
  private lines: string[] = [];
  private prompt: ConversationPrompt = { kind: "advance" };
  private lineIndex = 0;
  private bodyText!: Phaser.GameObjects.Text;
  private advanceButton!: Phaser.GameObjects.Text;
  private declineButton!: Phaser.GameObjects.Text;
  private closing = false;

  constructor() {
    super({ key: "DialogueScene" });
  }

  init(data: { npcId: string }): void {
    const npc = getNpcById(data.npcId);
    if (!npc) {
      throw new Error(`Unknown NPC: ${data.npcId}`);
    }
    this.npc = npc;
    const conversation = beginConversation(npc);
    this.lines = conversation.lines;
    this.prompt = conversation.prompt;
    this.lineIndex = 0;
    this.closing = false;
  }

  create(): void {
    bindOverlayPixelRatio(this);
    this.cameras.main.fadeIn(140, 255, 255, 255);

    this.add
      .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0x1a3048, 0.5)
      .setOrigin(0)
      .setInteractive();

    const panelX = DESIGN_SIZE / 2;
    const panelY = DESIGN_SIZE - PANEL_HEIGHT / 2 - 40;
    const panelLeft = panelX - PANEL_WIDTH / 2;
    const panelTop = panelY - PANEL_HEIGHT / 2;
    const innerWidth = PANEL_WIDTH - PANEL_PADDING * 2;

    const panel = this.add.graphics();
    panel.fillStyle(0xfff8ec, 0.97);
    panel.fillRoundedRect(panelLeft, panelTop, PANEL_WIDTH, PANEL_HEIGHT, 20);
    panel.lineStyle(4, 0xd8a05c, 1);
    panel.strokeRoundedRect(panelLeft, panelTop, PANEL_WIDTH, PANEL_HEIGHT, 20);

    const portrait = this.add
      .sprite(
        panelLeft + PANEL_PADDING + 28,
        panelTop - 6,
        this.npc.spriteKey,
      )
      .setOrigin(0.5, 1);
    applyNpcSprite(
      this,
      portrait,
      this.npc,
      {
        width: NPC_DISPLAY.width * 1.8,
        height: NPC_DISPLAY.height * 1.8,
      },
      "talk",
    );

    this.add
      .text(panelLeft + PANEL_PADDING, panelTop + PANEL_PADDING, this.npc.name, {
        ...TEXT_STYLE,
        color: "#8a4a20",
        fontSize: "20px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);

    this.bodyText = this.add
      .text(panelLeft + PANEL_PADDING, panelTop + PANEL_PADDING + 38, "", {
        ...TEXT_STYLE,
        color: "#2a4050",
        fontSize: "17px",
        wordWrap: { width: innerWidth, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);

    this.advanceButton = this.add
      .text(panelX + PANEL_WIDTH / 2 - PANEL_PADDING, panelTop + PANEL_HEIGHT - PANEL_PADDING, "", {
        ...TEXT_STYLE,
        color: "#1a3040",
        backgroundColor: "#f0c878",
        fontSize: "15px",
        fontStyle: "bold",
        padding: { x: 16, y: 9 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true });

    this.advanceButton.on("pointerover", () => this.advanceButton.setAlpha(0.88));
    this.advanceButton.on("pointerout", () => this.advanceButton.setAlpha(1));
    this.advanceButton.on("pointerdown", () => this.advance());

    this.declineButton = this.add
      .text(0, panelTop + PANEL_HEIGHT - PANEL_PADDING, "No", {
        ...TEXT_STYLE,
        color: "#1a3040",
        backgroundColor: "#7ec8e8",
        fontSize: "15px",
        fontStyle: "bold",
        padding: { x: 16, y: 9 },
      })
      .setOrigin(1, 1)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.declineButton.on("pointerover", () => this.declineButton.setAlpha(0.88));
    this.declineButton.on("pointerout", () => this.declineButton.setAlpha(1));
    this.declineButton.on("pointerdown", () => this.close());

    this.input.keyboard?.on("keydown-E", () => this.advance());
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.keyboard?.on("keydown-ENTER", () => this.advance());
    this.input.keyboard?.on("keydown-ESC", () => this.close());

    this.renderLine();
  }

  private renderLine(): void {
    this.bodyText.setText(this.lines[this.lineIndex] ?? "");
    const isLast = this.lineIndex >= this.lines.length - 1;
    const confirming = this.prompt.kind === "confirm-rest" && isLast;
    this.advanceButton.setText(confirming ? "Rest" : isLast ? "Goodbye" : "Next");
    this.advanceButton.setBackgroundColor(confirming ? "#7ed6a8" : "#f0c878");
    this.declineButton.setVisible(confirming);
    if (confirming) {
      this.declineButton.setPosition(
        this.advanceButton.x - this.advanceButton.displayWidth - 12,
        this.advanceButton.y,
      );
    }
  }

  private advance(): void {
    if (this.closing) {
      return;
    }
    if (this.lineIndex >= this.lines.length - 1) {
      if (this.prompt.kind === "confirm-rest") {
        this.applyRest();
        return;
      }
      this.close();
      return;
    }
    this.lineIndex += 1;
    this.renderLine();
  }

  private applyRest(): void {
    this.lines = confirmOddRest();
    this.prompt = { kind: "advance" };
    this.lineIndex = 0;
    this.renderLine();
    refreshPartyStatusLine();
  }

  private close(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.cameras.main.fadeOut(130, 255, 255, 255);
    this.time.delayedCall(140, () => {
      this.scene.stop("DialogueScene");
      this.scene.resume("IsometricScene");
    });
  }
}
