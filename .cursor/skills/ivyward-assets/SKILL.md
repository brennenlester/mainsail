---
name: ivyward-assets
description: >-
  Pixel, paint, SFX, and Imagine atlas pipeline for Ivyward. Use when adding or
  changing a sprite, PNG, walk cycle, creature/item/world art, WAV, SFX, or
  when packing the atlas.
---

# Ivyward assets

Paint in Pixelorama (LibreSprite if Pixelorama is missing). Mood/UI paint-overs in Krita. SFX in ChipTone or jsfxr, trim in Audacity. Then drop files and pack.

`./scripts/check-toolbelt.sh` lists which apps are installed.

## Pixels

1. Match an existing sheet of the same class (creature, player, floor, item). Do not start a new palette; Lospec is only for browsing when a new family is explicitly requested.
2. Export PNG (indexed or RGB, no JPEG) into the folder for that class:

| Class | Folder | Typical size | Packed? |
| --- | --- | --- | --- |
| Player walk | `public/assets/player/` | 192×256 | yes |
| Creatures | `public/assets/creatures/` | ~192×208 | yes, except the four sovereigns |
| World floors/props | `public/assets/world/` | 192×192 floors | yes |
| Items | `public/assets/items/` | 128×128 | no (HUD `<img>`) |
| Materials | `public/assets/materials/` | 128×128 | no |
| NPCs | `public/assets/npcs/` | match existing | no (PreloadScene) |

3. Name the file after the texture key: `creature-mossling.png`, `player-east-0.png`, `floor-path.png`.
4. For player/creatures/world, run `npm run pack:atlas`. Do not hand-edit `public/assets/atlas/imagine.json`.
5. New keys still need a load path: atlas frame, `PreloadScene`, or HUD `src`.

Sovereigns (`creature-tide-sovereign` and the other three) stay standalone 1024² sheets; the packer skips them.

## Audio

Existing SFX are 16-bit PCM WAV, mono, 22050 Hz under `public/assets/audio/`.

1. ChipTone (https://sfbgames.itch.io/chiptone) or jsfxr (https://sfxr.me) → export WAV.
2. Audacity only to trim/normalize/resample to that format.
3. Add `scene.load.audio` in `src/game/audio/gameAudio.ts` and the play helper the scene needs.

## Agent path

Write a one-line brief (key, folder, size, what it depicts). Open Pixelorama/Krita/ChipTone for the human to paint. After the file lands: pack, wire the key, then `ivyward-browser-qa` in the running game.

Procedural Phaser fallbacks stay for missing optional frames, not for shipping new production art.
