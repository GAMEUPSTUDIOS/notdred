#!/usr/bin/env bash
# Downloads the original item icons the game uses from the drednot.io image folder (Index of /img/item/) into
# dist/sprites/item-<name>.png. The game picks them up automatically; any file that is missing falls back to
# the build's own icon. Run once from the project folder (needs internet, e.g. in a Codespace):
#
#   bash scripts/fetch-item-icons.sh                      # from https://drednot.io/img/item/
#   bash scripts/fetch-item-icons.sh https://host/img/item  # from another copy of the folder
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-https://drednot.io/img/item}"; BASE="${BASE%/}"
FILES="ammo_standard ammo_scattershot ammo_flak ammo_sniper ammo_punch ammo_yank ammo_slug ammo_trash turret_rc turret_rc_starter turret_burst turret_auto turret_controller repairkit repair_tool"
ok=0; fail=0
for f in $FILES; do
  if curl -fsSL --max-time 20 -o "dist/sprites/item-$f.png.tmp" "$BASE/$f.png" && head -c 8 "dist/sprites/item-$f.png.tmp" | grep -q PNG; then
    mv "dist/sprites/item-$f.png.tmp" "dist/sprites/item-$f.png"; ok=$((ok+1)); echo "  ✓ $f.png"
  else
    rm -f "dist/sprites/item-$f.png.tmp"; fail=$((fail+1)); echo "  ✗ $f.png (not downloaded)"
  fi
done
echo; echo "  $ok icons saved to dist/sprites/ ($fail missing). Reload the game page to see them."
