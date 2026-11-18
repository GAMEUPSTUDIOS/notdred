'use strict';
/*
 * Build definition: which version of drednot.io (then "Deep Space Airships") this clone targets.
 *
 * TARGET: Version ℵ30, 5 Sept 2019 — the update that added flux crystals.
 *
 * Sources (all on drednot.io/changelog.html unless noted):
 *   ℵ15 (6 May 2019)   added zone "Sparrow" with new contact-damage bot variants, and a new Freeport.
 *   ℵ25 (1 Aug 2019)   two green bots in Sparrow at a time; zones regenerate after most rock is gone,
 *                      with a visible 10-minute countdown and a new seed every time.
 *   ℵ25+ (2 Aug 2019)  regeneration threshold lowered to 80% clear.
 *   ℵ30 (5 Sep 2019)   flux crystals added; they replace the hand-pusher drop from green bots.
 *                      Stationary pushers added; hand-held pushers become craftable — both use flux.
 *   ℵ47 (8 Sep 2020)   "the zone network was changed so that Sparrow does not sit between both Finch
 *                      zones" — so in 2019 it did.
 *   Help page (2019-era text): "fly over [a portal] and press Q. You will be teleported to a random
 *                      position in the linked zone."
 *   Community wiki: Finch II portals lead to Sparrow I and Freeport II; Freeport III is linked to
 *                      Sparrow; Finch I has diamond tiles at 1/3 of Sparrow's rate.
 *
 * Anything marked PLACEHOLDER has no published 2019 number. It is here so the zone plays; tune freely.
 * Everything in this file is data: game code asks zoneDef(zone) instead of comparing zone names.
 */
const BUILD = {id: 'aleph30', label: 'ℵ30', date: '2019-09-05'};

// New ships start in Freeport I. (The wiki says brand-new ships were sent straight to Finch I;
// set START_ZONE = 'finch' to reproduce that.)
const START_ZONE = 'freeport';

// 'random' follows the 2019 Help page. 'entry' puts the ship on the zone's first portal instead.
const PORTAL_ARRIVAL = 'random';
const PORTAL_RANGE = 12;

