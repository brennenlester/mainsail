#!/usr/bin/env bash
# Warn-only inventory of the Ivyward GUI toolbelt. Missing apps are not a failure.
set -u

ok() { printf 'ok    %s\n' "$1"; }
miss() { printf 'miss  %s\n' "$1"; }

app_exists() {
  local name="$1"
  [[ -d "/Applications/${name}.app" || -d "${HOME}/Applications/${name}.app" ]]
}

if app_exists Pixelorama; then
  ok Pixelorama
else
  miss "Pixelorama — https://github.com/Orama-Interactive/Pixelorama/releases"
fi

if app_exists LibreSprite; then
  ok "LibreSprite (Pixelorama fallback)"
fi

if app_exists Krita; then
  ok Krita
else
  miss "Krita — brew bundle --file=Brewfile  (cask krita)"
fi

if app_exists Audacity; then
  ok Audacity
else
  miss "Audacity — brew bundle --file=Brewfile  (cask audacity)"
fi

printf 'web   ChipTone https://sfbgames.itch.io/chiptone\n'
printf 'web   jsfxr    https://sfxr.me\n'
printf 'web   Lospec   https://lospec.com/palette-list\n'
printf 'cli   Chrome DevTools via Cursor browser MCP; Playwright via npm run test:e2e\n'
exit 0
