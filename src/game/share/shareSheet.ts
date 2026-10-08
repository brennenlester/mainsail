import type Phaser from "phaser";
import "./share.css";
import { popOverlay, pushOverlay } from "../ui/overlayStack";
import {
  isTouchControlsEnabled,
  setTouchControlsEnabled,
} from "../ui/touchControls";

/**
 * Minimal DOM builder for the share / preview overlays. All dynamic strings
 * go through textContent — share data is untrusted and never touches HTML.
 */

export type SheetButton = {
  label: string;
  variant?: "primary" | "quiet";
  hidden?: boolean;
  onClick: (button: HTMLButtonElement) => void | Promise<void>;
};

export type ShareSheet = {
  root: HTMLElement;
  image: HTMLImageElement;
  status: HTMLElement;
  linkInput: HTMLInputElement;
  buttons: HTMLButtonElement[];
  close: () => void;
  isOpen: () => boolean;
  /** Show a rendered card; dropped (no object URL) if the sheet already closed. */
  showCard: (blob: Blob) => void;
};

export function el<K extends keyof HTMLElementTagNameMap>(
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

export function openShareSheet(options: {
  id: string;
  title: string;
  subtitle?: string;
  note?: string;
  imageAlt: string;
  buttons: SheetButton[];
  /** Esc / backdrop close; omit to make the sheet modal-only (preview). */
  onClose?: () => void;
  /** Running game whose keyboard is muted while the sheet is open. */
  game?: Phaser.Game;
}): ShareSheet {
  document.getElementById(options.id)?.remove();
  const root = el("div", "share-overlay");
  root.id = options.id;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  const sheet = el("div", "share-sheet");
  const title = el("h2", "share-title", options.title);
  title.id = `${options.id}-title`;
  root.setAttribute("aria-labelledby", title.id);
  sheet.append(title);
  if (options.subtitle) {
    sheet.append(el("p", "share-sub", options.subtitle));
  }
  const image = el("img", "share-card-img");
  image.alt = options.imageAlt;
  sheet.append(image);

  const actions = el("div", "share-actions");
  const buttons = options.buttons.map((spec) => {
    const button = el(
      "button",
      `share-btn${spec.variant ? ` share-btn--${spec.variant}` : ""}`,
      spec.label,
    );
    button.type = "button";
    button.hidden = spec.hidden === true;
    button.addEventListener("click", () => {
      void spec.onClick(button);
    });
    actions.append(button);
    return button;
  });
  sheet.append(actions);

  const linkInput = el("input", "share-link-input");
  linkInput.type = "text";
  linkInput.readOnly = true;
  linkInput.hidden = true;
  linkInput.setAttribute("aria-label", "Share link");
  const status = el("p", "share-status");
  status.setAttribute("role", "status");
  sheet.append(linkInput, status);
  if (options.note) {
    sheet.append(el("p", "share-note", options.note));
  }
  root.append(sheet);
  (document.getElementById("app") ?? document.body).append(root);

  const playfield = document.getElementById("playfield");
  playfield?.setAttribute("inert", "");
  // inert does not stop Phaser's window-level key listener: mute it so
  // WASD / E cannot walk or interact behind the sheet.
  const keyboard = options.game?.input?.keyboard ?? null;
  // Held keys would stay isDown (their keyup never arrives while muted).
  const resetSceneKeys = (): void => {
    for (const scene of options.game?.scene.getScenes(true) ?? []) {
      scene.input.keyboard?.resetKeys();
    }
  };
  if (keyboard) {
    keyboard.enabled = false;
    resetSceneKeys();
  }
  // Same for a held touch stick: disabling zeroes the cached axes.
  const touchWasEnabled = isTouchControlsEnabled();
  setTouchControlsEnabled(false);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    popOverlay(options.id);
    playfield?.removeAttribute("inert");
    if (keyboard) {
      keyboard.enabled = true;
      resetSceneKeys();
    }
    if (touchWasEnabled) {
      setTouchControlsEnabled(true);
    }
    if (image.src.startsWith("blob:")) {
      URL.revokeObjectURL(image.src);
    }
    root.remove();
    options.onClose?.();
  };
  if (options.onClose) {
    pushOverlay(options.id, close);
    root.addEventListener("click", (event) => {
      if (event.target === root) close();
    });
  }
  buttons.find((b) => !b.hidden)?.focus();
  const showCard = (blob: Blob): void => {
    if (!closed) {
      image.src = URL.createObjectURL(blob);
    }
  };
  return { root, image, status, linkInput, buttons, close, isOpen: () => !closed, showCard };
}

export function showManualLink(sheet: ShareSheet, url: string): void {
  sheet.linkInput.value = url;
  sheet.linkInput.hidden = false;
  sheet.linkInput.focus();
  sheet.linkInput.select();
}
