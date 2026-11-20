'use strict';
// v56: burst/auto turrets are manned by clicking them; seekers are square, use the pack's bot_square and are the fastest
// bots; plain Canary rock drops nothing; standard ammo does half a round (mining unchanged); ships pick up loot near any
// part of the hull, faster, and an item left on a hatch outlet no longer jams it.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),era=require('../dist/modules/era.js');
const g=createRoom(null,{});g.join('a','A',true,'captain');const run=g.run,step=n=>{for(let i=0;i<n;i++)g.tick(1/60);};
// --- Manning a burst turret by clicking it.
run('zone="finch";setupZone(true);for(const b of allBots())b.body.setTransform(V(9999,9999),0);botsPaused=true;mounts=mounts.filter(m=>!(m.type==="turret"&&m.side==="right"));mounts.push({type:"turret",kind:"burst",side:"right",at:0,ammo:32,ammoType:"ammo"});rebuildMounts();');
run('bindCrew("a");player.setTransform(V(bounds.r-1.5,bounds.b-1),0);storeCrew();');const tp=run('(m=>{const p=ship.getWorldPoint(mountPoint(m));return {x:p.x,y:p.y}})(mounts.find(m=>m.kind==="burst"))');
g.command('a',{action:'select',slot:0,aim:tp});g.command('a',{action:'edit',aim:tp});
assert.equal(run('(bindCrew("a"),manning)'),'T:right:0','clicking the burst turret mans it');
const far={x:tp.x+30,y:tp.y-4};for(let k=0;k<30;k++){g.command('a',{action:'input',keys:{},held:true,aim:far});step(2);}
assert.ok(run('mounts.find(m=>m.kind==="burst").ammo')<32,'holding the mouse fires it');
g.command('a',{action:'input',keys:{a:true},held:false,aim:far});step(2);assert.equal(run('(bindCrew("a"),manning)'),null,'moving lets go');
run('mounts.find(m=>m.kind==="burst").ammo=10;');g.command('a',{action:'input',keys:{shift:true},held:false,aim:tp});g.command('a',{action:'select',slot:0,aim:tp});g.command('a',{action:'edit',aim:tp});
// --- Seekers.
const S=era.BOT_TYPES.seeker;assert.equal(S.square,true);assert.ok(S.thrust/2>Math.max(...Object.entries(era.BOT_TYPES).filter(([k])=>k!=='seeker').map(([,b])=>b.thrust/2)),'seekers are the fastest bots');
assert.ok(fs.existsSync('dist/sprites/bot_square.png'));const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/if\(def\.square\)\{const s=R\*\.9,sq=spriteImages\.bot_square/.test(game),'drawn with the pack\'s square bot');
run('zone="canary";setupZone(true);');const sk=run('(()=>{const r=[...rocks.values()].find(r=>r.kind==="seeker");if(!r)return null;wakeSeeker(r.id);const b=allBots().find(b=>b.species==="seeker");return b&&b.body.getFixtureList().getShape().getType();})()');
assert.equal(sk,'polygon','a woken seeker has a square body');
// --- Plain Canary rock drops nothing; elsewhere it still can.
run('worldLoot.forEach(i=>world.destroyBody(i.body));worldLoot.length=0;for(const r of [...rocks.values()].filter(r=>(r.kind||"rock")==="rock").slice(0,20))mineRock(r.id,0);');assert.equal(run('worldLoot.length'),0,'brown Canary rock drops nothing');
run('zone="finch";setupZone(true);worldLoot.forEach(i=>world.destroyBody(i.body));worldLoot.length=0;const r0=[...rocks.values()].find(r=>(r.kind||"rock")==="rock"&&!r.ore);mineRock(r0.id,0);');assert.equal(run('worldLoot.filter(i=>i.type==="iron").length'),1,'Finch rock still drops iron');
// --- Standard ammo: half a round, mines as before.
assert.equal(era.AMMO.ammo.damage,50);assert.equal(run('rockDamage(AMMO.ammo,shotDamage({type:"ammo",life:2,maxLife:2}))'),100*era.WORLD_DAMAGE_SCALE,'a standard round still mines 225');assert.equal(run('rockDamage(AMMO.punch,shotDamage({type:"punch",life:2,maxLife:2}))'),100*era.WORLD_DAMAGE_SCALE);assert.equal(run('shotDamage({type:"ammo",life:2,maxLife:2})'),50,'but hits for 50');
console.log('PASS: man burst/auto turrets by clicking (hold to fire, move to let go); square, fast seekers with bot_square; plain Canary rock drops nothing; standard ammo halved (mining unchanged).');
process.exit(0);
