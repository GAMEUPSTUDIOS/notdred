# notdred
a faithful modular, and easily moddable recreation of drednot.io or dredark.

**Current version:** notdred.io — v42 (ℵ30 build)

*Formerly "Freeport Shipyard".* An unofficial, fan-made recreation of drednot.io (Deep Space Airships) as it was in 2019; not affiliated with drednot.io.

Drednot-inspired construction sandbox with native C++ Box2D physics and an authoritative Node.js crew server.

## Build target: drednot.io ℵ30, 5 September 2019

The game recreates Deep Space Airships as it was when flux crystals were added. All build-specific rules live as data in `dist/modules/era.js`. Each value there is either cited (changelog, 2019 Help page, community wiki) or marked PLACEHOLDER.

**Zones and portals (2019 layout).** In 2019 Sparrow sat between the two Finch zones; that changed in ℵ47, September 2020.

```
Freeport I ── Finch I ──┐               ┌── Finch II ── Freeport II
                        └── Sparrow I ──┘
                              │
                         Freeport III
```

- Freeport I, II and III are safe zones with docks; weapons are disabled.
- Finch I keeps the original cave map exactly and has 20 red bots.
- Finch II has wider caves and 24 red bots.
- Sparrow I has the richest diamond-tile ore (3× Finch I, per the wiki), 8 red bots, 14 blue rammers (ℵ15 contact-damage bots) and 2 green bots (ℵ25).
- Combat-zone portals are placed from each zone's cave seed. The first one always sits on the entry cavern at (0,0).
- Fly onto a portal and press Q at the helm. As the 2019 Help page says, you arrive at a random position in the linked zone.

**Scheduled reset.** Every combat zone resets with a new layout every 3 hours (`ZONE_RESET_SECONDS` in `era.js`; 0 turns it off). The minimap shows the time remaining.

**Regeneration (ℵ25/ℵ25+).** Once 80% of a zone's rock is cleared, a 10-minute countdown appears on the minimap. When it ends, the zone rebuilds with a new seed.

**Flux (ℵ30).** Green bots drop flux crystals instead of the handheld pusher. Flux crafts the handheld pusher and the new stationary pusher. The stationary pusher is a 1×1 background machine: press R to aim its beam, and it drives cargo, boxes and players until the beam meets a solid tile.

**Still in this codebase but added to drednot.io after ℵ30.** These are listed in `era.js`:
- Fuel-burning placeable thrusters and fuel (ℵ35, November 2019)

**Missions (ℵ33): The Pits and Canary.**
- Every 45 minutes a mission zone opens for 20 minutes, alternating between The Pits and Canary, each time with a fresh layout.
- While a mission runs, a gold portal stands in every Freeport. When it closes, ships still inside are sent home to Freeport I.
- **The Pits** has full PvP, brown brick caves, red and blue bots, and 3 exits. It starts with 6 treasure blocks, and another appears every 5 minutes (ℵ25). Each treasure block drops one roll of `TREASURE_LOOT`.
- **Canary** has no PvP and few bots. It is all about mining: its rock has rich iron seams and flux seams.
- Dev menu (F2) → *Missions*:
  - **Spawn mission now** (pick the zone).
  - **End current mission**.
  - **Advance 5 min**: adds a treasure block.
- On a server, the zone bus runs one schedule for every ship.

**Critical ships.**
- With shields up, shots stop at the hull and drain shields.
- Once shields are down, shots phase through the hull (ℵ26) and hit the first tile in their path. Each hit takes `TILE_DAMAGE_FACTOR` × damage off that tile until it breaks; the next tile in line is hit after that. A path with nothing in it lets the shot fly out the other side.
- Hull tiles never break. A hit on the hull may instead shrink that side by one row (ℵ28), but never below 8×8 (ℵ32). Tiles in the cut strip break off as loot, and corner attachments slide inward.
- Starter thrusters, starter RCs, the starter hatch and the starter fabricator are never destroyed or ejected (ℵ26). They also block a shrink that would cut them off.
- Loose cargo near a hit is knocked about. Stacks right at the hit are blown out of the hull as loot, never deleted.
- A damaged block, tile or attachment darkens as it loses health and shows a health bar across its top: green, then yellow, then blinking red below 30%.

