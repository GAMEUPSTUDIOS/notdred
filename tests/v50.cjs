'use strict';
// v50: pusher settings (max beam length, target speed, default/filtered modes push·pull·off, item filters, filter by
// inventory), silver bots firing scattershot, turret icons from the game's own turret pieces, rank-coloured name tags.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),era=require('../dist/modules/era.js'),codec=require('../dist/modules/save-codec.js');
const r={id:'Q'};r.game=createRoom(null,{});r.game.join('cap','Cap',true,'captain');const run=r.game.run;const step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
run('bounds={l:-14,r:14,t:-6,b:5};rebuildShell();rebuildMounts();for(const i of [...items])inside.destroyBody(i.body);items.length=0;for(const t of [...terrain.values()])if(t.body){inside.destroyBody(t.body);terrain.delete(t.key);}');
const fy=run('bounds.b-1');run(`addTerrain("pusher_block",-12,${fy},0);bindCrew("cap");player.setTransform(V(-5,${fy-.2}),0);storeCrew();`);
const P=`terrain.get(key(-12,${fy}))`,set=o=>r.game.command('cap',{action:'pusher',cell:{x:-12,y:fy},settings:o});
// Old pushers convert: a plain pusher is push/push with no filters, full beam, normal speed.
assert.deepEqual(JSON.parse(run(`JSON.stringify((t=>{pusherSettings(t);return {mode:t.mode,filteredMode:t.filteredMode,maxBeam:t.maxBeam,filters:t.filters}})(${P}))`)),{mode:'push',filteredMode:'push',maxBeam:1000,filters:[null,null,null]});
const vx=()=>run('items[0]?items[0].body.getLinearVelocity().x:0'),reset=(type,count=4)=>run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;spawnItem("${type}",V(-9,${fy}),V(0,0),${count});`);
// Default push drives a stack; off leaves it; filtered pull pulls only the filtered item.
set({mode:'push',filteredMode:'push',filters:[null,null,null]});reset('iron');step(20);assert.ok(vx()>1,'default push');
set({mode:'off',filteredMode:'pull',filters:['ammo',null,null]});reset('iron');step(20);assert.ok(Math.abs(vx())<.2,'not filtered → default off');
reset('ammo');step(30);assert.ok(run('items[0].body.getPosition().x')< -10,'filtered item → pulled toward the pusher');
// Target speed: the stack settles at the chosen speed.
set({mode:'push',filteredMode:'push',filters:[null,null,null],speed:4});reset('iron');step(40);assert.ok(Math.abs(vx()-4)<.6,'target speed 4 ('+vx().toFixed(2)+')');
// Max beam length: a stack farther than the beam is left alone, and the beam stops there.
set({maxBeam:2,speed:10});reset('iron');step(10);assert.ok(Math.abs(vx())<.2,'out of reach');assert.ok(run(`${P}.beam`)<=2.01,'beam capped');
// Filter by inventory: an expando box holding a filtered item is pushed in the filtered mode.
set({maxBeam:1000,mode:'off',filteredMode:'push',filters:['flux',null,null],filterInv:true});run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;globalThis.bx=spawnBox(V(-8,${fy-.5}),{flux:4});`);step(30);
assert.ok(run('bx.body.getLinearVelocity().x')>1,'box carrying flux is pushed');set({filterInv:false});run('bx.body.setLinearVelocity(V(0,0))');step(30);assert.ok(Math.abs(run('bx.body.getLinearVelocity().x'))<.5,'without filter-by-inventory the box uses the default (off)');
// Saved with the ship; bad values clamped.
run(`bindCrew('cap');player.setTransform(V(-10,${fy-.2}),0);storeCrew();`);set({maxBeam:99999,speed:-5,mode:'sideways'});const t=JSON.parse(run(`JSON.stringify((({maxBeam,speed,mode,filteredMode,filters,filterInv})=>({maxBeam,speed,mode,filteredMode,filters,filterInv}))(${P}))`));assert.equal(t.maxBeam,1000);assert.equal(t.speed,1);assert.equal(t.mode,'off');
const sv=codec.decode(codec.encode(JSON.parse(JSON.stringify(run('state()')))));assert.deepEqual(sv.terrain.find(x=>x.type==='pusher_block').filters,['flux',null,null]);
// The beam's colour follows the mode used on what it holds.
assert.ok(['push','pull','off'].includes(run(`${P}.beamMode`)));
// Silver bots fire scattershot: each volley shot is the 5-pellet spread.
assert.equal(era.BOT_TYPES.silver.shotType,'scatter');const combat=fs.readFileSync('dist/modules/combat.js','utf8');assert.ok(/am=AMMO\[def\.shotType\],n=am\?\.pellets\|\|1/.test(combat));
// Turret icons and rank-coloured name tags.
const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/turret:\['item-turret_rc'\]/.test(game)&&/TURRET_ICON_PARTS=\{\}/.test(game),'turret icons are the packaged items');
assert.ok(/RANK_NAME_COLOR=\{captain:'#5fc4ff',crew:'#ffd34a',guest:'#cfd8dc'\}/.test(game)&&/RANK_NAME_COLOR\[nameRank\(\)\]/.test(game),'name tags take the rank colour');
for(const f of ['turret_barrel_rc','turret_action_rc','turret_barrel_burst','turret_action_burst','turret_action_auto','turret_barrel','turret_controller','turret_barrel_rc_starter','turret_action_rc_starter'])assert.ok(fs.existsSync('dist/sprites/official-'+f+'.png'),f);
console.log('PASS: pusher settings (beam length, target speed, default/filtered push·pull·off, item filters, filter by inventory, clamped, saved); silver bots fire scattershot; turret icons from turret pieces; rank-coloured name tags.');
process.exit(0);
