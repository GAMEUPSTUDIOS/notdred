'use strict';
// v68: rounds fly through a critical ship and damage the tile they actually run into; the Pits treasure is reachable;
// boulders start clear of the walls; far bots and resting boulders aren't re-sent every snapshot.
const assert=require('node:assert/strict'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js'),Z=require('../dist/zone-generator.js');
const bus=new ZoneBus();
function ship(id,name){const r={id,name};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-crew',name,true);r.run=c=>r.game.run(c);return r;}
const A=ship('A','Alpha'),B=ship('B','Bravo'),ships=[A,B];const go=(r,z)=>r.game.command(r.id+'-crew',{action:'dev',op:z});
let holdCritical=true;const step=(n=1)=>{for(let i=0;i<n;i++){if(holdCritical)B.run('shipHP=0;lastShieldHit=clock');for(const r of ships)r.game.tick(1/60);bus.step(ships,1/60);}};
const clearArena='botsPaused=true;for(const b of [...bots])world.destroyBody(b.body);bots=[];enemyShots=[];shots=[];for(const b of [...boulders])world.destroyBody(b.body);boulders=[];for(const [id,k] of [...rocks])if(Math.abs(k.x)<60&&Math.abs(k.y)<30)removeRock(id,false);rebuildDirtyRockChunks();';
const sim=z=>bus.sims.get(z);
for(const r of ships){go(r,'sparrow');r.run(clearArena+'piloting=false;');}step(1);sim('sparrow').run(clearArena);
A.run('ship.setTransform(V(-25,0),0);ship.setLinearVelocity(V(0,0));zonePlaced=true;shipHP=shipMaxHP()');B.run('ship.setTransform(V(20,0),0);ship.setLinearVelocity(V(0,0));zonePlaced=true;shipHP=0;CRITICAL.shrinkChance=0');step(2);
// Put a block on B's middle row, a few tiles in from its left wall.
const row=B.run('Math.round((bounds.t+bounds.b)/2)'),col=B.run('bounds.l+4');
B.run(`(()=>{for(let x=bounds.l+1;x<bounds.r;x++){const t=blocks.get(key(x,${row}));if(t){interior.destroyFixture(t.f);blocks.delete(key(x,${row}));}const u=terrainAt({x,y:${row}});if(u&&!u.body){if(u.f)interior.destroyFixture(u.f);terrain.delete(key(u.x,u.y));}}addBlock(${col},${row});return 1})()`);
const hp0=B.run(`blocks.get(key(${col},${row})).hp??100`);
A.run(`shots.push({p:V(ship.getPosition().x+9,ship.getWorldPoint(V(0,${row})).y-ship.getPosition().y+ship.getPosition().y),v:V(60,0),life:3,type:'ammo',maxLife:3})`);
let sawInside=false;for(let i=0;i<90;i++){step(1);if(sim('sparrow').run('shots.some(s=>s.inside!=null)'))sawInside=true;}
assert.ok(sawInside,'the round went inside the critical hull and kept flying');
assert.ok(B.run(`(blocks.get(key(${col},${row}))?.hp??0)`)<hp0,'…and damaged the block it ran into');
// No tile in the way: it flies out the far side.
B.run(`(()=>{const t=blocks.get(key(${col},${row}));if(t){interior.destroyFixture(t.f);blocks.delete(key(${col},${row}));}return 1})()`);
A.run(`shots.push({p:V(ship.getPosition().x+9,ship.getWorldPoint(V(0,${row})).y),v:V(60,0),life:3,type:'ammo',maxLife:3})`);
let exited=false;for(let i=0;i<120;i++){step(1);if(sim('sparrow').run(`shots.some(s=>s.inside==null&&s.passed!=null&&s.p.x>${B.run('ship.getWorldPoint(V(bounds.r,0)).x')}+1)`))exited=true;}
assert.ok(exited,'a round that meets nothing inside leaves through the far side');
// Bot rounds too.
B.run(`addBlock(${col},${row})`);const hpB=B.run(`blocks.get(key(${col},${row})).hp??100`);sim('sparrow').run(`enemyShots.push({p:V(${B.run('ship.getWorldPoint(V(bounds.l,0)).x')}-6,${B.run(`ship.getWorldPoint(V(0,${row})).y`)}),v:V(60,0),life:3,type:'ammo',damage:20})`);
let botIn=false;for(let i=0;i<60;i++){step(1);if(sim('sparrow').run('enemyShots.some(s=>s.inside!=null)'))botIn=true;}assert.ok(botIn&&B.run(`(blocks.get(key(${col},${row}))?.hp??0)`)<hpB,'bot rounds go in and strike tiles too');
// Shields up: it stops at the hull as before.
holdCritical=false;B.run('shipHP=shipMaxHP()');const sh=B.run('shipHP');A.run(`shots.push({p:V(ship.getPosition().x+9,ship.getWorldPoint(V(0,${row})).y),v:V(60,0),life:3,type:'ammo',maxLife:3})`);step(60);
assert.ok(B.run('shipHP')<sh&&!sim('sparrow').run('shots.some(s=>s.inside!=null)'),'shields still take hits at the hull');
// The Pits: no hazard wall between each hole's room and its loot band.
{const g=Z.generate(4242,era.ZONES.pits.gen),P=g.pit;for(const r of P.rooms)for(let x=r.x0;x<=r.x1;x++)for(let y=r.y1+1;y<P.band.y0;y++)assert.notEqual(g.kinds[y*g.width+x],1,'no hazard wall under the loot room');assert.equal(P.band.y0,P.rooms[0].y1+1,'loot band starts right under the room');}
// ---- One ship on its own: ladders, machines, boxes, shredders ---------------------------------------------------------
{const g=createRoom(null);g.join('c','c',true,'captain');for(let i=0;i<5;i++)g.tick(1/60);const R=c=>JSON.parse(g.run(`(()=>{bindCrew("c");try{return JSON.stringify(${c});}finally{storeCrew();}})()`));
 // The starter ship's ladder leads up to a walkway: climb to the top, A steps you onto it.
 R('(player.setTransform(V(-1,1.86),0),player.setLinearVelocity(V(0,0)),1)');for(let i=0;i<150;i++){g.command('c',{action:'input',keys:{w:true}});g.tick(1/60);}
 for(let i=0;i<40;i++){g.command('c',{action:'input',keys:{a:true}});g.tick(1/60);}for(let i=0;i<30;i++){g.command('c',{action:'input',keys:{}});g.tick(1/60);}
 const off=R('[player.getPosition().x,player.getPosition().y,climbing,grounded]');assert.ok(off[0]<-1.6&&Math.abs(off[1]+1.13)<.05&&!off[2]&&off[3],'off the top of the ladder onto the walkway: '+off);
 // Breaking a fabricator drops its contents beside it (not into a full inventory), all of it pick-up-able.
 const fab=R(`(()=>{const f=[...terrain.values()].find(t=>t.type==='fabricator');f.materials={iron:40,explosives:20};slots=['wrench','explosives','explosives','explosives','explosives'];stackCounts=[1,16,16,16,16];selected=0;tool='walk';for(const i of items)inside.destroyBody(i.body);items.length=0;const p=f.body.getPosition();player.setTransform(V(p.x+1.5,p.y+.3),0);removeAt({x:Math.round(p.x),y:Math.round(p.y)});return items.map(i=>i.type+':'+i.count)})()`);
 assert.ok(fab.includes('iron:16')&&fab.filter(x=>x.startsWith('explosives')).length>=1&&fab.some(x=>x.startsWith('fab_')),'contents and the fabricator drop beside it: '+fab);
 // A machine whose support is removed comes down as its item.
 R(`(()=>{addTerrain('comms',3,-2,0);slots=['wrench',null,null,null,null];stackCounts=[1,0,0,0,0];player.setTransform(V(2,1.8),0);for(let i=0;i<5;i++)inside.step(1/60);removeAt({x:3,y:0});return 1})()`);
 assert.ok(R(`![...terrain.values()].some(t=>t.type==='comms')&&items.some(i=>i.type==='comms')`),'unsupported comms station drops as its item');
 // Expando boxes: no fixed cap — they take items while they can grow.
 const box=R(`(()=>{for(const b of boxes)inside.destroyBody(b.body);boxes.length=0;bounds={l:-14,r:14,t:-10,b:6};rebuildShell();rebuildMounts();const b=spawnBox(V(9,-6));b.materials={iron:400};return resizeBox(b)?b.size:0})()`);assert.ok(box>3,'a box holds more than 256 when it has room ('+box+')');
 assert.equal(R('state().boxes.find(x=>x.size>3)?.size>3'),true,'snapshots carry each box\'s size');assert.ok(/if\(b\.size&&Math\.abs\(b\.size-o\.size\)>\.001\)\{o\.body\.destroyFixture/.test(require('fs').readFileSync('dist/network.js','utf8')),'the page resizes its copy of a box that grew');
 // Golden shredder: no cooldown; the ordinary one waits.
 const sh=R(`(()=>{const out=[];for(const tl of ['shredder_gold','shredder']){giveItem(tl,1);tool=tl;const p=player.getPosition();const a=spawnItem('iron',V(p.x+1,p.y),V(0,0),4),b=spawnItem('flux',V(p.x-1,p.y),V(0,0),4);out.push([shredAt(a.body.getPosition()),shredAt(b.body.getPosition())]);}return out})()`);
 assert.deepEqual(sh,[[true,true],[true,false]],'golden shredder has no cooldown');assert.ok(era.GOLDEN_SHREDDER_CHANCE===.02,'2% of green bots');}
console.log('PASS: critical ships let rounds in to strike tiles; shields still stop them; the Pits treasure is reachable; ladder tops, dropped machines and contents, uncapped expando boxes, golden shredder.');process.exit(0);
