'use strict';
// v72: battle damage reaches every placed piece (blocks, machines, turrets and thrusters, starter items too), each with
// its own health; rounds entering beside a turret no longer pass through a critical ship; big ships' hatches collect
// loot lying next to the hull; resting piles fall asleep even with a crew member standing in them; loose items and zone
// loot go out as changes; green bots are faster and punch/yank shove harder.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');
let seed=11;Math.random=()=>(seed=(seed*16807)%2147483647)/2147483647;
const bus=new ZoneBus();const rooms=[];const mk=id=>{const r={id,name:id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-c',id,true,'captain');r.run=c=>r.game.run(c);rooms.push(r);return r;};
const step=n=>{for(let i=0;i<n;i++){for(const r of rooms)r.game.tick(1/60);bus.step(rooms,1/60);}};

// ---- Tuning.
assert.equal(era.BOT_TYPES.green.thrust,16,'green scouts are faster');assert.equal(era.AMMO.punch.impulse,2);assert.equal(era.AMMO.yank.impulse,-2);
assert.ok(era.itemMaxHp('fab_starter')>era.itemMaxHp('block')&&era.itemMaxHp('ladder')<era.itemMaxHp('block')&&era.itemMaxHp('turret_auto')===150);

// ---- Real rounds at a critical ship from every side: tiles, turrets and thrusters (starter ones too) are hit.
const A=mk('A'),B=mk('B');step(5);for(const r of [A,B])r.run("snapshotZone();zone='sparrow';setupZone(true);shipNoclip=true");step(5);
A.run('fly(0,-300)');B.run('fly(0,0)');step(5);const sim=bus.sims.get('sparrow');
const fire=(sx,sy,vx,vy)=>{B.run('shipHP=0');sim.run(`zsFire('A',[{type:'ammo',p:{x:${sx},y:${sy}},v:{x:${vx},y:${vy}},life:3,maxLife:3,bounces:0}])`);step(40);};
for(let y=-6;y<=6;y++)fire(-60,y,90,0);for(let y=-6;y<=6;y++)fire(60,y,-90,0);for(let x=-8;x<=8;x++){fire(x,-40,0,90);fire(x,40,0,-90);}
const hurt=JSON.parse(B.run('JSON.stringify({m:mounts.map(m=>[mountItem(m),m.side,m.hp??100]),t:[...blocks.values(),...terrain.values()].filter(t=>(t.hp??100)<100).map(t=>t.type||"block")})'));
assert.ok(hurt.m.filter(([,,hp])=>hp<100).length>=4,'every turret and thruster on the starter ship took hits: '+JSON.stringify(hurt.m));
for(const kind of ['starter','starter_rc'])assert.ok(hurt.m.some(([k,,hp])=>k===kind&&hp<100),kind+' (a starter item) takes damage');
for(const type of ['block','walkway','fabricator','starter_hatch'])assert.ok(hurt.t.includes(type),type+' takes damage');
// Own health per piece: one standard round takes 12 HP off anything; that is 12% of a block, 20% of a walkway.
B.run('heal();shipHP=0');const per=JSON.parse(B.run(`(()=>{const b=[...blocks.values()][0],w=terrainOfType('walkway')[0];hitShipTile(b,'tile',50);hitShipTile(w,'tile',50);return JSON.stringify([b.hp,w.hp]);})()`));
assert.deepEqual(per.map(v=>+v.toFixed(3)),[88,80],'a block and a walkway each lose their own share');
// A turret breaks once its health runs out, dropping itself as loot.
const before=B.run('mounts.length');B.run("const m=mounts.find(m=>m.starterRC);for(let k=0;k<20&&mounts.includes(m);k++)hitShipTile(m,'mount',100);");step(5);
assert.equal(B.run('mounts.length'),before-1,'the RC turret broke off');assert.ok(sim.run("worldLoot.some(i=>i.type==='starter_rc')"),'and dropped into the zone');

// ---- A big ship's hatch draws in loot lying on the floor right beside its hull (not only near its middle).
const C=mk('C');step(5);C.run("snapshotZone();zone='finch';setupZone(true)");step(5);C.run('bounds={l:-20,r:20,t:-14,b:6};rebuildShell();rebuildMounts();updateShipMass();');step(10);
const fsim=bus.sims.get('finch');const spot=JSON.parse(fsim.run(`(()=>{const g=zoneGrid();const out=[];for(let y=2;y<g.height-3;y++)for(let x=8;x<g.width-8;x++){let ok=true;for(let dy=-6;dy<=0&&ok;dy++)for(let dx=-7;dx<=7;dx++)if(g.solid[(y+dy)*g.width+x+dx]){ok=false;break;}if(!ok)continue;let floor=true;for(let dx=-7;dx<=7;dx++)if(!g.solid[(y+1)*g.width+x+dx])floor=false;if(floor)out.push({x:g.minX+x*g.cell,y:g.minY+y*g.cell});}return JSON.stringify(out[Math.floor(out.length/2)]);})()`));
const e=JSON.parse(C.run('JSON.stringify(shipExtents())'));C.run(`fly(${spot.x},${spot.y+2-e.b-.5})`);step(60);const sp=JSON.parse(C.run('JSON.stringify(ship.getPosition())'));
fsim.run(`zsAddLoot('iron',${sp.x+e.r+3},${spot.y+1},16,0,0,0);zsAddLoot('flux',${sp.x+e.l-3},${spot.y+1},4,0,0,0)`);step(500);
assert.deepEqual(JSON.parse(C.run('JSON.stringify(items.filter(i=>["iron","flux"].includes(i.type)).map(i=>i.type).sort())')),['flux','iron'],'both stacks beside the big hull were collected');

// ---- A resting pile with a crew member standing in it falls asleep, and then costs (almost) nothing to send.
const D={id:'D'};D.game=createRoom(null,{});D.game.join('d','D',true,'captain');const run=D.game.run,dstep=n=>{for(let i=0;i<n;i++)D.game.tick(1/60);};
run('bounds={l:-30,r:30,t:-20,b:12};rebuildShell();rebuildMounts();');const pp=JSON.parse(run('JSON.stringify(player.getPosition())'));
run(`for(let k=0;k<160;k++)spawnItem(['iron','flux','ammo','block'][k%4],V(${pp.x}-6+Math.random()*12,${pp.y}-9+Math.random()*8),V(0,0),1+(k%7))`);
dstep(900);assert.ok(run('(()=>{const it=new Set(items.map(i=>i.body));for(let e=player.getContactList();e;e=e.next)if(e.contact.isTouching()&&it.has(e.other))return true;return false;})()'),'the crew member is standing in the pile');
assert.equal(run('items.filter(i=>i.body.isAwake()).length'),0,'the whole pile sleeps');
let pass=D.game.snapshotPass(['d']);pass=D.game.snapshotPass(['d']);assert.ok(!pass.own[0].itemsUp&&!pass.own[0].itemsGone&&!pass.own[0].itemsFull,'nothing to send for a resting pile');assert.ok(pass.shared.length<4000,'no item list in the shared part ('+pass.shared.length+' bytes)');
// One stack moved: just that one; one taken away: just its id; a new member gets the whole list.
const moved=run('(()=>{const i=items[3];i.body.setTransform(V(i.body.getPosition().x,i.body.getPosition().y-3),0);i.body.setAwake(true);return i.nid;})()');
pass=D.game.snapshotPass(['d']);assert.deepEqual([...pass.own[0].itemsUp.map(r=>r[0])],[moved],'only the moved stack is sent');
const gone=run('(()=>{const i=items[5];inside.destroyBody(i.body);items.splice(5,1);return i.nid;})()');dstep(1);pass=D.game.snapshotPass(['d']);assert.deepEqual([...pass.own[0].itemsGone],[gone]);
D.game.join('e','E',false,'crew');pass=D.game.snapshotPass(['d','e']);assert.equal(pass.own[1].itemsFull.length,run('items.length'),'a new crew member gets every stack');
console.log('PASS: damage on every piece (turrets, thrusters, starter items) with its own health, rounds entering beside turrets, big ships collect floor loot, piles sleep with crew in them, item changes only.');
process.exit(0);
