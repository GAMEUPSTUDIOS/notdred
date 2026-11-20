'use strict';
// v54: fabricators side by side (or next to the starter) each work: crafting and loading go to the fabricator whose
// window is open (named by id) when it's in reach, else the nearest one — not the first one found. Loading messages.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs');
const g=createRoom(null,{});g.join('a','A',true,'captain');const run=g.run,step=n=>{for(let i=0;i<n;i++)g.tick(1/60);};
run('bounds={l:-5,r:16,t:-4,b:3};rebuildShell();rebuildMounts();globalThis.mu=spawnMachine("fabricator",V(8,1));mu.kind="munitions";mu.materials={iron:20,explosives:20};globalThis.en=spawnMachine("fabricator",V(10.2,1));en.kind="engineering";en.materials={iron:20};');
const notices=()=>run('JSON.stringify((crew.get("a").notices||[]).splice(0))');
// Standing in front of the engineering fabricator: it's the nearest, even though the munitions one is in reach too.
run('bindCrew("a");player.setTransform(V(10.4,bounds.b-1),0);storeCrew();');step(3);
assert.equal(run('(bindCrew("a"),nearFab().kind)'),'engineering','nearest, not first');
g.command('a',{action:'craft',item:'wrench',count:1});step(2);assert.equal(run('en.job?.type'),'wrench','engineering crafts');
// Named by id: the munitions fabricator (window open on it) crafts ammo from the same spot.
g.command('a',{action:'craft',item:'ammo',count:1,fab:run('mu.id')});step(2);assert.equal(run('mu.job?.type'),'ammo','munitions crafts when its window is the one open');notices();
// Loading by clicking: the clicked fabricator gets it, with an accurate message; a refused item isn't reported as loaded.
run('bindCrew("a");giveItem("explosives",8);storeCrew();');g.command('a',{action:'select',slot:run('(bindCrew("a"),slots.indexOf("explosives"))')});
const aimAt=f=>run(`(q=>({x:q.x,y:q.y}))(ship.getWorldPoint(V(Math.round(${f}.body.getPosition().x),Math.round(${f}.body.getPosition().y))))`);
g.command('a',{action:'edit',aim:aimAt('en')});let n=JSON.parse(notices());assert.ok(n.some(t=>/not an ingredient/.test(t))&&!n.some(t=>/Loaded/.test(t)),'refused, not "loaded": '+JSON.stringify(n));
g.command('a',{action:'edit',aim:aimAt('mu')});n=JSON.parse(notices());assert.ok(n.some(t=>/^Loaded 8 Explosives into the munitions fabricator\.$/.test(t)),JSON.stringify(n));assert.equal(run('mu.materials.explosives'),27,'19 left after the ammo job + 8');
// The browser keeps the open window on its fabricator, and sends its id with crafting actions.
const net=fs.readFileSync('dist/network.js','utf8');assert.ok(/netAction\('craft',\{item,count,fab:fabID\(\)\}\)/.test(net)&&!/activeFab=nearFab\(\);if\(activeFab\)renderRecipes/.test(net));
console.log('PASS: fabricators side by side each work (nearest one, or the one whose window is open), accurate loading messages.');
process.exit(0);
