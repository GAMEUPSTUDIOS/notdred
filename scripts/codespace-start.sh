#!/usr/bin/env bash
# Runs inside a GitHub Codespace each time it starts: opens a temporary Cloudflare address
# (https://<random>.trycloudflare.com, no account needed), launches the game server in the background, makes
# port 8080 public as a fallback, and prints the links testers can open. Logs: /tmp/freeport.log, /tmp/freeport-tunnel.log
# NO_TUNNEL=1 bash scripts/codespace-start.sh   skips the Cloudflare address (GitHub's forwarded address only).
set -uo pipefail
cd "$(dirname "$0")/.."
URL="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
# The repository's GitHub Pages site (https://<owner>.github.io/<repo>/) may also connect to this server.
OWNER="${GITHUB_REPOSITORY%%/*}";REPO="${GITHUB_REPOSITORY#*/}"
PAGES_ORIGIN="https://$(echo "${OWNER:-none}" | tr '[:upper:]' '[:lower:]').github.io"
PAGES_LINK="$PAGES_ORIGIN/${REPO}/?server=${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
# Keep one dev-menu token per codespace so it survives restarts.
TOKEN_FILE="$HOME/.freeport-dev-token"
[ -s "$TOKEN_FILE" ] || node -e "console.log(require('crypto').randomBytes(9).toString('hex'))" > "$TOKEN_FILE"
pkill -f "node server/server.cjs" 2>/dev/null || true
# Temporary Cloudflare address: opened first so the server can be told to accept players arriving through it.
TUNNEL_URL=""
if [ "${NO_TUNNEL:-0}" != "1" ]; then
  pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8080" 2>/dev/null || true
  if CF="$(bash scripts/cloudflared.sh)"; then
    : > /tmp/freeport-tunnel.log
    nohup "$CF" tunnel --no-autoupdate --url http://127.0.0.1:8080 > /tmp/freeport-tunnel.log 2>&1 &
    CFPID=$!
    for _ in $(seq 1 150); do kill -0 "$CFPID" 2>/dev/null || break; TUNNEL_URL="$(grep -oE 'https://[-a-z0-9]+\.trycloudflare\.com' /tmp/freeport-tunnel.log | grep -v '^https://api\.' | head -1)"; [ -n "$TUNNEL_URL" ] && break; sleep 0.2; done
    [ -n "$TUNNEL_URL" ] || echo "  Couldn't get a Cloudflare address (see /tmp/freeport-tunnel.log); using GitHub's address only."
  fi
fi
# The page is served from the forwarded address, so that is the only browser origin the server accepts.
# New packages since the last update (e.g. canvas for classic mode) are installed automatically.
node -e "require('ws');require('fflate');require('canvas')" 2>/dev/null || npm install --no-audit --no-fund || true
HOST=0.0.0.0 PORT=8080 ALLOWED_ORIGINS="$URL,$PAGES_ORIGIN${TUNNEL_URL:+,$TUNNEL_URL}" DEV_TOKEN="$(cat "$TOKEN_FILE")" nohup node server/server.cjs > /tmp/freeport.log 2>&1 &
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
if [ -n "$TUNNEL_URL" ]; then cat <<MSG

  notdred.io is running. Temporary link (share this):  $TUNNEL_URL
  GitHub Pages link (if Pages is on):  $PAGES_ORIGIN/${REPO}/?server=${TUNNEL_URL#https://}
  Also reachable through GitHub's address:  $URL
  Testers: open the link, choose Connect, then create or join a ship.
  Dev menu token, for you only: $(cat "$TOKEN_FILE")
  The links work while this codespace is running (GitHub stops idle codespaces after 30 min by default).
  The Cloudflare address changes every time this script runs.

MSG
exit 0; fi
cat <<MSG

  notdred.io is running (temporary):  $URL
  GitHub Pages link (if Pages is on):  $PAGES_LINK
  Testers: open the link, choose Connect, then create or join a ship.
  Dev menu token, for you only: $(cat "$TOKEN_FILE")
  The link works while this codespace is running. It stops after GitHub's idle timeout (30 min by default).

MSG
