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
| **E** | Interact — open Moon Shrine, enter a cottage door, talk to a villager, play a cottage minigame on the house prop, moor / board / disembark a boat, or use a companion ability |
| **I** | Shortcut: copy a friend invite link (host only) |
| **Copy invite link** (status panel) | Copy a friend invite link (host only; works on touch) |
| **Party** (status panel) | Manage the active party (max 7) and scroll/swap reserve creatures |
| **Share** (status panel) | Make a Companion Card of your party — share, copy, or download the PNG, or copy a challenge link |
| **Inventory** (status panel) | Browse materials and items. After you craft a Portable Moonshrine, Inventory also has the 4×4 craft grid and **Use** on tonic / draught / crystal |
| **Recipes** (status panel, Inventory, or Moon Shrine) | See every shaped crafting pattern |
| **Codex** (status panel) | Open the habitat codex — what lives where (fills in as you encounter creatures) |
| **Reset game** (status panel) | Wipe local host save and start fresh |

### Confined region

Start in **Whisper Grove**, then walk map exits through **Moon Shrine** to **Hearth Crossing**. North of the village are **Folklore Fields** (north gate into **Moonwake Harbor**, east into **Mistwood Reach** / **Emberfen Hollow**), locked until Story 2 is complete. The east path into Mistwood opens once you beat the rival Wren (Story 5). From Harbor, sail east past East Landing into the open **Archipelago** sea — a **100×100** open ocean with a 2D grid of multi-biome 9×9 islands (lush, barren, and mixed) and docks you can hop between.

### Story quests

The HUD shows `Story N/8: …`, a short “Next” hint, and on some beats a line from a villager or the rival Wren. The main arc runs about 20 minutes. Host progress saves automatically.

1. **Befriend your first companion.** Walk until an encounter appears, then choose **Befriend**. The toast names your companion's temperament.
2. **Win a training spar.** Choose **Spar** and win; a hunter tip teaches one matchup. This **opens the overworld gate**.
3. **Craft a relic at Moon Shrine.** Stand on the moon altar, press **E**, and craft any relic. Moss Salve (Moss Fiber ×2 + Folklore Dust) or Ember Charm (Ember Ash ×2 + Folklore Dust) sets up the next beat. If you are short during steps 3-4, the altar gives one bundle of those materials (once per save).
4. **Grow your first companion.** On the shrine's **Fusion** tab, apply Moss Salve to a Mossling or Ember Charm to an Ember Wisp. The cottage gate in Hearth Crossing opens; Warden Bryn gives a Grove starter if you are missing one.
5. **Beat Wren, the rival.** Talk to Wren in the Hearth Crossing plaza and accept her challenge: one battle ("Wren, the Rival") where she sends out her creatures one after another. Losing patches your party up for a retry. Winning gives Brook Tonic ×2, **opens the Mistwood path**, and if nothing in your party hunts ember, Pip the Brook Nymph joins you.
6. **Walk the Mistwood path.** Take the east exit of Folklore Fields into Mistwood Reach.
7. **Face the Cinder Matriarch.** She waits in Emberfen Hollow (past Mistwood). It is one boss battle with her own arena, music and boss bar. At half HP she transforms from Mire form (fen) to Cinder form (ember). She telegraphs Cinderfall with a wind-up; **Guard parries it and staggers her** (she loses a turn and takes extra damage). Wren fights at your side, cleansing, healing, dazzling or drenching her every few turns. Soaked, the Cinder form is doused and loses its ember bite. Losing is cheap: after 2 losses in a row the **Hearth Ward** softens her (and after 4, more). The same applies to Wren rematches. Reward: a Moonwake Draught and a warm ember egg.
8. **Return to the Moon Shrine.** Talk to Wren there. The egg hatches into **Cinderling**, a rare Cinder Toad that joins your party, and then Wren points you toward the optional Sovereign voyage. The main story is complete.

Gate status reads `Overworld: LOCKED (Story 2/8) · Village: … · Mistwood: LOCKED (Story 5/8)` until each gate opens. After the arc, Wren stays in the plaza for tougher rematches, where her storm finch joins her team.

**Optional side threads** never block the story: village asks, cottage minigames, daily asks, and the **Sovereign voyage**. The voyage goes: craft a Boat → Tide Sovereign on Reed's isle → Stone Sovereign on the cairn isle → Sovereign Seal → Horizon fusion at the Moon Shrine, with Eclipse beyond. After the finale, the HUD shows it as `Optional — Sovereign voyage: …`.

