import type { ShrineTab, ShrineTabSpec } from "../shrine/shrineTabs";

/**
 * Moon Shrine panel shell (#402): a DOM dialog laid over the stage so the
 * shrine gets real fonts, wrapping, scrolling and keyboard focus. Navy/cream
 * to match the encounter and victory cards. ShrineScene fills `body`.
 */

export type ShrineButtonTone = "primary" | "secondary" | "ghost";

export function createShrineButton(
  label: string,
  tone: ShrineButtonTone,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `sh-btn sh-btn-${tone}`;
  btn.textContent = label;
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return btn;
}

export type ShrinePanelOptions = {
  /** Defaults to the game stage (`#game`). */
  parent?: HTMLElement;
  onSelectTab: (tab: ShrineTab) => void;
  onRecipes: () => void;
  /** Esc inside the panel, or ×. Return value is ignored. */
  onClose: () => void;
};

export type ShrinePanelHandle = {
  root: HTMLElement;
  body: HTMLElement;
  setSubtitle: (text: string, emphasis?: boolean) => void;
  /**
   * Render the tab row. Tabs in `reveal` are new this call: they pulse, and
   * the first one takes keyboard focus (#402: Fusion appears right after the
   * relic is crafted).
   */
  setTabs: (
    tabs: readonly ShrineTabSpec[],
    active: ShrineTab,
    reveal?: readonly ShrineTab[],
  ) => void;
  setStatus: (message: string) => void;
  focusTab: (tab: ShrineTab) => void;
  setHidden: (hidden: boolean) => void;
  /** Re-measure the "more below" cue after the body content changed. */
  refreshScroll: () => void;
  resetScroll: () => void;
  destroy: () => void;
};

