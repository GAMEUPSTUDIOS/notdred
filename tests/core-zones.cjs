'use strict';
// C++ core, stage 6: zones match the JavaScript zone simulation (server/zone-sim.cjs, which runs zones.js): every rock
// cell (id, kind, ore, hp) in order, the greedy 8×8 chunk rectangles, portals (with the mission portal), the Pits'
// boulders, treasure ranks and treasure as a mission runs, exposed rock, the Freeport harbour (docks, walls, corners),
// and the arrival rules (zoneSolid, rockAtHit, shipOverlapsRock, shipClashes, randomArrival and randomBerth with the
// same dice, safeArrival, freeportFits, freeportBerthOK, insideFreeport, nearestPortal) — with mined rock, in both
// builds. Also String(number) and toFixed, which zone keys and snapshots use.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js'),{createZoneSim}=require('../server/zone-sim.cjs');
let seed0=987654321;const rnd=()=>{seed0^=seed0<<13;seed0^=seed0>>>17;seed0^=seed0<<5;return (seed0>>>0)/4294967296;};
const f32=Math.fround;
function jsZone(id,seed,mined,mission){const host={authoritativeZone:()=>({seed,mined,regenIn:null,resetIn:null}),authoritativeMission:()=>mission,damage(){},pvpHit(){},pierce(){return {exit:true};},score(){},toast(){},mined(){}};
 return createZoneSim(id,host);}
const fixtureJS=`f=>{const s=f.getShape();const o=s.getType()==='circle'?{circle:s.m_radius,x:s.m_p.x,y:s.m_p.y}:{poly:s.m_vertices.map(v=>[v.x,v.y])};o.friction=f.getFriction();o.density=f.getDensity();o.restitution=f.getRestitution();return o;}`;
// A fixture as a comparable string: a polygon by its bounding box (vertex order is each engine's own), in floats.
const fx=o=>o.circle!=null?`c${f32(o.circle)}@${f32(o.x)},${f32(o.y)}`:(()=>{const xs=o.poly.map(v=>f32(v[0])),ys=o.poly.map(v=>f32(v[1]));return `p${o.poly.length}:${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`;})()+`/${f32(o.friction)}/${f32(o.density)}/${f32(o.restitution)}`;
const fset=list=>list.map(fx).sort().join(' ');
function jsState(sim){return JSON.parse(sim.run(`JSON.stringify({rocks:[...rocks.values()].map(r=>[r.id,r.x,r.y,r.kind,r.ore,r.hp,r.maxhp,r.chunk]),
 chunks:[...rockChunks].map(([k,ch])=>{const fl=[];for(let f=ch.body?.getFixtureList();f;f=f.getNext())fl.push((${fixtureJS})(f));return [k,[...ch.cells].sort(),fl];}),
 portals:zonePortals(),boulders:boulders.map(b=>({id:b.id,r:b.r,x:b.body.getPosition().x,y:b.body.getPosition().y,a:b.body.getAngle(),fixtures:(()=>{const fl=[];for(let f=b.body.getFixtureList();f;f=f.getNext())fl.push((${fixtureJS})(f));return fl;})()})),
 treasure:zoneData[zone].treasure??null,
 dock:(()=>{const fl=[];for(let f=dockBody.getFixtureList();f;f=f.getNext())fl.push((${fixtureJS})(f));return fl;})()})`));}
