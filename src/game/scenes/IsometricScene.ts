import {
  IMAGINE_ATLAS_KEY,
  hasImagineFrame,
  hasWorldTexture,
  imagineTexture,
} from "../render/imagineAssets";
import Phaser from "phaser";
import {
  ensureGroveMusic,
  initMuteControl,
  playGatherSfx,
  playShrineSfx,
  playStepSfx,
  setAudioZone,
  unlockAudioFromGesture,
} from "../audio/gameAudio";
import {
  TILE_HEIGHT,
  TILE_WIDTH,
  depthForGridCell,
  gridToScreen,
  hudDepthAbovePlayer,
  playerDepthAboveGrid,
} from "../isometric";
import {
  applyNpcSprite,
  ensureWorldTextures,
  getBoatTextureKey,
  getBoundaryTextureKey,
  getDockTextureKey,
  getFloorTextureKey,
  getWaterTextureKey,
} from "../render/worldTextures";
import {
  BOUNDARY_DISPLAY,
  FLOOR_DISPLAY,
  PLAYER_DISPLAY,
  PROP_DISPLAY,
  fitDisplay,
} from "../render/displaySizes";
import {
  placeWorldHudText,
  RENDER_DPR,
  resizeGameForDisplay,
} from "../render/pixelRatio";
import {
  applyPlayerPose,
  ensurePlayerAnims,
  bindPlayerDisplaySize,
} from "../render/playerAnims";
import {
  WALK_CYCLES_PER_TILE,
  walkBobOffset,
  walkFootfallsSince,
} from "../render/playerWalk";
import {
  createPartyOverworldFollowerState,
  destroyPartyOverworldFollowers,
  preparePartyOverworldFollowerTextures,
  syncPartyOverworldFollowers,
  type PartyOverworldFollowerState,
} from "../render/partyOverworldFollowers";
import {
  ENCOUNTER_TRAVEL_THRESHOLD,
  shouldAttemptWildEncounter,
} from "../encounters/tables";
import { getHabitatProfile } from "../encounters/habitatProfiles";
import {
  onZoneEnter,
  resolveWildEncounterCreature,
  rollWildTriggerChance,
  shouldGuaranteeWildTrigger,
} from "../encounters/habitatRuntime";
import {
  grantEncounterImmunity,
  isEncounterImmune,
} from "../encounters/encounterImmunity";
import {
  appendGodSailCheatKey,
  canForceGodSailEncounter,
  lockPendingGodSailEncounter,
  rollGodSailEncounter,
  shouldAttemptGodSailEncounter,
  shouldAttemptHermitTideEncounter,
  type PendingGodSailEncounter,
} from "../encounters/godSail";
import {
  appendGodLandCheatKey,
  canForceGodLandEncounter,
  isWalkableLandTile,
  lockPendingGodLandEncounter,
  rollGodLandEncounter,
  shouldAttemptGodLandEncounter,
  type PendingGodLandEncounter,
} from "../encounters/godLand";
import { isOverworldEncounterSafeTile } from "../encounters/overworldEncounters";
import { overworldEncounterPacer } from "../encounters/encounterPacing";
import { visitShrineAltar, wakeStrandedParty } from "../world/shrineHeal";
import { isDomKeyboardTarget } from "../ui/canvasFocus";
import {
  claimSecondActWantOnIslandLand,
  consumeQuestToast,
  getActiveQuestId,
  recordQuestEvent,
} from "../story/questProgress";
import { QUEST_ORDER } from "../story/quests";
import {
  getSovereignVoyageHint,
  getSovereignVoyageStep,
} from "../story/sovereignVoyage";
import { FINALE_COMPLETE_EVENT } from "../story/finaleScene";
import { launchFinaleCard } from "../finale/launchFinaleCard";
import { claimFinaleCard } from "../finale/finaleTrigger";
import { playerParty } from "../creatures/party";
import { consumeAchievementToast } from "../progression/achievements";
import {
  flashInviteStatus,
  hideManualInviteUrl,
  setCopyInviteHandler,
  showManualInviteUrl,
  unlockHostInviteChrome,
  updateStatusPanel,
} from "../ui/statusPanel";
import { syncQuestHudPosition } from "../ui/questHud";
import {
  WALK_HINT_TEXT,
  hasWalkedBefore,
  markWalked,
  movementHintEligible,
  pickTransientHint,
  shouldShowWalkHint,
} from "../ui/walkHint";
import { scriptedOpeningCreature } from "../opening/openingScript";
import {
  hideOpeningCaption,
  isOpeningCaptionShowing,
} from "../opening/openingCaption";
import { layoutStage } from "../ui/stageLayout";
import { isCutsceneActive } from "../ui/hudLock";
import {
  areTouchControlsVisible,
  consumeTouchInteract,
  getTouchAxes,
  initTouchControls,
  setTouchControlsEnabled,
} from "../ui/touchControls";
import { PARTY_CHANGED_EVENT } from "../creatures/partyEvents";
import { canOccupy } from "../world/collision";
import { applyNameIntroKeyboardGate } from "../input/nameIntroKeyboardGate";
import {
  getPlayerName,
  hasPlayerName,
  onPlayerNameChange,
} from "../world/playerName";
import { shareOrCopyInviteLink } from "../world/invite";
import { takePendingWorldPosition } from "../world/worldSnapshot";
import { isVisitorMode } from "../world/worldSession";
import {
  notifyWorldChanged,
  persistHostSave,
  updateHostPosition,
} from "../world/worldSave";
import {
  STARTING_ZONE_ID,
  getZone,
} from "../world/zones";
import {
  isFirstIslandLanded,
  markZoneDiscovered,
  toggleOverworldUnlock,
  worldState,
} from "../world/worldState";
import { TileType, type ZoneDefinition, type ZoneId } from "../world/zoneTypes";
import { cottageFrame } from "../world/cottageWalls";
import {
  getZoneProps,
  isGatePropOpen,
  resolvePropTextureKey,
} from "../world/zoneProps";
import { findNpcNearPlayer, getZoneNpcs, nearestNpcDistance } from "../world/npcs";
import {
  findMinigameNearPlayer,
  shouldPreferMinigameOverNpc,
} from "../minigames/ids";
import { canLaunchMinigame } from "../minigames/progress";
import { findGatherPropNearPlayer } from "../world/gatherNodes";
import { overlayAction, pickInteractPrompt } from "../world/interactPrompt";
import { findNearbyDoor, isNearShrine } from "../world/interactProximity";
import {
  getGatherCooldownRemainingMs,
  tryHarvestNode,
} from "../world/gatherState";
import {
  isBoatPlaced,
  getMooredDock,
  getArchipelagoMooringPad,
  isNearAnyDock,
  isNearHarborDock,
  isNearArchipelagoDock,
  isSailing,
  EAST_LANDING_EMBARK_WATER,
  HARBOR_DOCK,
  tryDisembark,
  tryEmbark,
  tryPlaceBoat,
} from "../world/dockBoat";
import {
  allowsSailZoneTransition,
  ARCHIPELAGO_CAMERA_FIT_HEIGHT,
  ARCHIPELAGO_GATE_COLUMNS,
  ARCHIPELAGO_MAX_WIDTH,
  archipelagoVisualWindow,
  biomeAtIslandTile,
  isArchipelagoIslandPosition,
  ensureArchipelagoChunksAround,
  getArchipelagoPropsInWindow,
  isInArchipelagoVisualWindow,
  islandIndexAtTile,
  ISLAND_BIOME_FLOOR_TINT,
  prepareArchipelagoForPosition,
  resetArchipelagoStream,
  type ArchipelagoVisualWindow,
  type ChunkEnsureResult,
} from "../world/archipelagoStream";
import { CAIRN_ISLAND_INDEX } from "../world/cairnIsland";
import { HERMIT_ISLAND_INDEX } from "../world/hermitIsland";
import { getItemCount } from "../inventory/playerInventory";
import { isSovereignPlateSuppressingWild } from "../inventory/sovereignPlate";
import {
  OPEN_PORTABLE_SHRINE_EVENT,
  PORTABLE_MOONSHRINE_ID,
  type OpenPortableShrineDetail,
} from "../ui/craftingHud";
import { OverworldFx } from "../render/fx/overworldFx";
import { HUD_PILL_TEXT_STYLE, attachHudPill } from "../ui/hudPill";
import { OverworldCompanions } from "../companions/overworldCompanions";
import { floorTintAt } from "../render/fx/floorTint";
import { floorVariantKey } from "../render/floorVariants";

const FLOOR_LAYER = 0;
const PROP_LAYER = 0.45;
/** World px trimmed from zone bounds when fitting zoom (80px canopy margin → 32). */
const ZONE_FIT_TRIM = 96;
/** Highest CSS-px zoom for a zone (interiors on big monitors). */
const MAX_ZONE_ZOOM_CSS = 2.2;
/** Canopy / interior backdrop painted past the zone bounds (see drawBackdrop). */
const ZONE_CANOPY_PAD_MAX = 480;
const MOVE_SPEED = 6;
const ZONE_CAMERA_COLORS: Record<ZoneId, number> = {
  grove: 0x83c5a0,
  shrine: 0x6c629e,
  village: 0xf0b46e,
  overworld: 0x78b9d8,
  harbor: 0x6aa8c8,
  archipelago: 0x5a98b8,
  mistwood: 0x8a78b8,
  emberfen: 0xc88858,
  "warden-cottage": 0x8a5f3c,
  "weaver-cottage": 0x8a5f3c,
  "hearthkeep-cottage": 0x8a5f3c,
  "hermit-cottage": 0x8a5f3c,
};

/** Behind the cottage walls there is no sky, just dim timber. */
const INTERIOR_BACKDROP_COLOR = 0x3a2a22;

type Facing = "south" | "north" | "east" | "west";

