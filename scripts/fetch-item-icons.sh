#!/usr/bin/env bash
# Copies drednot.io's own images into the project, so the game uses the real art instead of stand-ins.
# It reads the folder listings at https://drednot.io/img/ and https://drednot.io/img/item/ and downloads every PNG:
#   /img/item/<name>.png  ->  dist/sprites/item-<name>.png      (item icons: ammo, metal, explosives, turrets, ...)
#   /img/<name>.png       ->  dist/sprites/official-<name>.png  (placed tiles, machines, bots, ...)
# Run it once from the project folder somewhere with internet access (a Codespace works), then commit:
#
#   bash scripts/fetch-item-icons.sh
#   git add dist/sprites && git commit -m "Official drednot images" && git push
#
# Another copy of the folders can be used instead:  bash scripts/fetch-item-icons.sh https://host/img
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-https://drednot.io/img}"; BASE="${BASE%/}"
ok=0; fail=0
fetch_dir(){ # $1 = folder URL, $2 = file prefix
  local list names
  list=$(curl -fsSL --max-time 30 "$1/") || { echo "  ✗ could not read the listing at $1/"; return; }
  names=$(printf '%s' "$list" | grep -oE 'href="[^"?/]+\.png"' | sed -E 's/href="([^"]+)\.png"/\1/' | sort -u)
  [ -z "$names" ] && { echo "  ✗ no PNG files listed at $1/"; return; }
  for f in $names; do
    if curl -fsSL --max-time 30 -o "dist/sprites/$2$f.png.tmp" "$1/$f.png" && head -c 8 "dist/sprites/$2$f.png.tmp" | grep -q PNG; then
      mv "dist/sprites/$2$f.png.tmp" "dist/sprites/$2$f.png"; ok=$((ok+1)); echo "  ✓ $2$f.png"
    else
      rm -f "dist/sprites/$2$f.png.tmp"; fail=$((fail+1)); echo "  ✗ $f.png (not downloaded)"
    fi
  done
}
fetch_dir "$BASE/item" "item-"
fetch_dir "$BASE" "official-"
echo; echo "  $ok images saved to dist/sprites/ ($fail failed)."
echo "  Next: git add dist/sprites && git commit -m \"Official drednot images\" && git push"