let checks=0;
function compareState(name,label,js,got){
 assert.equal(got.rocks.length,js.rocks.length,`${name} ${label}: rock count`);
 for(let i=0;i<js.rocks.length;i++)assert.deepEqual(got.rocks[i],js.rocks[i],`${name} ${label}: rock ${i}`);
 const gk=Object.keys(got.chunks);assert.deepEqual(gk,js.chunks.map(c=>c[0]),`${name} ${label}: chunk order`);
 for(const [k,cells,fl] of js.chunks){assert.deepEqual([...got.chunks[k].cells].sort(),cells,`${name} ${label}: chunk ${k} cells`);assert.equal(fset(got.chunks[k].fixtures),fset(fl),`${name} ${label}: chunk ${k} rectangles`);}
 assert.deepEqual(got.portals,js.portals,`${name} ${label}: portals`);
 assert.equal(got.boulders.length,js.boulders.length,`${name} ${label}: boulder count`);
 js.boulders.forEach((b,i)=>{const c=got.boulders[i];assert.equal(c.id,b.id);assert.equal(c.r,b.r||0,`${name} ${label}: boulder ${b.id} radius`);assert.equal(c.x,f32(b.x),`${name} ${label}: boulder ${b.id} x`);assert.equal(c.y,f32(b.y),`${name} ${label}: boulder ${b.id} y`);assert.equal(fset(c.fixtures),fset(b.fixtures),`${name} ${label}: boulder ${b.id} shape`);});
 assert.equal(got.treasure,js.treasure,`${name} ${label}: treasure`);
 if(js.dock.length)assert.equal(fset(got.dock),fset(js.dock),`${name} ${label}: harbour`);checks++;}
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));const cores=[['native',native],['wasm',wasm]];
 // String(number) and toFixed
 const nums=[0,-0,1,-1,0.5,1e21,1e-7,123456789012345680000,1.5e-7,0.000001,2**53,1/3,-2/3,Math.PI*1e10,5e-324,1.7976931348623157e308,0.1+0.2,100,1e20,-1e-6,123.456,0.125,0.375,-0.125,2.675,1.005,1.45,8.345,-8.345,999.995,0.005,0.015,1e-3,12.5,-12.5,0.045];
 for(let i=0;i<3000;i++)nums.push((rnd()-.5)*Math.pow(10,Math.floor(rnd()*30)-12),Math.round((rnd()-.5)*8000)/8,f32((rnd()-.5)*500));
 for(const [name,core] of cores)for(const v of nums){assert.equal(core.call({op:'rule',fn:'jsNum',args:[v]}).result,String(v),`${name} String(${v})`);
  for(const d of [0,1,2,3])if(Math.abs(v)<1e21)assert.equal(core.call({op:'rule',fn:'jsFixed',args:[v,d]}).result,+v.toFixed(d)+0,`${name} (${v}).toFixed(${d})`);checks++;}
 const cases=[['finch',0],['finch',424242],['finch2',99],['sparrow',7],['pits',0],['pits',31337],['canary',5],['canary',777777],['freeport',0],['freeport3',0]];
 for(const [id,seed] of cases){
  for(const missionActive of id==='pits'||id==='sparrow'?[null,'pits']:[null]){
   const mission={active:missionActive,endsIn:600,nextIn:900,elapsed:missionActive?1234:0,index:0};
   // a first build tells which rock exists; the second mines every 29th cell (and a whole block of them)
   const probe=jsZone(id,seed,[],mission);const all=JSON.parse(probe.run('JSON.stringify([...rocks.keys()])'));
   const mined=all.filter((_,i)=>i%29===3||(i>200&&i<260));
   for(const minedList of [[],mined]){const label=`${id} seed ${seed}${missionActive?' (mission '+missionActive+')':''}${minedList.length?' mined '+minedList.length:''}`;
    const sim=minedList.length?jsZone(id,seed,minedList,mission):probe;const js=jsState(sim);const elapsed0=mission.elapsed;
    const made=cores.map(([name,core])=>({name,core,z:core.call({op:'zone.new',id,seed,mined:minedList,mission:{...mission,elapsed:elapsed0}}).zone}));
    for(const {name,core,z} of made){
     const q=(fn,...args)=>core.call({op:'zone.query',zone:z,fn,args}).result;
     compareState(name,label,js,core.call({op:'zone.state',zone:z}));
     if(id.startsWith('freeport')){
      assert.deepEqual(q('freeportLayout'),JSON.parse(sim.run('JSON.stringify(freeportLayout())')),`${name} ${label}: harbour layout`);
      for(let k=0;k<300;k++){const p={x:Math.round((rnd()-.5)*460),y:Math.round((rnd()-.5)*460)},e={l:-Math.round(3+rnd()*38)-.5,r:Math.round(3+rnd()*38)+.5,t:-Math.round(3+rnd()*38)-.5,b:Math.round(3+rnd()*38)+.5},m=Math.round(rnd()*6)-1;
       sim.run(`shipExtents=()=>(${JSON.stringify(e)})`);
       assert.equal(q('freeportFits',p,e),sim.run(`freeportFits(V(${p.x},${p.y}),${JSON.stringify(e)})`),`${name} ${label}: freeportFits ${JSON.stringify([p,e])}`);
       assert.equal(q('freeportBerthOK',p,e),sim.run(`freeportBerthOK(V(${p.x},${p.y}))`),`${name} ${label}: freeportBerthOK`);
       assert.equal(q('insideFreeport',p.x,p.y,m),sim.run(`insideFreeport(${p.x},${p.y},${m})`),`${name} ${label}: insideFreeport`);
       const others=Array.from({length:Math.floor(rnd()*4)},()=>({x:Math.round((rnd()-.5)*200),y:Math.round((rnd()-.5)*200),ext:{l:-10.5,r:10.5,t:-8.5,b:8.5}}));
       sim.run(`occupiedByShips=()=>(${JSON.stringify(others)})`);
       if(k%10===0)assert.deepEqual(q('safeArrival',e,others),JSON.parse(sim.run('JSON.stringify(safeArrival())')),`${name} ${label}: safeArrival`);
       if(k%10===5){const dice=Array.from({length:800},rnd);sim.run(`{const d=${JSON.stringify(dice)};Math.random=()=>d.shift();}`);const want=JSON.parse(sim.run('JSON.stringify(randomBerth())'));
        assert.deepEqual(core.call({op:'zone.query',zone:z,fn:'randomBerth',args:[e,others],dice}).result,{x:want.x,y:want.y},`${name} ${label}: randomBerth`);}
       assert.equal(q('shipClashes',p,e,others),sim.run(`shipClashes(V(${p.x},${p.y}))`),`${name} ${label}: shipClashes`);checks+=4;}
      sim.run('delete globalThis.occupiedByShips');}
     else{
      const g=JSON.parse(sim.run('JSON.stringify({minX:zoneGrid().minX,minY:zoneGrid().minY,w:zoneGrid().width*4,h:zoneGrid().height*4})'));
      for(let k=0;k<400;k++){const x=g.minX-8+rnd()*(g.w+16),y=g.minY-8+rnd()*(g.h+16);
       assert.equal(q('zoneSolid',x,y),sim.run(`zoneSolid(${x},${y})`),`${name} ${label}: zoneSolid(${x},${y})`);
       const dir={x:rnd()-.5,y:rnd()-.5};assert.equal(q('rockAtHit',{x,y},dir),sim.run(`rockAtHit(V(${x},${y}),V(${dir.x},${dir.y}))`),`${name} ${label}: rockAtHit`);
       const e={l:-Math.round(3+rnd()*30)-.5,r:Math.round(3+rnd()*30)+.5,t:-Math.round(3+rnd()*30)-.5,b:Math.round(3+rnd()*30)+.5};sim.run(`shipExtents=()=>(${JSON.stringify(e)})`);
       if(k%8===0)assert.equal(q('shipOverlapsRock',{x,y},e),sim.run(`shipOverlapsRock(V(${x},${y}))`),`${name} ${label}: shipOverlapsRock`);
       if(k%40===0){const others=[{x:Math.round(x),y:Math.round(y),ext:{l:-12.5,r:12.5,t:-9.5,b:9.5}}];sim.run(`occupiedByShips=()=>(${JSON.stringify(others)})`);const dice=Array.from({length:200},rnd);
        sim.run(`{const d=${JSON.stringify(dice)};Math.random=()=>d.shift();}`);const want=JSON.parse(sim.run('JSON.stringify(randomArrival())'));
        assert.deepEqual(core.call({op:'zone.query',zone:z,fn:'randomArrival',args:[e,others],dice}).result,want&&{x:want.x,y:want.y},`${name} ${label}: randomArrival`);sim.run('delete globalThis.occupiedByShips');}
       if(k%20===0){const want=JSON.parse(sim.run(`JSON.stringify(nearestPortal(V(${x},${y})))`));assert.deepEqual(q('nearestPortal',{x,y}),want,`${name} ${label}: nearestPortal`);}
       checks+=2;}
      assert.deepEqual(q('exposedRocks'),JSON.parse(sim.run('JSON.stringify(exposedRocks(zoneGrid()).map(e=>[e.r.id,e.open.x,e.open.y,e.dx,e.dy]))')),`${name} ${label}: exposed rock`);
      assert.deepEqual(q('treasureRanks'),JSON.parse(sim.run('JSON.stringify(treasureRanks())')),`${name} ${label}: treasure ranks`);
      checks+=2;}}
    // mining: remove a spread of cells (rebuilding their chunks), then each zone must match again
    if(!id.startsWith('freeport')){const remove=JSON.parse(sim.run('JSON.stringify([...rocks.keys()].filter((_,i)=>i%53===7).slice(0,60))'));
     sim.run(`for(const r of ${JSON.stringify(remove)})removeRock(r)`);const after=jsState(sim);
     for(const {name,core,z} of made){for(const r of remove)assert.equal(core.call({op:'zone.query',zone:z,fn:'removeRock',args:[r]}).result,true);compareState(name,label+' after mining',after,core.call({op:'zone.state',zone:z}));}
     // a mission's clock moves on: more treasure
     if(missionActive){mission.elapsed+=901;const t=sim.run('refreshTreasure();zoneData[zone].treasure')??null,later=jsState(sim);
      for(const {name,core,z} of made){core.call({op:'zone.mission',zone:z,active:mission.active,elapsed:mission.elapsed});assert.equal(core.call({op:'zone.query',zone:z,fn:'refreshTreasure',args:[]}).result,t,`${name} ${label}: treasure as the mission runs`);
       compareState(name,label+' later in the mission',later,core.call({op:'zone.state',zone:z}));}}}
    for(const {core,z} of made)core.call({op:'zone.dispose',zone:z});
   }}}
 console.log('PASS: C++ core stage 6 — zones match the JavaScript zone simulation in both builds (rock, chunks, portals, boulders, treasure, harbour, arrivals; '+checks+' checks).');process.exit(0);
})().catch(e=>{console.error(e.message||e);process.exit(1);});
