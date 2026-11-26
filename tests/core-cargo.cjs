'use strict';
// C++ core, stage 3: hands and loose cargo match the JavaScript game — dev give (stacks of 16, overflow dropped at
// your feet), select, drop (whole and half stacks, aimed, blocked spots skipped), moving and splitting stacks between
// hands, stacks falling and settling, same-type stacks merging when they touch, expando boxes (loaded from a save,
// falling, taking items, growing a quarter tile per 64, refusing a second type), cargo safeguards, and the notices.
// The same commands go to a JavaScript room and to both core builds.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
const bounds={l:-12,r:12,t:-8,b:8};
const blocks=[{x:-6,y:5},{x:-5,y:5},{x:-4,y:5},{x:6,y:6},{x:6,y:7}];
const terrain=[{type:'net',x:2,y:6},{type:'walkway',x:-9,y:4},{type:'walkway',x:-8,y:4}];
const base={schema:27,name:'Cargo',bounds,helm:{x:0,y:7},blocks,terrain,mounts:[],machines:[],zone:'freeport',position:{x:0,y:0},stacks:[{type:'wrench',count:1},null,null,null,null]};
const K=s=>{const k={};for(const c of s.split(','))if(c)k[c==='space'?' ':c]=true;return k;};
// Steps: ['cmd', uid, msg] | ['tick', n] | ['place', uid, x, y] | ['boxInsert', box, type, n]
const scenarios=[
 ['give, overflow, select, drop whole and half, aimed',{items:[],boxes:[]},[['place','a',-2,7.3],['tick',5],['cmd','a',{action:'dev',op:'give',item:'iron',count:40}],['cmd','a',{action:'dev',op:'give',item:'flux',count:40}],
   ['cmd','a',{action:'select',slot:1}],['cmd','a',{action:'drop',local:{x:0,y:6}}],['tick',30],['cmd','a',{action:'select',slot:2}],['cmd','a',{action:'drop',half:true,local:{x:-4,y:6}}],['tick',90],
   ['cmd','a',{action:'drop',local:{x:3,y:2}}],['tick',120]]],
 ['move and split stacks between hands',{items:[],boxes:[]},[['place','a',0,7.3],['cmd','a',{action:'dev',op:'give',item:'ammo',count:30}],['cmd','a',{action:'dev',op:'give',item:'block',count:9}],
   ['cmd','a',{action:'moveStack',from:1,to:4,half:true}],['cmd','a',{action:'moveStack',from:2,to:1}],['cmd','a',{action:'moveStack',from:0,to:3}],['cmd','a',{action:'moveStack',from:3,to:4,half:true}],['tick',2]]],
 ['dropping with empty hands, and into a blocked spot',{items:[],boxes:[]},[['place','a',-5,4.3],['tick',20],['cmd','a',{action:'select',slot:3}],['cmd','a',{action:'drop'}],
   ['cmd','a',{action:'dev',op:'give',item:'iron',count:5}],['cmd','a',{action:'select',slot:1}],['cmd','a',{action:'drop',local:{x:-5,y:5}}],['tick',60]]],
 ['saved stacks fall, settle and merge',{items:[{type:'iron',count:5,x:-1,y:-3},{type:'iron',count:4,x:-1,y:-1.5},{type:'iron',count:9,x:1,y:-2},{type:'flux',count:3,x:1.2,y:0},{type:'ammo',count:16,x:3,y:-4},{type:'ammo',count:2,x:3.1,y:-2}],boxes:[]},
   [['place','a',-9,7.3],['tick',240]]],
 ['expando box: falls, takes items, grows, one type only',{items:[],boxes:[{x:-2,y:2,materials:{iron:60}},{x:3,y:0,materials:{}}]},
   [['place','a',9,7.3],['tick',120],['boxInsert',0,'iron',10],['tick',60],['boxInsert',0,'flux',5],['boxInsert',1,'ammo',200],['tick',90],['boxInsert',1,'ammo',3000],['tick',60]]],
 ['a crowded floor: many drops onto one spot',{items:[],boxes:[]},[['place','a',-1,7.3],['cmd','a',{action:'dev',op:'give',item:'flux',count:64}],['cmd','a',{action:'dev',op:'give',item:'iron',count:16}],
   ...[1,2,3,4].flatMap(s=>[['cmd','a',{action:'select',slot:s}],['cmd','a',{action:'drop',half:true,local:{x:1,y:6}}],['tick',8],['cmd','a',{action:'drop',local:{x:1,y:6}}],['tick',8]]),['tick',200]]]];
