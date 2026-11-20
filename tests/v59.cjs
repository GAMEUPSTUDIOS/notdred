'use strict';
// v59: turrets fire in a very fast wave, not all on one frame — RC volleys and turret-controller volleys alike.
const assert=require('node:assert/strict'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs');
const g=createRoom(null);g.join('c','c',true,'captain');for(let i=0;i<5;i++)g.tick(1/60);
g.run(`zone="finch";setupZone(false);for(const m of mounts)if(m.type==="turret")m.ammo=0;
 for(const at of [-3,-1,1])mounts.push({type:"turret",side:"top",at,rotation:0,ammo:16});
 for(const at of [-3,-1,1])mounts.push({type:"turret",side:"top",at:at+5,kind:"burst",rotation:0,ammo:32});
 mounts.push({type:"turret_controller",side:"top",at:4,rotation:0});`);
assert.ok(g.run('isCombatZone()'),'combat zone');
const ammo=sel=>JSON.parse(g.run(`JSON.stringify(mounts.filter(m=>m.type==="turret"&&${sel}).map(m=>m.ammo))`));
// RC volley: aim straight up from the ship.
g.run(`{bindCrew("c");const p=ship.getPosition();mouse={x:p.x,y:p.y-40};fireRC();storeCrew();}`);
const seen=[];let first=null;for(let t=0;t<30;t++){const a=ammo('!m.kind&&m.side==="top"'),fired=a.filter(x=>x<16).length;if(fired&&first==null)first=t;seen.push(fired);g.run('tickTurrets(1/60)');}
assert.equal(seen[0],1,'only one RC fires on the click frame');assert.equal(seen[seen.length-1],3,'all three RCs fire');
const steps=new Set(seen);assert.ok(steps.size>=3,'they go off one after another ('+seen.join(',')+')');
assert.ok(seen.indexOf(3)<=Math.ceil(.25*60)+1,'the whole wave is over within a quarter second');
// Burst turrets through a controller: their bursts start staggered too.
g.run(`{bindCrew("c");const cc=mounts.find(m=>m.type==="turret_controller"),q=mountPoint(cc);player.setTransform(V(q.x,q.y+1),0);manning=ctrlKey(mounts.find(m=>m.type==="turret_controller"));const p=ship.getPosition();mouse={x:p.x,y:p.y-40};controllerFire();storeCrew();}`);
const starts=JSON.parse(g.run('JSON.stringify(mounts.filter(m=>m.kind==="burst").map(m=>m.burstTimer))')).sort((a,b)=>a-b);
assert.ok(starts[0]===0&&starts[1]>0&&starts[2]>starts[1],'burst turrets start one after another ('+starts.join(',')+')');
console.log('PASS: turrets fire in a fast wave (RC volleys and turret-controller bursts).');
