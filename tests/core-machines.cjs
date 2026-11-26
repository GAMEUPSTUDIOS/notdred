'use strict';
// C++ core, stage 6: machines match the JavaScript game — fabricators (loading and ejecting bins, crafting queues,
// repeat, clearing with refunds, finished items set down at the item doors), loaders (from the floor, through walkways,
// into fabricators, boxes, turrets, thrusters and the floor; filters; hold or drop what's refused; recyclers'
// output), pushers (push, pull, filters, beams through walkways and glass, settings), the handheld pusher, recyclers
// (whole stacks, fractions carried over), shredders (cooldown, golden), repairs, thruster tanks, door, spawn, sign and
// paint settings. The same commands go to a JavaScript room and both core builds.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');

const bounds={l:-12,r:12,t:-7,b:6};
const base={schema:27,name:'Machines',bounds,helm:{x:9,y:5},position:{x:0,y:0},zone:'freeport',stacks:[{type:'wrench',count:1},null,null,null,null],
 blocks:[{x:-2,y:2},{x:-1,y:2},{x:0,y:2},{x:1,y:2,hp:40}],
 terrain:[{type:'loader',x:-6,y:5,rotation:0},{type:'loader',x:-9,y:5,rotation:0},{type:'pusher_block',x:4,y:1,rotation:0},{type:'walkway',x:-10,y:5},{type:'door',x:-4,y:0},{type:'spawn',x:-3,y:5},{type:'sign',x:2,y:5,text:'old'},{type:'paint',x:3,y:5},
  {type:'loader',x:-3,y:1,rotation:1},{type:'pusher_block',x:-11,y:1,rotation:0,mode:'pull',filteredMode:'push',maxBeam:30,speed:20,filters:['flux',null,null],filterInv:false}],
 mounts:[{type:'turret',side:'bottom',at:-8},{type:'thruster',side:'top',at:2}],
 machines:[{type:'fabricator',id:'fab-a',x:-5.5,y:4,kind:'munitions',materials:{iron:20,explosives:3}},{type:'recycler',id:'rec-a',x:7,y:3.5}],
 items:[{type:'iron',count:6,x:-7.2,y:5.3},{type:'iron',count:3,x:-10,y:4.3},{type:'flux',count:2,x:5,y:5.3},{type:'iron',count:2,x:8,y:4}],boxes:[]};
const E=(x,y,extra={})=>({action:'edit',local:{x,y},...extra});
const give=(item,count)=>['cmd',{action:'dev',op:'give',item,count}],sel=s=>['cmd',{action:'select',slot:s}],wait=n=>['tick',n],at=(x,y)=>['place',x,y];
const scenarios=[
 ['loaders, pushers and a recycler running by themselves',[at(10,4.9),wait(400)]],
 ['fabricator: bins, queue, repeat, clear',[at(-3,4.9),wait(10),give('iron',10),give('flux',3),sel(1),['cmd',E(-5.5,4)],sel(2),['cmd',E(-5.5,4)],['cmd',{action:'material',item:'explosives',fab:'fab-a'}],
   ['cmd',{action:'craft',item:'ammo',count:3,fab:'fab-a'}],['cmd',{action:'craft',item:'block',count:1}],['cmd',{action:'craft',item:'scatter',count:8}],['cmd',{action:'repeat',value:true,fab:'fab-a'}],wait(200),
   ['cmd',{action:'repeat',value:false}],['cmd',{action:'clearQueue'}],['cmd',{action:'material',item:'iron',eject:true}],['cmd',{action:'material',item:'explosives',eject:true}],wait(60)]],
 ['recycler, shredders, repair, thruster tanks',[at(6,4.9),wait(10),give('block',5),give('shredder',1),give('shredder_gold',1),give('fuel',3),sel(1),['cmd',E(7,4)],wait(30),['cmd',E(7,4)],wait(260),
   sel(2),['cmd',E(5,5.2)],at(9.2,4.9),wait(10),['cmd',E(8,5.2)],['cmd',E(8,5.2)],wait(100),sel(3),['cmd',E(5,5.2)],at(0,4.9),wait(20),sel(4),['cmd',E(2,-7)],['cmd',E(3,-7)],sel(0),give('iron',3),['cmd',E(1,2)],wait(10),['cmd',E(1,2)],wait(10)]],
 ['settings: doors, spawn points, signs, paint, hatches, pushers',[at(-3,0.5),wait(30),['cmd',{action:'door',cell:{x:-4,y:0},access:'guest'}],['cmd',{action:'door',cell:{x:-4,y:0},access:'nope'}],['cmd',{action:'spawnrank',cell:{x:-3,y:5},rank:'captain'}],
   ['cmd',{action:'sign',cell:{x:2,y:5},text:'Hello\u0002there'}],['cmd',{action:'paint',cell:{x:3,y:5},color:'#ABCDEF'}],['cmd',{action:'paint',cell:{x:3,y:5},color:'bad'}],
   ['cmd',{action:'hatch',cell:{x:-6,y:5},mode:'whitelist',items:['flux','flux','iron'],requireOutput:true}],['cmd',{action:'hatch',cell:{x:-9,y:5},mode:'blacklist',items:['nope']}],
   ['cmd',{action:'pusher',cell:{x:4,y:1},settings:{mode:'pull',filteredMode:'off',maxBeam:'7',speed:99,filterInv:1,filters:['iron','bogus']}}],wait(200)]],
 ['the handheld pusher',[at(6.5,4.9),wait(10),give('pusher',1),sel(1),['held',5,5.3,20],wait(30),['cmd',{action:'rotate',local:{x:0,y:0}}],['held',8,4,30],wait(60)]]];