// Combat-zone portals are placed by the generator from the zone seed (portalsTo, in order).
// The first one always sits on the entry cavern at (0,0). Safe zones list fixed positions.
const ZONES = {
  freeport: {id: 'freeport', name: 'Freeport I', kind: 'safe', pvp: null, half: {w: 100, h: 56},
    blurb: 'Safe Zone. Weapons Disabled.', bg: '#4b4b4b', shotGravity: 0, bots: {},
    portals: [{to: 'finch', x: 0, y: -28}]},
  freeport2: {id: 'freeport2', name: 'Freeport II', kind: 'safe', pvp: null, half: {w: 100, h: 56},
    blurb: 'Safe Zone. Weapons Disabled.', bg: '#4b4b4b', shotGravity: 0, bots: {},
    portals: [{to: 'finch2', x: 0, y: -28}]},
  freeport3: {id: 'freeport3', name: 'Freeport III', kind: 'safe', pvp: null, half: {w: 100, h: 56},
    blurb: 'Safe Zone. Weapons Disabled.', bg: '#4b4b4b', shotGravity: 0, bots: {},
    portals: [{to: 'sparrow', x: 0, y: -28}]},
  finch: {id: 'finch', name: 'Finch I', kind: 'combat', pvp: null,
    blurb: 'Red bots · mining caves', bg: '#447477', shotGravity: 10,
    // width/height/threshold/salt 117/67/.59/0 reproduce the original single Finch map exactly.
    gen: {width: 117, height: 67, threshold: .59, salt: 0, oreChance: .03},
    bots: {red: 20}, portalsTo: ['freeport', 'sparrow']},
  finch2: {id: 'finch2', name: 'Finch II', kind: 'combat', pvp: {sizeFull: 110, sizeZero: 220},
    blurb: 'Red bots · wider caves', bg: '#3f6676', shotGravity: 10,
    gen: {width: 125, height: 71, threshold: .57, salt: 7919, oreChance: .03},   // PLACEHOLDER size/ore
    bots: {red: 24, silver: 6}, portalsTo: ['freeport2', 'sparrow']},                         // PLACEHOLDER count
  sparrow: {id: 'sparrow', name: 'Sparrow I', kind: 'combat', pvp: {},
    blurb: 'DANGER · blue rammers · green flux bots', bg: '#5b4d5f', shotGravity: 10,
    gen: {width: 133, height: 77, threshold: .565, salt: 15485863, oreChance: .09}, // 3× Finch I ore (wiki)
    bots: {red: 8, silver: 4, blue: 14, green: 2}, portalsTo: ['finch', 'finch2', 'freeport3']}, // green: 2 (ℵ25)
  // Mission zones (ℵ33, 8 Oct 2019: "a mission system which starts a new mission zone every 45 minutes",
  // "converted the pits to a mission zone", "added Canary, a mission zone dedicated to mining"). They are only
  // reachable while their mission runs: a gold portal opens in every Freeport. The Pits keep their ℵ25
  // treasure rule (a new treasure block every 5 minutes) and ℵ32's extra portals. Sizes/bots are PLACEHOLDERS.
  pits: {id: 'pits', name: 'The Pits', kind: 'combat', mission: true, pvp: {},
    blurb: 'MISSION · Buried treasure · dig through the boulders · full PvP', bg: '#3a2c27', shotGravity: 10, tiles: 'pits', arrival: 'entry',
    // A pit, not caves: a hazard-walled hall over three boulder-choked holes that fan out from the buried treasure.
    // Yank ammo pulls boulders out of the holes; punch shoves them away so you can shoot your way back up.
    gen: {layout: 'pit', width: 61, height: 75, salt: 271828, oreChance: 0, treasure: 4, boulderRadius: [3.5, 9.5]},
    bots: {red: 6, blue: 6}, portalsTo: ['freeport', 'freeport2', 'freeport3']},
  // Canary: a tunneling mission. One giant square of rock (iron, turret ore, flux) with open space around it; flux
  // is rare at the edges and densest in the middle. Full of dormant seekers. Ends after 3 hours or once 90% is mined.
  canary: {id: 'canary', name: 'Canary', kind: 'combat', mission: true, pvp: null, missionSeconds: 3 * 60 * 60, clearToEnd: .9,
    blurb: 'MISSION · tunneling · flux is richest in the middle · beware seekers', bg: '#3d5560', shotGravity: 10, tiles: 'canary',
    gen: {layout: 'block', width: 85, height: 85, ring: 8, salt: 314159, oreChance: 0, iron: .16, turretOre: .025, fluxEdge: .015, fluxCore: .6, coreRadius: .5, seekerChance: .03},
    bots: {red: 4}, portalsTo: ['freeport', 'freeport2', 'freeport3']}
};
// Where a ship goes when it is sent home: the Freeport tied to the zone it was in (Finch I → Freeport I,
// Finch II → Freeport II, Sparrow I → Freeport III; missions → Freeport I). Freeports map to themselves.
const HOME_FREEPORT = {freeport: 'freeport', freeport2: 'freeport2', freeport3: 'freeport3', finch: 'freeport', finch2: 'freeport2', sparrow: 'freeport3', pits: 'freeport', canary: 'freeport'};
// An empty ship (nobody aboard) and a critical ship (shields at 0) are both sent home after this long.
const RETURN_SECONDS = 60;
// Mission schedule. Every intervalSeconds the next zone in `rotation` opens for durationSeconds, with a fresh
// seed. Ships still inside when it closes are sent home to Freeport I. durationSeconds is a PLACEHOLDER.
const MISSIONS = {intervalSeconds: 45 * 60, durationSeconds: 20 * 60, rotation: ['pits', 'canary'], treasureEverySeconds: 300};
// Treasure blocks (The Pits): one roll from this table per block, plus extra score.
const TREASURE_LOOT = [['flux', 8], ['turret', 1], ['booster', 6], ['explosives', 16], ['sniper', 16], ['breaker', 8], ['iron', 16]];

