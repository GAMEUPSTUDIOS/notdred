#!/usr/bin/env bash
# notdred.io one-line setup for a brand-new Linux or macOS machine:
#
#   curl -fsSL https://gameupstudios.github.io/notdred/install.sh | bash
#
# Installs what's missing (git, a C++ compiler, Node.js 22, GitHub CLI), signs you in to GitHub once (the
# repository is private: a browser code login), downloads or updates the code in ~/notdred, builds it, and
# starts the server with a temporary public https link (Cloudflare quick tunnel, no account needed).
# Run the same command again later to update and restart. Options (environment variables):
#   NOTDRED_DIR=~/somewhere   where the code goes (default ~/notdred)
#   NOTDRED_LOCAL=1           no public link: serve on http://localhost:8080 only
#   DEV_TOKEN=secret          your dev-menu token (default: a random one, printed at start)
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
  grep -q 'NVM_DIR' "$HOME/.bashrc" 2>/dev/null || printf '\nexport NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"\n' >> "$HOME/.bashrc"
fi
say "Node.js $(node -v)"

# ---- 3. GitHub sign-in (the repository is private) -----------------------------------------------------------------
# Skipped when this machine can already read the repository (saved Git credentials, or an earlier run).
URL="https://github.com/$REPO.git"
can_read(){ GIT_TERMINAL_PROMPT=0 git ls-remote "$URL" HEAD > /dev/null 2>&1; }
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
if ! gh auth status > /dev/null 2>&1; then
  say "Sign in to GitHub (an account that can see $REPO). Copy the code it shows, press Enter, and approve it in the browser."
  gh auth login --hostname github.com --git-protocol https --web < "$TTY"
fi
gh auth setup-git > /dev/null 2>&1 || true
fi

# ---- 4. Code: download, or update an earlier download --------------------------------------------------------------
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" fetch origin && git -C "$DIR" reset --hard origin/main
else
  say "Downloading $REPO into $DIR"
  git clone "$URL" "$DIR" || die "couldn't download $REPO. Is this GitHub account allowed to see it?"
fi
cd "$DIR"

# ---- 5. Build ------------------------------------------------------------------------------------------------------
say "Installing packages and building the physics engine (a minute or two the first time)"
npm ci --no-audit --no-fund
npm run build:native

# ---- 6. Run --------------------------------------------------------------------------------------------------------
if [ "${NOTDRED_LOCAL:-0}" = 1 ]; then
  say "Starting the server on http://localhost:8080  (Ctrl+C stops it)"
  [ -n "${DEV_TOKEN:-}" ] || export DEV_TOKEN="$(node -e "console.log(require('crypto').randomBytes(9).toString('hex'))")"
  echo "    Dev menu token: $DEV_TOKEN"
  exec env PORT=8080 node server/server.cjs
fi
say "Starting the server with a temporary public link (Ctrl+C stops it; run this command again to update)"
exec npm run host