export class IsometricScene extends Phaser.Scene {
  private currentZoneId: ZoneId = STARTING_ZONE_ID;
  private playerGridX = 3;
  private playerGridY = 7;
  private playerFacing: Facing = "south";
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private unlockKey!: Phaser.Input.Keyboard.Key;
  private inviteKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  /** E pressed since the last frame; survives a tap shorter than one frame (#390). */
  private interactTapped = false;
  /** Hand captured keys (arrows, WASD, E) back to a focused DOM control (#390). */
  private onDomFocusChange = (): void => {
    window.setTimeout(() => {
      const keyboard = this.input?.keyboard;
      if (keyboard) {
        keyboard.manager.preventDefault =
          hasPlayerName() && !isDomKeyboardTarget(document.activeElement);
      }
    }, 0);
  };
  private travelSinceEncounter = 0;
  /** Successful walk distance used to consume the first-step WASD ghost. */
  private walkHintTravel = 0;
  private walkHint?: Phaser.GameObjects.Text;
  private walkHintFading = false;
  /** First walk persisted this session / remembered walk (read once). */
  private walkMarked = false;
  private walkedMemo?: boolean;
  /** Cached stick visibility; refreshed on layout (CSS media query changes with size). */
  private touchControlsShown = false;
  private godSailTravelSinceEncounter = 0;
  private godLandTravelSinceEncounter = 0;
  private inEncounter = false;
  private pendingGodSailEncounter?: PendingGodSailEncounter;
  private pendingGodLandEncounter?: PendingGodLandEncounter;
  private godSailCheatBuffer = "";
  private godLandCheatBuffer = "";
  private inShrine = false;
  private inDialogue = false;
  private inMinigame = false;
  private shrinePrompt?: Phaser.GameObjects.Text;
  private gatherToast?: Phaser.GameObjects.Text;
  private questToast?: Phaser.GameObjects.Text;
  private achievementToast?: Phaser.GameObjects.Text;
  private nameTag?: Phaser.GameObjects.Text;
  private unbindPlayerName?: () => void;
  private worldOrigin = { x: 0, y: 0 };
  private onWindowResize = () => this.onResize();
  private statusObserver?: ResizeObserver;
  /** Party changed via Party UI while the overworld is live (paused paths celebrate on resume). */
  private onPartyChanged = (): void => {
    if (this.scene.isActive()) {
      this.celebrateResume(false);
    }
  };
  /**
   * Shrine finale dialogue closed (#385): show the credits card once per save
   * (#393, #399), then hand back to the world with the Sovereign voyage hook.
   */
  private onFinaleComplete = (): void => {
    if (isVisitorMode() || !claimFinaleCard()) {
      return;
    }
    launchFinaleCard(this, {
      playerName: getPlayerName(),
      party: playerParty.creatures,
      onContinue: () => this.continueAfterFinale(),
    });
  };
  private layoutLocked = false;
  private isMoving = false;
  /** Distance-driven gait phase (cycles); advances only when a step applies. */
  private walkPhase = 0;
  private playerBaseY = 0;
  /** Moored boat sprite at the Harbor dock (hidden while sailing). */
  private dockBoat?: Phaser.GameObjects.Image;
  /** Boat sprite that follows the player while sailing. */
  private sailingBoat?: Phaser.GameObjects.Image;
  /** Active-party overworld sprites (presence tell). */
  private partyFollowers: PartyOverworldFollowerState =
    createPartyOverworldFollowerState();
  /** Particles, lighting, follower life, title card (#362). */
  private fx?: OverworldFx;
  /** Companion ability sites, tier-up celebrations, nickname prompt (#367). */
  private companions?: OverworldCompanions;
  /** Westmost column still holding archipelago stream sprites (exclusive cull). */
  /** Live stream-tagged sprites; culls iterate this, never the full display list (#194). */
  private streamSprites = new Set<Phaser.GameObjects.Image>();

