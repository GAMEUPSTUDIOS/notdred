#!/usr/bin/env bash
# notdred.io one-line setup for a Linux server or desktop (and macOS):
#
#   curl -fsSL https://raw.githubusercontent.com/GAMEUPSTUDIOS/notdred/main/dist/install.sh | bash
#
# Installs what's missing (git, a C++ compiler, Node.js 22), downloads or updates the code in ~/notdred, builds it
# (including the native C++ physics), and starts the server with a temporary public https link (Cloudflare quick
# tunnel, no account needed). Run the same command again later to update and restart.
# Options (environment variables, before "bash"):
#   NOTDRED_SERVICE=1         Linux servers/VPS: install it as a system service instead — starts at boot, restarts if it
#                             stops, updates itself every night at 04:30 — and print where to find the link and token
#   NOTDRED_DOMAIN=auto       no domain needed: a free name from this server's public IP (96-126-108-134.sslip.io),
#                             HTTPS, firewall, and port forwarding on a home router (UPnP) — all automatic
#   NOTDRED_DOMAIN=name.ddns.net  your own domain or No-IP hostname (pointed at this server): installs the service,
#                             Caddy with automatic HTTPS (Let's Encrypt) in front of it, and a firewall (SSH, 80,
#                             443 only; the game itself listens only inside the server). Debian/Ubuntu.
#   NOTDRED_LOCAL=1           no Cloudflare link: serve on port 8080 only (with NOTDRED_SERVICE: on every network
#                             interface, for a VPS you reach by its own address or put behind your own proxy)
#   NOTDRED_DIR=~/somewhere   where the code goes (default ~/notdred)
#   DEV_TOKEN=secret          your dev-menu token (default: a random one; the service keeps it in /etc/notdred.env)
#   GH_TOKEN=github_pat_…     only if the repository is private: a token that can read it
# This file holds no game code; it is safe to publish.
set -euo pipefail
REPO="${NOTDRED_REPO:-GAMEUPSTUDIOS/notdred}"
DIR="${NOTDRED_DIR:-$HOME/notdred}"
say(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31mSetup stopped:\033[0m %s\n' "$*" >&2; exit 1; }
have(){ command -v "$1" > /dev/null 2>&1; }
# Prompts (sudo password, GitHub login) read from the terminal even though this script arrives through a pipe.
TTY=/dev/tty; [ -r "$TTY" ] || TTY=/dev/stdin
SUDO=""; if [ "$(id -u)" != 0 ]; then have sudo && SUDO="sudo" || SUDO=""; fi
OS="$(uname -s)"

# ---- 1. System packages: git, curl, C++ compiler -------------------------------------------------------------------
say "Checking system tools (git, curl, C++ compiler)"
if [ "$OS" = Linux ]; then
  need=(); have git || need+=(git); have curl || need+=(curl); have g++ || need+=(g++); have make || need+=(make)
  if [ ${#need[@]} -gt 0 ]; then
    if have apt-get; then $SUDO apt-get update -y < "$TTY" && $SUDO apt-get install -y git curl build-essential ca-certificates < "$TTY"
    elif have dnf; then $SUDO dnf install -y git curl gcc-c++ make < "$TTY"
    elif have yum; then $SUDO yum install -y git curl gcc-c++ make < "$TTY"
    elif have pacman; then $SUDO pacman -Sy --noconfirm git curl base-devel < "$TTY"
    elif have zypper; then $SUDO zypper install -y git curl gcc-c++ make < "$TTY"
    elif have apk; then $SUDO apk add git curl g++ make bash < "$TTY"
    else die "install git, curl, g++ and make with your package manager, then run this again."; fi
  fi
elif [ "$OS" = Darwin ]; then
  if ! xcode-select -p > /dev/null 2>&1; then
    xcode-select --install || true
    die "macOS is installing its developer tools (a window opened). When that finishes, run this command again."
  fi
else
  die "this script is for Linux and macOS. On Windows, install WSL (wsl --install) and run it inside Ubuntu."
fi

# ---- 2. Node.js 22 (through nvm, in your home folder; no system changes) ------------------------------------------
node_ok(){ have node && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ]; }
if ! node_ok; then
  say "Installing Node.js 22 (nvm, in ~/.nvm)"
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | PROFILE=/dev/null bash
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"; nvm install 22 > /dev/null; nvm alias default 22 > /dev/null; nvm use 22 > /dev/null
  node_ok || die "Node.js 22 did not install."
  # bash, and zsh (macOS Terminal's default shell), so node/npm work in new Terminal windows too.
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do grep -q 'NVM_DIR' "$rc" 2>/dev/null || printf '\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' >> "$rc"; done
fi
say "Node.js $(node -v)"

# ---- 3. GitHub sign-in (only when the repository is private) ---------------------------------------------------------
# Skipped when this machine can already read the repository (it's public, saved Git credentials, or an earlier run).
URL="https://github.com/$REPO.git"
can_read(){ GIT_TERMINAL_PROMPT=0 git ${AUTH[@]+"${AUTH[@]}"} ls-remote "$URL" HEAD > /dev/null 2>&1; }
# A GitHub token in GH_TOKEN (a fine-grained one with read-only Contents access to the repository is enough) is used
# directly by git, so no GitHub CLI or Homebrew is needed. It's saved only in the downloaded folder's .git/config.
AUTH=()
if [ -n "${GH_TOKEN:-}" ]; then B64="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"; AUTH=(-c "http.https://github.com/.extraheader=AUTHORIZATION: basic $B64"); fi
if [ -d "$DIR/.git" ] || can_read; then :; else
if ! have gh; then
  say "Installing the GitHub CLI"
  if [ "$OS" = Darwin ]; then
    have brew || die "install Homebrew (https://brew.sh), then run this again (it's used for the GitHub CLI)."
    brew install gh
  elif have apt-get; then
    $SUDO mkdir -p -m 755 /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | $SUDO tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
    $SUDO chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | $SUDO tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    $SUDO apt-get update -y < "$TTY" && $SUDO apt-get install -y gh < "$TTY"
  elif have dnf; then $SUDO dnf install -y gh < "$TTY"
  elif have pacman; then $SUDO pacman -Sy --noconfirm github-cli < "$TTY"
  elif have zypper; then $SUDO zypper install -y gh < "$TTY"
  elif have apk; then $SUDO apk add github-cli < "$TTY"
  else die "install the GitHub CLI (https://cli.github.com), then run this again."; fi
fi
# A token handed over from Windows (install.ps1) becomes this machine's saved GitHub login.
if [ -n "${GH_TOKEN:-}" ] && ! env -u GH_TOKEN gh auth status > /dev/null 2>&1; then printf '%s' "$GH_TOKEN" | env -u GH_TOKEN gh auth login --hostname github.com --git-protocol https --with-token > /dev/null 2>&1 || true; fi
if ! gh auth status > /dev/null 2>&1; then
  say "Sign in to GitHub (an account that can see $REPO). Copy the code it shows, press Enter, and approve it in the browser."
  gh auth login --hostname github.com --git-protocol https --web < "$TTY"
fi
gh auth setup-git > /dev/null 2>&1 || true
fi

# ---- 4. Code: download, or update an earlier download --------------------------------------------------------------
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  [ -n "${B64:-}" ] && git -C "$DIR" config http.https://github.com/.extraheader "AUTHORIZATION: basic $B64"
  git -C "$DIR" fetch origin && git -C "$DIR" reset --hard origin/main
else
  say "Downloading $REPO into $DIR"
  git ${AUTH[@]+"${AUTH[@]}"} clone "$URL" "$DIR" || die "couldn't download $REPO. Is this GitHub account allowed to see it?"
  [ -n "${B64:-}" ] && git -C "$DIR" config http.https://github.com/.extraheader "AUTHORIZATION: basic $B64"
fi
cd "$DIR"

# ---- 5. Build ------------------------------------------------------------------------------------------------------
say "Installing packages and building the physics engine (a minute or two the first time)"
npm ci --no-audit --no-fund
npm run build:native

# ---- 6. Run --------------------------------------------------------------------------------------------------------
# As a system service (Linux with systemd): notdred.service runs the game (with the public link unless NOTDRED_LOCAL=1)
# and restarts it if it stops; notdred-update.timer pulls, rebuilds and restarts it every night.
DOMAIN="${NOTDRED_DOMAIN:-}"
if [ -n "$DOMAIN" ]; then
  [ "$DOMAIN" = auto ] || printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$' || die "NOTDRED_DOMAIN should be a hostname like yourname.ddns.net, or auto"
  NOTDRED_SERVICE=1; NOTDRED_LOCAL=1; HOST_ONLY=1
fi
if [ "${NOTDRED_SERVICE:-0}" = 1 ]; then
  [ "$OS" = Linux ] && have systemctl || die "NOTDRED_SERVICE=1 needs Linux with systemd."
  # Small servers (1 GB): a swap file so installing and building never runs out of memory.
  if [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 1800 ] && [ "$(awk 'NR>1' /proc/swaps | wc -l)" = 0 ]; then
    say "Adding 1 GB of swap (this server has little memory)"
    $SUDO fallocate -l 1G /swapfile 2>/dev/null || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
    $SUDO chmod 600 /swapfile && $SUDO mkswap /swapfile > /dev/null && $SUDO swapon /swapfile && (grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab > /dev/null)
  fi
  NODE="$(command -v node)"; NODEBIN="$(dirname "$NODE")"; ME="$(id -un)"
  if [ ! -f /etc/notdred.env ]; then
    T="${DEV_TOKEN:-$(node -e "console.log(require('crypto').randomBytes(12).toString('hex'))")}"
    printf 'DEV_TOKEN=%s\nPORT=8080\nDATA_DIR=%s/data\n' "$T" "$DIR" | $SUDO tee /etc/notdred.env > /dev/null; $SUDO chmod 600 /etc/notdred.env
  fi
  if [ -n "${HOST_ONLY:-}" ]; then RUN="$NODE server/server.cjs"; EXTRA="Environment=HOST=127.0.0.1"
  elif [ "${NOTDRED_LOCAL:-0}" = 1 ]; then RUN="$NODE server/server.cjs"; EXTRA="Environment=HOST=0.0.0.0"; else RUN="$NODE scripts/temp-host.cjs"; EXTRA=""; fi
  $SUDO tee /etc/systemd/system/notdred.service > /dev/null <<UNIT
[Unit]
Description=notdred.io game server
After=network-online.target
Wants=network-online.target
[Service]
User=$ME
WorkingDirectory=$DIR
EnvironmentFile=/etc/notdred.env
Environment=PATH=$NODEBIN:/usr/local/bin:/usr/bin:/bin
$EXTRA
ExecStart=$RUN
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
  $SUDO tee /etc/systemd/system/notdred-update.service > /dev/null <<UNIT
[Unit]
Description=Update notdred.io (pull, rebuild, restart)
[Service]
Type=oneshot
User=$ME
WorkingDirectory=$DIR
Environment=PATH=$NODEBIN:/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/sh -c 'git fetch origin && git reset --hard origin/main && npm ci --no-audit --no-fund && npm run build:native'
ExecStartPost=+/bin/systemctl restart notdred
UNIT
  $SUDO tee /etc/systemd/system/notdred-update.timer > /dev/null <<UNIT
[Unit]
Description=Update notdred.io every night
[Timer]
OnCalendar=*-*-* 04:30
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now notdred-update.timer > /dev/null
  $SUDO systemctl enable notdred > /dev/null; $SUDO systemctl restart notdred
  if [ -n "$DOMAIN" ]; then
    # ---- Caddy: HTTPS for your hostname (Let's Encrypt, renewed automatically), forwarding to the game on 127.0.0.1.
    have apt-get || die "NOTDRED_DOMAIN sets up Caddy with apt (Debian/Ubuntu). On other systems install Caddy and point it at 127.0.0.1:8080."
    if ! have caddy; then
      say "Installing Caddy (HTTPS web server)"
      $SUDO apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg < "$TTY" > /dev/null
      curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | $SUDO gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
      $SUDO apt-get update -y < "$TTY" > /dev/null && $SUDO apt-get install -y caddy < "$TTY" > /dev/null
    fi
    $SUDO systemctl enable caddy > /dev/null 2>&1
    # Firewall: SSH, http, https — nothing else (the game's port 8080 isn't reachable from outside).
    if have ufw || $SUDO apt-get install -y ufw < "$TTY" > /dev/null; then
      $SUDO ufw allow OpenSSH > /dev/null 2>&1 || $SUDO ufw allow 22/tcp > /dev/null; SSHP="$(printf '%s' "${SSH_CONNECTION:-}" | awk '{print $4}')"; [ -n "$SSHP" ] && $SUDO ufw allow "$SSHP/tcp" > /dev/null; $SUDO ufw allow 80/tcp > /dev/null; $SUDO ufw allow 443/tcp > /dev/null; $SUDO ufw --force enable > /dev/null
    fi
    # The network helper (scripts/net-setup.sh): the name (auto → <your-ip>.sslip.io), Caddy's site, and port forwarding
    # on a home router (UPnP) — now and every 15 minutes. If the router can't forward, a Cloudflare quick tunnel
    # (notdred-tunnel.service) carries players in meanwhile.
    printf 'DOMAIN=%s\n' "$DOMAIN" | $SUDO tee /etc/notdred-net.env > /dev/null
    $SUDO grep -q '^ALLOWED_ORIGINS=' /etc/notdred.env || echo 'ALLOWED_ORIGINS=https://*.trycloudflare.com' | $SUDO tee -a /etc/notdred.env > /dev/null
    $SUDO tee /etc/systemd/system/notdred-tunnel.service > /dev/null <<UNIT
[Unit]
Description=notdred.io fallback public link (Cloudflare quick tunnel) while ports can't be forwarded
After=network-online.target notdred.service
[Service]
User=$ME
Environment=PATH=$NODEBIN:/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/sh -c 'exec "\$\$(bash $DIR/scripts/cloudflared.sh)" tunnel --no-autoupdate --url http://127.0.0.1:8080'
Restart=always
RestartSec=5
UNIT
    $SUDO tee /etc/systemd/system/notdred-net.service > /dev/null <<UNIT
[Unit]
Description=notdred.io network: public name, Caddy site, router port forwarding
After=network-online.target caddy.service
[Service]
Type=oneshot
ExecStart=/bin/bash $DIR/scripts/net-setup.sh
UNIT
    $SUDO tee /etc/systemd/system/notdred-net.timer > /dev/null <<UNIT
[Unit]
Description=Keep notdred.io's name, HTTPS site and port forwarding current
[Timer]
OnBootSec=30s
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
UNIT
    $SUDO systemctl daemon-reload; $SUDO systemctl restart notdred
    say "Setting up the name, HTTPS and port forwarding"
    $SUDO bash "$DIR/scripts/net-setup.sh"
    $SUDO systemctl enable --now notdred-net.timer > /dev/null
    NAME="$($SUDO sed -n 's/^NAME=//p' /run/notdred-net.status 2>/dev/null)"; LINK="$($SUDO sed -n 's/^LINK=//p' /run/notdred-net.status 2>/dev/null)"
  fi
  say "notdred is running as a service (starts at boot, restarts if it stops, updates nightly at 04:30)"
  echo "    Dev menu token:  $($SUDO sed -n 's/^DEV_TOKEN=//p' /etc/notdred.env)"
  if [ -n "$DOMAIN" ]; then
    echo "    Play at:         https://${NAME:-$DOMAIN}        (old computers, classic mode: http://${NAME:-$DOMAIN}/classic)"
    [ -n "${LINK:-}" ] && echo "    Until ports are forwarded, also: $LINK"
    echo "    Firewall:        open ports are 22 (SSH), 80 and 443; the game listens only on 127.0.0.1:8080"
    echo "    HTTPS starts a minute or two after the name points here (check: sudo journalctl -u caddy -f)."
    echo "    Network status:  cat /run/notdred-net.status      (name, IP, port forwarding; refreshed every 15 minutes)"
  elif [ "${NOTDRED_LOCAL:-0}" = 1 ]; then echo "    Play at:         http://<this server's address>:8080   (open port 8080 in the firewall)"
  else
    printf '    Public link:     waiting for Cloudflare'; L=""; for i in $(seq 1 45); do L="$($SUDO journalctl -u notdred --since '-3 min' --no-pager -o cat 2>/dev/null | grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' | tail -1 || true)"; [ -n "$L" ] && break; printf '.'; sleep 2; done; echo
    echo "    Public link:     ${L:-not yet — run: sudo journalctl -u notdred | grep trycloudflare}"
    echo "    (The link changes when the service restarts; for a permanent address use your own domain with a named Cloudflare tunnel.)"
  fi
  echo "    Logs:            sudo journalctl -u notdred -f      Stop: sudo systemctl stop notdred      Update now: sudo systemctl start notdred-update"
  exit 0
fi
if [ "${NOTDRED_LOCAL:-0}" = 1 ]; then
  say "Starting the server on http://localhost:8080  (Ctrl+C stops it)"
  [ -n "${DEV_TOKEN:-}" ] || export DEV_TOKEN="$(node -e "console.log(require('crypto').randomBytes(9).toString('hex'))")"
  echo "    Dev menu token: $DEV_TOKEN"
  exec env PORT=8080 node server/server.cjs
fi
say "Starting the server with a temporary public link (Ctrl+C stops it; run this command again to update)"
exec npm run host
