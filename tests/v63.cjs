'use strict';
// v63: dev live code (ship / zone / screen, devTick, devDraw shapes for everyone aboard) and smooth dev noclip.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom,showValue}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs');
const bus=new ZoneBus(),r={id:'A',name:'A'};r.game=createRoom(null,bus.hooksFor(r));r.game.join('c','c',true,'captain');
const step=n=>{for(let i=0;i<n;i++){r.game.tick(1/60);bus.step([r],1/60);}};step(5);
// Ship code runs as the caller, returns text, and changes the game.
assert.equal(r.game.evalCode('c','me'),'"c"');assert.equal(r.game.evalCode('c','giveItem("iron",16);slots.includes("iron")'),'true','runs as you (your inventory)');
assert.throws(()=>r.game.evalCode('c','while(true){}'),/timed out/i,'an endless loop is stopped');step(1);
assert.throws(()=>r.game.evalCode('c','nope()'),/nope is not defined/);
// devDraw goes out in every crew snapshot, cleaned to plain shapes.
r.game.evalCode('c',"devDraw=[{type:'circle',x:1,y:2,r:3,color:'#0ff',evil:{a:1}},{type:'text',x:0,y:0,text:'hi'},null,{type:'bogus',x:'5'}]");step(1);
let sh=JSON.parse(r.game.run('JSON.stringify(snapshotShared().json?JSON.parse(snapshotShared().json).devDraw:null)'));
assert.equal(sh.length,3,'bad entries dropped');assert.deepEqual(Object.keys(sh[0]).includes('evil'),false,'only known fields');assert.equal(sh[0].space,'ship');assert.equal(sh[2].type,'circle','unknown types become circles');
// devTick runs every tick; an error switches it off.
r.game.evalCode('c','devCount=0;devTick=dt=>{devCount++}');step(10);assert.equal(Number(r.game.run('devCount')),10,'devTick runs every tick');
r.game.evalCode('c','devTick=dt=>{throw Error("boom")}');step(2);assert.equal(r.game.run('typeof devTick'),'object','a failing devTick is switched off (null)');
r.game.evalCode('c','devTick=dt=>{while(true){}}');step(1);assert.equal(r.game.run('typeof devTick'),'object','an endless devTick is stopped and switched off');
// Zone code and zone shapes (world space by default).
r.game.run('piloting=true;player.setActive(false);travelZone("finch2","entry")');step(25);const sim=bus.simOf(r);assert.ok(sim,'in the shared zone');
assert.equal(showValue(sim.evalCode('allBots().filter(b=>b.species==="silver").length')),'6','zone code sees the zone (silver bots in Finch II)');
sim.evalCode("devDraw=[{type:'line',x:0,y:0,x2:10,y2:10}]");step(1);sh=JSON.parse(r.game.run('JSON.stringify(JSON.parse(snapshotShared().json).zoneDevDraw)'));assert.equal(sh[0].space,'world','zone shapes are drawn in the world');
// The server only takes live code with the host token; the page runs it, draws the shapes, and predicts noclip.
const srv=fs.readFileSync('server/server.cjs','utf8'),net=fs.readFileSync('dist/network.js','utf8'),game=fs.readFileSync('dist/game.js','utf8');
assert.ok(/if\(m\.type==='eval'\)\{[^]*?if\(!ws\.admin\)/.test(srv),'live code needs the host token');
assert.ok(/drawDevShapes\('world'\)/.test(game)&&/drawDevShapes\('ship'\)/.test(game),'shapes drawn in the world and inside the ship');
assert.ok(/function netNoclip\(on\)/.test(net)&&/if\(netNoclip\(predictCrew\)\)inside\.step\(pdt\)/.test(net),'the page predicts noclip flight');
assert.ok(/if\(!piloting&&!\(typeof currentCrew!=='undefined'&&currentCrew\?\.noclip\)\)\{const p=localPlayer\(\),x=clamp/.test(game),'noclip flight may leave the hull (no clamp)');
console.log('PASS: dev live code (ship, zone, screen; devTick; devDraw for everyone, cleaned; time limits) and smooth dev noclip.');
process.exit(0);