  private registerStreamSprite(
    img: Phaser.GameObjects.Image,
    x: number,
    y: number,
  ): void {
    img.setData("streamX", x);
    img.setData("streamY", y);
    this.streamSprites.add(img);
    img.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.streamSprites.delete(img);
    });
  }

  private archipelagoVisualWin: ArchipelagoVisualWindow = {
    xMin: ARCHIPELAGO_GATE_COLUMNS,
    xMax: ARCHIPELAGO_MAX_WIDTH,
    yMin: 0,
    yMax: 100,
  };
  /** Above all tiles/props for the current zone size (grows with archipelago). */
  private playerDepth = playerDepthAboveGrid(1, 1);
  // ponytail: temporary god-encounter cheat
  private onGodCheatKeyDown = (event: KeyboardEvent) => {
    const sail = appendGodSailCheatKey(this.godSailCheatBuffer, event.key);
    this.godSailCheatBuffer = sail.buffer;
    if (sail.triggered) {
      this.tryForceGodSailEncounter();
    }
    const land = appendGodLandCheatKey(this.godLandCheatBuffer, event.key);
    this.godLandCheatBuffer = land.buffer;
    if (land.triggered) {
      this.tryForceGodLandEncounter();
    }
  };

  constructor() {
    super({ key: "IsometricScene" });
  }

  create(): void {
    const pending = takePendingWorldPosition();
    if (pending) {
      this.currentZoneId = pending.zoneId;
      this.playerGridX = pending.x;
      this.playerGridY = pending.y;
    }

    const startZone = getZone(this.currentZoneId);
    if (!pending && startZone.defaultSpawn) {
      this.playerGridX = startZone.defaultSpawn.x;
      this.playerGridY = startZone.defaultSpawn.y;
    }

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as typeof this.wasd;
    this.unlockKey = this.input.keyboard!.addKey("U");
    this.inviteKey = this.input.keyboard!.addKey("I");
    this.interactKey = this.input.keyboard!.addKey("E");
    this.input.keyboard!.on("keydown-E", (event: KeyboardEvent) => {
      // Typing an "e" into a DOM field (e.g. the nickname prompt) is not an interact.
      if (!event.repeat && !isDomKeyboardTarget(event.target as Element | null)) {
        this.interactTapped = true;
      }
    });
    this.input.keyboard!.on("keydown", this.onGodCheatKeyDown);
    document.addEventListener("focusin", this.onDomFocusChange);
    document.addEventListener("focusout", this.onDomFocusChange);
    initTouchControls();
    initMuteControl(this);
    setCopyInviteHandler(() => this.tryCopyInvite());
    ensureGroveMusic(this);
    this.input.on("pointerdown", () => unlockAudioFromGesture(this));
    this.fx = new OverworldFx(this);
    this.fx.notePartyBaseline();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    window.addEventListener(PARTY_CHANGED_EVENT, this.onPartyChanged);
    this.game.events.on(FINALE_COMPLETE_EVENT, this.onFinaleComplete);
    this.companions = this.createCompanions();

    this.loadZone(this.currentZoneId);

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.wakeStrandedPartyIfNeeded();
    this.unbindPlayerName = onPlayerNameChange(() => {
      this.refreshNameTag();
      this.syncKeyboardGate();
    });
    this.refreshNameTag();
    this.syncKeyboardGate();
    setTouchControlsEnabled(hasPlayerName());

    this.events.on("resume", () => {
      if (
        this.inEncounter ||
        this.pendingGodSailEncounter ||
        this.pendingGodLandEncounter
      ) {
        grantEncounterImmunity(this.time.now);
        overworldEncounterPacer.onEncounterEnd();
      }
      const fromShrine = this.inShrine;
      this.inEncounter = false;
      this.pendingGodSailEncounter = undefined;
      this.pendingGodLandEncounter = undefined;
      this.inShrine = false;
      this.inDialogue = false;
      this.inMinigame = false;
      this.travelSinceEncounter = 0;
      this.godSailTravelSinceEncounter = 0;
      this.godLandTravelSinceEncounter = 0;
      setTouchControlsEnabled(true);
      this.syncKeyboardGate();
      const zoneId = this.currentZoneId;
      const x = this.playerGridX;
      const y = this.playerGridY;
      this.loadZone(zoneId);
      this.playerGridX = x;
      this.playerGridY = y;
      this.syncPlayerToGrid();
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
      this.celebrateResume(fromShrine);
      this.wakeStrandedPartyIfNeeded();
    });
    this.events.on("minigame-closed", () => {
      this.inMinigame = false;
    });

    this.scale.on("resize", () => this.onResize());
    window.addEventListener("resize", this.onWindowResize);
    window.visualViewport?.addEventListener("resize", this.onWindowResize);
    window.visualViewport?.addEventListener("scroll", this.onWindowResize);
    // Party / story copy changes the dock height, which decides the canvas height.
    const statusPanel = document.getElementById("status-panel");
    if (statusPanel && typeof ResizeObserver !== "undefined") {
      this.statusObserver = new ResizeObserver(() => this.onResize());
      this.statusObserver.observe(statusPanel);
    }
    window.addEventListener(
      OPEN_PORTABLE_SHRINE_EVENT,
      this.onPortableShrineOpen,
    );
  }

  shutdown(): void {
    this.unbindPlayerName?.();
    this.unbindPlayerName = undefined;
    this.fx?.destroy();
    window.removeEventListener(PARTY_CHANGED_EVENT, this.onPartyChanged);
    this.game.events.off(FINALE_COMPLETE_EVENT, this.onFinaleComplete);
    setCopyInviteHandler(null);
    this.input.keyboard?.off("keydown", this.onGodCheatKeyDown);
    document.removeEventListener("focusin", this.onDomFocusChange);
    document.removeEventListener("focusout", this.onDomFocusChange);
    window.removeEventListener("resize", this.onWindowResize);
    window.visualViewport?.removeEventListener("resize", this.onWindowResize);
    window.visualViewport?.removeEventListener("scroll", this.onWindowResize);
    this.statusObserver?.disconnect();
    this.statusObserver = undefined;
    window.removeEventListener(
      OPEN_PORTABLE_SHRINE_EVENT,
      this.onPortableShrineOpen,
    );
  }

  update(_time: number, delta: number): void {
    // Consume every frame so a press during dialogue/encounters never replays.
    // A focused text field / slider owns the keyboard: no E, no WASD/arrows (#390).
    const domKeys = isDomKeyboardTarget(document.activeElement);
    const interactPressed =
      (Phaser.Input.Keyboard.JustDown(this.interactKey) || this.interactTapped) &&
      !domKeys;
    this.interactTapped = false;
    this.fx?.update(
      delta,
      this.player.x,
      this.playerBaseY,
      this.isMoving,
      this.playerFacing,
    );
    if (!hasPlayerName()) {
      this.isMoving = false;
      this.playPlayerAnimation();
      setTouchControlsEnabled(false);
      return;
    }
    if (this.inEncounter || this.inShrine || this.inDialogue || this.inMinigame) {
      this.isMoving = false;
      this.playPlayerAnimation();
      return;
    }
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.unlockKey)) {
      toggleOverworldUnlock();
      notifyWorldChanged();
      this.loadZone(this.currentZoneId);
    }

    if (Phaser.Input.Keyboard.JustDown(this.inviteKey)) {
      void this.tryCopyInvite();
    }

    this.updateQuestToast();
    this.updateAchievementToast();
    this.companions?.update();

    if (interactPressed || consumeTouchInteract()) {
      unlockAudioFromGesture(this);
      if (
        !this.tryShrineInteract() &&
        !this.tryDoorInteract() &&
        !this.tryMinigameInteract() &&
        !this.tryNpcInteract() &&
        !this.tryDockInteract() &&
        !this.companions?.tryInteract(this.time.now)
      ) {
        this.tryGatherInteract();
      }
    }

    this.updateInteractPrompt();
    this.syncWalkHint();
    this.layoutWorldHudTexts();

    let dx = 0;
    let dy = 0;

    // Keys typed into a DOM control are not movement; touch axes below still are.
    if (!domKeys) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) {
        dx -= 1;
      }
      if (this.cursors.right.isDown || this.wasd.D.isDown) {
        dx += 1;
      }
      if (this.cursors.up.isDown || this.wasd.W.isDown) {
        dy -= 1;
      }
      if (this.cursors.down.isDown || this.wasd.S.isDown) {
        dy += 1;
      }
    }

    const touch = getTouchAxes();
    dx += touch.x;
    dy += touch.y;

    if (dx === 0 && dy === 0) {
      this.isMoving = false;
      this.playPlayerAnimation();
      this.syncPlayerToGrid();
      return;
    }

    this.updateFacing(dx, dy);

    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    const zone = getZone(this.currentZoneId);
    const step = MOVE_SPEED * (Math.min(delta, 50) / 1000);
    const nextX = this.playerGridX + dx * step;
    const nextY = this.playerGridY + dy * step;

    const moved = canOccupy(zone, nextX, nextY);
    if (moved) {
      this.playerGridX = nextX;
      this.playerGridY = nextY;
      this.walkHintTravel += step;
      this.syncWalkHint();
      const prevPhase = this.walkPhase;
      this.walkPhase += step * WALK_CYCLES_PER_TILE;
      if (walkFootfallsSince(prevPhase, this.walkPhase) > 0) {
        playStepSfx(this, _time);
        this.fx?.footstep(this.player.x, this.playerBaseY);
      }
      updateHostPosition(
        this.currentZoneId,
        this.playerGridX,
        this.playerGridY,
      );
      if (this.currentZoneId === "archipelago") {
        this.syncArchipelagoStream();
        this.maybeNoteIslandLand();
      }
      this.tryZoneTransition(zone);
      this.tryRandomEncounter(step);
    }
    // Blocked tiles must not keep a skating walk cycle.
    this.isMoving = moved;
    this.playPlayerAnimation();
    this.syncPlayerToGrid();
  }

  private updateFacing(dx: number, dy: number): void {
    let facing = this.playerFacing;
    if (Math.abs(dx) > Math.abs(dy)) {
      facing = dx > 0 ? "east" : "west";
    } else if (dy !== 0) {
      facing = dy > 0 ? "south" : "north";
    }
    if (facing !== this.playerFacing) {
      this.playerFacing = facing;
    }
  }

  private tryRandomEncounter(step: number): void {
    if (
      this.inEncounter ||
      this.pendingGodSailEncounter ||
      this.pendingGodLandEncounter
    ) {
      return;
    }
    const sailing = isSailing();
    if (sailing) {
      if (getSovereignVoyageStep() !== "tide") {
        this.tryGodSailEncounter(step);
      }
      return;
    }
    this.tryHermitTideEncounter(step);
    this.tryGodLandEncounter(step);
    if (this.inEncounter || this.pendingGodLandEncounter) {
      return;
    }
    overworldEncounterPacer.walk(step);
    if (isEncounterImmune(this.time.now)) {
      return;
    }
    if (
      !shouldAttemptWildEncounter(sailing, {
        suppressWild: isSovereignPlateSuppressingWild(),
      })
    ) {
      return;
    }
    if (isVisitorMode()) {
      return;
    }
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    if (
      this.currentZoneId === "overworld" &&
      isOverworldEncounterSafeTile(tileX, tileY)
    ) {
      return;
    }
    this.travelSinceEncounter += step;
    if (this.travelSinceEncounter < ENCOUNTER_TRAVEL_THRESHOLD) {
      return;
    }

    const travelled = this.travelSinceEncounter;
    this.travelSinceEncounter = 0;
    const profile = getHabitatProfile(this.currentZoneId);
    // Opening beats (#363) script the first meet / first spar foe (one-shot,
    // re-offered only after a walking cooldown).
    const scripted = scriptedOpeningCreature(
      this.currentZoneId,
      isVisitorMode(),
      travelled,
    );
    // Pacing (#390) gates every unscripted roll; opening beats keep their guarantee.
    if (scripted === null && !overworldEncounterPacer.canRoll()) {
      return;
    }
    const guaranteed =
      scripted !== null || shouldGuaranteeWildTrigger(profile, this.currentZoneId);
    if (
      !guaranteed &&
      !rollWildTriggerChance(profile, () => overworldEncounterPacer.random())
    ) {
      return;
    }

    const islandIndex =
      this.currentZoneId === "archipelago"
        ? islandIndexAtTile(this.playerGridX, this.playerGridY)
        : null;
    const creatureId = scripted ?? resolveWildEncounterCreature({
      zoneId: this.currentZoneId,
      tileX: Math.round(this.playerGridX),
      tileY: Math.round(this.playerGridY),
      islandIndex,
      discoveredCreatureIds: worldState.discoveredCreatures,
    });
    if (!creatureId) {
      return;
    }

    this.inEncounter = true;
    hideOpeningCaption();
    setTouchControlsEnabled(false);
    this.cameras.main.fadeOut(140, 255, 255, 255);
    this.time.delayedCall(145, () => {
      this.scene.pause();
      this.scene.launch("EncounterScene", {
        creatureId,
        zoneId: this.currentZoneId,
      });
    });
  }

  private tryHermitTideEncounter(step: number): void {
    if (this.inEncounter || this.pendingGodSailEncounter) {
      return;
    }
    const islandIndex =
      this.currentZoneId === "archipelago"
        ? islandIndexAtTile(this.playerGridX, this.playerGridY)
        : null;
    if (
      !shouldAttemptHermitTideEncounter({
        sailing: isSailing(),
        zoneId: this.currentZoneId,
        islandIndex,
        visitor: isVisitorMode(),
        claimed: worldState.godSailEncounterClaimed,
      })
    ) {
      this.godSailTravelSinceEncounter = 0;
      return;
    }

    this.godSailTravelSinceEncounter += step;
    if (this.godSailTravelSinceEncounter < ENCOUNTER_TRAVEL_THRESHOLD) {
      return;
    }
    this.godSailTravelSinceEncounter = 0;
    if (rollGodSailEncounter()) {
      this.scheduleGodSailEncounter(false);
    }
  }

  private tryGodSailEncounter(step: number): void {
    if (this.inEncounter || this.pendingGodSailEncounter) {
      return;
    }
    const islandIndex =
      this.currentZoneId === "archipelago"
        ? islandIndexAtTile(this.playerGridX, this.playerGridY)
        : null;
    if (
      !shouldAttemptGodSailEncounter({
        sailing: isSailing(),
        zoneId: this.currentZoneId,
        islandIndex,
        visitor: isVisitorMode(),
        claimed: worldState.godSailEncounterClaimed,
      })
    ) {
      this.godSailTravelSinceEncounter = 0;
      return;
    }

    this.godSailTravelSinceEncounter += step;
    if (this.godSailTravelSinceEncounter < ENCOUNTER_TRAVEL_THRESHOLD) {
      return;
    }
    this.godSailTravelSinceEncounter = 0;
    if (rollGodSailEncounter()) {
      this.scheduleGodSailEncounter(false);
    }
  }

  private tryForceGodSailEncounter(): void {
    if (
      this.inEncounter ||
      this.pendingGodSailEncounter ||
      !canForceGodSailEncounter({
        sailing: isSailing(),
        zoneId: this.currentZoneId,
        visitor: isVisitorMode(),
      })
    ) {
      return;
    }
    this.scheduleGodSailEncounter(true);
  }

  private currentWalkableLand(): boolean {
    const zone = getZone(this.currentZoneId);
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    return isWalkableLandTile(zone.tiles[tileY]?.[tileX]);
  }

  private tryGodLandEncounter(step: number): void {
    if (this.inEncounter || this.pendingGodLandEncounter) {
      return;
    }
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    const islandIndex =
      this.currentZoneId === "archipelago"
        ? islandIndexAtTile(tileX, tileY)
        : null;
    if (
      !shouldAttemptGodLandEncounter({
        sailing: isSailing(),
        zoneId: this.currentZoneId,
        islandIndex,
        walkableLand: this.currentWalkableLand(),
        visitor: isVisitorMode(),
        claimed: worldState.godLandEncounterClaimed,
      })
    ) {
      this.godLandTravelSinceEncounter = 0;
      return;
    }

    this.godLandTravelSinceEncounter += step;
    if (this.godLandTravelSinceEncounter < ENCOUNTER_TRAVEL_THRESHOLD) {
      return;
    }
    this.godLandTravelSinceEncounter = 0;
    if (rollGodLandEncounter()) {
      this.scheduleGodLandEncounter(false);
    }
  }

  private tryForceGodLandEncounter(): void {
    if (
      this.inEncounter ||
      this.pendingGodLandEncounter ||
      this.pendingGodSailEncounter ||
      !canForceGodLandEncounter({
        sailing: isSailing(),
        zoneId: this.currentZoneId,
        visitor: isVisitorMode(),
      })
    ) {
      return;
    }
    this.scheduleGodLandEncounter(true);
  }

  private scheduleGodLandEncounter(forced: boolean): void {
    const lock = lockPendingGodLandEncounter(
      this.pendingGodLandEncounter,
      this.playerGridX,
      this.playerGridY,
      forced,
    );
    if (this.inEncounter || !lock.acquired) {
      return;
    }
    const pending = lock.pending;
    this.pendingGodLandEncounter = pending;
    this.inEncounter = true;
    setTouchControlsEnabled(false);
    if (this.input.keyboard) {
      this.input.keyboard.enabled = false;
    }
    this.player.setTint(0xc4a574);
    const pulse = this.tweens.add({
      targets: this.player,
      alpha: 0.55,
      duration: 450,
      yoyo: true,
      repeat: -1,
    });
    this.cameras.main.flash(450, 90, 70, 40, false);
    this.cameras.main.shake(pending.delayMs, 0.0015);

    this.time.delayedCall(pending.delayMs, () => {
      if (this.pendingGodLandEncounter !== pending) {
        return;
      }
      pulse.stop();
      this.player.setAlpha(1).clearTint();
      this.cameras.main.fadeOut(140, 70, 55, 35);
      this.time.delayedCall(145, () => {
        this.scene.pause();
        this.scene.launch("EncounterScene", {
          creatureId: pending.creatureId,
          origin: pending.origin,
        });
      });
    });
  }

  private scheduleGodSailEncounter(forced: boolean): void {
    const lock = lockPendingGodSailEncounter(
      this.pendingGodSailEncounter,
      this.playerGridX,
      this.playerGridY,
      forced,
    );
    if (this.inEncounter || !lock.acquired) {
      return;
    }
    const pending = lock.pending;
    this.pendingGodSailEncounter = pending;
    this.inEncounter = true;
    setTouchControlsEnabled(false);
    if (this.input.keyboard) {
      this.input.keyboard.enabled = false;
    }
    this.player.setTint(0x48d7d1);
    const pulse = this.tweens.add({
      targets: this.player,
      alpha: 0.55,
      duration: 450,
      yoyo: true,
      repeat: -1,
    });
    this.cameras.main.flash(450, 20, 110, 120, false);

    this.time.delayedCall(pending.delayMs, () => {
      if (this.pendingGodSailEncounter !== pending) {
        return;
      }
      pulse.stop();
      this.player.setAlpha(1).clearTint();
      this.cameras.main.fadeOut(140, 20, 70, 80);
      this.time.delayedCall(145, () => {
        this.scene.pause();
        this.scene.launch("EncounterScene", {
          creatureId: pending.creatureId,
          origin: pending.origin,
        });
      });
    });
  }

  private tryZoneTransition(zone: ZoneDefinition): void {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    const sailing = isSailing();

    for (const transition of zone.transitions) {
      if (transition.x !== tileX || transition.y !== tileY) {
        continue;
      }
      // While sailing, only Harbor ↔ Archipelago water gates may fire.
      if (sailing && !allowsSailZoneTransition(zone.id, transition.targetZone)) {
        return;
      }
      if (
        transition.targetZone === "overworld" &&
        !worldState.overworldUnlocked
      ) {
        return;
      }
      if (zone.id === "archipelago" && transition.targetZone !== "archipelago") {
        resetArchipelagoStream();
      }
      // Spawn before loadZone so follow/stream prep target the entry cell, not the prior zone.
      this.playerGridX = transition.targetX;
      this.playerGridY = transition.targetY;
      if (transition.targetZone === "archipelago") {
        prepareArchipelagoForPosition(transition.targetX);
      }
      this.loadZone(transition.targetZone);
      this.syncPlayerToGrid();
      return;
    }
  }

  /** Refresh archipelago floor/prop sprites inside the XY camera window. */
  private syncArchipelagoStream(): void {
    const result = ensureArchipelagoChunksAround(this.playerGridX);
    const zone = getZone("archipelago");
    const next = archipelagoVisualWindow(
      this.playerGridX,
      this.playerGridY,
      zone.width,
      zone.height,
    );
    const prev = this.archipelagoVisualWin;
    const grew = result.grew;
    const windowChanged =
      next.xMin !== prev.xMin ||
      next.xMax !== prev.xMax ||
      next.yMin !== prev.yMin ||
      next.yMax !== prev.yMax;
    if (!grew && !windowChanged) {
      return;
    }
    this.applyArchipelagoStreamVisuals(result, prev, next);
    this.archipelagoVisualWin = next;
    if (grew) {
      this.layoutPlayfield(zone);
    }
  }

  private destroyArchipelagoSpritesOutside(win: ArchipelagoVisualWindow): void {
    // Deleting the current entry via the sprite's DESTROY handler is safe
    // during Set iteration.
    for (const img of this.streamSprites) {
      const gx = img.getData("streamX") as number;
      const gy = img.getData("streamY") as number;
      if (!isInArchipelagoVisualWindow(gx, gy, win)) {
        img.destroy();
      }
    }
  }

  private drawArchipelagoVisualWindow(
    zone: ZoneDefinition,
    win: ArchipelagoVisualWindow,
  ): void {
    // Harbor return gate columns stay fully tall.
    this.drawZoneTileColumns(zone, 0, ARCHIPELAGO_GATE_COLUMNS);
    this.drawWallsInColumns(zone, 0, ARCHIPELAGO_GATE_COLUMNS);
    this.drawZoneTileColumns(zone, win.xMin, win.xMax, win.yMin, win.yMax);
    this.drawWallsInColumns(zone, win.xMin, win.xMax, win.yMin, win.yMax);
    this.drawArchipelagoPropsInWindow(win);
  }

  private drawArchipelagoLiveRect(
    zone: ZoneDefinition,
    xStart: number,
    xEnd: number,
    yStart: number,
    yEnd: number,
  ): void {
    if (xStart >= xEnd || yStart >= yEnd) {
      return;
    }
    this.drawZoneTileColumns(zone, xStart, xEnd, yStart, yEnd);
    this.drawWallsInColumns(zone, xStart, xEnd, yStart, yEnd);
    for (const prop of getArchipelagoPropsInWindow({
      xMin: xStart,
      xMax: xEnd,
      yMin: yStart,
      yMax: yEnd,
    })) {
      // Gate props are owned by the full-height gate draw on load; skip here.
      if (prop.x < ARCHIPELAGO_GATE_COLUMNS) {
        continue;
      }
      this.spawnPropSprite(prop.x, prop.y, prop.kind, true, "archipelago");
    }
  }

  private applyArchipelagoStreamVisuals(
    result: ChunkEnsureResult,
    prev: ArchipelagoVisualWindow,
    next: ArchipelagoVisualWindow,
  ): void {
    const zone = getZone("archipelago");
    // Drop sprites that left the window (tiles stay full 100×100).
    this.destroyArchipelagoSpritesOutside(next);

    // Incremental enter strips — avoid redrawing the prev∩next overlap.
    if (next.xMin < prev.xMin) {
      this.drawArchipelagoLiveRect(
        zone,
        next.xMin,
        Math.min(prev.xMin, next.xMax),
        next.yMin,
        next.yMax,
      );
    }
    if (next.xMax > prev.xMax) {
      this.drawArchipelagoLiveRect(
        zone,
        Math.max(prev.xMax, next.xMin),
        next.xMax,
        next.yMin,
        next.yMax,
      );
    }
    const xOverlapStart = Math.max(next.xMin, prev.xMin);
    const xOverlapEnd = Math.min(next.xMax, prev.xMax);
    if (next.yMin < prev.yMin) {
      this.drawArchipelagoLiveRect(
        zone,
        xOverlapStart,
        xOverlapEnd,
        next.yMin,
        prev.yMin,
      );
    }
    if (next.yMax > prev.yMax) {
      this.drawArchipelagoLiveRect(
        zone,
        xOverlapStart,
        xOverlapEnd,
        prev.yMax,
        next.yMax,
      );
    }

    // Docked boat may have been culled if its pad left the window.
    this.drawPlacedBoat(zone);

    if (result.grew) {
      this.playerDepth = playerDepthAboveGrid(result.width, zone.height);
      // Delayed island stamps may rewrite overlap columns — refresh live window cells.
      const from = result.redrawFrom;
      if (from < result.previousWidth) {
        const xStart = Math.max(next.xMin, from);
        const xEnd = Math.min(next.xMax, result.previousWidth);
        if (xStart < xEnd) {
          for (const img of this.streamSprites) {
            const gx = img.getData("streamX") as number;
            const gy = img.getData("streamY") as number;
            if (
              gx >= xStart &&
              gx < xEnd &&
              gy >= next.yMin &&
              gy < next.yMax
            ) {
              img.destroy();
            }
          }
          this.drawArchipelagoLiveRect(zone, xStart, xEnd, next.yMin, next.yMax);
        }
      }
    }
  }


  private maybeMainQuestSovereignEncounter(): void {
    if (
      isVisitorMode() ||
      this.inEncounter ||
      this.pendingGodSailEncounter ||
      this.pendingGodLandEncounter
    ) {
      return;
    }
    const islandIndex = islandIndexAtTile(
      Math.round(this.playerGridX),
      Math.round(this.playerGridY),
    );
    if (islandIndex === null) {
      return;
    }
    const voyageStep = getSovereignVoyageStep();
    if (voyageStep === "tide" && islandIndex === HERMIT_ISLAND_INDEX) {
      this.scheduleGodSailEncounter(true);
      return;
    }
    if (voyageStep === "cairn" && islandIndex === CAIRN_ISLAND_INDEX) {
      this.scheduleGodLandEncounter(true);
    }
  }

  private maybeNoteIslandLand(): void {
    if (this.currentZoneId !== "archipelago" || isFirstIslandLanded()) {
      return;
    }
    // Dock tiles count as island positions; only on-foot stands complete the Next.
    if (isSailing()) {
      return;
    }
    if (!isArchipelagoIslandPosition(this.playerGridX, this.playerGridY)) {
      return;
    }
    this.maybeMainQuestSovereignEncounter();
    claimSecondActWantOnIslandLand();
    updateStatusPanel(getZone(this.currentZoneId));
  }

  private loadZone(zoneId: ZoneId): void {
    if (this.currentZoneId === "archipelago" && zoneId !== "archipelago") {
      resetArchipelagoStream();
    }
    const previousZoneId = this.currentZoneId;
    this.currentZoneId = zoneId;
    setAudioZone(zoneId);
    onZoneEnter(zoneId, previousZoneId === zoneId ? null : previousZoneId);
    const zone = getZone(zoneId);
    this.playerDepth = playerDepthAboveGrid(zone.width, zone.height);
    markZoneDiscovered(zoneId);

    this.children.removeAll(true);
    destroyPartyOverworldFollowers(this.partyFollowers);
    this.partyFollowers = createPartyOverworldFollowerState();
    this.shrinePrompt = undefined;
    this.walkHint = undefined;
    this.walkHintFading = false;
    this.dockBoat = undefined;
    this.sailingBoat = undefined;
    this.nameTag = undefined;

    if (zoneId === "archipelago") {
      prepareArchipelagoForPosition(this.playerGridX);
      this.archipelagoVisualWin = archipelagoVisualWindow(
        this.playerGridX,
        this.playerGridY,
        zone.width,
        zone.height,
      );
    }

    ensureWorldTextures(this, zoneId);
    ensurePlayerAnims(this);
    preparePartyOverworldFollowerTextures(this);
    this.worldOrigin = this.getZoneWorldOrigin(zone);
    this.cameras.main.setBackgroundColor(ZONE_CAMERA_COLORS[zoneId]);

    this.drawBackdrop(zone);
    if (zoneId === "archipelago") {
      // Only instantiate the local camera window (+ west gate columns).
      this.drawArchipelagoVisualWindow(zone, this.archipelagoVisualWin);
    } else {
      this.drawZoneTiles(zone);
      this.drawProps(zone);
    }
    this.drawNpcs(zone);
    this.drawPlacedBoat(zone);
    this.companions?.enterZone();
    recordQuestEvent({ type: "enter_zone", zoneId });

    this.player = this.add
      .sprite(0, 0, ...imagineTexture(this, `player-${this.playerFacing}-0`))
      .setOrigin(0.5, 1);
    bindPlayerDisplaySize(this.player);
    this.syncPlayerToGrid();
    this.refreshNameTag();
    this.playPlayerAnimation();
    this.maybeNoteIslandLand();
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    // setBounds (in layout) often leaves scroll at bounds origin; with follow lerp
    // 0.08 that reads as a dive from map top — snap onto the player immediately.
    this.snapCameraToPlayer();
    this.cameras.main.fadeIn(180, 255, 255, 255);
    this.fx?.enterZone(
      zone,
      this.worldOrigin,
      this.playerDepth,
      previousZoneId !== zoneId,
    );
    this.time.delayedCall(0, () => {
      this.layoutPlayfield(zone);
      this.snapCameraToPlayer();
      this.updateInteractPrompt();
      this.syncWalkHint();
      updateHostPosition(
        this.currentZoneId,
        this.playerGridX,
        this.playerGridY,
      );
      persistHostSave();
    });
  }

  /** Center follow target without waiting for lerp from bounds origin. */
  private snapCameraToPlayer(): void {
    if (!this.player) {
      return;
    }
    this.cameras.main.centerOn(this.player.x, this.player.y);
  }

  private getZoneWorldBounds(zone: ZoneDefinition): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } {
    const minX = this.worldOrigin.x - 80;
    const minY = this.worldOrigin.y - 80;
    const maxX = this.worldOrigin.x + zone.width * TILE_WIDTH + 80;
    const maxY = this.worldOrigin.y + zone.height * TILE_HEIGHT + 80;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private layoutPlayfield(zone: ZoneDefinition): void {
    if (this.layoutLocked) {
      return;
    }
    this.layoutLocked = true;
    try {
      const bounds = this.getZoneWorldBounds(zone);
      // Status copy first: its height decides how much canvas is left (#391).
      updateStatusPanel(zone);
      const stage = layoutStage();
      this.touchControlsShown = areTouchControlsVisible();
      syncQuestHudPosition();
      resizeGameForDisplay(this, stage.width, stage.height);
      this.scale.refresh();

      const cam = this.cameras.main;
      // Archipelago map is larger than the view: fit a local vertical tile count
      // so startFollow pans N/S/E/W at a playable scale (not a full-map overview).
      const archipelagoFitBoundsHeight =
        ARCHIPELAGO_CAMERA_FIT_HEIGHT * TILE_HEIGHT + 160;
      // Fit the tiles plus a thin canopy margin (bounds carry 80px per side).
      const fitW = bounds.width - ZONE_FIT_TRIM;
      const fitH = bounds.height - ZONE_FIT_TRIM;
      const zoom =
        zone.id === "archipelago"
          ? this.scale.height / archipelagoFitBoundsHeight
          : Math.min(this.scale.width / fitW, this.scale.height / fitH);
      // Allow zoom to scale with HiDPI buffer; capped so interiors on big
      // monitors do not blow sprites up past their authored detail.
      const clamped = Phaser.Math.Clamp(zoom, 0.01, MAX_ZONE_ZOOM_CSS * RENDER_DPR);
      cam.setZoom(clamped);
      // The stage is rectangular: where it is larger than the zone, extend the
      // camera bounds over the painted canopy instead of showing a void.
      let padX = 0;
      let padY = 0;
      if (zone.id !== "archipelago") {
        padX = Math.min(
          ZONE_CANOPY_PAD_MAX,
          Math.max(0, (this.scale.width / clamped - bounds.width) / 2 + 2),
        );
        padY = Math.min(
          ZONE_CANOPY_PAD_MAX,
          Math.max(0, (this.scale.height / clamped - bounds.height) / 2 + 2),
        );
      }
      cam.setBounds(
        bounds.minX - padX,
        bounds.minY - padY,
        bounds.width + padX * 2,
        bounds.height + padY * 2,
      );
    this.layoutWorldHudTexts();
    } finally {
      this.layoutLocked = false;
    }
  }

  private layoutWorldHudTexts(): void {
    if (this.walkHint) {
      placeWorldHudText(this, this.walkHint, "top", 56);
    }
    if (this.shrinePrompt) {
      placeWorldHudText(this, this.shrinePrompt, "bottom", 48);
    }
    if (this.gatherToast) {
      placeWorldHudText(this, this.gatherToast, "top", 120);
    }
    if (this.questToast) {
      placeWorldHudText(this, this.questToast, "top", 120);
    }
    if (this.achievementToast) {
      placeWorldHudText(this, this.achievementToast, "top", 176);
    }
  }

  private getZoneWorldOrigin(_zone: ZoneDefinition): { x: number; y: number } {
    return {
      x: 80,
      y: 80,
    };
  }

  private toScreen(gridX: number, gridY: number): { x: number; y: number } {
    return gridToScreen(
      gridX,
      gridY,
      this.worldOrigin.x,
      this.worldOrigin.y,
    );
  }

  private onResize(): void {
    if (this.layoutLocked || !this.player) {
      return;
    }
    this.layoutPlayfield(getZone(this.currentZoneId));
    this.updateInteractPrompt();
  }

  private drawZoneTiles(zone: ZoneDefinition): void {
    this.drawZoneTileColumns(zone, 0, zone.width);
    this.drawWalls(zone);
  }

  private drawZoneTileColumns(
    zone: ZoneDefinition,
    xStart: number,
    xEnd: number,
    yStart = 0,
    yEnd = zone.height,
  ): void {
    const transitionSet = new Set(
      zone.transitions.map((t) => `${t.x},${t.y}`),
    );

    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const tileType = zone.tiles[y][x];
        if (tileType === TileType.Wall) {
          continue;
        }

        const screen = this.toScreen(x, y);
        const light = (x + y) % 2 === 0;
        let textureKey = getFloorTextureKey(zone.id, light);
        // Rendered ground variants (#361) replace the light/dark checker.
        const variantKey = floorVariantKey(zone.id, x, y);
        const variant =
          tileType === TileType.Floor && hasWorldTexture(this, variantKey);
        if (variant) {
          textureKey = variantKey;
        }
        if (tileType === TileType.Water) {
          textureKey = getWaterTextureKey(light);
        } else if (tileType === TileType.Dock) {
          textureKey = getDockTextureKey(light);
        }

        const tile = this.add
          .image(screen.x, screen.y, ...imagineTexture(this, textureKey))
          .setOrigin(0.5, 0.5);
        fitDisplay(tile, FLOOR_DISPLAY);
        this.registerStreamSprite(tile, x, y);
        if (tileType === TileType.Floor || tileType === TileType.Water) {
          // Break up the debug-grid checker (#362); biome/gate tints override.
          tile.setTint(
            floorTintAt(
              x,
              y,
              light && !variant,
              tileType === TileType.Water ? 0.5 : variant ? 0.6 : 1,
            ),
          );
        }

        if (tileType === TileType.Floor && zone.id === "archipelago") {
          const biome = biomeAtIslandTile(x, y);
          if (biome) {
            const tint = ISLAND_BIOME_FLOOR_TINT[biome];
            if (biome === "cairn") {
              tile.setTintFill(tint);
            } else {
              tile.setTint(tint);
            }
          }
        }

        if (
          (tileType === TileType.OverworldGate ||
            tileType === TileType.VillageGate) &&
          !transitionSet.has(`${x},${y}`)
        ) {
          const open =
            tileType === TileType.VillageGate
              ? worldState.villageGateUnlocked
              : worldState.overworldUnlocked;
          tile.setTint(open ? 0xaaffaa : 0xffaaaa);
          tile.setAlpha(0.85);
        }

        tile.setDepth(depthForGridCell(x, y, FLOOR_LAYER));
      }
    }
  }

  private drawBackdrop(zone: ZoneDefinition): void {
    const palette: Partial<
      Record<ZoneId, { sky: number; hill: number; mist: number }>
    > = {
      grove: { sky: 0x8ed0a6, hill: 0x4d9270, mist: 0xe4f4bd },
      shrine: { sky: 0x8881c8, hill: 0x4a4b8a, mist: 0xf0e4ff },
      village: { sky: 0xf4b875, hill: 0xc9775a, mist: 0xffe5ad },
      overworld: { sky: 0x80c5e8, hill: 0x4b8da8, mist: 0xd8f5ef },
      harbor: { sky: 0x78b8d8, hill: 0x3a6888, mist: 0xd0eef8 },
      archipelago: { sky: 0x68a8c8, hill: 0x2a5878, mist: 0xc0e8f8 },
      mistwood: { sky: 0xa898d0, hill: 0x5a4a80, mist: 0xe8e0f8 },
      emberfen: { sky: 0xe0a868, hill: 0x8a5030, mist: 0xffe0b0 },
    };
    const colors = palette[zone.id];
    // Size archipelago backdrop to the hard max width so growth never outruns sky.
    const boundsZone =
      zone.id === "archipelago"
        ? { ...zone, width: ARCHIPELAGO_MAX_WIDTH }
        : zone;
    const bounds = this.getZoneWorldBounds(boundsZone);
    const g = this.add.graphics().setDepth(-1000).setScrollFactor(0.16);

    if (zone.interior || !colors) {
      g.fillStyle(INTERIOR_BACKDROP_COLOR, 1);
      g.fillRect(bounds.minX - 800, bounds.minY - 500, bounds.width + 1600, bounds.height + 1000);
      return;
    }

    const canopyKey = `backdrop-${zone.id}`;
    if (hasImagineFrame(this, canopyKey)) {
      // Painted forest canopy around the clearing (#361) instead of a flat
      // sky-colored void; world-space so it reads as ground, not sky.
      g.destroy();
      this.drawCanopyBackdrop(bounds, canopyKey);
      return;
    }

    g.fillStyle(colors.sky, 1);
    g.fillRect(bounds.minX - 800, bounds.minY - 500, bounds.width + 1600, bounds.height + 1000);
    g.fillStyle(colors.mist, 0.2);
    g.fillRect(bounds.minX - 800, bounds.minY + 20, bounds.width + 1600, 110);
    g.fillStyle(colors.hill, 0.85);
    for (let x = bounds.minX - 400; x < bounds.maxX + 400; x += 120) {
      g.fillTriangle(x, bounds.minY + 145, x + 75, bounds.minY + 40, x + 150, bounds.minY + 145);
    }
    g.fillStyle(colors.mist, 0.22);
    g.fillCircle(bounds.minX + bounds.width * 0.72, bounds.minY + 80, 42);
  }

  private drawCanopyBackdrop(
    bounds: ReturnType<IsometricScene["getZoneWorldBounds"]>,
    canopyKey: string,
  ): void {
    const pad = 900;
    this.add
      .tileSprite(
        bounds.minX + bounds.width / 2,
        bounds.minY + bounds.height / 2,
        bounds.width + pad * 2,
        bounds.height + pad * 2,
        IMAGINE_ATLAS_KEY,
        canopyKey,
      )
      .setTileScale(0.4)
      .setTint(0xb4c0c4)
      .setDepth(-1000);
    // Soft navy vignette: deepens with distance from the tile edge (bounds
    // carry an 80px margin around the tiles).
    const edge = {
      minX: bounds.minX + 80,
      minY: bounds.minY + 80,
      maxX: bounds.maxX - 80,
      maxY: bounds.maxY - 80,
      width: bounds.width - 160,
      height: bounds.height - 160,
    };
    const v = this.add.graphics().setDepth(-999);
    // The camera only shows ~80px past the tiles, so the falloff is tight.
    const ring = 18;
    const rings = 7;
    for (let i = 0; i < rings; i += 1) {
      const grow = ring / 2 + i * ring;
      v.lineStyle(ring, 0x1f2a44, 0.14 + i * 0.05);
      v.strokeRect(
        edge.minX - grow,
        edge.minY - grow,
        edge.width + grow * 2,
        edge.height + grow * 2,
      );
    }
    const outer = rings * ring;
    v.fillStyle(0x1f2a44, 0.14 + rings * 0.05);
    v.fillRect(edge.minX - pad, edge.minY - pad, edge.width + pad * 2, pad - outer);
    v.fillRect(edge.minX - pad, edge.maxY + outer, edge.width + pad * 2, pad - outer);
    v.fillRect(edge.minX - pad, edge.minY - outer, pad - outer, edge.height + outer * 2);
    v.fillRect(edge.maxX + outer, edge.minY - outer, pad - outer, edge.height + outer * 2);
  }

  private drawWalls(zone: ZoneDefinition): void {
    if (zone.interior) {
      this.drawCottageWalls(zone);
      return;
    }
    this.drawWallsInColumns(zone, 0, zone.width);
  }

  private drawCottageWalls(zone: ZoneDefinition): void {
    const frame = cottageFrame(zone);
    if (frame.floorX1 < frame.floorX0) {
      return;
    }
    const innerLeft =
      this.toScreen(frame.floorX0, frame.floorY0).x - TILE_WIDTH / 2;
    const innerRight =
      this.toScreen(frame.floorX1, frame.floorY0).x + TILE_WIDTH / 2;
    const innerTop =
      this.toScreen(frame.floorX0, frame.floorY0).y - TILE_HEIGHT / 2;
    const innerBottom =
      this.toScreen(frame.floorX0, frame.floorY1).y + TILE_HEIGHT / 2;
    const wall = 28;
    const trim = 4;
    const outerLeft = innerLeft - wall;
    const outerTop = innerTop - wall;
    const outerRight = innerRight + wall;
    const outerBottom = innerBottom + wall;
    const doorLeft =
      frame.doorX === null
        ? innerLeft
        : this.toScreen(frame.doorX, zone.height - 1).x - TILE_WIDTH / 2;
    const doorRight =
      frame.doorX === null
        ? innerRight
        : this.toScreen(frame.doorX, zone.height - 1).x + TILE_WIDTH / 2;

    const back = this.add
      .graphics()
      .setDepth(depthForGridCell(0, 0, PROP_LAYER));
    const front = this.add
      .graphics()
      .setDepth(depthForGridCell(0, zone.height - 1, PROP_LAYER));

    const paint = (
      g: Phaser.GameObjects.Graphics,
      color: number,
      pad: number,
      thick: number,
      parts: { top?: boolean; sides?: boolean; south?: boolean },
    ): void => {
      const left = outerLeft + pad;
      const top = outerTop + pad;
      const right = outerRight - pad;
      const bottom = outerBottom - pad;
      g.fillStyle(color, 1);
      if (parts.top) {
        g.fillRect(left, top, right - left, thick);
      }
      if (parts.sides) {
        g.fillRect(left, top, thick, bottom - top);
        g.fillRect(right - thick, top, thick, bottom - top);
      }
      if (parts.south) {
        g.fillRect(left, bottom - thick, Math.max(0, doorLeft - left), thick);
        g.fillRect(
          doorRight,
          bottom - thick,
          Math.max(0, right - doorRight),
          thick,
        );
      }
    };

    paint(back, 0x3d2818, 0, wall, { top: true, sides: true });
    paint(back, 0xe6d2b0, trim, wall - trim, { top: true, sides: true });
    paint(front, 0x3d2818, 0, wall, { south: true });
    paint(front, 0xe6d2b0, trim, wall - trim, { south: true });

    // Rendered timber-and-plaster back wall + stone wall tops (#392) over
    // the flat fills; the fills stay as the fallback when frames are missing.
    if (hasImagineFrame(this, "wall-cottage-face") && hasImagineFrame(this, "wall-cottage-top")) {
      const thick = wall - trim;
      const left = outerLeft + trim;
      const right = outerRight - trim;
      const bottom = outerBottom - trim;
      const strip = (x: number, y: number, w: number, h: number, frame: string, depth: number, face = false): void => {
        if (w <= 0 || h <= 0) return;
        this.add
          .tileSprite(x + w / 2, y + h / 2, w, h, IMAGINE_ATLAS_KEY, frame)
          .setTileScale(0.25, face ? h / 112 : 0.25)
          .setDepth(depth);
      };
      strip(left, outerTop + trim, right - left, thick, "wall-cottage-face", back.depth, true);
      strip(left, innerTop, thick, bottom - innerTop, "wall-cottage-top", back.depth);
      strip(right - thick, innerTop, thick, bottom - innerTop, "wall-cottage-top", back.depth);
      strip(left, bottom - thick, doorLeft - left, thick, "wall-cottage-top", front.depth);
      strip(doorRight, bottom - thick, right - doorRight, thick, "wall-cottage-top", front.depth);
    }

    const edge = this.add.graphics().setDepth(back.depth);
    edge.lineStyle(3, 0x3d2818, 1);
    edge.beginPath();
    edge.moveTo(doorLeft, innerBottom);
    edge.lineTo(innerLeft, innerBottom);
    edge.lineTo(innerLeft, innerTop);
    edge.lineTo(innerRight, innerTop);
    edge.lineTo(innerRight, innerBottom);
    edge.lineTo(doorRight, innerBottom);
    edge.strokePath();
  }

  private drawWallsInColumns(
    zone: ZoneDefinition,
    xStart: number,
    xEnd: number,
    yStart = 0,
    yEnd = zone.height,
  ): void {
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        if (zone.tiles[y][x] !== TileType.Wall) {
          continue;
        }

        const hasFloorNeighbor =
          (x > 0 && zone.tiles[y][x - 1] !== TileType.Wall) ||
          (x < zone.width - 1 && zone.tiles[y][x + 1] !== TileType.Wall) ||
          (y > 0 && zone.tiles[y - 1][x] !== TileType.Wall) ||
          (y < zone.height - 1 && zone.tiles[y + 1][x] !== TileType.Wall);

        if (!hasFloorNeighbor) {
          continue;
        }

        const screen = this.toScreen(x, y);
        const boundaryKey = getBoundaryTextureKey(zone.id);

        const block = this.add
          .image(screen.x, screen.y + TILE_HEIGHT / 2 - 2, ...imagineTexture(this, boundaryKey))
          .setOrigin(0.5, 1);
        fitDisplay(block, BOUNDARY_DISPLAY);
        this.registerStreamSprite(block, x, y);
        block.setDepth(depthForGridCell(x, y, PROP_LAYER));
      }
    }
  }

  private drawProps(zone: ZoneDefinition): void {
    for (const prop of getZoneProps(zone.id)) {
      const gateOpen = isGatePropOpen(
        zone.id,
        prop,
        worldState.overworldUnlocked,
        worldState.villageGateUnlocked,
      );
      this.spawnPropSprite(prop.x, prop.y, prop.kind, gateOpen, zone.id);
    }
  }

  private drawArchipelagoPropsInWindow(win: ArchipelagoVisualWindow): void {
    for (const prop of getArchipelagoPropsInWindow(win)) {
      this.spawnPropSprite(prop.x, prop.y, prop.kind, true, "archipelago");
    }
  }

  private spawnPropSprite(
    x: number,
    y: number,
    kind: Parameters<typeof resolvePropTextureKey>[0],
    gateOpen: boolean,
    zoneId: ZoneId,
  ): void {
    const screen = this.toScreen(x, y);
    const key = resolvePropTextureKey(
      kind,
      kind === "gate" ? gateOpen : true,
      zoneId,
      (textureKey) => hasWorldTexture(this, textureKey),
    );
    const propSprite = this.add
      .image(screen.x, screen.y + TILE_HEIGHT / 2 - 2, ...imagineTexture(this, key))
      .setOrigin(0.5, 1);
    const propSize = PROP_DISPLAY[key];
    if (propSize) {
      fitDisplay(propSprite, propSize);
    }
    if (zoneId === "archipelago") {
      this.registerStreamSprite(propSprite, x, y);
    }
    propSprite.setDepth(depthForGridCell(x, y, PROP_LAYER));
  }

  private drawNpcs(zone: ZoneDefinition): void {
    for (const npc of getZoneNpcs(zone.id)) {
      const screen = this.toScreen(npc.x, npc.y);
      const sprite = this.add
        .sprite(screen.x, screen.y + TILE_HEIGHT / 2 - 2, npc.spriteKey)
        .setOrigin(0.5, 1);
      applyNpcSprite(this, sprite, npc);
      sprite.setDepth(depthForGridCell(npc.x, npc.y, PROP_LAYER));
    }
  }

  private getNearbyDoor() {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    return findNearbyDoor(getZone(this.currentZoneId), tileX, tileY);
  }

  private getNearbyNpc() {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    return findNpcNearPlayer(this.currentZoneId, tileX, tileY);
  }

  private isNearShrineTile(): boolean {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    return isNearShrine(getZone(this.currentZoneId), tileX, tileY);
  }

  /**
   * Movement ghost: the lowest-priority transient hint. Keyboard-only, once
   * ever, and never alongside a quest caption or an interact prompt (#391).
   */
  private syncWalkHint(): void {
    const walked = !shouldShowWalkHint(this.walkHintTravel);
    if (walked && !this.walkMarked) {
      // State change only: this runs every frame and must not hit storage.
      this.walkMarked = true;
      this.walkedMemo = true;
      markWalked();
      // Same first-step gate that kills the WASD ghost unlocks host invite (#257).
      unlockHostInviteChrome();
    }
    this.walkedMemo ??= hasWalkedBefore();
    const eligible = movementHintEligible({
      touchControls: this.touchControlsShown,
      walkedBefore: walked || this.walkedMemo,
      atFirstBeat: getActiveQuestId() === QUEST_ORDER[0],
      visitor: isVisitorMode(),
    });
    const winner = pickTransientHint({
      quest: isOpeningCaptionShowing(),
      interact: Boolean(this.shrinePrompt?.active),
      movement: eligible,
    });
    if (winner !== "movement") {
      const hint = this.walkHint;
      if (hint?.active && !this.walkHintFading) {
        // Fade rather than pop; the main loop keeps placing it until gone.
        this.walkHintFading = true;
        this.tweens.add({
          targets: hint,
          alpha: 0,
          duration: 280,
          onComplete: () => {
            hint.destroy();
            if (this.walkHint === hint) {
              this.walkHint = undefined;
              this.walkHintFading = false;
            }
          },
        });
      }
      return;
    }
    if (this.walkHint && !this.walkHintFading) {
      placeWorldHudText(this, this.walkHint, "top", 56);
      return;
    }
    if (this.walkHint) {
      return;
    }
    this.walkHint = attachHudPill(
      this.add
        .text(0, 0, WALK_HINT_TEXT, { ...HUD_PILL_TEXT_STYLE, fontSize: "17px" })
        .setOrigin(0.5)
        .setDepth(hudDepthAbovePlayer(this.playerDepth)),
    );
    placeWorldHudText(this, this.walkHint, "top", 56);
  }

  private updateInteractPrompt(): void {
    const shrine = this.isNearShrineTile();
    const door = this.getNearbyDoor();
    const minigame = this.getMinigameHere();
    const npc = this.getNearbyNpc();
    const dock = this.getNearbyDockPrompt();
    const gather = isVisitorMode() ? undefined : this.getNearbyGatherProp();
    const picked = pickInteractPrompt({
      shrine: shrine ? "Press E — Moon Shrine" : undefined,
      door: door ? `Press E — ${door.label}` : undefined,
      minigame: minigame ? `Press E — ${minigame.title}` : undefined,
      npc: npc ? `Press E — Talk to ${npc.name}` : undefined,
      dock,
      sailing: !dock && isSailing() ? "Sailing" : undefined,
      companion: this.companions?.promptLabel(Boolean(gather)),
      gather: gather ? this.formatGatherPrompt(gather) : undefined,
    });
    // A quest caption outranks an interact prompt: one transient hint at a time (#391).
    const label = isOpeningCaptionShowing() ? undefined : picked?.label;
    const action = overlayAction(Boolean(this.shrinePrompt), label);

    if (action === "destroy") {
      this.shrinePrompt?.destroy();
      this.shrinePrompt = undefined;
      return;
    }
    if (action === "idle" || !label) {
      return;
    }
    if (action === "update" && this.shrinePrompt) {
      this.shrinePrompt.setText(label);
      placeWorldHudText(this, this.shrinePrompt, "bottom", 48);
      return;
    }

    this.shrinePrompt = attachHudPill(
      this.add
        .text(0, 0, label, { ...HUD_PILL_TEXT_STYLE, fontSize: "15px" })
        .setOrigin(0.5)
        .setDepth(hudDepthAbovePlayer(this.playerDepth)),
    );
    placeWorldHudText(this, this.shrinePrompt, "bottom", 48);
  }

  private getNearbyGatherProp() {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    return findGatherPropNearPlayer(this.currentZoneId, tileX, tileY);
  }

  private getNearbyDockPrompt(): string | undefined {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    if (!isNearAnyDock(this.currentZoneId, tileX, tileY)) {
      return undefined;
    }
    const atWestDock = isNearHarborDock(this.currentZoneId, tileX, tileY);
    const atArchipelagoDock = isNearArchipelagoDock(
      this.currentZoneId,
      tileX,
      tileY,
    );
    const moored = getMooredDock();
    const atMooredDock =
      atArchipelagoDock ||
      (moored === "west" && atWestDock) ||
      (moored === "east" && !atWestDock && !atArchipelagoDock);
    if (isVisitorMode()) {
      if (isBoatPlaced() && atMooredDock) {
        return "Boat moored (embark is host only)";
      }
      return atWestDock && !isBoatPlaced()
        ? "Dock (host can place a boat)"
        : undefined;
    }
    if (isSailing()) {
      return "Press E — Disembark";
    }
    if (isBoatPlaced()) {
      if (!atMooredDock) {
        return undefined;
      }
      return "Press E — Board boat";
    }
    // Place boat only at the west Harbor dock.
    if (!atWestDock) {
      return undefined;
    }
    if (getItemCount("boat") > 0) {
      return "Press E — Place boat";
    }
    return "Dock — craft a boat at Moon Shrine";
  }

  private drawPlacedBoat(zone: ZoneDefinition): void {
    this.dockBoat?.destroy();
    this.dockBoat = undefined;
    if (!isBoatPlaced()) {
      return;
    }
    // While sailing the boat follows the player instead of sitting at the dock.
    if (isSailing()) {
      return;
    }
    let pad: { x: number; y: number } | undefined;
    if (zone.id === HARBOR_DOCK.zoneId) {
      pad =
        getMooredDock() === "east" ? EAST_LANDING_EMBARK_WATER : HARBOR_DOCK;
    } else if (zone.id === "archipelago") {
      pad = getArchipelagoMooringPad(
        Math.round(this.playerGridX),
        Math.round(this.playerGridY),
      );
    }
    if (!pad) {
      return;
    }
    const screen = this.toScreen(pad.x, pad.y);
    const boat = this.add
      .image(screen.x, screen.y + TILE_HEIGHT / 2 - 2, ...imagineTexture(this, getBoatTextureKey()))
      .setOrigin(0.5, 1);
    fitDisplay(boat, PROP_DISPLAY["prop-boat"]);
    boat.setDepth(depthForGridCell(pad.x, pad.y, PROP_LAYER));
    if (zone.id === "archipelago") {
      this.registerStreamSprite(boat, pad.x, pad.y);
    }
    this.dockBoat = boat;
  }

  private tryDockInteract(): boolean {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    if (!isNearAnyDock(this.currentZoneId, tileX, tileY)) {
      return false;
    }

    if (!isBoatPlaced()) {
      // Place boat only at the west Harbor dock.
      if (!isNearHarborDock(this.currentZoneId, tileX, tileY)) {
        return false;
      }
      const result = tryPlaceBoat(this.currentZoneId, tileX, tileY);
      if (result.ok && result.consumed) {
        // Reload first so removeAll does not wipe the confirmation toast.
        this.loadZone(this.currentZoneId);
      }
      this.showGatherToast(result.message, result.ok);
      updateStatusPanel(getZone(this.currentZoneId));
      this.updateInteractPrompt();
      return true;
    }

    if (isSailing()) {
      const result = tryDisembark(this.currentZoneId, tileX, tileY);
      if (result.ok && result.disembarked && result.playerX !== undefined && result.playerY !== undefined) {
        this.playerGridX = result.playerX;
        this.playerGridY = result.playerY;
        updateHostPosition(
          this.currentZoneId,
          this.playerGridX,
          this.playerGridY,
        );
        this.syncPlayerToGrid();
        this.drawPlacedBoat(getZone(this.currentZoneId));
        this.maybeNoteIslandLand();
      }
      this.showGatherToast(result.message, result.ok);
      updateStatusPanel(getZone(this.currentZoneId));
      this.updateInteractPrompt();
      return true;
    }

    const result = tryEmbark(this.currentZoneId, tileX, tileY);
    if (result.ok && result.embarked && result.playerX !== undefined && result.playerY !== undefined) {
      this.playerGridX = result.playerX;
      this.playerGridY = result.playerY;
      updateHostPosition(
        this.currentZoneId,
        this.playerGridX,
        this.playerGridY,
      );
      this.dockBoat?.destroy();
      this.dockBoat = undefined;
      this.syncPlayerToGrid();
    }
    this.showGatherToast(result.message, result.ok);
    updateStatusPanel(getZone(this.currentZoneId));
    this.updateInteractPrompt();
    return true;
  }

  private formatGatherPrompt(
    prop: NonNullable<ReturnType<typeof findGatherPropNearPlayer>>,
  ): string {
    const remaining = getGatherCooldownRemainingMs(
      this.currentZoneId,
      prop.x,
      prop.y,
      prop.action,
    );
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      return `Regrowing (${seconds}s)`;
    }
    return `Press E — ${prop.action.prompt}`;
  }

  /** #390: a fully fainted party wakes at the Moon Shrine (free, nothing lost). */
  private wakeStrandedPartyIfNeeded(): void {
    const wake = wakeStrandedParty(isSailing());
    if (!wake) {
      return;
    }
    if (wake.spot) {
      this.playerGridX = wake.spot.x;
      this.playerGridY = wake.spot.y;
      this.loadZone(wake.spot.zoneId);
      this.syncPlayerToGrid();
      updateHostPosition(this.currentZoneId, this.playerGridX, this.playerGridY);
    }
    this.showGatherToast(wake.message, true, 4500);
  }

  private tryShrineInteract(): boolean {
    if (!this.isNearShrineTile()) {
      return false;
    }
    this.inShrine = true;
    setTouchControlsEnabled(false);
    playShrineSfx(this);
    if (this.shrinePrompt) {
      this.shrinePrompt.destroy();
      this.shrinePrompt = undefined;
    }
    // Soft overworld (#390): the altar always heals for free.
    const notice = visitShrineAltar() ?? undefined;
    this.scene.pause();
    this.scene.launch("ShrineScene", { mode: "altar", notice });
    return true;
  }

  private onPortableShrineOpen = (event: Event): void => {
    if (this.inShrine || this.inEncounter || this.inDialogue || this.inMinigame) {
      return;
    }
    if (isVisitorMode() || getItemCount(PORTABLE_MOONSHRINE_ID) < 1) {
      return;
    }
    const detail =
      event instanceof CustomEvent
        ? (event.detail as OpenPortableShrineDetail | undefined)
        : undefined;
    this.inShrine = true;
    setTouchControlsEnabled(false);
    playShrineSfx(this);
    this.scene.pause();
    this.scene.launch("ShrineScene", {
      mode: "portable",
      tab: detail?.tab,
      itemId: detail?.itemId,
    });
  };

  private tryDoorInteract(): boolean {
    const door = this.getNearbyDoor();
    if (!door) {
      return false;
    }
    this.playerGridX = door.targetX;
    this.playerGridY = door.targetY;
    this.loadZone(door.targetZone);
    this.syncPlayerToGrid();
    return true;
  }

  private syncKeyboardGate(): void {
    applyNameIntroKeyboardGate(this.input.keyboard, hasPlayerName());
  }

  private getMinigameHere() {
    const tileX = Math.round(this.playerGridX);
    const tileY = Math.round(this.playerGridY);
    const nearby = findMinigameNearPlayer(this.currentZoneId, tileX, tileY);
    if (!nearby) {
      return undefined;
    }
    const npcDist = nearestNpcDistance(this.currentZoneId, tileX, tileY);
    if (!shouldPreferMinigameOverNpc(nearby.dist, npcDist)) {
      return undefined;
    }
    return nearby.game;
  }

  private tryMinigameInteract(): boolean {
    const minigame = this.getMinigameHere();
    if (!minigame) {
      return false;
    }
    const launch = canLaunchMinigame(minigame.id);
    if (!launch.ok) {
      this.showGatherToast(launch.message ?? "Not now.", false);
      return true;
    }
    this.inMinigame = true;
    setTouchControlsEnabled(false);
    if (this.shrinePrompt) {
      this.shrinePrompt.destroy();
      this.shrinePrompt = undefined;
    }
    this.scene.pause();
    this.scene.launch(minigame.sceneKey);
    return true;
  }

  private tryNpcInteract(): boolean {
    const npc = this.getNearbyNpc();
    if (!npc) {
      return false;
    }
    this.inDialogue = true;
    setTouchControlsEnabled(false);
    if (this.shrinePrompt) {
      this.shrinePrompt.destroy();
      this.shrinePrompt = undefined;
    }
    this.scene.pause();
    this.scene.launch("DialogueScene", { npcId: npc.id });
    return true;
  }

  private groundAt(x: number, y: number): { x: number; y: number } {
    const screen = this.toScreen(x, y);
    return { x: screen.x, y: screen.y + TILE_HEIGHT / 2 - 2 };
  }

  private createCompanions(): OverworldCompanions {
    return new OverworldCompanions({
      scene: this,
      fx: () => this.fx,
      zoneId: () => this.currentZoneId,
      playerTile: () => ({
        x: Math.round(this.playerGridX),
        y: Math.round(this.playerGridY),
      }),
      groundAt: (x, y) => this.groundAt(x, y),
      depthAt: (x, y) => depthForGridCell(x, y, PROP_LAYER),
      followerSprites: () => this.partyFollowers.sprites,
      toast: (message, ok) => this.showGatherToast(message, ok),
      movePlayerTo: (x, y) => {
        this.playerGridX = x;
        this.playerGridY = y;
        this.syncPlayerToGrid();
        updateHostPosition(this.currentZoneId, x, y);
      },
      spawnProp: (x, y, kind) =>
        this.spawnPropSprite(x, y, kind, true, this.currentZoneId),
      isBusy: () =>
        this.inDialogue || this.inMinigame || this.inShrine || this.inEncounter,
      setKeyboardCaptured: (captured) =>
        applyNameIntroKeyboardGate(
          this.input.keyboard,
          captured && hasPlayerName(),
        ),
    });
  }

  private tryGatherInteract(): void {
    if (isVisitorMode()) {
      return;
    }

    const prop = this.getNearbyGatherProp();
    if (!prop) {
      return;
    }

    const result = tryHarvestNode(
      this.currentZoneId,
      prop.x,
      prop.y,
      prop.action,
    );
    updateStatusPanel(getZone(this.currentZoneId));
    this.showGatherToast(result.message, result.ok);
    if (result.ok) {
      playGatherSfx(this);
      this.spawnHarvestBurst(prop.x, prop.y, prop.action.materialId);
    }
    this.updateInteractPrompt();
  }

  private spawnHarvestBurst(gridX: number, gridY: number, materialId: string): void {
    const color =
      materialId.includes("wood") ? 0xa87545 :
      materialId.includes("fiber") ? 0x91bf66 :
      materialId.includes("stone") ? 0x9a9aa4 : 0xb4aaa0;
    const screen = this.toScreen(gridX, gridY);
    this.fx?.gatherBurst(screen.x, screen.y + TILE_HEIGHT / 2 - 18, color);
  }

  /** Shrine ritual + level-up/evolve sparkles after a paused scene (#362). */
  private celebrateResume(fromShrine: boolean): void {
    if (!this.fx) {
      return;
    }
    if (fromShrine) {
      const altar = getZone(this.currentZoneId).shrineInteract;
      const at = altar
        ? this.toScreen(altar.x, altar.y)
        : { x: this.player.x, y: this.playerBaseY };
      this.fx.shrineRitual(at.x, altar ? at.y + TILE_HEIGHT / 2 - 4 : at.y);
    }
    this.fx.celebratePartyChanges(this.partyFollowers.sprites, {
      x: this.player.x,
      y: this.playerBaseY,
    });
  }

  /** After the finale card: point at the optional Sovereign voyage (#369 hook). */
  private continueAfterFinale(): void {
    updateStatusPanel(getZone(this.currentZoneId));
    const hint = getSovereignVoyageHint();
    if (hint) {
      this.showGatherToast(hint, true, 4200);
    }
  }

  private showGatherToast(message: string, ok: boolean, durationMs = 1800): void {
    this.gatherToast?.destroy();
    this.gatherToast = this.add
      .text(0, 0, message, {
        color: ok ? "#d8f0c0" : "#f0d0c0",
        backgroundColor: "#2a2a3e",
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        padding: { x: 12, y: 8 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(hudDepthAbovePlayer(this.playerDepth));
    placeWorldHudText(this, this.gatherToast, "top", 120);

    this.time.delayedCall(durationMs, () => {
      this.gatherToast?.destroy();
      this.gatherToast = undefined;
    });
  }

  private syncPlayerToGrid(): void {
    const screen = this.toScreen(this.playerGridX, this.playerGridY);

    this.playerBaseY = screen.y + TILE_HEIGHT / 2 - 2;
    const bob = this.isMoving ? walkBobOffset(this.walkPhase) : 0;
    this.player.setPosition(screen.x, this.playerBaseY + bob);
    this.player.setDepth(this.playerDepth);
    if (isSailing()) {
      destroyPartyOverworldFollowers(this.partyFollowers);
    } else {
      const spot = this.isMoving ? undefined : this.companions?.curiousSpot();
      syncPartyOverworldFollowers(this, this.partyFollowers, {
        x: screen.x,
        y: this.playerBaseY + bob,
        facing: this.playerFacing,
        depth: this.playerDepth,
        moving: this.isMoving,
        curiousTarget: spot ? this.groundAt(spot.x, spot.y) : undefined,
      });
      this.fx?.animateFollowers(
        this.partyFollowers.sprites,
        this.partyFollowers.moonDots,
        this.isMoving,
      );
    }
    this.syncNameTagPosition();
    // Boat stays on the waterline; only the trainer bobs with gait.
    this.syncSailingBoat(screen.x, this.playerBaseY);
  }

  private refreshNameTag(): void {
    const name = getPlayerName();
    if (!name || !this.player) {
      this.nameTag?.destroy();
      this.nameTag = undefined;
      setTouchControlsEnabled(false);
      return;
    }
    setTouchControlsEnabled(true);
    if (!this.nameTag) {
      this.nameTag = this.add
        .text(0, 0, name, {
          fontFamily: "Source Sans 3, system-ui, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#000000",
          align: "center",
        })
        .setOrigin(0.5, 1);
    } else {
      this.nameTag.setText(name);
    }
    this.syncNameTagPosition();
  }

  private syncNameTagPosition(): void {
    if (!this.nameTag || !this.player) {
      return;
    }
    this.nameTag.setPosition(
      this.player.x,
      this.player.y - PLAYER_DISPLAY.height - 2,
    );
    this.nameTag.setDepth(hudDepthAbovePlayer(this.playerDepth));
  }

  private syncSailingBoat(screenX: number, baseY: number): void {
    if (!isSailing()) {
      if (this.sailingBoat) {
        this.sailingBoat.destroy();
        this.sailingBoat = undefined;
      }
      return;
    }
    if (!this.sailingBoat) {
      this.sailingBoat = this.add
        .image(screenX, baseY, ...imagineTexture(this, getBoatTextureKey()))
        .setOrigin(0.5, 1);
      fitDisplay(this.sailingBoat, PROP_DISPLAY["prop-boat"]);
    } else {
      this.sailingBoat.setPosition(screenX, baseY);
    }
    this.sailingBoat.setDepth(this.playerDepth - 1);
  }

  private playPlayerAnimation(): void {
    if (!this.player) {
      return;
    }
    applyPlayerPose(
      this.player,
      this.playerFacing,
      this.isMoving,
      this.walkPhase,
    );
  }

  private updateQuestToast(): void {
    // Cutscenes (evolution, finale) own the screen: leave the toast queued so
    // it appears once they end instead of popping over the reveal (#391).
    if (isCutsceneActive()) {
      return;
    }
    const message = consumeQuestToast();
    if (!message) {
      return;
    }

    updateStatusPanel(getZone(this.currentZoneId));

    this.questToast?.destroy();
    this.questToast = this.add
      .text(0, 0, message, {
        color: "#f0e6d2",
        backgroundColor: "#2a2a3e",
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        padding: { x: 12, y: 8 },
        align: "center",
        wordWrap: { width: 360 },
      })
      .setOrigin(0.5, 0)
      .setDepth(hudDepthAbovePlayer(this.playerDepth));
    placeWorldHudText(this, this.questToast, "top", 120);

    this.time.delayedCall(2800, () => {
      this.questToast?.destroy();
      this.questToast = undefined;
    });
  }

  private updateAchievementToast(): void {
    const message = consumeAchievementToast();
    if (!message) {
      return;
    }

    updateStatusPanel(getZone(this.currentZoneId));

    // Own slot below the quest toast so a simultaneous quest completion
    // does not hide the unlock.
    this.achievementToast?.destroy();
    this.achievementToast = this.add
      .text(0, 0, message, {
        color: "#f4e3a1",
        backgroundColor: "#2a2a3e",
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        padding: { x: 12, y: 8 },
        align: "center",
        wordWrap: { width: 360 },
      })
      .setOrigin(0.5, 0)
      .setDepth(hudDepthAbovePlayer(this.playerDepth));
    placeWorldHudText(this, this.achievementToast, "top", 176);

    this.time.delayedCall(4200, () => {
      this.achievementToast?.destroy();
      this.achievementToast = undefined;
    });
  }

  private async tryCopyInvite(): Promise<void> {
    if (isVisitorMode() || shouldShowWalkHint(this.walkHintTravel)) {
      return;
    }

    hideManualInviteUrl();
    try {
      const result = await shareOrCopyInviteLink(
        this.currentZoneId,
        this.playerGridX,
        this.playerGridY,
      );
      if (result.status === "copied") {
        flashInviteStatus("Invite link copied!", "#d8f0c0");
      } else if (result.status === "shared") {
        flashInviteStatus("Invite shared!", "#d8f0c0");
      } else if (result.status === "manual" || result.status === "cancelled") {
        showManualInviteUrl(result.url);
        flashInviteStatus(
          result.status === "cancelled"
            ? "Share cancelled — select the invite link to copy"
            : "Select the invite link to copy",
          "#d8f0c0",
        );
      } else {
        console.error(result.error);
        if (result.url) {
          showManualInviteUrl(result.url);
          flashInviteStatus("Select the invite link to copy", "#f08080");
        } else {
          flashInviteStatus("Failed to share invite", "#f08080");
        }
      }
    } catch (error) {
      console.error(error);
      flashInviteStatus("Failed to share invite", "#f08080");
    }
  }

}
