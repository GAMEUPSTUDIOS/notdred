'use strict';
// v61: every round can hurt ships — other ships in any combat zone (Finch I and Canary included now), and your own
// ship once the round has cleared your hull (a sniper ricochet, flying into your own slow slug). Thrusters 1.5×.
const assert=require('node:assert/strict'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');
for(const z of ['finch2','sparrow','pits','canary'])assert.ok(era.ZONES[z].pvp,z+': ships can shoot each other');assert.equal(era.ZONES.finch.pvp,null,'Finch I: no ship-on-ship damage');
// Silver (iron) bots: Finch II, not Finch I.
assert.ok(era.ZONES.finch2.bots.silver>0&&!era.ZONES.finch.bots.silver,'silver bots in Finch II only');
assert.deepEqual(era.THRUSTER_FORCE,{starter:1350,fuel:2400,explosives:1650},'thrusters 1.5×');
const bus=new ZoneBus(),rooms=[];const mk=id=>{const r={id,name:'Ship '+id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'c',id,true,'captain');rooms.push(r);return r;};
const step=n=>{for(let i=0;i<n;i++){for(const r of rooms)r.game.tick(1/60);bus.step(rooms,1/60);}};
const A=mk('A'),B=mk('B');step(5);for(const r of rooms)r.game.run('piloting=true;player.setActive(false);travelZone("finch","entry")');step(20);
const sim=[...bus.sims.values()].find(s=>s.api.fleet.has('A')&&s.api.fleet.has('B'));assert.ok(sim,'both ships in Finch I');
for(const r of rooms)r.game.run('shipNoclip=true');step(2);
const place=(id,x,y,vx=0,vy=0)=>sim.api.zsPlaceShip(id,{x,y,vx,vy});const hp=r=>Number(r.game.run('shipHP')),maxHp=r=>Number(r.game.run('shipMaxHP()'));
// An open stretch (no rock within ±9 m of an 80 m line), so only ships are in the way.
const p0=JSON.parse(sim.run(`(()=>{for(let y=-140;y<140;y+=6)for(let x=-300;x<220;x+=6){let clear=true;for(let dy=-9;dy<=9&&clear;dy+=3)world.rayCast(V(x-10,y+dy),V(x+80,y+dy),f=>{if(f.getBody().getUserData()?.rockChunk!=null||f.getBody().getType()==='static'){clear=false;return 0;}return 1;});if(clear)return JSON.stringify({x,y});}return 'null';})()`));
assert.ok(p0,'found open space');
// 1. A hits B in Finch I (was no PvP there).
place('A',p0.x,p0.y);place('B',p0.x+30,p0.y);step(2);let b0=hp(B);
sim.api.zsFire('A',[{type:'ammo',p:{x:p0.x+10,y:p0.y},v:{x:90,y:0},life:2,maxLife:2,bounces:0}]);step(20);
assert.equal(b0-hp(B),0,'another ship takes no damage in Finch I (bots only there)');assert.ok(!Number(sim.run('shots.length')),'…the round still stops on the ship');
// 2. Your own round, fired from just outside your hull straight out: never hits you on the way out.
B.game.run('shipHP=shipMaxHP()');place('B',p0.x+400,p0.y);let a0=hp(A);
sim.api.zsFire('A',[{type:'ammo',p:{x:p0.x+6,y:p0.y},v:{x:90,y:0},life:1,maxLife:1,bounces:0}]);step(70);assert.equal(hp(A),a0,'a round leaving your hull does not hit you');
// 3. A slow slug ahead of you, and your ship flies into it.
a0=hp(A);place('A',p0.x,p0.y,60,0);sim.api.zsFire('A',[{type:'slug',p:{x:p0.x+15,y:p0.y},v:{x:10,y:0},life:4.5,maxLife:4.5,bounces:0}]);step(60);
assert.equal(a0-hp(A),era.AMMO.slug.damage,'flying into your own slug hurts ('+(a0-hp(A))+')');
// 4. A round coming back at you (a ricochet) hits your own hull.
A.game.run('shipHP=shipMaxHP()');place('A',p0.x,p0.y);step(1);a0=hp(A);sim.api.zsFire('A',[{type:'sniper',p:{x:p0.x+25,y:p0.y},v:{x:-140,y:0},life:2,maxLife:2,bounces:0}]);step(20);
assert.equal(a0-hp(A),era.AMMO.sniper.damage,'your own sniper round coming back hits you');
// 5. Flak fragments remember who fired them.
assert.ok(/frag:true,bounces:0,owner:s\.owner/.test(require('node:fs').readFileSync('dist/modules/combat.js','utf8')),'flak fragments keep their owner');
console.log('PASS: every round hurts ships (PvP where the zone allows it, never in Finch I; your own rounds once clear of your hull); silver bots in Finch II only; thrusters 1.5×.');
