import Phaser from "phaser";
import {
  playBattleWinSfx,
  playFaintSfx,
  playHitPlayerSfx,
  playHitWildSfx,
  STRONG_HIT_DAMAGE,
} from "../audio/gameAudio";
import { getCreatureDefinition } from "../creatures/catalog";
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
import type { BattleCombatant, MoveDefinition } from "../creatures/types";
import {
  applyDamage,
  calcDamage,
  formatMatchupHint,
  isFainted,
  pickRandomMove,
  resolveAttack,
} from "../battle/battleLogic";
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

export class BattleScene extends Phaser.Scene {
  private wildCreatureId!: string;
  private wild!: BattleCombatant;
  private player!: BattleCombatant;
  private partyInstanceIndex = -1;
  /** Stable id for the active combatant; survives party UI reorders. */
  private partyInstanceId: string | null = null;
  private logText!: Phaser.GameObjects.Text;
  private playerHpText!: Phaser.GameObjects.Text;
  private wildHpText!: Phaser.GameObjects.Text;
  private wildSprite!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private wildHpBar!: Phaser.GameObjects.Rectangle;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private waitingForPlayer = true;
  private forcedSwitch = false;
  private switchMenuOpen = false;
  private wandererFallbackOpen = false;
  private usingArmedWanderer = false;
  private battleEnded = false;
  private godSparKillCheatBuffer = "";
  private tideSovereignTurnIndex = 0;
  private actionButtons: Phaser.GameObjects.Text[] = [];
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