// PvP (ships sharing a zone can shoot each other with RC turrets):
//   pvp: null                    no ship-to-ship damage — only bots can hurt ships (safe zones, Finch I).
//   pvp: {}                      full damage for every ship (Sparrow I).
//   pvp: {sizeFull, sizeZero}    damage scales with the SHOOTER's hull size in tiles, (w+1)×(h+1):
//                                full up to sizeFull, falling linearly to nothing at sizeZero (Finch II —
//                                only small ships can effectively fight; the 2019 "combat rating" idea).
//   The starter ship is 11×8 = 88 tiles; the largest legal hull is 29×21 = 609. Thresholds are PLACEHOLDERS.
// Every ammo type in the game at ℵ30 (slug replaced breaker later, ℵ35; healing came in 2020).
// Sources (changelog): sniper "same as standard" (ℵ14) then 150/shot (ℵ28++) → standard ≈ 100; breaker
// "twice standard" damage, faster, cheaper, and still destroys blocks in one hit (ℵ14, ℵ25); scatter −20% with
// less spread and flak −30% (ℵ26); trash "same damage as standard" (ℵ10) but decays over time (wiki), is free
// and capped at 50 stacks (ℵ13); punch/yank apply a fixed velocity (ℵ7) — 50 here for this easier build
// (ℵ33 later halved them anyway). Sniper bounces off rock (wiki: "very bouncy"). Unlisted numbers: PLACEHOLDER.
//   pellets/spread: one round fires this many projectiles in a fan (scatter).
//   burst: {after, count, damage, spread} — flak splits mid-flight into fragments.
//   decay: damage falls linearly to `decay` × damage at the end of the round's life (trash).
//   bounces: ricochets off rock (sniper).  rockBreaker: mines a rock tile in one hit (breaker).
//   impulse: + pushes the target away (punch), − pulls it toward the shooter (yank).
const AMMO = {
  ammo:    {name: 'Standard ammo', damage: 100, speed: 90,  life: 2,   trail: '#ffe08a', head: '#fff7c4'},
  scatter: {name: 'Scatter ammo',  damage: 24,  speed: 80,  life: .75, pellets: 6, spread: .2, trail: '#ffb36b', head: '#ffe2c4'},
  flak:    {name: 'Flak ammo',     damage: 35,  speed: 70,  life: 1.6, burst: {after: .45, count: 8, damage: 14, spread: 1.1, speed: 55, life: .5}, trail: '#c8c8c8', head: '#ffffff'},
  sniper:  {name: 'Sniper ammo',   damage: 150, speed: 140, life: 2.4, bounces: 2, trail: '#9fe8ff', head: '#e8fbff'},
  punch:   {name: 'Punch ammo',    damage: 50,  speed: 90,  life: 2,   impulse: 1, trail: '#ff6ec7', head: '#ffd2f0'},
  yank:    {name: 'Yank ammo',     damage: 50,  speed: 90,  life: 2,   impulse: -1, trail: '#8d7bff', head: '#dcd6ff'},
  breaker: {name: 'Breaker ammo',  damage: 200, speed: 110, life: 2,   rockBreaker: true, trail: '#ff7a5c', head: '#ffd8cc'},
  trash:   {name: 'Trash ammo',    damage: 100, speed: 75,  life: 1.2, decay: .15, trail: '#8f9a6a', head: '#d9e0bf'}
};
const AMMO_TYPES = Object.keys(AMMO);
// Turret reload: seconds between shots for each turret, times the ammo's reloadScale. Each turret keeps its own
// timer, so a mixed battery fires at different rates (ℵ28 capped DPS per ship the same way). PLACEHOLDER numbers.
// RC turrets are fired by whoever is at the helm. Burst and auto turrets (ℵ21 era) are fired through a turret
// controller in the same hull wall, which works up to four of that wall's turrets: a burst turret fires `burst` rounds `gap` s apart per
// trigger pull and holds 32 rounds (ℵ33); an auto turret keeps firing while the trigger is held.
const TURRETS = {turret: {name: 'RC turret', reload: .4, capacity: 16}, starter_rc: {name: 'Starter RC turret', reload: .7, capacity: 16},
  burst: {name: 'Burst turret', reload: 1.1, burst: 4, gap: .09, capacity: 32}, auto: {name: 'Auto turret', reload: .16, capacity: 16}};
