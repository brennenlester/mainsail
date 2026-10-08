import Phaser from "phaser";
import {
  getAudioVolume,
  isAudioMuted,
  setAudioMuted,
  setAudioScreen,
  setAudioVolume,
  unlockAudioFromGesture,
} from "../audio/gameAudio";
import { getBootContext } from "../opening/bootRoute";
import { startOpeningBeat } from "../opening/openingCaption";
import { TitleMenu, navFromKey, type NavInput } from "../opening/titleMenu";
import {
  effectsEnabled,
  prefersReducedMotion,
  setEffectsEnabled,
} from "../render/fx/fxSettings";
import {
  bindOverlayPixelRatio,
  DESIGN_SIZE,
  resizeGameForDisplay,
} from "../render/pixelRatio";
import { initNameIntro } from "../ui/nameIntro";
import { getPlayerName } from "../world/playerName";
import { clearHostSave } from "../world/worldSave";

/** Standalone Blender renders (`npm run render:title`), never atlas-packed. */
export const TITLE_ART = {
  hill: "title-shrine-hill",
  mossling: "title-mossling",
  wisp: "title-wisp",
} as const;

export function preloadTitleArt(scene: Phaser.Scene): void {
  for (const key of Object.values(TITLE_ART)) {
    scene.load.image(key, `assets/title/${key}.png`);
  }
}

const S = DESIGN_SIZE;
/** Procedural textures are drawn at 2x so HiDPI zoom stays crisp. */
const TEX_SCALE = 2;
const NAVY = 0x0d1424;
const SCREEN_MARGIN = 12;

const TEX = {
  sky: "title-sky",
  glow: "title-glow",
  star: "title-star",
  moon: "title-moon",
  far: "title-hills-far",
  mid: "title-hills-mid",
  near: "title-hills-near",
  beam: "title-beam",
  vignette: "title-vignette",
} as const;

/** Near-hill crest (texture px): humps under the two companions. */
const NEAR_CREST: Array<[number, number]> = [[0, 64], [150, 36], [300, 98], [380, 104], [560, 30], [DESIGN_SIZE + 80, 52]];

/** Smoothstep crest height (texture px) — close to the bezier ridge. */
function crestAt(x: number): number {
  for (let i = 1; i < NEAR_CREST.length; i++) {
    if (x <= NEAR_CREST[i][0]) {
      const [x0, y0] = NEAR_CREST[i - 1];
      const [x1, y1] = NEAR_CREST[i];
      const u = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * u * u * (3 - 2 * u);
    }
  }
  return NEAR_CREST[NEAR_CREST.length - 1][1];
}

type ParallaxLayer = { container: Phaser.GameObjects.Container; factor: number };

/**
 * Title screen (#363 / #350): moonlit parallax diorama + Ivyward logo,
 * "press any key" gate (audio unlock per autoplay policy), then the DOM menu
 * (Continue / New Game / Settings).
 */
