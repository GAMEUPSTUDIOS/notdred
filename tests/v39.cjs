'use strict';
// v39: every rank can build and dismantle; captains build doors and choose who may pass (captain only, crew and
// captain, or everyone). Doors stop loose items, keep their setting in saves, and show the original door art.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),codec=require('../dist/modules/save-codec.js');

let g=createRoom(null,{});g.join('c','Cap',false,'captain');g.join('w','Crewman',false,'crew');g.join('g','Guest',false,'guest');
const run=c=>g.run(c);
// Permissions: guests may build and dismantle now; only the captain builds or sets doors.
assert.equal(run('allowed(crew.get("g"),"remove")'),true,'guests can dismantle');assert.equal(run('allowed(crew.get("g"),"rotate")'),true,'guests can rotate');
assert.equal(run('allowed(crew.get("g"),"edit")'),true,'guests can build');assert.equal(run('allowed(crew.get("g"),"helm")'),false,'guests still cannot fly');
assert.equal(run('allowed(crew.get("w"),"door")'),false,'crew cannot set doors');assert.equal(run('allowed(crew.get("c"),"door")'),true);
assert.equal(run('(()=>{bindCrew("w");return validity({x:3,y:1},"door")})()'),'Only the captain can build doors.');
assert.equal(run('(()=>{bindCrew("c");return validity({x:3,y:1},"door")})()'),'','the captain can');
assert.notEqual(run('(()=>{bindCrew("c");return validity({x:3,y:2},"door")})()'),'','a door needs two tiles');
run('bindCrew("c");inventory.door=(inventory.door||0)+1;commitBuild({x:3,y:1},"door",0)');assert.equal(run('terrainAt({x:3,y:2})?.type'),'door','1×2 door built');
assert.equal(run('terrain.get(key(3,1)).access'),'crew','new doors let crew and captain through');

// Walk each rank at the door from the left for 1.5 s and see who gets through.
function walk(id){run(`{const c=crew.get(${JSON.stringify(id)});c.player.setTransform(V(0,1.85),0);c.player.setLinearVelocity(V(0,0));}`);
 for(const other of ['c','w','g'])g.command(other,{action:'input',keys:{d:other===id}});for(let i=0;i<90;i++)g.tick(1/60);g.command(id,{action:'input',keys:{}});
 const x=run(`(storeCrew(),crew.get(${JSON.stringify(id)}).player.getPosition().x)`);run(`crew.get(${JSON.stringify(id)}).player.setTransform(V(-3,1.85),0)`);return x;}
const through=id=>walk(id)>3.4;
for(const id of ['c','w','g'])run(`crew.get("${id}").player.setTransform(V(-3,1.85),0)`);
assert.ok(through('c'),'captain passes a crew door');assert.ok(through('w'),'crew passes a crew door');assert.ok(!through('g'),'guest is stopped by a crew door');
g.command('w',{action:'door',cell:{x:3,y:1},access:'guest'});assert.equal(run('terrain.get(key(3,1)).access'),'crew','crew cannot change a door');
g.command('c',{action:'door',cell:{x:3,y:1},access:'captain'});assert.equal(run('terrain.get(key(3,1)).access'),'captain');
assert.ok(through('c'),'captain passes a captain-only door');assert.ok(!through('w'),'crew is stopped by a captain-only door');assert.ok(!through('g'));
g.command('c',{action:'door',cell:{x:3,y:2},access:'guest'});assert.equal(run('terrain.get(key(3,1)).access'),'guest','either tile of the door works');assert.ok(through('g'),'everyone passes an open door');
// Promotion changes who passes at once.
g.command('c',{action:'door',cell:{x:3,y:1},access:'crew'});assert.ok(!through('g'));g.setRank('g','crew');assert.ok(through('g'),'promoted to crew → passes');g.setRank('g','guest');
// Loose items never pass.
run('spawnItem("iron",V(1.6,2.1),V(9,0),4)');for(let i=0;i<90;i++)g.tick(1/60);assert.ok(run('items.filter(i=>i.type==="iron").every(i=>i.body.getPosition().x<3)'),'doors stop loose items');
// The setting is saved with the ship.
const saved=codec.decode(codec.encode(run('durableState()')));assert.equal(saved.terrain.find(t=>t.type==='door').access,'crew');
g.dispose?.();g=createRoom(saved,{});g.join('c2','Cap',false,'captain');assert.equal(g.run('terrain.get(key(3,1)).access'),'crew','door setting survives a reload');
assert.ok(fs.existsSync('dist/sprites/official-door_frame.png')&&fs.existsSync('dist/sprites/official-door.png'),'original door art');
assert.ok(require('../dist/modules/era.js').FABRICATORS.starter.recipes.includes('door'),'doors are crafted at the starter fabricator');
console.log('PASS: doors — all ranks build/dismantle, only the captain builds and sets doors (captain only / crew and captain / everyone), players pass by rank, promotions apply at once, items are always stopped, setting saved.');
