'use strict';
// A shard: some of the server's zones — their shared worlds and every ship in them — simulated together on one thread
// (server/shard-worker.cjs runs one per worker thread; with a single core they run inside the main process). All the
// per-tick traffic between a ship and its zone (thrust, poses, hits, loot) stays inside the shard; the main thread
// (server.cjs) keeps the connections, accounts, ship records and files, routes each player's input to the shard that
// has their ship, and forwards the snapshots the shard builds. A ship that travels to a zone owned by another shard
// moves there with its crew (migrationState / adopt).
//
// Messages in (main → shard), each {t, …}: load, adopt, unload, returnHome, dispose, join, leave, command, rank, name,
// state, eval, call, backlog, mission, missionEvent, broadcast, zoneEval, shipEval, stop.
// Messages out (shard → main): reply {req,…}, snap {list:[[uid,text]…]}, info, log, send, migrate, closed, zones,
// mission, missionEvent, broadcast, state.
const {createRoom}=require('./room.cjs'),{ZoneBus}=require('./zone-bus.cjs'),crypto=require('node:crypto'),era=require('../dist/modules/era.js');
const SAVE_INTERVAL_MS=Number(process.env.SAVE_INTERVAL_MS||10000);

function createShard({index,zoneOwner,savedZones,post,warm=true}){
 const owns=z=>zoneOwner[z]===index,authority=index===0;
 // movedTo: ships that just moved to another shard; messages still on their way here for them are sent on (10 s).
 const rooms=new Map(),movedTo=new Map();let backlog=new Set(),stopped=false;
 const bus=new ZoneBus({saved:savedZones||{},owns,authority,onBroadcast:text=>{tellAll(text);post({t:'broadcast',text});},onMissionEvent:e=>post({t:'missionEvent',e})});
 // Mission news: told to this shard's ships at once, and through the main thread to the other shards'.
 function tellAll(text){for(const x of rooms.values()){try{x.game.zone.missionNotice(text);}catch{}}}
 const reply=(req,o={})=>{if(req!=null)post({t:'reply',req,...o});};
 const toUid=(uid,msg)=>post({t:'send',uid,msg});
 const errText=e=>String(e?.message||e).slice(0,180);
 // Warm-up, a moment after start: this shard's zone layouts are generated and the zone code compiled once (one zone's
 // world made and dropped), so the first ship into a zone doesn't stall the shard for half a second. (Not when the shard
 // runs on the main thread: there it would hold up the connections instead.)
 if(warm)setTimeout(()=>{const ids=Object.keys(zoneOwner).filter(z=>owns(z)&&era.ZONES[z]?.gen);let k=0;const next=()=>{if(stopped)return;if(k<ids.length){try{bus.zone(ids[k++]);}catch(e){console.error('Zone warm-up failed',e.message);}setTimeout(next,20);return;}
  const z=ids.find(x=>!bus.sims.has(x));if(!z)return;try{const sim=bus.sim(z);if(!sim.api.fleet.size){try{sim.run('nativeStepDestroy(world)');}catch{}bus.sims.delete(z);}}catch(e){console.error('Zone warm-up failed',e.message);}};next();},300).unref?.();

 // ---- Rooms -------------------------------------------------------------------------------------------------------
 // A room here: {id, name, game, members: Map(uid → {uid,name,admin,rank,layoutSeen,warKey,farZone,wasPiloting}),
 // tick, lastGood (the last saved state, for recovery), failures, and the caches bus.others() reads.
 function makeRoom(id,name,saved){const r={id,name,game:null,members:new Map(),tick:0,lastGood:saved||null,failures:[],layoutCache:null,lastZone:null};r.game=createRoom(saved||null,bus.hooksFor(r));r.game.setName(name);rooms.set(id,r);return r;}
 function member(uid,name,admin,rank){return {uid,name,admin:!!admin,rank:rank||'guest',layoutSeen:new Map(),warKey:undefined,farZone:undefined,wasPiloting:false};}
 function dispose(r){try{r.game.dispose();}catch{}rooms.delete(r.id);}
 function durable(r){return r.game.run('durableState()');}
 // A simulation error doesn't end the session: the ship is rebuilt from its last save and the crew rejoin it. Three
 // failures inside a minute means the save itself is bad: the main thread is told to close the ship.
 function recover(r,err){console.error('Room tick failed',r.id,err?.stack||err);const now=Date.now();r.failures=r.failures.filter(t=>now-t<60000);r.failures.push(now);try{r.game.dispose();}catch{}
  if(r.failures.length>=3||!r.lastGood){rooms.delete(r.id);post({t:'closed',id:r.id,message:'This ship keeps failing to simulate and was closed. Your last save is kept.'});return;}
  try{r.game=createRoom(r.lastGood,bus.hooksFor(r));r.game.setName(r.name);r.layoutCache=null;for(const m of r.members.values()){r.game.join(m.uid,m.name,m.admin,m.rank);m.layoutSeen=new Map();toUid(m.uid,{type:'error',message:'The ship hit a simulation error and was restored from its last save.'});}}
  catch(e){console.error('Recovery failed',r.id,e.message);rooms.delete(r.id);post({t:'closed',id:r.id,message:'This ship could not be restored. Your last save is kept.'});}}
 // A ship whose zone belongs to another shard leaves with its crew; the main thread hands it to that shard.
 function migrate(r,to){let state;try{state=r.game.run('migrationState()');}catch(e){return recover(r,e);}dispose(r);movedTo.set(r.id,{to,at:Date.now()});
  post({t:'migrate',id:r.id,to,state,tick:r.tick,lastGood:r.lastGood,inbox:r.inbox||[],members:[...r.members.values()].map(m=>({uid:m.uid,name:m.name,admin:m.admin,rank:m.rank}))});}

 // ---- Snapshots (20 a second) ---------------------------------------------------------------------------------------
 // Other ships' crew, machines and live view are encoded once per pass per ship (r.json) and spliced into every viewer's list.
 function othersJSON(list){return '['+list.map(o=>{const r=rooms.get(o.id),j=r?.json,{crew,machines,live,...rest}=o;let t=JSON.stringify(rest).slice(0,-1);
  if(crew!==undefined)t+=',"crew":'+(j&&crew===r.crewCache?j.crew:JSON.stringify(crew));if(machines!==undefined)t+=',"machines":'+(j&&machines===r.machinesCache?j.machines:JSON.stringify(machines));if(live!==undefined){const {i,gone,full}=live;t+=',"live":'+(j?.liveBase!=null&&live.__base?'{'+(j.liveBase?j.liveBase+',':'')+'"i":'+JSON.stringify(i)+',"gone":'+JSON.stringify(gone)+',"full":'+full+'}':JSON.stringify(live));}return t+'}';}).join(',')+']';}
 // The ship's shared part (the same for everyone aboard) comes first; the member's own fields follow and win.
 function snapshotText(tick,st,others,shared,tail=''){const own=st==null?'{}':JSON.stringify(st),head=st!=null&&shared&&shared!=='{}'?shared.slice(0,-1)+',':'{',body=own==='{}'?head:head+own.slice(1,-1)+',';return '{"type":"snapshot","tick":'+JSON.stringify(tick)+',"state":'+body+'"others":'+othersJSON(others)+tail+'}}';}
 let farPass=0;
 function snapshotPass(){const loaded=[...rooms.values()],live=loaded.filter(r=>r.members.size),out=[];
  // Only ships someone else can see in full need their exterior built (interest management, zone-bus.cjs VIEW_RANGE).
  const watched=bus.watched(live);farPass=(farPass+1)%4;
  for(const r of loaded){if(!watched.has(r)){r.unwatched=true;continue;}const fresh=r.unwatched!==false;r.unwatched=false;try{const layout=r.game.zone.exteriorLayout(),key=crypto.createHash('sha1').update(JSON.stringify(layout)).digest('base64').slice(0,12);if(r.layoutCache?.key!==key)r.layoutCache={key,layout};r.crewCache=r.game.zone.exteriorCrew();r.machinesCache=r.game.zone.exteriorMachines();r.livePass=((r.livePass||0)+1)%20;r.liveCache=r.game.zone.exteriorLive();const {i,...liveBase}=r.liveCache;r.json={crew:JSON.stringify(r.crewCache),machines:JSON.stringify(r.machinesCache),liveBase:JSON.stringify(liveBase).slice(1,-1)};}catch(e){recover(r,e);}}
  for(const r of live){if(!r.game||!rooms.has(r.id))continue;try{/* a player whose connection hasn't taken the last few snapshots skips this one (built for nobody, so their deltas stay right) */const members=[...r.members.values()].filter(m=>!backlog.has(m.uid));if(!members.length)continue;const pass=r.game.snapshotPass(members.map(m=>m.uid));
    members.forEach((m,k)=>{const st=pass.own[k];
     // Log: helm use, and zone changes (credited to whoever is at the helm).
     const pil=!!st?.self?.piloting;if(pil&&!m.wasPiloting)post({t:'log',id:r.id,uid:m.uid,text:'started using helm.',kind:'helm'});m.wasPiloting=pil;
     if(st&&r.lastZone&&st.zone!==r.lastZone&&!r.zoneLogged){const pilot=[...r.members.values()].find(x=>x.wasPiloting);post({t:'log',id:r.id,uid:pilot?.uid||null,zoneTo:st.zone,kind:'zone'});r.zoneLogged=true;}
     out.push([m.uid,snapshotText(r.tick,st,bus.others(r,m.layoutSeen),pass.shared,bus.warFor(r,m)+(farPass===0||m.farZone!==st?.zone?(m.farZone=st?.zone,',"far":'+JSON.stringify(bus.far(r))):''))]);});
    r.zoneLogged=false;r.lastZone=r.game.zoneId();}catch(e){recover(r,e);}}
  if(out.length)post({t:'snap',list:out});}

 function drainInbox(r){const list=r.inbox;r.inbox=[];for(const [uid,msg] of list){if(!r.members.has(uid))continue;try{r.game.command(uid,msg);}catch(e){toUid(uid,{type:'error',message:errText(e)});}}}
 // ---- Simulation loop -------------------------------------------------------------------------------------------------
 let previous=performance.now(),acc=0,frames=0,tickMs=0;const perf={worst:0,behind:0,calls:0,since:Date.now(),last:null};
 const timer=setInterval(()=>{if(stopped)return;const now=performance.now();acc+=Math.min((now-previous)/1000,.1);previous=now;let steps=0;const t0=performance.now();
  while(acc>=1/60&&steps++<3){const active=[];
   /* nobody aboard: the hull stays in the zone (others see it, bots can still shoot it), its inside isn't simulated */
   for(const r of [...rooms.values()]){try{if(r.inbox?.length)drainInbox(r);if(r.members.size){r.game.tick(1/60);r.tick++;}const z=r.game.zoneId(),to=zoneOwner[z];if(to!=null&&to!==index){migrate(r,to);continue;}active.push(r);}catch(e){recover(r,e);}}
   try{bus.step(active.filter(r=>rooms.has(r.id)),1/60);}catch(e){console.error('Zone bus step failed',e.stack);}
   acc-=1/60;frames++;}
  if(steps>=3){acc=Math.min(acc,1/60);perf.behind++;}{const ms=performance.now()-t0;tickMs=tickMs*.9+ms*.1;perf.worst=Math.max(perf.worst,ms);perf.calls++;
   if(Date.now()-perf.since>10000){perf.last={worstMs:+perf.worst.toFixed(1),fellBehindPct:+(perf.behind/Math.max(1,perf.calls)*100).toFixed(1),avgMs:+tickMs.toFixed(2)};if(perf.last.fellBehindPct>5)console.warn('Shard '+index+' is falling behind: '+perf.last.fellBehindPct+'% of ticks in the last 10 s (worst '+perf.last.worstMs+' ms)');perf.worst=0;perf.behind=0;perf.calls=0;perf.since=Date.now();}}
  if(frames>=3){frames=0;snapshotPass();}},1000/60);
 // Four times a second: what the main thread shows in ship lists, the leaderboard and /health; once a second, the
 // mission schedule (from the authority shard) for the others.
 let infoPass=0;const infoTimer=setInterval(()=>{if(stopped)return;for(const [id,mv] of movedTo)if(Date.now()-mv.at>10000)movedTo.delete(id);const list=[],zones={};for(const r of rooms.values()){try{const i=r.game.info();r.name=i.name||r.name;list.push([r.id,i.name,i.score,i.zone,r.game.lag?+r.game.lag.ms.toFixed(2):0]);zones[i.zone]=(zones[i.zone]||0)+1;}catch{}}
  post({t:'info',rooms:list,zones,perf:{tickMs:+tickMs.toFixed(2),last10s:perf.last,sims:[...bus.sims.keys()]}});if(authority&&++infoPass%4===0)post({t:'mission',m:bus.mission});},250);
 // Every SAVE_INTERVAL_MS: crewed ships' states (the main thread writes them only when they changed) and changed zones.
 const saveTimer=setInterval(()=>{if(stopped)return;for(const r of rooms.values())if(r.members.size){try{const state=durable(r);r.lastGood=state;post({t:'state',id:r.id,state,periodic:true});}catch(e){console.error('Save failed',r.id,e.message);}}
  if(bus.dirty){bus.dirty=false;post({t:'zones',records:bus.zoneRecords()});}},SAVE_INTERVAL_MS);

 // ---- Messages from the main thread ----------------------------------------------------------------------------------
 const RUNNABLE={commsCheck:(r,uid)=>!!r.game.run('commsCheck('+JSON.stringify(String(uid))+')'),stacks:(r,uid)=>(r.game.snapshot(uid)?.stacks||[]).filter(Boolean).map(x=>({type:x.type,count:x.count})),notice:(r,text)=>{r.game.zone.missionNotice(String(text));return true;}};
 const FORWARD=new Set(['command','rank','name','leave','dispose']);
 function handle(m){const r=m.id!=null?rooms.get(m.id):null;
  if(!r&&m.id!=null&&FORWARD.has(m.t)){const mv=movedTo.get(m.id);if(mv&&Date.now()-mv.at<10000){post({t:'forward',to:mv.to,msg:m});return;}}
  if(m.t==='load'||m.t==='adopt')movedTo.delete(m.id);
  try{switch(m.t){
  case 'load':{if(r){reply(m.req,{ok:true,zone:r.game.zoneId()});break;}const n=makeRoom(m.id,m.name,m.saved);if(m.spawn){try{n.game.run('spawnInFreeport()');}catch(e){console.error('Spawn failed',m.id,e.message);}}reply(m.req,{ok:true,zone:n.game.zoneId()});break;}
  case 'adopt':{if(r)dispose(r);const n=makeRoom(m.id,m.name,m.state.ship);n.tick=m.tick||0;n.lastGood=m.lastGood||null;n.game.adopt(m.state);for(const x of m.members||[])n.members.set(x.uid,member(x.uid,x.name,x.admin,x.rank));n.inbox=(m.inbox||[]).filter(([uid])=>n.members.has(uid));break;}
  case 'unload':{if(!r)return reply(m.req,{missing:true});const state=durable(r);dispose(r);reply(m.req,{state});break;}
  case 'returnHome':{if(!r)return reply(m.req,{missing:true});try{r.game.run('returnToFreeport("empty")');}catch(e){console.error('Return failed',r.id,e.message);}const state=durable(r);dispose(r);reply(m.req,{state});break;}
  case 'dispose':{if(r)dispose(r);break;}
  case 'join':{if(!r)return reply(m.req,{missing:true});r.game.join(m.uid,m.name,m.admin,m.rank);const mem=member(m.uid,m.name,m.admin,m.rank);r.members.set(m.uid,mem);
   reply(m.req,{ok:true,tick:r.tick,snapshot:JSON.stringify({type:'snapshot',tick:r.tick,state:{...r.game.snapshot(m.uid),others:bus.others(r,mem.layoutSeen)}})});break;}
  case 'leave':{if(!r)break;r.members.delete(m.uid);try{r.game.leave(m.uid);}catch(e){console.error('Leave failed',r.id,e.message);}break;}
  // Applied at the start of the ship's next tick, in order (as when everything ran on one thread: a command sent after a
  // zone change sees the new zone attached).
  case 'command':{if(!r||!r.members.has(m.uid))break;(r.inbox??=[]).push([m.uid,m.msg]);if(r.inbox.length>512)r.inbox.splice(0,r.inbox.length-512);break;}
  case 'rank':{if(!r)break;const mem=r.members.get(m.uid);if(mem)mem.rank=m.rank;r.game.setRank(m.uid,m.rank);break;}
  case 'name':{if(!r)break;r.game.setName(m.name);r.name=m.name;break;}
  case 'state':{if(!r)return reply(m.req,{missing:true});const state=durable(r);r.lastGood=state;reply(m.req,{state});break;}
  case 'eval':{if(!r)return reply(m.req,{missing:true});let p;if(m.target==='zone'){const sim=bus.simOf(r);if(!sim)throw Error('This ship is not in a shared zone right now.');p=sim.evalCode(m.code);}else p=r.game.evalCode(m.uid,m.code);
   Promise.resolve(p).then(o=>reply(m.req,{ok:true,result:o.result,logs:o.logs}),e=>reply(m.req,{ok:false,error:String(e?.stack||e).split('\n').slice(0,6).join('\n').slice(0,2000)}));break;}
  case 'shipEval':{if(!r)return reply(m.req,{missing:true});Promise.resolve(r.game.evalCode([...r.members.keys()][0]||null,m.code)).then(o=>reply(m.req,{ok:true,result:o.result,logs:o.logs}),e=>reply(m.req,{ok:false,error:String(e?.message||e)}));break;}
  case 'zoneEval':{const sim=bus.sims.get(m.zone);if(!sim)return reply(m.req,{ok:false,error:'Zone '+m.zone+' is not running'});Promise.resolve(sim.evalCode(m.code)).then(o=>reply(m.req,{ok:true,result:o.result,logs:o.logs}),e=>reply(m.req,{ok:false,error:String(e?.message||e)}));break;}
  case 'call':{if(!r)return reply(m.req,{missing:true});const f=RUNNABLE[m.fn];if(!f)throw Error('Unknown call '+m.fn);reply(m.req,{ok:true,value:f(r,...(m.args||[]))});break;}
  case 'backlog':{backlog=new Set(m.uids||[]);break;}
  case 'mission':{if(!authority)bus.setMission(m.m);break;}
  case 'missionEvent':{if(authority)bus.queue.push({room:null,e:m.e});break;}
  case 'broadcast':{tellAll(m.text);break;}
  case 'stop':{stopped=true;clearInterval(timer);clearInterval(infoTimer);clearInterval(saveTimer);const states=[];for(const x of rooms.values()){try{states.push([x.id,durable(x)]);}catch(e){console.error('Save failed',x.id,e.message);}}
   reply(m.req,{states,zones:bus.zoneRecords()});for(const x of [...rooms.values()])dispose(x);break;}
  default:throw Error('Unknown shard message '+m.t);}}
  catch(e){if(m.req!=null)reply(m.req,{ok:false,error:errText(e)});else if(m.uid)toUid(m.uid,{type:'error',message:errText(e)});else console.error('Shard '+index+' message '+m.t+' failed:',e.message);}}
 return {handle,index,rooms,bus};
}
module.exports={createShard};
