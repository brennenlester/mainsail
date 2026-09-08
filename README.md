# Ivyward

A folklore RPG where you spar with your odd little party, craft at the Moon Shrine to help them grow, and wander a soft world between sharper fights.

Invites, village minigames, sailing depth, and Sovereign fusion stay in the build but are not the product promise (see `CONTEXT.md`).

**Play:** [mainsail-brennen1.vercel.app](https://mainsail-brennen1.vercel.app) (tracks latest production). If it ever looks stale, use [mainsail-git-main-brennen1.vercel.app](https://mainsail-git-main-brennen1.vercel.app) or [poke-wine-kappa.vercel.app](https://poke-wine-kappa.vercel.app).

---

## How to play

### First boot

On a fresh save (or after Reset / `?new=1`), enter a display name (1–16 characters). That name appears in black letters above your avatar in the overworld and above your token in **Hearth Lots**. Host saves keep the name; invite visitors pick a name for that visit only.

### Controls

| Input | Action |
| --- | --- |
| **Arrow keys** or **WASD** | Move (hold to keep walking) |
| **E** | Interact — open Moon Shrine, enter a cottage door, talk to a villager, play a cottage minigame on the house prop, or moor / board / disembark a boat |
| **I** | Shortcut: copy a friend invite link (host only) |
| **Copy invite link** (status panel) | Copy a friend invite link (host only; works on touch) |
| **Party** (status panel) | Manage the active party (max 7) and scroll/swap reserve creatures |
| **Inventory** (status panel) | Browse materials and items. After you craft a Portable Moonshrine, Inventory also has the 4×4 craft grid and **Use** on tonic / draught / crystal |
| **Recipes** (status panel, Inventory, or Moon Shrine) | See every shaped crafting pattern |
| **Codex** (status panel) | Open the habitat codex — what lives where (fills in as you encounter creatures) |
| **Reset game** (status panel) | Wipe local host save and start fresh |

### Confined region

Start in **Whisper Grove**, then walk map exits through **Moon Shrine** to **Hearth Crossing**. North of the village are **Folklore Fields** (north gate into **Moonwake Harbor**, east into **Mistwood Reach** / **Emberfen Hollow**), locked until Story quest 2 is complete. From Harbor, sail east past East Landing into the open **Archipelago** sea — a **100×100** open ocean with a 2D grid of multi-biome 9×9 islands (lush, barren, and mixed) and docks you can hop between.

### Story quests

The HUD shows `Story N/18: …` and a short “Next” hint. Steps 3–14 also show a short villager line. Host progress saves automatically.

1. **Befriend a wild creature** — walk until an encounter appears, then choose **Befriend**.
2. **Win a training spar** — choose **Spar** and win. This **opens the overworld gate**.
3. **Reach Hearth Crossing** — follow the path Grove → Shrine → Village plaza.
4. **Craft a relic at Moon Shrine** — stand on the moon altar, press **E**, craft any relic.

Gate status reads `Overworld: LOCKED (Story 2/18)` until the spar quest is done, then `OPEN`. Relic craft starts step 5. The east cottage gate opens at Act 2 start; returning to Hearth Crossing is the readable cottage-gate story beat. Crafting a boat closes Act 2.

### Hearth Crossing villagers

Three cottages in the village can be entered. Stand on a cottage door and press **E** to go in; walk back out through the doorway at the bottom of the room to leave. Cottage interiors are safe rooms — no wild creatures spawn there.

Each cottage is home to one villager you can talk to with **E**:

| Villager | Home | First-visit gift |
| --- | --- | --- |
| Warden Bryn | Warden's Cottage | Wild Fiber ×3 |
| Weaver Sable | Weaver's Cottage | Moss Fiber ×3 |
| Hearthkeep Odd | Hearthkeep Cottage | Brook Tonic ×1 |

A villager hands over their gift the first time you speak to them, once per save. Once Act 2 starts (after the first shrine relic), the east cottage gate opens. **Warden Bryn** then also gives a Mossling or Ember Wisp if you do not already have that Grove line (Bramblewarden / Hearthflame count). After that they cycle through local talk — some of which is worth listening to. Visitors on an invite link can explore the cottages and talk to everyone, but never receive gifts.

Talk again after the gift and each villager will offer a **side ask** when that step is the active main-quest beat (Odd, then Bryn, then Sable — you cannot skip ahead):

| Villager | Ask | Reward |
| --- | --- | --- |
| Warden Bryn | Bring word of five different creatures | Brook Tonic ×2 |
| Weaver Sable | Deliver Wood ×5 and Wild Fiber ×3 | Brook Tonic ×2 |
| Hearthkeep Odd | Travel with three companions | Moonwake Draught ×1 |

Active village asks show in the status panel as `Village ask: …`. Delivery asks only take materials when you successfully turn them in. Visitors cannot accept or complete side asks.

After Hearthkeep Odd's side ask is done, talk to him again to rest the party at the hearth. The first rest costs **Wood ×20, Wild Fiber ×20, and Pebble ×20**; later rests cost **5 of each**. Confirm with **Rest** (or decline with **No**) — it fully restores every party creature, including fainted ones. Visitors cannot rest.

Stand next to the house's signature prop and press **E** for a minigame (same reach as talking). Standing on the villager still talks — gifts and side asks are unchanged. Visitors can play but never receive the first-win gift.

| House | Prop | Minigame | First win (once per save) |
| --- | --- | --- | --- |
| Warden's Cottage | Shelf | **Ward the Crossing** — place copies of your living party on 3 lanes (scroll the bench if needed), press Start, hold 3 waves | Wild Fiber ×2 |
| Weaver's Cottage | Loom | **Loom Pattern** — repeat three thread sequences | Moss Fiber ×2 |
| Hearthkeep Cottage | Hearth | **Hearth Lots** — roll one die and hop a 12-round property board vs Odd | Brook Tonic ×1 |

Ward the Crossing needs at least one living **active** companion. Overworld HP does not change. Hearth Lots uses play money; inventory only changes on that first-win tonic.

### Encounters and crafting

- Walk in zones to trigger encounters: **Befriend**, **Spar**, or **Flee**.
- Creatures and moves have folklore **types**. Spars use accuracy, hunter matchups (~1.5×), and rare immunity traits on signature creatures.
- Winning spars grants creature materials, Folklore Dust, and shared party XP (levels scale combat HP/ATK; wilds get tougher the more you defeat that species).
- At **Moon Shrine**, craft on a **4×4** grid: drag materials into shape, then tap the result. **Brook Tonic** and **Moonwake Draught** yield 3 per craft. Open **Recipes** (status panel, Inventory, or the shrine Craft tab) for the patterns. Craft a **Portable Moonshrine** at the altar (one only); **Inventory** then includes the craft grid and **Use** on tonic / draught / crystal, and **Use** on the relic opens Craft + Use anywhere. Fusion stays at the real shrine. Earn exclusive **Tide Crown** and **Boulder Crown** by defeating **Tide Sovereign** and **Stone Sovereign** (one each), then add them to the **Sovereign Seal** pattern to form the seal. A **Sovereign Seal** fuses **Tide Sovereign** and **Stone Sovereign** into **Horizon Sovereign** (at most two of each parent and two Horizons); two Horizons then fuse into a unique **Eclipse Sovereign**. Apply shrine effects to party creatures (attack buffs can add a typed dual move, including a 5th move slot). From Folklore Fields, take the north gate into **Moonwake Harbor**. Press **E** near the west Harbor dock while holding a Boat to moor it (persists in your save; visitors cannot place). After mooring, press **E** again to board and sail the Harbor water. **East Landing** is an optional dock stop — press **E** there to disembark or reboard; sailing past it keeps you in sail mode. Keep sailing east off the Harbor water edge to enter the open **Archipelago** sea: a **100×100** open ocean with a 2D grid of multi-biome 9×9 islands (lush trees/ferns, barren stones, and mixed) and open water to sail between them. Press **E** at any island dock to disembark or reboard (boat stays available at Archipelago docks once moored from Harbor). You can also **E** at the west Harbor dock to disembark onto the pier. Mid-sail and on-island stands restore from save (archipelago regenerates water chunks and island stamps around you). Older saves that still had a Folklore Fields boat stand migrate into Harbor automatically. **On foot** on islands you can meet archipelago-exclusive creatures (Isle Fernling on lush, Salt Scuttle on barren, Shoal Wisp on mixed); sailing skips wild encounters.
- Open **Codex** to see which creatures live where. Encountering a creature once lists it under **every** habitat that can spawn it. Habitats with no known dwellers stay blank until you meet something from that pool.

### Secrets

The game hides one achievement. It is never listed, counted, or named in the UI before you earn it — the story hints and the codex only nudge you toward it.

<details>
<summary>Spoiler</summary>

Filling every codex page (all 27 creatures that appear in habitat encounter tables) unlocks **Codex Keeper** and grants **Brook Tonic ×5** and **Moonwake Draught ×5** — five heals and five revives. It awards once per save. `Bramblewarden` and `Hearthflame` are evolution-only and are not required.

</details>

### Friend invites

1. As **host**, tap **Copy invite link** at the top of the status panel (or press **I**). On phones this copies when possible, otherwise opens the share sheet or shows a selectable invite URL.
2. Open the link in another browser/tab to join as a **visitor**.
3. Visitors can explore the host snapshot but **cannot** trigger encounters, craft, or advance quests.
4. Broken or tampered `?join=` links show an error screen and do not change your local save.

### Save and resume

Host progress (party, inventory, quests, position, gate) lives in `localStorage`. Append `?new=1` or use **Reset game** to start over. A valid `?join=` invite always takes precedence over the local save.

---

## Development

**Requirements:** Node.js 20.9+ and npm.

```bash
npm install
npm run test:e2e:install  # once: Playwright Chromium
npm run dev               # http://localhost:5173
npm test                  # Vitest unit tests
npm run test:e2e          # Playwright boot/HUD smokes
npm run build             # production build → dist/
npm run preview           # serve dist locally
npm run pack:atlas        # rebuild Imagine texture atlas after adding/replacing PNGs
```

Pull requests to `main` run CI (`npm ci`, `npm test`, Playwright Chromium smokes, `npm run build`). Merges deploy via Vercel.

### Toolbelt

Free apps and sites for art, audio, and browser QA. Agents follow `.cursor/skills/ivyward-assets/` and `.cursor/skills/ivyward-browser-qa/`. `./scripts/check-toolbelt.sh` reports what is installed.

| Tool | Use |
| --- | --- |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama/releases) (LibreSprite fallback) | Pixel sprites, walk cycles. Export PNG into `public/assets/`, then `npm run pack:atlas` for player/creatures/world. |
| [Krita](https://krita.org) | Mood and paint-overs, not 16–32px sheets. `brew bundle --file=Brewfile` |
| [Audacity](https://www.audacityteam.org) | Trim/resample SFX. `brew bundle --file=Brewfile` |
| [ChipTone](https://sfbgames.itch.io/chiptone) / [jsfxr](https://sfxr.me) | New WAV SFX (16-bit PCM mono 22050 Hz, matching `public/assets/audio/`) |
| [Lospec](https://lospec.com/palette-list) | Browse palettes only when starting a new art family; otherwise match existing Imagine sheets |
| Chrome DevTools / Cursor browser | HUD snapshots, canvas screenshots, Local Storage, Performance |
| Playwright | `npm run test:e2e` — boot name-intro and Inventory/Party. Not canvas combat. |

Tiled is not in the toolbelt: zones stay TypeScript grids in `src/game/world/zones.ts`.

### Dev-only cheats

These are for local development only; they are not part of normal play:

- **U** — toggle the overworld gate without completing Story 2
- `?encounter=<creatureId>` / `?spar=<creatureId>` — launch a preview encounter/spar in the Vite dev server

### Project layout

- `src/game/` — Phaser bootstrap and scenes
- `src/game/story/` — quest definitions and progress
- `src/game/world/` — zones, collision, invites, saves
- `src/game/creatures/` — catalog and party
- `src/game/inventory/` / `src/game/crafting/` / `src/game/shrine/` — materials and Moon Shrine
- `AGENTS.md` — agent workflow conventions

## License

Private project.
