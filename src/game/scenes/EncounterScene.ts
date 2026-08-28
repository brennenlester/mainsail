import Phaser from "phaser";
import { playEncounterSfx } from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import { addToParty, hasCreature } from "../creatures/party";
import { ensureCreatureTextures } from "../creatures/sprites";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import {
  ENCOUNTER_CREATURE_DISPLAY,
  ensureTrimmedTexture,
  fitContainDisplay,
} from "../render/displaySizes";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { UNARMED_WANDERER } from "../battle/wandererWeapons";
import {
  ASSURED_BEFRIEND_LABEL,
  BEFRIEND_MISS_TEXT,
  canAttemptBefriend,
  formatGodClaimJoinLine,
  isStory1BefriendGuaranteed,
  resolveTideSovereignOutcome,
  rollBefriendAttempt,
  TIDE_SOVEREIGN_ID,
} from "../encounters/godSail";
import {
  canAffordBefriend,
  canAffordFlee,
  encounterBefriendButtonLabel,
  encounterFleeButtonLabel,
  encounterSparButtonLabel,
  encounterUnaffordableReasons,
  payBefriendCost,
  payFleeCost,
} from "../encounters/encounterEconomy";
import {
  CAIRN_SOVEREIGN_ID,
  resolveCairnSovereignOutcome,
} from "../encounters/godLand";
import {
  onWildEncounterResolved,
  profileForEncounter,
  resolveProfileBefriendChance,
  shouldConcealReveal,
  shouldOfferHarborBefriend,
  shouldShowSparVerb,
} from "../encounters/habitatRuntime";
import type { ZoneId } from "../world/zoneTypes";
import { isVisitorMode } from "../world/worldSession";
import { markCreatureDiscovered } from "../world/worldState";
import { getWildEffectiveLevel } from "../progression/wildLevel";
import { unlockCodexHud } from "../ui/hudChrome";

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 500;
const PANEL_PADDING = 28;

const TEXT_STYLE = {
  fontFamily: "Source Sans 3, system-ui, sans-serif",
} as const;

