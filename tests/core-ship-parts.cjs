'use strict';
// C++ core, stage 4: a saved ship loads into the core exactly as into the JavaScript game — tiles (signs cleaned,
// paint colours checked, door and spawn ranks), physics machines (fabricators with their materials, recyclers, comms
// stations; clamped inside the hull), old-style fabricators and cargo boxes saved among the tiles, hull attachments
// (invalid ones dropped, older saves' fixes applied), old saves' inventories handed out — and the placement helpers
// (mountAt/mountValid/mountHit, machineSpace, fabFits, machineOnTop, supportsMachine, terrainAt, boxSpace, safeCell)
// answer the same for every cell. Crew joining with a matching spawn point appear there.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
const bounds={l:-10,r:10,t:-7,b:6};
const ship={schema:27,name:'Parts',bounds,helm:{x:0,y:5},position:{x:0,y:0},zone:'freeport',stacks:[{type:'wrench',count:1},null,{type:'iron',count:7},null,null],
 blocks:[{x:-8,y:3,rotation:0},{x:-7,y:3,rotation:2},{x:4,y:5},{x:5,y:5},{x:-3,y:2}],
 terrain:[{type:'sign',x:-6,y:1,text:'Hello\u0001world '+'x'.repeat(100)},{type:'paint',x:-5,y:1,color:' #A1B2C3 '},{type:'paint',x:-4,y:1,color:'nope'},
  {type:'door',x:2,y:4,rotation:0,access:'captain'},{type:'spawn',x:7,y:5,access:'guest'},{type:'spawn',x:-7,y:5,access:'crew'},{type:'walkway',x:6,y:2},{type:'walkway',x:7,y:2},{type:'glass',x:-1,y:5},
  {type:'ladder',x:8,y:4},{type:'ladder',x:8,y:5},{type:'net',x:-2,y:4},{type:'storage',x:3,y:1,materials:{ammo:20}},{type:'anchor',x:-9,y:3}],
 mounts:[{type:'thruster',side:'top',at:-3},{type:'turret',side:'left',at:-2,ammo:5,ammoType:'sniper'},{type:'turret',kind:'burst',side:'right',at:1},{type:'starter',side:'bottom',at:-10},{type:'starter',side:'bottom',at:10},
  {type:'thruster',side:'top',at:-2},{type:'turret',side:'bottom',at:9},{type:'ejector',side:'top',at:4},{type:'turret_controller',side:'top',at:0},{type:'turret',side:'left',at:2,ammoType:'bogus'}],
 machines:[{type:'fabricator',id:'fab-1',x:-6,y:4,kind:'engineering',materials:{iron:30,explosives:2,bogus:4},queue:[{type:'block',count:2}],repeat:true},{type:'recycler',id:'rec-1',x:30,y:-30},{type:'comms',id:'com-1',x:9,y:4.5}],
 items:[{type:'flux',count:3,x:0,y:0},{type:'nonsense',count:2,x:1,y:0},{type:'',count:4,x:2,y:-1},{type:'iron',count:2,x:99,y:99}],boxes:[{x:-3,y:-3,materials:{iron:70,undefined:3},angle:.5}]};
const old={schema:5,name:'Old',bounds:{l:-5,r:5,t:-4,b:3},helm:{x:1,y:2},position:{x:0,y:0},zone:'freeport',inventory:{block:3,thruster:2,iron:40},
 terrain:[{type:'fabricator',x:2,y:2,materials:{iron:5}}],mounts:[{type:'thruster',side:'bottom',at:-2},{type:'thruster',side:'top',at:0},{type:'thruster',side:'left',at:0},{type:'thruster',side:'right',at:0},{type:'starter',side:'bottom',at:-3},{type:'turret',side:'left',at:0}]};
