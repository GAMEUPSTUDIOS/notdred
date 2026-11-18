#!/usr/bin/env bash
# Runs inside a GitHub Codespace each time it starts: launches the game server in the background, makes
# port 8080 public, and prints the temporary https address testers can open. Log: /tmp/freeport.log
set -uo pipefail
cd "$(dirname "$0")/.."
URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
# Keep one dev-menu token per codespace so it survives restarts.
TOKEN_FILE="$HOME/.freeport-dev-token"
[ -s "$TOKEN_FILE" ] || node -e "console.log(require('crypto').randomBytes(9).toString('hex'))" > "$TOKEN_FILE"
pkill -f "node server/server.cjs" 2>/dev/null || true
# The page is served from the forwarded address, so that is the only browser origin the server accepts.
# New packages since the last update (e.g. canvas for classic mode) are installed automatically.
node -e "require('ws');require('fflate');require('canvas')" 2>/dev/null || npm install --no-audit --no-fund || true
HOST=0.0.0.0 PORT=8080 ALLOWED_ORIGINS="$URL" DEV_TOKEN="$(cat "$TOKEN_FILE")" nohup node server/server.cjs > /tmp/freeport.log 2>&1 &
for _ in $(seq 1 50); do curl -fs http://127.0.0.1:8080/health > /dev/null && break; sleep 0.2; done
if ! curl -fs http://127.0.0.1:8080/health > /dev/null; then
  echo
  echo "  The game server did not start. Last lines of /tmp/freeport.log:"
  echo
  tail -n 25 /tmp/freeport.log | sed 's/^/    /'
  echo
  echo "  Usually fixed by:  npm ci && npm run build:native   (then run this script again)"
  exit 1
fi
gh codespace ports visibility 8080:public -c "$CODESPACE_NAME" > /dev/null 2>&1 \
  || echo "Could not make port 8080 public automatically: in the PORTS tab, right-click 8080 → Port Visibility → Public."
cat <<MSG

  notdred.io is running (temporary):  $URL
  Testers: open the link, choose Connect, then create or join a ship.
  Dev menu token, for you only: $(cat "$TOKEN_FILE")
  The link works while this codespace is running. It stops after GitHub's idle timeout (30 min by default).

MSG
