import Phaser from "phaser";
import { playEncounterSfx, playUiClickSfx } from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import { addToParty, hasCreature } from "../creatures/party";
import { formatEncounterMatchup } from "../battle/battleLogic";
import { resolveMatchup } from "../creatures/folkloreTypes";
import { ensureCreatureTextures } from "../creatures/sprites";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import {
  ENCOUNTER_CREATURE_DISPLAY,
  ensureTrimmedTexture,
  fitContainDisplay,
} from "../render/displaySizes";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { prefersReducedMotion } from "../render/fx/fxSettings";
import { UNARMED_WANDERER } from "../battle/wandererWeapons";
import {
  ASSURED_BEFRIEND_LABEL,
  formatGodClaimJoinLine,
  isGodCreature,
  isStory1BefriendGuaranteed,
  resolveTideSovereignOutcome,
  rollBefriendAttempt,
  TIDE_SOVEREIGN_ID,
} from "../encounters/godSail";
import {
  afterBefriendMiss,
  befriendMissLine,
  formatBefriendBreakdown,
  formatBefriendPercent,
  offeringLabel,
  FAVORITE_BAIT_ID,
  FOLK_SEAL_ID,
  type BefriendOffering,
} from "../encounters/befriendChance";
import {
  availableOfferings,
  befriendOddsFor,
  consumeOffering,
  currentOffering,
  cycleOffering,
  encounterLead,
  isFavoriteKnown,
} from "../encounters/befriendRuntime";
import {
  canAffordBefriend,
  canAffordFlee,
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
  shouldConcealReveal,
  shouldOfferHarborBefriend,
  shouldShowSparVerb,
} from "../encounters/habitatRuntime";
import { getFavoriteMaterial } from "../companions/favorites";
import { getIngredientIconSrc, getMaterialName } from "../inventory/materials";
import { getItemCount } from "../inventory/playerInventory";
import type { ZoneId } from "../world/zoneTypes";
import { isVisitorMode } from "../world/worldSession";
import { markCreatureDiscovered } from "../world/worldState";
import { getWildEffectiveLevel } from "../progression/wildLevel";
import { unlockCodexHud } from "../ui/hudChrome";
import {
  addChip,
  CARD,
  CARD_FONT,
  CardButton,
  TYPE_CHIP_COLORS,
  type ButtonTone,
} from "../ui/encounterCard";

/** Card frame (design px; the canvas is a 640 square). */
const PANEL = { x: 44, y: 22, w: DESIGN_SIZE - 88, h: DESIGN_SIZE - 44, r: 26 } as const;
const CX = DESIGN_SIZE / 2;
const STAGE = { top: PANEL.y + 14, h: 208 } as const;
const PORTRAIT_FEET_Y = STAGE.top + STAGE.h - 20;
const PORTRAIT_BOX = { width: 280, height: 176 } as const;
const NAME_Y = STAGE.top + STAGE.h + 30;
const CHIPS_Y = NAME_Y + 40;
const ODDS = { y: CHIPS_Y + 26, h: 128 } as const;
const BUTTON_Y = ODDS.y + ODDS.h + 46;
const MESSAGE_Y = BUTTON_Y + 62;
const TIP_COLOR = CARD.mutedCss;

type EncounterVerb = "befriend" | "spar" | "flee";

export class EncounterScene extends Phaser.Scene {
  private creatureId!: string;
  private zoneId?: ZoneId;
  private actionTaken = false;
  private revealed = false;
  /** Missed befriends this encounter; a streak sends the wild away (#366). */
  private befriendMisses = 0;
  /** A missed card befriend makes the wild strike first in a spar. */
  private wildOpens = false;
  private nameText?: Phaser.GameObjects.Text;
  private chipRow?: Phaser.GameObjects.Container;
  private portrait?: Phaser.GameObjects.Image;
  private oddsLayer?: Phaser.GameObjects.Container;
  private messageText?: Phaser.GameObjects.Text;
  private buttons: { verb: EncounterVerb; button: CardButton }[] = [];
  private focusIndex = -1;
  /** Befriend roll source (swappable for QA, like BattleScene.rng). */
  private rng: () => number = Math.random;

  constructor() {
    super({ key: "EncounterScene" });
  }

