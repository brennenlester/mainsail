import { getCreatureDefinition } from "../creatures/catalog";
import type { CreatureInstance } from "../creatures/types";
import {
  NICKNAME_MAX_LENGTH,
  setNickname,
} from "../companions/companionState";
import { getPersonality } from "../companions/personality";
import { isDomKeyboardTarget } from "./canvasFocus";
import { popOverlay, pushOverlay } from "./overlayStack";

/**
 * Skippable "name your new friend" prompt (#367). Reuses
 * `CreatureInstance.nickname`. Resolves once the player names or skips.
 */
let open = false;
let blocking = false;
/** Closes whichever prompt is showing; the form is shared, so only one may be live. */
let pendingFinish: (() => void) | null = null;
let keyboardHandler: ((captured: boolean) => void) | null = null;

/** The overworld lends its keyboard gate so typed letters reach the input. */
export function setNicknameKeyboardHandler(
  handler: ((captured: boolean) => void) | null,
): void {
  keyboardHandler = handler;
}

export function isNicknamePromptOpen(): boolean {
  return open;
}

/** True only for the modal (Party panel) prompt; the ambient one never blocks the world. */
export function isNicknamePromptBlocking(): boolean {
  return open && blocking;
}

/** Open a queued prompt only when nothing else owns the player's attention. */
export function canOpenNicknamePrompt(state: {
  queued: number;
  promptOpen: boolean;
  /** Dialogue, minigame, shrine, or encounter in progress. */
  busy: boolean;
  topOverlay: string | null;
}): boolean {
  return state.queued > 0 && !state.promptOpen && !state.busy && state.topOverlay === null;
}

function ensureRoot(): HTMLElement {
  let root = document.getElementById("nickname-overlay");
  if (root) {
    return root;
  }
  root = document.createElement("div");
  root.id = "nickname-overlay";
  root.className = "nickname-overlay";
  root.hidden = true;
  root.innerHTML = `
    <form class="nickname-panel" role="dialog" aria-labelledby="nickname-title" autocomplete="off">
      <h2 id="nickname-title" class="nickname-title"></h2>
      <p id="nickname-body" class="nickname-body"></p>
      <label class="visually-hidden" for="nickname-input">Nickname</label>
      <input id="nickname-input" class="nickname-input" type="text" maxlength="${NICKNAME_MAX_LENGTH}" />
      <p id="nickname-hint" class="nickname-hint" hidden>Tap or press N to name your companion (Esc to skip)</p>
      <p id="nickname-error" class="nickname-error" role="alert"></p>
      <div class="nickname-actions">
        <button type="submit" class="nickname-btn nickname-btn-primary">Name</button>
        <button type="button" id="nickname-skip" class="nickname-btn">Skip</button>
      </div>
    </form>
  `;
  document.getElementById("app")?.appendChild(root);
  return root;
}

/** Close the docked (ambient) prompt, e.g. when a battle, dialogue or shrine takes over. */
export function dismissAmbientNicknamePrompt(): void {
  if (open && !blocking) {
    pendingFinish?.();
  }
}

export type NicknamePromptOptions = {
  /**
   * Ambient prompts (a companion just joined) are non-blocking: no backdrop,
   * no auto-focus, movement keys keep walking until the player clicks the
   * input or presses N (the hint line says so). Explicit prompts (Party panel "Rename") focus the input.
   */
  ambient?: boolean;
};

export function promptNickname(
  creature: CreatureInstance,
  options: NicknamePromptOptions = {},
): Promise<void> {
  const ambient = options.ambient === true;
  // One shared form: finish any prompt still up so its handlers cannot rename this creature.
  pendingFinish?.();
  const root = ensureRoot();
  const form = root.querySelector("form") as HTMLFormElement;
  const title = root.querySelector("#nickname-title") as HTMLElement;
  const body = root.querySelector("#nickname-body") as HTMLElement;
  const input = root.querySelector("#nickname-input") as HTMLInputElement;
  const error = root.querySelector("#nickname-error") as HTMLElement;
  const hint = root.querySelector("#nickname-hint") as HTMLElement;
  const skip = root.querySelector("#nickname-skip") as HTMLButtonElement;
  const def = getCreatureDefinition(creature.definitionId);
  const trait = creature.personality ? getPersonality(creature.personality) : undefined;

  // textContent only: names are player input.
  title.textContent = `${def.name} joined you!`;
  body.textContent = trait
    ? `Seems ${trait.label.toLowerCase()} — ${trait.blurb.charAt(0).toLowerCase()}${trait.blurb.slice(1)} Give it a nickname?`
    : "Give it a nickname?";
  root.classList.toggle("nickname-overlay--ambient", ambient);
  hint.hidden = !ambient;
  input.value = "";
  input.placeholder = def.name;
  error.textContent = "";

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) {
        return;
      }
      done = true;
      if (pendingFinish === finish) {
        pendingFinish = null;
      }
      window.removeEventListener("keydown", onKeyDown);
      form.removeEventListener("submit", onSubmit);
      skip.removeEventListener("click", finish);
      hint.removeEventListener("click", focusInput);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      popOverlay("nickname");
      root.hidden = true;
      open = false;
      blocking = false;
      keyboardHandler?.(true);
      if (!ambient) {
        previouslyFocused?.focus();
      }
      resolve();
    };
    // Typing in the box must not walk the player; leaving it hands keys back.
    const onFocus = (): void => keyboardHandler?.(false);
    const onBlur = (): void => keyboardHandler?.(true);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (
        ambient &&
        (event.key === "n" || event.key === "N") &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isDomKeyboardTarget(document.activeElement)
      ) {
        // Typing is opt-in: N (or a tap) hands the keyboard to the box (#429).
        event.preventDefault();
        input.focus();
      }
    };
    const focusInput = (): void => input.focus();
    const onSubmit = (event: Event): void => {
      event.preventDefault();
      if (!input.value.trim()) {
        finish();
        return;
      }
      if (!setNickname(creature, input.value)) {
        error.textContent = `1–${NICKNAME_MAX_LENGTH} characters.`;
        input.focus();
        return;
      }
      finish();
    };
    form.addEventListener("submit", onSubmit);
    skip.addEventListener("click", finish);
    pendingFinish = finish;
    open = true;
    blocking = !ambient;
    root.hidden = false;
    if (ambient) {
      input.addEventListener("focus", onFocus);
      input.addEventListener("blur", onBlur);
      hint.addEventListener("click", focusInput);
      // N focuses the box; Esc dismisses the docked prompt whether or not the input has focus.
      window.addEventListener("keydown", onKeyDown);
      return;
    }
    pushOverlay("nickname", finish);
    keyboardHandler?.(false);
    window.requestAnimationFrame(() => input.focus());
  });
}