## Ammo (all ℵ30 types)

`AMMO` in `era.js` holds damage, speed, life and each type's special behaviour:

| Ammo | Damage | Behaviour |
|---|---|---|
| Standard | 100 | — |
| Scatter | 6 × 24 | Fan of pellets, short range |
| Flak | 35 | Shell bursts into 8 × 14 fragments |
| Sniper | 150 | Fast; ricochets off rock twice |
| Punch | 50 | Pushes the target |
| Yank | 50 | Pulls the target |
| Breaker | 200 | Mines any rock in one hit; crafts 1 |
| Trash | 100 | Decays in flight; free to craft; crafts 1 |

All except breaker and trash craft 4 rounds from 1 iron and 1 explosive.

Neither texture pack has the per-ammo icons. Until they are added, every ammo type uses the game's standard-ammo icon (`SPRITE_FILE` in `game.js`). To use a real icon, drop e.g. `sprites/sniper.png` in and remove its entry. Each type has its own projectile colour.

## Canary: tunneling mission (v34)
- Canary is one giant square of rock (65×65 tiles) with open space all round it, where ships arrive and the portals stand.
- The square holds iron, diamond turret ore and flux. There's only a little flux near the outside (about 1.5% of tiles); most of it is in the middle (about a third of the tiles there). Crews tunnel in for it.
- About 3% of the rock is dormant seekers, buried all through the square.
- **Seekers are smart.** Awake seekers near a ship hunt as a pack. The nearest one rams. The others work out the ship's escape route (the shortest way back out through the tunnels), go round to it and park there one behind another, leaning toward the ship. They are heavy, so a seeker in a tunnel is a plug you have to shoot out. In the open they surround the ship from different sides instead.
- **The mission ends after 3 hours, or as soon as 90% of the square is mined.** The mission bar shows progress (for example "42% / 90% mined") and the clock in h:mm:ss. No other mission starts while Canary is running.

## Turrets and bots (v27)
- v33: red raiders are much larger (radius 2.4 → 4.2). Green bots are huge (radius 3 → 7.5) with 5000 health, about 50 standard rounds. Bot bullets now leave from the bot's centre, so a big bot hugging a ship still hits it.

- **Turret reload.** Each RC turret has its own reload timer: RC turret 0.4 s, starter RC 0.7 s. Heavy ammo multiplies it (sniper ×2.2, breaker ×2, scatter ×1.6, flak ×1.4, punch/yank ×1.2, trash ×0.8). See `TURRETS` and `AMMO_RELOAD` in `era.js`.
- **Loading.** Clicking an RC with ammo in hand takes only what fits (up to 16) and leaves the rest in your hand. A full turret takes nothing.
- **Bots** have less HP:
  - red: 500 (5 standard rounds);
  - green: 700;
  - blue: 800.

  They fire their 3-shot volley one shot at a time, then wait 9 s (red) or 7 s (green). They hold fire for 4 s after you arrive in a zone.
- **Portals are bot-free.** Within 28 m of a portal:
  - bots never spawn, path or loiter there; any that drift in are pushed back out;
  - bots ignore a ship parked there, so arrivals can't be camped.

  These rules are in `BOT_RULES`.

