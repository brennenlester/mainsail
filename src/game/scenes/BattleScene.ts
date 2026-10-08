import Phaser from "phaser";
import {
  playBattleWinSfx,
  playFaintSfx,
  playHitPlayerSfx,
  playHitWildSfx,
  STRONG_HIT_DAMAGE,
} from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
import type { MatchupResult } from "../creatures/folkloreTypes";
import {
  getActiveCreatures,
  getEffectiveAttack,
  getEffectiveMaxHp,
} from "../creatures/party";
import { hasPresenceGrowth, presenceTintForCreature } from "../shrine/presence";
import { ensureCreatureTextures } from "../creatures/sprites";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { hasWorldTexture, imagineTexture } from "../render/imagineAssets";
import {
  BATTLE_CREATURE_DISPLAY,
  BATTLE_PLAYER_DISPLAY,
  fitDisplay,
} from "../render/displaySizes";
import { bindOverlayPixelRatio, DESIGN_SIZE } from "../render/pixelRatio";
import { ensurePlayerAnims } from "../render/playerAnims";
import type {
  BattleCombatant,
  MoveDefinition,
  MoveRole,
} from "../creatures/types";
import {
  applyDamage,
  calcDamage,
  chooseEnemyIntent,
  effectiveAccuracy,
  executeMove,
  formatMatchupBadge,
  formatMatchupHint,
  getCooldown,
  getMatchup,
  isFainted,
  primeOpeningCooldowns,
  type MoveResult,
} from "../battle/battleLogic";
import {
  FINISHER_STATUS_BONUS,
  GUARD_DAMAGE_TAKEN,
  getBattleKit,
  moveRole,
} from "../battle/kits";
import {
  formatStatusChip,
  STATUS_DEFS,
  tickStatuses,
} from "../battle/statusEffects";
import {
  formatHunterMatchupTeach,
  isHunterMatchupTeachActive,
} from "../battle/hunterMatchupTeach";
import {
  formatRewardMessage,
  grantSparRewards,
} from "../battle/sparRewards";
import {
  buildArmedWanderer,
  getBestWeaponId,
  hasCraftedWeapon,
  resolveWandererForBattle,
  type WandererPartner,
} from "../battle/wandererWeapons";
import {
  appendGodSparKillCheatKey,
  formatGodClaimJoinLine,
  getTideSovereignAttack,
  isGodCreature,
  resolveTideSovereignOutcome,
  TIDE_SOVEREIGN_ID,
} from "../encounters/godSail";
import {
  CAIRN_SOVEREIGN_ID,
  getCairnSovereignAttack,
  resolveCairnSovereignOutcome,
} from "../encounters/godLand";
import { notifyWorldChanged } from "../world/worldSaveSchedule";
import { markCreatureDiscovered } from "../world/worldState";
import { SPAR_WILD_OPENING_TURNS } from "../encounters/encounterEconomy";
import { unlockCodexHud } from "../ui/hudChrome";
import { getWildEffectiveLevel } from "../progression/wildLevel";
import { scaledStat } from "../progression/leveling";
import { setPartyEditLocked } from "../ui/partyPanel";

type WandererPartnerData = WandererPartner;

const ROLE_STYLE: Readonly<
  Record<MoveRole, { letter: string; label: string; color: number; css: string }>
> = {
  attack: { letter: "A", label: "ATTACK", color: 0xe8d8a8, css: "#e8d8a8" },
  guard: { letter: "G", label: "GUARD", color: 0x7ec8e8, css: "#7ec8e8" },
  status: { letter: "S", label: "STATUS", color: 0xc49cff, css: "#c49cff" },
  finisher: { letter: "F", label: "FINISHER", color: 0xff7a5c, css: "#ff7a5c" },
};

const MATCHUP_COLOR: Readonly<Record<MatchupResult, string>> = {
  hunter: "#1f7a2a",
  neutral: "#7a2a1a",
  resisted: "#8a6a3a",
  immune: "#6a6a6a",
};

const HUD_FONT = "Source Sans 3, system-ui, sans-serif";
const HP_BAR_WIDTH = 176;
const HUD_PLATE_WIDTH = 236;

type HpHud = {
  name: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  chips: Phaser.GameObjects.Text[];
  chipX: number;
  chipY: number;
};

/** Intent shown for the enemy's next action (one turn ahead). */
type WildIntent = {
  move: MoveDefinition;
  role: MoveRole;
  /** Fixed sovereign pattern damage (before guard); undefined = rolled move. */
  fixedDamage?: number;
};

/** Modal menus draw above the battle HUD plates. */
function raiseOverlay(objects: Phaser.GameObjects.GameObject[]): void {
  for (const object of objects) {
    (object as unknown as Phaser.GameObjects.Components.Depth).setDepth(20);
  }
}

