#!/usr/bin/env bash
# notdred network helper (run as root by install.sh, then every 15 minutes by notdred-net.timer). It keeps three things
# right without you configuring anything:
#   1. the public name — your own hostname (NOTDRED_DOMAIN=name.ddns.net), or with NOTDRED_DOMAIN=auto a name made from
#      this server's public IP: 96-126-108-134.sslip.io (sslip.io answers any such name with that IP; no account);
#   2. Caddy's site for that name (HTTPS from Let's Encrypt, forwarding to the game on 127.0.0.1:8080; plain http only
#      for classic mode) — rewritten and reloaded when the name changes (a home IP that changed);
#   3. port forwarding on a home router (UPnP, via miniupnpc's upnpc): ports 80 and 443 to this machine, renewed each
#      run. On a VPS (the public IP is on this machine) there's no router and nothing to forward.
# When the router can't forward (UPnP off, or the provider shares one public IP among many homes — carrier-grade NAT),
# it says so in /run/notdred-net.status and the game service falls back to a Cloudflare quick tunnel link.
# Settings: /etc/notdred-net.env (DOMAIN=auto or a hostname).
set -u
CONF=/etc/notdred-net.env; STATUS=/run/notdred-net.status; CADDYFILE=/etc/caddy/Caddyfile
[ -r "$CONF" ] || { echo "no $CONF"; exit 0; }
# shellcheck disable=SC1090
. "$CONF"
say(){ printf '%s\n' "$*"; }
status=()
pub="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -4 -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
local_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++)if($i=="src"){print $(i+1);exit}}')"
private(){ case "$1" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*|169.254.*|"") return 0;; *) return 1;; esac; }

# ---- 2/3. Port forwarding (only behind a router) -------------------------------------------------------------------
reachable=1
if [ -n "$pub" ] && [ "$pub" != "$local_ip" ] && private "$local_ip"; then
  command -v upnpc > /dev/null 2>&1 || { apt-get install -y miniupnpc > /dev/null 2>&1 || true; }
  if command -v upnpc > /dev/null 2>&1; then
    wan="$(upnpc -s 2>/dev/null | awk -F'= ' '/ExternalIPAddress/{print $2}' | tr -d '\r ')"
    ok=1; for p in 80 443; do upnpc -e notdred -a "$local_ip" "$p" "$p" TCP 3600 > /dev/null 2>&1 || ok=0; done
    if [ "$ok" = 1 ] && [ -n "$wan" ] && ! private "$wan"; then status+=("router: ports 80 and 443 forwarded to $local_ip (UPnP, renewed every 15 minutes)")
    elif [ -n "$wan" ] && private "$wan"; then reachable=0; status+=("router: your provider shares one public IP among many homes (carrier-grade NAT, router WAN $wan) — ports can't be forwarded; using the Cloudflare link instead")
    else reachable=0; status+=("router: it didn't accept port forwarding (turn on UPnP in its settings, or forward ports 80 and 443 to $local_ip by hand); using the Cloudflare link meanwhile"); fi
  else reachable=0; status+=("router: couldn't install upnpc to ask it for port forwarding; using the Cloudflare link meanwhile"); fi
else status+=("network: this machine has the public IP itself (a VPS) — nothing to forward"); fi

# ---- 1/2. The name and Caddy's site --------------------------------------------------------------------------------
name="${DOMAIN:-}"
if [ "$name" = auto ]; then [ -n "$pub" ] && name="$(printf '%s' "$pub" | tr . -).sslip.io" || name=""; fi
if [ -n "$name" ] && command -v caddy > /dev/null 2>&1; then
  want="$(cat <<CADDY
$name {
	reverse_proxy 127.0.0.1:8080
}
http://$name {
	@classic path /classic /classic/*
	handle @classic {
		reverse_proxy 127.0.0.1:8080
	}
	handle {
		redir https://{host}{uri} permanent
	}
}
CADDY
)"
  if [ "$(cat "$CADDYFILE" 2>/dev/null)" != "$want" ]; then printf '%s\n' "$want" > "$CADDYFILE"; systemctl reload caddy 2>/dev/null || systemctl restart caddy; status+=("name: now $name (Caddy updated)"); fi
  dns="$(getent ahostsv4 "$name" 2>/dev/null | awk 'NR==1{print $1}')"
  [ -n "$pub" ] && [ "$dns" != "$pub" ] && status+=("name: $name points to ${dns:-nothing}, but this server's public IP is $pub — update the hostname's IP (No-IP: Dynamic DNS → Hostnames → Modify)")
fi
{ echo "NAME=$name"; echo "PUBLIC_IP=$pub"; echo "LOCAL_IP=$local_ip"; echo "REACHABLE=$reachable"; printf 'NOTE=%s\n' "${status[@]}"; } > "$STATUS"
# Unreachable from outside: a Cloudflare quick tunnel (notdred-tunnel.service) carries players in until it is.
if [ "$reachable" = 0 ]; then systemctl start notdred-tunnel 2>/dev/null; link="$(journalctl -u notdred-tunnel --since '-30 min' --no-pager -o cat 2>/dev/null | grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' | tail -1)"; [ -n "$link" ] && status+=("link meanwhile: $link") && echo "LINK=$link" >> "$STATUS"
else systemctl stop notdred-tunnel 2>/dev/null; fi
for s in "${status[@]}"; do say "    $s"; done
