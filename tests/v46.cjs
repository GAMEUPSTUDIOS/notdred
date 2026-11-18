'use strict';
// v46: automated recycling. A loader facing into a recycler feeds it a stack whenever it is idle (holding anything
// that can't be recycled); a loader beside it unloads what drops out. Nothing thrown or pushed in is recycled.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs');
const r={id:'R'};r.game=createRoom(null,{});r.game.join('c','R',true,'captain');const run=r.game.run;const step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
run('bounds={l:-14,r:14,t:-6,b:5};rebuildShell();rebuildMounts();for(const i of [...items])inside.destroyBody(i.body);items.length=0;');
// A free stretch of floor: feed side (2 tiles), recycler (3), output side (2).
const fy=run('bounds.b-1'),rx=run(`(()=>{for(let x=bounds.l+3;x<bounds.r-5;x++){let ok=fabFits(x,${fy}-3,true,"recycler");for(const dx of [-3,-2,-1,3,4,5])ok=ok&&!terrainAt({x:x+dx,y:${fy}})&&!blocks.has(key(x+dx,${fy}))&&!helmCells().some(h=>h.x===x+dx&&h.y===${fy});if(ok)return x;}})()`);
assert.ok(rx!=null,'room for the line');const ry=fy-3;
const sum=(type,x0,x1)=>run(`items.filter(i=>i.type==="${type}"&&i.body.getPosition().x>${x0}&&i.body.getPosition().x<${x1}).reduce((a,i)=>a+i.count,0)`);
run(`addTerrain("recycler",${rx},${ry},0);addTerrain("loader",${rx-1},${fy},0);addTerrain("loader",${rx+3},${fy},0);globalThis.box=spawnBox(V(${rx+4.5},${fy-.5}));`);

// Feed: three stacks of 16 standard ammo, one after another on the feed loader's input tile.
let fed=0;for(let k=0;k<3;k++){run(`spawnItem("ammo",V(${rx-2},${fy}),V(0,0),16)`);step(150);}
fed=48;// 48 ammo cost 12 iron + 12 explosives; half back = 6 + 6.
step(900);
assert.equal(sum('ammo',-99,99),0,'all ammo went in through the feed loader');
assert.equal(run('box.materials.iron||0'),6,'output loader unloaded the iron into the expando box');assert.equal(run('box.materials.explosives||0'),6,'…and the explosives');
assert.equal(run(`items.filter(i=>i.body.getPosition().x>${rx-.5}&&i.body.getPosition().x<${rx+2.5}).length`),0,'nothing left inside the recycler');

// The feed loader holds what can't be recycled (iron) instead of dumping it inside.
run(`spawnItem("iron",V(${rx-2},${fy}),V(0,0),10)`);step(200);
assert.equal(run(`terrainAt({x:${rx-1},y:${fy}}).cargo?.[0]?.type`),'iron','iron held in the feed loader');
run(`terrainAt({x:${rx-1},y:${fy}}).cargo=[];`);

// A stationary pusher it makes (from a handheld pusher) is unloaded, not recycled again.
run(`spawnItem("pusher",V(${rx-2},${fy}),V(0,0),1)`);step(400);
assert.equal(run('box.materials.pusher_block||0'),1,'stationary pusher came out and stayed whole');

// Pushers can't load a recycler: a stack shoved against it passes it by, unrecycled (only loaders feed it).
run(`for(const k of [${rx-1},${rx+3}]){const t=terrainAt({x:k,y:${fy}});if(t.f)interior.destroyFixture(t.f);terrain.delete(key(k,${fy}));}for(const i of [...items])inside.destroyBody(i.body);items.length=0;inside.destroyBody(box.body);boxes.splice(boxes.indexOf(box),1);addTerrain("pusher_block",${rx-3},${fy},0);spawnItem("ammo",V(${rx-1.6},${fy}),V(0,0),16);`);
step(300);assert.equal(sum('ammo',-99,99),16,'pushed against it, not recycled');
// Loaders fill a thruster's tanks (fuel or explosives only, up to THRUSTER_TANK each).
run('globalThis.__th={type:"thruster"};globalThis.__mh=mountHit;mountHit=()=>__th;');
assert.equal(run('loaderGive({},{x:99,y:99},{type:"fuel",count:12},V(1,0))'),12);assert.equal(run('loaderGive({},{x:99,y:99},{type:"fuel",count:12},V(1,0))'),4,'tank tops out at 16');
assert.equal(run('loaderGive({},{x:99,y:99},{type:"iron",count:5},V(1,0))'),0,'not iron');run('mountHit=__mh;');
console.log('PASS: automated recycling — feed loader into a recycler (holds what can\'t be recycled), unload loader for its output into an expando box, pushers can\'t load it (solid); loaders fill thruster tanks.');
process.exit(0);
