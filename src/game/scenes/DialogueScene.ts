import Phaser from "phaser";
import { NPC_DISPLAY } from "../render/displaySizes";
import { RENDER_DPR } from "../render/pixelRatio";
import { applyNpcSprite } from "../render/worldTextures";
import { getNpcById, type NpcDefinition } from "../world/npcs";
import {
  beginConversation,
  confirmOddRest,
  type ConversationPrompt,
} from "../world/npcState";
import type { StorySparId } from "../story/questTypes";
import { refreshPartyStatusLine } from "../ui/statusPanel";
import { setTouchControlsEnabled } from "../ui/touchControls";
import {
  beginStorySpar,
  forfeitStorySpar,
  launchStorySpar,
} from "../battle/storySpar";
import type { StoryCue } from "../story/finaleScene";
import { clearStoryEgg, playStoryCue, storyStage } from "../story/storyCueFx";
import { HATCH_SCENE_KEY, launchHatchScene } from "../finale/HatchScene";

const PANEL_MAX_WIDTH = 560;
const PANEL_PADDING = 22;
const PANEL_EDGE = 12;
const BUTTON_ROW = 52;

const TEXT_STYLE = {
  fontFamily: "'Source Sans 3', system-ui, sans-serif",
} as const;

/**
 * Villager conversation overlay. Pauses IsometricScene the same way the
 * encounter and shrine overlays do, and resumes it on close.
 *
 * Unlike the 640 design-space overlays, this scene lays out in stage CSS px
 * (camera zoom = DPR) so the type stays 20px+ on a phone instead of shrinking
 * with the design square (#391).
 */
