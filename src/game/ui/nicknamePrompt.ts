import { getCreatureDefinition } from "../creatures/catalog";
import type { CreatureInstance } from "../creatures/types";
import {
  NICKNAME_MAX_LENGTH,
  setNickname,
} from "../companions/companionState";
import { getPersonality } from "../companions/personality";
import { popOverlay, pushOverlay } from "./overlayStack";

/**
 * Skippable "name your new friend" prompt (#367). Reuses
 * `CreatureInstance.nickname`. Resolves once the player names or skips.
 */
let open = false;
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

export function promptNickname(creature: CreatureInstance): Promise<void> {
  const root = ensureRoot();
  const form = root.querySelector("form") as HTMLFormElement;
  const title = root.querySelector("#nickname-title") as HTMLElement;
  const body = root.querySelector("#nickname-body") as HTMLElement;
  const input = root.querySelector("#nickname-input") as HTMLInputElement;
  const error = root.querySelector("#nickname-error") as HTMLElement;
  const skip = root.querySelector("#nickname-skip") as HTMLButtonElement;
  const def = getCreatureDefinition(creature.definitionId);
  const trait = creature.personality ? getPersonality(creature.personality) : undefined;

  // textContent only: names are player input.
  title.textContent = `${def.name} joined you!`;
  body.textContent = trait
    ? `Seems ${trait.label.toLowerCase()} — ${trait.blurb.charAt(0).toLowerCase()}${trait.blurb.slice(1)} Give it a nickname?`
    : "Give it a nickname?";
  input.value = "";
  input.placeholder = def.name;
  error.textContent = "";

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise((resolve) => {
    const finish = (): void => {
      form.removeEventListener("submit", onSubmit);
      skip.removeEventListener("click", finish);
      popOverlay("nickname");
      root.hidden = true;
      open = false;
      keyboardHandler?.(true);
      previouslyFocused?.focus();
      resolve();
    };
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
    pushOverlay("nickname", finish);
    root.hidden = false;
    open = true;
    keyboardHandler?.(false);
    window.requestAnimationFrame(() => input.focus());
  });
}