export function mountShrinePanel(options: ShrinePanelOptions): ShrinePanelHandle {
  const parent =
    options.parent ??
    document.getElementById("game") ??
    document.getElementById("app") ??
    document.body;

  const root = document.createElement("div");
  root.id = "shrine-panel-root";
  root.className = "shrine-root";

  const panel = document.createElement("section");
  panel.className = "shrine-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "shrine-title");

  const head = document.createElement("header");
  head.className = "shrine-head";
  const titles = document.createElement("div");
  titles.className = "shrine-titles";
  const title = document.createElement("h2");
  title.id = "shrine-title";
  title.className = "shrine-title";
  title.textContent = "Moon Shrine";
  const subtitle = document.createElement("p");
  subtitle.className = "shrine-sub";
  titles.append(title, subtitle);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "shrine-close";
  close.setAttribute("aria-label", "Leave the shrine (Esc)");
  close.textContent = "×";
  close.addEventListener("click", () => options.onClose());
  head.append(titles, close);

  const tabRow = document.createElement("div");
  tabRow.className = "shrine-tabs";
  tabRow.setAttribute("role", "tablist");
  tabRow.setAttribute("aria-label", "Shrine");

  const wrap = document.createElement("div");
  wrap.className = "shrine-body-wrap";
  const body = document.createElement("div");
  body.className = "shrine-body";
  body.tabIndex = -1;
  const moreCue = document.createElement("div");
  moreCue.className = "shrine-more";
  moreCue.setAttribute("aria-hidden", "true");
  moreCue.textContent = "Scroll for more";
  wrap.append(body, moreCue);

  const status = document.createElement("p");
  status.className = "shrine-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const foot = document.createElement("p");
  foot.className = "shrine-foot";
  foot.textContent = "Esc to leave";

  panel.append(head, tabRow, wrap, status, foot);
  root.append(panel);
  parent.appendChild(root);
  // The quest card and story caption step back while the shrine is open.
  document.body.classList.add("shrine-active");

  // Keep keys inside the panel away from Phaser's window key handlers: they
  // preventDefault captured keys (Space), which would swallow button clicks.
  root.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose();
    }
  });
  root.addEventListener("keyup", (event) => event.stopPropagation());

  // --- tabs -----------------------------------------------------------
  const tabButtons = new Map<ShrineTab, HTMLButtonElement>();
  let recipesBtn: HTMLButtonElement | null = null;

  function tabOrder(): HTMLButtonElement[] {
    return [...tabButtons.values()];
  }

  function onTabKey(event: KeyboardEvent): void {
    const dir =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (dir === 0) {
      return;
    }
    const buttons = tabOrder();
    const i = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const next = buttons[(i + dir + buttons.length) % buttons.length];
    event.preventDefault();
    next?.focus();
    next?.click();
  }

  function setTabs(
    tabs: readonly ShrineTabSpec[],
    active: ShrineTab,
    reveal: readonly ShrineTab[] = [],
  ): void {
    const same =
      recipesBtn !== null &&
      tabs.length === tabButtons.size &&
      tabs.every((t) => tabButtons.has(t.id));
    if (!same) {
      const hadFocus = tabRow.contains(document.activeElement);
      const focusedId = [...tabButtons.entries()].find(
        ([, btn]) => btn === document.activeElement,
      )?.[0];
      tabRow.replaceChildren();
      tabButtons.clear();
      for (const tab of tabs) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shrine-tab";
        btn.id = `shrine-tab-${tab.id}`;
        btn.dataset.shrineTab = tab.id;
        btn.setAttribute("role", "tab");
        btn.textContent = tab.label;
        btn.addEventListener("click", () => {
          btn.classList.remove("is-new");
          options.onSelectTab(tab.id);
        });
        btn.addEventListener("keydown", onTabKey);
        btn.addEventListener("animationend", () =>
          btn.classList.remove("is-new"),
        );
        tabButtons.set(tab.id, btn);
        tabRow.appendChild(btn);
      }
      recipesBtn = createShrineButton("Recipes", "ghost", options.onRecipes);
      recipesBtn.classList.add("shrine-recipes");
      recipesBtn.dataset.shrineRecipes = "1";
      tabRow.appendChild(recipesBtn);
      if (hadFocus && focusedId) {
        tabButtons.get(focusedId)?.focus({ preventScroll: true });
      }
    }
    for (const tab of tabs) {
      const btn = tabButtons.get(tab.id);
      if (!btn) {
        continue;
      }
      const isActive = tab.id === active;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
      btn.textContent = tab.label;
    }
    const revealed = reveal.filter((id) => tabButtons.has(id));
    for (const id of revealed) {
      const btn = tabButtons.get(id)!;
      btn.classList.remove("is-new");
      // Restart the CSS animation.
      void btn.offsetWidth;
      btn.classList.add("is-new");
      btn.tabIndex = 0;
    }
    if (revealed[0]) {
      tabButtons.get(revealed[0])?.focus({ preventScroll: true });
    }
  }

  // --- scroll affordance --------------------------------------------------
  function refreshScroll(): void {
    const max = body.scrollHeight - body.clientHeight;
    wrap.dataset.more = max > 4 && body.scrollTop < max - 4 ? "1" : "0";
    wrap.dataset.less = body.scrollTop > 4 ? "1" : "0";
  }
  body.addEventListener("scroll", refreshScroll, { passive: true });
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => refreshScroll())
      : null;
  resizeObserver?.observe(body);
  const mutationObserver =
    typeof MutationObserver === "function"
      ? new MutationObserver(() => refreshScroll())
      : null;
  mutationObserver?.observe(body, { childList: true, subtree: true });

  return {
    root,
    body,
    setSubtitle: (text, emphasis = false) => {
      subtitle.textContent = text;
      subtitle.classList.toggle("is-notice", emphasis);
    },
    setTabs,
    setStatus: (message) => {
      status.textContent = message;
      status.classList.remove("is-flash");
      if (message) {
        void status.offsetWidth;
        status.classList.add("is-flash");
      }
    },
    focusTab: (tab) => tabButtons.get(tab)?.focus({ preventScroll: true }),
    setHidden: (hidden) => {
      root.hidden = hidden;
    },
    refreshScroll,
    resetScroll: () => {
      body.scrollTop = 0;
      refreshScroll();
    },
    destroy: () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      document.body.classList.remove("shrine-active");
      root.remove();
    },
  };
}