const norm=s=>{const o=JSON.parse(JSON.stringify(s));for(const m of o.machines||[])delete m.id;return o;};
function compare(name,label,want,got){
 /* to the centimetre: beam lengths follow cargo the beam touches, which moves a few mm differently */const R=(k,v)=>k==='beam'?undefined:typeof v==='number'&&!Number.isInteger(v)?Math.round(v*100)/100:v;
 (got.terrain||[]).forEach((t,i)=>{const w=want.terrain[i];if(t&&w&&t.beam!=null)assert.ok(Math.abs(t.beam-w.beam)<.05,`${name} · ${label}: beam ${t.beam} vs ${w.beam}`);});
 for(const k of ['blocks','terrain','mounts'])assert.equal(JSON.stringify(got[k],R),JSON.stringify(want[k],R),`${name} · ${label}: ${k}`);
 assert.equal(JSON.stringify(norm(got).machines,R),JSON.stringify(norm(want).machines,R),`${name} · ${label}: machines`);
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
   else if(st[0]==='held'){const msg={action:'input',keys:{},held:true,local:{x:st[1],y:st[2]}};for(let i=0;i<st[3];i++){g.command('a',msg);g.tick(1/60);}for(const c of cores)for(let i=0;i<st[3];i++){c.core.call({op:'ship.command',ship:c.ship,uid:'a',msg});c.core.call({op:'ship.tick',ship:c.ship,n:1});}}
   else if(st[0]==='tick'){for(let i=0;i<st[1];i++){g.command('a',{action:'input',keys:{}});g.tick(1/60);}for(const c of cores)for(let i=0;i<st[1];i++){c.core.call({op:'ship.command',ship:c.ship,uid:'a',msg:{action:'input',keys:{}}});c.core.call({op:'ship.command',ship:c.ship,uid:'b',msg:{action:'input',keys:{}}});c.core.call({op:'ship.tick',ship:c.ship,n:1});}}
   n++;const want=jsState();for(const c of cores){compare(c.name,label+' (step '+n+': '+JSON.stringify(st).slice(0,60)+')',want,coreState(c));checks++;}}
  g.dispose?.();for(const c of cores)c.core.call({op:'ship.dispose',ship:c.ship});}
 console.log('PASS: C++ core stage 6 — fabricators, loaders, pushers, recyclers, shredders, repairs and machine settings match the JavaScript game in both builds ('+scenarios.length+' scenarios, '+checks+' comparisons).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
