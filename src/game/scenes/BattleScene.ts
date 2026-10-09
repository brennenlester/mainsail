import { displayNameMarkedIn } from "../creatures/displayName";
import { refreshPartyStatusLine } from "../ui/statusPanel";
import Phaser from "phaser";
import {
  playBattleWinSfx,
  playFaintSfx,
  playGuardSfx,
  playHitPlayerSfx,
  playDeniedSfx,
  playHitWildSfx,
  playMoveTypeSfx,
  preloadStoryAudio,
  setBattleTheme,
  STRONG_HIT_DAMAGE,
} from "../audio/gameAudio";
import { describeAssist, StoryBattle } from "../battle/boss/storyBattle";
import {
  BOSS_SCALE,
  preloadStoryArena,
  storyArenaVariant,
  StoryBattleUi,
} from "../battle/boss/storyBattleUi";
import { isStorySparId, reportStoryBattleResult, type StoryBattleInit } from "../battle/storySpar";
// Type-only: the trial runtime is its own lazy chunk (#420).
import type { TrialBattle, TrialStrip } from "../trials/trialBattle";
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
  showBattleResultPanel,
  type ResultPanelFrame,
  type ResultPanelOptions,
} from "../battle/vfx/battleResultPanel";
import {
  ARENA_DAIS_LAYER_Y,
  ARENA_LAYER_SCALE,
  BASE,
  battleLayout,
  type BattleLayout,
  type Rect,
} from "../battle/vfx/battleLayout";
import { HotkeyGuard } from "../input/hotkeyGuard";
import { pulseWhenHotkeysArmed } from "../ui/hotkeyReadyPulse";
import {
  addKeycap,
  addToast,
  fitText,
  drawCardPanel,
  MoveCard,
  showKeyHints,
} from "../battle/vfx/battleWidgets";
import { addChip, CARD, CARD_FONT, CardButton, TYPE_CHIP_COLORS } from "../ui/encounterCard";
import { isDomKeyboardTarget } from "../ui/canvasFocus";
import { layoutStage } from "../ui/stageLayout";
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
import { applyRareLook, followRareGlow } from "../render/rareGlow";
import { ensureCreatureTextures } from "../creatures/sprites";
import { lateCreatureKeys } from "../render/lateAssets";
import { waitForLateImages } from "../render/lateAssetWait";
import { resolveCreaturePoseTexture } from "../creatures/creaturePoses";
import { resolveArenaLayers } from "../render/arenaLayers";
import { hasWorldTexture, imagineTexture } from "../render/imagineAssets";
import {
  BATTLE_CREATURE_DISPLAY,
  BATTLE_PLAYER_DISPLAY,
  ensureTrimmedTexture,
  fitContainDisplay,
  fitDisplay,
} from "../render/displaySizes";
import {
  DESIGN_SIZE,
  OVERLAY_LETTERBOX_COLOR,
  RENDER_DPR,
  resizeGameForDisplay,
} from "../render/pixelRatio";
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
import { dismissAmbientNicknamePrompt } from "../ui/nicknamePrompt";
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

// Sprites are bottom-anchored (breathing / squash read from the ground); homes,
// plates, log and move cards all come from the full-stage layout (#404).

/** Befriend breakdown tip: on touch it lapses fast (#388). */
const BEFRIEND_TIP_TOUCH_MS = 2500;
// Quoted: an unquoted family name containing a digit makes the canvas font string invalid.
const HUD_FONT = CARD_FONT;
/** Space on a plate right of the HP bar for "34/34". */
const PLATE_HP_TEXT_W = 58;

type HpHud = {
  name: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  chips: Phaser.GameObjects.Text[];
  chipX: number;
  chipY: number;
  barWidth: number;
  /** Scaled plate; name / bar / chips live in it in local base px. */
  container: Phaser.GameObjects.Container;
  /** Room for the name line (base px). */
  nameWidth?: number;
};