const pos=(o)=>[o.x,o.y];
function compare(name,label,want,got,loose){
 const hands=(st)=>JSON.stringify(st);assert.equal(hands(got.stacks),hands(want.stacks),`${name} · ${label}: hands`);assert.equal(got.selected,want.selected,`${name} · ${label}: selected slot`);assert.equal(got.tool,want.tool,`${name} · ${label}: tool`);
 assert.deepEqual(got.notices,want.notices,`${name} · ${label}: notices`);
 const sum=l=>{const m={};for(const i of l)m[i.type]=(m[i.type]||0)+i.count;return m;};assert.deepEqual(sum(got.items),sum(want.items),`${name} · ${label}: loose item totals`);
 assert.equal(got.items.length,want.items.length,`${name} · ${label}: number of stacks (${JSON.stringify(got.items.map(i=>i.type+i.count))} vs ${JSON.stringify(want.items.map(i=>i.type+i.count))})`);
 // every stack has a twin (same type and count) within 3 cm
 const left=[...want.items];let worst=0;for(const i of got.items){let best=-1,bd=1e9;left.forEach((j,k)=>{if(j.type===i.type&&j.count===i.count){const d=Math.hypot(i.x-j.x,i.y-j.y);if(d<bd){bd=d;best=k;}}});
  assert.ok(best>=0,`${name} · ${label}: a stack of ${i.count} ${i.type} at (${i.x.toFixed(2)}, ${i.y.toFixed(2)}) has no twin`);worst=Math.max(worst,bd);assert.ok(loose||bd<.03,`${name} · ${label}: ${i.count} ${i.type} at (${i.x.toFixed(3)}, ${i.y.toFixed(3)}) is ${(bd*100).toFixed(1)} cm from the JavaScript one`);left.splice(best,1);}
 assert.equal(got.boxes.length,want.boxes.length);got.boxes.forEach((b,k)=>{const w=want.boxes[k];assert.equal(b.size,w.size,`${name} · ${label}: box ${k} size`);assert.deepEqual(b.materials,w.materials,`${name} · ${label}: box ${k} materials`);
  const d=Math.hypot(b.x-w.x,b.y-w.y);worst=Math.max(worst,d);assert.ok(loose||d<.03,`${name} · ${label}: box ${k} at (${b.x.toFixed(3)}, ${b.y.toFixed(3)}), JavaScript (${w.x.toFixed(3)}, ${w.y.toFixed(3)})`);});
 return worst;}
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));let worst=0,checks=0;
 for(const [label,extra,steps] of scenarios){const saved={...base,...extra};
  const g=createRoom(JSON.parse(JSON.stringify(saved)),{});g.join('a','A',true,'captain');
  const jsState=()=>JSON.parse(g.run(`(()=>{bindCrew('a');const o=JSON.stringify({stacks:slots.map((t,i)=>t?{type:t,count:stackCounts[i]}:null),selected,tool,notices:currentCrew.notices||[],
   items:items.map(i=>({type:i.type,count:i.count,x:i.body.getPosition().x,y:i.body.getPosition().y})),boxes:boxes.map(b=>({size:b.size,materials:b.materials,x:b.body.getPosition().x,y:b.body.getPosition().y}))});storeCrew();return o;})()`));
  const cores=[];for(const [name,core] of [['native',native],['wasm',wasm]]){const {ship}=core.call({op:'ship.new',saved:JSON.parse(JSON.stringify(saved))});core.call({op:'ship.join',ship,uid:'a',name:'A',rank:'captain',admin:true});cores.push({name,core,ship});}
  const coreState=c=>{const s=c.core.call({op:'ship.state',ship:c.ship}),h=s.crew.a;return {stacks:h.stacks,selected:h.selected,tool:h.tool,notices:h.notices,items:s.items,boxes:s.boxes};};
  let n=0;for(const st of steps){
   if(st[0]==='cmd'){g.command(st[1],st[2]);for(const c of cores)c.core.call({op:'ship.command',ship:c.ship,uid:st[1],msg:st[2]});}
   else if(st[0]==='place'){g.run(`bindCrew('${st[1]}');player.setTransform(V(${st[2]},${st[3]}),0);player.setLinearVelocity(V(0,0));storeCrew();`);for(const c of cores)c.core.call({op:'ship.place',ship:c.ship,uid:st[1],x:st[2],y:st[3]});}
   else if(st[0]==='boxInsert'){const want=+g.run(`boxInsert(boxes[${st[1]}],${JSON.stringify(st[2])},${st[3]})`);for(const c of cores)assert.equal(c.core.call({op:'ship.boxInsert',ship:c.ship,box:st[1],type:st[2],n:st[3]}).inserted,want,c.name+' · '+label+': box '+st[1]+' takes '+want);}
   else if(st[0]==='tick'){for(let i=0;i<st[1];i++){g.command('a',{action:'input',keys:{}});g.tick(1/60);}for(const c of cores){for(let i=0;i<st[1];i++){c.core.call({op:'ship.command',ship:c.ship,uid:'a',msg:{action:'input',keys:{}}});c.core.call({op:'ship.tick',ship:c.ship,n:1});}}}
   n++;const want=jsState();for(const c of cores){worst=Math.max(worst,compare(c.name,label+' (step '+n+')',want,coreState(c),false));checks++;}}
  g.dispose?.();for(const c of cores)c.core.call({op:'ship.dispose',ship:c.ship});}
 console.log('PASS: C++ core stage 3 — hands and loose cargo match the JavaScript game in both builds ('+scenarios.length+' scenarios, '+checks+' comparisons, worst position difference '+(worst*1000).toFixed(2)+' mm).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
