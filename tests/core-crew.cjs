'use strict';
// C++ core, stage 2: crew movement inside a ship — walking, stopping, jumping (tap and hold), ladders (climb, step
// off the top, climb down), icy glass, walls, a block step, walkways, wedge ramps, nets (passed through) — matches
// the JavaScript game tick for tick. The same ship and the same key presses go to a JavaScript room (server/room.cjs,
// on the server's native Box2D interiors) and to both core builds; positions must agree within 1 cm all the way.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
// A ship with every kind of floor: 30 wide. Floor at y=8 (hull row). Left part: a ladder up to a block shelf;
// middle: glass strip; a wall, a block step, walkways, a wedge ramp, nets.
const bounds={l:-15,r:15,t:-8,b:8};
const blocks=[],terrain=[];
for(let x=-14;x<=-9;x++)blocks.push({x,y:2});                       // shelf at y=2, left
for(let y=3;y<=7;y++)terrain.push({type:'ladder',x:-8,y});           // ladder beside it
for(let y=-1;y<=1;y++)terrain.push({type:'ladder',x:-8,y});          // and on up past the shelf
for(let x=-6;x<=-1;x++)terrain.push({type:'glass',x,y:7});           // glass floor strip (raised one row)
blocks.push({x:2,y:7},{x:3,y:7},{x:3,y:6});                          // a step
for(let x=5;x<=8;x++)terrain.push({type:'walkway',x,y:4});           // walkway bridge
terrain.push({type:'wedge',x:10,y:7,rotation:0},{type:'wedge',x:11,y:6,rotation:0},{type:'block',x:11,y:7});
for(let y=5;y<=7;y++)terrain.push({type:'net',x:13,y});              // nets (crew pass through)
const saved={schema:27,name:'Test',bounds,helm:{x:0,y:7},blocks,terrain:terrain.filter(t=>t.type!=='block'),mounts:[],items:[],boxes:[],machines:[],zone:'freeport',position:{x:0,y:0}};
blocks.push({x:11,y:7});
const K=(s)=>{const k={};for(const c of s.split(','))if(c)k[c==='space'?' ':c]=true;return k;};
// Scenarios: start position, then [ticks, keys] segments.
const scenarios=[
 ['walk right, stop, walk left',{x:-4,y:6.3},[[50,'d'],[30,''],[60,'a'],[20,'']]],
 ['tap jump',{x:6,y:7.3},[[20,''],[2,'space'],[60,'']]],
 ['hold jump',{x:6,y:7.3},[[20,''],[20,'space'],[60,'']]],
 ['walk into the step and jump onto it',{x:-0.5,y:7.3},[[40,'d'],[12,'d,space'],[40,'d'],[30,'']]],
 ['ice: glide and slow stop',{x:-5.5,y:5.3},[[20,''],[40,'d'],[60,'']]],
 ['ladder: climb up, step off onto the shelf',{x:-8,y:7.3},[[10,''],[90,'w'],[30,'w,a'],[40,'']]],
 ['ladder: climb down from the shelf',{x:-9.2,y:0.3},[[30,''],[25,'d'],[90,'s'],[40,'']]],
 ['walkway bridge: jump up and land on it',{x:6.5,y:7.3},[[10,''],[16,'space'],[50,''],[30,'d'],[30,'']]],
 ['wedge ramp',{x:8.5,y:7.3},[[60,'d'],[30,'']]],
 ['nets: walk through',{x:12,y:7.3},[[60,'d'],[20,'']]],
 ['wall: walk into the hull',{x:12,y:7.3},[[120,'d'],[20,'']]]];
// Two crew members at once: one climbs (and is held at the ladder top) while the other jumps about.
const duo=['two crew: climber and jumper',[{uid:'a',start:{x:-8,y:7.3},segs:[[10,''],[260,'w'],[40,'']]},{uid:'b',start:{x:6,y:7.3},segs:[[30,''],[4,'space'],[50,'d'],[86,'a'],[140,'']]}]];
const all=[...scenarios.map(([label,start,segs])=>[label,[{uid:'a',start,segs}]]),duo];
const keysAt=(segs,i)=>{let t=0;for(const [n,k] of segs){if(i<t+n)return k;t+=n;}return '';},lengthOf=segs=>segs.reduce((a,[n])=>a+n,0);
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));let worst=0,checks=0;
 for(const [label,crews] of all){const ticks=Math.max(...crews.map(c=>lengthOf(c.segs)));
  // JavaScript
  const g=createRoom(JSON.parse(JSON.stringify(saved)),{});for(const c of crews)g.join(c.uid,c.uid.toUpperCase(),true,'captain');
  for(const c of crews)g.run(`bindCrew('${c.uid}');player.setTransform(V(${c.start.x},${c.start.y}),0);player.setLinearVelocity(V(0,0));player.setAwake(true);storeCrew();`);
  const jsTrace=[];for(let i=0;i<ticks;i++){for(const c of crews)g.command(c.uid,{action:'input',keys:K(keysAt(c.segs,i))});g.tick(1/60);
   jsTrace.push(JSON.parse(g.run(`JSON.stringify(${JSON.stringify(crews.map(c=>c.uid))}.map(id=>{bindCrew(id);const p=player.getPosition(),o=[p.x,p.y,climbing];storeCrew();return o;}))`)));}
  g.dispose?.();
  for(const [name,core] of [['native',native],['wasm',wasm]]){const {ship}=core.call({op:'ship.new',saved:JSON.parse(JSON.stringify(saved))});
   for(const c of crews){core.call({op:'ship.join',ship,uid:c.uid,name:c.uid.toUpperCase(),rank:'captain'});core.call({op:'ship.place',ship,uid:c.uid,x:c.start.x,y:c.start.y});}
   const tr=[];for(let i=0;i<ticks;i++){for(const c of crews)core.call({op:'ship.input',ship,uid:c.uid,keys:K(keysAt(c.segs,i))});const st=core.call({op:'ship.tick',ship,n:1,trace:true}).trace[0];tr.push(crews.map(c=>{const m=st.find(x=>x.id===c.uid);return [m.p.x,m.p.y,m.climbing];}));}
   core.call({op:'ship.dispose',ship});
   for(let i=0;i<ticks;i++)crews.forEach((c,k)=>{const a=jsTrace[i][k],b=tr[i][k],d=Math.hypot(a[0]-b[0],a[1]-b[1]);worst=Math.max(worst,d);checks++;
    assert.ok(d<.01,`${name} · ${label} · ${c.uid}: tick ${i+1} at (${b[0].toFixed(3)}, ${b[1].toFixed(3)}), JavaScript (${a[0].toFixed(3)}, ${a[1].toFixed(3)})`);assert.equal(b[2],a[2],`${name} · ${label} · ${c.uid}: tick ${i+1} climbing`);});}
  // and the scenario actually went somewhere
  crews.forEach((c,k)=>{const end=jsTrace.at(-1)[k],moved=Math.hypot(end[0]-c.start.x,end[1]-c.start.y);assert.ok(moved>.3||/jump/.test(label),label+': '+c.uid+' moved ('+moved.toFixed(2)+' m)');});}
 console.log('PASS: C++ core stage 2 — crew movement matches the JavaScript game tick for tick in both builds ('+all.length+' scenarios, '+checks+' positions, worst difference '+(worst*1000).toFixed(2)+' mm).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