const TURRET_CONTROLLER = {reach: 2.8, turrets: 4};
// Diamond-tile turret ore (2019): one of these, with equal odds.
const TURRET_ORE_DROPS = ['turret', 'turret_burst', 'turret_auto'];
const AMMO_RELOAD = {ammo: 1, scatter: 1.6, flak: 1.4, sniper: 2.2, punch: 1.2, yank: 1.2, breaker: 2, trash: .8};
function turretDef(m) { return TURRETS[m?.starterRC ? 'starter_rc' : m?.kind || 'turret'] || TURRETS.turret; }
function turretReload(m) { return turretDef(m).reload * (AMMO_RELOAD[m?.ammoType] || 1); }
function turretCapacity(m) { return turretDef(m).capacity || 16; }
function isAmmo(type) { return Object.hasOwn(AMMO, type); }
// Ship shields (ℵ30): base + 100 per ship expansion; constant passive regeneration (ℵ10+), much faster in
// safe zones. Shield booster: 2-second use (ℵ25), restores 500 (wiki). base/regen/delay are PLACEHOLDERS.
const SHIELDS = {base: 1000, perExpansion: 100, regenPerSecond: 15, regenDelay: 4, safeZoneMultiplier: 12, boosterAmount: 500, boosterUseSeconds: 2};
// With shields down, hits damage tiles (100 HP each) by this fraction of the projectile's damage.
const TILE_DAMAGE_FACTOR = .24;
// Critical ships (shields at 0):
//   ℵ26 "Starter items will never be destroyed or ejected by bullet damage."
//   ℵ28 "Bullets hitting critical ships now have a chance to shrink them." — hull tiles never break; a hit on
//        the hull may instead shrink that side by one row (shrinkChance is a PLACEHOLDER).
//   ℵ32 "Ships will no-longer shrink under 8x8 ship tiles when shot." (hull included: (r−l+1) × (b−t+1)).
//   ℵ26 "bullets will penetrate critical ships" — loose cargo near the hit is thrown about, and stacks right
//        at the hit are blown out of the ship (as loot, never deleted).
const CRITICAL = {shrinkChance: .08, minSize: 8, cargoKickRadius: 3, cargoEjectRadius: 1.2, cargoKick: 9};
const STARTER_ITEMS = ['starter', 'starter_rc', 'starter_hatch', 'fab_starter'];
function isStarterTile(t) { return !!t && (STARTER_ITEMS.includes(t.type) || !!t.starterRC || (t.type === 'fabricator' && t.kind === 'starter')); }

// ℵ25 / ℵ25+: regenerate once 80% of the rock is cleared, after a visible 10-minute countdown.
const REGEN = {clearFraction: .8, delaySeconds: 600};
// Scheduled reset: every combat zone rebuilds with a new seed this often, whatever has been mined.
// (Server time while it runs; single-player counts time spent in the zone.) Set to 0 to turn it off.
const ZONE_RESET_SECONDS = 3 * 60 * 60;
const BOT_RESPAWN_SECONDS = 30;
// Bots fire their volley one shot at a time (volleyGap s apart), wait `interval` between volleys, and hold fire
// for arrivalGrace s after a ship enters the zone. Portals are bot-free: bots never spawn, path or loiter within
// portalKeepout of one and ignore ships inside that radius, so nobody gets camped on arrival. PLACEHOLDERS.
const BOT_RULES = {volleyGap: .22, arrivalGrace: 4, portalKeepout: 28};                                                     // PLACEHOLDER

// Per-species stats. hp counts player bullets (1 hit = 1 hp); radius is world units. PLACEHOLDER numbers.
const BOT_TYPES = {
  // v33: red raiders are much bigger; green bots are huge and very tough.
  red:   {label: 'Red raider',  hp: 500,  radius: 4.2, ranged: true,  shots: 3, spread: .03, interval: 9, damage: 35, shotType: 'ammo',  thrust: 7, minimap: '#ff4c4c', tag: 'RED', body: '#e04e4e'},
  green: {label: 'Green scout', hp: 5000, radius: 7.5, ranged: true,  shots: 3, spread: .03, interval: 7, damage: 20, shotType: 'punch', thrust: 7, minimap: '#63ff30', tag: 'GRN', body: '#55d54f'},
  // ℵ15: Sparrow's new variants do contact damage instead of shooting.
  // saw: the radius is the saw's outer rim (bot_saw.png, 156px) and the body is drawn at 126/156 inside it,
  // so the physics circle is the teeth. ℵ15 blue bots damage ships by ramming.
  // Silver bots: shooters like the red raiders, found only in Finch II and Sparrow I; they carry iron.
  silver: {label: 'Silver bot', hp: 600, radius: 2.4, ranged: true, shots: 2, spread: .03, interval: 9, damage: 30, shotType: 'ammo', thrust: 7, minimap: '#d6dde3', tag: 'SLV', body: '#b9c2ca'},
  // Canary seekers: dormant as rock tiles until shot, then they wake and hunt the nearest ship (contact damage).
  seeker: {label: 'Seeker', hp: 300, radius: 1.7, density: 45, smart: true, ranged: false, contact: 30, contactInterval: 1, knockback: 3, thrust: 16, minimap: '#cfefff', tag: 'SEK', body: '#a9d8f0', dormant: true},
  blue:  {label: 'Blue rammer', hp: 800,  radius: 3.0, saw: true, sawSpin: 7, ranged: false, contact: 60, contactInterval: 1.2, knockback: 14, thrust: 11, minimap: '#4aa8ff', tag: 'BLU', body: '#4a8cff'}
};

