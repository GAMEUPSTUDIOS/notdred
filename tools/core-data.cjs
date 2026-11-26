'use strict';
// Writes dist/core-data.json: every tunable table the C++ core reads (era.js, the item tables in game.js and the
// constants of the rule modules), taken from the running JavaScript game so the numbers have one home. Run after
// changing any of them (tests/core-data.cjs fails while the file is out of date):
//   node tools/core-data.cjs           write it
//   node tools/core-data.cjs --check   exit 1 if it is out of date
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const NAMES=['BUILD','START_ZONE','PORTAL_ARRIVAL','PORTAL_RANGE','ZONE_SCALE','SHIP_CLEARANCE','ZONES','HOME_FREEPORT','RETURN_SECONDS','MISSIONS','TREASURE_LOOT',
 'AMMO','AMMO_TYPES','TURRETS','TURRET_CONTROLLER','TURRET_ORE_DROPS','WORLD_TILE_HP','WORLD_DAMAGE_SCALE','AMMO_RELOAD','SHIELDS','TILE_DAMAGE_FACTOR','ITEM_HP','CRITICAL',
 'STARTER_ITEMS','REGEN','ZONE_RESET_SECONDS','BOT_RESPAWN_SECONDS','BOT_RULES','BOT_TYPES','CANARY_IRON_DROP','GOLDEN_SHREDDER_CHANCE','SHRED_COOLDOWN','BOT_DROPS',
 'RECIPE_EXTRA','RECIPE_YIELD','FREE_RECIPES','MACHINE_SIZE','STANDING_MACHINES','PHYSICS_MACHINES','RECYCLE_RETURN','RECYCLE_SWAP','RECYCLE_SECONDS','THRUSTER_TANK',
 'THRUSTER_FORCE','COMMS_RANGE','SPAWN_RANKS','SHIP_LIMITS','SIGN_MAX','PAINT_COLORS','PAINT_DEFAULT','FABRICATORS','FAB_ITEMS','SCORE','RENAME_COOLDOWN_SECONDS','SHIP_NAME_PARTS',
 // game.js
 'TYPES','NAMES','COST','DURATION','CENTRAL_DOCK','DAMAGE_STEPS','DOOR_BIT','RANK_BIT','DOOR_ACCESS','HAND_PUSHER_RANGE',
 // rule modules
 'MERGE_FULL','BOT_PUNCH','BOULDER_KICK','TURRET_WAVE','TURRET_WAVE_MAX','MAN_REACH','SUPPORT_TYPES','MOUNT_TYPES','NOT_PLACEABLE','SOLID_PIECES','MOUNT_TOOLS','CONFIGURABLE',
 'LOOT_REACH','PUSHER_SPEED','PUSHER_ACCEL','BEAM_PASSES','PUSHER_MODES','PUSHER_FILTERS','PUSHER_MAX_BEAM','PUSHER_MAX_SPEED','LOADER_CYCLE','LOADER_TURRET_CYCLE',
 'LOADER_REACHES_THROUGH','LOADER_HOTBOX','MISSION_PORTAL','MISSION_PORTAL_ZONE','SAFETY','ROCK_CHUNK','FREEPORT_CUT','FREEPORT_DOCK'];
function current(){const {createRoom}=require('../server/room.cjs');const g=createRoom(null,{});
 try{const out=JSON.parse(g.run('JSON.stringify(Object.fromEntries('+JSON.stringify(NAMES)+'.map(n=>{try{return [n,eval(n)];}catch{return [n,undefined];}})))'));
  const missing=NAMES.filter(n=>out[n]===undefined);if(missing.length)throw Error('core-data: not found in the game: '+missing.join(', '));
  return JSON.stringify(out,null,0)+'\n';}finally{try{g.dispose();}catch{}}}
const file=path.join(root,'dist','core-data.json'),text=current();
if(process.argv.includes('--check')){const old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';if(old!==text){console.error('dist/core-data.json is out of date: run node tools/core-data.cjs');process.exit(1);}console.log('dist/core-data.json is up to date');}
else{fs.writeFileSync(file,text);console.log('Wrote dist/core-data.json ('+(text.length/1024).toFixed(1)+' KB, '+NAMES.length+' tables)');}
process.exit(0);
