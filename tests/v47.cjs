'use strict';
// v47: massive battleships. 80×80 ship tiles (drednot's own limit, ℵ10+), no cap on loaders or pushers, a ring of
// RC turrets fed by loaders, and the server keeping up: constant-time tile lookups, loaders that only look at nearby
// items, snapshots that resend tiles/machines/turrets only when they change, and Freeport berths sized to the ship.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js'),codec=require('../dist/modules/save-codec.js');
const bus=new ZoneBus();const rooms=[];const mk=id=>{const r={id,name:id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-c',id,true,'captain');r.run=c=>r.game.run(c);rooms.push(r);return r;};
const step=n=>{for(let i=0;i<n;i++){for(const r of rooms)r.game.tick(1/60);bus.step(rooms,1/60);}};
assert.deepEqual([era.SHIP_LIMITS.maxW,era.SHIP_LIMITS.maxH],[80,80]);
const B=mk('Battleship'),run=B.game.run;step(10);
// Grow to the limit with the ship's own resize rule (one more strip is refused).
run('bounds={l:-40,r:39,t:-40,b:39};rebuildShell();rebuildMounts();');run('inventory.embiggener=2;resizeShip("right",true)');assert.equal(run('bounds.r-bounds.l'),80,'grown to 80 wide');
run('resizeShip("right",true)');assert.equal(run('bounds.r-bounds.l'),80,'81 refused');
run(`bounds={l:-40,r:40,t:-40,b:40};for(const t of [...terrain.values()])if(t.f)interior.destroyFixture(t.f);terrain.clear();for(const b of [...blocks.values()])if(b.f)interior.destroyFixture(b.f);blocks.clear();helm={x:0,y:39};rebuildShell();
 mounts=[];for(let k=-38;k<=36;k+=3)for(const side of ['top','left','right'])mounts.push({type:'turret',side,at:k,rotation:0,ammo:16,ammoType:'ammo'});rebuildMounts();
 for(let x=-36;x<=36;x+=2){addTerrain('loader',x,-37,1);addTerrain('pusher_block',x,-35,0);}for(let y=-30;y<=30;y+=2){addTerrain('loader',-37,y,0);addTerrain('loader',37,y,2);addTerrain('pusher_block',-35,y,3);}
 for(let y=-36;y<=34;y+=2)for(let x=-37;x<=37;x++)if((x+y)%7===0&&!terrainAt({x,y}))addBlock(x,y,0);
 for(let k=0;k<300;k++)spawnItem(['ammo','iron','explosives'][k%3],V(-30+(k%60),-20+Math.floor(k/60)*6),V(0,0),4);updateShipMass();`);
assert.ok(run('[...terrain.values()].filter(t=>t.type==="loader").length')>48&&run('[...terrain.values()].filter(t=>t.type==="pusher_block").length')>48,'more than the old 48 cap of each');
assert.equal(run('mounts.filter(m=>m.f).length'),75,'75 RC turrets all mounted');
run('giveItem("loader",1);selectSlot(slots.indexOf("loader"));player.setTransform(V(0,30),0);');assert.doesNotMatch(run('validity({x:1,y:31},"loader")'),/maximum/,'no machine cap');
// Saves of a ship this size round-trip.
const back=codec.decode(codec.encode(JSON.parse(JSON.stringify(run('state()')))));assert.equal(back.bounds.r-back.bounds.l,80);
// Keeping up: well inside a 60 Hz tick on this machine (was ~280 ms before the lookups were indexed).
step(60);const t0=performance.now();step(240);const ms=(performance.now()-t0)/240;assert.ok(ms<16,'tick '+ms.toFixed(1)+' ms');
// Snapshots: first one complete; later ones leave out unchanged tiles and send machine/turret changes only.
const s1=JSON.parse(JSON.stringify(B.game.snapshot('Battleship-c')));step(3);const s2=JSON.parse(JSON.stringify(B.game.snapshot('Battleship-c')));
assert.ok(s1.blocks.length>300&&s1.terrain.length>100&&s1.mounts.length===75,'first snapshot is complete');
assert.equal(s2.blocks,null);assert.equal(s2.terrain,null);assert.ok(Array.isArray(s2.terrainDelta));
assert.ok(JSON.stringify(s2).length<JSON.stringify(s1).length/3,'later snapshots are a fraction of the size ('+(JSON.stringify(s2).length/1024|0)+' KB)');
// A client rebuilding from the slimmed snapshot gets exactly the server's lists.
const full=JSON.parse(JSON.stringify(run('state()'),(k,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1000)/1000:v));const rebuilt={terrain:s1.terrain.slice(),mounts:s1.mounts.slice()};for(const f of ['terrain','mounts']){if(s2[f])rebuilt[f]=s2[f];else for(const [i,t] of s2[f+'Delta']||[])rebuilt[f][i]=t;}
assert.deepEqual(rebuilt.terrain.map(t=>[t.type,t.x,t.y]),full.terrain.map(t=>[t.type,t.x,t.y]));assert.equal(rebuilt.mounts.length,full.mounts.length);
// Lag relief settles idle cargo but never merges stacks (item-logic builds count them).
const n0=run('items.length');run('lagRelief()');assert.equal(run('items.length'),n0,'no stacks merged by lag relief');
// Freeport: a second battleship gets its own berth, clear of the first and of the central dock.
const C=mk('Second');step(2);C.run('bounds={l:-30,r:30,t:-30,b:30};rebuildShell();updateShipMass();');C.run('zonePlaced=true;const p=safeArrival();ship.setTransform(p,0);');step(5);
const box=r=>{const p=r.game.run('ship.getPosition()'),e=r.game.run('shipExtents()');return [p.x+e.l,p.y+e.t,p.x+e.r,p.y+e.b];},[a,b]=[box(B),box(C)];
assert.ok(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],'the two battleships do not overlap');
{const z=C.run('zoneHalf()');assert.ok(b[0]>-z.w&&b[2]<z.w&&b[1]>-z.h&&b[3]<z.h,'inside Freeport');}
console.log('PASS: massive battleships — 80×80 limit, no loader/pusher cap, 75 RC turrets, '+ms.toFixed(1)+' ms ticks, slimmed snapshots rebuilt exactly, lag relief never merges stacks, sized Freeport berths.');
process.exit(0);