export class DialogueScene extends Phaser.Scene {
  private npc!: NpcDefinition;
  private lines: string[] = [];
  /** Scripted-scene cue per line (#385); usually empty. */
  private cues: (StoryCue | undefined)[] = [];
  /** Narrator lines: no speaker label, italic (#401). */
  private narration: boolean[] = [];
  /** The finale hatch cutscene has the stage (#401); this panel waits. */
  private staging = false;
  private hatchPlayed = false;
  /** The shown line is narration: no portrait, no name row. */
  private narrated = false;
  /** Top of the panel in stage CSS px (story cues stage above it). */
  private panelTop = 0;
  /** Emitted on game.events when this dialogue closes (finale hook, #393). */
  private endEvent: string | undefined;
  private prompt: ConversationPrompt = { kind: "advance" };
  private lineIndex = 0;
  private veil!: Phaser.GameObjects.Rectangle;
  private panel!: Phaser.GameObjects.Graphics;
  private portrait!: Phaser.GameObjects.Sprite;
  private nameText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private advanceButton!: Phaser.GameObjects.Text;
  private declineButton!: Phaser.GameObjects.Text;
  private closing = false;
  private onStageResize = (): void => this.layout();

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
    this.cues = conversation.cues ?? [];
    this.narration = conversation.narration ?? [];
    this.staging = false;
    this.hatchPlayed = false;
    this.endEvent = conversation.endEvent;
    this.prompt = conversation.prompt;
    this.lineIndex = 0;
    this.closing = false;
  }

  create(): void {
    this.cameras.main.fadeIn(140, 255, 255, 255);

    this.veil = this.add
      .rectangle(0, 0, 10, 10, 0x1a3048, 0.5)
      .setOrigin(0)
      .setInteractive();
    this.panel = this.add.graphics();
    this.portrait = this.add
      .sprite(0, 0, this.npc.spriteKey)
      .setOrigin(0.5, 1);
    applyNpcSprite(
      this,
      this.portrait,
      this.npc,
      {
        width: NPC_DISPLAY.width * 1.8,
        height: NPC_DISPLAY.height * 1.8,
      },
      "talk",
    );

    this.nameText = this.add
      .text(0, 0, this.npc.name, {
        ...TEXT_STYLE,
        color: "#8a4a20",
        fontSize: "22px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);

    this.bodyText = this.add
      .text(0, 0, "", {
        ...TEXT_STYLE,
        color: "#1c3140",
        fontSize: "20px",
        fontStyle: "600",
        lineSpacing: 6,
      })
      .setOrigin(0, 0);

    this.advanceButton = this.add
      .text(0, 0, "", {
        ...TEXT_STYLE,
        color: "#1a3040",
        backgroundColor: "#f0c878",
        fontSize: "18px",
        fontStyle: "bold",
        padding: { x: 20, y: 11 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true });

    this.advanceButton.on("pointerover", () => this.advanceButton.setAlpha(0.88));
    this.advanceButton.on("pointerout", () => this.advanceButton.setAlpha(1));
    this.advanceButton.on("pointerdown", () => this.advance());

    this.declineButton = this.add
      .text(0, 0, "No", {
        ...TEXT_STYLE,
        color: "#1a3040",
        backgroundColor: "#7ec8e8",
        fontSize: "18px",
        fontStyle: "bold",
        padding: { x: 20, y: 11 },
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

    // Story cue art draws at depth 1, behind the panel (#401).
    for (const obj of this.chrome()) {
      obj.setDepth(10);
    }

    this.scale.on("resize", this.onStageResize);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.onStageResize);
    });

    this.renderLine();
  }

  private chrome(): (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible)[] {
    return [this.panel, this.portrait, this.nameText, this.bodyText, this.advanceButton, this.declineButton];
  }

  /** Stage size in CSS px; the camera maps 1 world unit to 1 CSS px. */
  private stageCss(): { w: number; h: number } {
    return {
      w: this.scale.width / RENDER_DPR,
      h: this.scale.height / RENDER_DPR,
    };
  }

  /** Tallest line decides the panel height so it never jumps between lines. */
  private bodyHeightFor(width: number): number {
    let tallest = 0;
    const probe = this.add
      .text(0, 0, "", {
        ...TEXT_STYLE,
        fontSize: "20px",
        fontStyle: "600",
        lineSpacing: 6,
        wordWrap: { width, useAdvancedWrap: true },
      })
      .setVisible(false);
    for (const line of this.lines) {
      probe.setText(line);
      tallest = Math.max(tallest, probe.height);
    }
    probe.destroy();
    return tallest;
  }

  private layout(): void {
    if (!this.sys.isActive() && !this.sys.isVisible()) {
      return;
    }
    const { w, h } = this.stageCss();
    const cam = this.cameras.main;
    cam.setZoom(RENDER_DPR);
    cam.centerOn(w / 2, h / 2);
    this.veil.setSize(w, h);

    const panelW = Math.min(PANEL_MAX_WIDTH, w - PANEL_EDGE * 2);
    const innerW = panelW - PANEL_PADDING * 2;
    const bodyH = this.bodyHeightFor(innerW);
    const panelH = PANEL_PADDING + 30 + 8 + bodyH + 12 + BUTTON_ROW;
    const panelLeft = (w - panelW) / 2;
    const panelTop = Math.max(panelH * 0.35, h - panelH - PANEL_EDGE - 10);
    this.panelTop = panelTop;

    this.panel.clear();
    this.panel.fillStyle(0xfff8ec, 0.98);
    this.panel.fillRoundedRect(panelLeft, panelTop, panelW, panelH, 20);
    this.panel.lineStyle(4, 0xd8a05c, 1);
    this.panel.strokeRoundedRect(panelLeft, panelTop, panelW, panelH, 20);

    this.portrait.setPosition(panelLeft + panelW - PANEL_PADDING - 28, panelTop + 6);
    this.nameText.setPosition(panelLeft + PANEL_PADDING, panelTop + PANEL_PADDING);
    this.bodyText.setWordWrapWidth(innerW, true);
    // Narration collapses the name row (#401).
    this.bodyText.setPosition(panelLeft + PANEL_PADDING, panelTop + PANEL_PADDING + (this.narrated ? 4 : 38));
    this.advanceButton.setPosition(
      panelLeft + panelW - PANEL_PADDING,
      panelTop + panelH - PANEL_PADDING + 6,
    );
    this.declineButton.setPosition(
      this.advanceButton.x - this.advanceButton.displayWidth - 12,
      this.advanceButton.y,
    );
  }

  private renderLine(): void {
    const cue = this.cues[this.lineIndex];
    if (cue === "hatch" && !this.hatchPlayed) {
      this.playHatch();
      return;
    }
    const narrated = this.narration[this.lineIndex] === true;
    this.narrated = narrated;
    this.bodyText.setText(this.lines[this.lineIndex] ?? "");
    // Narrator lines read as the story, not as the NPC talking (#401).
    this.nameText.setVisible(!narrated);
    this.portrait.setVisible(!narrated);
    this.bodyText.setFontStyle(narrated ? "italic 600" : "600");
    this.bodyText.setColor(narrated ? "#4a5866" : "#1c3140");
    const isLast = this.lineIndex >= this.lines.length - 1;
    const confirming = this.prompt.kind === "confirm-rest" && isLast;
    const challenging = this.prompt.kind === "challenge" && isLast;
    const label =
      this.prompt.kind === "challenge" && isLast
        ? this.prompt.label
        : confirming
          ? "Rest"
          : isLast
            ? "Goodbye"
            : "Next";
    this.advanceButton.setText(label);
    this.advanceButton.setBackgroundColor(
      confirming ? "#7ed6a8" : challenging ? "#f09a78" : "#f0c878",
    );
    this.declineButton.setText(challenging ? "Not yet" : "No");
    this.declineButton.setVisible(confirming || challenging);
    this.layout();
    if (cue) {
      const { w, h } = this.stageCss();
      playStoryCue(this, cue, storyStage(this, w, h, this.panelTop));
    }
  }

  /**
   * Finale (#401): hand the stage to the hatch cutscene, then come back to
   * this line (its narration) with Cinderling on the altar.
   */
  private playHatch(): void {
    this.hatchPlayed = true;
    this.staging = true;
    clearStoryEgg(this);
    for (const obj of this.chrome()) {
      obj.setVisible(false);
    }
    // Idempotent: runs on Continue, and again on the hatch scene's shutdown
    // (or a failed launch), so the panel can never stay hidden and locked.
    const restore = (): void => {
      if (!this.staging || !this.sys.isActive()) {
        return;
      }
      this.staging = false;
      for (const obj of this.chrome()) {
        obj.setVisible(true);
      }
      this.input.keyboard?.resetKeys();
      this.renderLine();
    };
    const { w, h } = this.stageCss();
    try {
      launchHatchScene(this, { stage: storyStage(this, w, h, h), onDone: restore });
      this.scene.get(HATCH_SCENE_KEY).events.once("shutdown", restore);
    } catch (error) {
      console.error("Hatch cutscene failed to launch; continuing the dialogue.", error);
      restore();
    }
  }

  private advance(): void {
    if (this.closing || this.staging) {
      return;
    }
    if (this.lineIndex >= this.lines.length - 1) {
      if (this.prompt.kind === "confirm-rest") {
        this.applyRest();
        return;
      }
      if (this.prompt.kind === "challenge") {
        this.startStorySpar(this.prompt.sparId);
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

  /**
   * Rival / boss challenge (#369, #385): one story battle via the adapter.
   * BattleScene resumes IsometricScene when it closes; we reopen this
   * dialogue for the outcome banter.
   */
  private startStorySpar(sparId: StorySparId): void {
    if (this.closing) {
      return;
    }
    if (!beginStorySpar(sparId)) {
      this.close();
      return;
    }
    this.closing = true;
    const npcId = this.npc.id;
    const iso = this.scene.get("IsometricScene");
    this.cameras.main.fadeOut(130, 255, 255, 255);
    this.time.delayedCall(140, () => {
      const launched = launchStorySpar(this, (result) => {
        if (result === null) {
          // BattleScene never came up: the adapter forfeited; back to the world.
          iso.scene.stop("BattleScene");
          iso.scene.resume();
          return;
        }
        iso.events.once("resume", () => {
          // Let the world finish its resume fade + layout before pausing it
          // again (or the frame freezes mid-fade, grey), but take input away
          // for that gap so nobody walks or interacts between rounds.
          const keyboard = iso.input.keyboard;
          keyboard?.resetKeys();
          if (keyboard) {
            keyboard.enabled = false;
          }
          iso.input.enabled = false;
          setTouchControlsEnabled(false);
          iso.time.delayedCall(260, () => {
            if (keyboard) {
              keyboard.enabled = true;
            }
            iso.input.enabled = true;
            iso.scene.pause();
            iso.scene.launch("DialogueScene", { npcId });
          });
        });
      });
      this.scene.stop("DialogueScene");
      if (!launched) {
        forfeitStorySpar();
        this.scene.resume("IsometricScene");
      }
    });
  }

  private close(): void {
    if (this.closing || this.staging) {
      return;
    }
    this.closing = true;
    const endEvent = this.endEvent;
    this.cameras.main.fadeOut(130, 255, 255, 255);
    this.time.delayedCall(140, () => {
      this.scene.stop("DialogueScene");
      this.scene.resume("IsometricScene");
      if (endEvent) {
        this.game.events.emit(endEvent);
      }
    });
  }
}
