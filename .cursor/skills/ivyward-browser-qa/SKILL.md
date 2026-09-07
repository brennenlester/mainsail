---
name: ivyward-browser-qa
description: >-
  Browser and DevTools QA for Ivyward HUD and canvas. Use when verifying visual
  QA, HUD, screenshots, canvas, layout, or a playtest in the browser.
---

# Ivyward browser QA

The HUD is HTML. Phaser draws to a canvas that is absent from the accessibility tree. Prove pixels in a browser; do not infer look from scene code.

## Interactive (default)

Cursor browser MCP + Chrome DevTools (CDP):

1. `npm run dev` if needed (`http://localhost:5173`).
2. Navigate. Use `?new=1` for a cold host, `?encounter=<id>` / `?spar=<id>` only on the Vite dev server.
3. `browser_snapshot` for HUD (name intro, status panel, Inventory, Party, Recipes, Codex).
4. `browser_take_screenshot` for the playfield/canvas.
5. Application → Local Storage for host save keys. Performance/Memory for texture leaks after atlas changes.

Unlock the tab when the pass is done.

## CI / regression

`npm run test:e2e` (Playwright Chromium). Covers boot name-intro, status panel, and Inventory/Party. Install browsers once with `npm run test:e2e:install`.

Write a new spec only for DOM chrome or boot. Combat and overworld walking stay unit tests plus an interactive screenshot pass.

## DevTools

| Question | Where |
| --- | --- |
| Did the HUD actually open? | Snapshot `#inventory-overlay` / `#party-overlay` / `#name-intro` |
| Does the sprite show? | Screenshot `#game` canvas |
| Is the save wrong? | Application → Local Storage |
| Is the atlas huge? | Network + Memory after `pack:atlas` |
