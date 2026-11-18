'use strict';
// v48: pusher beams are blocked by the first object in their path and act only on it (item logic: a stack in a beam
// shields what is behind it); signs (text) and paint blocks (any colour) — placed, edited by crew/captain, saved, and
// shown on other ships.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),era=require('../dist/modules/era.js'),codec=require('../dist/modules/save-codec.js');
const r={id:'L'};r.game=createRoom(null,{});r.game.join('cap','Cap',true,'captain');r.game.join('g','Guest',false,'guest');const run=r.game.run;const step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
run('bounds={l:-14,r:14,t:-6,b:5};rebuildShell();rebuildMounts();for(const i of [...items])inside.destroyBody(i.body);items.length=0;');
const fy=run('bounds.b-1'),x0=run(`(()=>{for(let x=bounds.l+1;x<bounds.r-12;x++){let ok=true;for(let k=0;k<12;k++)ok=ok&&!terrainAt({x:x+k,y:${fy}})&&!blocks.has(key(x+k,${fy}))&&!helmCells().some(h=>h.x===x+k&&h.y===${fy});if(ok)return x;}})()`);
assert.ok(x0!=null);
// A gate: a pusher, then a "key" stack, then a "payload" stack. The key shields the payload; take the key away and the
// payload is pushed.
run(`addTerrain("pusher_block",${x0},${fy},0);globalThis.keyItem=spawnItem("flux",V(${x0+2},${fy}),V(0,0),1);globalThis.payload=spawnItem("ammo",V(${x0+6},${fy}),V(0,0),4);`);
step(6);const beam0=run(`terrain.get(key(${x0},${fy})).beam`);assert.ok(beam0<3,'the beam stops at the key stack ('+beam0.toFixed(2)+')');
const p0=run('payload.body.getPosition().x');step(30);
assert.ok(run('payload.body.getPosition().x')-p0<.4||run('Math.abs(payload.body.getPosition().x-keyItem.body.getPosition().x)')<1,'payload shielded until the key reaches it');
run('inside.destroyBody(keyItem.body);items.splice(items.indexOf(keyItem),1);');const p1=run('payload.body.getPosition().x');step(30);
assert.ok(run('payload.body.getPosition().x')>p1+1,'key removed: the payload is pushed');
// Signs and paint blocks.
assert.ok(era.FABRICATORS.engineering.recipes.includes('sign')&&era.FABRICATORS.engineering.recipes.includes('paint'));
const sx=x0+9,sy=fy;run(`addTerrain("sign",${sx},${sy},0);addTerrain("paint",${sx+1},${sy},0);`);
assert.equal(run(`terrainAt({x:${sx+1},y:${sy}}).color`),era.PAINT_DEFAULT);assert.ok(run(`!!terrainAt({x:${sx+1},y:${sy}}).f`),'paint blocks are solid');assert.ok(run(`!terrainAt({x:${sx},y:${sy}}).f`),'signs are not');
run(`bindCrew("cap");player.setTransform(V(${sx-1},${sy}),0);storeCrew();bindCrew("g");player.setTransform(V(${sx-1},${sy}),0);storeCrew();`);
r.game.command('cap',{action:'sign',cell:{x:sx,y:sy},text:'2 RC for 1 crystal\u0007'});r.game.command('cap',{action:'paint',cell:{x:sx+1,y:sy},color:'#FF8800'});
assert.equal(run(`terrainAt({x:${sx},y:${sy}}).text`),'2 RC for 1 crystal ','text kept, control characters removed');assert.equal(run(`terrainAt({x:${sx+1},y:${sy}}).color`),'#ff8800');
r.game.command('cap',{action:'paint',cell:{x:sx+1,y:sy},color:'red; background:url(x)'});assert.equal(run(`terrainAt({x:${sx+1},y:${sy}}).color`),'#ff8800','bad colours refused');
r.game.command('g',{action:'sign',cell:{x:sx,y:sy},text:'vandal'});r.game.command('g',{action:'paint',cell:{x:sx+1,y:sy},color:'#000000'});
assert.equal(run(`terrainAt({x:${sx},y:${sy}}).text`),'2 RC for 1 crystal ','guests cannot edit signs');assert.equal(run(`terrainAt({x:${sx+1},y:${sy}}).color`),'#ff8800','or paint');
r.game.command('cap',{action:'sign',cell:{x:sx,y:sy},text:'x'.repeat(500)});assert.equal(run(`terrainAt({x:${sx},y:${sy}}).text.length`),era.SIGN_MAX,'capped length');
r.game.command('cap',{action:'sign',cell:{x:sx,y:sy},text:'FOR TRADE'});
// Saved, restored, and sent to other ships.
const sv=codec.decode(codec.encode(JSON.parse(JSON.stringify(run('state()')))));const r2={};r2.game=createRoom(sv,{});r2.game.join('c2','Cap',true,'captain');
assert.equal(r2.game.run(`terrainAt({x:${sx},y:${sy}}).text`),'FOR TRADE');assert.equal(r2.game.run(`terrainAt({x:${sx+1},y:${sy}}).color`),'#ff8800');
const L=r.game.zone.exteriorLayout();assert.ok(L.terrain.some(t=>t[0]==='sign'&&t[4]?.text==='FOR TRADE')&&L.terrain.some(t=>t[0]==='paint'&&t[4]?.color==='#ff8800'),'other ships see the text and colour');
console.log('PASS: pusher beams stop at and act on the first object (a stack shields what is behind it); signs and paint blocks — crew/captain edit, cleaned text and colours, saved, shown to other ships.');
process.exit(0);