/** Intent shown for the enemy's next action (one turn ahead). */
type WildIntent = {
  move: MoveDefinition;
  role: MoveRole;
  /** Fixed sovereign pattern damage (before guard); undefined = rolled move. */
  fixedDamage?: number;
};

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
  private playerRareGlow: Phaser.GameObjects.Image | null = null;
  private wildRareGlow: Phaser.GameObjects.Image | null = null;
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
  private matchupTeachText: Phaser.GameObjects.Container | null = null;
  /** Full-stage layout (#404); re-run on a resize / rotation (#418). The camera frames `view`. */
  private layout!: BattleLayout;
  private stageCss = { w: DESIGN_SIZE, h: DESIGN_SIZE };
  private logFrame?: Rect;
  private moveCards: MoveCard[] = [];
  private switchButton?: CardButton;
  private befriendButton?: CardButton;
  /** Switch menu rows by party index (keys 1-6). */
  private switchRowActions = new Map<number, () => void>();
  private fallbackActions: { fight?: () => void; retreat?: () => void } = {};
  /** Rival / boss battle (#385): rules in battle/boss/storyBattle, art in storyBattleUi. */
  private story: StoryBattle | null = null;
  /** Eclipse Trial round (#420): rules in trials/trialBattle; the boss round also sets `story`. */
  private trial: TrialBattle | null = null;
  private trialStrip: TrialStrip | null = null;
  private titleOverride: string | undefined;
  private blockedToast?: Phaser.GameObjects.Container;
  /** Movement keys (S / arrows) held as the battle opens never fire hotkeys (#418). */
  private hotkeys = new HotkeyGuard();
  private lastBlockedAt = -Infinity;
  /** The stage changed shape mid-battle; reflow at the next idle turn (#418). */
  private reflowPending = false;
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
    /** Challenge ghost fights: replaces "Training Spar" (the banner lives in-canvas, #409). */
    title?: string;
    /** Challenge ghost fights: the sharer's nickname for the foe (display only). */
    wildNickname?: string;
    /** Eclipse Trial round (#420): no befriend, no rewards; the runner settles it. */
    trial?: TrialBattle;
  }): void {
    this.titleOverride = data.title;
    this.blockedToast = undefined;
    this.lastBlockedAt = -Infinity;
    this.trial = data.trial ?? null;
    this.trialStrip = null;
    this.playerRareGlow = null;
    this.wildRareGlow = null;
    this.story = data.story
      ? new StoryBattle(getStorySpar(data.story.sparId), {
          partyAverage: getPartyAverageLevel(),
          partySize: getActiveCreatures().filter((c) => c.currentHp > 0).length,
          rematch: data.story.rematch,
          ward: data.story.ward,
          wardNextIn: data.story.wardNextIn,
          maxLevel: MAX_LEVEL,
        })
      : (this.trial?.boss ?? null);
    this.storyUi = null;
    this.allowBefriend = data.allowBefriend === true && !this.story && !this.trial;
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
    this.moveCards = [];
    this.switchButton = undefined;
    this.befriendButton = undefined;
    this.switchRowActions = new Map();
    this.fallbackActions = {};
    this.matchupTeachText = null;
    this.intent = null;
    this.intentObjects = [];
    this.freeSwitchAvailable = true;
    this.rng = Math.random;
    this.tutorialSpar = !this.story && !this.trial && isHunterMatchupTeachActive();
    this.benchState = new Map();
    this.fainted = new Set();

    const wildDef = getCreatureDefinition(data.wildCreatureId);
    // Trial foes reach the codex after the run settles (trialRun), never mid-trial.
    if (!wildDef.excludeFromCodex && !data.trial) {
      markCreatureDiscovered(data.wildCreatureId);
    }
    const wildLevel = getWildEffectiveLevel(data.wildCreatureId);
    this.wildLevel = wildLevel;
    const wildMaxHp = scaledStat(wildDef.maxHp, wildLevel);
    const wildAttack = scaledStat(wildDef.attack, wildLevel);
    this.wild = primeOpeningCooldowns({
      name: data.wildNickname || wildDef.name,
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
    } else if (this.trial) {
      this.wildCreatureId = this.trial.foeCreatureId;
      this.wild = this.trial.foe;
      this.wildLevel = this.trial.foeLevel;
    }
    // Eclipse entry statuses land on the foe as the round opens.
    this.trial?.startFoe();

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
    // Sovereign art (wild or a fresh companion) is fetched on demand (#410).
    waitForLateImages(
      this,
      lateCreatureKeys([this.wildCreatureId, ...getActiveCreatures().map((c) => c.definitionId)]),
    );
    if (this.story) {
      preloadStoryArena(this, storyArenaVariant(this.story));
      preloadStoryAudio(this, this.story.def.theme);
    }
  }

  create(): void {
    setPartyEditLocked(true);
    // A docked "name your friend" prompt must not sit over the battle plates.
    dismissAmbientNicknamePrompt();
    // Quest card sits over the top-right of the board; hide it during spars.
    document.body.classList.add("battle-active");
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      setPartyEditLocked(false);
      document.body.classList.remove("battle-active");
    });
    this.scene.bringToTop();
    this.frameStage();
    hideOpeningCaption();
    ensureCreatureTextures(this);
    ensurePlayerAnims(this);
    this.cameras.main.fadeIn(140, 255, 255, 255);

    this.buildVisuals();
    this.refreshIntent();
    if (this.story) {
      setBattleTheme(this.story.def.theme, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.storyUi?.destroy();
        setBattleTheme(undefined);
      });
    }
    // #336: SPAR_WILD_OPENING_TURNS 0 waits for the player's first strike.
    const wildOpens = SPAR_WILD_OPENING_TURNS > 0 || this.wildOpens;
    this.log(
      this.story
        ? (this.story.isBoss
            ? `The ${this.wild.name} rises${this.trial ? " out of the eclipse" : " from the smoking peat"} — ${this.story.form?.label ?? ""}!`
            : `Wren sends out ${this.wild.name}! (${this.story.remainingFoes + 1} to beat)`) +
          (this.story.ward < 1 ? " The shrine's warmth steadies you." : "")
        : this.trial
          ? `Eclipse Trial, round ${this.trial.round.index + 1}: ${this.wild.name} steps out of the dark.`
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
    this.hotkeys = new HotkeyGuard();
    pulseWhenHotkeysArmed(this, this.hotkeys, () => this.moveCards.map((c) => c.container));
    this.input.keyboard?.on("keydown", this.onGodSparKillCheatKeyDown);
    this.input.keyboard?.on("keydown", this.onBattleKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onGodSparKillCheatKeyDown);
      this.input.keyboard?.off("keydown", this.onBattleKey);
    });
  }

  /**
   * Arena, sprites, plates, log sheet and FX from the current layout and
   * battle state (no log line, buttons or entrance). Shared by `create` and
   * the mid-battle reflow (#418).
   */
  private buildVisuals(): void {
    this.drawArena();
    const L = this.layout;
    const ui = L.ui;

    const fastToggle = this.addFastToggle();
    if (this.trial) {
      // Eclipse Trial strip (#420): round pips, modifier chips, score. A
      // reflow destroyed the old one with every other child.
      this.trialStrip = this.trial.createStrip(
        this,
        { left: L.topRow.left, right: fastToggle.x - fastToggle.width - 8 * ui, y: L.topRow.y },
        ui,
      );
    } else if (!this.story || this.story.ward >= 1) {
      // A warded story battle uses this strip for the Hearth Ward row (#399);
      // its title already ran in the VS banner and the foe bar names the foe.
      const title = this.add
        .text(
          (L.topRow.left + L.topRow.right) / 2,
          L.topRow.y,
          this.titleOverride ?? this.story?.def.title ?? "Training Spar",
          {
            color: this.story ? "#ffd8a8" : CARD.creamCss,
            fontFamily: HUD_FONT,
            fontSize: `${Math.round(18 * ui)}px`,
            fontStyle: "bold",
            stroke: CARD.inkCss,
            strokeThickness: Math.round(4 * ui),
          },
        )
        .setOrigin(0.5)
        .setDepth(6);
      if (this.titleOverride) {
        // A long ghost-party title must not run under the Fast toggle: left-align
        // it and step the font down / ellipsize into the room beside the toggle.
        const room = fastToggle.x - fastToggle.width - 8 * ui - L.topRow.left;
        fitText(title, room, Math.round(12 * ui));
        title.setOrigin(0, 0.5).setX(L.topRow.left);
      }
    }

    this.wildSprite = fitDisplay(
      this.add
        .sprite(
          L.wildHome.x,
          L.wildHome.y,
          ...resolveCreaturePoseTexture(
            this,
            getCreatureDefinition(this.wildCreatureId).spriteKey,
            "battle",
          ),
        )
        .setOrigin(0.5, 1)
        .setDepth(2),
      this.scaledDisplay(BATTLE_CREATURE_DISPLAY),
    ) as Phaser.GameObjects.Sprite;
    this.playerSprite = fitDisplay(
      this.add
        .sprite(L.playerHome.x, L.playerHome.y, ...this.getPlayerSpriteTexture())
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
    this.fx.setFraming({
      zoom: () => this.frameZoom(),
      banner: L.banner,
      // Landscape: the VS band (width + 80) stays inside the arena, off the move column.
      width: L.mode === "side" ? L.arenaRegion.w - 80 : L.view.w,
    });
    if (this.story) {
      this.storyUi = new StoryBattleUi(this, this.story, this.fx);
      this.storyUi.syncShownForm();
      this.storyUi.setFrame({
        ui,
        s: L.cs,
        banner: L.banner,
        viewX: L.view.x,
        viewW: L.view.w,
        intentY: L.intent.y,
        emberY: L.dais.y + 120 * L.s,
        arenaX: L.mode === "side" ? L.arenaRegion.x : L.view.x,
        arenaW: L.mode === "side" ? L.arenaRegion.w : L.view.w,
      });
      this.storyUi.decorateFoe(this.wildSprite);
    }
    this.fx.setHome("wild", L.wildHome.x, L.wildHome.y);
    this.fx.setHome("player", L.playerHome.x, L.playerHome.y);

    // Plates up top, each on its creature's side (#404); a story foe gets the wide bar.
    this.wildHud = this.storyUi?.createHud(L.foePlate) ?? this.createHpHud(L.foePlate, true);
    this.playerHud = this.createHpHud(L.playerPlate);
    this.drawSheet();

    this.refreshHp();
  }

  /** A resize / rotation waits for the next idle turn, then re-runs the layout (#418). */
  update(): void {
    // Rare halos ride under their sprite through lunges and hits (#423).
    for (const [glow, sprite] of [
      [this.playerRareGlow, this.playerSprite],
      [this.wildRareGlow, this.wildSprite],
    ] as const) {
      if (glow?.active) {
        followRareGlow(glow, sprite);
      }
    }
    if (!this.reflowPending || this.battleEnded || !this.waitingForPlayer || this.switchMenuOpen || this.wandererFallbackOpen) {
      return;
    }
    this.reflowPending = false;
    const stage = layoutStage();
    if (Math.abs(stage.width - this.stageCss.w) < 1 && Math.abs(stage.height - this.stageCss.h) < 1) {
      return;
    }
    this.reflowLayout();
  }

  /**
   * Rebuild every widget for the new stage shape (portrait <-> landscape)
   * from the live battle state. Only runs while the player is choosing, so
   * no turn animation or timer holds a widget being replaced.
   */
  private reflowLayout(): void {
    const log = this.logText.text;
    const teach = this.matchupTeachText !== null;
    this.befriendTipTimer?.remove();
    this.befriendTipTimer = undefined;
    this.storyUi?.destroy();
    this.tweens.killAll();
    for (const child of [...this.children.list]) {
      child.destroy();
    }
    this.blockedToast = undefined;
    this.matchupTeachText = null;
    this.befriendTip = [];
    this.intentObjects = [];
    this.actionButtons = [];
    this.moveCards = [];
    this.switchButton = undefined;
    this.befriendButton = undefined;
    this.switchMenuObjects = [];
    this.wandererFallbackObjects = [];
    this.switchRowActions = new Map();
    this.fitStage();
    this.buildVisuals();
    // Same telegraphed move: re-draw it, never re-roll it.
    this.renderIntent();
    this.logText.setText(log);
    if (teach) {
      this.showHunterMatchupTeachIfNeeded();
    }
    this.buildActionButtons();
    this.fx.startIdle("wild");
    this.fx.startIdle("player");
  }

  // --- Full-stage framing (#404) ---------------------------------------------

  /**
   * Battles own the whole viewport: the (inert) dock steps aside via the
   * battle-active class, the stage is re-measured, and the layout is fitted
   * to the stage's real aspect so nothing is letterboxed.
   */
  private frameStage(): void {
    this.reflowPending = false;
    this.fitStage();
    // Until the next idle turn the old view is re-fitted (navy bars), then
    // `update` reflows every widget for the new shape (#418).
    const onResize = (): void => {
      this.frameCamera();
      this.reflowPending = true;
    };
    this.scale.on("resize", onResize);
    window.addEventListener("resize", onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", onResize);
      window.removeEventListener("resize", onResize);
    });
  }

  /** Size the game to the stage, compute the layout, frame it, bar the outside. */
  private fitStage(): void {
    const stage = layoutStage();
    resizeGameForDisplay(this, stage.width, stage.height);
    this.stageCss = { w: this.scale.width / RENDER_DPR, h: this.scale.height / RENDER_DPR };
    this.layout = this.computeLayout(this.player.moves.length);
    this.frameCamera();
    const v = this.layout.view;
    const reach = 8000;
    for (const [x, y, w, h] of [
      [v.x - reach, v.y - reach, reach, v.h + 2 * reach],
      [v.x + v.w, v.y - reach, reach, v.h + 2 * reach],
      [v.x, v.y - reach, v.w, reach],
      [v.x, v.y + v.h, v.w, reach],
    ] as const) {
      this.add.rectangle(x, y, w, h, OVERLAY_LETTERBOX_COLOR, 1).setOrigin(0).setDepth(100_000);
    }
  }

  private computeLayout(moveCount: number): BattleLayout {
    return battleLayout({
      stageW: this.stageCss.w,
      stageH: this.stageCss.h,
      moveCount,
      story: this.story !== null,
      foeScale: this.story?.isBoss ? BOSS_SCALE : 1,
    });
  }

  private frameZoom(): number {
    const v = this.layout.view;
    return Math.min(this.scale.width / v.w, this.scale.height / v.h);
  }

  private frameCamera(): void {
    const v = this.layout.view;
    const cam = this.cameras.main;
    cam.setZoom(this.frameZoom());
    cam.centerOn(v.x + v.w / 2, v.y + v.h / 2);
  }

  /** Creature display box scaled with the arena. */
  private scaledDisplay(size: { width: number; height: number }): { width: number; height: number } {
    const s = this.layout?.cs ?? 1;
    return { width: size.width * s, height: size.height * s };
  }

  /** Navy command sheet behind the log, move cards and buttons; the log itself. */
  private drawSheet(): void {
    const L = this.layout;
    const ui = L.ui;
    const sh = L.sheet;
    const g = this.add.graphics().setDepth(3);
    const r = 22 * ui;
    if (L.mode === "side") {
      g.fillStyle(CARD.panel, 0.9);
      g.fillRoundedRect(sh.x, sh.y - r, sh.w + r, sh.h + 2 * r, r);
      g.lineStyle(2, CARD.cream, 0.55);
      g.strokeRoundedRect(sh.x, sh.y - r, sh.w + r, sh.h + 2 * r, r);
    } else {
      g.fillStyle(CARD.panel, 0.9);
      g.fillRoundedRect(sh.x - r, sh.y, sh.w + 2 * r, sh.h + r, r);
      g.lineStyle(2, CARD.cream, 0.55);
      g.strokeRoundedRect(sh.x - r, sh.y, sh.w + 2 * r, sh.h + r, r);
    }
    const log = L.log;
    this.logFrame = log;
    g.fillStyle(CARD.panelDeep, 0.95);
    g.fillRoundedRect(log.x, log.y, log.w, log.h, 12 * ui);
    g.lineStyle(1, CARD.line, 1);
    g.strokeRoundedRect(log.x, log.y, log.w, log.h, 12 * ui);
    this.logText = this.add
      .text(log.x + log.w / 2, log.y + log.h / 2, "", {
        color: CARD.creamCss,
        fontFamily: HUD_FONT,
        fontSize: `${Math.round(15 * ui)}px`,
        align: "center",
        lineSpacing: 0,
        wordWrap: { width: log.w - 20 * ui, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  // --- Keyboard (#404): fixed keys, hints on desktop only ---------------------

  /** 1-5 move cards in order, S switch, B befriend; menus take 1-6 / Esc / F. */
  private onBattleKey = (event: KeyboardEvent): void => {
    if (
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      this.battleEnded ||
      // Phaser hands keys over a frame late; judge by where the key was typed.
      isDomKeyboardTarget(event.target as Element | null) ||
      !this.hotkeys.allows(event)
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    const digit = /^[1-9]$/.test(key) ? Number(key) : 0;
    if (this.switchMenuOpen) {
      if (digit > 0) {
        this.switchRowActions.get(digit - 1)?.();
      } else if ((key === "escape" || key === "s") && !this.forcedSwitch) {
        this.hideSwitchMenu();
      }
      return;
    }
    if (this.wandererFallbackOpen) {
      if (digit === 1 || key === "enter") {
        this.fallbackActions.fight?.();
      } else if (key === "f" || digit === 2) {
        this.fallbackActions.retreat?.();
      }
      return;
    }
    if (!this.waitingForPlayer) {
      return;
    }
    if (digit > 0) {
      this.moveCards[digit - 1]?.activate();
    } else if (key === "s") {
      if (this.switchButton) {
        this.showSwitchMenu();
      } else if (!this.forcedSwitch) {
        this.notifyBlocked("No one to switch to");
      }
    } else if (key === "b") {
      if (this.befriendButton) {
        // A key press is deliberate: no tap-to-confirm step.
        this.attemptBefriend();
      } else if (!this.forcedSwitch) {
        this.notifyBlocked("Can't befriend this foe");
      }
    }
  };

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
  private addFastToggle(): Phaser.GameObjects.Text {
    const L = this.layout;
    const ui = L.ui;
    const btn = this.add
      .text(L.topRow.right, L.topRow.y, fastBattleLabel(fastBattleEnabled()), {
        color: CARD.creamCss,
        backgroundColor: "#0e1b2cd8",
        fontFamily: HUD_FONT,
        fontSize: `${Math.round(13 * ui)}px`,
        fontStyle: "bold",
        padding: { x: Math.round(8 * ui), y: Math.round(3 * ui) },
      })
      .setOrigin(1, 0.5)
      .setDepth(6);
    // Touch-sized, but grown only down / sideways: it sits on the stage's top edge.
    const minTarget = 44 / L.unit;
    const hitW = Math.max(btn.width, minTarget);
    btn.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(btn.width - hitW, 0, hitW, Math.max(btn.height, minTarget)),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    btn.on("pointerdown", () => {
      const next = !fastBattleEnabled();
      setFastBattleEnabled(next);
      btn.setText(fastBattleLabel(next));
      this.refreshHp();
    });
    return btn;
  }

  private showHunterMatchupTeachIfNeeded(): void {
    if (!isHunterMatchupTeachActive()) {
      return;
    }
    const tip = formatHunterMatchupTeach(
      this.player.folkloreType,
      this.wild.folkloreType,
    );
    this.matchupTeachText?.destroy();
    const L = this.layout;
    if (L.tight) {
      // Short phones: the arena can't spare the room, so the tip rides in the log.
      this.log(`${this.logText.text} ${tip}`);
      if (this.logText.height > (this.logFrame?.h ?? 0)) {
        this.log(tip);
      }
      return;
    }
    this.matchupTeachText = addToast(this, L.tip.x, L.tip.y, tip, {
      ui: L.ui,
      maxW: Math.min(L.arenaRegion.w - 24 * L.ui, 560 * L.ui),
      originY: 0,
      color: CARD.goldCss,
      fontPx: 14,
      depth: 5,
    });
  }

  private clearHunterMatchupTeach(): void {
    this.matchupTeachText?.destroy();
    this.matchupTeachText = null;
  }

  private drawArena(): void {
    const L = this.layout;
    const v = L.view;
    // Zone / night variant (#361); hills + dais scale around the dais centre
    // (design y=240 in the layer). The sky covers the whole stage (#404).
    // Eclipse Trial rounds fight under the eclipse, never the daylight zone arena (#423).
    const variant = this.trial ? "night" : this.story ? storyArenaVariant(this.story) : undefined;
    const layers = resolveArenaLayers((key) => hasWorldTexture(this, key), variant);
    if (layers) {
      const a = ARENA_LAYER_SCALE * L.s;
      const stageY = L.dais.y + (DESIGN_SIZE / 2 - ARENA_DAIS_LAYER_Y) * a;
      // Wide stages: stretch the ground sideways a touch so no sky shows past its ends.
      const groundW = Math.max(DESIGN_SIZE * a, v.w + 40);
      const groundX = Phaser.Math.Clamp(L.dais.x, v.x + groundW / 2 - 20, v.x + v.w - groundW / 2 + 20);
      const sky = Math.max(v.w, v.h) + 8;
      const images = [
        this.add
          .image(v.x + v.w / 2, v.y + v.h / 2, ...imagineTexture(this, layers.sky))
          .setDisplaySize(sky, sky)
          .setDepth(-12),
        this.add
          .image(groundX, stageY, ...imagineTexture(this, layers.hills))
          .setDisplaySize(groundW, DESIGN_SIZE * a)
          .setDepth(-11),
        this.add
          .image(groundX, stageY, ...imagineTexture(this, layers.platform))
          .setDisplaySize(groundW, DESIGN_SIZE * a)
          .setDepth(-10),
      ];
      if (variant === "ember" && !layers.sky.startsWith("arena-ember")) {
        // Ember PNGs missing: warm the fallback arena instead.
        images.forEach((image) => image.setTint(0xffa080));
      }
      if (this.trial) {
        // Eclipse grade: violet overhead fading to an ember-lit floor.
        images.forEach((image) => image.setTint(0xb89cff, 0xb89cff, 0xffb08a, 0xffb08a));
      }
      return;
    }

    // Procedural fallback when Imagine arena layers are missing.
    const g = this.add.graphics().setDepth(-10);
    const { x: dx, y: dy } = L.dais;
    const s = L.s;
    g.fillStyle(0x5da9c8, 1);
    g.fillRect(v.x, v.y, v.w, v.h);
    g.fillStyle(0x4f9a6e, 1);
    g.fillRect(v.x, dy - 20 * s, v.w, v.y + v.h - dy + 20 * s);
    g.fillStyle(0xa5d87d, 0.9);
    g.fillEllipse(dx, dy, 520 * s, 120 * s);
    g.fillStyle(0xe5f1ad, 0.75);
    g.fillEllipse(dx, dy, 370 * s, 64 * s);
    g.lineStyle(3, 0x3d8b76, 0.55);
    g.strokeEllipse(dx, dy, 470 * s, 92 * s);
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
    this.playerRareGlow?.destroy();
    this.playerRareGlow = null;
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
      // Same rare tint + halo as the overworld and party cards (#423).
      if (creature) {
        this.playerRareGlow = applyRareLook(this, this.playerSprite, creature);
      }
    }
  }

  private getPlayerBattleDisplay(): {
    width: number;
    height: number;
  } {
    return this.scaledDisplay(
      this.resolvePartyIndex() < 0 ? BATTLE_PLAYER_DISPLAY : BATTLE_CREATURE_DISPLAY,
    );
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
      name: displayNameMarkedIn(partyCreature, getActiveCreatures()),
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
      this.trial?.decoratePlayer(combatant, false);
      return combatant;
    }
    primeOpeningCooldowns(combatant);
    // Eclipse modifiers / boons (#420): stats always, entry statuses on a fresh entrance.
    this.trial?.decoratePlayer(combatant, true);
    return combatant;
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
    this.moveCards = [];
    this.switchButton = undefined;
    this.befriendButton = undefined;
    this.hideBefriendTip();
  }

  /** A turn is resolving: fade the cards and ignore their input until rebuilt. */
  private dimActionButtons(): void {
    for (const button of this.actionButtons) {
      (button as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.5);
    }
    for (const card of this.moveCards) {
      card.setDimmed(true);
    }
  }

  /** Move cards (fixed keys 1-5 in order) plus Switch (S) / Befriend (B) buttons. */
  private buildActionButtons(): void {
    this.clearActionButtons();
    this.hideSwitchMenu();
    this.hideWandererFallbackMenu();

    const L = this.layout;
    const keys = showKeyHints();
    if (!this.forcedSwitch) {
      const rects = this.computeLayout(this.player.moves.length).moves;
      this.player.moves.forEach((move, i) => {
        const rect = rects[i];
        if (!rect) {
          return;
        }
        const card = this.addMoveCard(rect, move, keys ? String(i + 1) : undefined);
        this.moveCards.push(card);
        this.actionButtons.push(card.container);
      });
    }

    const canSwitch = this.hasSwitchablePartyMembers();
    const canBefriend = !this.forcedSwitch && this.canBefriendInBattle();
    const [first, second] = canSwitch && canBefriend ? L.aux : [L.auxSingle, L.auxSingle];
    if (canSwitch) {
      const free = this.freeSwitchAvailable && !this.forcedSwitch;
      this.switchButton = this.addActionButton(first, free ? "Switch · free" : "Switch", "secondary", keys ? "S" : undefined, () =>
        this.showSwitchMenu(),
      );
    }
    if (canBefriend) {
      this.befriendButton = this.addBefriendButton(canSwitch ? second : first, keys);
    }
  }

  /** Rounded encounter-card button sized to a layout rect (base px x ui). */
  private addActionButton(
    rect: Rect,
    label: string,
    tone: "primary" | "secondary" | "ghost",
    key: string | undefined,
    onActivate: () => void,
  ): CardButton {
    const ui = this.layout.ui;
    const button = new CardButton(this, rect.x + rect.w / 2, rect.y + rect.h / 2, {
      width: rect.w / ui,
      height: rect.h / ui,
      label,
      tone,
      key,
      onActivate,
    }).setUiScale(ui);
    button.container.setDepth(6);
    this.actionButtons.push(button.container);
    return button;
  }

  private addMoveCard(rect: Rect, move: MoveDefinition, key: string | undefined): MoveCard {
    const role = moveRole(move);
    const style = ROLE_STYLE[role];
    const cooldown = getCooldown(this.player, move.id);
    const ready = cooldown <= 0;
    const matchup = move.power > 0 ? getMatchup(move, this.wild) : "neutral";
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
      details.unshift(`ready in ${cooldown}`);
    }
    return new MoveCard(
      this,
      rect,
      this.layout.ui,
      {
        title: move.name,
        effect: this.formatMoveEffect(move),
        effectColor: MATCHUP_COLOR[matchup],
        sub: details.join(" · "),
        roleColor: style.color,
        ready,
        key,
      },
      () => {
        if (!this.waitingForPlayer || this.switchMenuOpen || this.wandererFallbackOpen) {
          return;
        }
        this.playerTurn(move);
      },
      () => {
        if (!this.waitingForPlayer || this.switchMenuOpen || this.wandererFallbackOpen) {
          return;
        }
        const turns = getCooldown(this.player, move.id);
        this.notifyBlocked(`${move.name}: ready in ${turns}`);
      },
    );
  }

  /** "Not yet" feedback (#409): short toast over the arena, a log line, a quiet tick. */
  private notifyBlocked(message: string): void {
    // Held / mashed keys: one sound, log line and toast per ~250ms.
    const now = this.time.now;
    if (now - this.lastBlockedAt < 250) {
      return;
    }
    this.lastBlockedAt = now;
    playDeniedSfx(this);
    this.log(message);
    this.blockedToast?.destroy();
    const L = this.layout;
    // The hunter-matchup teach tip lives at the same anchor: sit just below it.
    const lift = this.matchupTeachText?.active ? this.matchupTeachText.displayHeight + 8 * L.ui : 0;
    const toast = addToast(this, L.tip.x, L.tip.y + lift, message, {
      ui: L.ui,
      maxW: Math.min(L.arenaRegion.w - 24 * L.ui, 360 * L.ui),
      originY: 0,
      depth: 13,
    });
    this.blockedToast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 0,
      delay: 900,
      duration: 300,
      onComplete: () => {
        toast.destroy();
        if (this.blockedToast === toast) {
          this.blockedToast = undefined;
        }
      },
    });
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

  private addBefriendButton(rect: Rect, keys: boolean): CardButton {
    const assured = isStory1BefriendGuaranteed(this.wildCreatureId);
    const odds = this.befriendOdds();
    const offering = assured ? "none" : currentOffering(this.wildCreatureId);
    // The cost rides on the label so touch players see it without a hover.
    const tag = offering === "folk-seal" ? " · Seal" : offering === "favorite-bait" ? " · Bait" : "";
    const btn = this.addActionButton(
      rect,
      assured ? ASSURED_BEFRIEND_LABEL : `${formatBefriendOddsLabel(odds.chance)}${tag}`,
      "primary",
      keys ? "B" : undefined,
      () => this.onBefriendPressed(assured ? null : odds),
    );
    btn.container.on("pointerover", () => {
      if (!this.coarsePointer()) {
        this.showBefriendTip(assured ? null : odds);
      }
    });
    btn.container.on("pointerout", () => {
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
  private onBefriendPressed(odds: BefriendOdds | null): void {
    if (!this.waitingForPlayer) {
      return;
    }
    if (this.coarsePointer() && this.befriendTip.length === 0) {
      this.showBefriendTip(odds, true);
      return;
    }
    this.attemptBefriend();
  }

  /** Breakdown toast over the arena: "Base 28% · Weakened +20% · Rooted +12%". */
  private showBefriendTip(odds: BefriendOdds | null, confirm = false): void {
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
    const L = this.layout;
    const tip = addToast(this, L.tip.x, L.tip.y, footer ? `${lines}\n${footer}` : lines, {
      ui: L.ui,
      maxW: Math.min(L.arenaRegion.w - 24 * L.ui, 480 * L.ui),
      originY: 0,
      depth: 13,
    });
    this.befriendTip.push(tip);
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
    this.dimActionButtons();
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
    const joined = addToParty(this.wildCreatureId, this.wildLevel);
    // A rare roll shows on the spot, before the result card (#423).
    this.wildRareGlow = applyRareLook(this, this.wildSprite, joined);
    const line = `${this.wild.name} joined you!${joined.rare ? " A rare tint ✦" : ""}`;
    this.log(line);
    this.fx.confettiBurst(this.layout.banner.x, this.layout.arenaRegion.y + 40);
    this.finishBattle(
      { tone: "special", title: "New friend!", line: `${line} (Lv ${this.wildLevel})` },
      null,
    );
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

  /** Veil + scaled card container for a modal menu; returns the container. */
  private openModal(
    objects: Phaser.GameObjects.GameObject[],
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const L = this.layout;
    const scale = Math.min(L.ui, L.modal.maxW / width, L.modal.maxH / height);
    // Blocks taps on the cards below; the veil itself does nothing.
    const veil = this.add
      .rectangle(L.modal.x, L.modal.y, 8000, 8000, CARD.veil, 0.55)
      .setInteractive()
      .setDepth(19);
    const box = this.add.container(L.modal.x, L.modal.y).setScale(scale).setDepth(20);
    const panel = this.add.graphics();
    drawCardPanel(panel, -width / 2, -height / 2, width, height, 26);
    box.add(panel);
    objects.push(veil, box);
    return box;
  }

  /** Party picker: creature cards with art, HP, level / type chips, statuses (#404). */
  private showSwitchMenu(): void {
    if (!this.waitingForPlayer || this.switchMenuOpen) {
      return;
    }
    this.switchMenuOpen = true;
    this.hideBefriendTip();
    const keys = showKeyHints();
    const actives = getActiveCreatures();
    const currentIndex = this.resolvePartyIndex();
    const W = 480;
    const rowH = 76;
    const rowGap = 8;
    const head = 92;
    const foot = this.forcedSwitch ? 22 : 86;
    const H = head + actives.length * (rowH + rowGap) - rowGap + foot;
    const box = this.openModal(this.switchMenuObjects, W, H);
    const top = -H / 2;

    box.add(
      this.add
        .text(0, top + 36, this.forcedSwitch ? "Who steps in?" : "Choose a creature", {
          fontFamily: HUD_FONT,
          fontSize: "26px",
          fontStyle: "bold",
          color: CARD.creamCss,
        })
        .setOrigin(0.5),
    );
    const note = this.forcedSwitch
      ? "Pick who goes next."
      : this.freeSwitchAvailable
        ? "First switch is free — no turn spent."
        : "Switching uses your turn — the foe still strikes.";
    box.add(
      this.add
        .text(0, top + 66, note, {
          fontFamily: HUD_FONT,
          fontSize: "16px",
          fontStyle: "bold",
          color: this.freeSwitchAvailable && !this.forcedSwitch ? CARD.goldCss : CARD.mutedCss,
        })
        .setOrigin(0.5),
    );

    this.switchRowActions = new Map();
    actives.forEach((creature, index) => {
      const def = getCreatureDefinition(creature.definitionId);
      const active = index === currentIndex;
      const fainted = creature.currentHp <= 0;
      const pickable = !active && !fainted;
      const rowW = W - 40;
      const rowX = -rowW / 2;
      const rowY = top + head + index * (rowH + rowGap);
      const row = this.add.container(0, rowY + rowH / 2);
      const bg = this.add.graphics();
      const draw = (hover: boolean): void => {
        bg.clear();
        bg.fillStyle(active ? 0x183048 : fainted ? 0x151f2e : hover ? 0x26405f : 0x1d3250, 1);
        bg.fillRoundedRect(rowX, -rowH / 2, rowW, rowH, 14);
        bg.lineStyle(2, active ? 0xffd98a : hover ? CARD.cream : 0x6e8db0, active ? 0.9 : fainted ? 0.35 : 0.85);
        bg.strokeRoundedRect(rowX, -rowH / 2, rowW, rowH, 14);
      };
      draw(false);
      row.add(bg);

      // Portrait on a little lit disc.
      const disc = this.add.graphics();
      disc.fillStyle(CARD.panelDeep, 1);
      disc.fillCircle(rowX + 40, 0, 30);
      row.add(disc);
      const art = this.add.image(
        rowX + 40,
        0,
        ...ensureTrimmedTexture(this, ...resolveCreaturePoseTexture(this, def.spriteKey, "battle")),
      );
      fitContainDisplay(art, { width: 56, height: 56 });
      if (fainted) {
        art.setTint(0x6a7a8c).setAlpha(0.6);
      }
      row.add(art);

      const nameX = rowX + 82;
      const chips = ([
        [`Lv ${creature.level}`, 0x2a4462, CARD.creamCss],
        [def.folkloreType.toUpperCase(), TYPE_CHIP_COLORS[def.folkloreType], CARD.inkCss],
      ] as const).map(([label, fill, color]) => {
        const chip = addChip(this, 0, -rowH / 2 + 22, label, fill, color, 12);
        if (fainted) {
          chip.setAlpha(0.5);
        }
        return chip;
      });
      const chipsW = chips.reduce((sum, chip) => sum + chip.width + 6, 0);
      // Right end keeps room for the keycap / IN BATTLE / FAINTED tag.
      const nameRoom = rowX + rowW - 14 - 92 - chipsW - 8 - nameX;
      const name = this.add
        .text(nameX, -rowH / 2 + 10, displayNameMarkedIn(creature, getActiveCreatures()), {
          fontFamily: HUD_FONT,
          fontSize: "19px",
          fontStyle: "bold",
          color: fainted ? CARD.mutedCss : CARD.creamCss,
        })
        .setOrigin(0, 0);
      fitText(name, nameRoom, 14);
      row.add(name);
      let chipX = nameX + name.width + 8;
      for (const chip of chips) {
        chip.setX(chipX + chip.width / 2);
        row.add(chip);
        chipX += chip.width + 6;
      }

      // HP bar + numbers.
      const maxHp = getEffectiveMaxHp(creature);
      const ratio = Math.max(0, Math.min(1, creature.currentHp / maxHp));
      const barX = nameX;
      const barY = 14;
      const barW = rowW - 82 - 128;
      row.add(this.add.rectangle(barX, barY, barW, 10, CARD.panelDeep, 1).setOrigin(0, 0.5).setStrokeStyle(1, CARD.line, 1));
      if (ratio > 0) {
        row.add(
          this.add
            .rectangle(barX, barY, barW * ratio, 10, ratio > 0.5 ? 0x6cd86a : ratio > 0.25 ? 0xf2c94c : 0xeb5757, 1)
            .setOrigin(0, 0.5),
        );
      }
      row.add(
        this.add
          .text(barX + barW + 8, barY, `${creature.currentHp}/${maxHp}`, {
            fontFamily: HUD_FONT,
            fontSize: "14px",
            fontStyle: "bold",
            color: CARD.mutedCss,
          })
          .setOrigin(0, 0.5),
      );

      // Battle statuses carried on the bench (or on the active creature).
      const statuses = active
        ? this.player.statuses
        : this.benchState.get(creature.instanceId)?.statuses;
      let statusX = rowX + rowW - 14;
      // A fainted lead (forced switch) reads FAINTED, not IN BATTLE (#423).
      const rightLabel = fainted ? "FAINTED" : active ? "IN BATTLE" : null;
      if (rightLabel) {
        const label = this.add
          .text(statusX, -rowH / 2 + 22, rightLabel, {
            fontFamily: HUD_FONT,
            fontSize: "13px",
            fontStyle: "bold",
            color: active && !fainted ? CARD.goldCss : CARD.mutedCss,
          })
          .setOrigin(1, 0.5);
        row.add(label);
        statusX -= label.width + 8;
      } else if (keys) {
        const cap = addKeycap(this, 0, -rowH / 2 + 22, String(index + 1), true);
        cap.setX(statusX - cap.width / 2);
        row.add(cap);
        statusX -= cap.width + 8;
      }
      for (const status of (statuses ?? []).filter((st) => st.turns > 0)) {
        const chip = this.add
          .text(statusX, barY, formatStatusChip(status.id, status.turns), {
            color: CARD.inkCss,
            backgroundColor: STATUS_DEFS[status.id].color,
            fontFamily: HUD_FONT,
            fontSize: "11px",
            fontStyle: "bold",
            padding: { x: 4, y: 1 },
          })
          .setOrigin(1, 0.5);
        row.add(chip);
        statusX -= chip.width + 4;
      }

      if (pickable) {
        const pick = (): void => this.switchToPartyIndex(index);
        this.switchRowActions.set(index, pick);
        row.setSize(rowW, rowH);
        row.setInteractive(new Phaser.Geom.Rectangle(0, -rowGap / 2, rowW, rowH + rowGap), Phaser.Geom.Rectangle.Contains);
        if (row.input) {
          row.input.cursor = "pointer";
        }
        row.on("pointerover", () => draw(true));
        row.on("pointerout", () => draw(false));
        row.on("pointerup", pick);
      }
      box.add(row);
    });

    if (!this.forcedSwitch) {
      const cancel = new CardButton(this, 0, H / 2 - 44, {
        width: 200,
        height: 50,
        label: "Cancel",
        tone: "ghost",
        key: keys ? "Esc" : undefined,
        onActivate: () => {
          if (!this.forcedSwitch) {
            this.hideSwitchMenu();
          }
        },
      });
      box.add(cancel.container);
    }
  }

  private hideSwitchMenu(): void {
    for (const object of this.switchMenuObjects) {
      object.destroy();
    }
    this.switchMenuObjects = [];
    this.switchRowActions = new Map();
    this.switchMenuOpen = false;
  }

  private showWandererFallbackMenu(): void {
    if (this.wandererFallbackOpen) {
      return;
    }

    this.wandererFallbackOpen = true;
    const keys = showKeyHints();
    const weaponId = getBestWeaponId();
    const armed = weaponId ? buildArmedWanderer(weaponId) : undefined;
    const W = 440;
    const H = 250;
    const box = this.openModal(this.wandererFallbackObjects, W, H);

    box.add(
      this.add
        .text(0, -H / 2 + 42, "Your party has fainted!", {
          fontFamily: HUD_FONT,
          fontSize: "26px",
          fontStyle: "bold",
          color: CARD.creamCss,
        })
        .setOrigin(0.5),
    );
    box.add(
      this.add
        .text(0, -H / 2 + 80, armed ? `Fight on as ${armed.name}?` : "No weapon available.", {
          fontFamily: HUD_FONT,
          fontSize: "17px",
          color: CARD.mutedCss,
          align: "center",
          wordWrap: { width: W - 60, useAdvancedWrap: true },
        })
        .setOrigin(0.5),
    );

    const retreat = (): void => this.endBattle(false);
    const fight = armed ? (): void => this.switchToArmedWanderer() : undefined;
    this.fallbackActions = { fight, retreat };
    const buttons: { label: string; tone: "secondary" | "ghost"; key: string; run: () => void }[] = [];
    if (fight) {
      buttons.push({ label: "Fight", tone: "secondary", key: "1", run: fight });
    }
    buttons.push({ label: "Retreat", tone: "ghost", key: "F", run: retreat });
    const bw = 180;
    const gap = 16;
    const total = buttons.length * bw + (buttons.length - 1) * gap;
    buttons.forEach((b, i) => {
      const button = new CardButton(this, -total / 2 + bw / 2 + i * (bw + gap), H / 2 - 62, {
        width: bw,
        height: 56,
        label: b.label,
        tone: b.tone,
        key: keys ? b.key : undefined,
        onActivate: b.run,
      });
      if (i === 0) {
        button.setFocused(true);
      }
      box.add(button.container);
    });
  }

  private hideWandererFallbackMenu(): void {
    for (const object of this.wandererFallbackObjects) {
      object.destroy();
    }
    this.wandererFallbackObjects = [];
    this.fallbackActions = {};
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
    this.fx.setHome("player", this.layout.playerHome.x, this.layout.playerHome.y);
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
      // Swift Swap (#420) leaves a second free switch.
      this.freeSwitchAvailable = this.trial?.takeFreeSwitch() ?? false;
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
    this.dimActionButtons();
    this.trial?.notePlayerTurn();
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
      if ((this.trial?.playerEndTurn(this.player) ?? []).length > 0) {
        message += " Pure Light washes it clean.";
      }
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
      this.trial?.noteFoeMove(guarded, intent.role, result.attack?.kind === "hit");
      // Twin Shadows (#420): on its echo turn the foe strikes again.
      const echo = this.trial?.afterFoeMove(this.wild, this.player, intent.move, this.rng) ?? null;
      present = () => {
        let line = this.describeMove(this.wild, this.player, result, "player");
        if (parried) {
          this.storyUi?.playParry(this.wildSprite);
          line += ` ${this.wild.name} staggers — she loses her next turn!`;
        }
        if (echo) {
          line += ` Twin Shadows! ${this.describeMove(this.wild, this.player, echo, "player")}`;
        }
        return line;
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
    const regen = this.trial?.foeEndTurn(this.wild) ?? 0;
    if (regen > 0) {
      message += ` Moonfed: ${this.wild.name} +${regen} HP.`;
      this.fx.heal("wild");
    }
    this.trialStrip?.refresh();
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
    if (!this.story && !this.trial && !this.usingArmedWanderer && hasCraftedWeapon()) {
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
      fitDisplay(this.wildSprite, this.scaledDisplay(BATTLE_CREATURE_DISPLAY));
      this.storyUi?.decorateFoe(this.wildSprite);
      this.fx.setHome("wild", this.layout.wildHome.x, this.layout.wildHome.y);
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

    const L = this.layout;
    const ui = L.ui;
    const y = L.intent.y;
    const badge = this.add
      .text(0, y, style.label, {
        color: CARD.inkCss,
        backgroundColor: style.css,
        fontFamily: HUD_FONT,
        fontSize: `${Math.round(12 * ui)}px`,
        fontStyle: "bold",
        padding: { x: Math.round(5 * ui), y: Math.round(2 * ui) },
      })
      .setOrigin(0, 0.5)
      .setDepth(8);
    const text = this.add
      .text(0, y, `Next: ${move.name}  ${detail}`, {
        color: CARD.creamCss,
        fontFamily: HUD_FONT,
        fontSize: `${Math.round(14 * ui)}px`,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setDepth(8);
    const gap = 6 * ui;
    // The intent row spans the arena column; a long detail line shrinks to fit
    // instead of running off the screen (#391).
    const room = L.intent.right - L.intent.left - 16 * ui;
    let fontSize = Math.round(14 * ui);
    while (badge.width + gap + text.width > room && fontSize > Math.round(11 * ui)) {
      fontSize -= 1;
      text.setFontSize(fontSize);
    }
    if (badge.width + gap + text.width > room) {
      // Long boss beats ("winding up — Cinderfall NEXT turn…") wrap to two lines
      // inside the row instead of running off the edge.
      text.setWordWrapWidth(room - badge.width - gap, true);
    }
    const contentWidth = badge.width + gap + text.width;
    const minCenter = L.intent.left + contentWidth / 2 + 8 * ui;
    const centerX = Phaser.Math.Clamp(
      this.wildSprite.x,
      minCenter,
      Math.max(minCenter, L.intent.right - contentWidth / 2 - 8 * ui),
    );
    const left = centerX - contentWidth / 2;
    badge.setX(left);
    text.setX(left + badge.width + gap);
    const plate = this.add
      .rectangle(centerX, y, contentWidth + 16 * ui, Math.max(28 * ui, text.height + 8 * ui), CARD.panelDeep, 0.9)
      .setStrokeStyle((role === "finisher" ? 2 : 1) * ui, style.color, 0.9)
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

  /** Rounded navy plate: name · level · type, HP bar, status chips; scaled by ui. */
  private createHpHud(rect: Rect, foe = false): HpHud {
    const ui = this.layout.ui;
    const w = rect.w / ui;
    const h = BASE.plate.h;
    const box = this.add.container(rect.x, rect.y).setScale(ui).setDepth(4);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(1, 3, w, h, 12);
    g.fillStyle(CARD.panel, 0.92);
    g.fillRoundedRect(0, 0, w, h, 12);
    // Foe plate rims warm, yours cool, so the two read apart at a glance.
    g.lineStyle(2, foe ? 0xffb38a : 0x8fd3f0, 0.8);
    g.strokeRoundedRect(0, 0, w, h, 12);
    const name = this.add.text(12, 6, "", {
      color: CARD.creamCss,
      fontFamily: HUD_FONT,
      fontSize: "15px",
      fontStyle: "bold",
    });
    const barWidth = w - 24 - PLATE_HP_TEXT_W;
    const track = this.add
      .rectangle(12, 33, barWidth, 10, CARD.panelDeep, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x000000, 0.6);
    const bar = this.add.rectangle(12, 33, barWidth, 10, 0x6cd86a, 1).setOrigin(0, 0.5);
    const hp = this.add
      .text(w - 12, 33, "", {
        color: CARD.creamCss,
        fontFamily: HUD_FONT,
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);
    box.add([g, name, track, bar, hp]);
    return { name, hp, bar, chips: [], chipX: 12, chipY: 50, barWidth, container: box, nameWidth: w - 24 };
  }

  private syncHpHud(hud: HpHud, who: BattleCombatant, level: number | null): void {
    // A doused boss keeps her form's type on the bar; the chip says Doused.
    const shownType = (hud === this.wildHud && this.story?.form?.type) || who.folkloreType;
    hud.name.setText(
      `${who.name}${level !== null ? `  Lv ${level}` : ""}  ·  ${shownType}`,
    );
    if (hud.nameWidth) {
      // Narrow phone plates: shrink, then ellipsize a long name line.
      hud.name.setFontSize(15);
      fitText(hud.name, hud.nameWidth, 11);
    }
    // The boss bar shows the current form's slice of her pool (#401).
    const shown = (hud === this.wildHud && this.storyUi?.barHp()) || { current: who.currentHp, max: who.maxHp };
    const ratio = Math.max(0, shown.current / shown.max);
    const width = hud.barWidth * ratio;
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
          color: CARD.inkCss,
          backgroundColor: chip.color,
          fontFamily: HUD_FONT,
          fontSize: "11px",
          fontStyle: "bold",
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0, 0.5);
      hud.container.add(t);
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

  /** Log line in the sheet; long lines step the font down to stay inside the box. */
  private log(message: string): void {
    const ui = this.layout.ui;
    const room = (this.logFrame?.h ?? 40 * ui) - 6 * ui;
    let size = Math.round(15 * ui);
    this.logText.setFontSize(size).setText(message);
    while (this.logText.height > room && size > Math.round(11 * ui)) {
      size -= 1;
      this.logText.setFontSize(size);
    }
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
      showBattleResultPanel(
        this,
        panel,
        this.fx.mode(),
        this.fx.timings().xpFill,
        () => this.exitBattle(),
        this.resultFrame(),
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
    if (this.trial) {
      // Eclipse Trial (#420): no XP / Dust / bond here; the runner settles the round.
      this.trial.reportResult(playerWon);
      const boss = this.trial.isBoss;
      const line = playerWon
        ? boss
          ? "The Eclipse Shade unravels into moonlight."
          : `Round ${this.trial.round.index + 1} cleared.`
        : "The eclipse swallows the light. Your companions are safe — nothing is lost.";
      this.log(line);
      panel = playerWon
        ? { tone: "special", title: boss ? "Eclipse broken!" : "Round cleared!", line }
        : { tone: "defeat", line };
    } else if (playerWon && this.wildCreatureId === TIDE_SOVEREIGN_ID) {
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
      if (isStorySparId(this.story.def.id)) {
        reportStoryBattleResult(this.story.def.id, playerWon);
      }
      const line = playerWon
        ? `${this.story.def.name} yields. Bragging rights only on a rematch.`
        : this.story.isBoss
          ? "The Matriarch's heat drives you back. Wren hauls everyone clear."
          : "Wren takes this one. Nobody's hurt — just pride.";
      this.log(line);
      panel = playerWon ? { tone: "special", title: "Victory!", line } : { tone: "defeat", line };
    } else if (playerWon) {
      if (this.story && isStorySparId(this.story.def.id)) {
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
        this.fx.confettiBurst(this.layout.banner.x, this.layout.arenaRegion.y + 40);
      }
      showBattleResultPanel(
        this,
        panel,
        this.fx.mode(),
        this.fx.timings().xpFill,
        () => this.exitBattle(),
        this.resultFrame(),
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

  private resultFrame(): ResultPanelFrame {
    const { modal, ui } = this.layout;
    return { x: modal.x, y: modal.y, ui, maxW: modal.maxW, maxH: modal.maxH };
  }

  private exitBattle(): void {
    this.cameras.main.fadeOut(140, 255, 255, 255);
    this.time.delayedCall(145, () => {
      this.scene.stop("BattleScene");
      if (this.trial) {
        // The trial scene takes over (it listens for this shutdown); the world stays paused.
        return;
      }
      this.scene.stop("EncounterScene");
      this.scene.resume("IsometricScene");
    });
  }
}
