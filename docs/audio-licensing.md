# Audio licensing

Every sound in `public/assets/audio/` is original to this project. No third-party samples, recordings, or downloaded packs are used.

## Generated (reproducible)

Produced by [`scripts/generate-audio.py`](../scripts/generate-audio.py), which synthesizes the audio from scratch with numpy (oscillators, additive synthesis, filtered noise, synthetic reverb). Fixed RNG seeds make a re-run reproduce the same files.

```sh
pip install numpy soundfile
python3 scripts/generate-audio.py          # all
python3 scripts/generate-audio.py music    # music only
python3 scripts/generate-audio.py sfx      # sfx only
```

| Files | Format | Notes |
| --- | --- | --- |
| `music-title`, `music-grove`, `music-shrine`, `music-village`, `music-battle`, `music-night` | `.ogg` (Vorbis, mono, 22050 Hz) + `.m4a` (AAC, Safari fallback) | Seamless loops, 33-40 s. Night plays after 20:00 local time in outdoor zones and always in Mistwood. |
| `music-victory` | `.ogg` + `.m4a` | One-shot sting, about 5.8 s. |
| `sfx-ui-click`, `sfx-step-grass`, `sfx-step-stone`, `sfx-step-wood`, `sfx-step-sand`, `sfx-craft-success`, `sfx-level-up`, `sfx-evolve`, `sfx-ability`, `sfx-move-fire`, `sfx-move-water`, `sfx-move-grove`, `sfx-move-neutral` | `.wav` (16-bit PCM, mono, 22050 Hz) | Short effects. |

The `.m4a` files need macOS `afconvert`; the script skips them elsewhere and the game falls back to the `.ogg`.

License for generated files: created by the project owner for this game; no third-party rights attach. They may be used and redistributed with the project under the repository license.

## Authored by hand (earlier stubs)

`sfx-step`, `sfx-gather`, `sfx-encounter`, `sfx-shrine`, `sfx-craft`, `sfx-hit-wild`, `sfx-hit-player`, `sfx-faint`, `sfx-battle-win` were authored by the project owner in ChipTone / jsfxr (see `.cursor/skills/ivyward-assets/SKILL.md`), which place no restrictions on exported sounds. They predate #371 and are unchanged.

## Budget

Total `public/assets/audio/` stays under 6 MB; `src/game/audio/musicDirector.test.ts` enforces it.
