import Phaser from "phaser";
import { playCraftSfx } from "../audio/gameAudio";
import { type CraftContext } from "../crafting/recipes";
import { getItemName } from "../inventory/materials";
import {
  getItemCount,
} from "../inventory/playerInventory";
import { applyShrineFusion, getEligibleCreaturesForItem } from "../shrine/fusion";
import { launchEvolutionScene } from "../evolution/launchEvolution";
import {
  applyEclipseFusion,
  applyGodFusion,
  findGodFusionParents,
  findHorizonFusionParents,
  HORIZON_SOVEREIGN_ID,
  SOVEREIGN_SEAL_ID,
} from "../shrine/godFusion";
import {
  isEclipseFusionCompleted,
  getHorizonFusionCount,
  MAX_HORIZON_FUSIONS,
  MAX_SOVEREIGN_COPIES,
} from "../world/worldState";
import { describeShrineEffect, getEffectsForItem } from "../shrine/shrineEffects";
import {
  applyConsumable,
  CONSUMABLE_ITEM_IDS,
  FUSION_ITEM_IDS,
  type ConsumableEffectType,
  getConsumable,
  getEligibleCreaturesForConsumable,
  isConsumableItem,
} from "../shrine/consumables";
import { recordQuestEvent } from "../story/questProgress";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { isVisitorMode } from "../world/worldSession";
import { countCreatures } from "../creatures/party";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { isFusionDisclosed } from "../shrine/shrineDisclosure";
import {
  hideShrineCraftingHud,
  showShrineCraftingHud,
} from "../ui/craftingHud";
import { popOverlay } from "../ui/overlayStack";
import { canLeaveShrineNow } from "../ui/shrineLeave";
import { openRecipes } from "../ui/recipePanel";
import { shrineTabContentHeight } from "../ui/shrineContentScroll";
import {
  SHRINE_PANEL_HEIGHT,
  SHRINE_PANEL_WIDTH,
} from "../ui/shrinePanel";

const MOON_PANEL = 0x354d78;
const MOON_STROKE = 0xffedb0;
const MOON_ACCENT = 0x8ed8cf;
const MOON_TEXT = "#fff8dc";
const MOON_MUTED = "#c9eee1";
const PANEL_WIDTH = SHRINE_PANEL_WIDTH;
const PANEL_HEIGHT = SHRINE_PANEL_HEIGHT;

function getUseEffectLabel(
  effectType: ConsumableEffectType,
  detailed = false,
): string {
  if (effectType === "heal") {
    return detailed ? "Heals injured creatures by 50% max HP" : "heals 50% HP";
  }
  if (effectType === "revive") {
    return detailed
      ? "Revives fainted creatures to 50% max HP"
      : "revives fainted";
  }
  return detailed ? "Spend 2 to grant +1 level" : "2 grant +1 level";
}

type Tab = "craft" | "fusion" | "use";

type ContentBounds = {
  top: number;
  bottom: number;
  height: number;
};

export class ShrineScene extends Phaser.Scene {
  private activeTab: Tab = "craft";
  private selectedItemId: string | null = null;
  private shrineMode: CraftContext = "altar";
  private statusText!: Phaser.GameObjects.Text;
  private arrivalNotice = "";
  private contentContainer!: Phaser.GameObjects.Container;
  private tabButtons: Phaser.GameObjects.Text[] = [];
  private panelCenter = { x: 0, y: 0 };
  private contentBounds: ContentBounds = { top: 0, bottom: 0, height: 0 };
  private contentScroll = 0;
  private contentHeight = 0;
  private contentMask?: Phaser.Display.Masks.GeometryMask;
  private dragScrollActive = false;
  private dragScrollStartY = 0;
  private dragScrollOrigin = 0;
  private dragDidScroll = false;
  private pressedContentButtons = new Set<Phaser.GameObjects.Text>();
  private closing = false;
  private static readonly DRAG_SCROLL_THRESHOLD = 8;

  constructor() {
    super({ key: "ShrineScene" });
  }