const norm=s=>{const o=JSON.parse(JSON.stringify(s));for(const m of o.machines||[]){if(!/^(fab|rec|com)-/.test(m.id))delete m.id;}return o;};
const pick=(s,keys)=>Object.fromEntries(keys.map(k=>[k,s[k]]));
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));let checks=0;
 for(const [label,saved] of [['current save',ship],['old save (schema 5)',old]]){
  const g=createRoom(JSON.parse(JSON.stringify(saved)),{});g.join('a','A',true,'captain');g.join('b','B',false,'guest');
  const js=JSON.parse(g.run(`(()=>{const s=state();bindCrew('a');const a={stacks:slots.map((t,i)=>t?{type:t,count:stackCounts[i]}:null),p:{...player.getPosition()}};bindCrew('b');const b={stacks:slots.map((t,i)=>t?{type:t,count:stackCounts[i]}:null),p:{...player.getPosition()}};storeCrew();
   return JSON.stringify({blocks:s.blocks,terrain:s.terrain,machines:s.machines.map(m=>{const o={...m};o.vx=0;o.vy=0;return o;}),mounts:s.mounts,items:s.items.map(i=>({type:i.type,count:i.count,intakeFrom:i.intakeFrom??null,x:i.x,y:i.y})),boxes:s.boxes.map(b=>({x:b.x,y:b.y,angle:b.angle,materials:b.materials,size:b.size})),a,b});})()`));
  for(const [name,core] of [['native',native],['wasm',wasm]]){const {ship:id}=core.call({op:'ship.new',saved:JSON.parse(JSON.stringify(saved))});core.call({op:'ship.join',ship:id,uid:'a',name:'A',rank:'captain',admin:true});core.call({op:'ship.join',ship:id,uid:'b',name:'B',rank:'guest'});
   const st=core.call({op:'ship.state',ship:id}),crew=core.call({op:'ship.crew',ship:id}).crew;
   const got={blocks:st.blocks,terrain:st.terrain,machines:st.machines,mounts:st.mounts,items:st.items.map(i=>({type:i.type,count:i.count,intakeFrom:i.intakeFrom??null,x:i.x,y:i.y})),boxes:st.boxes.map(b=>({x:b.x,y:b.y,angle:b.angle,materials:b.materials,size:b.size})),
    a:{stacks:st.crew.a.stacks,p:crew.find(c=>c.id==='a').p},b:{stacks:st.crew.b.stacks,p:crew.find(c=>c.id==='b').p}};
   for(const k of ['blocks','terrain','mounts'])assert.equal(JSON.stringify(got[k]),JSON.stringify(js[k]),`${name} · ${label}: ${k}`);
   assert.equal(JSON.stringify(norm(got).machines),JSON.stringify(norm(js).machines),`${name} · ${label}: machines`);
   const near=(a,b,what)=>{assert.ok(Math.abs(a.x-b.x)<1e-4&&Math.abs(a.y-b.y)<1e-4,`${name} · ${label}: ${what} at (${a.x}, ${a.y}), JavaScript (${b.x}, ${b.y})`);};
   assert.equal(got.items.length,js.items.length,`${name} · ${label}: items`);got.items.forEach((i,k)=>{assert.deepEqual(pick(i,['type','count','intakeFrom']),pick(js.items[k],['type','count','intakeFrom']));near(i,js.items[k],'item '+k);});
   assert.equal(got.boxes.length,js.boxes.length);got.boxes.forEach((b,k)=>{assert.deepEqual(b.materials,js.boxes[k].materials,`${name} · ${label}: box materials`);assert.equal(b.size,js.boxes[k].size);near(b,js.boxes[k],'box');assert.ok(Math.abs(b.angle-js.boxes[k].angle)<1e-6);});
   for(const c of ['a','b']){assert.equal(JSON.stringify(got[c].stacks),JSON.stringify(js[c].stacks),`${name} · ${label}: ${c}'s hands`);near(got[c].p,js[c].p,c+' joined at');}
   checks+=8;
   // Placement helpers, every cell (and half cell) of the ship and a margin around it.
   const q=(fn,args)=>core.call({op:'ship.query',ship:id,fn,args}).result;
   const b=saved.bounds;
   for(let x=b.l-1;x<=b.r+1;x+=.5)for(let y=b.t-1;y<=b.b+1;y+=.5){
    const jq=code=>JSON.parse(g.run(`(()=>{bindCrew('a');const r=${code};storeCrew();return JSON.stringify(r===undefined?null:r);})()`));
    const mh=jq(`(()=>{const m=mountHit({x:${x},y:${y}});return m?{side:m.side,at:m.at,type:m.type}:null;})()`);assert.deepEqual(q('mountHit',[x,y]),mh,`${name} · ${label}: mountHit(${x},${y})`);
    for(const t of ['thruster','starter','turret_auto','starter_rc']){assert.deepEqual(q('mountAt',[x,y,t]),jq(`mountAt({x:${x},y:${y}},'${t}')`),`${name} · ${label}: mountAt(${x},${y},${t})`);assert.equal(q('mountValidAt',[x,y,t]),jq(`mountValid(mountAt({x:${x},y:${y}},'${t}'))`),`${name} · ${label}: mountValid(${x},${y},${t})`);}
    if(Number.isInteger(x)&&Number.isInteger(y)){
     assert.equal(q('supportsMachine',[x,y]),jq(`supportsMachine(${x},${y})`),`${name} · ${label}: supportsMachine(${x},${y})`);
     assert.equal(q('terrainAt',[x,y]),jq(`terrainAt({x:${x},y:${y}})?.type??null`),`${name} · ${label}: terrainAt(${x},${y})`);
     assert.equal(q('machineOnTop',[x,y]),jq(`machineOnTop({x:${x},y:${y}})?.type??null`),`${name} · ${label}: machineOnTop(${x},${y})`);
     for(const t of ['fabricator','recycler','anchor'])for(const sup of [true,false])assert.equal(q('fabFits',[x,y,sup,t]),jq(`fabFits(${x},${y},${sup},'${t}')`),`${name} · ${label}: fabFits(${x},${y},${sup},${t})`);
     for(const cargo of [false,true])assert.deepEqual(q('safeCell',[x+.3,y-.2,cargo]),jq(`(()=>{const p=safeCell(V(${x+.3},${y-.2}),${cargo});return {x:p.x,y:p.y};})()`),`${name} · ${label}: safeCell(${x},${y},${cargo})`);}
    for(const t of ['fabricator','recycler','comms'])assert.equal(q('machineSpace',[t,x,y]),jq(`machineSpace('${t}',V(${x},${y}))`),`${name} · ${label}: machineSpace(${t},${x},${y})`);
    for(const size of [2,2.5])assert.equal(q('boxSpace',[x,y,size]),jq(`boxSpace(V(${x},${y}),${size})`),`${name} · ${label}: boxSpace(${x},${y},${size})`);
    checks+=20;}
   core.call({op:'ship.dispose',ship:id});}
  g.dispose?.();}
 console.log('PASS: C++ core stage 4 — saved ships load identically (tiles, signs, paint, doors, spawn points, machines, old fabricators and boxes, attachments, old inventories, joining at spawn points), and every placement helper agrees cell by cell ('+checks+' checks, both builds).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
