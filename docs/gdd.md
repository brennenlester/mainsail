# Ivyward — Game Design Document

**Team:** [inferred: GitHub `brennenlester/ivyward`; no studio name in source]
**Platform:** Web browser (desktop sit-down RPG; treat the browser as a PC client)
**Genre:** Folklore RPG (isometric exploration, creature befriend/spar, shrine crafting)
**Target Session:** Hybrid — a session should pay off in about twenty minutes and can optionally chain into a longer sit-down. Hour-plus is not the default promise.
**Monetization:** ❌ **TBD** (not decided)
**Last Updated:** 2026-08-21
**Product contract:** GitHub #293; glossary `CONTEXT.md`
**Imported by:** /game-import from README.md + live `src/game/` implementation (design of record; no prior GDD file)

---

## 1. Overview & Core Concept

A folklore RPG where you spar with your odd little party, craft at the Moon Shrine to help them grow, and wander a soft world between sharper fights. Companionship is the end; shrine craft is the means. Social hosting (invite links) is a frozen satellite, not the headline.

**Play (canonical):** [mainsail-brennen1.vercel.app](https://mainsail-brennen1.vercel.app) (tracks latest production). Fallbacks: [mainsail-git-main-brennen1.vercel.app](https://mainsail-git-main-brennen1.vercel.app) or [poke-wine-kappa.vercel.app](https://poke-wine-kappa.vercel.app). Legacy `ivyward-brennen1.vercel.app` is re-aliased to the same production deploy.

**Audience / session:** Desktop sit-down RPG. Keyboard/mouse. Hybrid sessions (about twenty minutes to a Session set: spar with the party, then a shrine pit-stop). Longer evenings are optional repeats, not required. Not a 3-minute casual drop-in.

**Controls** [moved from README How to play]:

| Input | Action |
| --- | --- |
| Arrow keys or WASD | Move (hold to keep walking) |
| E | Interact: Moon Shrine, cottage door, villager, cottage minigame, moor/board/disembark boat |
| I | Copy friend invite link (host only) |
| Copy invite link (status panel) | Same as I; works on touch |
| Party (status panel) | Active party (max 7) and reserve scroll/swap |
| Inventory (status panel) | Materials and items. After Portable Moonshrine: 4×4 craft grid and Use on tonic / draught / crystal |
| Recipes | Every shaped crafting pattern (status panel, Inventory, or Moon Shrine) |
| Codex | Habitat codex: what lives where (fills in as you encounter creatures) |
| Reset game | Wipe local host save and start fresh |

**FTUE / confined region** [moved from README]: Start in **Whisper Grove**, walk map exits through **Moon Shrine** to **Hearth Crossing** (plaza). North of the plaza, **Folklore Fields** unlock after Story quest 2 (overworld gate). East of the plaza, the **cottage village** sits behind a village gate that opens at Act 2 start. From Harbor (north of Fields), sail east past East Landing into the open **Archipelago** sea. The top-right island holds hermit **Reed**, a fusion sage who teaches Sovereign lore; Tide Sovereign is found on that island.

---

## 2. Core Loop

Repeating cycle (**spine loop**):

1. **Walk** isometric zones (hold WASD / arrows). Soft overworld.
2. **Encounter** a wild creature (Befriend, Spar, or Flee). Spars are the sharp beat and primarily feed shrine craft (materials / prep).
3. **Payoff:** Befriend adds a companion (on-ramp; not every session’s receipt). Spar win grants creature materials, Folklore Dust, and XP.
4. **Shrine pit-stop:** Craft on the Moon Shrine 4×4 grid (or Portable Moonshrine after it is crafted). Growth unlocks (evolution or presence/cosmetic) make companions feel more yours. Tonics remain usable; Sovereign fusion is frozen.
5. **Open a little more map,** then repeat. Host progress saves automatically in `localStorage`.

**Freeze (no new work; remain reachable):** village cottages / NPC asks; cottage minigames (Ward the Crossing, Loom Pattern, Hearth Lots); harbor / boat / Archipelago sailing depth; Sovereign fusion endgame; host invite / visitor snapshot. Pitch and FTUE soft-ignore these.

**In spine:** overworld walk and encounters; befriend; spars with party present; gather nodes that feed craft; Moon Shrine pattern craft and growth.

**FTUE close (once):** first four beats of the 18-step main line on the HUD (`Story N/18` + Next hint; NPC flavor on steps 3–4):

1. Befriend a wild creature.
2. Win a training spar — this **opens the overworld gate** (Folklore Fields / Harbor / Archipelago).
3. Reach Hearth Crossing plaza (Grove → Shrine → Village).
4. Craft a relic at Moon Shrine (stand on the moon altar, press E, craft any relic). Step 5 activates next.

Gate status reads `Overworld: LOCKED (Story 2/18)` until the spar quest is done, then `OPEN`.

**Session loop:** Hybrid. A good short session lands a Session set (spar with companions present + one craft/shrine step). Longer sit-downs can chain more loops, including frozen satellites, without being the promise.

**Meta loop:** Growth unlocks that make the party feel more yours; map unlocks; Codex as maintain-only. Fusion line is frozen, not the meta.

---

## 3. Progression & Retention

**Shipped progression** [moved from README + inferred from `src/game/`]:

- **Story 18/18** as the full main line; Act 1 (steps 1–4) is the FTUE on-ramp. Skill/content gate: first spar win unlocks the overworld. Village cottages unlock when the main quest opens the east gate (Act 2).
- **Party:** active party max 7; extras in reserve. [inferred: `ACTIVE_PARTY_LIMIT`]
- **Levels:** creatures level from shared spar XP (actives only). Catalog HP/ATK are Lv 1 baselines; effective combat stats use `floor(base * (1 + (level-1)*(2.25/49)))` plus shrine bonuses → ~3.25× at Lv 50. XP to reach level N is `5 * (N - 1)²` (`MAX_LEVEL` = 50; `XP_PER_SPAR_WIN` = 70 shared). No heal on level-up. Wilds scale with per-species spar wins: `min(50, 1 + floor(wins/2) + rarityBias)` where rarityBias is +0 / +3 / +6 from max encounter weight (≥40 / 13–39 / ≤12); sovereigns excluded. Befriend inherits the wild’s effective level.
- **Codex:** encountering a creature once lists it under every habitat that can spawn it. 27 encounter-table species required for the hidden **Codex Keeper** achievement (evolution-only `Bramblewarden` and `Hearthflame` are not required). Once per save: Brook Tonic ×5 and Moonwake Draught ×5.
- **Village side asks** (host only, after first-visit gift):
  - Warden Bryn: word of five different creatures → Brook Tonic ×2
  - Weaver Sable: Wood ×5 and Wild Fiber ×3 → Brook Tonic ×2
  - Hearthkeep Odd: travel with three companions → Moonwake Draught ×1
- **Shrine growth:** Growth unlocks on specific companions — **evolution** (Mossling→Bramblewarden, Ember Wisp→Hearthflame from Lv.1) or **presence** (cosmetic overworld tell: brightened sprite + moon-dot on Brook Nymph, Lantern Fox, Thunder Finch, Peat Sprite, Stone Hound via their charm recipes). Legacy cross-item buffs (Ember Charm on Mossling, Moss Salve on Ember Wisp) are not Growth unlocks. Fusion stays at the real shrine.
- **Sovereign line:** Sovereign Seal fuses Tide Sovereign + Cairn Sovereign → Horizon Sovereign (up to twice). Two Horizons fuse into Eclipse Sovereign.
- **Map unlocks:** Folklore Fields, Mistwood Reach, Emberfen Hollow, Moonwake Harbor, Archipelago (100×100 ocean, 9×9 island grid).

**Retention hook (stated):** companions feel more yours after shrine Growth unlocks; a little more map. Not “see every island / finish fusion.”

❌ **TBD:** explicit D1 / D7 / D30 retention design (what the second session, the week-later session, and the month-later session each promise). Content-gate intent is recorded; the calendar hooks are not.

---

## 4. Economy & Monetization

**Monetization:** ❌ **TBD** (not decided). No IAP, ads, or store SKU in the current client. README license: private project. [session answer]

**Currencies / resources** (in-game only):

| Resource | Role | Faucet | Sink |
| --- | --- | --- | --- |
| Wood, Stone, Wild Fiber, Pebble | Gather nodes | Chop/mine/gather/collect on world props, 30s cooldown [inferred: `gatherNodes.ts`] | Craft patterns; Sable delivery (Wood ×5, Wild Fiber ×3) |
| Creature materials (Moss Fiber, Ember Ash, Brook Pearl, … per species) | Spar loot | Win a spar vs that species | Craft glyphs (subset: moss, ember, pearl, etc.) |
| Folklore Dust | Spar loot | +1 per spar win [inferred: `sparRewards.ts`] | Craft (glyph D) |
| Brook Tonic | Heal | Craft ×3; NPC gifts/asks; Codex Keeper ×5 | Use |
| Moonwake Draught | Revive | Craft ×3; Odd ask ×1; Codex Keeper ×5 | Use |
| Brook Crystal | Item | Craft (single pearl) | Use |
| Relics / tools | Unique or repeatable crafts | 4×4 shrine/inventory grid | Equip/use (Boat, Portable Moonshrine, weapons, charms, salves, Sovereign Seal) |

**Craft outputs** [inferred from `recipes.ts`; Recipes panel is player-facing]:

- Sovereign Seal (altar pattern; fusion key)
- Wood Cudgel, Stone Knife, Ember Charm, Moss Salve
- Brook Tonic ×3, Brook Crystal, Moonwake Draught ×3
- Boat (dock placement enforces one boat at a time)
- Portable Moonshrine (altar-only, unique owned): unlocks inventory craft grid + Use on tonic/draught/crystal; Use on the relic opens Craft + Use anywhere. Fusion stays at the real shrine.

**Visitor economy:** visitors never receive villager gifts, first-win minigame gifts, or side-ask rewards. They cannot craft, encounter, or advance quests.

---

## 5. Player Motivation & Fantasy

**Stated fantasy** (contract #293): **companionship**, with shrine craft as the means.

- Companionship: folklore creatures feel yours — quirky, kept, present in spars and after Growth unlocks.
- Shrine craft: gather and pattern-craft so they thrive, evolve, or show presence — not a loot-bag loop for the shrine.
- Challenge: soft overworld / craft; sharp spars that feed craft.

Social hosting (invite links) remains in the client and is **frozen** — not the primary feeling. Power + discovery as twin headlines is retired.

---

## 6. Systems & Mechanics Detail

### Encounters

Walk in zones to trigger encounters: **Befriend**, **Spar**, or **Flee**. Cottage interiors are safe rooms (no wild spawns). Harbor has no wild table yet. Archipelago: **on foot** on islands can meet island-exclusive creatures; **sailing skips** wild encounters.

[inferred: travel threshold `ENCOUNTER_TRAVEL_THRESHOLD` = 0.75 tiles of movement before a roll.]

**Habitat encounter tables** [inferred from `encounters/tables.ts`]:

| Habitat | Typical wilds |
| --- | --- |
| Whisper Grove | Mossling, Ember Wisp |
| Moon Shrine | Ember Wisp, Brook Nymph |
| Hearth Crossing | Brook Nymph, Mossling |
| Folklore Fields | Rootwalker, Lantern Fox, Stone Hound |
| Mistwood Reach | Thunder Finch, Lantern Fox, Mist Serpent |
| Emberfen Hollow | Peat Sprite, Cinder Toad, Bog Lantern |
| Moonwake Harbor | (none) |
| Archipelago islands | One exclusive per island (Isle Fernling, Salt Scuttle, Shoal Wisp, Tide Urchin, Coral Skitter, Drift Kelpie, Dune Hermit, Brackish Newt, Pearl Moth, Reef Spinner, Mist Anemone, Barnacle Toad, Gulf Lantern, Spray Finch, Lagoon Hare, Atoll Wisp) |

Codex: encountering a creature once lists it under **every** habitat that can spawn it. Blank habitats stay blank until you meet something from that pool.

### Combat (spars)

Creatures and moves have folklore **types**. Spars use accuracy, hunter matchups (~1.5×), and rare immunity traits on signature creatures. [moved from README]

**Types** [inferred: `folkloreTypes.ts`]: woodland, ember, water, earth, mist, storm, hearth, twilight, fen, will-o-wisp.

Hunter chart (attacker → defender it hunts, 1.5×): woodland→fen, ember→woodland, water→ember, earth→storm, mist→twilight, storm→water, hearth→mist, twilight→will-o-wisp, fen→hearth, will-o-wisp→earth.

Immunities apply only when the defender has rolled an immunity trait (signature creatures), not for every creature of that type. Pair map: mist immune to earth, water to ember, earth to storm, twilight to will-o-wisp.

### Party

Active party max 7. Reserve holds the rest. Host-only befriend/spar/quest.

### Shrine, fusion, gods

Moon Shrine: stand on the moon altar, press E. 4×4 grid; drag materials into shape; tap the result.

Relic effects on party creatures (Growth unlock examples shipped): Moss Salve evolves Mossling→Bramblewarden and Ember Charm evolves Ember Wisp→Hearthflame (from Lv.1); presence charms (Fox-fire, Storm, Fen, Nymph, Hound Collar) brighten overworld sprites with a moon-dot. Legacy cross buffs (Ember Charm on Mossling, Moss Salve on Ember Wisp) remain separate. [inferred: `shrineEffects.ts`, `presence.ts`]

**Sovereigns:** Tide Sovereign and Cairn Sovereign fuse with a Sovereign Seal into Horizon Sovereign (max two Horizon fusions). Two Horizons fuse into Eclipse Sovereign (once). **Frozen endgame** — no new work; remain reachable.

### World / sailing

**Frozen:** do not deepen harbor / boat / Archipelago sailing. Keep reachable if shipped.

From Folklore Fields, north gate into Moonwake Harbor. Press E near the west Harbor dock while holding a Boat to moor (persists in save; visitors cannot place). Board and sail Harbor water. East Landing is an optional dock. Sailing east off the Harbor water edge enters the **Archipelago**: 100×100 open ocean, 2D grid of multi-biome 9×9 islands (lush, barren, mixed) and docks. E at island docks to disembark/reboard. Mid-sail and on-island stands restore from save. Older Folklore Fields boat stands migrate into Harbor.

### Village, cottages, minigames

**Frozen:** cottages, NPC asks, and the three minigames (Ward / Loom / Hearth Lots) — no new work.

Hearth Crossing plaza is west; an east gate into the cottage yard opens at Act 2 start (no code). Three cottages, enter via door + E; leave through the bottom doorway. Hermit **Reed** lives on the archipelago’s top-right island as a fusion sage (Sovereign lore; Moon Shrine Horizon after Tide and Stone).

| Villager | Home | First-visit gift |
| --- | --- | --- |
| Warden Bryn | Warden's Cottage | Wild Fiber ×3 |
| Weaver Sable | Weaver's Cottage | Moss Fiber ×3 |
| Hearthkeep Odd | Hearthkeep Cottage | Brook Tonic ×1 |
| Reed (hermit) | Island Cottage (archipelago top-right) | Wild Fiber ×2; fusion-sage Sovereign lore |

Once per save, host only. Then local talk. Side asks as in section 3.

House prop + E = minigame (same reach as talking; standing on the villager still talks):

| House | Prop | Minigame | First win (once per save, host) |
| --- | --- | --- | --- |
| Warden's Cottage | Shelf | **Ward the Crossing** — place copies of living party on 3 lanes, hold 3 waves | Wild Fiber ×2 |
| Weaver's Cottage | Loom | **Loom Pattern** — repeat three thread sequences | Moss Fiber ×2 |
| Hearthkeep Cottage | Hearth | **Hearth Lots** — roll one die, 12-round property board vs Odd | Brook Tonic ×1 |

Ward the Crossing needs at least one living **active** companion. Overworld HP does not change. Hearth Lots uses play money; inventory only changes on that first-win tonic. Visitors can play but never receive the first-win gift.

### Friend invites

**Frozen satellite** (contract #293): remain reachable; no new work; not the pitch.

1. Host: Copy invite link (status panel) or I. Phones copy when possible, else share sheet / selectable URL.
2. Open the link in another browser/tab as a **visitor**.
3. Visitors explore the host snapshot but **cannot** trigger encounters, craft, or advance quests.
4. Broken or tampered `?join=` links show an error screen and do not change the local save.

### Save

Host progress (party, inventory, quests, position, gate) lives in `localStorage`. `?new=1` or **Reset game** starts over. A valid `?join=` invite always takes precedence over the local save.

### Secrets

One hidden achievement, never listed before earn: fill every codex page (27 encounter-table creatures) → **Codex Keeper**. See section 3.

### Dev-only (not player design)

Local Vite only: **U** toggles the overworld gate; `?encounter=` / `?spar=` preview. Not part of normal play. [moved from README Development]

---

## 7. Technical Specs

- **Engine:** Phaser 3 (`phaser` ^3.90.0) [inferred: `package.json`]
- **Stack:** TypeScript, Vite 6, Vitest. Node.js 20.9+.
- **Platform:** Web. Production on Vercel. Canonical play URL aliased to latest production (`mainsail-brennen1.vercel.app`).
- **Persistence:** host `localStorage`. Visitor mode is a snapshot (`?join=`), not a shared live simulation of encounters/crafting.
- **Layout:** `src/game/` Phaser bootstrap and scenes; `story/` quests; `world/` zones, collision, invites, saves; `creatures/` catalog and party; `inventory/` / `crafting/` / `shrine/` materials and Moon Shrine.
- **CI:** PRs to `main` run `npm ci`, `npm test`, `npm run build`. Merges deploy via Vercel.
- **Assets:** Imagine texture atlas (`npm run pack:atlas`).
- **License:** Private project.

---

## 8. Milestones & Roadmap

**Shipped today:** production contains the full vertical slice (overworld, harbor, Archipelago, invites). Frozen satellites remain reachable; spine is the optimization target.

**First milestone (shipped, contract #293):** feel gate + Growth unlocks on the locked companion/recipe set (#295 → #296, QA #297). Docs/glossary landed (#294). Session set reads: spar-with-party → shrine pit-stop → companion feels more yours (evolve and/or presence).

**Post-milestone (also shipped, not in original freeze):** level-scaled combat (#287), overworld encounter fixes (#300, #301). Contract assumption on holding #287 was superseded after feel gate — prep-gated spars coexist with level drip; shrine remains the big spike.

**Next:** campaign Spine-quality on remaining catalog; bond meter only if ownership still weak. Open backlog: #218 (item art), #232 (Greg slice, separate gate). FTUE Story 1–4 is the on-ramp of the 18-step main line (#316).

**Smallest showable version:** surpassed — core loop and first milestone bar both met.

---

## GDD Status

- **Completeness:** 6/8 sections (6 ✅ present, 2 ⚠️ partial, 0 ❌ TBD sections; monetization model and D1/D7/D30 pair remain TBD inside otherwise-present sections)
- **Imported from:** README.md (player how-to) + `src/game/` implementation; gap answers from /game-import session 2026-08-20
- **Import date:** 2026-08-20
- **Sections needing work:** Progression (name D1/D7/D30 hooks); Economy (choose a monetization model or explicitly "hobby")
- **Recommended next skill:** /game-review — GDD is standardized at 6/8; review the design, then /player-experience