  init(data?: {
    mode?: CraftContext;
    tab?: Tab;
    itemId?: string;
    /** Altar arrival line (free heal / story bundle, #390). */
    notice?: string;
  }): void {
    this.closing = false;
    this.arrivalNotice = data?.notice ?? "";
    this.shrineMode = data?.mode === "portable" ? "portable" : "altar";
    const requestedTab = data?.tab;
    const fusionAllowed =
      this.shrineMode !== "portable" && isFusionDisclosed();
    this.activeTab =
      requestedTab === "use" || (requestedTab === "fusion" && fusionAllowed)
        ? requestedTab
        : "craft";
    this.selectedItemId =
      this.activeTab === "use" && data?.itemId && isConsumableItem(data.itemId)
        ? data.itemId
        : null;
  }

  create(): void {
    bindOverlayPixelRatio(this);

    this.add
      .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, 0x153051, 0.76)
      .setOrigin(0)
      .setInteractive();

    const cx = DESIGN_SIZE / 2;
    const cy = DESIGN_SIZE / 2;
    this.panelCenter = { x: cx, y: cy };

    const panel = this.add
      .rectangle(cx, cy, PANEL_WIDTH, PANEL_HEIGHT, MOON_PANEL, 0.97)
      .setStrokeStyle(3, MOON_STROKE);
    void panel;

    this.drawRuneBorder(cx, cy, PANEL_WIDTH + 20, PANEL_HEIGHT + 20);

    this.add
      .text(cx, cy - 176, "Moon Shrine", {
        color: MOON_TEXT,
        fontFamily: "system-ui, serif",
        fontSize: "26px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        cy - 148,
        // Altar arrival notice (#390) takes the subtitle; the status line sits under the craft HUD.
        this.arrivalNotice ||
          (this.shrineMode === "portable"
            ? "Craft relics or use tonics — fusion stays at the altar"
            : "Craft relics, use tonics, or fuse with companions"),
        {
          color: this.arrivalNotice ? MOON_TEXT : MOON_MUTED,
          fontFamily: "system-ui, sans-serif",
          fontSize: this.arrivalNotice ? "13px" : "14px",
          letterSpacing: this.arrivalNotice ? 0 : 1.5,
          align: "center",
          wordWrap: { width: this.arrivalNotice ? 480 : 420 },
        },
      )
      .setOrigin(0.5, this.arrivalNotice ? 0.4 : 0.5);

    if (isVisitorMode()) {
      this.add
        .text(cx, cy, "Visitors can view this shrine, but only\nthe host can craft or fuse.", {
          color: MOON_TEXT,
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          align: "center",
        })
        .setOrigin(0.5);
      this.addRecipesButton(cx, cy + 130);
      this.setupCloseControls(cx, cy);
      return;
    }

    this.buildTabs(cx, cy - 108);
    this.contentContainer = this.add.container(0, 0);
    this.contentBounds = {
      top: cy - 72,
      bottom: cy + 118,
      height: 190,
    };
    this.setupContentMask(cx);

    this.statusText = this.add
      .text(cx, cy + 142, "", {
        color: MOON_TEXT,
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        align: "center",
        wordWrap: { width: 400 },
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 166, "Press Esc or click × to leave", {
        color: MOON_MUTED,
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
      })
      .setOrigin(0.5);

    this.setupCloseControls(cx, cy);

    this.events.once("shutdown", () => {
      hideShrineCraftingHud(true);
    });

    this.renderTabContent();
  }

  private setupCloseControls(cx: number, cy: number): void {
    this.add
      .text(cx + PANEL_WIDTH / 2 - 28, cy - PANEL_HEIGHT / 2 + 28, "×", {
        color: "#1a1a2e",
        backgroundColor: "#ffedb0",
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        // Nested DOM overlays (Recipes, etc.) close first via overlayStack (#281).
        if (!canLeaveShrineNow()) {
          return;
        }
        this.closeShrine();
      });

    // Phaser scene leave (not overlayStack) so one Esc matches × (#281).
    this.input.keyboard?.on("keydown-ESC", () => {
      if (!canLeaveShrineNow()) {
        return;
      }
      this.closeShrine();
    });
  }

  private setupContentMask(cx: number): void {
    const maskGraphics = this.make.graphics({ x: 0, y: 0 });
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillRect(
      cx - PANEL_WIDTH / 2 + 12,
      this.contentBounds.top,
      PANEL_WIDTH - 24,
      this.contentBounds.height,
    );
    this.contentMask = maskGraphics.createGeometryMask();
    this.contentContainer.setMask(this.contentMask);

    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _objects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        this.scrollContentBy(deltaY * 0.35);
      },
    );

