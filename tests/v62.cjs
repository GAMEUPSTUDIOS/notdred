'use strict';
// v62: nothing is reached through a solid tile (settings windows for doors, pushers, loaders, hatches, signs, paint,
// spawn points; fabricators), and fabricators set finished items down at their item doors instead of flinging them.
const assert=require('node:assert/strict'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs');
const g=createRoom(null);g.join('c','c',true,'captain');for(let i=0;i<5;i++)g.tick(1/60);
const run=c=>g.run(c);
// ---- Fabricator output -------------------------------------------------------------------------------------------
run(`{globalThis._f=[...terrain.values()].find(t=>t.type==="fabricator");for(const i of [...items]){inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}_f.materials.iron=64;_f.materials.explosives=64;_f.queue=["block","block"];/* stand it on blocks (the starting ship has walkways under it, which items fall through) */for(const x of [-4,-3,-2]){const t=terrain.get(key(x,0));if(t){if(t.f)interior.destroyFixture(t.f);terrain.delete(key(x,0));}if(!blocks.has(key(x,0)))addBlock(x,0);}}`);
let out=null;for(let i=0;i<600&&!out;i++){g.tick(1/60);out=JSON.parse(run('JSON.stringify(items.length?(()=>{const it=items[0],p=it.body.getPosition(),v=it.body.getLinearVelocity();return {type:it.type,count:it.count,x:p.x,y:p.y,v:Math.hypot(v.x,v.y)}})():null)'));}
assert.ok(out,'a block came out');const fx=Number(run('_f.x')),fy=Number(run('_f.y'));
assert.ok(Math.abs(out.x-(fx+.02))<.05&&Math.abs(out.y-(fy+2.15))<.12,'it appears at the item doors ('+out.x.toFixed(2)+','+out.y.toFixed(2)+' vs fabricator '+fx+','+fy+')');
assert.ok(out.v<.5,'and is set down, not flung ('+out.v.toFixed(2)+' m/s)');
for(let i=0;i<600&&Number(run('items[0].count'))<2;i++)g.tick(1/60);
assert.equal(Number(run('items.length')),1,'the second batch tops up the stack at the doors');assert.equal(Number(run('items[0].count')),2);
for(let i=0;i<30;i++)g.tick(1/60);const p=JSON.parse(run('JSON.stringify(items[0].body.getPosition())'));assert.ok(Math.abs(p.x-(fx+.02))<.3,'and it stays put at the doors');
// A full or different stack in the way: the fabricator waits.
run('items[0].count=16;_f.queue=["block"];');for(let i=0;i<300;i++)g.tick(1/60);
assert.equal(Number(run('items.length')),1,'nothing new while a full stack sits at the doors');assert.ok(run('!!_f.job'),'the finished job waits');
run('items[0].body.setTransform(V(_f.x+3,_f.y+2),0)');for(let i=0;i<10;i++)g.tick(1/60);assert.equal(Number(run('items.length')),2,'and comes out once the doors are clear');
// ---- No reaching through solid tiles ------------------------------------------------------------------------------
// A pusher and a door behind a wall of blocks, the player on the other side.
// Above the starting ship's row of blocks at y=0: a wall at x=2, a door, a pusher and a sign behind it at x=3..4.
run(`{bindCrew("c");for(let y=-3;y<=-1;y++)if(!blocks.has(key(2,y))&&!terrain.has(key(2,y)))addBlock(2,y);addTerrain("pusher_block",3,-1);addTerrain("door",4,-3);addTerrain("sign",3,-3);player.setTransform(V(0.5,-1.1),0);storeCrew();}`);
for(let i=0;i<5;i++)g.tick(1/60);
const pusherSpeed=()=>Number(run('terrainAt({x:3,y:-1}).speed'));const s0=pusherSpeed();
g.command('c',{action:'pusher',cell:{x:3,y:-1},settings:{speed:s0===5?6:5}});assert.equal(pusherSpeed(),s0,'pusher settings can\'t be changed through a wall');
g.command('c',{action:'door',cell:{x:4,y:-3},access:'guest'});assert.equal(run('terrainAt({x:4,y:-3}).access'),'crew','door access can\'t be changed through a wall');
g.command('c',{action:'sign',cell:{x:3,y:-3},text:'hi'});assert.equal(run('terrainAt({x:3,y:-3}).text'),'','signs can\'t be edited through a wall');
// Open the wall: now they work.
run('{for(let y=-3;y<=-1;y++){const t=blocks.get(key(2,y));if(t){interior.destroyFixture(t.f);blocks.delete(key(2,y));}}}');for(let i=0;i<3;i++)g.tick(1/60);
g.command('c',{action:'pusher',cell:{x:3,y:-1},settings:{speed:s0===5?6:5}});assert.notEqual(pusherSpeed(),s0,'pusher settings work with a clear line');
g.command('c',{action:'door',cell:{x:4,y:-3},access:'guest'});assert.equal(run('terrainAt({x:4,y:-3}).access'),'guest','door access works with a clear line');
// The browser checks before opening the windows too.
const fs=require('node:fs');assert.ok(/if\(buildBlocked\(\{x:t\.x,y:t\.y\},t\.f\)\)\{toast\('A solid tile blocks your reach\.'\);return true;\}/.test(fs.readFileSync('dist/modules/hatches.js','utf8'))&&/\['door','sign','paint','spawn','comms'\]\.includes\(d\.type\)[^;]*buildBlocked/.test(fs.readFileSync('dist/network.js','utf8')),'settings windows don\'t open through a wall');
assert.ok(/function fabReach\(f\)\{[^}]*fabInSight\(f\)/.test(fs.readFileSync('dist/game.js','utf8')),'fabricators aren\'t used through a wall');
console.log('PASS: no reaching through solid tiles (pushers, doors, signs, settings windows, fabricators); fabricators set items down at their doors.');
