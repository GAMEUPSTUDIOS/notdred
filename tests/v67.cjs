'use strict';
// v67: pieces bigger than one tile turn their whole footprint (tiles, hitbox, preview and hover outlines) with them.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs');
const g=createRoom(null);g.join('c','c',true,'captain');for(let i=0;i<5;i++)g.tick(1/60);
const R=c=>JSON.parse(g.run(`(()=>{bindCrew("c");try{return JSON.stringify(${c});}finally{storeCrew();}})()`));
R('(player.setTransform(V(0,-1.1),0),1)');
// Footprints: a door is 1×2 extending down; each quarter turn swings it the way its sprite turns.
assert.deepEqual(R('terrainCells({type:"door",x:0,y:0,rotation:0})'),[{x:0,y:0},{x:0,y:1}]);
assert.deepEqual(R('terrainCells({type:"door",x:0,y:0,rotation:1})'),[{x:0,y:0},{x:-1,y:0}],'turned once it lies left');
assert.deepEqual(R('terrainCells({type:"door",x:0,y:0,rotation:2})'),[{x:0,y:0},{x:0,y:-1}]);
assert.deepEqual(R('terrainCells({type:"door",x:0,y:0,rotation:3})'),[{x:0,y:0},{x:1,y:0}]);
assert.deepEqual(R('terrainCells({type:"fabricator",x:0,y:0,rotation:1}).length'),6,'fabricators never turn');assert.deepEqual(R('terrainCells({type:"fabricator",x:0,y:0,rotation:1})[5]'),{x:1,y:2});
// Preview: footprint and centred anchor follow buildRotation.
assert.deepEqual(R('(buildRotation=1,footprintCells("door",{x:0,y:0}))'),[{x:0,y:0},{x:-1,y:0}]);
assert.deepEqual(R('(buildRotation=1,buildAnchor("door",V(-.5,0)))'),{x:0,y:0},'a sideways door centred on the aim');
assert.deepEqual(R('(buildRotation=0,buildAnchor("door",V(0,.5)))'),{x:0,y:0});
// Placing: the turned tiles are the ones checked and taken; the collision box lies the same way.
R('(()=>{for(const t of [...terrain.values()])if(!t.body&&t.type!=="fabricator"&&t.type!=="ladder"){if(t.f)interior.destroyFixture(t.f);terrain.delete(key(t.x,t.y));}for(const b of [...blocks.values()]){interior.destroyFixture(b.f);blocks.delete(key(b.x,b.y));}return 1})()');
R('(buildRotation=1,addTerrain("door",1,0,1),1)');
assert.equal(R('terrainAt({x:0,y:0})?.type'),'door','the door now covers the tile to its left');assert.equal(R('terrainAt({x:1,y:1})?.type||null'),null,'…not the tile below');
assert.match(R('(buildRotation=0,validity({x:0,y:-1},"door"))'),/./,'its turned tile blocks a door below it');
const box=R('(()=>{const t=terrainAt({x:1,y:0}),a=t.f.getAABB?t.f.getAABB(0):null;const vs=t.f.getShape().m_vertices.map(v=>[v.x,v.y]);const xs=vs.map(v=>v[0]),ys=vs.map(v=>v[1]);return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]})()');
assert.deepEqual(box.map(v=>Math.round(v*100)/100),[-.5,1.5,-.5,.5],'the door\'s hitbox spans both turned tiles');
R('(()=>{const t=terrainAt({x:1,y:0});setDoorAccess(t,"guest");return 1})()');
const box2=R('(()=>{const t=terrainAt({x:1,y:0});const vs=t.f.getShape().m_vertices;return [Math.min(...vs.map(v=>v.x)),Math.max(...vs.map(v=>v.x))]})()');
assert.deepEqual(box2.map(v=>Math.round(v*100)/100),[-.5,1.5],'…and keeps it when its access changes');
// Turning a placed door in place: it swings into new tiles, keeps its settings, and won't swing into something.
R('(tool="walk",mouse.x=0,mouse.y=0,1)');
const turned=R('(()=>{const t=terrainAt({x:1,y:0});mouse.active=true;const c={x:1,y:0};const orig=cursorCell;cursorCell=()=>c;try{rotateSelection();}finally{cursorCell=orig;}const n=terrainAt({x:1,y:0});return {r:n.rotation,access:n.access,cells:terrainCells(n)}})()');
assert.equal(turned.r,2);assert.equal(turned.access,"guest",'door access survives the turn');assert.deepEqual(turned.cells,[{x:1,y:0},{x:1,y:-1}]);
assert.equal(R('terrainAt({x:0,y:0})?.type||null'),null,'the old tile is free again');
// Outlines use the turned tiles.
assert.deepEqual(R('cellsBounds(terrainCells({type:"door",x:1,y:0,rotation:1}))'),{x:-.5,y:-.5,w:2,h:1});
const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/cellsBounds\(terrainCells\(t\)\)/.test(game)&&/cellsBounds\(footprintCells\(t,c\)\)/.test(game),'hover and preview outlines follow the footprint');
console.log('PASS: rotated multi-tile pieces — tiles, placement checks, door hitbox, rotate-in-place, preview and hover outlines all turn with the piece.');
process.exit(0);
