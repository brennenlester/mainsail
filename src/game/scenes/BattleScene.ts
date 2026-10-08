import { displayNameMarked } from "../creatures/displayName";
import { refreshPartyStatusLine } from "../ui/statusPanel";
import Phaser from "phaser";
import {
  playBattleWinSfx,
  playFaintSfx,
  playGuardSfx,
  playHitPlayerSfx,
  playHitWildSfx,
  playMoveTypeSfx,
  preloadStoryAudio,
  setBattleTheme,
  STRONG_HIT_DAMAGE,
} from "../audio/gameAudio";
import { describeAssist, StoryBattle } from "../battle/boss/storyBattle";
import {
  preloadStoryArena,
  STORY_INTENT_Y,
  storyArenaVariant,
  StoryBattleUi,
} from "../battle/boss/storyBattleUi";
import { reportStoryBattleResult, type StoryBattleInit } from "../battle/storySpar";
import type { BossForm } from "../story/storySpars";
import { getStorySpar } from "../story/storySpars";
import { getActiveQuestId } from "../story/questProgress";
import { MAX_LEVEL } from "../progression/leveling";
import { hideOpeningCaption } from "../opening/openingCaption";
import { BattleFx, type Side } from "../battle/vfx/battleFx";
import {
  fastBattleEnabled,
  fastBattleLabel,
  intentGlow,
  setFastBattleEnabled,
} from "../battle/vfx/battleTiming";
import { damageNumberStyle } from "../battle/vfx/damageNumbers";
import {
  setTouchHitArea,
  showBattleResultPanel,
  type ResultPanelOptions,
} from "../battle/vfx/battleResultPanel";
import {
  buildVictorySummary,
  type PartySnapshotEntry,
} from "../battle/vfx/victorySummary";
import { getMaterialName } from "../inventory/materials";
import { getCreatureDefinition } from "../creatures/catalog";
import type { MatchupResult } from "../creatures/folkloreTypes";
import {
  addToParty,
  getActiveCreatures,
  getEffectiveAttack,
  getEffectiveMaxHp,
  hasCreature,
} from "../creatures/party";
import { hasPresenceGrowth, presenceTintForCreature } from "../shrine/presence";
import { ensureCreatureTextures } from "../creatures/sprites";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { resolveArenaLayers } from "../render/arenaLayers";
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
  previewFixedDamage,
  primeOpeningCooldowns,
  outleveledWildBulk,
  resolveFixedAttack,
  wildBattleTuning,
  type MoveResult,
} from "../battle/battleLogic";
import {
  FINISHER_STATUS_BONUS,
  GUARD_DAMAGE_TAKEN,
  GUARD_FINISHER_DAMAGE_TAKEN,
  getBattleKit,
  moveRole,
} from "../battle/kits";
import {
  canApplyStatus,
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
  ASSURED_BEFRIEND_LABEL,
  formatGodClaimJoinLine,
  getTideSovereignAttack,
  isGodCreature,
  isStory1BefriendGuaranteed,
  resolveTideSovereignOutcome,
  rollBefriendAttempt,
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
import { getPartyAverageLevel, getWildEffectiveLevel } from "../progression/wildLevel";
import { scaledStat } from "../progression/leveling";
import { setPartyEditLocked } from "../ui/partyPanel";
import { applyBondToCombatant } from "../companions/bond";
import {
  afterBefriendMiss,
  battleBefriendAllowed,
  befriendMissLine,
  formatBefriendBreakdown,
  formatBefriendOddsLabel,
  offeringLabel,
  type BefriendOdds,
} from "../encounters/befriendChance";
import {
  befriendOddsFor,
  consumeOffering,
  currentOffering,
  offeringCostLine,
} from "../encounters/befriendRuntime";
import {
  onWildEncounterResolved,
  profileForEncounter,
  shouldOfferHarborBefriend,
} from "../encounters/habitatRuntime";
import type { ZoneId } from "../world/zoneTypes";
import { isVisitorMode } from "../world/worldSession";

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

const INTENT_MIN_LEFT = 268;

/** Feet positions (sprites are bottom-anchored so breathing / squash read from the ground). */
// Stage fills the upper ~70% (#361): dais centre at y=300, arena scaled 1.18x;
// homes are the dais spots scaled with it; log + moves sit below the dais.
const ARENA_STAGE = { y: 300, scale: 1.18 };
const WILD_HOME = { x: DESIGN_SIZE / 2 + 137, y: 266 };
const PLAYER_HOME = { x: DESIGN_SIZE / 2 - 142, y: 370 };
const LOG_Y = 440;

// Quoted: an unquoted family name containing a digit makes the canvas font string invalid.
/** Befriend breakdown tip: capped width, and on touch it lapses fast (#388). */
const BEFRIEND_TIP_MAX_WIDTH = 440;
const BEFRIEND_TIP_TOUCH_MS = 2500;
const HUD_FONT ='"Source Sans 3", system-ui, sans-serif';
const HP_BAR_WIDTH = 176;
const HUD_PLATE_WIDTH = 236;

type HpHud = {
  name: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  chips: Phaser.GameObjects.Text[];
  chipX: number;
  chipY: number;
  /** Story boss bar is wider than a plate (#385). */
  barWidth?: number;
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
  private zoneId?: ZoneId;
  /** Befriend misses this encounter (card + spar); the wild leaves on a streak (#366). */
  private befriendMisses = 0;
  /** A missed card befriend made the wild bristle: it strikes first. */
  private wildOpens = false;
  private allowBefriend = false;
  private befriendTip: Phaser.GameObjects.GameObject[] = [];
  private befriendTipTimer?: Phaser.Time.TimerEvent;
  private wild!: BattleCombatant;
  private player!: BattleCombatant;
  private partyInstanceIndex = -1;
  /** Stable id for the active combatant; survives party UI reorders. */
  private partyInstanceId: string | null = null;
  private logText!: Phaser.GameObjects.Text;
  private wildHud!: HpHud;
  private playerHud!: HpHud;
  private wildSprite!: Phaser.GameObjects.Sprite;
  private playerSprite!: Phaser.GameObjects.Sprite;
  /** Presentation layer (#365); rules stay in this scene. */
  private fx!: BattleFx;
  private fainted = new Set<Side>();
  private wildLevel = 1;
  private intent: WildIntent | null = null;
  private intentObjects: Phaser.GameObjects.GameObject[] = [];
  /** First voluntary switch each battle costs no turn. */
  private freeSwitchAvailable = true;
  private rng: () => number = Math.random;
  /** Story 2 spar: softer wild hits, no matchup-seeking intents. */
  private tutorialSpar = false;
  /** Per-battle statuses / cooldowns of benched party creatures, by instanceId. */
  private benchState = new Map<
    string,
    Pick<BattleCombatant, "statuses" | "cooldowns">
  >();
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
  /** Rival / boss battle (#385): rules in battle/boss/storyBattle, art in storyBattleUi. */
  private story: StoryBattle | null = null;
  private storyUi: StoryBattleUi | null = null;
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
    zoneId?: ZoneId;
    befriendMisses?: number;
    wildOpens?: boolean;
    /** Only wild-encounter spars (and the dev ?spar= preview) opt in to Befriend. */
    allowBefriend?: boolean;
    /** Rival / boss battle (#385). Never befriendable. */
    story?: StoryBattleInit;
  }): void {
    this.story = data.story
      ? new StoryBattle(getStorySpar(data.story.sparId), {
          partyAverage: getPartyAverageLevel(),
          partySize: getActiveCreatures().filter((c) => c.currentHp > 0).length,
          rematch: data.story.rematch,
          ward: data.story.ward,
          wardNextIn: data.story.wardNextIn,
          maxLevel: MAX_LEVEL,
        })
      : null;
    this.storyUi = null;
    this.allowBefriend = data.allowBefriend === true && !this.story;
    this.wildCreatureId = data.wildCreatureId;
    this.zoneId = data.zoneId;
    this.befriendMisses = data.befriendMisses ?? 0;
    this.wildOpens = data.wildOpens ?? false;
    this.befriendTip = [];
    this.befriendTipTimer = undefined;
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
    this.tutorialSpar = !this.story && isHunterMatchupTeachActive();
    this.benchState = new Map();
    this.fainted = new Set();

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
      level: wildLevel,
      maxHp: wildMaxHp,
      currentHp: wildMaxHp,
      attack: wildAttack,
      defense: wildDef.defense,
      defenseDisabled: isGodCreature(data.wildCreatureId),
      moves: getBattleKit(wildDef),
      folkloreType: wildDef.folkloreType,
      damageScale: wildBattleTuning(this.tutorialSpar).damageScale,
      bulk: isGodCreature(data.wildCreatureId)
        ? 1
        : outleveledWildBulk(getPartyAverageLevel(), wildLevel),
    });
    if (this.story) {
      // Launch data names the story's first foe; the controller owns its stats.
      this.wildCreatureId = this.story.spriteCreatureId;
      this.wild = this.story.foe;
      this.wildLevel = this.story.foeLevel;
    }

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

  preload(): void {
    if (this.story) {
      preloadStoryArena(this, storyArenaVariant(this.story));
      preloadStoryAudio(this, this.story.def.theme);
    }
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
    hideOpeningCaption();
    ensureCreatureTextures(this);
    ensurePlayerAnims(this);
    this.cameras.main.fadeIn(140, 255, 255, 255);

    this.drawArena();

    const cx = DESIGN_SIZE / 2;

    // A warded story battle uses this strip for the Hearth Ward row (#399);
    // its title already ran in the VS banner and the foe bar names the foe.
    if (!this.story || this.story.ward >= 1) {
      this.add
        .text(cx, 22, this.story?.def.title ?? "Training Spar", {
          color: this.story ? "#ffd8a8" : "#fff7d8",
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          fontStyle: "bold",
          stroke: "#1a2430",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(6);
    }

    this.wildSprite = fitDisplay(
      this.add
        .sprite(
          WILD_HOME.x,
          WILD_HOME.y,
          ...resolveCreaturePoseTexture(
            this,
            getCreatureDefinition(this.wildCreatureId).spriteKey,
            "battle",
          ),
        )
        .setOrigin(0.5, 1)
        .setDepth(2),
      BATTLE_CREATURE_DISPLAY,
    ) as Phaser.GameObjects.Sprite;
    this.playerSprite = fitDisplay(
      this.add
        .sprite(PLAYER_HOME.x, PLAYER_HOME.y, ...this.getPlayerSpriteTexture())
        .setOrigin(0.5, 1)
        .setDepth(2),
      this.getPlayerBattleDisplay(),
    ) as Phaser.GameObjects.Sprite;
    this.syncPlayerBattleFacing();
    this.syncPlayerPresenceTint();
    this.fx = new BattleFx(
      this,
      () => ({ wild: this.wildSprite, player: this.playerSprite }),
      (side) =>
        side === "wild"
          ? this.storyUi
            ? this.storyUi.applyFoeTint(this.wildSprite)
            : this.wildSprite.clearTint()
          : this.syncPlayerPresenceTint(),
    );
    if (this.story) {
      this.storyUi = new StoryBattleUi(this, this.story, this.fx);
      this.storyUi.decorateFoe(this.wildSprite);
      setBattleTheme(this.story.def.theme, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.storyUi?.destroy();
        setBattleTheme(undefined);
      });
    }
    this.fx.setHome("wild", WILD_HOME.x, WILD_HOME.y);
    this.fx.setHome("player", PLAYER_HOME.x, PLAYER_HOME.y);
    this.addFastToggle();

    // Opponent plate top-left, player plate mid-right (clear of both sprites).
    this.wildHud = this.storyUi?.createHud() ?? this.createHpHud(24, 48);
    this.playerHud = this.createHpHud(DESIGN_SIZE - 24 - HUD_PLATE_WIDTH, 304);

    this.add
      .rectangle(cx, LOG_Y, 580, 40, 0x101820, 0.78)
      .setStrokeStyle(1, 0x6eb8a8, 0.6)
      .setDepth(4);
    this.logText = this.add
      .text(cx, LOG_Y, "", {
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
    const wildOpens = SPAR_WILD_OPENING_TURNS > 0 || this.wildOpens;
    this.log(
      this.story
        ? (this.story.isBoss
            ? `The ${this.wild.name} rises from the smoking peat — ${this.story.form?.label ?? ""}!`
            : `Wren sends out ${this.wild.name}! (${this.story.remainingFoes + 1} to beat)`) +
          (this.story.ward < 1 ? " The shrine's warmth steadies you." : "")
        : wildOpens
          ? `A training spar with ${this.wild.name} begins. The wild strikes first!`
          : `A training spar with ${this.wild.name} begins.`,
    );
    this.showHunterMatchupTeachIfNeeded();
    this.buildActionButtons();
    this.waitingForPlayer = false;
    const ready = this.playEntrance();
    this.time.delayedCall(ready, () => {
      if (this.battleEnded) {
        return;
      }
      if (wildOpens) {
        this.time.delayedCall(260, () => this.wildTurn());
      } else {
        this.waitingForPlayer = true;
      }
    });
    this.input.keyboard?.on("keydown", this.onGodSparKillCheatKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onGodSparKillCheatKeyDown);
    });
  }

  /** Creatures slide/hop in, camera pushes, VS banner for sovereigns. Returns ms until input. */
  private playEntrance(): number {
    const t = this.fx.timings();
    this.fx.cameraPush();
    this.fx.enter("wild", 0);
    this.fx.enter("player", t.entranceStagger);
    let ready = t.entrance + t.entranceStagger;
    if (isGodCreature(this.wildCreatureId)) {
      ready = Math.max(ready, this.fx.vsBanner(this.player.name, this.wild.name));
    } else if (this.storyUi) {
      ready = Math.max(ready, this.storyUi.playIntro(this.player.name));
    }
    return ready;
  }

  /** "Fast" toggle: skips lunges, particles, pauses (#365). */
  private addFastToggle(): void {
    const btn = this.add
      .text(DESIGN_SIZE - 12, 22, fastBattleLabel(fastBattleEnabled()), {
        color: "#fff7d8",
        backgroundColor: "#101820b0",
        fontFamily: HUD_FONT,
        fontSize: "12px",
        fontStyle: "bold",
        padding: { x: 7, y: 3 },
      })
      .setOrigin(1, 0.5)
      .setDepth(6);
    setTouchHitArea(btn);
    btn.on("pointerdown", () => {
      const next = !fastBattleEnabled();
      setFastBattleEnabled(next);
      btn.setText(fastBattleLabel(next));
      this.refreshHp();
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
      .text(cx, LOG_Y + 26, tip, {
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
    // Zone / night variant (#361); hills + dais scale around the dais centre
    // (design y=240 in the layer) so the stage fills the frame.
    const variant = this.story ? storyArenaVariant(this.story) : undefined;
    const layers = resolveArenaLayers((key) => hasWorldTexture(this, key), variant);
    if (layers) {
      const s = ARENA_STAGE.scale;
      const stageY = ARENA_STAGE.y + (h / 2 - 240) * s;
      const images = [
        this.add
          .image(w / 2, h / 2, ...imagineTexture(this, layers.sky))
          .setDisplaySize(w, h)
          .setDepth(-12),
        this.add
          .image(w / 2, stageY, ...imagineTexture(this, layers.hills))
          .setDisplaySize(w * s, h * s)
          .setDepth(-11),
        this.add
          .image(w / 2, stageY, ...imagineTexture(this, layers.platform))
          .setDisplaySize(w * s, h * s)
          .setDepth(-10),
      ];
      if (variant === "ember" && !layers.sky.startsWith("arena-ember")) {
        // Ember PNGs missing: warm the fallback arena instead.
        images.forEach((image) => image.setTint(0xffa080));
      }
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
    const combatant: BattleCombatant = {
      name: displayNameMarked(partyCreature),
      level: partyCreature.level,
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
    // Bond tier: small outgoing damage bonus (<= +8% at Kindred).
    applyBondToCombatant(combatant, partyCreature);
    // Returning from the bench keeps its statuses and cooldowns (no second wind-up).
    const benched = this.benchState.get(partyCreature.instanceId);
    if (benched) {
      combatant.statuses = benched.statuses;
      combatant.cooldowns = benched.cooldowns;
      return combatant;
    }
    return primeOpeningCooldowns(combatant);
  }

  /** Remember the outgoing creature's battle state before a switch. */
  private benchActivePlayer(): void {
    if (!this.partyInstanceId) {
      return;
    }
    this.benchState.set(this.partyInstanceId, {
      statuses: this.player.statuses ?? [],
      cooldowns: this.player.cooldowns ?? {},
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
      refreshPartyStatusLine();
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
    this.hideBefriendTip();
  }

  private buildActionButtons(): void {
    this.clearActionButtons();
    this.hideSwitchMenu();
    this.hideWandererFallbackMenu();

    const cx = DESIGN_SIZE / 2;
    // 2-column move grid below the log (and the Story 2 hunter tip).
    const top = LOG_Y + 72;
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

    const canSwitch = this.hasSwitchablePartyMembers();
    const canBefriend = !this.forcedSwitch && this.canBefriendInBattle();
    const pairOffset = canSwitch && canBefriend ? colOffset : 0;
    if (canSwitch) {
      const label =
        this.freeSwitchAvailable && !this.forcedSwitch
          ? "Switch (free this battle)"
          : "Switch";
      this.actionButtons.push(
        this.addActionButton(cx - pairOffset, buttonY - 4, label, () => this.showSwitchMenu()),
      );
    }
    if (canBefriend) {
      this.actionButtons.push(this.addBefriendButton(cx + pairOffset, buttonY - 4));
    }
  }

  // --- Befriend mid-spar (#366) ---------------------------------------------

  /** Opt-in per launch (wild-encounter spars only); never sovereigns, tutorial, owned, visitors. */
  private canBefriendInBattle(): boolean {
    const id = this.wildCreatureId;
    return (
      !this.battleEnded &&
      battleBefriendAllowed({
        allowBefriend: this.allowBefriend,
        god: isGodCreature(id),
        tutorial: this.tutorialSpar,
        visitor: isVisitorMode(),
        owned: hasCreature(id),
        habitatOffers: shouldOfferHarborBefriend(profileForEncounter(this.zoneId, id), id),
      })
    );
  }

  private befriendOdds(): BefriendOdds {
    const index = this.resolvePartyIndex();
    return befriendOddsFor({
      creatureId: this.wildCreatureId,
      zoneId: this.zoneId,
      hpFraction: this.wild.currentHp / this.wild.maxHp,
      statuses: this.wild.statuses,
      lead: index >= 0 ? getActiveCreatures()[index] : null,
      wildLevel: this.wildLevel,
    });
  }

  private addBefriendButton(x: number, y: number): Phaser.GameObjects.Text {
    const assured = isStory1BefriendGuaranteed(this.wildCreatureId);
    const odds = this.befriendOdds();
    const offering = assured ? "none" : currentOffering(this.wildCreatureId);
    // The cost rides on the label so touch players see it without a hover.
    const tag = offering === "folk-seal" ? " · Seal" : offering === "favorite-bait" ? " · Bait" : "";
    const btn = this.addActionButton(
      x,
      y,
      assured ? ASSURED_BEFRIEND_LABEL : `${formatBefriendOddsLabel(odds.chance)}${tag}`,
      () => this.onBefriendPressed(btn, assured ? null : odds),
    );
    btn.setBackgroundColor("#ffe2ec");
    btn.on("pointerover", () => {
      if (!this.coarsePointer()) {
        this.showBefriendTip(btn, assured ? null : odds);
      }
    });
    btn.on("pointerout", () => {
      if (!this.coarsePointer()) {
        this.hideBefriendTip();
      }
    });
    return btn;
  }

  private coarsePointer(): boolean {
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  }

  /** Touch: first tap shows the breakdown + cost, the second commits. Mouse: one click. */
  private onBefriendPressed(btn: Phaser.GameObjects.Text, odds: BefriendOdds | null): void {
    if (!this.waitingForPlayer) {
      return;
    }
    if (this.coarsePointer() && this.befriendTip.length === 0) {
      this.showBefriendTip(btn, odds, true);
      return;
    }
    this.attemptBefriend();
  }

  /** Breakdown above the button: "Base 28% · Weakened +20% · Rooted +12%". */
  private showBefriendTip(
    anchor: Phaser.GameObjects.Text,
    odds: BefriendOdds | null,
    confirm = false,
  ): void {
    this.hideBefriendTip();
    const offering = currentOffering(this.wildCreatureId);
    const lines = odds
      ? formatBefriendBreakdown(odds).join(" · ")
      : "Story guarantee — this one will join.";
    const cost = odds ? offeringCostLine(this.wildCreatureId, offering) : "";
    const footer = [
      cost,
      odds ? "A miss gives the wild a free turn" : "",
      confirm ? "Tap again to befriend" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    // 20px design ≈ 10.5 CSS px at 360 wide.
    const text = this.add
      .text(DESIGN_SIZE / 2, anchor.y - 30, footer ? `${lines}\n${footer}` : lines, {
        color: "#fff7e0",
        backgroundColor: "#101820f2",
        fontFamily: HUD_FONT,
        fontSize: "20px",
        align: "center",
        padding: { x: 12, y: 8 },
        wordWrap: { width: BEFRIEND_TIP_MAX_WIDTH, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1)
      .setDepth(12);
    this.befriendTip.push(text);
    if (confirm) {
      // Touch tip must not sit over the move cards; a second tap after it
      // lapses just shows it again.
      this.befriendTipTimer = this.time.delayedCall(BEFRIEND_TIP_TOUCH_MS, () =>
        this.hideBefriendTip(),
      );
    }
  }

  private hideBefriendTip(): void {
    this.befriendTipTimer?.remove(false);
    this.befriendTipTimer = undefined;
    for (const object of this.befriendTip) {
      object.destroy();
    }
    this.befriendTip = [];
  }

  /** Spends the player's turn: join, or a miss that hands the wild its turn. */
  private attemptBefriend(): void {
    if (
      !this.waitingForPlayer ||
      this.switchMenuOpen ||
      this.wandererFallbackOpen ||
      this.battleEnded ||
      !this.canBefriendInBattle()
    ) {
      return;
    }
    this.clearHunterMatchupTeach();
    this.hideBefriendTip();
    this.waitingForPlayer = false;
    for (const button of this.actionButtons) {
      (button as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.5);
    }
    const assured = isStory1BefriendGuaranteed(this.wildCreatureId);
    const odds = this.befriendOdds();
    // The Story 1 guarantee never eats an offering.
    const offering = assured ? "none" : currentOffering(this.wildCreatureId);
    consumeOffering(this.wildCreatureId, offering);
    const joined = rollBefriendAttempt(this.wildCreatureId, this.rng, odds.chance);
    const name = this.wild.name;
    this.log(
      offering !== "none"
        ? `You offer a ${offeringLabel(offering)} to ${name}...`
        : `You reach out to ${name}...`,
    );
    this.fx.heal("wild");
    this.time.delayedCall(this.fx.mode().fast ? 120 : 520, () => {
      if (this.battleEnded) {
        return;
      }
      if (joined) {
        this.befriendJoined();
        return;
      }
      const miss = afterBefriendMiss(this.befriendMisses);
      this.befriendMisses = miss.misses;
      this.fx.quickFlash("wild", 0xffffff);
      let line = befriendMissLine(name, miss, true);
      if (miss.fled) {
        if (this.zoneId) {
          onWildEncounterResolved(this.zoneId, this.wildCreatureId, "flee");
        }
        this.log(line);
        this.finishBattle(
          { tone: "defeat", line: `${line} No harm done — it may turn up again.` },
          null,
        );
        return;
      }
      line += this.tickEndOfTurn(this.player, "player");
      this.log(line);
      this.refreshHp();
      // Buttons stay dimmed through the wild's turn; finishWildTurn rebuilds them.
      this.renderIntent();
      if (isFainted(this.player)) {
        this.handlePlayerFainted();
        return;
      }
      this.time.delayedCall(this.fx.timings().turnGap, () => this.wildTurn());
    });
  }

  private befriendJoined(): void {
    if (this.zoneId) {
      onWildEncounterResolved(this.zoneId, this.wildCreatureId, "befriend");
    }
    addToParty(this.wildCreatureId, this.wildLevel);
    const line = `${this.wild.name} joined you!`;
    this.log(line);
    this.fx.confettiBurst(DESIGN_SIZE / 2, 90);
    this.finishBattle(
      { tone: "special", title: "New friend!", line: `${line} (Lv ${this.wildLevel})` },
      null,
    );
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
        fontFamily: HUD_FONT,
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
    if (role === "guard") {
      // Every sovereign beat is telegraphed, so a guard always parries it.
      details.push(
        this.hasSovereignPattern()
          ? "parries every beat"
          : `other hits −${Math.round((1 - GUARD_DAMAGE_TAKEN) * 100)}%`,
      );
    }
    if (!ready) {
      details.push(`ready in ${cooldown}`);
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
      const parry = Math.round((1 - GUARD_FINISHER_DAMAGE_TAKEN) * 100);
      return heal > 0 ? `parry −${parry}% +${heal} HP` : `parry −${parry}%`;
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
      const isActive = index === currentIndex;
      const fainted = creature.currentHp <= 0;
      const maxHp = getEffectiveMaxHp(creature);
      const label = fainted
        ? `${displayNameMarked(creature)} Lv.${creature.level} (fainted)`
        : isActive
          ? `${displayNameMarked(creature)} Lv.${creature.level} (active)`
          : `${displayNameMarked(creature)} Lv.${creature.level} (${creature.currentHp}/${maxHp} HP)`;

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
    this.swapPlayerSprite();
    this.log(`${this.player.name} steps up to fight!`);
    if (this.matchupTeachText) {
      this.showHunterMatchupTeachIfNeeded();
    }
    this.buildActionButtons();
    this.refreshIntent();
    this.waitingForPlayer = true;
  }

  /** New combatant on the player side: retexture, refit, slide in. */
  private swapPlayerSprite(): void {
    this.fainted.delete("player");
    this.fx.resetPose("player");
    this.tweens.killTweensOf(this.playerSprite);
    this.playerSprite.setTexture(...this.getPlayerSpriteTexture());
    fitDisplay(this.playerSprite, this.getPlayerBattleDisplay());
    this.syncPlayerBattleFacing();
    this.syncPlayerPresenceTint();
    this.fx.setHome("player", PLAYER_HOME.x, PLAYER_HOME.y);
    this.fx.syncStatuses("player", this.player);
    this.fx.enter("player");
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
    this.benchActivePlayer();
    this.partyInstanceIndex = index;
    this.partyInstanceId = creature.instanceId;
    this.player = this.combatantFromPartyIndex(index);
    this.forcedSwitch = false;
    this.hideSwitchMenu();
    this.refreshHp();
    this.swapPlayerSprite();
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
      this.time.delayedCall(Math.max(500, this.fx.timings().entrance), () => this.wildTurn());
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
    playMoveTypeSfx(this, move.type);
    this.clearHunterMatchupTeach();
    this.waitingForPlayer = false;
    for (const button of this.actionButtons) {
      (button as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.5);
    }
    const result = executeMove(this.player, move, this.wild, this.rng);
    // A boss form threshold clamps the hit and the boss transforms (her turn).
    const transformed = this.story?.checkTransform() ?? null;
    // Rules resolved above; the lunge / projectile lands, then we present it.
    this.fx.attack("player", move, moveRole(move), () => {
      if (this.battleEnded) {
        return;
      }
      let message = this.describeMove(this.player, this.wild, result, "wild");
      if (isFainted(this.wild)) {
        this.refreshHp();
        this.log(message);
        if (!this.sendNextStoryFoe()) {
          this.endBattle(true);
        }
        return;
      }
      message += this.tickEndOfTurn(this.player, "player");
      this.log(message);
      this.refreshHp();
      this.buildActionButtons();
      this.renderIntent();

      if (transformed) {
        this.playStoryTransform(transformed);
        return;
      }
      if (isFainted(this.player)) {
        this.handlePlayerFainted();
        return;
      }

      this.time.delayedCall(this.fx.timings().turnGap, () => this.wildTurn());
    });
  }

  private wildTurn(): void {
    if (this.battleEnded) {
      return;
    }
    const intent = this.intent ?? this.pickIntent();
    playMoveTypeSfx(this, intent.move.type);
    // Resolve the rules now; present them when the attack lands.
    let present: () => string;
    if (intent.fixedDamage !== undefined) {
      // Sovereign pattern: fixed damage, still bent by Dazed / Rooted / Guard.
      this.tideSovereignTurnIndex += 1;
      const guarded = this.player.guarding === true;
      const outcome = resolveFixedAttack(
        this.wild,
        intent.fixedDamage,
        this.player,
        this.rng,
      );
      if (outcome.kind === "miss") {
        present = () => {
          this.fx.number("player", damageNumberStyle({ kind: "miss", amount: 0, target: "player" }));
          return `${this.wild.name} used ${intent.move.name} — missed (Dazed)!`;
        };
      } else {
        applyDamage(this.player, outcome.damage);
        present = () => {
          this.presentHit("player", intent.move, intent.role, outcome.damage, "neutral");
          let line = `${this.wild.name} used ${intent.move.name}${guarded ? " — parried!" : "."}`;
          if (outcome.parryHealed > 0) {
            line += ` ${this.player.name} +${outcome.parryHealed} HP.`;
            this.presentParryHeal("player", outcome.parryHealed);
          }
          return line;
        };
      }
    } else {
      const guarded = this.player.guarding === true;
      const result = executeMove(this.wild, intent.move, this.player, this.rng);
      const parried = this.story?.onFoeActed(intent.move, guarded, result).parried ?? false;
      present = () => {
        const line = this.describeMove(this.wild, this.player, result, "player");
        if (!parried) {
          return line;
        }
        this.storyUi?.playParry(this.wildSprite);
        return `${line} ${this.wild.name} staggers — she loses her next turn!`;
      };
    }
    this.fx.attack("wild", intent.move, intent.role, () => this.finishWildTurn(present));
  }

  private finishWildTurn(present: () => string): void {
    if (this.battleEnded) {
      return;
    }
    let message = present();
    // A guard lasts until the guarding creature's next turn.
    this.player.guarding = false;
    message += this.tickEndOfTurn(this.wild, "wild");
    // Burn can carry the boss across a form threshold too.
    const transformed = this.story?.checkTransform() ?? null;
    if (!isFainted(this.player) && !isFainted(this.wild)) {
      const assist = this.story?.assistTick(this.player);
      if (assist && this.story?.def.assist) {
        message += ` ${describeAssist(assist, this.story.def.assist.name, this.player.name, this.wild.name)}`;
        this.storyUi?.playAssist(assist);
      }
    }
    this.log(message);
    this.refreshHp();

    if (isFainted(this.wild)) {
      if (!this.sendNextStoryFoe()) {
        this.endBattle(true);
      }
      return;
    }
    if (transformed) {
      this.playStoryTransform(transformed);
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
    this.waitingForPlayer = false;
    this.fainted.add("player");
    this.fx.faint("player", () => this.afterPlayerFaint());
  }

  private afterPlayerFaint(): void {
    if (this.battleEnded) {
      return;
    }
    if (this.hasSwitchablePartyMembers()) {
      this.forcedSwitch = true;
      this.waitingForPlayer = true;
      this.log(`${this.player.name} fainted! Choose a replacement.`);
      this.buildActionButtons();
      this.showSwitchMenu();
      return;
    }
    if (!this.story && !this.usingArmedWanderer && hasCraftedWeapon()) {
      this.forcedSwitch = true;
      this.waitingForPlayer = true;
      this.log(`${this.player.name} fainted!`);
      this.buildActionButtons();
      this.showWandererFallbackMenu();
      return;
    }
    this.endBattle(false);
  }

  // --- Story battles (#385) -------------------------------------------------

  /** Rival: Wren's next creature replaces the fainted one. False when she has none left. */
  private sendNextStoryFoe(): boolean {
    const next = this.story?.nextFoe();
    if (!this.story || !next) {
      return false;
    }
    const story = this.story;
    this.waitingForPlayer = false;
    this.clearIntent();
    this.fainted.add("wild");
    this.fx.faint("wild", () => {
      if (this.battleEnded) {
        return;
      }
      this.wild = next;
      this.wildCreatureId = story.spriteCreatureId;
      this.wildLevel = story.foeLevel;
      this.fainted.delete("wild");
      this.fx.resetPose("wild");
      this.tweens.killTweensOf(this.wildSprite);
      fitDisplay(this.wildSprite, BATTLE_CREATURE_DISPLAY);
      this.storyUi?.decorateFoe(this.wildSprite);
      this.fx.setHome("wild", WILD_HOME.x, WILD_HOME.y);
      this.fx.enter("wild");
      this.storyUi?.announceNextFoe(next.name);
      this.log(`Wren sends out ${next.name}!`);
      this.refreshHp();
      this.refreshIntent();
      this.buildActionButtons();
      this.waitingForPlayer = true;
    });
    return true;
  }

  /** The boss changed form: play it out, then the new form telegraphs. */
  private playStoryTransform(form: BossForm): void {
    this.waitingForPlayer = false;
    this.clearIntent();
    this.log(`${this.wild.name} sheds her shape — ${form.label}! ${form.telegraph}`);
    this.refreshHp();
    this.storyUi?.playTransform(form, this.wildSprite, () => {
      if (this.battleEnded) {
        return;
      }
      if (isFainted(this.player)) {
        this.handlePlayerFainted();
        return;
      }
      this.refreshIntent();
      this.buildActionButtons();
      this.waitingForPlayer = true;
    });
  }

  /** One log sentence for a resolved move; also spawns hit / heal floats. */
  private describeMove(
    user: BattleCombatant,
    target: BattleCombatant,
    result: MoveResult,
    targetSide: "wild" | "player",
  ): string {
    let line = `${user.name} used ${result.move.name}`;
    const attack = result.attack;
    if (result.guarded) {
      // Guard heals only on a parry (#378); the heal shows when the hit lands.
      line += " — guarding.";
      playGuardSfx(this);
    } else if (attack?.kind === "miss") {
      line += " — missed!";
      this.fx.number(targetSide, damageNumberStyle({ kind: "miss", amount: 0, target: targetSide }));
    } else if (attack?.kind === "immune") {
      line += ` — it had no effect${formatMatchupHint(attack.matchup)}`;
      this.fx.number(targetSide, damageNumberStyle({ kind: "immune", amount: 0, target: targetSide }));
    } else if (attack?.kind === "hit") {
      line += `.${formatMatchupHint(attack.matchup)}`;
      this.presentHit(targetSide, result.move, moveRole(result.move), attack.damage, attack.matchup);
      if (result.parryHealed) {
        line += ` Parried! ${target.name} +${result.parryHealed} HP.`;
        this.presentParryHeal(targetSide, result.parryHealed);
      }
    } else {
      line += ".";
    }

    const status = result.status;
    if (status) {
      const label = STATUS_DEFS[status.id].label;
      if (status.kind === "applied") {
        this.fx.statusApplied(targetSide, status.id);
        line +=
          status.id === "burn"
            ? ` ${target.name} is burning!`
            : ` ${target.name} is ${label}!`;
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

  /** Heal sparkle + "+N" on the side whose guard parried a finisher / sovereign beat. */
  private presentParryHeal(side: "wild" | "player", amount: number): void {
    this.fx.heal(side);
    this.fx.number(side, damageNumberStyle({ kind: "heal", amount, target: side }));
  }

  /** Burn ticks + status countdown at the end of `who`'s own turn. */
  private tickEndOfTurn(who: BattleCombatant, side: "wild" | "player"): string {
    const tick = tickStatuses(who);
    let line = "";
    if (tick.burnDamage > 0) {
      this.fx.number(side, damageNumberStyle({ kind: "burn", amount: tick.burnDamage, target: side }));
      line += ` ${who.name} burns for ${tick.burnDamage}.`;
    }
    for (const id of tick.expired) {
      line += ` ${STATUS_DEFS[id].label} wore off.`;
    }
    return line;
  }

  // --- Enemy intent (telegraphed one turn ahead) ---------------------------

  private pickIntent(): WildIntent {
    if (this.story) {
      return this.story.intentFor(this.player, this.rng);
    }
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
    const { move } = chooseEnemyIntent(this.wild, this.player, this.rng, {
      matchupAware: wildBattleTuning(this.tutorialSpar).matchupAware,
    });
    return { move, role: moveRole(move) };
  }

  private hasSovereignPattern(): boolean {
    return (
      this.wildCreatureId === TIDE_SOVEREIGN_ID ||
      this.wildCreatureId === CAIRN_SOVEREIGN_ID
    );
  }

  private refreshIntent(): void {
    this.intent = this.pickIntent();
    this.renderIntent();
  }

  private clearIntent(): void {
    this.fx?.clearIntentGlow();
    this.storyUi?.setSignatureWarning(false);
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
      const parry = Math.round((1 - GUARD_FINISHER_DAMAGE_TAKEN) * 100);
      const pct = Math.round((1 - GUARD_DAMAGE_TAKEN) * 100);
      detail = `parries finisher −${parry}% · others −${pct}%`;
    } else {
      const matchup = getMatchup(move, this.player);
      const damage =
        fixedDamage !== undefined
          ? previewFixedDamage(this.wild, fixedDamage, this.player)
          : matchup === "immune"
            ? 0
            : calcDamage(this.wild, move, this.player);
      const badge = fixedDamage === undefined ? formatMatchupBadge(matchup) : "";
      detail = `−${damage}${badge ? ` ${badge}` : ""}`;
      if (move.inflicts && canApplyStatus(this.player, move.inflicts)) {
        detail += ` → ${STATUS_DEFS[move.inflicts].label}`;
      }
    }
    const note = this.story?.intentNote(move) ?? null;
    if (this.storyUi) {
      detail = this.storyUi.intentDetail(note, detail);
      this.storyUi.setSignatureWarning(note === "signature");
    }

    const y = this.storyUi ? STORY_INTENT_Y : 62;
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
    // Room between the foe's HP plate (ends at x≈260) and the right edge. A long
    // detail line shrinks to fit instead of running off the screen (#391).
    // Story spars (#385) keep the foe plate elsewhere, so the banner may start further left.
    const intentLeft = this.storyUi ? 8 : INTENT_MIN_LEFT;
    const room = DESIGN_SIZE - 16 - (intentLeft + 8) - 16;
    let fontSize = 13;
    while (badge.width + gap + text.width > room && fontSize > 10) {
      fontSize -= 1;
      text.setFontSize(fontSize);
    }
    const contentWidth = badge.width + gap + text.width;
    const minCenter = intentLeft + contentWidth / 2 + 8;
    const centerX = Phaser.Math.Clamp(
      this.wildSprite.x,
      minCenter,
      Math.max(minCenter, DESIGN_SIZE - contentWidth / 2 - 16),
    );
    const left = centerX - contentWidth / 2;
    badge.setX(left);
    text.setX(left + badge.width + gap);
    const plate = this.add
      .rectangle(centerX, y, contentWidth + 16, 26, 0x101820, 0.86)
      .setStrokeStyle(role === "finisher" ? 2 : 1, style.color, 0.9)
      .setDepth(7);
    this.intentObjects.push(plate, badge, text);

    // Pulses as the foe's finisher charges, hardest when it is the telegraphed move.
    const finisher = this.wild.moves.find((m) => moveRole(m) === "finisher");
    this.fx.intentGlow(
      plate,
      intentGlow(role, finisher ? getCooldown(this.wild, finisher.id) : null),
      role === "finisher" ? style.color : ROLE_STYLE.finisher.color,
    );
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
    // A doused boss keeps her form's type on the bar; the chip says Doused.
    const shownType = (hud === this.wildHud && this.story?.form?.type) || who.folkloreType;
    hud.name.setText(
      `${who.name}${level !== null ? `  Lv ${level}` : ""}  ·  ${shownType}`,
    );
    // The boss bar shows the current form's slice of her pool (#401).
    const shown = (hud === this.wildHud && this.storyUi?.barHp()) || { current: who.currentHp, max: who.maxHp };
    const ratio = Math.max(0, shown.current / shown.max);
    const width = (hud.barWidth ?? HP_BAR_WIDTH) * ratio;
    this.tweens.killTweensOf(hud.bar);
    if (this.fx && !this.fx.mode().fast && Math.abs(hud.bar.width - width) > 0.5) {
      this.tweens.add({ targets: hud.bar, width, duration: 360, ease: "Cubic.easeOut" });
    } else {
      hud.bar.width = width;
    }
    hud.bar.setFillStyle(ratio > 0.5 ? 0x6cd86a : ratio > 0.25 ? 0xf2c94c : 0xeb5757);
    hud.hp.setText(`${shown.current}/${shown.max}`);

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
    chips.push(...(this.storyUi?.extraChips(hud === this.wildHud ? "wild" : "player") ?? []));
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
    this.fx?.syncStatuses("wild", this.wild);
    this.fx?.syncStatuses("player", this.player);
  }

  /** Dev kill cheat: quick flash + hit sound, no lunge. */
  private flashCombatant(target: Side, damage: number): void {
    if (target === "wild") {
      playHitWildSfx(this, damage);
    } else {
      playHitPlayerSfx(this, damage);
    }
    this.fx.quickFlash(target, target === "wild" ? 0xff6644 : 0xffaa22);
  }

  /** Landed hit: styled number, type burst, hit-pause, recoil, SFX (#365). */
  private presentHit(
    target: Side,
    move: MoveDefinition,
    role: MoveRole,
    damage: number,
    matchup: MatchupResult,
  ): void {
    if (target === "wild") {
      playHitWildSfx(this, damage, matchup);
    } else {
      playHitPlayerSfx(this, damage, matchup);
    }
    const strong = damage >= STRONG_HIT_DAMAGE;
    const finisher = role === "finisher";
    this.fx.impact(
      target,
      {
        damage,
        maxHp: (target === "wild" ? this.wild : this.player).maxHp,
        type: move.type,
        role,
        effective: matchup === "hunter",
        resisted: matchup === "resisted",
        strong,
      },
      damageNumberStyle({ kind: "hit", amount: damage, matchup, strong, finisher, target }),
    );
  }

  private log(message: string): void {
    this.logText.setText(message);
  }

  /** Shared end-of-spar teardown; true when this call ended the battle. */
  private teardownBattle(): boolean {
    unlockCodexHud();
    if (this.battleEnded) {
      return false;
    }
    this.battleEnded = true;
    this.waitingForPlayer = false;
    this.clearIntent();
    this.clearHunterMatchupTeach();
    this.hideSwitchMenu();
    this.hideWandererFallbackMenu();
    this.clearActionButtons();
    this.syncActivePartyHp();
    return true;
  }

  /** Non-KO endings (befriend joined / wild slipped away). */
  private finishBattle(panel: ResultPanelOptions, faintSide: Side | null): void {
    if (!this.teardownBattle()) {
      return;
    }
    notifyWorldChanged();
    const show = (): void =>
      showBattleResultPanel(this, panel, this.fx.mode(), this.fx.timings().xpFill, () =>
        this.exitBattle(),
      );
    if (faintSide) {
      this.fx.faint(faintSide, show);
    } else {
      this.time.delayedCall(260, show);
    }
  }

  private endBattle(playerWon: boolean): void {
    if (!this.teardownBattle()) {
      return;
    }

    if (playerWon) {
      playFaintSfx(this);
    }

    let panel: ResultPanelOptions;
    if (playerWon && this.wildCreatureId === TIDE_SOVEREIGN_ID) {
      const result = resolveTideSovereignOutcome("spar-win");
      const line = result
        ? formatGodClaimJoinLine(
            "Tide Sovereign",
            "Tide Cleaver",
            result,
            true,
            "Tide Crown",
          )
        : `${this.wild.name} yields.`;
      this.log(line);
      panel = { tone: "special", title: "Victory!", line };
    } else if (playerWon && this.wildCreatureId === CAIRN_SOVEREIGN_ID) {
      const result = resolveCairnSovereignOutcome("spar-win");
      const line = result
        ? formatGodClaimJoinLine(
            "Stone Sovereign",
            "Cairn Maul",
            result,
            true,
            "Boulder Crown",
          )
        : `${this.wild.name} yields.`;
      this.log(line);
      panel = { tone: "special", title: "Victory!", line };
    } else if (this.story && (!playerWon || getActiveQuestId() !== this.story.def.id)) {
      // Story loss or rematch win: storySpar rolls rewards back either way.
      reportStoryBattleResult(this.story.def.id, playerWon);
      const line = playerWon
        ? `${this.story.def.name} yields. Bragging rights only on a rematch.`
        : this.story.isBoss
          ? "The Matriarch's heat drives you back. Wren hauls everyone clear."
          : "Wren takes this one. Nobody's hurt — just pride.";
      this.log(line);
      panel = playerWon ? { tone: "special", title: "Victory!", line } : { tone: "defeat", line };
    } else if (playerWon) {
      if (this.story) {
        reportStoryBattleResult(this.story.def.id, true);
      }
      const before: PartySnapshotEntry[] = getActiveCreatures().map((c) => ({
        instanceId: c.instanceId,
        definitionId: c.definitionId,
        level: c.level,
        xp: c.xp,
      }));
      const reward = grantSparRewards(
        this.wildCreatureId,
        this.resolvePartyIndex(),
      );
      this.log(this.story ? `${this.story.def.title} — victory!` : formatRewardMessage(reward));
      panel = {
        tone: "victory",
        summary: buildVictorySummary(before, getActiveCreatures(), reward, {
          definition: getCreatureDefinition,
          materialName: getMaterialName,
        }),
        extraLine: this.story
          ? this.story.isBoss
            ? "The Cinder Matriarch is calmed. The fen exhales."
            : "You beat Wren, the Rival!"
          : undefined,
      };
    } else {
      this.log("You lost the training spar...");
      panel = {
        tone: "defeat",
        line: "Everyone is tired, not hurt. Rest up and try again.",
      };
    }
    notifyWorldChanged();

    const showPanel = (): void => {
      if (playerWon) {
        playBattleWinSfx(this);
        this.fx.confettiBurst(DESIGN_SIZE / 2, 90);
      }
      showBattleResultPanel(
        this,
        panel,
        this.fx.mode(),
        this.fx.timings().xpFill,
        () => this.exitBattle(),
      );
    };
    const loser: Side = playerWon ? "wild" : "player";
    if (this.fainted.has(loser)) {
      this.time.delayedCall(200, showPanel);
    } else {
      this.fainted.add(loser);
      this.fx.faint(loser, showPanel);
    }
  }

  private exitBattle(): void {
    this.cameras.main.fadeOut(140, 255, 255, 255);
    this.time.delayedCall(145, () => {
      this.scene.stop("BattleScene");
      this.scene.stop("EncounterScene");
      this.scene.resume("IsometricScene");
    });
  }
}