export class TitleScene extends Phaser.Scene {
  private layers: ParallaxLayer[] = [];
  private menu?: TitleMenu;
  private started = false;
  private leaving = false;
  private prompt?: Phaser.GameObjects.Text;
  private logoParts: Phaser.GameObjects.GameObject[] = [];
  private logoTweens: Phaser.Tweens.Tween[] = [];
  private logoFinal: Array<() => void> = [];
  private padHeld = new Set<string>();
  private driftMs = 0;
  private motion = true;
  private fireflies?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: "TitleScene" });
  }

  create(): void {
    this.layers = [];
    this.logoParts = [];
    this.logoTweens = [];
    this.logoFinal = [];
    this.started = false;
    this.leaving = false;
    this.motion = !prefersReducedMotion();
    document.body.classList.add("title-active");
    this.layoutBoard();
    bindOverlayPixelRatio(this);
    this.cameras.main.setBackgroundColor(NAVY);

    this.makeTextures();
    this.buildSky();
    this.buildFarHills();
    this.buildShrine();
    this.buildNearHills();
    this.buildCompanions();
    this.buildFireflies();
    this.add.image(S / 2, S / 2, TEX.vignette).setScale(1 / TEX_SCALE).setDepth(50);
    void this.buildLogo();
    this.buildPrompt();
    this.mountMenu();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("resize", this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.cameras.main.fadeIn(700, 13, 20, 36);
  }

  update(_time: number, delta: number): void {
    this.pollGamepads();
    if (this.motion) {
      this.driftMs += delta;
    }
    // Slow "camera" drift: each layer moves by its depth factor (parallax).
    const dx = Math.sin(this.driftMs / 5200) * 16;
    const dy = Math.sin(this.driftMs / 7300) * 5;
    for (const { container, factor } of this.layers) {
      container.setPosition(dx * factor, dy * factor);
    }
  }

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

  /** Square board sized to the viewport (no HUD on the title). */
  private layoutBoard(): void {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const size = Math.max(1, Math.floor(Math.min(vw, vh) - SCREEN_MARGIN * 2));
    const playfield = document.getElementById("playfield");
    const gameEl = document.getElementById("game");
    if (playfield) {
      playfield.style.width = `${size}px`;
    }
    if (gameEl) {
      gameEl.style.width = `${size}px`;
      gameEl.style.height = `${size}px`;
    }
    resizeGameForDisplay(this, size);
    this.scale.refresh();
  }

  private onResize = (): void => {
    if (!this.leaving) {
      this.layoutBoard();
    }
  };

  private layer(factor: number, depth: number): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0).setDepth(depth);
    this.layers.push({ container, factor });
    return container;
  }

  // ------------------------------------------------------------------
  // Procedural textures (sky, hills, glows)
  // ------------------------------------------------------------------

  private canvasTexture(
    key: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ): void {
    if (this.textures.exists(key)) {
      return;
    }
    const tex = this.textures.createCanvas(key, w * TEX_SCALE, h * TEX_SCALE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    ctx.scale(TEX_SCALE, TEX_SCALE);
    draw(ctx, w, h);
    tex.refresh();
  }

  private makeTextures(): void {
    this.canvasTexture(TEX.sky, S + 80, S, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#080e1d");
      g.addColorStop(0.3, "#142146");
      g.addColorStop(0.55, "#283c6c");
      g.addColorStop(0.68, "#4a5689");
      g.addColorStop(0.76, "#7a6e9c");
      g.addColorStop(0.86, "#3a4a72");
      g.addColorStop(1, "#1a2440");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Moon-side wash.
      const wash = ctx.createRadialGradient(w * 0.76, h * 0.2, 10, w * 0.76, h * 0.2, w * 0.6);
      wash.addColorStop(0, "rgba(188,212,255,0.22)");
      wash.addColorStop(1, "rgba(188,212,255,0)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
    });

    this.canvasTexture(TEX.glow, 128, 128, (ctx, w) => {
      const r = w / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.55)");
      g.addColorStop(0.6, "rgba(255,255,255,0.12)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
    });

    this.canvasTexture(TEX.star, 12, 12, (ctx, w) => {
      const r = w / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(232,238,252,0.7)");
      g.addColorStop(1, "rgba(232,238,252,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, w);
    });

    this.canvasTexture(TEX.moon, 96, 96, (ctx, w) => {
      const r = w / 2 - 2;
      const g = ctx.createRadialGradient(w * 0.42, w * 0.4, 4, w / 2, w / 2, r);
      g.addColorStop(0, "#fbf8ee");
      g.addColorStop(0.7, "#e8eefc");
      g.addColorStop(1, "#c6d3f0");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,178,220,0.16)";
      for (const [x, y, cr] of [
        [0.36, 0.42, 0.08],
        [0.62, 0.32, 0.05],
        [0.6, 0.64, 0.09],
        [0.36, 0.7, 0.04],
        [0.72, 0.5, 0.035],
      ] as const) {
        ctx.beginPath();
        ctx.arc(w * x, w * y, w * cr, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    const ridge = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      points: Array<[number, number]>,
      fill: string | CanvasGradient,
      rim: string,
    ): void => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const [px, py] = points[i - 1];
        const [x, y] = points[i];
        const mx = (px + x) / 2;
        ctx.bezierCurveTo(mx, py, mx, y, x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      // Moonlit rim along the crest only.
      ctx.beginPath();
      ctx.moveTo(0, points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const [px, py] = points[i - 1];
        const [x, y] = points[i];
        const mx = (px + x) / 2;
        ctx.bezierCurveTo(mx, py, mx, y, x, y);
      }
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const W2 = S + 80;
    this.canvasTexture(TEX.far, W2, 260, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#3b4c7c");
      g.addColorStop(1, "#24335a");
      ridge(ctx, w, h, [[0, 70], [110, 30], [220, 78], [330, 48], [450, 92], [560, 36], [w, 74]], g, "rgba(188,212,255,0.35)");
    });
    this.canvasTexture(TEX.mid, W2, 220, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2c3f68");
      g.addColorStop(1, "#18233f");
      ridge(ctx, w, h, [[0, 40], [140, 86], [260, 60], [420, 70], [560, 44], [w, 90]], g, "rgba(188,212,255,0.3)");
    });
    this.canvasTexture(TEX.near, W2, 200, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#26395c");
      g.addColorStop(0.35, "#18243f");
      g.addColorStop(1, "#0d1424");
      ridge(ctx, w, h, NEAR_CREST, g, "rgba(188,212,255,0.45)");
    });

    this.canvasTexture(TEX.beam, 64, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      const side = ctx.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, "rgba(0,0,0,1)");
      side.addColorStop(0.5, "rgba(0,0,0,0)");
      side.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, w, h);
    });

    this.canvasTexture(TEX.vignette, S, S, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.5, w / 2, h * 0.5, w * 0.82);
      g.addColorStop(0, "rgba(13,20,36,0)");
      g.addColorStop(1, "rgba(13,20,36,0.6)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Feather the hard canvas edge into the page background.
      const edge = 26;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 0, edge, 0, 0, 0, edge, h],
        [w, 0, w - edge, 0, w - edge, 0, edge, h],
        [0, 0, 0, edge, 0, 0, w, edge],
        [0, h, 0, h - edge, 0, h - edge, w, edge],
      ] as const) {
        const e = ctx.createLinearGradient(x0, y0, x1, y1);
        e.addColorStop(0, "rgba(13,20,36,1)");
        e.addColorStop(1, "rgba(13,20,36,0)");
        ctx.fillStyle = e;
        ctx.fillRect(rx, ry, rw, rh);
      }
    });
  }

  // ------------------------------------------------------------------
  // Diorama layers
  // ------------------------------------------------------------------

  private buildSky(): void {
    const sky = this.layer(0.05, 0);
    sky.add(this.add.image(S / 2, S / 2, TEX.sky).setScale(1 / TEX_SCALE));

    const stars = this.layer(0.1, 1);
    const rng = new Phaser.Math.RandomDataGenerator(["ivyward-title"]);
    for (let i = 0; i < 120; i++) {
      const x = rng.between(-30, S + 30);
      const y = Math.pow(rng.frac(), 1.6) * 360;
      const big = rng.frac() < 0.12;
      const star = this.add
        .image(x, y, TEX.star)
        .setScale((big ? 0.55 : 0.22 + rng.frac() * 0.2) / TEX_SCALE * 2)
        .setAlpha(0.35 + rng.frac() * 0.55)
        .setBlendMode(Phaser.BlendModes.ADD);
      stars.add(star);
      if (this.motion && rng.frac() < 0.45) {
        this.tweens.add({
          targets: star,
          alpha: 0.12,
          duration: rng.between(900, 2600),
          delay: rng.between(0, 3000),
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
      }
    }

    const moon = this.layer(0.16, 2);
    const mx = 528;
    const my = 92;
    const halo = this.add
      .image(mx, my, TEX.glow)
      .setScale(2.4)
      .setTint(0xbcd4ff)
      .setAlpha(0.26)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo2 = this.add
      .image(mx, my, TEX.glow)
      .setScale(0.95)
      .setTint(0xe8eefc)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    const disc = this.add.image(mx, my, TEX.moon).setScale(0.62);
    moon.add([halo, halo2, disc]);
    if (this.motion) {
      this.tweens.add({ targets: halo, alpha: 0.34, scale: 2.6, duration: 4200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  private buildFarHills(): void {
    const far = this.layer(0.28, 3);
    far.add(this.add.image(S / 2, 470, TEX.far).setScale(1 / TEX_SCALE));

    // Drifting mist between the ridges.
    const mist = this.layer(0.36, 4);
    const rng = new Phaser.Math.RandomDataGenerator(["ivyward-mist"]);
    for (let i = 0; i < 5; i++) {
      const blob = this.add
        .image(rng.between(0, S), 430 + rng.between(-12, 22), TEX.glow)
        .setScale(rng.realInRange(4.5, 7), rng.realInRange(0.45, 0.7))
        .setAlpha(rng.realInRange(0.06, 0.11))
        .setTint(0xcfdcff);
      mist.add(blob);
      if (this.motion) {
        this.tweens.add({
          targets: blob,
          x: blob.x + rng.between(60, 110) * (i % 2 ? 1 : -1),
          duration: rng.between(14000, 22000),
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
      }
    }

    const mid = this.layer(0.42, 5);
    mid.add(this.add.image(S / 2, 520, TEX.mid).setScale(1 / TEX_SCALE));
  }

  private buildShrine(): void {
    const shrine = this.layer(0.55, 6);
    const scale = 0.46;
    const hill = this.add
      .image(S / 2, 612, TITLE_ART.hill)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setTint(0x8fa2d8, 0x8fa2d8, 0x6d80b8, 0x6d80b8);
    // Crescent sits at (630, 195) in the 1280x760 render.
    const cx = S / 2 + (630 - 640) * scale;
    const cy = hill.y - 760 * scale + 195 * scale;
    const beam = this.add
      .image(cx, cy + 10, TEX.beam)
      .setOrigin(0.5, 1)
      .setScale(0.7, 0.42)
      .setTint(0xcfe0ff)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.ADD);
    const glow = this.add
      .image(cx, cy, TEX.glow)
      .setScale(1.15)
      .setTint(0xbcd4ff)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add
      .image(cx, cy, TEX.glow)
      .setScale(0.42)
      .setTint(0xffffff)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    const pool = this.add
      .image(cx, cy + 70, TEX.glow)
      .setScale(3.2, 0.9)
      .setTint(0xbcd4ff)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.ADD);
    shrine.add([beam, hill, pool, glow, core]);
    if (this.motion) {
      this.tweens.add({ targets: [glow], alpha: 0.32, scale: 0.95, duration: 2400, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      this.tweens.add({ targets: beam, alpha: 0.12, duration: 3100, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      const motes = this.add.particles(cx, cy + 30, TEX.star, {
        x: { min: -26, max: 26 },
        speedY: { min: -26, max: -12 },
        speedX: { min: -4, max: 4 },
        lifespan: { min: 2600, max: 4200 },
        scale: { min: 0.3, max: 0.7 },
        alpha: { values: [0, 0.9, 0], interpolation: "linear" },
        tint: 0xe8eefc,
        frequency: 260,
        blendMode: Phaser.BlendModes.ADD,
      });
      shrine.add(motes);
    }
  }

  private buildNearHills(): void {
    const near = this.layer(1, 8);
    near.add(this.add.image(S / 2, 640 - 100 + 10, TEX.near).setScale(1 / TEX_SCALE));
    // A scatter of moon-pale flowers on the foreground slope.
    const rng = new Phaser.Math.RandomDataGenerator(["ivyward-flowers"]);
    for (let i = 0; i < 16; i++) {
      const x = rng.between(-30, S + 30);
      const crest = 460 + crestAt(x + 40);
      const flower = this.add
        .image(x, crest + rng.between(10, 70), TEX.star)
        .setScale(rng.realInRange(0.35, 0.6))
        .setTint(rng.pick([0xf3ead3, 0xc9b2e6, 0xf2c75c]))
        .setAlpha(rng.realInRange(0.45, 0.8));
      near.add(flower);
    }
  }

  private buildCompanions(): void {
    const pals = this.layer(1, 9);
    // Mossling on the left hump, Ember Wisp hovering on the right.
    const mossY = 588;
    const moss = this.add
      .image(124, mossY, TITLE_ART.mossling)
      .setOrigin(0.5, 0.9)
      .setScale(0.3)
      .setTint(0xb3c1ee, 0xb3c1ee, 0x8b9bd0, 0x8b9bd0);
    const wispGlow = this.add
      .image(530, 520, TEX.glow)
      .setScale(2.1)
      .setTint(0xffa040)
      .setAlpha(0.42)
      .setBlendMode(Phaser.BlendModes.ADD);
    const wisp = this.add.image(530, 556, TITLE_ART.wisp).setOrigin(0.5, 0.88).setScale(0.28);
    const wispShadow = this.add.image(530, 566, TEX.glow).setScale(0.9, 0.22).setTint(0x000000).setAlpha(0.35);
    pals.add([wispShadow, moss, wispGlow, wisp]);

    if (!this.motion) {
      return;
    }
    // Breathing: squash/stretch from the feet.
    this.tweens.add({
      targets: moss,
      scaleY: 0.312,
      scaleX: 0.294,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    // An occasional happy hop.
    this.time.addEvent({
      delay: 5200,
      loop: true,
      callback: () => {
        this.tweens.add({
          targets: moss,
          y: mossY - 14,
          duration: 200,
          yoyo: true,
          ease: "Quad.Out",
        });
      },
    });
    this.tweens.add({
      targets: [wisp],
      y: wisp.y - 9,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.tweens.add({
      targets: wispGlow,
      y: wispGlow.y - 9,
      alpha: 0.3,
      scale: 1.9,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.tweens.add({ targets: wispShadow, scaleX: 0.7, alpha: 0.22, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    const sparks = this.add.particles(530, 500, TEX.star, {
      x: { min: -12, max: 12 },
      speedY: { min: -34, max: -16 },
      speedX: { min: -6, max: 6 },
      lifespan: { min: 700, max: 1300 },
      scale: { start: 0.6, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffd77a, 0xf08a3c],
      frequency: 140,
      blendMode: Phaser.BlendModes.ADD,
    });
    pals.add(sparks);
    this.tweens.add({ targets: sparks, y: 491, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
  }

  private buildFireflies(): void {
    const flies = this.layer(0.85, 10);
    this.fireflies = this.add.particles(0, 0, TEX.star, {
      x: { min: 0, max: S },
      y: { min: 380, max: 620 },
      speedX: { min: -10, max: 10 },
      speedY: { min: -12, max: 4 },
      lifespan: { min: 3200, max: 6400 },
      scale: { min: 0.35, max: 0.75 },
      alpha: { values: [0, 1, 0.4, 1, 0], interpolation: "catmull" },
      tint: [0xe4f59a, 0xf2e37a, 0xc9f0a0],
      frequency: 170,
      maxAliveParticles: 42,
      blendMode: Phaser.BlendModes.ADD,
    });
    flies.add(this.fireflies);
    this.applyEffects(effectsEnabled());
  }

  private applyEffects(on: boolean): void {
    if (!this.fireflies) {
      return;
    }
    const lively = on && this.motion;
    this.fireflies.frequency = lively ? 170 : 900;
    this.fireflies.setVisible(on);
  }

  // ------------------------------------------------------------------
  // Logo + prompt
  // ------------------------------------------------------------------

  private async buildLogo(): Promise<void> {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('700 96px "Fraunces"'),
          document.fonts.load('600 14px "Source Sans 3"'),
        ]),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Fallback serif is fine.
    }
    if (!this.scene.isActive()) {
      return;
    }
    const word = "Ivyward";
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Fraunces", Georgia, serif',
      fontSize: "100px",
      fontStyle: "700",
      color: "#f3ead3",
    };
    // Measure prefixes so per-letter placement keeps the font's kerning.
    const probe = this.add.text(0, 0, word, style).setVisible(false);
    const total = probe.width;
    const prefixWidths: number[] = [];
    for (let i = 0; i <= word.length; i++) {
      probe.setText(word.slice(0, i) || " ");
      prefixWidths.push(i === 0 ? 0 : probe.width);
    }
    probe.destroy();

    const baseY = 200;
    const left = S / 2 - total / 2;
    const glow = this.add
      .image(S / 2, baseY - 4, TEX.glow)
      .setScale(5.2, 1.6)
      .setTint(0x8fb0ff)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(60);
    this.logoParts.push(glow);
    const letters: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < word.length; i++) {
      const letter = this.add
        .text(left + prefixWidths[i], baseY + 18, word[i], style)
        .setOrigin(0, 0.5)
        .setAlpha(0)
        .setShadow(0, 3, "#0d1424", 10, false, true)
        .setDepth(61);
      letters.push(letter);
      this.logoParts.push(letter);
    }
    const rule = this.add.graphics().setDepth(61).setAlpha(0);
    const ry = baseY + 62;
    rule.lineStyle(1.5, 0xf2c75c, 0.85);
    rule.lineBetween(S / 2 - 120, ry, S / 2 - 16, ry);
    rule.lineBetween(S / 2 + 16, ry, S / 2 + 120, ry);
    // Small crescent between the rules.
    rule.fillStyle(0xf2c75c, 1);
    rule.fillCircle(S / 2, ry, 7);
    rule.fillStyle(0x1a2440, 1);
    rule.fillCircle(S / 2 + 3.5, ry - 2, 6);
    this.logoParts.push(rule);
    const sub = this.add
      .text(S / 2, ry + 24, "A FOLKLORE RPG", {
        fontFamily: '"Source Sans 3", system-ui, sans-serif',
        fontSize: "14px",
        fontStyle: "600",
        color: "#bcd4ff",
      })
      .setOrigin(0.5)
      .setLetterSpacing(6)
      .setAlpha(0)
      .setShadow(0, 1, "#0d1424", 6, false, true)
      .setDepth(61);
    this.logoParts.push(sub);

    this.logoFinal.push(() => {
      letters.forEach((l) => l.setAlpha(1).setY(baseY));
      glow.setAlpha(0.28);
      rule.setAlpha(1);
      sub.setAlpha(1);
    });
    const fast = !this.motion || this.started;
    letters.forEach((letter, i) => {
      this.logoTweens.push(
        this.tweens.add({
          targets: letter,
          alpha: 1,
          y: baseY,
          duration: fast ? 1 : 700,
          delay: fast ? 0 : 250 + i * 90,
          ease: "Back.Out",
        }),
      );
    });
    this.logoTweens.push(
      this.tweens.add({ targets: glow, alpha: 0.28, duration: fast ? 1 : 1400, delay: fast ? 0 : 500, ease: "Sine.Out" }),
      this.tweens.add({ targets: [rule, sub], alpha: 1, duration: fast ? 1 : 700, delay: fast ? 0 : 1100, ease: "Sine.Out" }),
    );
    if (this.motion) {
      this.tweens.add({ targets: glow, alpha: 0.16, duration: 3000, delay: 2000, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
  }

  /** Any key during the reveal skips straight to the finished logo. */
  private finishLogo(): void {
    for (const tween of this.logoTweens) {
      tween.stop();
    }
    this.logoTweens = [];
    for (const apply of this.logoFinal) {
      apply();
    }
  }

  private buildPrompt(): void {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.prompt = this.add
      .text(S / 2, 512, coarse ? "Tap to begin" : "Press any key", {
        fontFamily: '"Source Sans 3", system-ui, sans-serif',
        fontSize: "17px",
        fontStyle: "700",
        color: "#f3ead3",
      })
      .setOrigin(0.5)
      .setLetterSpacing(2)
      .setShadow(0, 1, "#0d1424", 8, false, true)
      .setDepth(61)
      .setAlpha(0);
    this.tweens.add({
      targets: this.prompt,
      alpha: { from: 0, to: 1 },
      duration: 600,
      delay: this.motion ? 1300 : 0,
      onComplete: () => {
        if (this.prompt && !this.started && this.motion) {
          this.tweens.add({ targets: this.prompt, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });
        }
      },
    });
  }

  // ------------------------------------------------------------------
  // Input + menu
  // ------------------------------------------------------------------

  private mountMenu(): void {
    const host = document.getElementById("game");
    if (!host) {
      return;
    }
    const { hasSave } = getBootContext();
    const name = getPlayerName();
    this.menu = new TitleMenu(host, {
      hasSave,
      continueDetail: hasSave && name ? name : undefined,
      onContinue: () => this.leave(false),
      onNewGame: (wipe) => {
        if (wipe) {
          this.wipeAndRestart();
          return;
        }
        this.leave(true);
      },
      settings: {
        effects: effectsEnabled,
        setEffects: (on) => {
          setEffectsEnabled(on);
          this.applyEffects(on);
        },
        muted: isAudioMuted,
        setMuted: (m) => setAudioMuted(m, this),
        volume: getAudioVolume,
        setVolume: (v) => setAudioVolume(v, this),
      },
    });
  }

  /** First input anywhere: unlock audio (autoplay policy), start music, open menu. */
  private begin(): void {
    if (this.started || this.leaving) {
      return;
    }
    this.started = true;
    setAudioScreen("title", this);
    unlockAudioFromGesture(this);
    this.finishLogo();
    if (this.prompt) {
      this.tweens.killTweensOf(this.prompt);
      this.tweens.add({ targets: this.prompt, alpha: 0, duration: 200, onComplete: () => this.prompt?.destroy() });
    }
    this.menu?.show();
  }

  private onPointerDown = (): void => {
    this.begin();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.leaving || event.repeat) {
      return;
    }
    if (!this.started) {
      // Modifier-only presses (e.g. Cmd+Tab) should not count as "any key".
      if (["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      this.begin();
      return;
    }
    // Focus drifted off the menu (clicked the canvas): route nav back in.
    const menuRoot = this.menu?.root;
    if (menuRoot && !menuRoot.contains(document.activeElement)) {
      const nav = navFromKey(event.key);
      if (nav) {
        event.preventDefault();
        this.menu?.nav(nav);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.menu?.nav("activate");
      }
    }
  };

  /** Standard-mapping gamepads: d-pad / left stick, A = activate, B = back. */
  private pollGamepads(): void {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set<string>();
    for (const pad of pads) {
      if (!pad) {
        continue;
      }
      const btn = (i: number): boolean => Boolean(pad.buttons[i]?.pressed);
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (btn(12) || ay < -0.6) now.add("up");
      if (btn(13) || ay > 0.6) now.add("down");
      if (btn(14) || ax < -0.6) now.add("left");
      if (btn(15) || ax > 0.6) now.add("right");
      if (btn(0) || btn(9)) now.add("activate");
      if (btn(1)) now.add("back");
    }
    for (const input of now) {
      if (this.padHeld.has(input)) {
        continue;
      }
      if (!this.started) {
        this.begin();
      } else if (!this.leaving) {
        this.menu?.nav(input as NavInput);
      }
    }
    this.padHeld = now;
  }

  private leave(newGame: boolean): void {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    // Pressing Enter/clicking here is a gesture too: make sure audio is live.
    unlockAudioFromGesture(this);
    setAudioScreen(undefined, this);
    this.cameras.main.fadeOut(520, 13, 20, 36);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      document.body.classList.remove("title-active");
      this.scene.start("IsometricScene");
      // Continue with a named save is a no-op; New Game asks for the name.
      initNameIntro(newGame ? startOpeningBeat : undefined);
    });
  }

  private wipeAndRestart(): void {
    this.leaving = true;
    clearHostSave();
    const url = new URL(window.location.href);
    url.search = "?new=1";
    url.hash = "";
    window.location.assign(url.toString());
  }

  private teardown(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("resize", this.onResize);
    this.menu?.destroy();
    this.menu = undefined;
    document.body.classList.remove("title-active");
  }
}
