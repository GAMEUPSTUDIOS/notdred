'use strict';
// v60: smooth tile surfaces and a server-paced clock.
//  * Interior tiles collide through one outline per connected patch (chain loops), not per-tile boxes, so nothing
//    catches on the seams between tiles (players hopping, cargo snagging in pusher streams, the ladder sticking).
//  * The page measures how fast the server's clock runs and paces playback/prediction to it (busy hosts).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs');
const g=createRoom(null);g.join('c','c',true,'captain');for(let i=0;i<5;i++)g.tick(1/60);
// Outlines: one cell, an L, a ring (outer + hole), two cells touching only at a corner.
const loops=cells=>JSON.parse(g.run(`JSON.stringify(cellLoops(new Set(${JSON.stringify(cells)})))`));
const area=l=>l.reduce((s,[x,y],i)=>{const [a,b]=l[(i+1)%l.length];return s+x*b-a*y;},0)/2;
{const one=loops(['0,0']);assert.equal(one.length,1);assert.equal(one[0].length,4);assert.equal(area(one[0]),1,'a square, counter-clockwise');
 const L=loops(['0,0','1,0','2,0','0,1']);assert.equal(L.length,1);assert.equal(L[0].length,6,'an L has 6 corners (straight runs merged)');assert.equal(area(L[0]),4);
 const ring=[];for(let x=0;x<3;x++)for(let y=0;y<3;y++)if(!(x===1&&y===1))ring.push(x+','+y);const r=loops(ring).map(area).sort((a,b)=>a-b);assert.deepEqual(r,[-1,9],'a ring: outer loop and a clockwise hole');
 const d=loops(['0,0','1,1']);assert.equal(d.length,2,'diagonal neighbours are separate loops');for(const l of d)assert.equal(new Set(l.map(String)).size,l.length,'no repeated corners');}
// The ship: tile boxes no longer collide, the skin does; it follows building and removal.
const skin=()=>JSON.parse(g.run('(()=>{syncSkin();let chains=0,boxesLive=0,boxesOff=0;for(let f=skinBody.getFixtureList();f;f=f.getNext())if(f.getShape().getType()==="chain")chains++;for(const t of blocks.values())f2(t.f);function f2(f){if(f.getFilterMaskBits()===0)boxesOff++;else boxesLive++;}return JSON.stringify({chains,boxesLive,boxesOff,cat:[...blocks.values()].every(t=>t.f.getFilterCategoryBits()===1)});})()'));
let s=skin();assert.ok(s.chains>=1&&s.boxesLive===0&&s.boxesOff>0&&s.cat,'tile boxes stay (category kept for lookups) but only the outline collides');
const before=s.chains;g.run('addBlock(0,-2)');s=skin();assert.equal(s.chains,before+1,'a lone new block gets its own outline');g.run('{const t=blocks.get(key(0,-2));interior.destroyFixture(t.f);blocks.delete(key(0,-2));}');assert.equal(skin().chains,before,'removed again');
// The player walks across a row of separate blocks without hopping (native Box2D on the server).
g.run(`{for(const t of [...terrain.values()])if(t.y===0||t.y===-1){if(t.f)interior.destroyFixture(t.f);terrain.delete(key(t.x,t.y));}for(const t of [...blocks.values()])if(t.y===0){interior.destroyFixture(t.f);blocks.delete(key(t.x,t.y));}for(let x=bounds.l+1;x<bounds.r;x++)addBlock(x,0);bindCrew("c");player.setTransform(V(bounds.l+1.5,-1.1),0);player.setLinearVelocity(V(0,0));storeCrew();}`);
for(let i=0;i<20;i++)g.tick(1/60);let maxVy=0,x0=null,x1=null;for(let i=0;i<70;i++){g.command('c',{action:'input',keys:{d:true}});g.tick(1/60);const [x,vx,vy]=JSON.parse(g.run('(()=>{bindCrew("c");const p=player.getPosition(),v=player.getLinearVelocity();storeCrew();return JSON.stringify([p.x,v.x,v.y])})()'));if(x0==null)x0=x;x1=x;if(Math.abs(vx)>1)maxVy=Math.max(maxVy,Math.abs(vy));}
assert.ok(x1-x0>3,'the player ran across ('+(x1-x0).toFixed(2)+' m)');assert.ok(maxVy<.05,'no hop at the seams between blocks (max |vy| '+maxVy.toFixed(3)+')');
// The native bridge sends chain loops.
assert.ok(/entry\.shape==='chain'/.test(fs.readFileSync('server/native-physics.cjs','utf8'))&&/CreateLoop/.test(fs.readFileSync('native/physics.cpp','utf8')),'native physics builds chain loops');
// Server-paced clock: snapshots every 3 ticks arriving every 100 ms = a server at half speed.
{const src=fs.readFileSync('dist/network.js','utf8'),a=src.indexOf('const netClock={'),b=src.indexOf('function makeTrack(){');const netClock=new Function(src.slice(a,b)+';return netClock;')();
 for(let i=0;i<40;i++)netClock.note(i*3,i*100);assert.ok(Math.abs(netClock.rate-.5)<.03,'measures a half-speed server ('+netClock.rate.toFixed(3)+')');
 const r1=netClock.renderTime(4000),r2=netClock.renderTime(5000);assert.ok(Math.abs((r2-r1)-.5)<.03,'playback runs at the server\'s pace');assert.ok(r1<=39*3/60&&r1>39*3/60-.4,'just behind the newest snapshot');
 assert.ok(/const pdt=dt\*netClock\.rate/.test(src),'prediction steps at the server\'s pace');}
console.log('PASS: smooth tile outlines (no seam hops), skin follows building, server-paced clock for slow hosts.');
