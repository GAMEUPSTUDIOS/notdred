#!/usr/bin/env bash
# Prints the path of a working `cloudflared` (Cloudflare's open-source tunnel client), downloading the official
# release binary into ~/.local/bin the first time if it isn't installed. Used by the start scripts to open a
# temporary https://<random>.trycloudflare.com address (a "quick tunnel": no account, no configuration).
set -uo pipefail
if command -v cloudflared > /dev/null 2>&1; then command -v cloudflared; exit 0; fi
BIN="$HOME/.local/bin/cloudflared"
if [ -x "$BIN" ] && "$BIN" --version > /dev/null 2>&1; then echo "$BIN"; exit 0; fi
case "$(uname -m)" in x86_64|amd64) ARCH=amd64;; aarch64|arm64) ARCH=arm64;; armv7l|armv6l) ARCH=arm;; *) ARCH="";; esac
OS="$(uname -s)"
[ -n "$ARCH" ] || { echo "  cloudflared: unsupported CPU $(uname -m); install it yourself (https://github.com/cloudflare/cloudflared/releases)." >&2; exit 1; }
REL="https://github.com/cloudflare/cloudflared/releases/latest/download"
mkdir -p "$HOME/.local/bin"
echo "  Installing cloudflared (first run only)…" >&2
if [ "$OS" = "Linux" ]; then
  curl -fsSL --max-time 120 -o "$BIN.tmp" "$REL/cloudflared-linux-$ARCH" || { rm -f "$BIN.tmp"; echo "  cloudflared: download failed." >&2; exit 1; }
  chmod +x "$BIN.tmp" && mv "$BIN.tmp" "$BIN"
elif [ "$OS" = "Darwin" ]; then
  if command -v brew > /dev/null 2>&1 && brew install cloudflared > /dev/null 2>&1; then command -v cloudflared; exit 0; fi
  [ "$ARCH" = "arm" ] && { echo "  cloudflared: unsupported Mac." >&2; exit 1; }
  T="$(mktemp -d)"; curl -fsSL --max-time 120 -o "$T/c.tgz" "$REL/cloudflared-darwin-$ARCH.tgz" && tar -xzf "$T/c.tgz" -C "$T" && mv "$T/cloudflared" "$BIN" && chmod +x "$BIN"
  rm -rf "$T"
else
  echo "  cloudflared: install it for this system (Windows: winget install --id Cloudflare.cloudflared)." >&2; exit 1
fi
"$BIN" --version > /dev/null 2>&1 || { echo "  cloudflared: the downloaded program doesn't run here." >&2; exit 1; }
echo "$BIN"