export class BattleScene extends Phaser.Scene {
  private wildCreatureId!: string;
  private wild!: BattleCombatant;
  private player!: BattleCombatant;
  private partyInstanceIndex = -1;
  /** Stable id for the active combatant; survives party UI reorders. */
  private partyInstanceId: string | null = null;
  private logText!: Phaser.GameObjects.Text;
  private wildHud!: HpHud;
  private playerHud!: HpHud;
  private wildSprite!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private wildLevel = 1;
  private intent: WildIntent | null = null;
  private intentObjects: Phaser.GameObjects.GameObject[] = [];
  /** First voluntary switch each battle costs no turn. */
  private freeSwitchAvailable = true;
  private rng: () => number = Math.random;
  private waitingForPlayer = true;
  private forcedSwitch = false;
  private switchMenuOpen = false;
  private wandererFallbackOpen = false;
  private usingArmedWanderer = false;
  private battleEnded = false;
  private godSparKillCheatBuffer = "";
  private tideSovereignTurnIndex = 0;
  private actionButtons: Phaser.GameObjects.GameObject[] = [];
  private switchMenuObjects: Phaser.GameObjects.GameObject[] = [];
  private wandererFallbackObjects: Phaser.GameObjects.GameObject[] = [];
  /** Story 2 pre-move hunter tip; cleared after the first move selection. */
  private matchupTeachText: Phaser.GameObjects.Text | null = null;
  // ponytail: temporary god-spar kill cheat
  private onGodSparKillCheatKeyDown = (event: KeyboardEvent) => {
    const result = appendGodSparKillCheatKey(
      this.godSparKillCheatBuffer,
      event.key,
    );
    this.godSparKillCheatBuffer = result.buffer;
    if (
      !result.triggered ||
      !isGodCreature(this.wildCreatureId) ||
      this.battleEnded
    ) {
      return;
    }

    this.wild.currentHp = 0;
    this.refreshHp();
    this.flashCombatant("wild", STRONG_HIT_DAMAGE);
    this.endBattle(true);
  };

  constructor() {
    super({ key: "BattleScene" });
  }

  init(data: {
    wildCreatureId: string;
    wandererPartner: WandererPartnerData;
  }): void {
    this.wildCreatureId = data.wildCreatureId;
    this.waitingForPlayer = true;
    this.partyInstanceIndex = -1;
    this.partyInstanceId = null;
    this.forcedSwitch = false;
    this.switchMenuOpen = false;
    this.wandererFallbackOpen = false;
    this.usingArmedWanderer = false;
    this.battleEnded = false;
    this.godSparKillCheatBuffer = "";
    this.tideSovereignTurnIndex = 0;
    this.actionButtons = [];
    this.switchMenuObjects = [];
    this.wandererFallbackObjects = [];
    this.intent = null;
    this.intentObjects = [];
    this.freeSwitchAvailable = true;
    this.rng = Math.random;

    const wildDef = getCreatureDefinition(data.wildCreatureId);
    if (!wildDef.excludeFromCodex) {
      markCreatureDiscovered(data.wildCreatureId);
    }
    const wildLevel = getWildEffectiveLevel(data.wildCreatureId);
    this.wildLevel = wildLevel;
    const wildMaxHp = scaledStat(wildDef.maxHp, wildLevel);
    const wildAttack = scaledStat(wildDef.attack, wildLevel);
    this.wild = primeOpeningCooldowns({
      name: wildDef.name,
      maxHp: wildMaxHp,
      currentHp: wildMaxHp,
      attack: wildAttack,
      defense: wildDef.defense,
      defenseDisabled: isGodCreature(data.wildCreatureId),
      moves: getBattleKit(wildDef),
      folkloreType: wildDef.folkloreType,
    });

    const actives = getActiveCreatures();
    const activeIndex = actives.findIndex((c) => c.currentHp > 0);
    const partyCreature =
      activeIndex >= 0 ? actives[activeIndex] : undefined;

    if (partyCreature) {
      this.partyInstanceIndex = activeIndex;
      this.partyInstanceId = partyCreature.instanceId;
      this.player = this.combatantFromPartyIndex(activeIndex);
    } else {
      const wanderer = resolveWandererForBattle(data.wandererPartner);
      this.usingArmedWanderer = hasCraftedWeapon();
      this.player = this.combatantFromWanderer(wanderer);
    }
  }

  /** Resolve active-party index for the bound combatant instance. */
  private resolvePartyIndex(): number {
    if (!this.partyInstanceId) {
      return -1;
    }
    const index = getActiveCreatures().findIndex(
      (c) => c.instanceId === this.partyInstanceId,
    );
    this.partyInstanceIndex = index;
    return index;
  }

  private combatantFromWanderer(wanderer: WandererPartnerData): BattleCombatant {
    return {
      name: wanderer.name,
      maxHp: wanderer.maxHp,
      currentHp: wanderer.maxHp,
      attack: wanderer.attack,
      defense: wanderer.defense,
      moves: wanderer.moves,
      folkloreType: wanderer.moves[0]?.type ?? "hearth",
    };
  }