Saves from the older 18-step story move to the matching new beat. Nothing you have finished is undone, and a voyage already under way stays on its step.

### Hearth Crossing villagers

Three cottages in the village can be entered. Stand on a cottage door and press **E** to go in; walk back out through the doorway at the bottom of the room to leave. Cottage interiors are safe rooms — no wild creatures spawn there.

Each cottage is home to one villager you can talk to with **E**:

| Villager | Home | First-visit gift |
| --- | --- | --- |
| Warden Bryn | Warden's Cottage | Wild Fiber ×3 |
| Weaver Sable | Weaver's Cottage | Moss Fiber ×3 |
| Hearthkeep Odd | Hearthkeep Cottage | Brook Tonic ×1 |

A villager hands over their gift the first time you speak to them, once per save. Once Story 4 starts (after the first shrine relic), the east cottage gate opens. **Warden Bryn** then also gives a Mossling or Ember Wisp if you do not already have that Grove line (Bramblewarden / Hearthflame count). After that they cycle through local talk — some of which is worth listening to. Visitors on an invite link can explore the cottages and talk to everyone, but never receive gifts.

Talk again after the gift and each villager will offer a **side ask**:

| Villager | Ask | Reward |
| --- | --- | --- |
| Warden Bryn | Bring word of five different creatures | Brook Tonic ×2 |
| Weaver Sable | Deliver Wood ×5 and Wild Fiber ×3 | Brook Tonic ×2 |
| Hearthkeep Odd | Travel with three companions | Moonwake Draught ×1 |

Active village asks show in the status panel as `Village ask: …`. Delivery asks only take materials when you successfully turn them in. Visitors cannot accept or complete side asks.

After Hearthkeep Odd's side ask is done, you can also rest the party at his hearth. This is optional flavour now that the Moon Shrine altar heals for free. Every rest costs **Wood ×5, Wild Fiber ×5, and Pebble ×5** (the first rest used to cost 20 of each). Confirm with **Rest** (or decline with **No**) — it fully restores every party creature, including fainted ones. Visitors cannot rest.

Stand next to the house's signature prop and press **E** for a minigame (same reach as talking). Standing on the villager still talks — gifts and side asks are unchanged. Visitors can play but never receive the first-win gift.

| House | Prop | Minigame | First win (once per save) |
| --- | --- | --- | --- |
| Warden's Cottage | Shelf | **Ward the Crossing** — place copies of your living party on 3 lanes (scroll the bench if needed), press Start, hold 3 waves | Wild Fiber ×2 |
| Weaver's Cottage | Loom | **Loom Pattern** — repeat three thread sequences | Moss Fiber ×2 |
| Hearthkeep Cottage | Hearth | **Hearth Lots** — roll one die and hop a 12-round property board vs Odd | Brook Tonic ×1 |

Ward the Crossing needs at least one living **active** companion. Overworld HP does not change. Hearth Lots uses play money; inventory only changes on that first-win tonic.

### Companions

Every creature you befriend has a **personality** (Bold, Shy, Greedy, Sleepy, Curious, Loyal, Playful, or Gentle), rolled once when it joins. A skippable prompt lets you give new friends a **nickname** (rename any time from **Party**). Personality shows up in the overworld: followers bark short lines when you stop, bold ones walk ahead, shy and sleepy ones lag behind, loyal ones stay close, and curious ones drift toward anything interesting nearby.