    // Touch / pointer drag — wheel alone cannot reach recipes below the mask.
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const { x, y } = this.pointerToDesign(pointer);
      if (!this.isDesignPointInContentBounds(x, y, cx)) {
        return;
      }
      this.dragScrollActive = true;
      this.dragDidScroll = false;
      this.dragScrollStartY = y;
      this.dragScrollOrigin = this.contentScroll;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragScrollActive || !pointer.isDown) {
        return;
      }
      const { y } = this.pointerToDesign(pointer);
      const delta = this.dragScrollStartY - y;
      const maxScroll = Math.max(0, this.contentHeight - this.contentBounds.height);
      if (maxScroll > 0 && Math.abs(delta) >= ShrineScene.DRAG_SCROLL_THRESHOLD) {
        this.dragDidScroll = true;
      }
      this.setContentScroll(this.dragScrollOrigin + delta);
    });
    this.input.on("pointerup", () => {
      this.dragScrollActive = false;
      // Game Object pointerupoutside is not reliable; clear stale presses after button handlers.
      this.time.delayedCall(0, () => {
        this.pressedContentButtons.clear();
      });
    });
    this.input.on("pointerupoutside", () => {
      this.dragScrollActive = false;
      this.pressedContentButtons.clear();
    });
  }

  /** Map canvas/backing-buffer pointer coords into the 640×640 overlay design space. */
  private pointerToDesign(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  private isDesignPointInContentBounds(
    x: number,
    y: number,
    cx: number,
  ): boolean {
    const left = cx - PANEL_WIDTH / 2 + 12;
    const right = cx + PANEL_WIDTH / 2 - 12;
    return (
      x >= left &&
      x <= right &&
      y >= this.contentBounds.top &&
      y <= this.contentBounds.bottom
    );
  }

  /**
   * Run content-button actions on pointerup only when:
   * - press started on this button inside the visible viewport
   * - release is still inside the viewport
   * - the gesture did not scroll
   */
  private onContentTap(
    btn: Phaser.GameObjects.Text,
    action: () => void,
  ): void {
    btn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const { x, y } = this.pointerToDesign(pointer);
      // Geometry masks clip drawing but not hits; ignore presses outside the viewport.
      if (!this.isDesignPointInContentBounds(x, y, this.panelCenter.x)) {
        return;
      }
      this.pressedContentButtons.add(btn);
    });
    btn.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const wasPressed = this.pressedContentButtons.has(btn);
      this.pressedContentButtons.delete(btn);
      const { x, y } = this.pointerToDesign(pointer);
      const inBounds = this.isDesignPointInContentBounds(x, y, this.panelCenter.x);
      if (wasPressed && inBounds && !this.dragDidScroll) {
        action();
      }
    });
  }

  private scrollContentBy(deltaY: number): void {
    this.setContentScroll(this.contentScroll + deltaY);
  }

  private setContentScroll(scrollY: number): void {
    const maxScroll = Math.max(0, this.contentHeight - this.contentBounds.height);
    if (maxScroll <= 0) {
      return;
    }
    this.contentScroll = Phaser.Math.Clamp(scrollY, 0, maxScroll);
    this.contentContainer.setY(-this.contentScroll);
  }

  private resetContentScroll(): void {
    this.contentScroll = 0;
    this.contentHeight = 0;
    this.contentContainer.setY(0);
  }

  private drawRuneBorder(cx: number, cy: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.lineStyle(1, MOON_ACCENT, 0.6);
    const corners = [
      { x: cx - w / 2 + 12, y: cy - h / 2 + 12 },
      { x: cx + w / 2 - 12, y: cy - h / 2 + 12 },
      { x: cx - w / 2 + 12, y: cy + h / 2 - 12 },
      { x: cx + w / 2 - 12, y: cy + h / 2 - 12 },
    ];
    for (const c of corners) {
      g.strokeCircle(c.x, c.y, 6);
    }
  }

  private altarTabs(): { id: Tab; label: string }[] {
    const tabs: { id: Tab; label: string }[] = [
      { id: "craft", label: "Craft" },
      { id: "use", label: "Use" },
    ];
    if (isFusionDisclosed()) {
      tabs.push({ id: "fusion", label: "Fusion" });
    }
    return tabs;
  }

  private buildTabs(cx: number, y: number): void {
    this.tabButtons = [];
    const tabs: { id: Tab; label: string }[] =
      this.shrineMode === "portable"
        ? [
            { id: "craft", label: "Craft" },
            { id: "use", label: "Use" },
          ]
        : this.altarTabs();

    let x = cx - (tabs.length === 2 ? 90 : 160);
    for (const tab of tabs) {
      const btn = this.add
        .text(x, y, tab.label, {
          color: this.activeTab === tab.id ? "#1a1a2e" : MOON_TEXT,
          backgroundColor:
            this.activeTab === tab.id ? "#ffedb0" : "#42658d",
          fontFamily: "Source Sans 3, sans-serif",
          fontSize: "15px",
          padding: { x: 18, y: 9 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on("pointerdown", () => this.switchTab(tab.id));
      this.tabButtons.push(btn);
      x += 90;
    }
    this.addRecipesButton(x, y);
  }

  private addRecipesButton(x: number, y: number): void {
    this.add
      .text(x, y, "Recipes", {
        color: MOON_TEXT,
        backgroundColor: "#42658d",
        fontFamily: "Source Sans 3, sans-serif",
        fontSize: "15px",
        padding: { x: 18, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => openRecipes());
  }

  private refreshTabs(): void {
    const tabs =
      this.shrineMode === "portable"
        ? [
            { id: "craft" as Tab, label: "Craft" },
            { id: "use" as Tab, label: "Use" },
          ]
        : this.altarTabs();
    this.tabButtons.forEach((btn, i) => {
      const tab = tabs[i];
      if (!tab) {
        btn.setVisible(false);
        return;
      }
      btn.setVisible(true);
      const active = this.activeTab === tab.id;
      btn.setColor(active ? "#1a1a2e" : MOON_TEXT);
      btn.setBackgroundColor(active ? "#ffedb0" : "#42658d");
      btn.setText(tab.label);
    });
  }

  private renderTabContent(): void {
    this.contentContainer.removeAll(true);
    this.resetContentScroll();
    if (this.activeTab === "craft") {
      this.renderCraftTab();
    } else {
      hideShrineCraftingHud(false);
      if (this.activeTab === "use") {
        this.renderUseTab();
      } else {
        this.renderFusionTab();
      }
    }
  }

  private renderCraftTab(): void {
    this.contentHeight = 24;
    showShrineCraftingHud({
      context: this.shrineMode,
      onCrafted: (name, count) => {
        playCraftSfx(this);
        if (this.shrineMode === "altar") {
          recordQuestEvent({ type: "craft_item" });
        }
        const suffix = count > 1 ? ` ×${count}` : "";
        this.setStatus(`Crafted ${name}${suffix}!`);
        notifyWorldChanged();
      },
    });
  }

  private renderFusionTab(): void {
    const cx = this.panelCenter.x;
    const contentTop = this.contentBounds.top;

    if (!this.selectedItemId) {
      const prompt = this.add
        .text(cx, contentTop + 8, "Choose an item to fuse:", {
          color: MOON_TEXT,
          fontFamily: "system-ui, sans-serif",
          fontSize: "15px",
        })
        .setOrigin(0.5);
      this.contentContainer.add(prompt);

      let y = contentTop + 40;
      for (const itemId of FUSION_ITEM_IDS) {
        const owned = getItemCount(itemId);
        const label =
          owned > 0
            ? `${getItemName(itemId)} (×${owned})`
            : `${getItemName(itemId)} — craft first`;
        const btn = this.add
          .text(cx, y, label, {
            color: owned > 0 ? "#1a1a2e" : MOON_MUTED,
            backgroundColor: owned > 0 ? "#c8b8e8" : "#3a2a50",
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            padding: { x: 14, y: 8 },
          })
          .setOrigin(0.5);

        if (owned > 0) {
          btn.setInteractive({ useHandCursor: true });
          this.onContentTap(btn, () => {
            this.selectedItemId = itemId;
            this.renderTabContent();
          });
        }
        this.contentContainer.add(btn);
        y += 44;
      }
      this.contentHeight = shrineTabContentHeight(y, contentTop);
      return;
    }

    const itemId = this.selectedItemId;
    if (itemId === SOVEREIGN_SEAL_ID) {
      this.renderGodFusion(contentTop, cx);
      return;
    }

    const effects = getEffectsForItem(itemId);
    const effectLines = effects.map((e) => describeShrineEffect(e)).join("\n");
    const listTop = this.addDetailChrome(
      contentTop,
      cx,
      `${getItemName(itemId)}\n${effectLines}`,
    );

    const eligible = getEligibleCreaturesForItem(itemId).filter(
      (entry) => entry.eligible,
    );
    const allCandidates = getEligibleCreaturesForItem(itemId);
    if (eligible.length === 0) {
      const alreadyApplied = allCandidates.some(
        (e) => e.reason === "Already applied",
      );
      const message = alreadyApplied
        ? "Fusion already applied to all eligible creatures."
        : "No creatures at the required level.";
      const none = this.add
        .text(cx, listTop + 8, message, {
          color: MOON_MUTED,
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
        })
        .setOrigin(0.5);
      this.contentContainer.add(none);
      return;
    }

    let y = listTop + 16;
    for (const entry of eligible) {
      const label = `${entry.name} Lv.${entry.level}`;

      const btn = this.add
        .text(cx, y, label, {
          color: "#1a1a2e",
          backgroundColor: "#e0d4f0",
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          padding: { x: 12, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.onContentTap(btn, () => {
        const result = applyShrineFusion(entry.instanceId, itemId);
        this.setStatus(result.message);
        if (result.ok) {
          notifyWorldChanged();
          this.selectedItemId = null;
        }
        this.renderTabContent();
        if (result.ok && result.growth) {
          // Growth unlock: data is applied; leave the menu for the cutscene (#393).
          launchEvolutionScene(this, { reveal: result.growth });
        }
      });
      this.contentContainer.add(btn);
      y += 38;
    }
    this.contentHeight = shrineTabContentHeight(y, contentTop);
  }

  private addFusionBackButton(contentTop: number, cx: number): void {
    const back = this.add
      .text(cx - 180, contentTop + 8, "← Back", {
        color: MOON_TEXT,
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    this.onContentTap(back, () => {
      this.selectedItemId = null;
      this.renderTabContent();
    });
    this.contentContainer.add(back);
  }

  /**
   * "← Back" on its own row with the title wrapped beneath it, so a long
   * header can never run under the button (#391). Returns the y below the title.
   */
  private addDetailChrome(contentTop: number, cx: number, title: string): number {
    this.addFusionBackButton(contentTop, cx);
    const header = this.add
      .text(cx, contentTop + 34, title, {
        color: MOON_MUTED,
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        align: "center",
        lineSpacing: 4,
        wordWrap: { width: 420 },
      })
      .setOrigin(0.5, 0);
    this.contentContainer.add(header);
    return contentTop + 34 + header.height + 12;
  }

  private addFusionChrome(contentTop: number, cx: number, title: string): void {
    this.addFusionBackButton(contentTop, cx);
    const header = this.add
      .text(cx, contentTop + 32, title, {
        color: MOON_MUTED,
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        align: "center",
        wordWrap: { width: 400 },
      })
      .setOrigin(0.5);
    this.contentContainer.add(header);
  }

  private renderGodFusion(contentTop: number, cx: number): void {
    this.addFusionChrome(
      contentTop,
      cx,
      "Sovereign Seal — fuse the two sovereigns",
    );

    if (isEclipseFusionCompleted()) {
      const done = this.add
        .text(cx, contentTop + 76, "Eclipse Sovereign has already been fused.", {
          color: MOON_MUTED,
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          align: "center",
          wordWrap: { width: 400 },
        })
        .setOrigin(0.5);
      this.contentContainer.add(done);
      return;
    }

    const { first, second } = findHorizonFusionParents();
    if (first && second) {
      const summary = this.add
        .text(
          cx,
          contentTop + 72,
          `Horizon Sovereign Lv.${first.level} + Horizon Sovereign Lv.${second.level}`,
          {
            color: MOON_TEXT,
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            align: "center",
          },
        )
        .setOrigin(0.5);
      this.contentContainer.add(summary);

      const btn = this.add
        .text(cx, contentTop + 116, "Fuse into Eclipse Sovereign", {
          color: "#1a1a2e",
          backgroundColor: "#e0d4f0",
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.onContentTap(btn, () => {
        const result = applyEclipseFusion(
          first.instanceId,
          second.instanceId,
          SOVEREIGN_SEAL_ID,
        );
        this.setStatus(result.message);
        if (result.ok) {
          notifyWorldChanged();
          this.selectedItemId = null;
        }
        this.renderTabContent();
      });
      this.contentContainer.add(btn);
      return;
    }

    if (
      getHorizonFusionCount() >= MAX_HORIZON_FUSIONS ||
      countCreatures(HORIZON_SOVEREIGN_ID) >= MAX_SOVEREIGN_COPIES
    ) {
      const needHorizons = this.add
        .text(
          cx,
          contentTop + 76,
          "Requires two Horizon Sovereigns in your party.",
          {
            color: MOON_MUTED,
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            align: "center",
            wordWrap: { width: 400 },
          },
        )
        .setOrigin(0.5);
      this.contentContainer.add(needHorizons);
      return;
    }

    const { tide, cairn } = findGodFusionParents();
    if (!tide || !cairn) {
      const none = this.add
        .text(
          cx,
          contentTop + 76,
          "Requires Tide Sovereign and Stone Sovereign in your party.",
          {
            color: MOON_MUTED,
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            align: "center",
            wordWrap: { width: 400 },
          },
        )
        .setOrigin(0.5);
      this.contentContainer.add(none);
      return;
    }

    const summary = this.add
      .text(
        cx,
        contentTop + 72,
        `Tide Sovereign Lv.${tide.level} + Stone Sovereign Lv.${cairn.level}`,
        {
          color: MOON_TEXT,
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          align: "center",
        },
      )
      .setOrigin(0.5);
    this.contentContainer.add(summary);

    const btn = this.add
      .text(cx, contentTop + 116, "Fuse into Horizon Sovereign", {
        color: "#1a1a2e",
        backgroundColor: "#e0d4f0",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.onContentTap(btn, () => {
      const result = applyGodFusion(
        tide.instanceId,
        cairn.instanceId,
        SOVEREIGN_SEAL_ID,
      );
      this.setStatus(result.message);
      if (result.ok) {
        notifyWorldChanged();
        this.selectedItemId = null;
      }
      this.renderTabContent();
    });
    this.contentContainer.add(btn);
  }

  /** Nothing to use yet: say what lives here and how to get it (#391). */
  private renderUseEmptyState(cx: number, contentTop: number): void {
    const title = this.add
      .text(cx, contentTop + 14, "Nothing to use yet", {
        color: MOON_TEXT,
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    const options = CONSUMABLE_ITEM_IDS.map((id) => {
      const consumable = getConsumable(id);
      return consumable
        ? `${getItemName(id)} — ${getUseEffectLabel(consumable.effectType)}`
        : getItemName(id);
    }).join("\n");
    const body = this.add
      .text(
        cx,
        contentTop + 46,
        `Tonics and draughts you craft land here, ready to heal or revive a companion.\n\nCraft one on the Craft tab:\n${options}`,
        {
          color: MOON_MUTED,
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          align: "center",
          lineSpacing: 4,
          wordWrap: { width: 400 },
        },
      )
      .setOrigin(0.5, 0);
    const go = this.add
      .text(cx, contentTop + 56 + body.height + 22, "Go to Craft", {
        color: "#1a1a2e",
        backgroundColor: "#ffedb0",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    this.onContentTap(go, () => this.switchTab("craft"));
    this.contentContainer.add([title, body, go]);
    this.contentHeight = shrineTabContentHeight(go.y + go.height + 12, contentTop);
  }

  private switchTab(tab: Tab): void {
    this.activeTab = tab;
    this.selectedItemId = null;
    this.refreshTabs();
    this.renderTabContent();
  }

  private renderUseTab(): void {
    const cx = this.panelCenter.x;
    const contentTop = this.contentBounds.top;

    const consumableIds = CONSUMABLE_ITEM_IDS.filter(
      (id) => getItemCount(id) > 0,
    );

    if (consumableIds.length === 0) {
      this.renderUseEmptyState(cx, contentTop);
      return;
    }

    if (!this.selectedItemId || !isConsumableItem(this.selectedItemId)) {
      const prompt = this.add
        .text(cx, contentTop + 8, "Choose a consumable:", {
          color: MOON_TEXT,
          fontFamily: "system-ui, sans-serif",
          fontSize: "15px",
        })
        .setOrigin(0.5);
      this.contentContainer.add(prompt);

      let y = contentTop + 40;
      for (const itemId of consumableIds) {
        const consumable = getConsumable(itemId)!;
        const effectLabel = getUseEffectLabel(consumable.effectType);
        const btn = this.add
          .text(
            cx,
            y,
            `${getItemName(itemId)} (×${getItemCount(itemId)}) — ${effectLabel}`,
            {
              color: "#1a1a2e",
              backgroundColor: "#c8b8e8",
              fontFamily: "system-ui, sans-serif",
              fontSize: "13px",
              padding: { x: 12, y: 8 },
            },
          )
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });

        this.onContentTap(btn, () => {
          this.selectedItemId = itemId;
          this.renderTabContent();
        });
        this.contentContainer.add(btn);
        y += 44;
      }
      this.contentHeight = shrineTabContentHeight(y, contentTop);
      return;
    }

    const itemId = this.selectedItemId;
    const consumable = getConsumable(itemId)!;
    const effectLabel = getUseEffectLabel(consumable.effectType, true);

    const listTop = this.addDetailChrome(
      contentTop,
      cx,
      `${getItemName(itemId)} — ${effectLabel}`,
    );

    const eligible = getEligibleCreaturesForConsumable(itemId).filter(
      (entry) => entry.eligible,
    );
    if (eligible.length === 0) {
      const message =
        consumable.effectType === "heal"
          ? "No injured creatures to heal."
          : consumable.effectType === "revive"
            ? "No fainted creatures to revive."
            : "All party members are already at max level 50.";
      const none = this.add
        .text(cx, listTop + 8, message, {
          color: MOON_MUTED,
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
        })
        .setOrigin(0.5);
      this.contentContainer.add(none);
      return;
    }

    let y = listTop + 16;
    for (const entry of eligible) {
      const hpLabel =
        entry.currentHp <= 0
          ? "fainted"
          : `${entry.currentHp}/${entry.maxHp} HP`;
      const label = `${entry.name} Lv.${entry.level} (${hpLabel})`;

      const btn = this.add
        .text(cx, y, label, {
          color: "#1a1a2e",
          backgroundColor: "#e0d4f0",
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          padding: { x: 12, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.onContentTap(btn, () => {
        const result = applyConsumable(entry.instanceId, itemId);
        this.setStatus(result.message);
        if (result.ok) {
          notifyWorldChanged();
          this.selectedItemId = null;
        }
        this.renderTabContent();
      });
      this.contentContainer.add(btn);
      y += 38;
    }
    this.contentHeight = shrineTabContentHeight(y, contentTop);
  }

  private setStatus(message: string): void {
    this.statusText.setText(message);
  }

  private closeShrine(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    // Clear any legacy stack entry; shrine leave is Phaser-owned (#281).
    popOverlay("shrine");
    hideShrineCraftingHud(true);
    this.scene.stop("ShrineScene");
    this.scene.resume("IsometricScene");
  }
}
