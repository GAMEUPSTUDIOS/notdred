'use strict';
// v49: fabricators, recyclers and comms stations are physics objects like expando boxes (placed anywhere, fall, slide,
// pushed), still fed by loaders; a loader's swing is its cooldown; pusher beams and loader swings reach the clients.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),codec=require('../dist/modules/save-codec.js');
const r={id:'P'};r.game=createRoom(null,{});r.game.join('cap','Cap',true,'captain');const run=r.game.run;const step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
run('bounds={l:-14,r:14,t:-8,b:5};rebuildShell();rebuildMounts();for(const i of [...items])inside.destroyBody(i.body);items.length=0;');
const fy=run('bounds.b-1');
// The starter fabricator is a physics object.
assert.ok(run('!![...terrain.values()].find(t=>t.type==="fabricator").body'),'starter fabricator has a body');
// Placed off the grid, mid-air: it falls and lands on the floor.
run('player.setTransform(V(-10,4),0);giveItem("fab_munitions",1);selectSlot(slots.indexOf("fab_munitions"));');
assert.equal(run('machineSpace("fabricator",V(6.3,-3.7))'),true);run('globalThis.mf=spawnMachine("fabricator",V(6.3,-3.7));mf.kind="munitions";');step(120);
const mp=run('(({x,y})=>({x,y}))(mf.body.getPosition())');assert.ok(Math.abs(mp.x-6.3)<.05,'not snapped to the grid ('+mp.x.toFixed(2)+')');assert.ok(Math.abs(mp.y+1.5-(fy+.5))<.05,'fell to the floor');
// A pusher shoves it.
run(`addTerrain("pusher_block",2,${fy},0);`);step(240);assert.ok(run('mf.body.getPosition().x')>mp.x+.5,'pushed by a pusher beam');
// A loader still feeds it: put a loader against its left side and feed iron from behind.
run(`(()=>{const t=terrain.get(key(2,${fy}));interior.destroyFixture(t.f);terrain.delete(key(2,${fy}));mf.body.setTransform(V(5.8,${fy-1}),0);mf.body.setLinearVelocity(V(0,0));})()`);step(2);
const lx=4;run(`addTerrain("loader",${lx},${fy},0);spawnItem("iron",V(${lx-1},${fy}),V(0,0),8);`);
// The swing: the hand takes the stack, crosses (phase rising), delivers at the far side, then swings back.
step(10);const ld=()=>run(`(({phase,swing,cargo})=>({phase,swing,carried:cargo.length}))(terrain.get(key(${lx},${fy})))`);
let s1=ld();assert.equal(s1.swing,'carry');assert.ok(s1.phase>0&&s1.phase<1,'carrying across');assert.equal(run('mf.materials.iron||0'),0,'not delivered before the hand arrives');
step(50);assert.equal(run('mf.materials.iron||0'),8,'delivered when the hand reached the fabricator');const s2=ld();assert.equal(s2.swing,'return');
run(`spawnItem("iron",V(${lx-1},${fy}),V(0,0),4);`);step(5);assert.equal(ld().carried,0,'cannot grab while swinging back');step(60);assert.ok(ld().carried===1||run('mf.materials.iron')===12,'grabs again once back');
// Recycler and comms station are physics objects too; saves keep them (with their contents).
run('spawnMachine("recycler",V(-6,'+(fy-1)+'));spawnMachine("comms",V(-9,'+(fy-.5)+'));');step(30);
const sv=JSON.parse(JSON.stringify(run('state()')));assert.deepEqual(sv.machines.map(m=>m.type).sort(),['comms','fabricator','fabricator','recycler']);assert.ok(!sv.terrain.some(t=>['fabricator','recycler','comms'].includes(t.type)));
const back=codec.decode(codec.encode(sv));const r2={};r2.game=createRoom(back,{});r2.game.join('c2','Cap',true,'captain');
assert.equal(r2.game.run('[...terrain.values()].filter(t=>t.body).length'),4,'machines reload as physics objects');assert.equal(r2.game.run('[...terrain.values()].find(t=>t.kind==="munitions").materials.iron'),run('mf.materials.iron'));
// Clients get the beam length and the loader's swing (the beam never drew because it wasn't in the snapshot).
run(`addTerrain("pusher_block",${lx-3},${fy-2},2);`);step(3);const snap=r.game.snapshot('cap');
assert.ok(snap.terrain.some(t=>t.type==='pusher_block'&&t.beam>0),'beam length in snapshots');assert.ok(snap.terrain.some(t=>t.type==='loader'&&t.phase!=null),'loader swing in snapshots');
assert.ok(snap.machines.length===4&&snap.machines.every(m=>m.id&&Number.isFinite(m.x)),'machines in snapshots');
console.log('PASS: physics machines — placed off-grid, fall, pushed by pushers, fed by loaders, saved and reloaded; loader swing is the cooldown (deliver on arrival, no grab while returning); beams and swings reach clients.');
process.exit(0);
