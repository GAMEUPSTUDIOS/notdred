'use strict';
// C++ core, stage 5: building, dismantling, rotating, the helm and clicking match the JavaScript game — blocks and
// every grid piece (walkways, ladders, glass, wedges, doors and spawn points set to the builder's rank, signs, paint,
// standing machines), hull attachments, fabricators and recyclers (placed on the surface under the aim), expando
// boxes, moving the helm; every refusal (reach, occupied, standing in the way, outside the ship, no support, wrong
// tool); dismantling with refunds (stored materials and turret ammo dropped, machines on top falling), packaging
// boxes; rotating pieces (settings kept) and the build rotation; taking and leaving the helm; picking items up;
// loading and emptying boxes; loading turrets. The same commands go to a JavaScript room and both core builds.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
const bounds={l:-10,r:10,t:-7,b:6};
const base={schema:27,name:'Build',bounds,helm:{x:6,y:5},position:{x:0,y:0},zone:'freeport',stacks:[{type:'wrench',count:1},null,null,null,null],
 blocks:[{x:-6,y:5},{x:-5,y:5},{x:2,y:2}],terrain:[{type:'walkway',x:-2,y:3},{type:'walkway',x:-1,y:3},{type:'wedge',x:4,y:5,rotation:0},{type:'door',x:8,y:4,access:'crew'}],
 mounts:[{type:'turret',side:'top',at:-4}],machines:[],items:[{type:'iron',count:5,x:-4,y:5.3},{type:'flux',count:2,x:-3,y:5.3}],boxes:[{x:-8,y:4.9,materials:{ammo:30}}]};
const E=(x,y,extra={})=>({action:'edit',local:{x,y},...extra});
const give=(item,count)=>['cmd',{action:'dev',op:'give',item,count}],sel=s=>['cmd',{action:'select',slot:s}],wait=n=>['tick',n],at=(x,y)=>['place',x,y];
const scenarios=[
 ['blocks: build, refuse, dismantle',[at(0,5.3),give('block',8),sel(1),['cmd',E(1,4)],wait(20),['cmd',E(1,4)],wait(20),['cmd',E(0,5)],['cmd',E(30,5)],['cmd',E(-1,2)],wait(20),['cmd',E(14,0)],
   sel(0),['cmd',E(1,4)],wait(5),['cmd',E(2,2)],wait(5),['cmd',E(-9,-6)],['cmd',E(1,4,{action:'remove'})],wait(5)]],
 ['grid pieces and their ranks',[at(0,5.3),give('walkway',4),give('ladder',4),give('glass',4),give('door',2),
   sel(1),['cmd',E(-3,1)],wait(20),sel(2),['cmd',E(1,4)],wait(20),sel(3),['cmd',E(-1,4)],wait(20),sel(4),['cmd',E(2,4)],wait(20),['cmd',E(2,0)],wait(20)]],
 ['more pieces, rotation, settings kept',[at(0,5.3),give('spawn',1),give('sign',1),give('paint',1),give('wedge',2),sel(1),['cmd',E(-1,5)],wait(40),sel(2),['cmd',E(1,4)],wait(20),sel(3),['cmd',E(-2,4)],wait(20),
   sel(4),['cmd',{action:'rotate',local:{x:3,y:3}}],['cmd',{action:'rotate',local:{x:3,y:3}}],['cmd',E(2,4)],wait(20),sel(0),['cmd',{action:'rotate',local:{x:2,y:4}}],['cmd',{action:'rotate',local:{x:2,y:2}}],
   ['cmd',{action:'rotate',local:{x:8,y:4}}],['cmd',{action:'rotate',local:{x:4,y:5}}],['cmd',{action:'rotate',local:{x:-1,y:5}}],at(-6,4.3),['cmd',{action:'rotate',local:{x:0,y:0}}],wait(3)]],
 ['hull attachments and turret ammo',[at(0,4.9),wait(30),give('thruster',2),give('turret',1),give('ammo',20),sel(1),['cmd',E(-1,6)],wait(30),sel(2),['cmd',E(0,6)],['cmd',E(-10,0)],wait(30),
   at(2.5,4.9),wait(20),sel(3),['cmd',E(3,6)],wait(30),sel(4),['cmd',E(3,6)],['cmd',E(3,6)],['cmd',E(-1,6)],sel(0),['cmd',E(3,6,{action:'remove'})],wait(5),at(-0.5,4.9),wait(20),['cmd',E(-1,6,{action:'remove'})],wait(5),['cmd',E(-4,-7,{action:'remove'})],wait(5)]],
 ['fabricators, recyclers, boxes and machines falling',[at(0,4.9),wait(20),give('fab_engineering',1),give('recycler',1),give('storage',1),sel(1),['cmd',E(1.5,4)],wait(40),
   sel(2),['cmd',E(-2,1)],wait(40),sel(3),['cmd',E(4,1)],wait(40),['cmd',E(-6,1)],wait(40),sel(0),['cmd',E(-2,3,{action:'remove'})],wait(20),['cmd',E(-1,3,{action:'remove'})],wait(20),['cmd',E(1,4,{action:'remove'})],wait(20),['cmd',E(4,4.5,{action:'remove'})],wait(60)]],
 ['moving the helm, a standing machine',[at(-1,4.9),wait(20),['cmd',{action:'helm'}],['cmd',E(1.5,4.5)],wait(30),['cmd',{action:'helm'}],['cmd',E(-2.5,1.5)],wait(30),['cmd',{action:'helm'}],['cmd',E(6.5,4.5)],wait(30),
   at(4,4.9),wait(20),give('anchor',1),sel(1),['cmd',E(-1,4)],wait(40),['cmd',E(1,4)],wait(40)]],
 ['the helm: take it, leave it',[at(6,5.3),['cmd',{action:'interact'}],wait(5),['cmd',{action:'interact'}],wait(5),['cmd',E(6,5)],wait(5),['cmd',E(6,5)],wait(5),['cmd',{action:'leave'}],at(-2,5.3),['cmd',{action:'interact'}],wait(5)]],
 ['embiggener and shrinker (a second crew member shifts too)',[at(-1,4.9),['join','b'],['placeb',3,4.9],wait(30),give('embiggener',2),give('shrinker',2),sel(1),['cmd',E(0,4)],wait(30),['cmd',E(5,4)],wait(30),
   ['cmd',{action:'rotate',local:{x:0,y:0}}],['cmd',E(0,0)],wait(30),sel(2),['cmd',E(-1,0)],wait(30),['cmd',{action:'rotate',local:{x:0,y:0}}],['cmd',E(1,4)],wait(30),['cmd',E(-7,4)],wait(30),['cmd',E(0,4)],wait(40)]],
 ['picking up and boxes',[at(-1.5,5.3),wait(30),sel(1),['cmd',E(-4,5.3)],['cmd',E(-3,5.3)],wait(5),at(-6,4.3),wait(20),['cmd',E(-8,4.9)],wait(30),['cmd',E(-8,4.9)],wait(30),sel(1),['cmd',E(-8,4.9)],wait(10),sel(2),['cmd',E(-8,4.9)],wait(10),
   sel(0),['cmd',E(-8,4.9)],wait(30)]]];