## Multiplayer only (v31)
- There is no single-player mode, local save or local simulation. The main menu asks for a **server address** and an optional **token** (the host's `DEV_TOKEN`, for developer controls), plus your name.
  - When the page is opened from a notdred.io server, the address is filled in and it connects by itself.
- **Every ship on the server shows as a card**: yours in green, marked *Owned*, and other players' in blue, with crew count and zone. There is also a *New Ship* card. Use *Search* and *Owned* to filter. The list refreshes every few seconds.
- **Empty ships go home.** One minute after the last crew member leaves, the ship is returned to the Freeport tied to its zone. The menu card shows the countdown. The next time anyone joins, the ship is in that Freeport.
  - Zone to Freeport: Finch I → Freeport I, Finch II → Freeport II, Sparrow I → Freeport III, The Pits / Canary → Freeport I.
- **Critical ships are towed home.** When a ship goes critical in a combat zone, a one-minute countdown starts and shows in red for the crew. When it runs out, the ship is sent to its zone's Freeport. The countdown keeps running even if shields come back; leaving the zone through a portal clears it.
- Server setting: `SHIP_RETURN_MS` (default 60000).

## Shared worlds (v28)

Each zone has **one shared world** on the server (`server/zone-sim.cjs` running `server/zone-runtime.js`). It holds that zone's:
- rock and boulders;
- bots and their bullets;
- loose loot and all projectiles;
- **the hull of every ship in the zone**.

Ships collide with each other and shove each other, push the same boulders, fight the same bots, and pick up the same loot. Bots go for whichever ship is nearest.

Each ship's room (`server/room.cjs`) still simulates its interior and crew. Every tick it sends its zone its thrust, knockbacks and shots, and gets back its position, damage (shields, or tiles once critical), loot taken in by its hatches, and score for its kills and mining.

PvP rules, missions, regeneration and the 3-hour reset work as before, decided once per zone. A zone's world is created when the first ship arrives and dropped 2 minutes (`ZONE_IDLE_MS`) after the last one leaves; its loose loot goes with it.

## Team MOTD (v41)
- Each ship has a message of the day: plain text, up to 1000 characters, saved with the ship.
- It shows in a **Team MOTD** panel in the top-right corner (as in drednot): the title, a **Hide** button, and the message. The captain also gets an **Edit** button that turns the message into a text box with Save / Cancel. Other ranks only read it.
- The panel appears for everyone when they join (if there is a message) and again whenever the captain changes it. After Hide, the **MOTD** button (bottom right) brings it back. It is not part of Manage Ship.
- Classic mode has the same panel at the top of its side column.
- Line breaks are kept; other control characters are removed. It is always shown as text, never as HTML. Changes are written to the ship log.

## Reduced mode and Classic mode (v40)
Neither is ever switched on by itself; the page only offers them.
- **Reduced mode** (slow computers, newer browsers): draws at 60% resolution and 30 frames a second. When a computer looks slow (2 or fewer CPU cores, 2 GB or less memory, or an old operating system) a chooser appears before you start: *Reduced mode* or *Full graphics*. The choice is remembered, and a *Reduced mode* checkbox in the main menu switches it at any time.
- **Classic mode** (very old browsers, e.g. Internet Explorer 6 on Windows 2000): open `http://<server>:8080/classic`. Browsers too old for the game (no canvas or WebSockets, or any Internet Explorer) are asked before the page renders whether to go there.
  - The server runs a headless copy of the real game client for each classic player, draws its view, and sends it as JPEG pictures (about 10–16 KB each). **30 frames a second (v42):** each player's client runs in its own worker thread and draws on a steady 30 fps clock, so the game server's main loop is never slowed. The page asks for the next picture the moment one arrives and the server answers with its newest frame; the page is double-buffered so it never flickers, and shows its frame rate under the picture. If a busy server can't draw 30 a second, the worker slows itself down. Each classic player at 30 fps uses about half a CPU core on the server (`CLASSIC_FPS` changes the rate). Key presses and clicks are replayed into that client, so the controls are the same as the full game: WASD/arrows, Space, E, Q, R, 1–5, click to use/build/fire, right-click to dismantle. Enter opens chat.
  - The page around the picture is plain HTML: ship list, shields and zone, the five slots, crew, chat and a simple fabricator panel. It is written in ES3 JavaScript for IE6 (XMLHttpRequest via ActiveX, no JSON).
  - Picture sizes: small (480×300), medium (640×400) and large (800×500); zoom buttons for walking and flying.
  - Classic players share the same world, chat and ships as everyone else.
  - Needs the optional `canvas` package (installed by `npm install`; `scripts/codespace-start.sh` installs it if missing). Without it, classic mode says it is unavailable and everything else still works. Up to 8 classic players at once (`CLASSIC_MAX`).
  - **How to reach it from Windows 2000:** IE6 cannot use modern HTTPS, so it **cannot open the Codespace link**. Run the server on a computer on the same home network with `HOST=0.0.0.0 npm start`, then on the old PC open `http://<that computer's IP>:8080/classic`.

## Building permissions and doors (v39)
- **Every rank can build and dismantle tiles** (captain, crew and guests). Guests still cannot take the helm, use fabricators or machines, set hatches or use portals. Dismantling needs a wrench (crafted for 4 iron at a fabricator; only the captain spawns with one).
- **Doors** are built by the captain only. They're crafted for 4 iron at the starter or engineering fabricator and stand 1 wide × 2 tall, drawn with the original door frame and panel art.
  - The captain clicks a door (empty hand or wrench) to choose who may walk through: **Captain only** (blue panels), **Crew and captain** (yellow, the default) or **Everyone** (grey). Shift+click or right-click with a wrench dismantles it.
  - Anyone not allowed bumps into it like a wall; allowed players walk straight through, and the panels slide open as they come near. A promotion or demotion takes effect at once. Doors always stop loose items. The setting is saved with the ship.
- Fix: crew members after the first one used a square collision box that caught on the seams between floor tiles (they got stuck walking past the helm). Everyone now uses the same chamfered body.

## Manage Ship: crew control and log (v35)
- The **Manage Ship** button (bottom right) opens two tabs.
  - **Ship Settings**: the ship's name and the rename button (captain only, once per hour), export, and the current zone.
  - **Crew Control & Log**: the ship's log on the left, and a list of everyone who has ever been aboard on the right.
- **Log**: when the ship was loaded and saved (`[EMPTY SHIP] saved the ship.` when the last person leaves), who joined and left (with a timestamp), who took the helm, zone changes ("teleported the ship to Finch I"), empty ships sent home, rank changes and kicks. It keeps the last 300 entries and is saved with the ship.
- **Crew Control**: whether each person is online, a short account id (like `#5ouTVB`), their name, *Ship Owner*, what they are carrying (people aboard), total play time on this ship, and rank. Has search and refresh.
  - The captain can set anyone on the list to Crew or Guest, even when they are offline; it applies the next time they join. The captain can also kick people who are aboard.
- Spawn kit (v38): only the captain spawns with a wrench; crew and guests start empty-handed. The wrench leaves with the captain instead of being dropped aboard.
- Rank colours (v37): captain blue, crew yellow, guest grey — in chat, the log, the crew badge and the crew list.
- **Bans (v36):** the captain can ban anyone on the list, aboard or offline. A banned account is removed at once and cannot join the ship until the captain unbans it (Unban button on the same row). Bans are saved with the ship.
- **Vote kick (v36):** crew members get a *Vote kick (n/needed)* button on guests who are aboard. A guest is kicked when more than half of the crew and captain aboard have voted (with 3 aboard, 2 votes). Guests can't vote, crew can't be vote-kicked, and votes lapse after 90 seconds. A vote-kicked guest can't rejoin for 5 minutes. Votes and their result are announced to the ship and logged.

## Ranks and chat (v28)

- **Ranks:**
  - The ship's owner is **captain**.
  - Anyone else joins as a **guest** and can walk, carry, drop and chat. Guests cannot build, remove, rotate, pilot, man turrets, craft, configure machines or use portals.
  - The captain can make a player **crew** (everything except ranks, renaming and kicking) or back to guest, from the crew list at the top of the screen. Ranks are stored per player per ship, and the server checks every action.
- **Chat:** press **Enter**, type, then Enter to send (Esc cancels). Everyone in your zone, on every ship there, and your own crew wherever they are, sees it with your rank and ship name. Messages are plain text, up to 200 characters, at most one every 0.6 s.

## New 2019 content (v28)

- **Silica crystals** (came with flux in ℵ30) drop from Canary seekers.
  - One silica crafts two **glass blocks** (engineering fabricator).
  - Glass is icy: cargo slides across it and crew skid. Pusher beams pass through it.
  - Both pushers now need 2 silica as well as flux.
- **Canary seekers:** some rock tiles are dormant seekers (the sleeping-face tile). Shoot one and it wakes as a live bot that hunts the nearest ship. Killing it drops 4 silica. Seekers never respawn.
- **The Pits** (“Buried treasure”) is a pit, not caves:
  - A big hall walled with hazard stripes, where ships arrive and the portals and LOOT ↓ signs are.
  - Three separate holes below the hall, each under its own LOOT ↓ sign. They are walled off from each other and fan out as they rise, widening toward the hall.
  - Each hole has its own loot room at the bottom: diamond turret ore, green flux blocks, and rock where treasure blocks appear. Treasure blocks are dealt out to the three holes in turn, so every hole gets its share.
  - The holes are packed with round boulders of many sizes that settle under gravity.
  - Get boulders out with **yank** ammo, which drags a boulder toward the shooter. Shoot your way back up with **punch** ammo, which shoves boulders away. Ordinary rounds barely move them.
  - Hazard walls cannot be shot through or mined.
- **Silver bots** are shooters found only in Finch II and Sparrow I. They drop iron.
- **Turret ore** drops an RC, a burst or an auto turret with equal odds.
- **Burst and auto turrets.** They are fired through a **turret controller**, crafted at the machine fabricator for 8 iron.
  - The controller is a hull attachment: it goes in a hull wall like a turret, never inside the ship.
  - It works the burst/auto turrets **in its own wall**, up to 4 of them; more turrets on that wall need another controller. Each controller shows how many turrets it is working.
  - Stand next to it inside the ship and press E to man it; the mouse then aims those turrets.
  - A **burst turret** fires 4 rounds per click and holds 32.
  - An **auto turret** keeps firing while the button is held.
  - RC turrets are still fired from the helm.
  - Moving or pressing E again leaves the controller.

## Multiplayer responsiveness (v27)

- **Client-side prediction.** Your own player, and your ship while you pilot it, move the instant you press a key, using the same controller and physics as the server. The server's position then corrects small differences gently, and snaps only past 1.5 tiles (5 for ships). Measured through a proxy adding 100 ms each way: about 60–80 ms from key to movement, the same as with no delay. Before this it was about 180 ms even on the same machine.
- **Instant input.** Inputs are sent the moment a key changes, plus a 50 ms heartbeat. A ping every 2 s measures the round trip so other movement can be shown at its true present position.
- **20 snapshots a second** (was 10).
- **Ship mass is set on load.** Before, it was only updated when travelling or resizing, so a freshly loaded ship (and every client's copy of it) was lighter and handled differently.

## Ships: names, leaderboard

- A new ship with no name gets a random two-word name.
- To rename, click the ship name in the top-left panel. Renames are captain-only on a server and allowed once per hour (ℵ26).
- Press **/** for the leaderboard. Points come from:
  - rock, ore and treasure mined;
  - bot kills;
  - PvP damage;
  - entering missions.
- The server ranks every stored ship.

## Balance, shields and machines (v25)

All numbers are in `era.js`.

- **Damage.** Standard ammo deals 100 and punch ammo 50 plus knockback; each loaded RC shot makes 4 rounds. Rock takes damage/100 per hit. Damage to ship tiles is scaled by `TILE_DAMAGE_FACTOR`.
- **Bots.** Red bots fire 3-shot volleys every 7 s, green bots every 5 s, with a narrow 0.03 rad spread. Bots only fire when they can see you. Blue rammers do contact damage with their saw.
- **Projectiles.** Every round has a long tinted trail made from the pack's `thruster_gradient` and `gradient_circle` sprites.
- **Shields.** Ships have 1000 shield points plus 100 per expansion. Shields regenerate 15/s, starting 4 s after the last hit, and 12× faster in a Freeport. A shield booster takes 2 s to use and restores 500.
- **Fabricators (ℵ18).** There are five kinds:
  - **Starter:** basics.
  - **Engineering:** tools and ship parts.
  - **Machine:** loaders, pushers, hatches, ejectors.
  - **Munitions:** ammo, explosives, boosters.
  - **Legacy:** crafts every fabricator.

  The recipes for each kind are in `FABRICATORS`. A wrench returns the fabricator of the right kind.
- **Loaders.** A loader moves one stack every 1.5 s, from the tile behind its arrow to the tile in front; press R to rotate. Loading a turret takes 6 s. It takes from loose items or expando boxes. It delivers into a fabricator, box, turret or ejector, or onto the floor.
- **Machine settings.** Right-click a loader, stationary pusher or hatch for its menu:
  - **Item filter:** allow all, off, whitelist or blacklist.
  - **Loaders:** *Require output inventory* never drops items on the floor; the loader holds the stack until something can take it.
  - **Pushers:** switch between push and pull. A pull beam is purple and stops items just short of the pusher.
- **Pushers are solid.** Crew and cargo can't pass through a stationary pusher block.
- **Pusher beams have no length limit.** A beam passes through walkways, walkway wedges, glass, item nets, ladders and hatches. It drives every item, box and crew member in its path, and stops only at a solid tile (block, wedge, hull, fabricator, loader, another pusher).
- **Loaders are solid blocks**, like pushers: crew, cargo and pusher beams cannot pass through them. A loader sets each stack down on the tile it faces (no throwing). It loads fabricators only with ingredients their recipes use, and turrets only with ammo; anything else it holds until there is somewhere it can go.
- **Loader pickup hotbox.** The area just behind a loader's input face, a little larger than one tile, is its pickup zone. Items resting there, thrown against the loader or falling through it are taken. An empty loader checks every tick, so items in flight are caught; delivery still happens once per cycle.
- **Loaders reach through walkways.** When a walkway, walkway wedge or net is behind a loader, it also takes items lying on that tile or the tile beyond.
- **Safeguards** (`dist/modules/safeguards.js`, limits in `SAFETY`):
  - Speed caps for cargo (40 m/s) and crew (30 m/s).
  - Items wedged inside tiles are moved to the nearest open cell after 2 s.
  - NaN or broken bodies are repaired.
  - Loose stacks merge without loss above 220. Above 320 the oldest are ejected as world loot, never deleted.
  - Ships are limited to 48 pushers and 48 loaders.
  - The server watchdog (`LAG_MS`, default 8 ms per tick) merges and settles idle cargo on any ship that keeps running slow.
- **Rendering.** Zoom snaps to a whole number of screen pixels per tile, and the camera and ship origins snap to device pixels. Tiles therefore never show seams, shimmer or bleeding at any zoom or display scale.

## Art

**Original item icons.** Run `bash scripts/fetch-item-icons.sh` once from a machine with internet access (a Codespace works). It downloads the drednot.io item icons the game uses into `dist/sprites/item-*.png`:
- every ammo type;
- the RC, starter RC, burst and auto turret items and the turret controller;
- the ship shield booster (`repairkit.png`, its name before ℵ10);
- the repair tool.

The game uses them automatically. Any that are missing fall back to the build's own icons (`SPRITE_FILE` in `game.js`). Breaker ammo uses `ammo_slug.png` from your texture pack: slug replaced breaker in ℵ35 and inherited its icon.


The game uses only your art: the sprites from your original build, plus your texture pack (img-2) where the build had nothing. `docs/assets.json` records each file. Taken from img-2:

- flux crystals (`item/res_flux_crystals`)
- the handheld pusher icon (`item/pusher`)
- the placed stationary pusher (`pusher`)
- the blue rammer's saw ring (`bot_saw`)
- the fabricator type badges and item icons (`fab_t_*`, `item_fabricator_*`)
- the loader (`loader`, `loader_base`, `loader_hand`, `loader_arrow`)
- projectile trail and head (`thruster_gradient`, `gradient_circle`)

The handheld pusher icon is the image you sent.

No generated artwork is used.

## Play page on GitHub Pages
The game page (everything in `dist/`) can be served from GitHub Pages at `https://<owner>.github.io/<repo>/`, while the game server runs in a Codespace (or any machine). The `gh-pages` branch holds a copy of `dist/`.
- Share the Pages link with the server in it: `https://<owner>.github.io/<repo>/?server=<codespace>-8080.app.github.dev`. `scripts/codespace-start.sh` prints this exact link and lets the Pages site connect (it adds `https://<owner>.github.io` to `ALLOWED_ORIGINS`).
- Without `?server=`, the page uses the last server you connected to; the address box accepts a host name, an `https://` link or a `wss://…/play` address.
- Classic mode is not available from Pages (it needs the server); use the server's own address for it.
- GitHub Pages only publishes public repositories on a free account.

## Test server on GitHub (Codespaces)

Push this repo to GitHub, a private repo works. Then:

1. Open the repo and choose **Code → Codespaces → Create codespace on main**.
2. The first start builds everything, which takes a few minutes.
3. The terminal then prints a temporary link like `https://<name>-8080.app.github.dev` and your dev-menu token. Share the link with testers.

The link lives while the codespace runs and stops after GitHub's idle timeout (30 minutes by default; adjustable in your Codespaces settings). If the link asks testers to sign in to GitHub, set port 8080 to **Public** in the **PORTS** tab. The server log is at `/tmp/freeport.log`.

## Temporary public test link

To host on your own machine with a throwaway public address:

1. Install `cloudflared`:
   - macOS: `brew install cloudflared`
   - Windows: `winget install --id Cloudflare.cloudflared`
   - Linux: download it from Cloudflare's releases page.
2. Run `npm ci`, then `npm run build:native`.
3. Run `npm run host`.

It starts the server, opens a Cloudflare quick tunnel, and prints a link like `https://random-words.trycloudflare.com`. Testers open the link and choose **Connect**; the server address fills in automatically.

The link changes every run and stops when you press Ctrl+C. Anyone with the link can play, so share it only with testers. The dev-menu token printed alongside it is for you.

## Run multiplayer

Requires Node.js 22+, npm, and a C++17 compiler (Linux g++, macOS Xcode command-line tools; Windows: WSL).

```sh
npm ci
npm run build:native
npm start
```

Open http://localhost:8080, choose Connect, then Create multiplayer ship. Other clients select the same room. Up to eight players can crew one ship. On macOS, use `CXX=clang++ npm run build:native` if necessary.

The default server listens on loopback only. To accept LAN clients, start with `HOST=0.0.0.0 npm start`, then have them open your host's LAN address and port 8080. Use a TLS reverse proxy and appropriate origin configuration for an Internet deployment. `ALLOWED_ORIGINS` accepts comma-separated exact browser origins. `DEV_TOKEN` optionally enables authenticated test controls. Never put it in client source. `DATA_DIR` changes the default `data/` save folder.

## What this rewrite includes

- Native Box2D 2.4.1 C++ simulation, two physics substeps per 60 Hz tick; server-authoritative actions, inventories, damage and crafting.
- WebSocket crew protocol, independent players, shared ship, single pilot, snapshots and client interpolation.
- Shields absorb attacks. At zero shields the ship is critical; later attacks damage and destroy tiles. Destroyed equipment and its contents become exterior loot. Hull breaches can leak loose cargo.
- Twenty red bots and one green bot in Finch, random respawns, navigation/avoidance and spread attacks. Red bots use standard ammunition and drop explosives; the green bot fires punch ammunition and drops a pusher plus punch ammo.
- Rare, anonymous diamond turret ore; RC turret loot on destruction.
- Hull-mounted three-cell ejectors, corrected portrait proportions/orientation, fixed-pivot directional thruster nozzles.
- Right-click hatch menus with all/off/whitelist/blacklist policies, blocked-output checks and cooldowns.
- Base64/DEFLATE vector saves, validation, checksums, automatic persistence and import/export.

## Scope and outstanding work

This is a hybrid rewrite: the physics solver is C++, while gameplay rules remain modular JavaScript running on Node.js. It is not a full C++ gameplay port. Ships in the same zone share one world through the zone bus (see *Shared zones and PvP*). The hosted static site provides an offline Planck.js preview and a client connection panel; it does not host the native server. Run the downloadable server to use native multiplayer.

Flux crystals and both pushers use the original textures from the second texture pack (img-2). Neither pack has the original per-ammo icons, the ship-shield-booster icon, a projectile sprite or the repair-tool sprite. Only art already in the game is used in their place:
- ammo: the standard-ammo icon;
- shield booster: the build's `booster.png` (the eco-fuel can);
- projectiles: the pack's trail gradients;
- repair tool: `cursor_repair`.

The RC turret item now uses the build's own turret item icon (`turret-placed.png`), not the placed-turret drawing. `docs/assets.json` records the official filenames to replace; these are not claimed to be corrected official assets. The official image host refused downloads in the build environment. Other supplied assets remain their original owners' property; this is an unofficial prototype.

Importing ship saves is a sandbox feature, not a protected multiplayer economy. Sessions use locally stored random reconnect tokens, not accounts. This build has not been load-tested for public production hosting. Snapshots are deltas, and each ship's layout is sent once per change.

## Controls

A/D move, W/S lock onto ladders, Space jump/detach, E interact/helm, R rotate (or switch pusher mode), Q throw toward cursor, click pick up/use/build, right-click dismantle or configure a hatch, B inventory, F2 test menu. Ladders, helm and fabricators remain upright. Shift-click a turret ejects its ammunition. Item stacks cap at 16; leaving drops carried items. Save opens the compressed export/import panel.

## Source layout

- `native/physics.cpp`: N-API interface to native Box2D; persistent worlds and body synchronization.
- `server/native-physics.cjs`: native solver adapter.
- `server/server.cjs`: HTTP/WebSocket transport, rate limits, sessions, room lifecycle and disk saves.
- `server/room.cjs`, `room-runtime.js`: isolated authoritative room and crew action handling.
- `dist/modules/`: construction, cargo, machinery, combat, zones, character movement, hatches and save codec.
- `dist/game.js`: shared state and rendering; `interface.js`: lobby/dev interface; `network.js`: multiplayer client.
- `dist/modules/era.js`: the ℵ30 build definition: zones, portal graph, bot species, drops, recipes and regeneration rules.
- `tests/`: ℵ30 era suite (`era.cjs`), codec tests, and real two-client WebSocket integration tests; `test.cjs`: gameplay regression suite.

Run `npm test` after compiling native physics. `python3 scripts/package_source.py` rebuilds the downloadable source ZIP. Build binaries, installed dependencies and live save data are intentionally excluded.

## Dependencies

Box2D 2.4.1 (MIT), nlohmann/json 3.11.3 (MIT), Node.js N-API headers (Node.js license), Planck.js and fflate (MIT), ws (MIT). Bundled native licenses are in `native/vendor/`; npm dependencies include their licenses. Game image assets are not relicensed by this project.

### Thruster correction
Starter engines now rotate at their corner bearings. Downward thrust uses mirrored outward-facing nozzles, keeping the exhaust outside the cabin without telescoping struts.
