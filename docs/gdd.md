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

**FTUE / confined region** [moved from README]: Start in **Whisper Grove**, walk map exits through **Moon Shrine** to **Hearth Crossing** (plaza). North of the plaza, **Folklore Fields** unlock after Story 2 (overworld gate). East of the plaza, the **cottage village** sits behind a village gate that opens when Story 4 (first evolution) starts. Folklore Fields' east exit into **Mistwood Reach** / **Emberfen Hollow** is a region gate that opens when you beat the rival Wren (Story 5). From Harbor (north of Fields), sail east past East Landing into the open **Archipelago** sea. The top-right island holds hermit **Reed**, a fusion sage who teaches Sovereign lore; Tide Sovereign is found on that island.

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

**Main arc (#369):** eight linear beats on the HUD (`Story N/8` + Next hint + a short villager or rival line), sized for a ~20-minute Hybrid session. Each beat has a payoff:

| # | Beat (HUD) | Payoff |
| --- | --- | --- |
| 1 | Befriend your first companion | Companion joins; toast names its temperament |
| 2 | Win a training spar (hunter tip teaches one matchup) | **Overworld gate opens** |
| 3 | Craft a relic at Moon Shrine | First relic (Moss Salve / Ember Charm sets up beat 4) |
| 4 | Grow your first companion (either Grove evolution) | Evolution cutscene (skippable; the first one offers the Companion Card share); **cottage gate opens** when the beat starts (Bryn gifts a missing Grove starter) |
| 5 | Beat Wren, the rival | One battle ("Wren, the Rival", VS banner, rival theme). Wren sends a scaled 2-creature team in sequence. Banter changes on a win or a loss. A lone companion gets a "bring a friend" line from Wren (dialogue + HUD) before the fight, naming Bryn's Grove gift and his cottage when he has one (else the bench or the Grove); the static hint just says "bring two" (#411). Tuned on the real arrival party (Lv 4, one evolved + a friend): a best-hit-every-turn first try wins ~65-80%, a lone evolved companion ~18-44% until the Hearth Ward steps in. The first win gives Brook Tonic ×2, **opens the Mistwood path**, and adds Pip the Brook Nymph if the party has no water type |
| 6 | Walk the Mistwood path | **Region unlock** — new creatures |
| 7 | Face the Cinder Matriarch | **Boss battle** in Emberfen Hollow, with an ember arena, a boss theme and a boss bar with a phase pip. Mire form (fen) becomes Cinder form (ember) at 50% HP, inside the same battle. Each form runs a fixed intent pattern. The telegraphed signature, Cinderfall, has a wind-up; Guard parries it and staggers her. Wren assists every few turns (cleanse / heal / daze, or drench when her form hunts your lead; Soaked douses Cinder form). HP and damage scale to the number of challengers. **Hearth Ward** catch-up: ×0.85 after 2 losses in a row and ×0.75 after 4 (persisted per challenge, reset on a win), shown as a chip above the foe's bar with "N more tries until the ward strengthens" (#399). Reward: Moonwake Draught + ember egg |
| 8 | Return to the Moon Shrine | **Finale**: a scripted shrine scene with Wren. The egg hatches into **Cinderling** (a rare Cinder Toad with a signature Ember Spit). Main story complete; hook toward the optional Sovereign voyage (Horizon / Eclipse fusion). On `story:finale-complete` the credits card (companion recap, Share, Keep exploring) shows once per save (persisted `storyFinaleCardShown`, #399) |

Rival and boss rosters, forms, patterns, challenger scaling, assist rules and rewards are data in `src/game/story/storySpars.ts`. Each challenge is one BattleScene battle driven by `battle/boss/storyBattle.ts`, which BattleScene and the balance sim share. The win rates are pinned in `battle/boss/storyBattleBalance.test.ts`; the full table comes from `STORY_REPORT=… npx vitest run src/game/battle/boss/storyBattleReport.test.ts`. A loss restores the party for a cheap retry (once per beat). Wren stays in the plaza for escalated rematches after the arc.

Gate status reads `Overworld: LOCKED (Story 2/8) · Village: … · Mistwood: LOCKED (Story 5/8)` until each gate opens.

**Optional side threads (never gate the main arc):** village asks, cottage minigames, daily asks, Odd's rest, and the **Sovereign voyage** (craft a Boat → Tide Sovereign on Reed's isle → Stone Sovereign on the cairn isle → Sovereign Seal → Horizon fusion; Eclipse beyond). The voyage shows as `Optional — Sovereign voyage: …` after the finale, or earlier once you have a boat or a Sovereign.

**Save migration:** older 18-step and 4-step saves map to the first matching beat. Old step 1 → 1, 2 → 2, 3–4 → 3, 5 → 4, and 6+ → 5 (rival). A finished save stays finished. An evolved companion completes beat 4 on load, a walked Mistwood keeps its gate open, and a voyage in progress keeps its step.

**Session loop:** Hybrid. A good short session lands a Session set (spar with companions present + one craft/shrine step). Longer sit-downs can chain more loops, including frozen satellites, without being the promise.

**Meta loop:** Growth unlocks that make the party feel more yours; map unlocks; Codex as maintain-only. Fusion line is frozen, not the meta.

---

## 3. Progression & Retention

**Shipped progression** [moved from README + inferred from `src/game/`]:

- **Story 8/8** main arc (#369): befriend → spar → shrine craft → evolution → rival → region → boss → finale. Gates: first spar win opens the overworld, Story 4 opens the cottage gate, and beating Wren opens the Mistwood path. Village content and the Sovereign voyage are optional side threads.
- **Party:** active party max 7; extras in reserve. [inferred: `ACTIVE_PARTY_LIMIT`]
- **Levels:** creatures level from shared spar XP (actives only). Catalog HP/ATK are Lv 1 baselines; effective combat stats use `floor(base * (1 + (level-1)*(2.25/49)))` plus shrine bonuses → ~3.25× at Lv 50. XP to reach level N is `5 * (N - 1)²` (`MAX_LEVEL` = 50; `XP_PER_SPAR_WIN` = 70 pool: the fighter takes 50%, benched actives split the rest). No heal on level-up. Wild level is `min(50, round(active party avg level) + rarityBias)` where rarityBias is +0 / +1 / +2 from max encounter weight (≥40 / 13–39 / ≤12); spar wins no longer raise it (#370); sovereigns excluded. Spar wins also roll a bonus drop (Moonlit find +3 Dust 5%, Lucky scrap +1 Dust 15%, Bonus haul +1 species material 25%). Befriend inherits the wild’s effective level.
- **Befriend odds (#366):** additive, clamped 5–95% (`encounters/befriendChance.ts`): base 28%, −6%/rarity step, −4%/level the wild is above the lead (cap −20%) or +2%/level below (cap +10%), up to +40% from missing HP, Rooted/Dazed +12% (Burn/Soaked +5%), opt-in Folk Seal +15% / Favorite Bait +25% (bait spends 1 favorite material), lead bond +2%/tier, Curious/Gentle/Loyal lead +5%, shrine-folklore habitats ±10% for a hunter/hunted party. Sovereigns stay at a flat 8% (one try); Story 1 stays assured. The encounter card allows one try; a miss makes the wild open the spar. Befriend is a battle action only on wild-encounter spars (`allowBefriend`; story spars and ghost fights never). A spar miss spends the turn; 3 misses per encounter (card miss included) and the wild leaves (counts as Flee). Sim (`sparBalance.test.ts`, starter trio, wild at rarity level): card try then weaken to ≥60% recruits commons ~87% in ~1.9 tries; befriending at full HP every time ~60%; rares weakened ~60%.
- **Bond in battle:** the fighting companion's bond tier multiplies its outgoing damage (1.00 / 1.02 / 1.04 / 1.06 / 1.08).
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
| Wood, Stone, Wild Fiber, Pebble | Gather nodes | Chop/mine/gather/collect on world props, 2-3 per harvest, 15s cooldown [inferred: `gatherNodes.ts`] | Craft patterns; Sable delivery (Wood ×5, Wild Fiber ×3) |
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

Walk in zones to trigger encounters: **Befriend**, **Spar**, or **Flee**. Safe zones never roll wild encounters (#411, `safe` on the zone / `isSafeZone`): the Hearth Crossing plaza and every cottage interior. Harbor has no wild table yet. Archipelago: **on foot** on islands can meet island-exclusive creatures; **sailing skips** wild encounters.

[inferred: travel threshold `ENCOUNTER_TRAVEL_THRESHOLD` = 0.75 tiles of movement before a roll.]

**Pacing (#390, `encounters/encounterPacing.ts`):** after an encounter ends the player walks at least 12 tiles (14 after a Flee) before the next roll, and entering a zone grants a 6-tile grace. Habitat rates are otherwise unchanged.

**Living routes (#411):** the story routes (Folklore Fields, Mistwood Reach, Emberfen Hollow) are short (~30 tiles on a straight walk from the Fields gate to the Matriarch), so grace + gap could leave the whole walk empty. After 20 route tiles without an encounter, the next eligible roll is a sure hit; gaps and grace still apply. Measured (Playwright, straight post-Wren walk ×8): runs with an encounter 4/8 → 8/8, first by ~20 tiles; back-and-forth patrol ~3.3 → ~5.7 encounters per 100 route tiles (Whisper Grove is ~5).

**Soft recovery (#390):** E at the Moon Shrine altar fully heals the party for free (fainted included); a won wild spar restores 20% max HP to standing companions; a fully fainted active party wakes beside the altar. Odd's paid rest is optional flavour.

**Habitat encounter tables** [inferred from `encounters/tables.ts`]:

| Habitat | Typical wilds |
| --- | --- |
| Whisper Grove | Mossling, Ember Wisp |
| Moon Shrine | Ember Wisp, Brook Nymph |
| Hearth Crossing | (none: safe plaza) |
| Folklore Fields | Rootwalker, Mossling, Brook Nymph, Lantern Fox, Stone Hound, Thunder Finch |
| Mistwood Reach | Thunder Finch, Rootwalker, Lantern Fox, Mist Serpent, Bog Lantern |
| Emberfen Hollow | Peat Sprite, Cinder Toad, Ember Wisp, Bog Lantern, Brook Nymph (a water answer before the Matriarch) |
| Moonwake Harbor | (none) |
| Archipelago islands | One exclusive per island (Isle Fernling, Salt Scuttle, Shoal Wisp, Tide Urchin, Coral Skitter, Drift Kelpie, Dune Hermit, Brackish Newt, Pearl Moth, Reef Spinner, Mist Anemone, Barnacle Toad, Gulf Lantern, Spray Finch, Lagoon Hare, Atoll Wisp) |

Codex: encountering a creature once lists it under **every** habitat that can spawn it. Blank habitats stay blank until you meet something from that pool.

### Combat (spars)

Creatures and moves have folklore **types**. Spars use accuracy, hunter matchups (×1.3, prey resists ×0.8), and rare immunity traits on signature creatures. [moved from README]

**Types** [inferred: `folkloreTypes.ts`]: woodland, ember, water, earth, mist, storm, hearth, twilight, fen, will-o-wisp.

Hunter chart (attacker → defender it hunts, ×1.3): woodland→fen, ember→woodland, water→ember, earth→storm, mist→twilight, storm→water, hearth→mist, twilight→will-o-wisp, fen→hearth, will-o-wisp→earth. A hunter **resists** its prey's moves (×0.8), so a hunted creature faces a ~1.6× swing: a flagged hard counter whose counterplay is the free switch. Damage is `(power × levelMult + attack) × K / (K + defense × levelMult) × 0.5` with K = 10 (`battle/battleLogic.ts`): move power and defense scale with level like HP/ATK, so equal-level spars play the same at Lv 1 and Lv 40; the ×0.5 is battle-only bulk so spars last ~5-8 turns without touching saved HP. Sovereigns keep flat `power + attack` against them and fixed pattern damage (#378).

**Battle v1 (#364)** [`battle/kits.ts`, `battle/statusEffects.ts`, `battle/battleLogic.ts`]:
- **Kits:** every creature fights with 4 role slots — Attack (no cooldown), Guard (cd 2: braces a plain hit −20%; **parries** a finisher −60% and heals the guard user 3-6% max HP), Status (chip + status, cd 2), Finisher (big hit ×1.3, ×1.5 more vs a statused target, cd 3, starts the spar charging). Starter/overworld species are authored in `catalog.ts`; the rest derive a kit from their existing moves.
- **Intent:** the foe's next move (role, damage preview, matchup, status) is shown above it one turn ahead. Wilds set up a status before cashing a finisher and raise a guard for the turn your finisher comes off cooldown. Sovereigns telegraph their fixed pattern; crown blows read as finishers, and a guard parries any sovereign beat.
- **Statuses:** Burn (5% max HP per turn, 3 turns; hearth/ember/water/will-o-wisp immune), Soaked (takes ×1.25, storm ×1.5, douses/blocks Burn, 3 turns; water/fen immune), Rooted (deals ×0.7, 2 turns; storm/mist immune), Dazed (accuracy −25, 2 turns; twilight immune). Statuses and cooldowns are battle-only; a benched creature keeps them for the rest of the spar. Sovereign fixed-pattern hits respect Dazed (miss), Rooted and Guard (parry).
- **Switching:** the first voluntary switch each spar is free; later switches cost the turn.
- **Tutorial spar (Story 2):** wild hits ×0.6 and its intent ignores matchups. Other wilds hit ×1.08. A wild your active party outlevels by 3+ (average level) has bulk ×0.45, −0.05 per extra level, floor ×0.3, so trivial fights end in ~3-4 turns; peer-level fights are unchanged.
- **Balance (#378):** `battle/sparSim.ts` is a seeded headless spar (any level, level gaps, parties with BattleScene switch rules; policies random / max-damage / skilled). Equal-level 1v1 over all 729 base-species pairs: random ~40%, max-damage ~59%, skilled ~77% at Lv 1/10/25/40; ~5.5-7 turns, ~1.2 finishers. No skilled pair is under 20% except flagged hard counters (foe hunts you), which a partner + free switch wins ≥ 90%. Tutorial max-damage ≥ 85%. `battle/sparBalance.test.ts` pins these floors; `SPAR_REPORT=/tmp/spar.txt npx vitest run src/game/battle/sparReport.test.ts` prints the full table.
- Move buttons and the encounter panel show matchup labels (×1.3 / resists ×0.8 / immune).

Immunities apply only when the defender has rolled an immunity trait (signature creatures), not for every creature of that type. Pair map: mist immune to earth, water to ember, earth to storm, twilight to will-o-wisp.

### Party

Active party max 7. Reserve holds the rest. Host-only befriend/spar/quest.

**Companions (#367):** each befriended creature rolls a personality (Bold, Shy, Greedy, Sleepy, Curious, Loyal, Playful, Gentle) that drives follower behaviour and barks, and can be nicknamed. Bond (0–240) grows from battling together (+5 fighter / +2 benched active per spar win), first wins of the rival / boss beats (+10 each active companion), evolution (+12), gifting the species' favorite material (+8), and first-claim abilities (+6); tiers at 0/20/50/100/180, tuned (#418) so a typical arc (~8 spar wins, 1 evolution, 2 gifts, rival + boss) ends Close on the lead and Friendly on the others (`companions.test.ts` typical-arc test); anti-grind (#417): wild-spar gain is halved above Close, and spar + gift bond is capped at 60 per creature per local day (saved as `bondToday`; story wins, evolution and ability first-claims exempt), with the gift cooldown saved as `lastGiftAt`, so a pure spar grinder needs about 3 real days for Kindred (was ~36 wins); story losses / rematches roll bond back; five tiers (Wary → Kindred) add an aura, +2% damage per tier and +2% befriend odds per tier as lead. Overworld abilities (E, with the right type in the active party): burn brush (ember/hearth), ford shallows (water), sense hidden nodes (woodland/fen); one-time optional rewards.

**Companion Card (#368):** Share renders the active party as a PNG card and a `?card=` link (versioned snapshot, no save data) with Play now / Challenge (sandboxed ghost spars). ~1 in 16 befriends is a ✦ Rare colour variant. The first evolution's result card and the finale card also offer Share.

### Shrine, fusion, gods

Moon Shrine: stand on the moon altar, press E. 4×4 grid; drag materials into shape; tap the result.

Relic effects on party creatures (Growth unlock examples shipped): Moss Salve evolves Mossling→Bramblewarden and Ember Charm evolves Ember Wisp→Hearthflame (from Lv.1); presence charms (Fox-fire, Storm, Fen, Nymph, Hound Collar) brighten overworld sprites with a moon-dot. Legacy cross buffs (Ember Charm on Mossling, Moss Salve on Ember Wisp) remain separate. [inferred: `shrineEffects.ts`, `presence.ts`]

**Sovereigns:** Tide Sovereign and Cairn Sovereign fuse with a Sovereign Seal into Horizon Sovereign (max two Horizon fusions). Two Horizons fuse into Eclipse Sovereign (once). **Frozen endgame** — no new work; remain reachable.

### World / sailing

**Frozen:** do not deepen harbor / boat / Archipelago sailing. Keep reachable if shipped.

From Folklore Fields, north gate into Moonwake Harbor. Press E near the west Harbor dock while holding a Boat to moor (persists in save; visitors cannot place). Board and sail Harbor water. East Landing is an optional dock. Sailing east off the Harbor water edge enters the **Archipelago**: 100×100 open ocean, 2D grid of multi-biome 9×9 islands (lush, barren, mixed) and docks. E at island docks to disembark/reboard. Mid-sail and on-island stands restore from save. Older Folklore Fields boat stands migrate into Harbor.

### Village, cottages, minigames

**Frozen:** cottages, NPC asks, and the three minigames (Ward / Loom / Hearth Lots) — no new work.

Hearth Crossing plaza is west; an east gate into the cottage yard opens when Story 4 starts (no code). Cottage content is optional to the main arc. Three cottages, enter via door + E; leave through the bottom doorway. Hermit **Reed** lives on the archipelago’s top-right island as a fusion sage (Sovereign lore; Moon Shrine Horizon after Tide and Stone).

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
- **Assets:** Blender renders (`npm run render:assets`) + legacy Imagine PNGs packed into a multi-page atlas (`npm run pack:atlas`). See Art direction.
- **License:** Private project.

### Art direction (#359)

Decided 2026-10-07 in the Wow Pass art spike. New world art comes from `scripts/blender/`; legacy Imagine art stays until converted.

- **Projection:** 3/4 top-down, not 2:1 isometric. The engine grid (48px square tiles, `gridY*1000+gridX` depth) is unchanged; only sprites change. Props and characters use an orthographic camera pitched 35° below horizontal; ground tiles are rendered straight down so they tile. Spar art uses a 22° pitch.
- **Scale:** one world scale for the overworld: 1 tile = 1 Blender unit = 48 logical px, rendered at 4× (192 px per unit). Sprites keep the logical display sizes in `displaySizes.ts`; a creature is drawn at its true size next to the player instead of filling its box. Spar art: 1 unit = 100 design px, rendered at 3×.
- **Filtering:** `pixelArt` stays off (smooth, antialiased). Atlas pages are power-of-two with mipmaps (`LINEAR_MIPMAP_LINEAR`) so 4× sprites downsample cleanly.
- **Look:** stylized low-poly toon. 3-band ramp (navy-tinted shadow / base / cream highlight), dark-navy inverted-hull outline (~1 logical px), rim light on silhouettes, soft ground shadow. Characters are smooth-shaded; foliage and rocks are faceted.
- **Light rig (fixed in world space for every asset):** warm key sun from the front-left (only shadow caster, shadows fall up-right), weak cool fill from the right, rim from back-right.
- **Palette:** shared with the title screen. Navy `#1f2a44` (outline, shadow tint), cream `#f3ead3` (highlight), moss `#79ad55`, grass `#7fae5c`, leaf `#5c9a4c`, teal `#3f8f95`, roof `#4f7d88`, stone `#b7b2a5`, bark `#80553a`, scarf `#e6a34f`, moon `#e8eefc`. Full list in `scripts/blender/stage.py` `PALETTE`; add colors there, not per model.
- **Animation:** creatures get an idle loop for the overworld and idle/attack/hurt/faint for spars; the player gets 4 facings (true east/west, no mirroring) × idle breath (4f) + walk (6f); villagers get idle + talk.
- **Creature roster (#361):** one parametric generator (`scripts/blender/creatures.py`: blob, wisp, bird, toad, quad, stump plans) so every species shares proportions, eyes, outline and motion. Converted: Mossling, Bramblewarden, Ember Wisp, Hearthflame, Brook Nymph, Thunder Finch, Cinder Toad, Rootwalker, Lantern Fox, Stone Hound; #392 added `serpent` and `lantern` plans and converted Peat Sprite, Bog Lantern and Mist Serpent, plus the Cinder Matriarch boss (`creature-cinder-matriarch*`, second form `creature-cinder-matriarch-phase2*`). Archipelago and sovereign species stay on legacy art for now.
- **World (#361):** Grove/Shrine/Village ground uses 4 seamless variants + a path tile per zone, picked by a tile hash (no checkerboard); outdoor zones sit in a painted canopy with a navy vignette instead of a flat void; villagers, gates, lanterns, banners, a market stall and fence/shrine boundaries come from the same kit. Spar arenas: grove meadow, village plaza (warm), night.
- **Biomes (#392, `scripts/blender/biomes.py`):** Folklore Fields (meadow + flagstone road, sandy bay shore, drystone wall), Mistwood Reach (mossy dark-green floor, pines, glowcaps, soft fog banks), Emberfen Hollow (peat and ash with glowing cracks, basalt + reed boundary, braziers), Moonwake Harbor (cobbled quay, boardwalk, kerbed quay edge, sea wall), cottage interiors (plank floor + runner rug, timber-and-plaster back wall, fireplace, bookcase, loom, table, doorway). Gatherable props get per-zone looks (`prop-<kind>-<zone>`). Wren, the rival, has her own rig (rust-red capelet, side ponytail, wren feather, staff) with idle/talk and a higher-res bust portrait (walk facings are specced but not packed until she moves) for dialogue.
- **Ocean (#412, `scripts/blender/ocean.py`):** one sea for the Fields bay, Harbor and Archipelago. `tile-sea-deep-v0..3` / `tile-sea-shallow-v0..3` share their border detail (seamless with each other) and are picked by tile hash, shallow next to land (no light/dark checker, no checker tint on water). Coasts are transparent quarter-tile pieces (`shore-<family>-<edge-n|edge-e|end-n|end-e|inner|outer>`, rendered for the NE quadrant and turned in 90° steps): every piece is a crop of one signed-distance field around its tile corner, so straight coasts wobble slightly, convex island corners round off (radius 0.42 tile, the corner tip of the island tile shows water) and concave ones fillet. Families: `sand` (beach, wet sand, foam line, lagoon tint on the water tile), `land` (sand rim over the island tile's grass edge), `foam` (Harbor quay / sea wall). Docks are `tile-pier` planks + their shadow over a water tile, so the beach runs under the pier. The Fields bay gets the same foam against its shore (islet tiles excepted). Each Archipelago island (floor, shallow ring, shore pieces, pier) is baked into one RenderTexture while it is in the visual window, which keeps the zone near ~2,000 display objects; that window widens to the camera half width on wide stages so islands never pop in. Harbor and the Archipelago sit on a grid-aligned deep-water backdrop; the Archipelago has a soft horizon past its north edge (sky gradient, distant islet silhouettes with reflections, clouds; islets/clouds parallax horizontally, clouds drift unless Effects are off or reduced motion is on) drawn in world space so the day/night colour matrix tints it. The sea backdrop TileSprite is built at ⅛ size and scaled up (#410 trick): its canvas texture is 0.72 MPx (~2.9 MB) instead of 46 MPx (~184 MB) in the Archipelago and 0.11 MPx instead of 6.9 MPx (~28 MB) in Harbor, same pixels on screen. Tile frames (`floor-`, `tile-`, `shore-`) pack with a 12 px extruded gutter instead of 2 px: the Archipelago draws a 192 px tile at ~24 px (mip level 3), and the narrow gutter let mips draw a hairline grid on every seam.
- **Budget:** atlas pages are 2048² PNG, 256-color quantized, skyline-packed; the packed atlas stays under 12 MB on disk and at most 8 pages (both test-enforced). Disk size is not the constraint: every page decodes to 2048² RGBA = 16.8 MB of GPU memory, ~22.4 MB with its mip chain (+⅓), so 8 pages ≈ 179 MB is the real ceiling, chosen for mid-range phones. #399 measured 8 pages (~29 MPx of slots); the packer now packs identical images once and aliases duplicate keys (base pose = `__idle_00`, walk contact frames, legacy light/dark floors: 93 of 621 keys), and the boss arena + cottage boundary load standalone instead, so the atlas is **7 pages (~157 MB GPU with mipmaps) with ~1.5 pages free** (page 7 half empty, page 8 unused), output deterministic. #412 (ocean kit + 12 px tile gutters) stays at 7 pages / ~157 MB: content 23.3 → 23.6 MPx, page 7 now ~85% full (`backdrop-harbor` dropped, legacy `tile-water-light|dark` alias deep v0/v1), so ~1.15 pages remain.
- **Remaining-art plan (fits the cap in this order):** (1) Archipelago floors — done in #399 (`floor-archipelago-v0..3`, one pale "isle" set; per-island biome colour stays a code tint), ~0.15 MPx. (2) The 16 archipelago species on the parametric generator: encounter pose + idle loop only (no battle sheet until they matter), ≈ 16 × (0.15 + 4 × 0.04) ≈ 5 MPx, about 1.2 pages. (3) Sovereigns (Tide, Stone, Horizon, Eclipse) stay standalone 1024² PNGs outside the atlas, loaded on demand (`render/lateAssets.ts`, #410); converting them should keep them standalone and on demand. If (2) overruns: render overworld idle loops at half resolution (they display at ~48 logical px, so 2× is enough) before adding a 9th page, and raise the page cap only with a phone memory check. Battle art renders at 2× design px. Pack inputs live in `art/rendered/` (Blender) and `art/legacy/` (Imagine); neither ships in dist. Spar stage: dais centred at design y=300, arena scaled 1.18×; arena variant by zone (village plaza in Hearth Crossing) and night.
- **Boot and memory (#410):** the title is interactive after ~0.5 MB of assets (title art, title theme, UI click; test-enforced budget); the 7 atlas pages, anims and world audio (~5.2 MB) stream in behind the title, and New Game waits on a branded veil only if the player beats them. Late-game art never boots: the four sovereign PNGs (6.5 MB on disk, 4 × 4.2 MB = ~17 MB GPU, ~22 MB with mips) and the Hearth Lots board (0.3 MB, ~1.6 MB GPU) load in the `preload()` of the scene that first shows them (encounter, spar, Hearth Lots) or ahead of a Sovereign Seal fusion; a save that already owns or has discovered a sovereign loads it at boot. First-session GPU textures: atlas ~157 MB with mipmaps (unchanged; mipmaps kept, dropping them would save ~39 MB but shimmer 4× sprites shown at 1–2×) + title textures ~25 MB; the canopy backdrop TileSprite is built at ¼ size and scaled up, so its private canvas texture is 0.4 MPx (~1.5 MB) instead of 6 MPx (~24 MB).
- **In-canvas UI:** prompts and hints are rounded navy pills with cream text (`ui/hudPill.ts`) to match the DOM chrome.

---

## 8. Milestones & Roadmap

**Shipped today:** production contains the full vertical slice (overworld, harbor, Archipelago, invites). Frozen satellites remain reachable; spine is the optimization target.

**First milestone (shipped, contract #293):** feel gate + Growth unlocks on the locked companion/recipe set (#295 → #296, QA #297). Docs/glossary landed (#294). Session set reads: spar-with-party → shrine pit-stop → companion feels more yours (evolve and/or presence).

**Post-milestone (also shipped, not in original freeze):** level-scaled combat (#287), overworld encounter fixes (#300, #301). Contract assumption on holding #287 was superseded after feel gate — prep-gated spars coexist with level drip; shrine remains the big spike.

**Next:** campaign Spine-quality on remaining catalog (bond shipped in the Wow Pass, #367). Open backlog: #218 (item art), #232 (Greg slice, separate gate). The main line is the 8-beat arc from #369 (it replaces the 18-step contract from #312).

**Smallest showable version:** surpassed — core loop and first milestone bar both met.

---

## GDD Status

- **Completeness:** 6/8 sections (6 ✅ present, 2 ⚠️ partial, 0 ❌ TBD sections; monetization model and D1/D7/D30 pair remain TBD inside otherwise-present sections)
- **Imported from:** README.md (player how-to) + `src/game/` implementation; gap answers from /game-import session 2026-08-20
- **Import date:** 2026-08-20
- **Sections needing work:** Progression (name D1/D7/D30 hooks); Economy (choose a monetization model or explicitly "hobby")
- **Recommended next skill:** /game-review — GDD is standardized at 6/8; review the design, then /player-experience
