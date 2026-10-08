import Phaser from "phaser";
import { playBattleWinSfx, playBossStingSfx, playUiClickSfx } from "../audio/gameAudio";
import { fastBattleEnabled } from "../battle/vfx/battleTiming";
import { UNARMED_WANDERER } from "../battle/wandererWeapons";
import { getCreatureDefinition } from "../creatures/catalog";
import { displayName } from "../creatures/displayName";
import { getActiveCreatures, getEffectiveMaxHp } from "../creatures/party";
import { effectsEnabled, prefersReducedMotion } from "../render/fx/fxSettings";
import { ensureFxTextures, FX_TEX } from "../render/fx/fxTextures";
import { fetchLateImages, lateCreatureKeys } from "../render/lateAssets";
import { resizeGameForDisplay } from "../render/pixelRatio";
import { bindCutscene } from "../ui/hudLock";
import { layoutStage } from "../ui/stageLayout";
import { SCORE } from "./scoring";
import { typeLabel } from "./trialBoss";
import { ECLIPSE_BOSS_CREATURE, TRIAL_ROUNDS } from "./trialPlan";
import {
  abandonTrial,
  beginTrial,
  chooseTrialBoon,
  currentBoonOffers,
  endTrialRound,
  finishTrial,
  getTrialRun,
  previewRoundLevel,
  runningScore,
  startTrialRound,
  trialBlockReason,
  trialPartyStanding,
  type TrialMode,
  type TrialOutcome,
} from "./trialRun";
import { formatTrialDay, type TrialDay } from "./trialSeed";
import { bestScoreFor, currentStreak } from "./trialState";
import { openTrialShare, renderTrialCardBlob } from "./trialShareActions";
import { TrialOverlay, type PipState } from "./trialUi";
import { TrialBattleStrip } from "./trialBattleHud";

export const TRIAL_SCENE_KEY = "TrialScene";

export type TrialSceneData = {
  day: TrialDay;
  mode: TrialMode;
  /** Scene paused underneath; resumed on exit. */
  returnTo?: string;
  /** Sandbox (share link) exits: the link page decides what comes next. */
  onExit?: (outcome: TrialOutcome | null) => void;
};

/** BattleScene must come up within this long (the boss waits for its late art). */
const BATTLE_START_TIMEOUT_MS = 5000;
const BOSS_START_TIMEOUT_MS = 20_000;

/**
 * Eclipse Trial conductor (#420): eclipse sky + particles on the canvas, the
 * DOM screens (trialUi.ts) on top, and one BattleScene per round. Rules and
 * save handling live in trialRun.ts.
 */
export class TrialScene extends Phaser.Scene {
  private data_!: TrialSceneData;
  private ui!: TrialOverlay;
  private sky?: Phaser.GameObjects.Graphics;
  private confetti?: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastScore = 0;
  private exiting = false;

  constructor() {
    super({ key: TRIAL_SCENE_KEY });
  }

  init(data: TrialSceneData): void {
    this.data_ = data;
    this.lastScore = 0;
    this.exiting = false;
  }

  private get motion(): { particles: boolean; animate: boolean } {
    const reduced = prefersReducedMotion();
    return { particles: effectsEnabled() && !reduced, animate: !reduced && !fastBattleEnabled() };
  }