const norm=s=>{const o=JSON.parse(JSON.stringify(s));for(const m of o.machines||[])delete m.id;return o;};
function compare(name,label,want,got){
 for(const k of ['blocks','terrain','mounts'])assert.equal(JSON.stringify(got[k]),JSON.stringify(want[k]),`${name} · ${label}: ${k}`);
 assert.equal(JSON.stringify(norm(got).machines),JSON.stringify(norm(want).machines),`${name} · ${label}: machines`);
 assert.deepEqual(got.helm,want.helm,`${name} · ${label}: helm`);assert.deepEqual(got.bounds,want.bounds,`${name} · ${label}: bounds`);
 assert.deepEqual(got.crew.map(m=>m.id),want.crew.map(m=>m.id));got.crew.forEach((m,k)=>assert.ok(Math.hypot(m.x-want.crew[k].x,m.y-want.crew[k].y)<.03,`${name} · ${label}: ${m.id} at (${m.x.toFixed(3)}, ${m.y.toFixed(3)}), JavaScript (${want.crew[k].x.toFixed(3)}, ${want.crew[k].y.toFixed(3)})`));assert.equal(JSON.stringify(got.hands),JSON.stringify(want.hands),`${name} · ${label}: hands`);assert.deepEqual(got.notices,want.notices,`${name} · ${label}: notices`);
 assert.equal(got.piloting,want.piloting,`${name} · ${label}: piloting`);assert.equal(got.buildRotation,want.buildRotation,`${name} · ${label}: build rotation`);
 assert.deepEqual(got.effects.map(e=>e.label),want.effects.map(e=>e.label),`${name} · ${label}: effects`);
 const sum=l=>{const m={};for(const i of l)m[i.type]=(m[i.type]||0)+i.count;return m;};assert.deepEqual(sum(got.items),sum(want.items),`${name} · ${label}: loose items (${JSON.stringify(got.items.map(i=>i.type+i.count))} vs ${JSON.stringify(want.items.map(i=>i.type+i.count))})`);
 assert.equal(got.boxes.length,want.boxes.length,`${name} · ${label}: boxes`);got.boxes.forEach((b,k)=>{assert.deepEqual(b.materials,want.boxes[k].materials,`${name} · ${label}: box materials`);assert.ok(Math.hypot(b.x-want.boxes[k].x,b.y-want.boxes[k].y)<.05,`${name} · ${label}: box position`);});
 const left=[...want.items];for(const i of got.items){const k=left.findIndex(j=>j.type===i.type&&j.count===i.count&&Math.hypot(i.x-j.x,i.y-j.y)<.05);assert.ok(k>=0,`${name} · ${label}: ${i.count} ${i.type} at (${i.x.toFixed(2)}, ${i.y.toFixed(2)}) has no twin`);left.splice(k,1);}}
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));let checks=0;
 for(const [label,steps] of scenarios){const saved=JSON.parse(JSON.stringify(base));
  const g=createRoom(JSON.parse(JSON.stringify(saved)),{});g.join('a','A',true,'captain');
  const jsState=()=>JSON.parse(g.run(`(()=>{const s=state();bindCrew('a');const o=JSON.stringify({blocks:s.blocks,terrain:s.terrain,machines:s.machines.map(m=>({...m,vx:0,vy:0})),mounts:s.mounts,helm:{x:helm.x,y:helm.y},hands:slots.map((t,i)=>t?{type:t,count:stackCounts[i]}:null),
   notices:currentCrew.notices||[],piloting,buildRotation,effects,items:s.items,boxes:s.boxes,bounds:s.bounds,crew:[...crew.values()].map(m=>({id:m.id,x:m.player.getPosition().x,y:m.player.getPosition().y}))});storeCrew();return o;})()`));
  const cores=[];for(const [name,core] of [['native',native],['wasm',wasm]]){const {ship}=core.call({op:'ship.new',saved:JSON.parse(JSON.stringify(saved))});core.call({op:'ship.join',ship,uid:'a',name:'A',rank:'captain',admin:true});cores.push({name,core,ship});}
  const coreState=c=>{const s=c.core.call({op:'ship.state',ship:c.ship}),h=s.crew.a,cr=c.core.call({op:'ship.crew',ship:c.ship}).crew;return {bounds:s.bounds,crew:cr.map(m=>({id:m.id,x:m.p.x,y:m.p.y})),blocks:s.blocks,terrain:s.terrain,machines:s.machines,mounts:s.mounts,helm:s.helm,hands:h.stacks,notices:h.notices,piloting:h.piloting,buildRotation:h.buildRotation,effects:s.effects,items:s.items,boxes:s.boxes};};
  let n=0;for(const st of steps){
   if(st[0]==='cmd'){g.command('a',st[1]);for(const c of cores)c.core.call({op:'ship.command',ship:c.ship,uid:'a',msg:st[1]});}
   else if(st[0]==='place'){g.run(`bindCrew('a');player.setTransform(V(${st[1]},${st[2]}),0);player.setLinearVelocity(V(0,0));storeCrew();`);for(const c of cores)c.core.call({op:'ship.place',ship:c.ship,uid:'a',x:st[1],y:st[2]});}
   else if(st[0]==='join'){g.join(st[1],'B',false,'crew');for(const c of cores)c.core.call({op:'ship.join',ship:c.ship,uid:st[1],name:'B',rank:'crew'});}
   else if(st[0]==='placeb'){g.run(`bindCrew('b');player.setTransform(V(${st[1]},${st[2]}),0);player.setLinearVelocity(V(0,0));storeCrew();`);for(const c of cores)c.core.call({op:'ship.place',ship:c.ship,uid:'b',x:st[1],y:st[2]});}
   else if(st[0]==='tick'){for(let i=0;i<st[1];i++){g.command('a',{action:'input',keys:{}});g.tick(1/60);}for(const c of cores)for(let i=0;i<st[1];i++){c.core.call({op:'ship.command',ship:c.ship,uid:'a',msg:{action:'input',keys:{}}});c.core.call({op:'ship.command',ship:c.ship,uid:'b',msg:{action:'input',keys:{}}});c.core.call({op:'ship.tick',ship:c.ship,n:1});}}
   n++;const want=jsState();for(const c of cores){compare(c.name,label+' (step '+n+': '+JSON.stringify(st).slice(0,60)+')',want,coreState(c));checks++;}}
  g.dispose?.();for(const c of cores)c.core.call({op:'ship.dispose',ship:c.ship});}
 console.log('PASS: C++ core stage 5 — building, dismantling, rotating, the helm, picking up and boxes match the JavaScript game in both builds ('+scenarios.length+' scenarios, '+checks+' comparisons).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