export class EncounterScene extends Phaser.Scene {
  private creatureId!: string;
  private zoneId?: ZoneId;
  private actionTaken = false;
  private befriendAttempted = false;
  private revealed = false;
  private missText?: Phaser.GameObjects.Text;
  private befriendBtn?: Phaser.GameObjects.Text;
  private unaffordableText?: Phaser.GameObjects.Text;
  private costReasonY = 0;
  private titleText?: Phaser.GameObjects.Text;
  private typeText?: Phaser.GameObjects.Text;
  private portrait?: Phaser.GameObjects.Image;
  private silhouette?: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: "EncounterScene" });
  }

  init(data: { creatureId: string; zoneId?: ZoneId }): void {
    this.creatureId = data.creatureId;
    this.zoneId = data.zoneId;
    this.actionTaken = false;
    this.befriendAttempted = false;
    this.revealed = false;
  }

  create(): void {
    bindOverlayPixelRatio(this);
    ensureCreatureTextures(this);
    playEncounterSfx(this);
    const def = getCreatureDefinition(this.creatureId);
    const profile = profileForEncounter(this.zoneId, this.creatureId);
    const concealed = shouldConcealReveal(profile, this.creatureId);
    this.revealed = !concealed;

    if (!def.excludeFromCodex && this.revealed) {
      markCreatureDiscovered(this.creatureId);
    }

    this.cameras.main.fadeIn(160, 255, 255, 255);

    this.add
      .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0x1a3048, 0.55)
      .setOrigin(0)
      .setInteractive();

    const panelX = DESIGN_SIZE / 2;
    const panelY = DESIGN_SIZE / 2;
    const panelLeft = panelX - PANEL_WIDTH / 2;
    const innerLeft = panelLeft + PANEL_PADDING;
    const innerWidth = PANEL_WIDTH - PANEL_PADDING * 2;

    const panel = this.add.graphics();
    panel.fillStyle(0xfff8ec, 0.97);
    panel.fillRoundedRect(
      panelX - PANEL_WIDTH / 2,
      panelY - PANEL_HEIGHT / 2,
      PANEL_WIDTH,
      PANEL_HEIGHT,
      22,
    );
    panel.lineStyle(4, 0x6eb8a8, 1);
    panel.strokeRoundedRect(
      panelX - PANEL_WIDTH / 2,
      panelY - PANEL_HEIGHT / 2,
      PANEL_WIDTH,
      PANEL_HEIGHT,
      22,
    );
    panel.lineStyle(2, 0xd8efe8, 0.9);
    panel.strokeRoundedRect(
      panelX - PANEL_WIDTH / 2 + 6,
      panelY - PANEL_HEIGHT / 2 + 6,
      PANEL_WIDTH - 12,
      PANEL_HEIGHT - 12,
      18,
    );

    if (concealed) {
      this.silhouette = this.add
        .rectangle(panelX, panelY - 90, 120, 120, 0x2a4050, 0.85)
        .setOrigin(0.5);
    } else {
      this.showPortrait(panelX, panelY - 90);
    }

    this.titleText = this.addPanelText(
      panelX,
      panelY + 70,
      this.revealed
        ? `A wild ${def.name} appeared!`
        : "A wild creature appeared!",
      innerWidth,
      {
        color: "#2a4050",
        fontSize: "22px",
        fontStyle: "bold",
      },
    );

    if (!concealed) {
      this.typeText = this.addPanelText(
        panelX,
        panelY + 102,
        `Type: ${def.folkloreType}`,
        innerWidth,
        {
          color: "#5a7888",
          fontSize: "14px",
        },
      );
    }

    const buttonY = panelY + 162;
    const showSpar = shouldShowSparVerb(profile, this.creatureId);
    const showBefriend = shouldOfferHarborBefriend(profile, this.creatureId);
    const befriendLabel = isStory1BefriendGuaranteed(this.creatureId)
      ? ASSURED_BEFRIEND_LABEL
      : encounterBefriendButtonLabel(this.creatureId);

    type EncounterVerb = {
      label: string;
      action: () => void;
      toneIndex: number;
      enabled: boolean;
    };
    const verbs: EncounterVerb[] = [];
    if (showBefriend) {
      verbs.push({
        label: befriendLabel,
        action: () => this.tryBefriend(),
        toneIndex: 0,
        enabled: canAffordBefriend(),
      });
    }
    if (showSpar) {
      verbs.push({
        label: encounterSparButtonLabel(),
        action: () => this.startSpar(),
        toneIndex: 1,
        enabled: true,
      });
    }
    verbs.push({
      label: encounterFleeButtonLabel(),
      action: () => this.flee(),
      toneIndex: 2,
      enabled: canAffordFlee(),
    });

    const buttonSlotWidth = innerWidth / verbs.length;
    verbs.forEach((verb, index) => {
      const buttonX = innerLeft + buttonSlotWidth * (index + 0.5);
      const btn = this.addButton(
        buttonX,
        buttonY,
        verb.label,
        verb.action,
        verb.toneIndex,
        verb.enabled,
      );
      if (verb.toneIndex === 0) {
        this.befriendBtn = btn;
      }
    });

    this.costReasonY = buttonY + 42;
    this.renderUnaffordableReasons();
  }

  /** Miss / result copy sits below the cost-reason line so they never overlap. */
  private resultMessageY(): number {
    return this.costReasonY + 36;
  }

  private renderUnaffordableReasons(): void {
    this.unaffordableText?.destroy();
    this.unaffordableText = undefined;
    const unaffordable = encounterUnaffordableReasons();
    if (unaffordable.length === 0) {
      return;
    }
    this.unaffordableText = this.addPanelText(
      DESIGN_SIZE / 2,
      this.costReasonY,
      unaffordable.join(" · "),
      PANEL_WIDTH - PANEL_PADDING * 2,
      {
        color: "#8a5a40",
        fontSize: "13px",
      },
    );
  }

  /** Refresh unaffordable reason line after a miss (Dust costs are free under #306). */
  private refreshFleeAffordanceAfterSpend(): void {
    this.renderUnaffordableReasons();
  }

  private showPortrait(x: number, y: number): void {
    const def = getCreatureDefinition(this.creatureId);
    const pose = resolveCreaturePoseTexture(this, def.spriteKey, "encounter");
    const trimmed = ensureTrimmedTexture(this, ...pose);
    this.portrait = this.add.image(x, y, ...trimmed).setOrigin(0.5);
    fitContainDisplay(this.portrait, ENCOUNTER_CREATURE_DISPLAY);
  }

  private revealCreature(): void {
    if (this.revealed) {
      return;
    }
    this.revealed = true;
    const def = getCreatureDefinition(this.creatureId);
    if (!def.excludeFromCodex) {
      markCreatureDiscovered(this.creatureId);
    }
    this.silhouette?.destroy();
    this.silhouette = undefined;
    this.showPortrait(DESIGN_SIZE / 2, DESIGN_SIZE / 2 - 90);
    this.titleText?.setText(`A wild ${def.name} appeared!`);
    if (this.typeText) {
      this.typeText.setText(`Type: ${def.folkloreType}`);
    } else {
      this.typeText = this.addPanelText(
        DESIGN_SIZE / 2,
        DESIGN_SIZE / 2 + 102,
        `Type: ${def.folkloreType}`,
        PANEL_WIDTH - PANEL_PADDING * 2,
        {
          color: "#5a7888",
          fontSize: "14px",
        },
      );
    }
  }

  private addPanelText(
    x: number,
    y: number,
    content: string,
    width: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, content, {
        ...TEXT_STYLE,
        ...style,
        align: "center",
        wordWrap: { width, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0.5);
    text.setFixedSize(width, 0);
    return text;
  }

  private addButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    toneIndex: number,
    enabled: boolean,
  ): Phaser.GameObjects.Text {
    const tones = ["#7ed6a8", "#7ec8e8", "#f0c878"] as const;
    const btn = this.add
      .text(x, y, label, {
        color: "#1a3040",
        backgroundColor: tones[toneIndex % tones.length],
        ...TEXT_STYLE,
        fontSize: "14px",
        fontStyle: "bold",
        padding: { x: 10, y: 10 },
      })
      .setOrigin(0.5);

    if (!enabled) {
      btn.setAlpha(0.45);
      return btn;
    }

    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setAlpha(0.88));
    btn.on("pointerout", () => btn.setAlpha(1));
    btn.on("pointerdown", onClick);
    return btn;
  }

  private profileChanceOverride(): number | undefined {
    if (!this.zoneId) {
      return undefined;
    }
    return (
      resolveProfileBefriendChance(this.zoneId, this.creatureId) ?? undefined
    );
  }

  private tryBefriend(): void {
    if (
      this.actionTaken ||
      isVisitorMode() ||
      !canAttemptBefriend(this.befriendAttempted)
    ) {
      return;
    }
    if (!canAffordBefriend() || !payBefriendCost()) {
      return;
    }
    this.revealCreature();
    this.actionTaken = true;
    this.befriendAttempted = true;

    if (hasCreature(this.creatureId)) {
      this.showResult(
        `${getCreatureDefinition(this.creatureId).name} is already in your party.`,
      );
      return;
    }

    if (rollBefriendAttempt(this.creatureId, Math.random, this.profileChanceOverride())) {
      if (this.zoneId) {
        onWildEncounterResolved(this.zoneId, this.creatureId, "befriend");
      }
      if (this.creatureId === TIDE_SOVEREIGN_ID) {
        const result = resolveTideSovereignOutcome("befriend");
        if (result) {
          this.showResult(
            formatGodClaimJoinLine("Tide Sovereign", "Tide Cleaver", result, false),
          );
        }
      } else if (this.creatureId === CAIRN_SOVEREIGN_ID) {
        const result = resolveCairnSovereignOutcome("befriend");
        if (result) {
          this.showResult(
            formatGodClaimJoinLine("Stone Sovereign", "Cairn Maul", result, false),
          );
        }
      } else {
        const level = getWildEffectiveLevel(this.creatureId);
        addToParty(this.creatureId, level);
        this.showResult(`${getCreatureDefinition(this.creatureId).name} joined you!`);
      }
    } else {
      this.actionTaken = false;
      this.befriendBtn
        ?.off("pointerover")
        .off("pointerout")
        .disableInteractive()
        .setAlpha(0.5);
      this.refreshFleeAffordanceAfterSpend();
      this.showMiss(BEFRIEND_MISS_TEXT);
    }
  }

  private showMiss(message: string): void {
    this.missText?.destroy();
    this.missText = this.addPanelText(
      DESIGN_SIZE / 2,
      this.resultMessageY(),
      message,
      PANEL_WIDTH - PANEL_PADDING * 2,
      {
        color: "#2a4050",
        fontSize: "18px",
        fontStyle: "bold",
      },
    );
  }

  private showResult(message: string): void {
    this.missText?.destroy();
    this.missText = undefined;
    const text = this.addPanelText(
      DESIGN_SIZE / 2,
      this.resultMessageY(),
      message,
      PANEL_WIDTH - PANEL_PADDING * 2,
      {
        color: "#2a4050",
        fontSize: "18px",
        fontStyle: "bold",
      },
    );
    this.time.delayedCall(900, () => {
      text.destroy();
      this.endEncounter();
    });
  }

  private startSpar(): void {
    if (this.actionTaken || isVisitorMode()) {
      return;
    }
    this.revealCreature();
    this.actionTaken = true;
    if (this.zoneId) {
      onWildEncounterResolved(this.zoneId, this.creatureId, "spar");
    }

    this.cameras.main.fadeOut(120, 255, 255, 255);
    this.time.delayedCall(130, () => {
      this.scene.launch("BattleScene", {
        wildCreatureId: this.creatureId,
        wandererPartner: UNARMED_WANDERER,
        zoneId: this.zoneId,
      });
      this.scene.stop("EncounterScene");
    });
  }

  private flee(): void {
    if (this.actionTaken || isVisitorMode()) {
      return;
    }
    if (!canAffordFlee() || !payFleeCost()) {
      return;
    }
    this.actionTaken = true;
    if (this.creatureId === TIDE_SOVEREIGN_ID) {
      resolveTideSovereignOutcome("flee");
    } else if (this.creatureId === CAIRN_SOVEREIGN_ID) {
      resolveCairnSovereignOutcome("flee");
    } else if (this.zoneId) {
      onWildEncounterResolved(this.zoneId, this.creatureId, "flee");
    }
    this.endEncounter();
  }

  private endEncounter(): void {
    unlockCodexHud();
    this.cameras.main.fadeOut(140, 255, 255, 255);
    this.time.delayedCall(150, () => {
      this.scene.stop("EncounterScene");
      this.scene.resume("IsometricScene");
    });
  }
}