  create(): void {
    document.body.classList.add("trial-active");
    const release = bindCutscene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      release();
      document.body.classList.remove("trial-active");
      this.ui?.destroy();
      this.scale.off("resize", this.drawSky, this);
    });
    ensureFxTextures(this);
    // The boss wears late-loaded art: start the fetch now so round 5 never waits.
    void fetchLateImages(this.textures, lateCreatureKeys([ECLIPSE_BOSS_CREATURE]));
    this.fitStage();
    this.scale.on("resize", this.drawSky, this);
    this.ui = new TrialOverlay(this.game);
    if (!beginTrial(this.data_.day, this.data_.mode)) {
      this.ui.renderMessage(
        "The Eclipse Gate is closed",
        trialBlockReason() ?? "No companion can stand in the trial right now.",
        () => this.exit(null),
      );
      return;
    }
    this.showPreview();
  }

  /** The dock is hidden for the whole trial: size the canvas to the full stage. */
  private fitStage(): void {
    const stage = layoutStage();
    resizeGameForDisplay(this, stage.width, stage.height);
    this.drawSky();
  }

  private drawSky(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setZoom(1).centerOn(w / 2, h / 2);
    this.sky?.destroy();
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x2a1640, 0x2a1640, 0x07040c, 0x07040c, 1);
    g.fillRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.12;
    g.fillStyle(0xff9a4a, 0.18);
    g.fillCircle(w * 0.78, h * 0.18, r * 1.9);
    g.fillStyle(0xb48cff, 0.22);
    g.fillCircle(w * 0.78, h * 0.18, r * 1.4);
    g.fillStyle(0x07040c, 1);
    g.fillCircle(w * 0.78, h * 0.18, r);
    g.lineStyle(Math.max(2, r * 0.04), 0xffd27a, 0.9);
    g.strokeCircle(w * 0.78, h * 0.18, r);
    this.sky = g;
    if (this.motion.particles && !this.confetti) {
      this.add
        .particles(0, 0, FX_TEX.glow, {
          x: { min: 0, max: w },
          y: h + 10,
          speedY: { min: -60, max: -20 },
          speedX: { min: -10, max: 10 },
          lifespan: { min: 5000, max: 9000 },
          scale: { start: 0.5, end: 0 },
          alpha: { start: 0.7, end: 0 },
          frequency: 260,
          tint: [0xb48cff, 0xff9a4a, 0xffd27a],
          blendMode: Phaser.BlendModes.ADD,
        })
        .setDepth(-9);
      this.confetti = this.add
        .particles(0, 0, FX_TEX.spark, {
          emitting: false,
          speed: { min: 220, max: 620 },
          angle: { min: 200, max: 340 },
          gravityY: 520,
          lifespan: { min: 1400, max: 2400 },
          rotate: { min: 0, max: 360 },
          scale: { start: 1.1, end: 0.3 },
          tint: [0xffd27a, 0xb48cff, 0xff9a4a, 0xfff4e8, 0x9af0b0],
          maxParticles: 220,
        })
        .setDepth(-8);
    }
  }

  private kicker(): string {
    const day = formatTrialDay(this.data_.day);
    return this.data_.mode === "sandbox" ? `Eclipse Trial · ${day} · practice` : `Eclipse Trial · ${day}`;
  }

  private pips(): PipState[] {
    const run = getTrialRun();
    const total = run?.plan.rounds.length ?? 5;
    return Array.from({ length: total }, (_, i) => {
      const record = run?.records[i];
      if (record) {
        return record.cleared ? "done" : "lost";
      }
      return run && i === run.roundIndex && run.phase !== "done" ? "now" : "todo";
    });
  }

  private showPreview(): void {
    const run = getTrialRun();
    if (!run) {
      return;
    }
    const round = run.plan.rounds[run.roundIndex]!;
    const boss = round.kind === "boss";
    const [a, b] = run.plan.boss.formTypes;
    if (boss) {
      playBossStingSfx(this);
    }
    this.ui.renderPreview(
      {
        kicker: this.kicker(),
        pips: this.pips(),
        score: runningScore(),
        banner: boss ? "THE ECLIPSE SHADE" : `ROUND ${round.index + 1}`,
        foeLine: boss
          ? `Lv ${previewRoundLevel()} · ${typeLabel(a)}, then ${typeLabel(b)}`
          : `${getCreatureDefinition(round.creatureId).name} · Lv ${previewRoundLevel()}`,
        foeId: round.creatureId,
        mods: round.modifiers,
        boons: run.pendingBoons,
        note:
          round.index === 0
            ? "Five battles with your party, the last a boss. No befriending and nothing to lose: a faint ends the trial and everyone is restored."
            : boss
              ? "Two forms. When she gathers the dark, Guard the next turn to parry and stagger her."
              : undefined,
        animate: this.motion.animate,
      },
      () => this.beginRound(),
      () => this.confirmLeave(),
    );
  }

  private beginRound(): void {
    playUiClickSfx(this);
    const trial = startTrialRound();
    if (!trial) {
      this.showResults(finishTrial());
      return;
    }
    this.ui.hide();
    trial.createStrip = (scene, area, ui) => new TrialBattleStrip(scene, trial, area, ui);
    const battle = this.scene.get("BattleScene");
    let started = false;
    let settled = false;
    const watchdog = window.setTimeout(
      () => {
        if (started || settled) {
          return;
        }
        settled = true;
        battle.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
        battle.events.off(Phaser.Scenes.Events.CREATE, onCreate);
        this.scene.stop("BattleScene");
        this.onRoundClosed(null);
      },
      trial.isBoss ? BOSS_START_TIMEOUT_MS : BATTLE_START_TIMEOUT_MS,
    );
    const onCreate = (): void => {
      started = true;
      window.clearTimeout(watchdog);
    };
    const onShutdown = (): void => {
      battle.events.off(Phaser.Scenes.Events.CREATE, onCreate);
      window.clearTimeout(watchdog);
      if (settled) {
        return;
      }
      settled = true;
      this.onRoundClosed(trial.verdict === true);
    };
    battle.events.once(Phaser.Scenes.Events.CREATE, onCreate);
    battle.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    this.lastScore = runningScore();
    this.scene.launch("BattleScene", {
      wildCreatureId: trial.foeCreatureId,
      wandererPartner: UNARMED_WANDERER,
      trial,
    });
    this.scene.bringToTop("BattleScene");
    this.scene.pause();
  }

  /** Battle closed: `won` null = it never came up (watchdog). */
  private onRoundClosed(won: boolean | null): void {
    this.scene.resume();
    this.fitStage();
    if (won === null) {
      abandonTrial();
      this.ui.renderMessage(
        "The Eclipse Gate faltered",
        "The battle could not start. Your party and your save are untouched.",
        () => this.exit(null),
      );
      return;
    }
    const verdict = endTrialRound(won);
    if (verdict.finished) {
      this.showResults(finishTrial());
      return;
    }
    this.showBoon();
  }

  private showBoon(): void {
    const run = getTrialRun();
    if (!run) {
      return;
    }
    const score = runningScore();
    const next = run.plan.rounds[run.roundIndex]!;
    const party = getActiveCreatures().map((c) => ({
      name: displayName(c),
      hp: Math.max(0, c.currentHp),
      max: getEffectiveMaxHp(c),
    }));
    this.ui.renderBoon(
      {
        kicker: this.kicker(),
        pips: this.pips(),
        score,
        banner: `ROUND ${run.roundIndex} CLEARED`,
        sub: `+${(score - this.lastScore).toLocaleString("en-US")} score · your party caught its breath`,
        party,
        nextLine:
          next.kind === "boss"
            ? "Next: the Eclipse Shade"
            : `Next: ${getCreatureDefinition(next.creatureId).name} · Lv ${previewRoundLevel()}`,
        nextMods: next.modifiers,
        offers: currentBoonOffers(),
        skipPoints: SCORE.boonSkipped,
        animate: this.motion.animate,
      },
      (id) => this.pickBoon(id),
      () => this.confirmLeave(),
    );
  }

  private pickBoon(id: Parameters<typeof chooseTrialBoon>[0]): void {
    if (!chooseTrialBoon(id)) {
      return;
    }
    playUiClickSfx(this);
    if (!trialPartyStanding()) {
      // Everyone fell as the last foe did, and no Mend: the trial ends here.
      this.showResults(finishTrial());
      return;
    }
    this.showPreview();
  }

  private confirmLeave(): void {
    if (!window.confirm("Leave the Eclipse Trial? Your party is restored and this run won't count.")) {
      return;
    }
    abandonTrial();
    this.exit(null);
  }

  private showResults(outcome: TrialOutcome | null): void {
    if (!outcome) {
      this.exit(null);
      return;
    }
    const s = outcome.score;
    const total = TRIAL_ROUNDS;
    if (s.roundsCleared >= 3) {
      playBattleWinSfx(this);
      if (this.motion.particles && this.confetti) {
        const w = this.scale.width;
        this.confetti.explode(s.cleared ? 160 : 80, w / 2, this.scale.height * 0.35);
      }
    }
    const lines: string[] = [];
    if (outcome.mode === "host") {
      const best = bestScoreFor(outcome.day);
      const streak = currentStreak(outcome.day);
      lines.push(
        `${outcome.settlement?.newBest ? "New best today!" : `Best today: ${(best ?? s.total).toLocaleString("en-US")}`}${streak > 0 ? ` · Streak: ${streak} day${streak === 1 ? "" : "s"}` : ""}`,
      );
      if (outcome.rewards.length === 0 && s.roundsCleared < 3) {
        lines.push("Clear 3 rounds for today's Folklore Dust.");
      }
    } else {
      lines.push("Practice run — nothing was saved. Play Ivyward to run it in your own world.");
    }
    const boonsLine = s.boonsSkipped > 0 ? `${s.boonsUsed} taken · ${s.boonsSkipped} skipped` : `${s.boonsUsed} taken`;
    const buttons = [
      { label: "Share result", variant: "primary" as const, onClick: () => this.share(outcome) },
      { label: "Done", onClick: () => this.exit(outcome) },
    ];
    this.ui.renderResults(
      {
        kicker: this.kicker(),
        pips: this.pipsFor(outcome),
        title: outcome.title,
        score: s.total,
        breakdown: [
          ["Rounds cleared", `${s.roundsCleared} / ${total}  (+${s.parts.rounds.toLocaleString("en-US")})`],
          ["Speed", `${s.turns} turn${s.turns === 1 ? "" : "s"}  (+${s.parts.speed})`],
          ["Grit", `${s.damageTaken} HP taken  (+${s.parts.grit})`],
          ["Perfect parries", `${s.parries}  (+${s.parts.parries})`],
          ["Boons", `${boonsLine}  (+${s.parts.boons})`],
        ],
        rewards: outcome.rewards,
        lines,
        animate: this.motion.animate,
      },
      buttons,
    );
    void renderTrialCardBlob(this.game, outcome)
      .then((blob) => this.ui.showCard(blob))
      .catch(() => undefined);
  }

  private pipsFor(outcome: TrialOutcome): PipState[] {
    const cleared = outcome.score.roundsCleared;
    return Array.from({ length: TRIAL_ROUNDS }, (_, i) =>
      i < cleared ? "done" : i === cleared && !outcome.score.cleared ? "lost" : "todo",
    );
  }

  private share(outcome: TrialOutcome): void {
    playUiClickSfx(this);
    void openTrialShare(this.game, outcome);
  }

  private exit(outcome: TrialOutcome | null): void {
    if (this.exiting) {
      return;
    }
    this.exiting = true;
    const returnTo = this.data_.returnTo;
    const onExit = this.data_.onExit;
    this.ui.destroy();
    if (returnTo) {
      this.scene.resume(returnTo);
    }
    this.scene.stop();
    onExit?.(outcome);
  }
}
