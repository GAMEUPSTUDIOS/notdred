'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),physics=require('./native-physics.cjs'),codec=require('../dist/modules/save-codec.js');const root=path.resolve(__dirname,'..');
// Game code and the per-tick entry points are compiled once per process and run in each ship's context
// (previously every ship recompiled every file, and every tick recompiled 'step(dt)').
const compiled=new Map();function script(code,filename){let s=compiled.get(filename||code);if(!s){s=new vm.Script(code,{filename});compiled.set(filename||code,s);}return s;}
const sourceOf=f=>script(fs.readFileSync(f,'utf8'),f);
// hooks (optional, from server/zone-bus.cjs): authoritativeZone(id) → {seed,mined,regenIn}; zoneEvent(event).
// Live code results as text: JSON when it can be, else String(); long results are cut.
const devTickScript=new vm.Script('devTick(1/60)',{filename:'devTick'}),live=require('./live-code.cjs');
function showValue(v){let out;if(v===undefined)return 'undefined';if(typeof v==='function')return String(v).slice(0,400);try{out=JSON.stringify(v,(k,x)=>typeof x==='number'?+x.toFixed(4):x,1);}catch{out=undefined;}if(out===undefined)try{out=String(v);}catch{out='[value]';}return out.length>4000?out.slice(0,4000)+'…':out;}
function createRoom(saved,hooks={}){const LAG_MS=Number(process.env.LAG_MS||8),lag={ms:0,slow:0,reliefAt:0,reliefs:0};const elements={};const element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){this.open=true},close(){this.open=false},textContent:'',open:false});const s={ZoneGenerator:require('../dist/zone-generator.js'),ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},console,Date,nativeStep:physics.step,nativeStepDestroy:physics.destroy,authoritativeZone:hooks.authoritativeZone,zoneEvent:hooks.zoneEvent,authoritativeMission:hooks.authoritativeMission,zoneLink:hooks.zoneLink||null,occupiedByShips:hooks.occupiedByShips};vm.createContext(s);
 const run=(code)=>vm.runInContext(code,s,{timeout:5000}),exec=(sc)=>sc.runInContext(s,{timeout:5000});for(const f of ['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'])exec(sourceOf(path.join(root,'dist/modules/'+f+'.js')));exec(sourceOf(path.join(root,'dist/game.js')));s.loadState=saved||null;run('initialize(loadState)');exec(sourceOf(path.join(__dirname,'room-runtime.js')));
 // Direct references for the per-tick zone bus calls (avoids recompiling code strings 60x a second).
 // The hot paths (60 ticks a second, a snapshot per player 20 times a second, every command) call the game's functions
 // directly: each vm.runInContext with a timeout starts a watchdog, which cost more than most ships' whole tick.
 const fn=run('({step,snapshot,snapshotPass,command})');
 const zoneApi=run('({exterior,exteriorLayout,exteriorCrew,exteriorLive,exteriorMachines,syncGhosts,remoteMined,pvpHit,serverRegenerate,setRegenTimer,missionNotice,takeForces,setPose,zoneDamage,zonePierce,addZoneScore})');
 const api={zone:zoneApi,join(id,name,admin=false,rank='guest'){if(rank===true)rank='captain';else if(rank===false)rank='guest';s.args={id,name,admin,rank};run('{const c=newCrew(args.id,args.name);c.admin=args.admin;setCrewRank(args.id,args.rank);spawnKit(args.id);}');},setRank(id,rank){s.args={id,rank};return run('setCrewRank(args.id,args.rank)');},info(){return run('({name:shipName,score:shipScore,zone})');},setName(n){s.newName=n;run('shipName=cleanShipName(newName)||shipName');},leave(id){s.id=id;run('removeCrew(id)');},command(id,msg){return fn.command(id,msg);},// Dev live code (host token only): runs in this ship's simulation as crew member `id` (me), at most 1 s; the
  // result comes back as text. A global devTick(dt) set by such code runs after every tick (at most 100 ms; an error
  // or overrun switches it off).
  evalCode(id,code){/* Promise of {result, logs}; see live-code.cjs */s.me=id;return live.run(s,code,{before:()=>run('bindCrew(me)'),after:()=>{try{run('storeCrew()');}catch{}}});},
  tick(dt){const t0=performance.now();fn.step(dt);live.tickTimers(s);if(typeof s.devTick==='function'){try{devTickScript.runInContext(s,{timeout:100});}catch(e){s.devTick=null;try{s.devTickError=String(e?.message||e);run('toastAll("devTick stopped: "+devTickError)');}catch{}}}
  // Lag watchdog: a ship whose simulation costs more than LAG_MS per tick for ~3 s gets lag relief
  // (merged stacks, idle cargo put to sleep), at most every 30 s. lagMs is exposed for /health.
  const ms=performance.now()-t0;lag.ms=lag.ms*.98+ms*.02;lag.slow=lag.ms>LAG_MS?lag.slow+1:0;if(lag.slow>180&&Date.now()-lag.reliefAt>30000){lag.reliefAt=Date.now();lag.slow=0;lag.reliefs++;exec(script('lagRelief()'));}},lag:null,snapshot(id){return fn.snapshot(id);},snapshotPass(ids){return fn.snapshotPass(ids);},state(){return run('state()');},export(){return codec.encode(run('state()'));},dispose(){run('nativeStepDestroy(world);nativeStepDestroy(inside)');},run};api.lag=lag;return api;
}
module.exports={createRoom,showValue};