// ℵ30: flux replaced the hand-pusher drop from green bots. Counts are PLACEHOLDERS.
const BOT_DROPS = {
  red: [['explosives', 16]],
  silver: [['iron', 16]],
  green: [['flux', 4], ['punch', 16]],
  // ℵ19: blue bots drop ammo and rare items; ℵ21: never trash.
  blue: [['iron', 16], ['ammo', 8], ['sniper', 8]],
  // ℵ30: silica crystals came with flux; seekers carry them.
  seeker: [['silica', 4]]
};

// Ingredients beyond Iron (COST). ℵ30: pushers of both kinds are crafted with flux. Amounts PLACEHOLDER.
// Ammo: 1 iron + 1 explosive (wiki); trash is free (ℵ7+); breaker is cheaper but crafts 1 (ℵ14).
const RECIPE_EXTRA = {fuel: {explosives: 1}, ammo: {explosives: 1}, scatter: {explosives: 1}, flak: {explosives: 1}, sniper: {explosives: 1}, punch: {explosives: 1}, yank: {explosives: 1}, breaker: {explosives: 1}, pusher: {flux: 2, silica: 2}, pusher_block: {flux: 2, silica: 2}, loader: {flux: 2}, glass: {silica: 1}};
// Ammo recipes craft 4 rounds (ℵ29+, 31 Aug 2019: "Ammo recipes that crafted 3 items now craft 4");
// breaker and trash were never in that group (ℵ14: "All ammo types except trash and breaker…").
const RECIPE_YIELD = {glass: 2, ammo: 4, scatter: 4, flak: 4, sniper: 4, punch: 4, yank: 4, breaker: 1, trash: 1};
// Recipes with no ingredients at all (trash ammo, ℵ7+ / ℵ23 "it can now always be crafted").
const FREE_RECIPES = ['trash'];

// Fabricator types (ℵ18, 7 June 2019: "three different fabricator types for crafting specific kinds of
// items"). Recipe lists follow the unofficial wiki (Engineering / Machine / Munitions / Starter pages).
// Legacy, per the design for this build: crafts every kind of fabricator. A placed fabricator is terrain
// type 'fabricator' with a `kind`; the item that places each kind is `item`.
const FABRICATORS = {
  starter:     {name: 'Starter fabricator',     item: 'fab_starter',     badge: 'official-fab_t_starter',
                recipes: ['block', 'ladder', 'walkway', 'net', 'wrench', 'door', 'booster', 'ammo', 'fab_machine', 'fab_engineering']},
  engineering: {name: 'Engineering fabricator', item: 'fab_engineering', badge: 'official-fab_t_engineering',
                recipes: ['wrench', 'shredder', 'repair', 'booster', 'embiggener', 'shrinker', 'block', 'glass', 'wedge', 'ladder', 'walkway', 'walkway_wedge', 'net', 'door', 'storage', 'pusher']},
  machine:     {name: 'Machine fabricator',     item: 'fab_machine',     badge: 'official-fab_t_machine',
                recipes: ['hatch', 'ejector', 'loader', 'pusher_block', 'turret_controller', 'thruster', 'fab_machine', 'fab_engineering', 'fab_munitions']},
  munitions:   {name: 'Munitions fabricator',   item: 'fab_munitions',   badge: 'official-fab_t_munitions',
                recipes: ['ammo', 'scatter', 'flak', 'sniper', 'punch', 'yank', 'breaker', 'trash', 'fuel', 'booster']},
  legacy:      {name: 'Legacy fabricator',      item: 'fabricator',      badge: 'official-fab_t_legacy',
                recipes: ['fab_starter', 'fab_machine', 'fab_engineering', 'fab_munitions', 'fabricator']}
};
const FAB_ITEMS = Object.fromEntries(Object.entries(FABRICATORS).map(([kind, f]) => [f.item, kind]));
function isFabItem(type) { return Object.hasOwn(FAB_ITEMS, type); }
function fabKind(t) { return FABRICATORS[t?.kind] ? t.kind : 'legacy'; }

// Already in this codebase but added to drednot.io AFTER ℵ30. Kept for now; listed for the next pass.
const POST_BUILD_FEATURES = [
  ['fuel-burning placeable thrusters + fuel', 'ℵ35, 27 Nov 2019'],
  ['explosives as fuel / thruster fuel tanks', 'ℵ35, 27 Nov 2019']
];