**Bond** grows from battling together (the fighter gains most), gifting a companion its **favorite material** (Party → select → Gift; the Codex lists each species' favorite once you have met it), and using overworld abilities. Five tiers — Wary, Friendly, Close, Devoted, Kindred — each add a brighter aura under the follower and a small battle bonus (+2% damage per tier, +8% at Kindred), plus +2% befriend odds per tier while that companion leads; a tier-up gets a heart-and-sparkle celebration. Loyal companions gain extra bond from battles, Shy and Greedy ones from gifts, Curious and Playful ones from abilities.

**Overworld abilities** use **E** with the right companion in the active party (fainted companions can't help):

| Ability | Who | Where |
| --- | --- | --- |
| Burn brush → stash | Ember or hearth types (e.g. Ember Wisp) | Dry brush in Folklore Fields (NW corner) and Emberfen Hollow (SE corner) |
| Ford the shallows → islet stash | Water types (e.g. Brook Nymph) | Rippling water at the Folklore Fields south shore (west and east islets); press E on the islet to ford back |
| Sense hidden node | Woodland or fen types (e.g. Mossling) | Faint glimmers in Whisper Grove and Mistwood Reach; the revealed node stays as a regular gather spot |

All ability rewards are optional and one-time; the main quest never needs them.

### Encounters and crafting

- Walk in zones to trigger encounters: **Befriend**, **Spar**, or **Flee**. Encounters are paced: after one ends you walk at least 12 tiles (14 after a flee) before the next roll, and entering a zone gives a 6-tile grace. Each habitat's encounter rate is otherwise unchanged.
- **Soft overworld recovery.** Pressing **E** at the Moon Shrine altar fully heals the party for free, fainted companions included. Winning a wild spar restores 20% of max HP to your standing companions (story battles excluded). If your whole active party faints, it wakes beside the Moon Shrine altar fully healed. Nothing is lost and no materials are needed.
- **Befriend is a decision, not a coin flip.** The card shows the odds (`~28%` for a fresh, common, peer-level wild) with a breakdown, and allows **one** try. Odds rise as the wild weakens (up to +40% at low HP), while it is **Rooted** or **Dazed** (+12%; Burn/Soaked +5%), with an opt-in offering — **Folk Seal** (+15%, any wild) or **Favorite Bait** (+25%, also spends 1 of the species' favorite material; the cost shows on the card and button) — and with your lead's bond (+2% per tier) or a Curious / Gentle / Loyal lead (+5%). Rare and higher-level wilds start lower. **Befriend** is also a spar action on wild-encounter spars: weaken it, then recruit it mid-fight. A card miss makes the wild strike first if you spar; a spar miss spends your turn. Three misses in one encounter (the card miss counts) and it slips away, with no other penalty. Story step 1 stays assured and never spends an offering.
- Creatures and moves have folklore **types**. Spars use accuracy, hunter matchups (×1.3, prey resists ×0.8), and rare immunity traits on signature creatures.
- Winning spars grants creature materials, Folklore Dust (with occasional bonus drops), and party XP: the fighter takes half the pool and benched actives split the rest (levels scale combat HP/ATK; wild level tracks your active party average plus a small rarity bonus, so winning never snowballs the next fight). Trees, stones, ferns, and pebble piles yield 2-3 materials per harvest with a 15s cooldown per node.
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

### Companion Cards and challenge links

1. Tap **Share** in the status panel (appears once you have a companion). The game paints a Companion Card PNG of your active party (up to 7, with levels, Evolved / Presence / ✦ Rare tags, bond, and date). **Share** uses the native share sheet with the image where the browser supports file sharing; otherwise use **Copy image**, **Download**, or **Copy link**.
2. The link is `?card=<code>` — a compact, versioned party snapshot (no save data; v2 carries bond hearts, older v1 links still open). Card links skip the title screen, and no save-wipe path (title New Game, Reset, `?new=1`) works while a card or invite is open. Opening it shows the card with **Play now** (drops the link and boots normally: a fresh game for new players, your own save otherwise — never overwritten) and **Challenge** (practice spars against a ghost of that party at its levels; you use your own party, or a loaner trio if you have no save). Challenge runs sandboxed: nothing is written to your save, and reloading resets it.
3. Broken, oversized, or tampered `?card=` links show an error notice and load nothing. A valid `?join=` invite takes precedence over `?card=`.
4. **Rare variants:** roughly 1 in 16 befriended companions is a colour-shifted ✦ Rare. They are tinted in the overworld, starred in the party HUD, and highlighted on the card.

**Link previews (Vercel):** `index.html` carries static Open Graph / Twitter tags pointing at `public/og-image.jpg` on the canonical play URL. Social crawlers do not run JavaScript, so every link — including `?card=` links and preview deploys — unfurls with that static image; the personal card travels as the shared PNG. Per-card preview images would need a server/edge function rendering the card from `?card=` (out of scope: no backend). If the canonical host changes, update the absolute `og:image` / `og:url` URLs in `index.html`.

### Save and resume

Host progress (party, inventory, quests, position, gate) lives in `localStorage`. Append `?new=1` or use **Reset game** to start over (`?new=1` is ignored on `?join=` and `?card=` links). A valid `?join=` invite always takes precedence over the local save.

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
- `src/game/share/` — Companion Card, `?card=` share codes, ghost challenge, rare variants
- `src/game/creatures/` — catalog and party
- `src/game/companions/` — personality, bond, favorite materials, overworld abilities
- `src/game/inventory/` / `src/game/crafting/` / `src/game/shrine/` — materials and Moon Shrine
- `AGENTS.md` — agent workflow conventions

## License

Private project.