  create(): void {
    setPartyEditLocked(true);
    // Quest card sits over the top-right of the board; hide it during spars.
    document.body.classList.add("battle-active");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      setPartyEditLocked(false);
      document.body.classList.remove("battle-active");
    });
    this.scene.bringToTop();
    bindOverlayPixelRatio(this);
    ensureCreatureTextures(this);
    ensurePlayerAnims(this);
    this.cameras.main.fadeIn(140, 255, 255, 255);

    this.drawArena();

    const cx = DESIGN_SIZE / 2;

    this.add
      .text(cx, 22, "Training Spar", {
        color: "#fff7d8",
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        stroke: "#1a2430",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.wildSprite = fitDisplay(
      this.add
        .image(
          cx + 116,
          150,
          ...resolveCreaturePoseTexture(
            this,
            getCreatureDefinition(this.wildCreatureId).spriteKey,
            "battle",
          ),
        )
        .setDepth(2),
      BATTLE_CREATURE_DISPLAY,
    );
    this.playerSprite = fitDisplay(
      this.add.image(cx - 118, 238, ...this.getPlayerSpriteTexture()).setDepth(2),
      this.getPlayerBattleDisplay(),
    );
    this.syncPlayerBattleFacing();
    this.syncPlayerPresenceTint();

    // Opponent plate top-left, player plate mid-right (clear of both sprites).
    this.wildHud = this.createHpHud(24, 48);
    this.playerHud = this.createHpHud(DESIGN_SIZE - 24 - HUD_PLATE_WIDTH, 222);

    this.add
      .rectangle(cx, 316, 580, 40, 0x101820, 0.78)
      .setStrokeStyle(1, 0x6eb8a8, 0.6)
      .setDepth(4);
    this.logText = this.add
      .text(cx, 316, "", {
        color: "#f4ecd8",
        fontFamily: HUD_FONT,
        fontSize: "14px",
        align: "center",
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.refreshHp();
    this.refreshIntent();
    // #336: SPAR_WILD_OPENING_TURNS 0 waits for the player's first strike.
    this.log(
      SPAR_WILD_OPENING_TURNS > 0
        ? `A training spar with ${this.wild.name} begins. The wild strikes first!`
        : `A training spar with ${this.wild.name} begins.`,
    );
    this.showHunterMatchupTeachIfNeeded();
    this.buildActionButtons();
    if (SPAR_WILD_OPENING_TURNS > 0) {
      this.waitingForPlayer = false;
      this.time.delayedCall(500, () => this.wildTurn());
    }
    this.input.keyboard?.on("keydown", this.onGodSparKillCheatKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onGodSparKillCheatKeyDown);
    });
  }

  private showHunterMatchupTeachIfNeeded(): void {
    if (!isHunterMatchupTeachActive()) {
      return;
    }
    const tip = formatHunterMatchupTeach(
      this.player.folkloreType,
      this.wild.folkloreType,
    );
    if (this.matchupTeachText) {
      this.matchupTeachText.setText(tip);
      return;
    }
    const cx = DESIGN_SIZE / 2;
    this.matchupTeachText = this.add
      .text(cx, 342, tip, {
        color: "#ffe6a8",
        backgroundColor: "#101820cc",
        fontFamily: HUD_FONT,
        fontSize: "13px",
        align: "center",
        padding: { x: 8, y: 3 },
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5, 0)
      .setDepth(5);
  }

  private clearHunterMatchupTeach(): void {
    this.matchupTeachText?.destroy();
    this.matchupTeachText = null;
  }

  private drawArena(): void {
    const w = DESIGN_SIZE;
    const h = DESIGN_SIZE;
    const hasImagine =
      hasWorldTexture(this, "arena-sky") &&
      hasWorldTexture(this, "arena-hills") &&
      hasWorldTexture(this, "arena-platform");

    if (hasImagine) {
      this.add
        .image(w / 2, h / 2, ...imagineTexture(this, "arena-sky"))
        .setDisplaySize(w, h)
        .setDepth(-12);
      this.add
        .image(w / 2, h / 2, ...imagineTexture(this, "arena-hills"))
        .setDisplaySize(w, h)
        .setDepth(-11);
      this.add
        .image(w / 2, h / 2, ...imagineTexture(this, "arena-platform"))
        .setDisplaySize(w, h)
        .setDepth(-10);
      return;
    }

    // Procedural fallback when Imagine arena layers are missing.
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(0x5da9c8, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0xffeaa0, 0.72);
    g.fillCircle(w * 0.74, 70, 48);
    g.fillStyle(0xd6f5e0, 0.48);
    g.fillEllipse(w * 0.3, 92, 150, 34);
    g.fillStyle(0x4f9a6e, 1);
    for (let x = -40; x < w + 50; x += 54) {
      g.fillTriangle(x, 300, x + 28, 190 + ((x / 54) % 2) * 22, x + 56, 300);
    }
    g.fillStyle(0xa5d87d, 0.9);
    g.fillEllipse(w / 2, 244, w * 0.82, 82);
    g.fillStyle(0xe5f1ad, 0.75);
    g.fillEllipse(w / 2, 244, w * 0.58, 44);
    g.lineStyle(3, 0x3d8b76, 0.55);
    g.strokeEllipse(w / 2, 244, w * 0.74, 62);
  }

  private getPlayerSpriteTexture(): [string, string | undefined] {
    if (this.resolvePartyIndex() < 0) {
      return imagineTexture(this, "player-south-0");
    }
    const spriteKey = getCreatureDefinition(
      getActiveCreatures()[this.partyInstanceIndex].definitionId,
    ).spriteKey;
    return resolveCreaturePoseTexture(this, spriteKey, "battle");
  }

  /** Party creatures sit on the left; flip battle crops to face the opponent. */
  private syncPlayerBattleFacing(): void {
    this.playerSprite.setFlipX(this.resolvePartyIndex() >= 0);
  }

  private syncPlayerPresenceTint(): void {
    const index = this.resolvePartyIndex();
    if (index < 0) {
      this.playerSprite.clearTint();
      return;
    }
    const creature = getActiveCreatures()[index];
    if (creature && hasPresenceGrowth(creature)) {
      this.playerSprite.setTint(presenceTintForCreature(creature));
    } else {
      this.playerSprite.clearTint();
    }
  }

  private getPlayerBattleDisplay(): {
    width: number;
    height: number;
  } {
    return this.resolvePartyIndex() < 0
      ? BATTLE_PLAYER_DISPLAY
      : BATTLE_CREATURE_DISPLAY;
  }

  private combatantFromPartyIndex(index: number): BattleCombatant {
    const partyCreature = getActiveCreatures()[index];
    const def = getCreatureDefinition(partyCreature.definitionId);
    // 4-slot role kit; shrine dual may be a one-time 5th slot.
    const moves = getBattleKit(def);
    if (partyCreature.secondaryMove) {
      moves.push(partyCreature.secondaryMove);
    }
    const trait = partyCreature.trait;
    return primeOpeningCooldowns({
      name: def.name,
      maxHp: getEffectiveMaxHp(partyCreature),
      currentHp: partyCreature.currentHp,
      attack: getEffectiveAttack(partyCreature),
      defense: def.defense,
      moves,
      folkloreType: def.folkloreType,
      immunityTo: trait?.kind === "immunity" ? trait.to : undefined,
      damageBuff:
        trait?.kind === "damage-buff"
          ? { moveId: trait.moveId, multiplier: trait.multiplier }
          : undefined,
    });
  }

  private syncActivePartyHp(): void {
    const index = this.resolvePartyIndex();
    if (index < 0) {
      return;
    }
    const partyCreature = getActiveCreatures()[index];
    if (partyCreature) {
      partyCreature.currentHp = this.player.currentHp;
    }
  }

  private hasSwitchablePartyMembers(): boolean {
    const currentIndex = this.resolvePartyIndex();
    return getActiveCreatures().some(
      (creature, index) =>
        index !== currentIndex && creature.currentHp > 0,
    );
  }

  private clearActionButtons(): void {
    for (const button of this.actionButtons) {
      button.destroy();
    }
    this.actionButtons = [];
  }

  private buildActionButtons(): void {
    this.clearActionButtons();
    this.hideSwitchMenu();
    this.hideWandererFallbackMenu();

    const cx = DESIGN_SIZE / 2;
    // 2-column move grid below the log (and the Story 2 hunter tip).
    const top = 410;
    const colOffset = 146;
    const rowStep = 54;
    let buttonY = top;

    if (!this.forcedSwitch) {
      this.player.moves.forEach((move, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = this.player.moves.length === 1 ? cx : cx + (col === 0 ? -colOffset : colOffset);
        this.actionButtons.push(...this.addMoveButton(x, top + row * rowStep, move));
      });
      buttonY = top + Math.ceil(this.player.moves.length / 2) * rowStep;
    }

    if (this.hasSwitchablePartyMembers()) {
      const label =
        this.freeSwitchAvailable && !this.forcedSwitch
          ? "Switch (free this battle)"
          : "Switch";
      this.actionButtons.push(
        this.addActionButton(cx, buttonY - 4, label, () => this.showSwitchMenu()),
      );
    }
  }

  private addActionButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        color: "#1a3040",
        backgroundColor: "#dff4ec",
        fontFamily: "Source Sans 3, system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        padding: { x: 18, y: 9 },
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setAlpha(0.88));
    btn.on("pointerout", () => btn.setAlpha(1));
    btn.on("pointerdown", onClick);
    return btn;
  }

  /** Two-line move card: name + effect on top, role · type · matchup · cooldown below. */
  private addMoveButton(
    x: number,
    y: number,
    move: MoveDefinition,
  ): Phaser.GameObjects.GameObject[] {
    const role = moveRole(move);
    const style = ROLE_STYLE[role];
    const cooldown = getCooldown(this.player, move.id);
    const ready = cooldown <= 0;
    const width = 280;
    const height = 46;

    const bg = this.add
      .rectangle(x, y, width, height, ready ? 0xf3fbf6 : 0xb9c2c6, 1)
      .setStrokeStyle(2, ready ? style.color : 0x8a959a)
      .setDepth(6);
    const stripe = this.add
      .rectangle(x - width / 2 + 3, y, 6, height - 4, ready ? style.color : 0x8a959a)
      .setDepth(7);

    const matchup = move.power > 0 ? getMatchup(move, this.wild) : "neutral";
    const effect = this.formatMoveEffect(move);
    const title = this.add
      .text(x - width / 2 + 14, y - 11, move.name, {
        color: ready ? "#1a3040" : "#5a6468",
        fontFamily: HUD_FONT,
        fontSize: "15px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(7);
    const effectText = this.add
      .text(x + width / 2 - 10, y - 11, effect, {
        color: ready ? MATCHUP_COLOR[matchup] : "#5a6468",
        fontFamily: HUD_FONT,
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5)
      .setDepth(7);

    const details = [style.label, move.type];
    if (move.power > 0) {
      const accuracy = effectiveAccuracy(this.player, move);
      if (accuracy < 100) {
        details.push(`${accuracy}%`);
      }
    }
    if (move.inflicts) {
      details.push(`→ ${STATUS_DEFS[move.inflicts].label}`);
    }
    if (role === "finisher") {
      details.push(`×${FINISHER_STATUS_BONUS} vs status`);
    }
    if (!ready) {
      details.push(`ready in ${cooldown}`);
    } else if (move.cooldown) {
      details.push(`cd ${move.cooldown}`);
    }
    const sub = this.add
      .text(x - width / 2 + 14, y + 11, details.join(" · "), {
        color: ready ? "#4a6070" : "#5a6468",
        fontFamily: HUD_FONT,
        fontSize: "11px",
      })
      .setOrigin(0, 0.5)
      .setDepth(7);

    if (ready) {
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerover", () => bg.setFillStyle(0xdff4ec));
      bg.on("pointerout", () => bg.setFillStyle(0xf3fbf6));
      bg.on("pointerdown", () => {
        if (!this.waitingForPlayer || this.switchMenuOpen || this.wandererFallbackOpen) {
          return;
        }
        this.playerTurn(move);
      });
    }
    return [bg, stripe, title, effectText, sub];
  }

  /** Top-right of a move card: "−12", "Guard +4 HP", "immune". */
  private formatMoveEffect(move: MoveDefinition): string {
    if (moveRole(move) === "guard") {
      const heal = move.heal
        ? Math.min(
            this.player.maxHp - this.player.currentHp,
            Math.max(1, Math.round(this.player.maxHp * move.heal)),
          )
        : 0;
      const pct = Math.round((1 - GUARD_DAMAGE_TAKEN) * 100);
      return heal > 0 ? `−${pct}% hit · +${heal} HP` : `−${pct}% next hit`;
    }
    if (move.power <= 0) {
      return "";
    }
    const matchup = getMatchup(move, this.wild);
    if (matchup === "immune") {
      return "immune";
    }
    const badge = formatMatchupBadge(matchup);
    return `−${calcDamage(this.player, move, this.wild)}${badge ? `  ${badge}` : ""}`;
  }

  private showSwitchMenu(): void {
    if (!this.waitingForPlayer || this.switchMenuOpen) {
      return;
    }

    this.switchMenuOpen = true;
    const cx = DESIGN_SIZE / 2;
    const panelY = DESIGN_SIZE / 2;

    const panel = this.add
      .rectangle(cx, panelY, 320, 280, 0xfff8ec, 0.98)
      .setStrokeStyle(3, 0x6eb8a8);
    this.switchMenuObjects.push(panel);

    const title = this.add
      .text(cx, panelY - 120, "Choose a creature", {
        color: "#2a4050",
        fontFamily: "Source Sans 3, system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.switchMenuObjects.push(title);

    let rowY = panelY - 85;
    const actives = getActiveCreatures();
    const currentIndex = this.resolvePartyIndex();
    for (let index = 0; index < actives.length; index++) {
      const creature = actives[index];
      const def = getCreatureDefinition(creature.definitionId);
      const isActive = index === currentIndex;
      const fainted = creature.currentHp <= 0;
      const maxHp = getEffectiveMaxHp(creature);
      const label = fainted
        ? `${def.name} Lv.${creature.level} (fainted)`
        : isActive
          ? `${def.name} Lv.${creature.level} (active)`
          : `${def.name} Lv.${creature.level} (${creature.currentHp}/${maxHp} HP)`;

      const btn = this.add
        .text(cx, rowY, label, {
          color: fainted || isActive ? "#7a8890" : "#1a3040",
          backgroundColor: fainted || isActive ? "#d8e0e4" : "#c8efe0",
          fontFamily: "Source Sans 3, system-ui, sans-serif",
          fontSize: "13px",
          padding: { x: 10, y: 4 },
        })
        .setOrigin(0.5);

      if (!fainted && !isActive) {
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", () => this.switchToPartyIndex(index));
      }

      this.switchMenuObjects.push(btn);
      rowY += 30;
    }

    const cancel = this.add
      .text(cx, panelY + 120, "Cancel", {
        color: "#1a3040",
        backgroundColor: "#f0d8a8",
        fontFamily: "Source Sans 3, system-ui, sans-serif",
        fontSize: "14px",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    cancel.on("pointerdown", () => {
      if (this.forcedSwitch) {
        return;
      }
      this.hideSwitchMenu();
    });
    this.switchMenuObjects.push(cancel);
    raiseOverlay(this.switchMenuObjects);
  }

  private hideSwitchMenu(): void {
    for (const object of this.switchMenuObjects) {
      object.destroy();
    }
    this.switchMenuObjects = [];
    this.switchMenuOpen = false;
  }

  private showWandererFallbackMenu(): void {
    if (this.wandererFallbackOpen) {
      return;
    }

    this.wandererFallbackOpen = true;
    const cx = DESIGN_SIZE / 2;
    const panelY = DESIGN_SIZE / 2;
    const weaponId = getBestWeaponId();
    const armed = weaponId ? buildArmedWanderer(weaponId) : undefined;

    const panel = this.add
      .rectangle(cx, panelY, 340, 180, 0xfff8ec, 0.98)
      .setStrokeStyle(3, 0x6eb8a8);
    this.wandererFallbackObjects.push(panel);

    const title = this.add
      .text(cx, panelY - 50, "Your party has fainted!", {
        color: "#2a4050",
        fontFamily: "Source Sans 3, system-ui, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.wandererFallbackObjects.push(title);

    const subtitle = this.add
      .text(
        cx,
        panelY - 20,
        armed ? `Fight as ${armed.name}?` : "No weapon available.",
        {
          color: "#5a7888",
          fontFamily: "Source Sans 3, system-ui, sans-serif",
          fontSize: "14px",
          align: "center",
          wordWrap: { width: 300 },
        },
      )
      .setOrigin(0.5);
    this.wandererFallbackObjects.push(subtitle);

    if (armed) {
      const fight = this.add
        .text(cx, panelY + 30, "Fight as Wanderer", {
          color: "#1a3040",
          backgroundColor: "#7ec8e8",
          fontFamily: "Source Sans 3, system-ui, sans-serif",
          fontSize: "16px",
          fontStyle: "bold",
          padding: { x: 16, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      fight.on("pointerdown", () => this.switchToArmedWanderer());
      this.wandererFallbackObjects.push(fight);
    }

    const retreat = this.add
      .text(cx, panelY + 70, "Retreat", {
        color: "#1a3040",
        backgroundColor: "#f0d8a8",
        fontFamily: "Source Sans 3, system-ui, sans-serif",
        fontSize: "14px",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    retreat.on("pointerdown", () => this.endBattle(false));
    this.wandererFallbackObjects.push(retreat);
    raiseOverlay(this.wandererFallbackObjects);
  }

  private hideWandererFallbackMenu(): void {
    for (const object of this.wandererFallbackObjects) {
      object.destroy();
    }
    this.wandererFallbackObjects = [];
    this.wandererFallbackOpen = false;
  }

  private switchToArmedWanderer(): void {
    const weaponId = getBestWeaponId();
    if (!weaponId) {
      this.endBattle(false);
      return;
    }

    this.syncActivePartyHp();
    this.partyInstanceIndex = -1;
    this.partyInstanceId = null;
    this.usingArmedWanderer = true;
    this.forcedSwitch = false;
    this.player = this.combatantFromWanderer(buildArmedWanderer(weaponId));
    this.hideWandererFallbackMenu();
    this.refreshHp();
    this.playerSprite.setTexture(...this.getPlayerSpriteTexture());
    fitDisplay(this.playerSprite, this.getPlayerBattleDisplay());
    this.syncPlayerBattleFacing();
    this.syncPlayerPresenceTint();
    this.log(`${this.player.name} steps up to fight!`);
    if (this.matchupTeachText) {
      this.showHunterMatchupTeachIfNeeded();
    }
    this.buildActionButtons();
    this.refreshIntent();
    this.waitingForPlayer = true;
  }

  private switchToPartyIndex(index: number): void {
    const creature = getActiveCreatures()[index];
    if (
      !creature ||
      index === this.partyInstanceIndex ||
      creature.currentHp <= 0
    ) {
      return;
    }

    const voluntarySwitch = !this.forcedSwitch;
    this.syncActivePartyHp();
    this.partyInstanceIndex = index;
    this.partyInstanceId = creature.instanceId;
    this.player = this.combatantFromPartyIndex(index);
    this.forcedSwitch = false;
    this.hideSwitchMenu();
    this.refreshHp();
    this.playerSprite.setTexture(...this.getPlayerSpriteTexture());
    fitDisplay(this.playerSprite, this.getPlayerBattleDisplay());
    this.syncPlayerBattleFacing();
    this.syncPlayerPresenceTint();
    const freeSwitch = voluntarySwitch && this.freeSwitchAvailable;
    if (freeSwitch) {
      this.freeSwitchAvailable = false;
    }
    this.log(
      freeSwitch
        ? `Go, ${this.player.name}! (free switch — no turn spent)`
        : `Go, ${this.player.name}!`,
    );
    if (this.matchupTeachText) {
      this.showHunterMatchupTeachIfNeeded();
    }
    this.buildActionButtons();

    if (voluntarySwitch && !freeSwitch) {
      // The telegraphed move still lands — on the new creature.
      this.renderIntent();
      this.waitingForPlayer = false;
      this.time.delayedCall(500, () => this.wildTurn());
    } else if (freeSwitch) {
      this.renderIntent();
      this.waitingForPlayer = true;
    } else {
      // Replacement after a faint: the foe re-reads the new matchup.
      this.refreshIntent();
      this.waitingForPlayer = true;
    }
  }

  private playerTurn(move: MoveDefinition): void {
    this.clearHunterMatchupTeach();
    this.waitingForPlayer = false;
    const result = executeMove(this.player, move, this.wild, this.rng);
    let message = this.describeMove(this.player, this.wild, result, "wild");
    if (isFainted(this.wild)) {
      this.refreshHp();
      this.log(message);
      this.endBattle(true);
      return;
    }
    message += this.tickEndOfTurn(this.player, "player");
    this.log(message);
    this.refreshHp();
    this.buildActionButtons();
    this.renderIntent();

    if (isFainted(this.player)) {
      this.handlePlayerFainted();
      return;
    }

    this.time.delayedCall(700, () => this.wildTurn());
  }

  private wildTurn(): void {
    if (this.battleEnded) {
      return;
    }
    const intent = this.intent ?? this.pickIntent();
    let message: string;
    if (intent.fixedDamage !== undefined) {
      // Sovereign pattern: fixed damage, still softened by a guard.
      this.tideSovereignTurnIndex += 1;
      const guarded = this.player.guarding === true;
      const damage = guarded
        ? Math.max(1, Math.round(intent.fixedDamage * GUARD_DAMAGE_TAKEN))
        : intent.fixedDamage;
      applyDamage(this.player, damage);
      this.showFloat("player", `−${damage}`, "#ffaa44");
      this.flashCombatant("player", damage);
      message = `${this.wild.name} used ${intent.move.name}${guarded ? " — guarded!" : "."}`;
    } else {
      const result = executeMove(this.wild, intent.move, this.player, this.rng);
      message = this.describeMove(this.wild, this.player, result, "player");
    }
    // A guard lasts until the guarding creature's next turn.
    this.player.guarding = false;
    message += this.tickEndOfTurn(this.wild, "wild");
    this.log(message);
    this.refreshHp();

    if (isFainted(this.wild)) {
      this.endBattle(true);
      return;
    }
    if (isFainted(this.player)) {
      this.handlePlayerFainted();
      return;
    }

    this.refreshIntent();
    this.buildActionButtons();
    this.waitingForPlayer = true;
  }

  private handlePlayerFainted(): void {
    playFaintSfx(this);
    this.syncActivePartyHp();
    this.clearIntent();
    if (this.hasSwitchablePartyMembers()) {
      this.forcedSwitch = true;
      this.waitingForPlayer = true;
      this.log(`${this.player.name} fainted! Choose a replacement.`);
      this.buildActionButtons();
      this.showSwitchMenu();
      return;
    }
    if (!this.usingArmedWanderer && hasCraftedWeapon()) {
      this.forcedSwitch = true;
      this.waitingForPlayer = true;
      this.log(`${this.player.name} fainted!`);
      this.buildActionButtons();
      this.showWandererFallbackMenu();
      return;
    }
    this.endBattle(false);
  }

  /** One log sentence for a resolved move; also spawns hit / heal floats. */
  private describeMove(
    user: BattleCombatant,
    target: BattleCombatant,
    result: MoveResult,
    targetSide: "wild" | "player",
  ): string {
    const userSide = targetSide === "wild" ? "player" : "wild";
    let line = `${user.name} used ${result.move.name}`;
    const attack = result.attack;
    if (result.guarded) {
      line += result.healed > 0 ? ` — guarding, +${result.healed} HP.` : " — guarding.";
      if (result.healed > 0) {
        this.showFloat(userSide, `+${result.healed}`, "#8fe88a");
      }
    } else if (attack?.kind === "miss") {
      line += " — missed!";
    } else if (attack?.kind === "immune") {
      line += ` — it had no effect${formatMatchupHint(attack.matchup)}`;
      this.showFloat(targetSide, "−0", targetSide === "wild" ? "#ff8866" : "#ffaa44");
    } else if (attack?.kind === "hit") {
      line += `.${formatMatchupHint(attack.matchup)}`;
      this.showFloat(
        targetSide,
        `−${attack.damage}`,
        targetSide === "wild" ? "#ff8866" : "#ffaa44",
      );
      this.flashCombatant(targetSide, attack.damage);
    } else {
      line += ".";
    }

    const status = result.status;
    if (status) {
      const label = STATUS_DEFS[status.id].label;
      if (status.kind === "applied") {
        line += ` ${target.name} is ${label}!`;
      } else if (status.kind === "refreshed") {
        line += ` ${label} renewed.`;
      } else if (status.kind === "doused") {
        line += ` ${target.name} is too soaked to burn.`;
      } else {
        line += ` ${target.name} shrugs off ${label}.`;
      }
    }
    return line;
  }

  /** Burn ticks + status countdown at the end of `who`'s own turn. */
  private tickEndOfTurn(who: BattleCombatant, side: "wild" | "player"): string {
    const tick = tickStatuses(who);
    let line = "";
    if (tick.burnDamage > 0) {
      this.showFloat(side, `−${tick.burnDamage}`, "#ff8a4c");
      line += ` ${who.name} burns for ${tick.burnDamage}.`;
    }
    for (const id of tick.expired) {
      line += ` ${STATUS_DEFS[id].label} wore off.`;
    }
    return line;
  }

  // --- Enemy intent (telegraphed one turn ahead) ---------------------------

  private pickIntent(): WildIntent {
    const pattern =
      this.wildCreatureId === TIDE_SOVEREIGN_ID
        ? getTideSovereignAttack(this.tideSovereignTurnIndex)
        : this.wildCreatureId === CAIRN_SOVEREIGN_ID
          ? getCairnSovereignAttack(this.tideSovereignTurnIndex)
          : null;
    if (pattern) {
      // Sovereign crown blows (20+) read as finishers so players learn to guard them.
      return {
        move: pattern.move,
        role: pattern.damage >= 20 ? "finisher" : "attack",
        fixedDamage: pattern.damage,
      };
    }
    const { move } = chooseEnemyIntent(this.wild, this.player, this.rng);
    return { move, role: moveRole(move) };
  }

  private refreshIntent(): void {
    this.intent = this.pickIntent();
    this.renderIntent();
  }

  private clearIntent(): void {
    for (const object of this.intentObjects) {
      object.destroy();
    }
    this.intentObjects = [];
  }

  /** Plate above the foe: role badge + "Next: Ram −14 ×1.5". */
  private renderIntent(): void {
    this.clearIntent();
    if (!this.intent || this.battleEnded) {
      return;
    }
    const { move, role, fixedDamage } = this.intent;
    const style = ROLE_STYLE[role];
    let detail = "";
    if (role === "guard") {
      const pct = Math.round((1 - GUARD_DAMAGE_TAKEN) * 100);
      detail = `blocks ${pct}% of your next hit`;
    } else {
      const matchup = getMatchup(move, this.player);
      const damage =
        fixedDamage ??
        (matchup === "immune"
          ? 0
          : calcDamage(this.wild, move, { ...this.player, guarding: false }));
      const badge = formatMatchupBadge(matchup);
      detail = `−${damage}${badge ? ` ${badge}` : ""}`;
      if (move.inflicts) {
        detail += ` → ${STATUS_DEFS[move.inflicts].label}`;
      }
    }

    const y = 62;
    const badge = this.add
      .text(0, y, style.label, {
        color: "#101820",
        backgroundColor: style.css,
        fontFamily: HUD_FONT,
        fontSize: "11px",
        fontStyle: "bold",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0, 0.5)
      .setDepth(8);
    const text = this.add
      .text(0, y, `Next: ${move.name}  ${detail}`, {
        color: "#fff7e0",
        fontFamily: HUD_FONT,
        fontSize: "13px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(8);
    const gap = 6;
    const contentWidth = badge.width + gap + text.width;
    const centerX = Phaser.Math.Clamp(
      this.wildSprite.x,
      contentWidth / 2 + 16,
      DESIGN_SIZE - contentWidth / 2 - 16,
    );
    const left = centerX - contentWidth / 2;
    badge.setX(left);
    text.setX(left + badge.width + gap);
    const plate = this.add
      .rectangle(centerX, y, contentWidth + 16, 26, 0x101820, 0.86)
      .setStrokeStyle(role === "finisher" ? 2 : 1, style.color, 0.9)
      .setDepth(7);
    this.intentObjects.push(plate, badge, text);

    if (role === "finisher") {
      this.tweens.add({
        targets: plate,
        alpha: { from: 1, to: 0.55 },
        duration: 520,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  // --- HP / status plates ---------------------------------------------------

  private createHpHud(x: number, y: number): HpHud {
    this.add
      .rectangle(x, y, HUD_PLATE_WIDTH, 66, 0x101820, 0.82)
      .setOrigin(0)
      .setStrokeStyle(1, 0x6eb8a8, 0.7)
      .setDepth(4);
    const name = this.add
      .text(x + 10, y + 6, "", {
        color: "#fff7e0",
        fontFamily: HUD_FONT,
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setDepth(5);
    this.add
      .rectangle(x + 10, y + 34, HP_BAR_WIDTH, 10, 0x2a343c, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x000000, 0.6)
      .setDepth(5);
    const bar = this.add
      .rectangle(x + 10, y + 34, HP_BAR_WIDTH, 10, 0x6cd86a, 1)
      .setOrigin(0, 0.5)
      .setDepth(6);
    const hp = this.add
      .text(x + HUD_PLATE_WIDTH - 10, y + 34, "", {
        color: "#f0e6d2",
        fontFamily: HUD_FONT,
        fontSize: "12px",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5)
      .setDepth(5);
    return { name, hp, bar, chips: [], chipX: x + 10, chipY: y + 54 };
  }

  private syncHpHud(hud: HpHud, who: BattleCombatant, level: number | null): void {
    hud.name.setText(
      `${who.name}${level !== null ? `  Lv ${level}` : ""}  ·  ${who.folkloreType}`,
    );
    const ratio = Math.max(0, who.currentHp / who.maxHp);
    hud.bar.width = HP_BAR_WIDTH * ratio;
    hud.bar.setFillStyle(ratio > 0.5 ? 0x6cd86a : ratio > 0.25 ? 0xf2c94c : 0xeb5757);
    hud.hp.setText(`${who.currentHp}/${who.maxHp}`);

    for (const chip of hud.chips) {
      chip.destroy();
    }
    hud.chips = [];
    let x = hud.chipX;
    const chips: { text: string; color: string }[] = (who.statuses ?? [])
      .filter((s) => s.turns > 0)
      .map((s) => ({ text: formatStatusChip(s.id, s.turns), color: STATUS_DEFS[s.id].color }));
    if (who.guarding) {
      chips.push({ text: "GUARD", color: ROLE_STYLE.guard.css });
    }
    for (const chip of chips) {
      const t = this.add
        .text(x, hud.chipY, chip.text, {
          color: "#101820",
          backgroundColor: chip.color,
          fontFamily: HUD_FONT,
          fontSize: "10px",
          fontStyle: "bold",
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0, 0.5)
        .setDepth(6);
      hud.chips.push(t);
      x += t.width + 4;
    }
  }

  private refreshHp(): void {
    const partyIndex = this.resolvePartyIndex();
    const playerLevel =
      partyIndex >= 0 ? getActiveCreatures()[partyIndex]?.level ?? null : null;
    this.syncHpHud(this.wildHud, this.wild, this.wildLevel);
    this.syncHpHud(this.playerHud, this.player, playerLevel);
  }

  private flashCombatant(target: "wild" | "player", damage: number): void {
    if (target === "wild") {
      playHitWildSfx(this, damage);
    } else {
      playHitPlayerSfx(this, damage);
    }
    const sprite = target === "wild" ? this.wildSprite : this.playerSprite;
    const strong = damage >= STRONG_HIT_DAMAGE;
    // Wild (outgoing) = coral; player (incoming) = amber — distinguishable without the log.
    const tint = target === "wild" ? (strong ? 0xff6644 : 0xffd9d2) : strong ? 0xffaa22 : 0xffe0a8;
    const shakeMs = strong ? 220 : 120;
    const shakeAmp = strong ? 0.01 : 0.004;
    sprite.setTintFill(tint);
    this.cameras.main.shake(shakeMs, shakeAmp);
    this.time.delayedCall(shakeMs, () => sprite.clearTint());
  }

  /** Floating number over a combatant ("−12", "+4"). */
  private showFloat(target: "wild" | "player", label: string, color: string): void {
    const sprite = target === "wild" ? this.wildSprite : this.playerSprite;
    const counter = this.add
      .text(sprite.x + 34, sprite.y - 48, label, {
        color,
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        stroke: "#1a1a2e",
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5)
      .setDepth(10_000);

    this.tweens.add({
      targets: counter,
      y: counter.y - 36,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => counter.destroy(),
    });
  }

  private log(message: string): void {
    this.logText.setText(message);
  }

  private endBattle(playerWon: boolean): void {
    unlockCodexHud();
    if (this.battleEnded) {
      return;
    }
    this.battleEnded = true;
    this.waitingForPlayer = false;
    this.clearIntent();
    this.clearHunterMatchupTeach();
    this.hideSwitchMenu();
    this.hideWandererFallbackMenu();
    this.syncActivePartyHp();

    if (playerWon) {
      playFaintSfx(this);
      playBattleWinSfx(this);
    }

    if (playerWon && this.wildCreatureId === TIDE_SOVEREIGN_ID) {
      const result = resolveTideSovereignOutcome("spar-win");
      if (result) {
        this.log(
          formatGodClaimJoinLine(
            "Tide Sovereign",
            "Tide Cleaver",
            result,
            true,
            "Tide Crown",
          ),
        );
      }
    } else if (playerWon && this.wildCreatureId === CAIRN_SOVEREIGN_ID) {
      const result = resolveCairnSovereignOutcome("spar-win");
      if (result) {
        this.log(
          formatGodClaimJoinLine(
            "Stone Sovereign",
            "Cairn Maul",
            result,
            true,
            "Boulder Crown",
          ),
        );
      }
    } else if (playerWon) {
      const reward = grantSparRewards(
        this.wildCreatureId,
        this.resolvePartyIndex(),
      );
      this.log(formatRewardMessage(reward));
    } else {
      this.log("You lost the training spar...");
    }
    notifyWorldChanged();

    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(140, 255, 255, 255);
      this.time.delayedCall(145, () => {
        this.scene.stop("BattleScene");
        this.scene.stop("EncounterScene");
        this.scene.resume("IsometricScene");
      });
    });
  }
}
