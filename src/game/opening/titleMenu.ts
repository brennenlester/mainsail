import "./opening.css";

/**
 * Title menu (#363 / #350): real DOM buttons over the canvas so focus,
 * screen readers, touch and keyboard all work for free. One focus model for
 * every device: keyboard, gamepad (polled by TitleScene) and touch all end
 * up calling `nav()` or clicking the focused button.
 */

export type TitleMenuAction = "continue" | "new-game" | "settings";

export type TitleMenuItem = { id: TitleMenuAction; label: string };

/** Continue first (and default focus) only when a host save exists. */
export function titleMenuItems(hasSave: boolean): TitleMenuItem[] {
  const items: TitleMenuItem[] = [];
  if (hasSave) {
    items.push({ id: "continue", label: "Continue" });
  }
  items.push({ id: "new-game", label: "New Game" });
  items.push({ id: "settings", label: "Settings" });
  return items;
}

export function wrapFocus(index: number, delta: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return (((index + delta) % length) + length) % length;
}

export type NavInput = "up" | "down" | "left" | "right" | "activate" | "back";

export function navFromKey(key: string): NavInput | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    case "Escape":
    case "Backspace":
      return "back";
    default:
      return null;
  }
}

export type TitleMenuOptions = {
  hasSave: boolean;
  /** Shown under Continue (player name), optional. */
  continueDetail?: string;
  onContinue: () => void;
  /** `wipe` is true when an existing save must be erased first (confirmed). */
  onNewGame: (wipe: boolean) => void;
  settings: {
    effects: () => boolean;
    setEffects: (on: boolean) => void;
    muted: () => boolean;
    setMuted: (muted: boolean) => void;
    volume: () => number;
    setVolume: (v: number) => void;
  };
};

type View = "main" | "confirm" | "settings";

const ROOT_ID = "title-menu";

export class TitleMenu {
  readonly root: HTMLElement;
  private view: View = "main";
  private readonly opts: TitleMenuOptions;
  private chosen = false;

  constructor(host: HTMLElement, opts: TitleMenuOptions) {
    this.opts = opts;
    document.getElementById(ROOT_ID)?.remove();
    this.root = document.createElement("nav");
    this.root.id = ROOT_ID;
    this.root.className = "title-menu";
    this.root.setAttribute("aria-label", "Title menu");
    this.root.hidden = true;
    host.appendChild(this.root);
    this.root.addEventListener("keydown", this.onKeyDown);
    this.render("main");
  }

  get currentView(): View {
    return this.view;
  }