    const wildDef = getCreatureDefinition(data.wildCreatureId);
    if (!wildDef.excludeFromCodex) {
      markCreatureDiscovered(data.wildCreatureId);
    }
    const wildLevel = getWildEffectiveLevel(data.wildCreatureId);
    const wildMaxHp = scaledStat(wildDef.maxHp, wildLevel);
    const wildAttack = scaledStat(wildDef.attack, wildLevel);
    this.wild = {
      name: wildDef.name,
      maxHp: wildMaxHp,
      currentHp: wildMaxHp,
      attack: wildAttack,
      defense: wildDef.defense,
      defenseDisabled: isGodCreature(data.wildCreatureId),
      moves: wildDef.moves,
      folkloreType: wildDef.folkloreType,
    };

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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      setPartyEditLocked(false);
    });
    this.scene.bringToTop();
    bindOverlayPixelRatio(this);
    ensureCreatureTextures(this);
    ensurePlayerAnims(this);
    this.cameras.main.fadeIn(140, 255, 255, 255);

    this.drawArena();

    const cx = DESIGN_SIZE / 2;

    this.add
      .text(cx, 40, "Training Spar", {
        color: "#fff7d8",
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
      })
      .setOrigin(0.5);

    this.wildSprite = fitDisplay(
      this.add
        .image(
          cx + 116,
          142,
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

    this.wildHpText = this.add.text(cx + 18, 72, "", {
      color: "#f0e6d2",
      fontFamily: "Source Sans 3, sans-serif",
      fontSize: "14px",
    });
    this.wildHpBar = this.add.rectangle(cx + 82, 96, 132, 8, 0x75b85a).setOrigin(0, 0.5);

    this.playerHpText = this.add.text(cx - 170, 186, "", {
      color: "#f0e6d2",
      fontFamily: "Source Sans 3, sans-serif",
      fontSize: "14px",
    });
    this.playerHpBar = this.add.rectangle(cx - 170, 210, 132, 8, 0x79acc8).setOrigin(0, 0.5);

    this.logText = this.add
      .text(cx, 286, "", {
        color: "#c8b8a0",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        align: "center",
        wordWrap: { width: 380 },
      })
      .setOrigin(0.5, 0);

    this.refreshHp();
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
      .text(cx, 318, tip, {
        color: "#ffe6a8",
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        align: "center",
        wordWrap: { width: 380 },
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
    // Normal kit 3–4 moves; shrine dual may be a one-time 5th slot.
    const moves = [...def.moves];
    if (partyCreature.secondaryMove) {
      moves.push(partyCreature.secondaryMove);
    }
    const trait = partyCreature.trait;
    return {
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
    };
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
    // Leave room for Story 2 hunter tip above the move list.
    let buttonY = this.matchupTeachText ? 368 : 300;

    if (!this.forcedSwitch) {
      for (const move of this.player.moves) {
        this.actionButtons.push(this.addMoveButton(cx, buttonY, move));
        buttonY += 38;
      }
    }

    if (this.hasSwitchablePartyMembers()) {
      this.actionButtons.push(
        this.addActionButton(cx, buttonY, "Switch", () => this.showSwitchMenu()),
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
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setAlpha(0.88));
    btn.on("pointerout", () => btn.setAlpha(1));
    btn.on("pointerdown", onClick);
    return btn;
  }

  private addMoveButton(
    x: number,
    y: number,
    move: MoveDefinition,
  ): Phaser.GameObjects.Text {
    const damage = calcDamage(this.player, move, this.wild);
    const label = `${move.name} [${move.type}] −${damage}`;
    const btn = this.add
      .text(x, y, label, {
        color: "#1a3040",
        backgroundColor: "#dff4ec",
        fontFamily: "Source Sans 3, system-ui, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        padding: { x: 14, y: 7 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setAlpha(0.88));
    btn.on("pointerout", () => btn.setAlpha(1));
    btn.on("pointerdown", () => {
      if (!this.waitingForPlayer || this.switchMenuOpen || this.wandererFallbackOpen) {
        return;
      }
      this.playerTurn(move);
    });
    return btn;
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
    this.log(`Go, ${this.player.name}!`);
    if (this.matchupTeachText) {
      this.showHunterMatchupTeachIfNeeded();
    }
    this.buildActionButtons();

    if (voluntarySwitch) {
      this.waitingForPlayer = false;
      this.time.delayedCall(500, () => this.wildTurn());
    } else {
      this.waitingForPlayer = true;
    }
  }

  private playerTurn(move: MoveDefinition): void {
    this.clearHunterMatchupTeach();
    this.waitingForPlayer = false;
    const outcome = resolveAttack(this.player, move, this.wild);
    if (outcome.kind === "miss") {
      this.log(`${this.player.name} used ${move.name} — missed!`);
    } else if (outcome.kind === "immune") {
      this.log(
        `${this.player.name} used ${move.name} — it had no effect${formatMatchupHint(outcome.matchup)}`,
      );
      this.showDamageCounter("wild", 0);
    } else {
      applyDamage(this.wild, outcome.damage);
      this.showDamageCounter("wild", outcome.damage);
      this.flashCombatant("wild", outcome.damage);
      this.log(
        `${this.player.name} used ${move.name}.${formatMatchupHint(outcome.matchup)}`,
      );
    }
    this.refreshHp();

    if (isFainted(this.wild)) {
      this.endBattle(true);
      return;
    }

    this.time.delayedCall(500, () => this.wildTurn());
  }

  private wildTurn(): void {
    if (this.battleEnded) {
      return;
    }
    if (this.wildCreatureId === TIDE_SOVEREIGN_ID) {
      const attack = getTideSovereignAttack(this.tideSovereignTurnIndex);
      this.tideSovereignTurnIndex += 1;
      applyDamage(this.player, attack.damage);
      this.showDamageCounter("player", attack.damage);
      this.flashCombatant("player", attack.damage);
      this.log(`${this.wild.name} used ${attack.move.name}.`);
    } else if (this.wildCreatureId === CAIRN_SOVEREIGN_ID) {
      const attack = getCairnSovereignAttack(this.tideSovereignTurnIndex);
      this.tideSovereignTurnIndex += 1;
      applyDamage(this.player, attack.damage);
      this.showDamageCounter("player", attack.damage);
      this.flashCombatant("player", attack.damage);
      this.log(`${this.wild.name} used ${attack.move.name}.`);
    } else {
      const move = pickRandomMove(this.wild);
      const outcome = resolveAttack(this.wild, move, this.player);
      if (outcome.kind === "miss") {
        this.log(`${this.wild.name} used ${move.name} — missed!`);
      } else if (outcome.kind === "immune") {
        this.log(
          `${this.wild.name} used ${move.name} — it had no effect${formatMatchupHint(outcome.matchup)}`,
        );
        this.showDamageCounter("player", 0);
      } else {
        applyDamage(this.player, outcome.damage);
        this.showDamageCounter("player", outcome.damage);
        this.flashCombatant("player", outcome.damage);
        this.log(
          `${this.wild.name} used ${move.name}.${formatMatchupHint(outcome.matchup)}`,
        );
      }
    }
    this.refreshHp();

    if (isFainted(this.player)) {
      playFaintSfx(this);
      this.syncActivePartyHp();
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
      return;
    }

    this.waitingForPlayer = true;
  }

  private refreshHp(): void {
    this.wildHpText.setText(
      `${this.wild.name}: ${this.wild.currentHp}/${this.wild.maxHp} HP`,
    );
    this.playerHpText.setText(
      `${this.player.name}: ${this.player.currentHp}/${this.player.maxHp} HP`,
    );
    this.wildHpBar.width = 132 * Math.max(0, this.wild.currentHp / this.wild.maxHp);
    this.playerHpBar.width =
      132 * Math.max(0, this.player.currentHp / this.player.maxHp);
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

  private showDamageCounter(
    target: "wild" | "player",
    damage: number,
  ): void {
    const anchor = target === "wild" ? this.wildHpText : this.playerHpText;
    const color = target === "wild" ? "#ff8866" : "#ffaa44";
    const counter = this.add
      .text(anchor.x + anchor.width + 8, anchor.y - 4, `−${damage}`, {
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
