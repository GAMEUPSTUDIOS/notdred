'use strict';
// v64: shared-zone physics in native Box2D (C++) through the fast numbers bridge; smaller updates (compact bots,
// changes-only tiles and turrets for every ship size); far bots think less; unchanged ships aren't re-saved.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const native=require('../build/physics.node');assert.equal(typeof native.step2,'function','the native module has the numbers bridge (step2)');
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs');
const bus=new ZoneBus(),r={id:'A',name:'A'};r.game=createRoom(null,bus.hooksFor(r));r.game.join('c','c',true,'captain');
const step=n=>{for(let i=0;i<n;i++){r.game.tick(1/60);bus.step([r],1/60);}};step(5);
r.game.run('piloting=true;player.setActive(false);travelZone("sparrow","entry")');step(30);const sim=bus.simOf(r);
assert.equal(sim.run('typeof nativeStep'),'function','the zone simulation has the native solver');assert.ok(Number(sim.run('world.__nativeID'))>0,'…and its world is being solved natively');
// Native bodies move: a bot pushed by the zone moves, the ship flies.
const p0=JSON.parse(sim.run('JSON.stringify(fleet.get("A").body.getPosition())'));r.game.command('c',{action:'input',keys:{d:true}});step(60);
assert.ok(Number(sim.run('fleet.get("A").body.getPosition().x'))-p0.x>.3,'the ship flies in the native zone');
// Compact bots, unpacked for snapshot(); every ship size gets changes-only tile/turret updates.
const sh=JSON.parse(r.game.run('snapshotShared().json'));assert.ok(Array.isArray(sh.bots[0])&&sh.bots[0].length===7,'bots go out as compact arrays');
assert.equal(typeof r.game.snapshot('c').bots[0].p.x,'number','snapshot() unpacks them');
assert.ok(/s\.bots&&Array\.isArray\(s\.bots\[0\]\)/.test(fs.readFileSync('dist/network.js','utf8')),'the page unpacks them');
r.game.run('snapshotOwn("c",snapshotShared())');const own=r.game.run('JSON.stringify(snapshotOwn("c",snapshotShared()))');const o=JSON.parse(own);
assert.equal(o.terrain,null,'a small ship\'s tiles aren\'t resent when unchanged');assert.deepEqual(o.terrainDelta,[]);
// Far bots: decide every 6th step.
assert.ok(/BOT_FAR&&\(zsTick\+bot\.index\)%6/.test(fs.readFileSync('server/zone-runtime.js','utf8')),'bots far from every ship think less often');
// Saves and compression (server).
const srv=fs.readFileSync('server/server.cjs','utf8');assert.ok(/if\(periodic&&key===r\.savedKey/.test(srv),'the minute save skips unchanged ships');assert.ok(/perMessageDeflate:process\.env\.NOTDRED_DEFLATE==='0'\?false:\{/.test(srv),'updates are compressed');
console.log('PASS: native C++ zone physics (numbers bridge), compact bots, changes-only tiles for every ship, lighter far bots, skip unchanged saves, compression.');
process.exit(0);