  show(): void {
    this.root.hidden = false;
    this.root.classList.add("is-open");
    this.focusDefault();
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  destroy(): void {
    this.root.removeEventListener("keydown", this.onKeyDown);
    this.root.remove();
  }

  /** Device-agnostic navigation (keyboard + gamepad). */
  nav(input: NavInput): void {
    if (!this.isOpen()) {
      return;
    }
    const focusables = this.focusables();
    const active = document.activeElement as HTMLElement | null;
    const index = active ? focusables.indexOf(active) : -1;
    if (input === "up" || input === "down") {
      const next =
        index < 0 ? 0 : wrapFocus(index, input === "up" ? -1 : 1, focusables.length);
      focusables[next]?.focus();
      return;
    }
    if (input === "left" || input === "right") {
      if (active instanceof HTMLInputElement && active.type === "range") {
        const step = Number(active.step) || 5;
        active.value = String(Number(active.value) + (input === "left" ? -step : step));
        active.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (input === "back") {
      if (this.view !== "main") {
        this.render("main");
        this.focusDefault();
      }
      return;
    }
    if (input === "activate") {
      if (active && this.root.contains(active) && active instanceof HTMLButtonElement) {
        active.click();
      } else {
        this.focusDefault();
      }
    }
  }

  focusDefault(): void {
    this.focusables()[0]?.focus();
  }

  private focusables(): HTMLElement[] {
    return Array.from(
      this.root.querySelectorAll<HTMLElement>("button:not([disabled]), input"),
    );
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const input = navFromKey(event.key);
    if (!input) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const onSlider = target instanceof HTMLInputElement && target.type === "range";
    // Sliders keep native left/right; everything else is ours.
    if (onSlider && (input === "left" || input === "right")) {
      return;
    }
    event.preventDefault();
    this.nav(input);
  };

  private button(
    label: string,
    onClick: () => void,
    opts: { detail?: string; tone?: "primary" | "danger"; id?: string } = {},
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "title-menu__btn";
    if (opts.tone) {
      btn.classList.add(`title-menu__btn--${opts.tone}`);
    }
    if (opts.id) {
      btn.id = opts.id;
    }
    const main = document.createElement("span");
    main.className = "title-menu__label";
    main.textContent = label;
    btn.appendChild(main);
    if (opts.detail) {
      const sub = document.createElement("span");
      sub.className = "title-menu__detail";
      sub.textContent = opts.detail;
      btn.appendChild(sub);
    }
    btn.addEventListener("click", onClick);
    // Hover moves focus so mouse + keyboard never show two highlights.
    btn.addEventListener("pointerenter", () => btn.focus({ preventScroll: true }));
    return btn;
  }

  private render(view: View): void {
    this.view = view;
    this.root.replaceChildren();
    this.root.dataset.view = view;
    if (view === "main") {
      for (const item of titleMenuItems(this.opts.hasSave)) {
        if (item.id === "continue") {
          this.root.appendChild(
            this.button(item.label, () => this.choose(() => this.opts.onContinue()), {
              detail: this.opts.continueDetail,
              tone: "primary",
              id: "title-continue",
            }),
          );
        } else if (item.id === "new-game") {
          this.root.appendChild(
            this.button(
              item.label,
              () => {
                if (this.opts.hasSave) {
                  this.render("confirm");
                  this.focusDefault();
                  return;
                }
                this.choose(() => this.opts.onNewGame(false));
              },
              { tone: this.opts.hasSave ? undefined : "primary", id: "title-new-game" },
            ),
          );
        } else {
          this.root.appendChild(
            this.button(
              item.label,
              () => {
                this.render("settings");
                this.focusDefault();
              },
              { id: "title-settings" },
            ),
          );
        }
      }
      return;
    }
    if (view === "confirm") {
      const heading = document.createElement("p");
      heading.className = "title-menu__prompt";
      heading.id = "title-confirm-text";
      heading.textContent = "Start over? Your saved world will be erased.";
      this.root.appendChild(heading);
      this.root.appendChild(
        this.button("Keep my save", () => {
          this.render("main");
          this.focusDefault();
        }, { id: "title-confirm-cancel" }),
      );
      this.root.appendChild(
        this.button("Erase and start new", () => this.choose(() => this.opts.onNewGame(true)), {
          tone: "danger",
          id: "title-confirm-wipe",
        }),
      );
      return;
    }
    this.renderSettings();
  }

  private renderSettings(): void {
    const s = this.opts.settings;
    const effectsLabel = (): string => `Effects: ${s.effects() ? "On" : "Off"}`;
    const soundLabel = (): string => `Sound: ${s.muted() ? "Off" : "On"}`;
    const effects = this.button(effectsLabel(), () => {
      s.setEffects(!s.effects());
      effects.querySelector(".title-menu__label")!.textContent = effectsLabel();
      effects.setAttribute("aria-pressed", s.effects() ? "true" : "false");
    }, { id: "title-effects" });
    effects.setAttribute("aria-pressed", s.effects() ? "true" : "false");
    const sound = this.button(soundLabel(), () => {
      s.setMuted(!s.muted());
      sound.querySelector(".title-menu__label")!.textContent = soundLabel();
      sound.setAttribute("aria-pressed", s.muted() ? "false" : "true");
    }, { id: "title-sound" });
    sound.setAttribute("aria-pressed", s.muted() ? "false" : "true");

    const volumeRow = document.createElement("label");
    volumeRow.className = "title-menu__slider";
    const volumeText = document.createElement("span");
    volumeText.textContent = "Volume";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = "title-volume";
    slider.min = "0";
    slider.max = "100";
    slider.step = "5";
    slider.value = String(Math.round(s.volume() * 100));
    slider.addEventListener("input", () => s.setVolume(Number(slider.value) / 100));
    volumeRow.append(volumeText, slider);

    const back = this.button("Back", () => {
      this.render("main");
      this.focusDefault();
    }, { id: "title-settings-back" });
    this.root.append(effects, sound, volumeRow, back);
  }

  /** One choice per title visit (double-taps must not start two games). */
  private choose(run: () => void): void {
    if (this.chosen) {
      return;
    }
    this.chosen = true;
    this.root.classList.add("is-leaving");
    run();
  }
}
