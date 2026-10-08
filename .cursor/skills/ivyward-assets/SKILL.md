---
name: ivyward-assets
description: >-
  Blender render, pixel, paint, SFX, and atlas pipeline for Ivyward. Use when
  adding or changing a sprite, PNG, walk cycle, creature/item/world art, a
  Blender model or render, WAV, SFX, or when packing the atlas.
---

# Ivyward assets

New world art (creatures, player, props, floors, spar arena) is modelled and rendered in headless Blender; see "Blender renders" below and the Art direction section in `docs/gdd.md`. Paint in Pixelorama (LibreSprite if Pixelorama is missing) for items/materials and touch-ups. Mood/UI paint-overs in Krita. SFX in ChipTone or jsfxr, trim in Audacity. Then drop files and pack.

`./scripts/check-toolbelt.sh` lists which apps are installed.

## Blender renders (preferred for world art)

Blender 4.2+ (5.2.1 tested). `npm run render:assets` runs `scripts/render-assets.mjs`, which finds Blender (`$BLENDER`, `/Applications/Blender.app`, or `PATH`) and runs `blender --background --factory-startup --python scripts/blender/render_assets.py`.

| File | Role |
| --- | --- |
| `scripts/blender/stage.py` | Shared stage: palette, toon material, inverted-hull outline, 3-point light rig, ortho camera, shadow catcher, deterministic PNG settings |
| `scripts/blender/models.py` | Procedural models + rigs (`BUILDERS`): mossling, player, tree, bush, pebbles, standing-stone, shrine-altar, cottage, hedge, ground (palette/path params), arena (`variant`: grove/village/night) |
| `scripts/blender/creatures.py` | Parametric creature generator (#361): body plans `blob`, `wisp`, `bird`, `toad`, `quad`, `stump` + per-species dicts in `SPECIES` (palette names, extras like `thorn_crown`, `droplet`, `storm_crest`, tails). One shared `pose()` gives idle / attack / hurt / faint to every species |
| `scripts/blender/village.py` | Villagers (`VILLAGERS`, idle + talk), gate (open/locked), lantern posts, banner, market stall, fence + shrine boundaries, canopy backdrop tiles |
| `scripts/blender/specs.py` | One dict per asset: key, folder, model, size, ppu, pitch, anchor, outline, shadow, statics, anims (format documented at the top) |

1. Add or edit a builder in `models.py` (use palette names from `stage.PALETTE`, `toon()` materials, `pose(anim, t)` for animation), then a spec in `specs.py`. Keep `size` = 4× the logical display size in `displaySizes.ts` and `ppu` = 192 for overworld art so scale stays consistent.
2. `npm run render:assets -- --only <key>` while iterating; preview into the scratchpad with `-- --out <dir>`.
3. Output: `art/rendered/<folder>/<frame>.png` plus `art/rendered/anims/<key>.json` (outside `public/`, so source frames never ship in `dist`; frames are palette-quantized after each run). Frame names: statics use the spec key list; anim frames default to `<key>__<anim>_NN` (player walk keeps `player-<facing>-1..6`).
4. `npm run pack:atlas`. A rendered PNG overrides a legacy PNG with the same key; delete the rendered file to fall back. Atlas pages are 256-color quantized; `atlasManifest.test.ts` enforces the 12 MB budget.

New creature: add a `SPECIES` entry in `creatures.py` (pick a plan, palette names from `stage.PALETTE`, optional `extras`), then `*_creature("<id>", ow, battle, encounter)` in `specs.py`. Keys follow `creaturePoses.ts`: `creature-<id>` (+ `__idle`), `creature-<id>-battle` (+ `__idle|attack|hurt|faint`), `creature-<id>-encounter`.
5. Renders are deterministic (fixed samples, no dither, no stamp metadata, seeded RNG): re-running produces the same pixels (busy ground tiles may vary by 1/255).

Runtime: Phaser anims are registered from `imagine-anims.json` in `PreloadScene` (`createImagineAnims`). Keys are `<asset>__<anim>`, e.g. `creature-mossling__idle` (overworld followers play it automatically), `creature-mossling-battle__idle|attack|hurt|faint` (use `playCreatureAnim(sprite, "creature-mossling-battle", "attack")` from `render/imagineAssets.ts`), `npc-<id>__idle|talk` (`applyNpcSprite`). Floors use `floor-<zone>-v0..3` + `floor-<zone>-path` via `render/floorVariants.ts`; outdoor zones with a `backdrop-<zone>` frame get the canopy backdrop; spar arenas `arena-*`, `arena-village-*`, `arena-night-*` (`render/arenaLayers.ts`). The player idle breath (`player-<facing>__idle_NN`) is driven by `applyPlayerPose`.

## Pixels

1. Match an existing sheet of the same class (creature, player, floor, item). Do not start a new palette; Lospec is only for browsing when a new family is explicitly requested.
2. Export PNG (indexed or RGB, no JPEG) into the folder for that class:

| Class | Folder | Typical size | Packed? |
| --- | --- | --- | --- |
| Player walk | `art/legacy/player/` | 192×256 | yes (pack input only) |
| Creatures | `art/legacy/creatures/` (sovereigns stay in `public/assets/creatures/`) | ~192×208 | yes, except the four sovereigns |
| World floors/props | `art/legacy/world/` (`public/assets/world/` only for PNGs loaded directly) | 192×192 floors | yes |
| Items | `public/assets/items/` | 128×128 | no (HUD `<img>`) |
| Materials | `public/assets/materials/` | 128×128 | no |
| NPCs | `art/rendered/npcs/` (Blender) | 192×288 | yes (legacy `public/assets/npcs/` unused) |

3. Name the file after the texture key: `creature-mossling.png`, `player-east-0.png`, `floor-path.png`.
4. For player/creatures/world, run `npm run pack:atlas`. It trims transparent borders, extrudes edges, and shelf-packs into power-of-two 2048² pages (`imagine-0.png`, `imagine-1.png`, ...) described by one multi-atlas `imagine.json`, plus `imagine-anims.json`. Do not hand-edit anything in `public/assets/atlas/`.
5. New keys still need a load path: atlas frame, `PreloadScene`, or HUD `src`.

Sovereigns (`creature-tide-sovereign` and the other three) stay standalone 1024² sheets; the packer skips them.

## Audio

Existing SFX are 16-bit PCM WAV, mono, 22050 Hz under `public/assets/audio/`.

1. ChipTone (https://sfbgames.itch.io/chiptone) or jsfxr (https://sfxr.me) → export WAV.
2. Audacity only to trim/normalize/resample to that format.
3. Add `scene.load.audio` in `src/game/audio/gameAudio.ts` and the play helper the scene needs.

Music and the #371 SFX set are generated by `scripts/generate-audio.py` (see `docs/audio-licensing.md`); edit the script and re-run it rather than hand-editing those files.

## Agent path

World art: add a spec + builder, `npm run render:assets -- --only <key>`, look at the PNG, `npm run pack:atlas`, then `ivyward-browser-qa` in the running game.

Items/SFX: write a one-line brief (key, folder, size, what it depicts). Open Pixelorama/Krita/ChipTone for the human to paint. After the file lands: pack, wire the key, then `ivyward-browser-qa` in the running game.

Procedural Phaser fallbacks stay for missing optional frames, not for shipping new production art.
