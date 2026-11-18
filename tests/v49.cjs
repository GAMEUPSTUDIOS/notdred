'use strict';
// v49: fabricators, recyclers and comms stations are placed freely (off the grid, resting on a surface) and then stay
// fixed (not pushed, crew and items pass through), still fed by loaders; a loader's swing is its cooldown; pusher beams and loader swings reach the clients.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),codec=require('../dist/modules/save-codec.js');
const r={id:'P'};r.game=createRoom(null,{});r.game.join('cap','Cap',true,'captain');const run=r.game.run;const step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
run('bounds={l:-14,r:14,t:-8,b:5};rebuildShell();rebuildMounts();for(const i of [...items])inside.destroyBody(i.body);items.length=0;');
const fy=run('bounds.b-1');
// The starter fabricator is a physics object.
assert.ok(run('!![...terrain.values()].find(t=>t.type==="fabricator").body'),'starter fabricator has a body');
// Placed off the grid where aimed, resting on the floor below the aim, and it stays there.
run('player.setTransform(V(-10,4),0);');run(`placingAim=V(6.3,-3.7);globalThis.mf=spawnMachine("fabricator",placementPoint({x:6,y:-4},"fab_munitions"));placingAim=null;mf.kind="munitions";`);step(120);
const mp=run('(({x,y})=>({x,y}))(mf.body.getPosition())');assert.ok(Math.abs(mp.x-6.3)<.05,'not snapped to the grid ('+mp.x.toFixed(2)+')');assert.ok(Math.abs(mp.y+1.5-(fy+.5))<.05,'resting on the floor');
// Not a physics object: a pusher beam leaves it where it is, and its support can't be pulled out from under it.
run(`addTerrain("pusher_block",2,${fy},0);`);step(240);assert.ok(Math.abs(run('mf.body.getPosition().x')-mp.x)<1e-6,'not pushed');
assert.equal(run(`machineOnTop({x:6,y:${fy+1}})===mf`),true,'the floor/blocks under it are its support');
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
// Free placement: an expando box and a fabricator go exactly where aimed horizontally and rest on the surface below;
// with nothing to stand on (aiming into a solid column of blocks' gap above the hull top) placement is refused.
run('for(const t of [...terrain.values()])if(t.body){inside.destroyBody(t.body);terrain.delete(t.key);}for(const b of [...boxes])inside.destroyBody(b.body);boxes.length=0;');
run(`bindCrew("cap");player.setTransform(V(-11,${fy}),0);mouse={x:0,y:0,active:false};placingAim=V(-4.37,${fy-3.2});storeCrew();`);
const bp=run(`(p=>p&&({x:p.x,y:p.y}))(placementPoint({x:-4,y:${fy-3}},"storage"))`);assert.ok(Math.abs(bp.x+4.37)<1e-6,'box x where aimed ('+bp.x+')');assert.ok(Math.abs(bp.y+1-(fy+.5))<.05,'box rests on the floor');
const fp=run(`(p=>p&&({x:p.x,y:p.y}))(placementPoint({x:-4,y:${fy-3}},"fab_munitions"))`);assert.ok(Math.abs(fp.x+4.37)<1e-6&&Math.abs(fp.y+1.5-(fy+.5))<.05,'fabricator x where aimed, resting on the floor');
run(`for(let x=-6;x<=-2;x++)addBlock(x,${fy-2},0);placingAim=V(-4.37,${fy-3});`);const onBlocks=run(`(p=>p&&({x:p.x,y:p.y}))(placementPoint({x:-4,y:${fy-3}},"storage"))`);assert.ok(Math.abs(onBlocks.y+1-(fy-2.5))<.05,'rests on the blocks below the aim');run(`placingAim=V(-4.37,${fy-.8});`);assert.ok(Math.abs(run(`placementPoint({x:-4,y:${fy-2}},"storage").y`)+1-(fy+.5))<.05,'aimed below the blocks: rests on the floor');
run(`placingAim=V(-4.37,${fy-3.2});giveItem("storage",1);selectSlot(slots.indexOf("storage"));commitBuild({x:-4,y:${fy-3}},"storage",0);placingAim=null;`);assert.ok(Math.abs(run('boxes[boxes.length-1].body.getPosition().x')+4.37)<1e-6,'built where aimed, not snapped');
// Crew and items pass straight through machines (no collision shape), and nothing can be placed on an expando box.
assert.equal(run('spawnMachine("fabricator",V(0,0)).body.getFixtureList()'),null,'no collision shape');
run(`for(const b of [...boxes])inside.destroyBody(b.body);boxes.length=0;for(const t of [...terrain.values()])if(t.body){inside.destroyBody(t.body);terrain.delete(t.key);}globalThis.bx2=spawnBox(V(8,${fy-.5}),{});placingAim=V(8,${fy-3});`);
const onBox=run(`(p=>p&&({x:p.x,y:p.y}))(placementPoint({x:8,y:${fy-3}},"comms"))`);run('placingAim=null;');assert.ok(Math.abs(onBox.y+1-(fy+.5))<.05,'the box is not a surface: it would go to the floor');assert.equal(run(`machineSpace("comms",V(${onBox.x},${onBox.y}))`),false,'and the box is in the way, so it is refused');
console.log('PASS: machines placed freely (off-grid, resting on a surface; boxes too; never on expando boxes) and then fixed — not pushed, supports protected, crew pass through — fed by loaders, saved and reloaded; loader swing is the cooldown (deliver on arrival, no grab while returning); beams and swings reach clients.');
process.exit(0);