  init(data: { creatureId: string; zoneId?: ZoneId }): void {
    this.creatureId = data.creatureId;
    this.zoneId = data.zoneId;
    this.actionTaken = false;
    this.revealed = false;
    this.befriendMisses = 0;
    this.wildOpens = false;
    this.nameText = undefined;
    this.chipRow = undefined;
    this.portrait = undefined;
    this.oddsLayer = undefined;
    this.messageText = undefined;
    this.buttons = [];
    this.focusIndex = -1;
    this.rng = Math.random;
  }

  /** Favorite-material / offering icons are DOM PNGs; pull the few this card needs. */
  preload(): void {
    for (const id of [getFavoriteMaterial(this.creatureId), FOLK_SEAL_ID, FAVORITE_BAIT_ID]) {
      const src = getIngredientIconSrc(id);
      if (src && !this.textures.exists(iconKey(id))) {
        this.load.image(iconKey(id), src);
      }
    }
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

    document.body.classList.add("encounter-active");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove("encounter-active");
    });

    this.cameras.main.fadeIn(160, 11, 22, 38);
    this.add
      .rectangle(0, 0, DESIGN_SIZE, DESIGN_SIZE, CARD.veil, 0.62)
      .setOrigin(0)
      .setInteractive();

    this.drawPanel();
    this.showPortrait(concealed);
    this.nameText = this.add
      .text(CX, NAME_Y, "", {
        fontFamily: CARD_FONT,
        fontSize: "34px",
        fontStyle: "bold",
        color: CARD.creamCss,
      })
      .setOrigin(0.5);
    this.refreshIdentity();

    const verbs: { verb: EncounterVerb; label: string; tone: ButtonTone; enabled: boolean }[] = [];
    if (shouldOfferHarborBefriend(profile, this.creatureId)) {
      verbs.push({
        verb: "befriend",
        label: isStory1BefriendGuaranteed(this.creatureId) ? ASSURED_BEFRIEND_LABEL : "Befriend",
        tone: "primary",
        enabled: canAffordBefriend(),
      });
    }
    if (shouldShowSparVerb(profile, this.creatureId)) {
      verbs.push({ verb: "spar", label: encounterSparButtonLabel(), tone: "secondary", enabled: true });
    }
    verbs.push({ verb: "flee", label: encounterFleeButtonLabel(), tone: "ghost", enabled: canAffordFlee() });
    this.buildButtons(verbs);

    this.messageText = this.add
      .text(CX, MESSAGE_Y, "", {
        fontFamily: CARD_FONT,
        fontSize: "18px",
        fontStyle: "bold",
        color: TIP_COLOR,
        align: "center",
        wordWrap: { width: PANEL.w - 56, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0.5);
    const unaffordable = encounterUnaffordableReasons();
    if (unaffordable.length > 0) {
      this.setMessage(unaffordable.join(" · "));
    } else {
      this.messageText.setText(this.tipLine());
    }

    this.refreshOdds();
    this.bindKeyboard();
    this.playEntrance();
  }

  // --- Layout ---------------------------------------------------------------

  private drawPanel(): void {
    const g = this.add.graphics();
    // Soft drop shadow, navy body, cream rim.
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(PANEL.x + 2, PANEL.y + 8, PANEL.w, PANEL.h, PANEL.r);
    g.fillStyle(CARD.panel, 0.98);
    g.fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
    g.lineStyle(3, CARD.cream, 0.85);
    g.strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
    g.lineStyle(1, CARD.line, 1);
    g.strokeRoundedRect(PANEL.x + 7, PANEL.y + 7, PANEL.w - 14, PANEL.h - 14, PANEL.r - 6);

    // Stage: a lit clearing behind the creature.
    const stageX = PANEL.x + 14;
    const stageW = PANEL.w - 28;
    g.fillStyle(CARD.panelDeep, 1);
    g.fillRoundedRect(stageX, STAGE.top, stageW, STAGE.h, 18);
    const glowY = STAGE.top + STAGE.h * 0.55;
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(0x3d6a8a, 0.07);
      g.fillEllipse(CX, glowY, 90 + i * 52, 60 + i * 30);
    }
    g.fillStyle(0x2a4a3c, 0.9);
    g.fillEllipse(CX, PORTRAIT_FEET_Y + 6, 300, 46);
    g.fillStyle(0x36604c, 0.9);
    g.fillEllipse(CX, PORTRAIT_FEET_Y + 2, 250, 30);

    this.add
      .text(stageX + 16, STAGE.top + 14, "WILD ENCOUNTER", {
        fontFamily: CARD_FONT,
        fontSize: "15px",
        fontStyle: "bold",
        color: CARD.mutedCss,
        letterSpacing: 2,
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0, 0);
  }

  private showPortrait(concealed: boolean): void {
    const def = getCreatureDefinition(this.creatureId);
    const pose = resolveCreaturePoseTexture(this, def.spriteKey, "encounter");
    const trimmed = ensureTrimmedTexture(this, ...pose);
    // Soft contact shadow under the feet.
    this.add.ellipse(CX, PORTRAIT_FEET_Y, 150, 22, 0x000000, 0.38);
    const box = {
      width: Math.min(PORTRAIT_BOX.width, ENCOUNTER_CREATURE_DISPLAY.width),
      height: Math.min(PORTRAIT_BOX.height, ENCOUNTER_CREATURE_DISPLAY.height),
    };
    this.portrait = this.add.image(CX, PORTRAIT_FEET_Y + 4, ...trimmed).setOrigin(0.5, 1);
    fitContainDisplay(this.portrait, box);
    if (concealed) {
      this.portrait.setTintFill(0x0a1422);
    }
    if (!prefersReducedMotion()) {
      const sx = this.portrait.scaleX;
      const sy = this.portrait.scaleY;
      // Idle breathing: a slow squash from the feet.
      this.tweens.add({
        targets: this.portrait,
        scaleY: sy * 1.035,
        scaleX: sx * 0.985,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private playEntrance(): void {
    if (prefersReducedMotion() || !this.portrait) {
      return;
    }
    const y = this.portrait.y;
    this.portrait.setY(y + 18).setAlpha(0);
    this.tweens.add({ targets: this.portrait, y, alpha: 1, duration: 320, ease: "Back.easeOut" });
  }

  /** Name + type chip + matchup chip + level; hidden until revealed. */
  private refreshIdentity(): void {
    const def = getCreatureDefinition(this.creatureId);
    this.nameText?.setText(this.revealed ? def.name : "???");
    this.chipRow?.destroy();
    const chips: Phaser.GameObjects.Container[] = [];
    const level = getWildEffectiveLevel(this.creatureId);
    chips.push(addChip(this, 0, 0, `Lv ${level}`, 0x2a4462, CARD.creamCss));
    if (this.revealed) {
      chips.push(addChip(this, 0, 0, def.folkloreType.toUpperCase(), TYPE_CHIP_COLORS[def.folkloreType]));
      const lead = encounterLead();
      if (lead) {
        const leadDef = getCreatureDefinition(lead.definitionId);
        const out = resolveMatchup(leadDef.folkloreType, def.folkloreType);
        const incoming = resolveMatchup(def.folkloreType, leadDef.folkloreType);
        const fill = out === "hunter" ? CARD.good : incoming === "hunter" ? CARD.bad : 0xd8e2ec;
        chips.push(
          addChip(this, 0, 0, formatEncounterMatchup(leadDef.name, leadDef.folkloreType, def.folkloreType), fill),
        );
      }
    }
    const gap = 8;
    const total = chips.reduce((sum, c) => sum + c.width, 0) + gap * (chips.length - 1);
    let x = CX - total / 2;
    for (const chip of chips) {
      chip.setX(x + chip.width / 2);
      x += chip.width + gap;
    }
    this.chipRow = this.add.container(0, CHIPS_Y, chips);
  }

  private buildButtons(
    verbs: { verb: EncounterVerb; label: string; tone: ButtonTone; enabled: boolean }[],
  ): void {
    const gap = 14;
    const inner = PANEL.w - 48;
    const w = Math.floor((inner - gap * (verbs.length - 1)) / verbs.length);
    // Keycaps only help keyboard players; touch screens skip the clutter.
    const showKeys = window.matchMedia?.("(pointer: fine)").matches ?? true;
    verbs.forEach((v, i) => {
      const x = PANEL.x + 24 + w / 2 + i * (w + gap);
      const button = new CardButton(this, x, BUTTON_Y, {
        width: w,
        height: 60,
        label: v.label,
        tone: v.tone,
        key: showKeys ? String(i + 1) : undefined,
        onActivate: () => this.runVerb(v.verb),
      });
      button.container.on("pointerover", () => this.setFocus(i, false));
      button.setEnabled(v.enabled);
      this.buttons.push({ verb: v.verb, button });
    });
  }

  private button(verb: EncounterVerb): CardButton | undefined {
    return this.buttons.find((b) => b.verb === verb)?.button;
  }

  private runVerb(verb: EncounterVerb): void {
    if (this.actionTaken) {
      return;
    }
    playUiClickSfx(this);
    if (verb === "befriend") {
      this.tryBefriend();
    } else if (verb === "spar") {
      this.startSpar();
    } else {
      this.flee();
    }
  }

  // --- Keyboard: arrows / Tab move focus, Enter / Space press, 1-3 direct ----

  private bindKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (this.actionTaken) {
        return;
      }
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= this.buttons.length) {
        this.setFocus(n - 1, true);
        this.buttons[n - 1]!.button.activate();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
        event.preventDefault();
        this.moveFocus(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
        event.preventDefault();
        this.moveFocus(-1);
      } else if ((event.key === "Enter" || event.key === " ") && this.focusIndex >= 0) {
        event.preventDefault();
        this.buttons[this.focusIndex]?.button.activate();
      } else if (event.key === "o" || event.key === "O") {
        this.toggleOffering();
      }
    };
    keyboard.on("keydown", onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off("keydown", onKey));
  }

  private moveFocus(step: number): void {
    const count = this.buttons.length;
    let index = this.focusIndex;
    for (let i = 0; i < count; i++) {
      index = (index + step + count) % count;
      if (this.buttons[index]!.button.isEnabled()) {
        this.setFocus(index, true);
        return;
      }
    }
  }

  private setFocus(index: number, visible: boolean): void {
    this.focusIndex = index;
    this.buttons.forEach((b, i) => b.button.setFocused(visible && i === index));
  }

  // --- Odds card -----------------------------------------------------------

  /** "~62%" + breakdown, offering chip, favorite-material hint. */
  private refreshOdds(): void {
    this.oddsLayer?.destroy();
    const layer = this.add.container(0, 0);
    this.oddsLayer = layer;
    const left = PANEL.x + 24;
    const width = PANEL.w - 48;
    const bg = this.add.graphics();
    bg.fillStyle(CARD.cream, 1);
    bg.fillRoundedRect(left, ODDS.y, width, ODDS.h, 16);
    layer.add(bg);

    const befriendShown = this.button("befriend") !== undefined;
    const { headline, caption, breakdown } = this.oddsCopy(befriendShown);
    layer.add(
      this.add
        .text(left + 18, ODDS.y + 12, caption, {
          fontFamily: CARD_FONT,
          fontSize: "14px",
          fontStyle: "bold",
          color: "#5a6e84",
          letterSpacing: 1,
        } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0, 0),
    );
    layer.add(
      this.add
        .text(left + 18, ODDS.y + 30, headline, {
          fontFamily: CARD_FONT,
          fontSize: headline.length > 5 ? "30px" : "44px",
          fontStyle: "bold",
          color: CARD.inkCss,
        })
        .setOrigin(0, 0),
    );
    const breakdownX = left + 150;
    layer.add(
      this.add
        .text(breakdownX, ODDS.y + 12, breakdown, {
          fontFamily: CARD_FONT,
          fontSize: "17px",
          color: "#2c4058",
          lineSpacing: 2,
          wordWrap: { width: left + width - breakdownX - 16, useAdvancedWrap: true },
        })
        .setOrigin(0, 0),
    );

    // Footer row: offering toggle (left) + favorite-material hint (right).
    const footY = ODDS.y + ODDS.h - 23;
    const divider = this.add.graphics();
    divider.lineStyle(1, 0xd9cdb5, 1);
    divider.lineBetween(left + 14, footY - 18, left + width - 14, footY - 18);
    layer.add(divider);
    this.addOfferingChip(layer, left + 18, footY);
    this.addFavoriteHint(layer, left + width - 18, footY);
  }

  private oddsCopy(befriendShown: boolean): { headline: string; caption: string; breakdown: string } {
    const name = getCreatureDefinition(this.creatureId).name;
    if (!befriendShown) {
      return { headline: "—", caption: "BEFRIEND", breakdown: "Already met here — spar or flee." };
    }
    if (isStory1BefriendGuaranteed(this.creatureId)) {
      return {
        headline: "Assured",
        caption: "BEFRIEND ODDS",
        breakdown: `Your first friend: ${this.revealed ? name : "it"} will join.`,
      };
    }
    if (hasCreature(this.creatureId)) {
      return { headline: "Friend", caption: "IN YOUR PARTY", breakdown: `${name} already travels with you.` };
    }
    const odds = befriendOddsFor({ creatureId: this.creatureId, zoneId: this.zoneId });
    return {
      headline: `~${formatBefriendPercent(odds.chance)}`,
      caption: "BEFRIEND ODDS",
      breakdown: formatBefriendBreakdown(odds).join("  ·  "),
    };
  }

  /** Idle hint under the buttons (replaced by event lines like a miss). */
  private tipLine(): string {
    if (isGodCreature(this.creatureId)) {
      return "One befriend try — sovereigns rarely bow.";
    }
    if (isStory1BefriendGuaranteed(this.creatureId) || hasCreature(this.creatureId)) {
      return "";
    }
    return "Tip: weaken or Root / Daze it in a spar, then Befriend.";
  }

  private addOfferingChip(layer: Phaser.GameObjects.Container, x: number, y: number): void {
    const options = availableOfferings(this.creatureId);
    const owned = getItemCount(FOLK_SEAL_ID) + getItemCount(FAVORITE_BAIT_ID) > 0;
    if (isGodCreature(this.creatureId) || !owned) {
      layer.add(
        this.add
          .text(x, y, isGodCreature(this.creatureId) ? "No offerings" : "Shrine craft: Folk Seal +15%", {
            fontFamily: CARD_FONT,
            fontSize: "16px",
            color: "#6a7a8c",
          })
          .setOrigin(0, 0.5),
      );
      return;
    }
    const offering = currentOffering(this.creatureId);
    const label =
      offering === "none"
        ? options.length > 1
          ? "Offer: nothing"
          : "Bait needs its favorite"
        : `${offeringLabel(offering)} ×${getItemCount(offeringItemId(offering))}`;
    const icon = offering !== "none" && this.textures.exists(iconKey(offeringItemId(offering)))
      ? iconKey(offeringItemId(offering))
      : undefined;
    const toggle = options.length > 1 ? "  ⇄" : "";
    const chip = addChip(
      this,
      0,
      y,
      `${label}${toggle}`,
      offering === "none" ? 0xe6dcc8 : 0xffc2a8,
      CARD.inkCss,
      16,
      icon,
    );
    chip.setX(x + chip.width / 2);
    if (options.length > 1) {
      chip.setInteractive(
        new Phaser.Geom.Rectangle(-10, -12, chip.width + 20, chip.height + 24),
        Phaser.Geom.Rectangle.Contains,
      );
      if (chip.input) {
        chip.input.cursor = "pointer";
      }
      chip.on("pointerup", () => this.toggleOffering());
    }
    layer.add(chip);
  }

  private toggleOffering(): void {
    if (this.actionTaken || availableOfferings(this.creatureId).length < 2) {
      return;
    }
    cycleOffering(this.creatureId);
    playUiClickSfx(this);
    this.refreshOdds();
  }

  private addFavoriteHint(layer: Phaser.GameObjects.Container, right: number, y: number): void {
    if (!this.revealed || !isFavoriteKnown(this.creatureId) || isGodCreature(this.creatureId)) {
      return;
    }
    const materialId = getFavoriteMaterial(this.creatureId);
    const text = this.add
      .text(right, y, `Loves ${getMaterialName(materialId)}`, {
        fontFamily: CARD_FONT,
        fontSize: "16px",
        fontStyle: "bold",
        color: "#a0466a",
      })
      .setOrigin(1, 0.5);
    layer.add(text);
    if (this.textures.exists(iconKey(materialId))) {
      layer.add(
        this.add
          .image(right - text.width - 17, y, iconKey(materialId))
          .setDisplaySize(28, 28),
      );
    }
  }

  /** Event line (miss, join, leave) in gold; replaces the idle tip. */
  private setMessage(message: string): void {
    this.messageText?.setColor(CARD.goldCss).setText(message);
    if (this.messageText && !prefersReducedMotion()) {
      this.tweens.add({ targets: this.messageText, scale: { from: 1.08, to: 1 }, duration: 180 });
    }
  }

  // --- Verbs ---------------------------------------------------------------

  private revealCreature(): void {
    if (this.revealed) {
      return;
    }
    this.revealed = true;
    const def = getCreatureDefinition(this.creatureId);
    if (!def.excludeFromCodex) {
      markCreatureDiscovered(this.creatureId);
    }
    this.portrait?.clearTint();
    this.refreshIdentity();
    this.refreshOdds();
  }

  private tryBefriend(): void {
    if (this.actionTaken || isVisitorMode()) {
      return;
    }
    if (!canAffordBefriend() || !payBefriendCost()) {
      return;
    }
    this.revealCreature();
    this.actionTaken = true;
    const name = getCreatureDefinition(this.creatureId).name;

    if (hasCreature(this.creatureId)) {
      this.showResult(`${name} is already in your party.`);
      return;
    }

    const odds = befriendOddsFor({ creatureId: this.creatureId, zoneId: this.zoneId });
    const offering = currentOffering(this.creatureId);
    consumeOffering(this.creatureId, offering);
    if (rollBefriendAttempt(this.creatureId, this.rng, odds.chance)) {
      this.befriendSucceeded(name);
      return;
    }

    // Miss: readable cost, never a hard lock.
    this.actionTaken = false;
    this.shakePortrait();
    if (isGodCreature(this.creatureId)) {
      // Sovereigns keep their single roll; Spar / Flee stay open.
      this.button("befriend")?.setEnabled(false);
      this.setMessage("Not this time.");
      this.refreshOdds();
      return;
    }
    const miss = afterBefriendMiss(this.befriendMisses);
    this.befriendMisses = miss.misses;
    this.setMessage(befriendMissLine(name, miss, false));
    if (miss.fled) {
      this.actionTaken = true;
      if (this.zoneId) {
        onWildEncounterResolved(this.zoneId, this.creatureId, "flee");
      }
      this.wildLeaves();
      return;
    }
    this.wildOpens = true;
    this.button("spar")?.setLabel("Spar · it strikes first");
    this.refreshOdds();
  }

  private befriendSucceeded(name: string): void {
    if (this.zoneId) {
      onWildEncounterResolved(this.zoneId, this.creatureId, "befriend");
    }
    if (this.creatureId === TIDE_SOVEREIGN_ID) {
      const result = resolveTideSovereignOutcome("befriend");
      if (result) {
        this.showResult(formatGodClaimJoinLine("Tide Sovereign", "Tide Cleaver", result, false));
      }
    } else if (this.creatureId === CAIRN_SOVEREIGN_ID) {
      const result = resolveCairnSovereignOutcome("befriend");
      if (result) {
        this.showResult(formatGodClaimJoinLine("Stone Sovereign", "Cairn Maul", result, false));
      }
    } else {
      addToParty(this.creatureId, getWildEffectiveLevel(this.creatureId));
      this.celebrate();
      this.showResult(`${name} joined you!`);
    }
  }

  private shakePortrait(): void {
    if (!this.portrait || prefersReducedMotion()) {
      return;
    }
    const x = this.portrait.x;
    this.tweens.add({
      targets: this.portrait,
      x: { from: x - 8, to: x },
      duration: 260,
      ease: "Elastic.easeOut",
    });
  }

  private celebrate(): void {
    if (!this.portrait || prefersReducedMotion()) {
      return;
    }
    for (let i = 0; i < 10; i++) {
      const heart = this.add
        .text(CX + Phaser.Math.Between(-90, 90), PORTRAIT_FEET_Y - 40, "♥", {
          fontFamily: CARD_FONT,
          fontSize: `${Phaser.Math.Between(16, 28)}px`,
          color: i % 2 ? "#ffb3c7" : "#ffd98a",
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: heart,
        y: heart.y - Phaser.Math.Between(80, 150),
        alpha: 0,
        duration: Phaser.Math.Between(600, 900),
        delay: i * 30,
        ease: "Cubic.easeOut",
        onComplete: () => heart.destroy(),
      });
    }
  }

  private wildLeaves(): void {
    if (this.portrait && !prefersReducedMotion()) {
      this.tweens.killTweensOf(this.portrait);
      this.tweens.add({ targets: this.portrait, x: this.portrait.x + 220, alpha: 0, duration: 420, ease: "Cubic.easeIn" });
    }
    this.time.delayedCall(1300, () => this.endEncounter());
  }

  private showResult(message: string): void {
    this.setMessage(message);
    this.time.delayedCall(1000, () => this.endEncounter());
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
        befriendMisses: this.befriendMisses,
        wildOpens: this.wildOpens,
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

function iconKey(id: string): string {
  return `icon:${id}`;
}

function offeringItemId(offering: BefriendOffering): string {
  return offering === "folk-seal" ? FOLK_SEAL_ID : FAVORITE_BAIT_ID;
}
