import Phaser from "phaser";
import { playCraftSfx } from "../audio/gameAudio";
import { type CraftContext } from "../crafting/recipes";
import { getItemIconSrc, getItemName } from "../inventory/materials";
import { getItemCount } from "../inventory/playerInventory";
import { applyShrineFusion, getEligibleCreaturesForItem } from "../shrine/fusion";
import { launchEvolutionScene } from "../evolution/launchEvolution";
import { lateCreatureKeys, lateImageStatus, loadLateImages } from "../render/lateAssets";
import { hideLoadingVeil, showLoadingVeil } from "../ui/loadingVeil";
import {
  applyEclipseFusion,
  applyGodFusion,
  findGodFusionParents,
  findHorizonFusionParents,
  ECLIPSE_SOVEREIGN_ID,
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
import { suggestCraft } from "../shrine/craftSuggestion";
import {
  currentShrineTabs,
  newlyRevealedTabs,
  resolveInitialTab,
  type ShrineMode,
  type ShrineTab,
} from "../shrine/shrineTabs";
import { playerInventory } from "../inventory/playerInventory";
import { playerParty, countCreatures } from "../creatures/party";
import { getActiveQuestId, recordQuestEvent } from "../story/questProgress";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { isVisitorMode } from "../world/worldSession";
import {
  hideShrineCraftingHud,
  showShrineCraftingHud,
} from "../ui/craftingHud";
import { focusGameCanvas } from "../ui/canvasFocus";
import { popOverlay } from "../ui/overlayStack";
import { canLeaveShrineNow } from "../ui/shrineLeave";
import { openRecipes } from "../ui/recipePanel";
import { refreshPartyStatusLine } from "../ui/statusPanel";
import {
  createShrineButton,
  mountShrinePanel,
  type ShrinePanelHandle,
} from "../ui/shrinePanel";

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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** A full-width list button: optional icon, name, right-aligned meta. */
function listRow(options: {
  name: string;
  meta?: string;
  iconSrc?: string;
  chip?: string;
  disabled?: boolean;
  onClick?: () => void;
}): HTMLButtonElement {
  const row = el("button", "sh-row");
  row.type = "button";
  row.disabled = Boolean(options.disabled);
  if (options.iconSrc) {
    const img = el("img", "sh-row-icon");
    img.src = options.iconSrc;
    img.alt = "";
    img.draggable = false;
    img.addEventListener("error", () => img.remove());
    row.append(img);
  }
  const name = el("span", "sh-row-name", options.name);
  row.append(name);
  if (options.chip) {
    row.append(el("span", "sh-chip", options.chip));
  }
  if (options.meta) {
    row.append(el("span", "sh-row-meta", options.meta));
  }
  if (options.onClick) {
    row.addEventListener("click", options.onClick);
  }
  return row;
}

export class ShrineScene extends Phaser.Scene {
  private activeTab: ShrineTab = "craft";
  private selectedItemId: string | null = null;
  private shrineMode: ShrineMode = "altar";
  private arrivalNotice = "";
  private panel?: ShrinePanelHandle;
  private craftSlot!: HTMLElement;
  private tabSlot!: HTMLElement;
  private tabIds: ShrineTab[] = [];
  private closing = false;

  constructor() {
    super({ key: "ShrineScene" });
  }

  init(data?: {
    mode?: CraftContext;
    tab?: ShrineTab;
    itemId?: string;
    /** Altar arrival line (free heal / story bundle, #390). */
    notice?: string;
  }): void {
    this.closing = false;
    this.arrivalNotice = data?.notice ?? "";
    this.shrineMode = data?.mode === "portable" ? "portable" : "altar";
    this.activeTab = resolveInitialTab(
      data?.tab,
      currentShrineTabs(this.shrineMode),
    );
    this.selectedItemId =
      this.activeTab === "use" && data?.itemId && isConsumableItem(data.itemId)
        ? data.itemId
        : null;
  }

  create(): void {
    // The altar heal ran before this scene launched: refresh the party HP HUD
    // now so it never shows pre-heal values behind the panel (#402).
    refreshPartyStatusLine();

    this.panel = mountShrinePanel({
      onSelectTab: (tab) => this.switchTab(tab),
      onRecipes: () => openRecipes(this.shrineMode),
      onClose: () => this.tryLeave(),
    });
    const panel = this.panel;
    panel.setSubtitle(
      // Altar arrival notice (#390) takes the subtitle.
      this.arrivalNotice ||
        (this.shrineMode === "portable"
          ? "Craft relics or use tonics. Fusion stays at the altar."
          : "Craft relics, use tonics, or fuse with companions."),
      Boolean(this.arrivalNotice),
    );

    // Phaser's own Esc covers focus outside the panel (canvas / body).
    this.input.keyboard?.on("keydown-ESC", () => this.tryLeave());

    this.events.once("shutdown", () => {
      hideShrineCraftingHud(true);
      this.panel?.destroy();
      this.panel = undefined;
    });
    this.events.on("sleep", () => this.panel?.setHidden(true));
    this.events.on("wake", () => {
      this.panel?.setHidden(false);
      if (isVisitorMode()) {
        return;
      }
      this.syncTabs(false);
      this.renderTabContent();
      this.panel?.focusTab(this.activeTab);
    });

    if (isVisitorMode()) {
      this.panel.setTabs([], this.activeTab);
      this.panel.body.append(
        el(
          "p",
          "shrine-lead",
          "Visitors can view this shrine, but only the host can craft or fuse.",
        ),
      );
      return;
    }

    this.craftSlot = el("div", "shrine-slot shrine-slot-craft");
    this.tabSlot = el("div", "shrine-slot shrine-slot-tab");
    panel.body.append(this.craftSlot, this.tabSlot);

    this.syncTabs(false);
    this.renderTabContent();
    panel.focusTab(this.activeTab);
  }

  private tryLeave(): void {
    // Nested DOM overlays (Recipes, etc.) close first via overlayStack (#281).
    if (!canLeaveShrineNow()) {
      return;
    }
    this.closeShrine();
  }

  /**
   * Rebuild the tab row from live disclosure. With `reveal`, tabs that just
   * appeared (Fusion after crafting the relic) pulse and take focus (#402).
   */
  private syncTabs(reveal: boolean): ShrineTab[] {
    const tabs = currentShrineTabs(this.shrineMode);
    const ids = tabs.map((t) => t.id);
    const added = newlyRevealedTabs(this.tabIds, ids);
    this.tabIds = ids;
    this.panel?.setTabs(tabs, this.activeTab, reveal ? added : []);
    return reveal ? added : [];
  }

  private switchTab(tab: ShrineTab): void {
    this.activeTab = tab;
    this.selectedItemId = null;
    if (tab === "fusion") {
      // One relic in hand: skip straight to who gets it.
      const owned = FUSION_ITEM_IDS.filter((id) => getItemCount(id) > 0);
      if (owned.length === 1) {
        this.selectedItemId = owned[0];
      }
    }
    this.setStatus("");
    this.syncTabs(false);
    this.renderTabContent();
  }

  private renderTabContent(): void {
    if (!this.panel) {
      return;
    }
    this.tabSlot.replaceChildren();
    this.panel.resetScroll();
    const craft = this.activeTab === "craft";
    this.craftSlot.hidden = !craft;
    this.tabSlot.hidden = craft;
    if (craft) {
      this.renderCraftTab();
      return;
    }
    hideShrineCraftingHud(false);
    if (this.activeTab === "use") {
      this.renderUseTab(this.tabSlot);
    } else {
      this.renderFusionTab(this.tabSlot);
    }
  }

  private renderCraftTab(): void {
    showShrineCraftingHud({
      context: this.shrineMode,
      parent: this.craftSlot,
      onGoFusion:
        this.shrineMode === "altar" ? () => this.switchTab("fusion") : undefined,
      onCrafted: (name, count) => {
        playCraftSfx(this);
        if (this.shrineMode === "altar") {
          recordQuestEvent({ type: "craft_item" });
        }
        const suffix = count > 1 ? ` ×${count}` : "";
        notifyWorldChanged();
        // Crafting the relic discloses Fusion: show the tab right now.
        const revealed = this.syncTabs(true);
        this.setStatus(
          revealed.includes("fusion")
            ? `Crafted ${name}${suffix}! The Fusion tab is open. Give it to your companion.`
            : `Crafted ${name}${suffix}!`,
        );
      },
    });
  }

  // --- Fusion ---------------------------------------------------------

  private renderFusionTab(host: HTMLElement): void {
    if (!this.selectedItemId) {
      host.append(el("p", "shrine-lead", "Choose an item to fuse"));
      const questItem = this.questRelicId();
      const list = el("div", "sh-list");
      const ids = [...FUSION_ITEM_IDS].sort(
        (a, b) => Number(getItemCount(b) > 0) - Number(getItemCount(a) > 0),
      );
      for (const itemId of ids) {
        const owned = getItemCount(itemId);
        list.append(
          listRow({
            name: getItemName(itemId),
            iconSrc: getItemIconSrc(itemId),
            meta: owned > 0 ? `×${owned}` : "craft first",
            chip: owned > 0 && itemId === questItem ? "Quest" : undefined,
            disabled: owned <= 0,
            onClick: () => {
              this.selectedItemId = itemId;
              this.renderTabContent();
            },
          }),
        );
      }
      host.append(list);
      return;
    }

    const itemId = this.selectedItemId;
    if (itemId === SOVEREIGN_SEAL_ID) {
      this.renderGodFusion(host);
      return;
    }

    // Only the effects this party can actually use, when there are any.
    const effects = getEffectsForItem(itemId);
    const inParty = effects.filter((e) =>
      playerParty.creatures.some((c) => c.definitionId === e.creatureId),
    );
    this.addDetailChrome(
      host,
      getItemName(itemId),
      (inParty.length > 0 ? inParty : effects).map((e) =>
        describeShrineEffect(e),
      ),
    );

    const candidates = getEligibleCreaturesForItem(itemId);
    const eligible = candidates.filter((entry) => entry.eligible);
    if (eligible.length === 0) {
      const alreadyApplied = candidates.some(
        (e) => e.reason === "Already applied",
      );
      host.append(
        el(
          "p",
          "shrine-empty",
          alreadyApplied
            ? "Fusion already applied to all eligible creatures."
            : "No creatures at the required level.",
        ),
      );
      return;
    }

    const list = el("div", "sh-list");
    for (const entry of eligible) {
      list.append(
        listRow({
          name: entry.name,
          meta: `Lv.${entry.level}`,
          onClick: () => {
            const result = applyShrineFusion(entry.instanceId, itemId);
            this.setStatus(result.message);
            if (result.ok) {
              notifyWorldChanged();
              refreshPartyStatusLine();
              this.selectedItemId = null;
            }
            this.renderTabContent();
            if (result.ok && result.growth) {
              // Growth unlock: data is applied; leave the menu for the cutscene (#393).
              launchEvolutionScene(this, { reveal: result.growth });
            }
          },
        }),
      );
    }
    host.append(list);
  }

  /** The fusion relic the active quest wants applied next, if held. */
  private questRelicId(): string | null {
    const suggestion = suggestCraft({
      questId: getActiveQuestId(),
      context: this.shrineMode,
      materials: playerInventory.materials,
      items: playerInventory.items,
      partyDefinitionIds: playerParty.creatures.map((c) => c.definitionId),
    });
    return suggestion?.kind === "fusion" ? suggestion.itemId : null;
  }

  /** "← Back" on its own row, then a title and optional detail lines (#391). */
  private addDetailChrome(
    host: HTMLElement,
    title: string,
    lines: readonly string[] = [],
  ): void {
    const back = createShrineButton("← Back", "ghost", () => {
      this.selectedItemId = null;
      this.renderTabContent();
    });
    back.classList.add("sh-back");
    host.append(back, el("h3", "shrine-detail-title", title));
    if (lines.length > 0) {
      const detail = el("ul", "shrine-detail-lines");
      for (const line of lines) {
        detail.append(el("li", "", line));
      }
      host.append(detail);
    }
  }

  private renderGodFusion(host: HTMLElement): void {
    this.addDetailChrome(host, "Sovereign Seal", [
      "Fuse the two sovereigns into a new one.",
    ]);
    const note = (text: string): void => {
      host.append(el("p", "shrine-empty", text));
    };
    const action = (
      summary: string,
      label: string,
      run: () => { ok: boolean; message: string },
      resultId: string,
    ): void => {
      host.append(el("p", "shrine-lead", summary));
      // Silently prefetch the new sovereign's art while the card is read
      // (#410); it must be in before the sovereign joins the party.
      const artKeys = lateCreatureKeys([resultId]);
      void loadLateImages(this, artKeys, null);
      const apply = (): void => {
        const result = run();
        this.setStatus(result.message);
        if (result.ok) {
          notifyWorldChanged();
          refreshPartyStatusLine();
          this.selectedItemId = null;
        }
        this.renderTabContent();
      };
      const btn = createShrineButton(label, "primary", () => {
        if (artKeys.every((key) => lateImageStatus(this, key) === "ready")) {
          apply();
          return;
        }
        // Still fetching (slow link) or failed earlier: veil above the panel,
        // retrying a failed fetch. Nothing is consumed until the art is in.
        btn.disabled = true;
        showLoadingVeil("The seal awakens…");
        void loadLateImages(this, artKeys, null, true).then((ok) => {
          hideLoadingVeil();
          // Esc / tab switch while loading cancels: keep the texture, spend nothing.
          if (!this.panel || !this.sys.isActive() || !btn.isConnected) {
            return;
          }
          btn.disabled = false;
          if (!ok) {
            this.setStatus("Couldn't reach the sovereign's art. Check your connection and press Fuse to retry.");
            return;
          }
          apply();
        });
      });
      btn.classList.add("sh-wide");
      host.append(btn);
    };

    if (isEclipseFusionCompleted()) {
      note("Eclipse Sovereign has already been fused.");
      return;
    }

    const { first, second } = findHorizonFusionParents();
    if (first && second) {
      action(
        `Horizon Sovereign Lv.${first.level} + Horizon Sovereign Lv.${second.level}`,
        "Fuse into Eclipse Sovereign",
        () =>
          applyEclipseFusion(
            first.instanceId,
            second.instanceId,
            SOVEREIGN_SEAL_ID,
          ),
        ECLIPSE_SOVEREIGN_ID,
      );
      return;
    }

    if (
      getHorizonFusionCount() >= MAX_HORIZON_FUSIONS ||
      countCreatures(HORIZON_SOVEREIGN_ID) >= MAX_SOVEREIGN_COPIES
    ) {
      note("Requires two Horizon Sovereigns in your party.");
      return;
    }

    const { tide, cairn } = findGodFusionParents();
    if (!tide || !cairn) {
      note("Requires Tide Sovereign and Stone Sovereign in your party.");
      return;
    }
    action(
      `Tide Sovereign Lv.${tide.level} + Stone Sovereign Lv.${cairn.level}`,
      "Fuse into Horizon Sovereign",
      () => applyGodFusion(tide.instanceId, cairn.instanceId, SOVEREIGN_SEAL_ID),
      HORIZON_SOVEREIGN_ID,
    );
  }

  // --- Use ------------------------------------------------------------

  /** Nothing to use yet: say what lives here and how to get it (#391). */
  private renderUseEmptyState(host: HTMLElement): void {
    const options = CONSUMABLE_ITEM_IDS.map((id) => {
      const consumable = getConsumable(id);
      return consumable
        ? `${getItemName(id)}: ${getUseEffectLabel(consumable.effectType)}`
        : getItemName(id);
    });
    host.append(
      el("h3", "shrine-detail-title", "Nothing to use yet"),
      el(
        "p",
        "shrine-empty",
        "Tonics and draughts you craft land here, ready to heal or revive a companion. Craft one on the Craft tab:",
      ),
    );
    const list = el("ul", "shrine-detail-lines");
    for (const line of options) {
      list.append(el("li", "", line));
    }
    host.append(list);
    const go = createShrineButton("Go to Craft", "primary", () =>
      this.switchTab("craft"),
    );
    go.classList.add("sh-wide");
    go.dataset.shrineGoCraft = "1";
    host.append(go);
  }

  private renderUseTab(host: HTMLElement): void {
    const consumableIds = CONSUMABLE_ITEM_IDS.filter(
      (id) => getItemCount(id) > 0,
    );

    if (consumableIds.length === 0) {
      this.renderUseEmptyState(host);
      return;
    }

    if (!this.selectedItemId || !isConsumableItem(this.selectedItemId)) {
      host.append(el("p", "shrine-lead", "Choose a consumable"));
      const list = el("div", "sh-list");
      for (const itemId of consumableIds) {
        const consumable = getConsumable(itemId)!;
        list.append(
          listRow({
            name: getItemName(itemId),
            iconSrc: getItemIconSrc(itemId),
            meta: `×${getItemCount(itemId)} · ${getUseEffectLabel(
              consumable.effectType,
            )}`,
            onClick: () => {
              this.selectedItemId = itemId;
              this.renderTabContent();
            },
          }),
        );
      }
      host.append(list);
      return;
    }

    const itemId = this.selectedItemId;
    const consumable = getConsumable(itemId)!;
    this.addDetailChrome(host, getItemName(itemId), [
      getUseEffectLabel(consumable.effectType, true),
    ]);

    const eligible = getEligibleCreaturesForConsumable(itemId).filter(
      (entry) => entry.eligible,
    );
    if (eligible.length === 0) {
      host.append(
        el(
          "p",
          "shrine-empty",
          consumable.effectType === "heal"
            ? "No injured creatures to heal."
            : consumable.effectType === "revive"
              ? "No fainted creatures to revive."
              : "All party members are already at max level 50.",
        ),
      );
      return;
    }

    const list = el("div", "sh-list");
    for (const entry of eligible) {
      const hpLabel =
        entry.currentHp <= 0
          ? "fainted"
          : `${entry.currentHp}/${entry.maxHp} HP`;
      list.append(
        listRow({
          name: entry.name,
          meta: `Lv.${entry.level} · ${hpLabel}`,
          onClick: () => {
            const result = applyConsumable(entry.instanceId, itemId);
            this.setStatus(result.message);
            if (result.ok) {
              notifyWorldChanged();
              refreshPartyStatusLine();
              this.selectedItemId = null;
            }
            this.renderTabContent();
          },
        }),
      );
    }
    host.append(list);
  }

  private setStatus(message: string): void {
    this.panel?.setStatus(message);
  }

  private closeShrine(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    // Clear any legacy stack entry; shrine leave is Phaser-owned (#281).
    popOverlay("shrine");
    hideShrineCraftingHud(true);
    this.panel?.destroy();
    this.panel = undefined;
    refreshPartyStatusLine();
    this.scene.stop("ShrineScene");
    this.scene.resume("IsometricScene");
    focusGameCanvas();
  }
}