function zoneDef(id = zone) { return ZONES[id] || ZONES[START_ZONE]; }
function isCombatZone(id = zone) { return zoneDef(id).kind === 'combat'; }
function zoneHalf(id = zone) {
  const d = zoneDef(id);
  if (d.half) return d.half;
  return {w: (d.gen.width - 1) * 2 + 8, h: (d.gen.height - 1) * 2 + 8};
}
// Expansions beyond the 10×7 starter interior, each worth SHIELDS.perExpansion.
function shipExpansions(b = (typeof bounds !== 'undefined' ? bounds : null)) { return b ? Math.max(0, (b.r - b.l - 10) + (b.b - b.t - 7)) : 0; }
function shipMaxHP(b = (typeof bounds !== 'undefined' ? bounds : null)) { return SHIELDS.base + SHIELDS.perExpansion * shipExpansions(b); }
function shipSize(b = (typeof bounds !== 'undefined' ? bounds : null)) { return b ? (b.r - b.l + 1) * (b.b - b.t + 1) : 0; }
function pvpMultiplierFor(size, id) {
  const r = (ZONES[id] || {}).pvp;
  if (!r) return 0;
  if (r.sizeZero == null) return 1;
  return Math.max(0, Math.min(1, (r.sizeZero - size) / (r.sizeZero - r.sizeFull)));
}
function pvpMultiplier(size = shipSize(), id = zone) { return pvpMultiplierFor(size, id); }
// Ship names: a new ship given no name gets a random one (two word lists, code only).
const SHIP_NAME_PARTS = [
  ['Rusty', 'Brave', 'Silent', 'Golden', 'Iron', 'Crimson', 'Lucky', 'Wandering', 'Stubborn', 'Midnight', 'Copper', 'Humble', 'Restless', 'Electric', 'Jolly', 'Hollow', 'Swift', 'Ancient', 'Clever', 'Lonely', 'Mighty', 'Little', 'Flying', 'Cosmic'],
  ['Finch', 'Sparrow', 'Pelican', 'Barge', 'Lantern', 'Anvil', 'Comet', 'Kettle', 'Gull', 'Raven', 'Pioneer', 'Drifter', 'Hauler', 'Tugboat', 'Zeppelin', 'Ferret', 'Beacon', 'Gizmo', 'Nomad', 'Marauder', 'Teapot', 'Junker', 'Albatross', 'Dredger']];
function randomShipName(random = Math.random) { const [a, b] = SHIP_NAME_PARTS; return a[Math.floor(random() * a.length)] + ' ' + b[Math.floor(random() * b.length)]; }
function cleanShipName(name) { return String(name ?? '').replace(/[<>\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32); }
// Leaderboard points (press "/"). PLACEHOLDER values; ℵ26-era renames are limited to once per hour.
const SCORE = {rock: 1, ore: 10, treasure: 250, bot: {red: 50, silver: 60, green: 120, blue: 80, seeker: 40}, pvpPer100: 5, missionEnter: 25};
const RENAME_COOLDOWN_SECONDS = 3600;
function recipeNeeds(type) {
  if (typeof FREE_RECIPES !== 'undefined' && FREE_RECIPES.includes(type)) return {};
  if (typeof COST === 'undefined' || !COST[type]) return RECIPE_EXTRA[type] && typeof COST !== 'undefined' && TYPES.includes(type) ? {...RECIPE_EXTRA[type]} : null;
  return {iron: COST[type], ...(RECIPE_EXTRA[type] || {})};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {HOME_FREEPORT, RETURN_SECONDS, TURRET_ORE_DROPS, TURRET_CONTROLLER, TURRETS, AMMO_RELOAD, BOT_RULES, BUILD, START_ZONE, PORTAL_ARRIVAL, ZONES, MISSIONS, TREASURE_LOOT, CRITICAL, STARTER_ITEMS, AMMO_TYPES, SCORE, RENAME_COOLDOWN_SECONDS, randomShipName, cleanShipName, REGEN, ZONE_RESET_SECONDS, BOT_TYPES, BOT_DROPS, RECIPE_EXTRA, RECIPE_YIELD, FABRICATORS, FAB_ITEMS, AMMO, SHIELDS, TILE_DAMAGE_FACTOR, zoneDef: id => ZONES[id] || ZONES[START_ZONE], shipSize, shipMaxHP, pvpMultiplier: pvpMultiplierFor};
