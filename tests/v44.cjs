'use strict';
// v44: world tiles use drednot's HP scale (standard ammo takes 5 hits on rock), damaged rock/ore health reaches
// every ship in the zone for its health bar, and the shield booster uses its own item art.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');
const bus=new ZoneBus();const ship=(id)=>{const r={id,name:id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-c',id,true,'captain');return r;};
const A=ship('A'),B=ship('B'),ships=[A,B];const step=n=>{for(let i=0;i<n;i++){for(const r of ships)r.game.tick(1/60);bus.step(ships,1/60);}};
for(const r of ships)r.game.command(r.id+'-c',{action:'dev',op:'finch'});step(3);const sim=bus.sims.get('finch');
assert.equal(era.WORLD_TILE_HP.rock,1000);assert.equal(Math.round(100*era.WORLD_DAMAGE_SCALE),225,'standard ammo does 225 to world tiles');
// An exposed plain rock tile, and a standard round fired at it from the open side.
const target=sim.run(`(()=>{for(const r of rocks.values()){if(r.kind!=='rock')continue;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=r.x+dx*4,y=r.y+dy*4;if(!rocks.has(key(x,y))&&!zoneSolid(x,y))return {id:r.id,x:r.x,y:r.y,dx,dy};}}})()`);
const fire=()=>{sim.run(`shots.push({type:'ammo',p:V(${target.x+target.dx*3.6},${target.y+target.dy*3.6}),v:V(${-target.dx*90},${-target.dy*90}),life:1,maxLife:1,owner:'A'})`);step(8);};
const hp=()=>sim.run(`rocks.get(${JSON.stringify(target.id)})?.hp??0`);
fire();assert.equal(hp(),775,'one standard round: 1000 → 775');step(2);
const seen=r=>(r.game.snapshot(r.id+'-c').rockHp||[]).find(e=>e[0]===target.id);
assert.equal(JSON.stringify(seen(A)),JSON.stringify([target.id,775,1000]),'ship A sees the damage');assert.equal(JSON.stringify(seen(B)),JSON.stringify([target.id,775,1000]),'ship B sees it too');
for(let k=2;k<=4;k++){fire();assert.ok(hp()>0,'still standing after '+k+' rounds');}
fire();assert.equal(sim.run(`rocks.has(${JSON.stringify(target.id)})`),false,'broken by the 5th standard round');
const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/booster:\['item-shield_booster'/.test(game)&&fs.existsSync('dist/sprites/item-shield_booster.png'),'shield booster art');
assert.ok(/damaged rock\/ore: same health bar as ship tiles/.test(game),'rock health bars drawn');
console.log('PASS: world tiles — 1000 HP, standard ammo 225 per hit (5 hits to break rock), damage synced to every ship in the zone for health bars; shield booster uses its own art.');
process.exit(0);
