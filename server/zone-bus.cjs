'use strict';
const LIVE_RANGE=Number(process.env.LIVE_RANGE||240);
// Interest management: a client gets other ships in full (hull layout, crew, machines) only within VIEW_RANGE of its
// own ship (a little further once it already has them, so ships on the edge don't flicker); the rest of the zone comes
// as a compact list for the minimap, five times a second.
const VIEW_RANGE=Number(process.env.VIEW_RANGE||520),VIEW_KEEP=VIEW_RANGE+60,DETAIL_RANGE=Number(process.env.DETAIL_RANGE||300),DETAIL_KEEP=DETAIL_RANGE+40;
// PvP wars: a sinking (towed home after staying critical) is credited to the last ship that hit it within this window.
const WAR_CREDIT_SECONDS=Number(require('../dist/modules/era.js').RETURN_SECONDS||600)+30,WAR_BOARD_ROWS=20,WAR_FEED=10;
// Shared zones. Each zone has ONE shared world (server/zone-sim.cjs): its rock, boulders, bots, loot, projectiles
// and the hull of every ship in it. Each ship's room keeps its interior and crew, sends thrust and shots to its zone,
// and takes back its position, damage and loot. The bus also keeps, per combat zone:
//   * one seed + one mined-rock set per combat zone, so every ship sees the same caves and loses the same rock;
//   * zone regeneration decided once for everyone: every ZONE_RESET_SECONDS (3 h), or early once 80% is
//     cleared (ℵ25: visible 10-minute countdown) — always with a new seed;
//   * other ships appear in each room as kinematic "ghost" hulls (collisions, and RC shots stop on them);
//   * RC hits on a ghost are delivered to the real ship, scaled by the zone's PvP rule (era.js).
// Events raised during a room's tick are queued and applied after all rooms have ticked.
const fs=require('node:fs'),path=require('node:path'),ZoneGenerator=require('../dist/zone-generator.js'),era=require('../dist/modules/era.js'),{createZoneSim}=require('./zone-sim.cjs');

class ZoneBus{
 constructor({dataDir=null,random=Math.random}={}){
  this.file=dataDir?path.join(dataDir,'zones.json'):null;this.random=random;this.zones=new Map();this.sims=new Map();this.queue=[];this.lastExteriors=new Map();this.wars=new Map();this.roomZones=new Map();this.clock=0;this.tickNo=0;this.SIM_IDLE_MS=Number(process.env.ZONE_IDLE_MS||120000);this.mission={active:null,endsIn:0,nextIn:era.MISSIONS.intervalSeconds,elapsed:0,index:0};
  if(this.file&&fs.existsSync(this.file)){try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved._mission&&typeof saved._mission==='object'){const m=saved._mission;this.mission={...this.mission,...m,active:era.ZONES[m.active]?.mission?m.active:null};}/* a zone saved from an older map generator (smaller 2019-size caves) starts over: its mined tiles were another map's */for(const [id,z] of Object.entries(saved))if(era.ZONES[id]?.gen){const v=ZoneGenerator.generate(0,{...era.ZONES[id].gen,width:15,height:15}).version;this.zones.set(id,(z.gv||1)===v?this.fresh(id,z.seed,z.mined,z.regenIn,z.resetIn):this.fresh(id,z.seed));}}catch(e){console.error('Ignoring unreadable zones.json:',e.message);}}
 }
 fresh(id,seed=0,mined=[],regenIn=null,resetIn=era.ZONE_RESET_SECONDS||null){if(era.ZONES[id].mission){regenIn=null;resetIn=null;}const g=ZoneGenerator.generate(seed,era.ZONES[id].gen);let total=0;for(const v of g.solid)total+=v;return {id,seed,grid:g,mined:new Set(mined),total,regenIn,resetIn};}
 zone(id){if(!era.ZONES[id]?.gen)return null;let z=this.zones.get(id);if(!z){z=this.fresh(id);this.zones.set(id,z);}return z;}
 // Hooks handed to createRoom(saved, hooks) for one room record.
 // occupiedByShips asks the other simulating ships for their live position, so two ships arriving in the same
 // tick still see each other.
 hooksFor(room){return {occupiedByShips:id=>{const out=[];for(const r of this.lastRooms||[]){if(r===room||!r.game)continue;try{const x=r.game.zone.exterior();if(x.zone===id)out.push({x:x.x,y:x.y,ext:x.ext});}catch{}}return out;},authoritativeZone:id=>{const z=this.zone(id);return z&&{seed:z.seed,grid:z.grid,mined:[...z.mined],regenIn:z.regenIn,resetIn:z.resetIn};},zoneEvent:e=>this.queue.push({room,e}),authoritativeMission:()=>this.mission,
  zoneLink:{fire:list=>this.simOf(room)?.api.zsFire(room.id,list),addLoot:(type,x,y,count,vx,vy)=>this.simOf(room)?.api.zsAddLoot(type,x,y,count,vx,vy,2),claim:(x,y,allow)=>this.simOf(room)?.api.zsClaimLoot(room.id,x,y,allow)??null,snapshot:()=>this.simSnapshot(this.simOf(room)),dev:(op,species)=>this.simOf(room)?.api.zsDev(op,species,room.id)}};}
 simOf(room){for(const sim of this.sims.values())if(sim.api.fleet.has(room.id))return sim;return null;}
 roomById(id){return (this.lastRooms||[]).find(r=>r.id===id)||null;}
 // One snapshot of a zone's shared contents per tick, shared by every ship's snapshot.
 simSnapshot(sim){if(!sim)return null;if(sim.snapTick!==this.tickNo){sim.snap=sim.api.zsSnapshot();sim.snapTick=this.tickNo;}return sim.snap;}
 sim(id){let sim=this.sims.get(id);if(sim)return sim;const bus=this,zoneOf=()=>id;
  sim=createZoneSim(id,{authoritativeZone:zid=>{const z=bus.zone(zid);return z&&{seed:z.seed,grid:z.grid,mined:[...z.mined],regenIn:z.regenIn,resetIn:z.resetIn};},authoritativeMission:()=>bus.mission,
   damage:(sid,amount,lp,dir,ammo)=>{const r=bus.roomById(sid);if(!r?.game)return null;try{return r.game.zone.zoneDamage(amount,lp,dir,ammo);}catch(e){console.error('zone damage failed',e.message);return null;}},
   pvpHit:(target,amount,lp,dir,ammo,shooter)=>{const self=target===shooter;if(!self&&!era.ZONES[id]?.pvp)return null;const r=bus.roomById(target),from=bus.roomById(shooter);if(!r?.game)return;amount=Math.min(Number(amount)||0,Math.max(...Object.values(era.AMMO).map(a=>a.damage)));if(!(amount>0))return;const res=r.game.zone.pvpHit(amount,lp,dir,ammo,self?null:from?.name||'another ship');if(!self&&from)bus.warHit(id,r,from,res);return res;},
   pierce:(sid,amount,a,b)=>{const r=bus.roomById(sid);if(!r?.game)return {exit:true};try{return r.game.zone.zonePierce(amount,a,b);}catch(e){console.error('zone pierce failed',e.message);return {exit:true};}},
   score:(sid,n)=>{const r=bus.roomById(sid);try{r?.game?.zone.addZoneScore(n);}catch{}},
   toast:m=>{for(const r of bus.lastRooms||[])if(sim.api.fleet.has(r.id)){try{r.game.zone.missionNotice(m);}catch{}}},
   mined:(rid,seed)=>{const z=bus.zone(id);if(!z||z.seed!==seed||z.mined.has(rid))return;z.mined.add(rid);bus.dirty=true;for(const r of bus.lastRooms||[])if(sim.api.fleet.has(r.id)){try{r.game.zone.remoteMined(rid);}catch{}}}});
  this.sims.set(id,sim);return sim;}
 // Called once per server tick with the rooms that are currently simulating.
 step(rooms,dt){
  this.clock+=dt;this.tickNo++;this.lastRooms=rooms;
  // 1. Where is every ship, and which zone is it in?
  const ext=new Map();for(const r of rooms){try{ext.set(r,{...r.game.zone.exterior(),id:r.id,name:r.name});}catch{}}
  this.lastExteriors=ext;
  // 2. Shared worlds: each ship's hull joins its zone's world (leaving the one it was in) and hands over its thrust.
  for(const sim of this.sims.values())for(const id of sim.ships()){const r=rooms.find(x=>x.id===id),x=r&&ext.get(r);if(!x||x.zone!==sim.id)sim.api.zsRemoveShip(id);}
  // A ship arriving in a world (new, reloaded, or after a restart) never appears inside another ship: new ships all
  // start at 0,0, so a second one used to land in the first and the two were shoved apart as one tangled lump.
  for(const [r,x] of ext){const s0=this.sims.get(x.zone);if(s0&&s0.api.fleet.has(r.id))continue;try{if(r.game.run('clearSpawnSpot()'))ext.set(r,{...r.game.zone.exterior(),id:r.id,name:r.name});}catch{}}
  for(const [r,x] of ext){const sim=this.sim(x.zone),info={x:x.x,y:x.y,vx:x.vx,vy:x.vy,ext:x.ext,size:x.size,mass:x.mass,damping:x.damping,docked:x.docked,name:r.name,noclip:!!x.noclip};
   if(!sim.api.fleet.has(r.id))sim.api.zsAddShip(r.id,info);else{sim.api.zsUpdateShip(r.id,info);if(x.placed)sim.api.zsPlaceShip(r.id,info);}
   const f=r.game.zone.takeForces();sim.api.zsForces(r.id,f.forces,f.impulses);sim.emptySince=Date.now();}
  // 3. Apply queued room events: regeneration requests, missions, developer operations.
  const events=this.queue.splice(0);
  for(const {room,e} of events){
   if(e.type==='regenRequest')this.regenerate(e.zone,ext);
   else if(e.type==='missionStart')this.startMission(e.zone,ext);
   else if(e.type==='endmission'){if(this.mission.active)this.mission.endsIn=0;}
   else if(e.type==='sunk')this.warSunk(room,e.zone);
   else if(e.type==='treasure'){if(this.mission.active){this.mission.elapsed+=era.MISSIONS.treasureEverySeconds;this.mission.endsIn=Math.max(30,this.mission.endsIn-era.MISSIONS.treasureEverySeconds);}}
  }
  // A ship that left a zone takes no pending kill credit with it; the war boards publish damage twice a second.
  for(const [r,x] of ext){const was=this.roomZones.get(r.id);if(was&&was!==x.zone)this.wars.get(was)?.hits.delete(r.id);this.roomZones.set(r.id,x.zone);}
  if(this.tickNo%30===0)for(const w of this.wars.values())if(w.dirty){w.dirty=false;w.v++;w.json=null;}
  // 4. Step every shared world that has ships, then hand each ship back its position.
  for(const sim of this.sims.values()){if(!sim.api.fleet.size)continue;try{sim.api.zsStep(dt);sim.devTick?.();}catch(e){console.error('Zone step failed',sim.id,e.stack);}}
  for(const [r,x] of ext){const p=this.simOf(r)?.api.zsShip(r.id);if(p&&!x.docked){try{r.game.zone.setPose(p.x,p.y,p.vx,p.vy,p.kx,p.ky);}catch{}}}
  // Shared worlds nobody has used for a while are dropped (their loose loot with them).
  for(const [id,sim] of this.sims)if(!sim.api.fleet.size&&Date.now()-sim.emptySince>this.SIM_IDLE_MS){try{sim.run('nativeStepDestroy(world)');}catch{}this.sims.delete(id);}
  // Mission schedule (ℵ33): one for the whole server. Ships left in a closed mission zone send themselves home.
  // Canary-style missions also end once enough of the zone is mined (clearToEnd), and report progress.
  const m=this.mission;m.nextIn-=dt;if(m.active){m.elapsed+=dt;m.endsIn-=dt;const def=era.ZONES[m.active],z=this.zones.get(m.active);
   if(def.clearToEnd&&z){m.cleared=+(z.mined.size/(z.grid.mineable||z.total)).toFixed(4);if(m.cleared>=def.clearToEnd&&m.endsIn>0){m.endsIn=0;m.clearedOut=true;}}
   if(m.endsIn<=0){const id=m.active;m.active=null;m.endsIn=0;m.nextIn=Math.max(m.nextIn,era.MISSIONS.intervalSeconds-era.MISSIONS.durationSeconds);this.dirty=true;this.broadcast(ext,m.clearedOut?era.ZONES[id].name+' is '+Math.round(era.ZONES[id].clearToEnd*100)+'% mined — mission complete.':era.ZONES[id].name+' mission closed.');m.clearedOut=false;}}
  // One mission at a time: a long one (Canary, 3 hours) holds the next back until it closes.
  if(m.nextIn<=0&&!m.active)this.startMission(era.MISSIONS.rotation[m.index%era.MISSIONS.rotation.length],ext);
  // 5. Regeneration countdowns (ℵ25 rules), shown on every ship's minimap.
  const second=Math.floor(this.clock)!==Math.floor(this.clock-dt);
  for(const z of this.zones.values()){
   if(era.ZONES[z.id].mission){if(second)for(const [r,x] of ext)if(x.zone===z.id)r.game.zone.setRegenTimer(null,null);continue;}
   if(z.regenIn==null&&z.mined.size>=z.total*era.REGEN.clearFraction){z.regenIn=era.REGEN.delaySeconds;this.dirty=true;}
   if(z.regenIn!=null)z.regenIn-=dt;if(z.resetIn!=null)z.resetIn-=dt;
   if(z.regenIn!=null&&z.regenIn<=0||z.resetIn!=null&&z.resetIn<=0){this.regenerate(z.id,ext);continue;}
   if(second){this.dirty=true;for(const [r,x] of ext)if(x.zone===z.id)r.game.zone.setRegenTimer(z.regenIn,z.resetIn);}
  }
 }
 regenerate(id,ext=this.lastExteriors){const old=this.zone(id);if(!old)return;this.warReset(id);let seed;do seed=Math.floor(this.random()*999983);while(seed===old.seed);this.zones.set(id,this.fresh(id,seed));this.dirty=true;this.sims.get(id)?.api.zsRegenerate(seed);for(const [r,x] of ext)if(x.zone===id)r.game.zone.serverRegenerate(seed);}
 startMission(id,ext=this.lastExteriors){if(!era.ZONES[id]?.mission)id=era.MISSIONS.rotation[this.mission.index%era.MISSIONS.rotation.length];const m=this.mission;m.index=(era.MISSIONS.rotation.indexOf(id)+1)%era.MISSIONS.rotation.length;m.active=id;m.endsIn=era.ZONES[id].missionSeconds||era.MISSIONS.durationSeconds;m.cleared=0;m.elapsed=0;m.nextIn=era.MISSIONS.intervalSeconds;this.regenerate(id,ext);this.dirty=true;this.broadcast(ext,'Mission started: '+era.ZONES[id].name+' is open for '+Math.round(era.MISSIONS.durationSeconds/60)+' minutes. Take the gold portal in Sparrow I.');}
 broadcast(ext,text){for(const r of ext.keys()){try{r.game.zone.missionNotice(text);}catch{}}}
 // Other ships in the same zone, for a client's snapshot. Layouts are sent only when they change.
 // Within DETAIL_RANGE a ship comes with its crew and physics machines (ten times a second, alternating with plain
 // position updates) and, within LIVE_RANGE, what's happening aboard; further out (to VIEW_RANGE) just the hull.
 others(room,seen){const me=this.lastExteriors.get(room);if(!me)return [];const out=[];const det=seen.detail??=new Set(),odd=(seen.n=(seen.n||0)+1)%2===1;
  for(const [r,x] of this.lastExteriors){if(r===room||x.zone!==me.zone||!r.layoutCache)continue;const d=Math.hypot(x.x-me.x,x.y-me.y);if(d>(seen.has(r.id)?VIEW_KEEP:VIEW_RANGE))continue;
   const layout=r.layoutCache?.layout;const o={id:r.id,name:r.name,x:+x.x.toFixed(3),y:+x.y.toFixed(3),vx:+x.vx.toFixed(3),vy:+x.vy.toFixed(3),hp:Math.ceil(x.hp),maxHp:x.maxHp,booster:x.booster||0,size:x.size,layoutKey:r.layoutCache?.key};
   const fresh=!!layout&&seen.get(r.id)!==o.layoutKey;if(fresh){o.layout=layout;seen.set(r.id,o.layoutKey);}
   const detail=d<=(det.has(r.id)?DETAIL_KEEP:DETAIL_RANGE);
   if(detail){if(fresh||odd||!det.has(r.id)){o.crew=r.crewCache||[];o.machines=r.machinesCache||[];det.add(r.id);
     // Everything happening aboard, for ships close enough to see it.
     if(r.liveCache&&d<LIVE_RANGE)o.live=r.liveCache;}}
   else if(fresh||det.has(r.id)){o.crew=[];o.machines=[];det.delete(r.id);}
   out.push(o);}
  // A ship that left this player's view is forgotten, so its layout is sent again when it comes back.
  const visible=new Set(out.map(o=>o.id));for(const k of [...seen.keys()])if(!visible.has(k))seen.delete(k);for(const k of [...det])if(!visible.has(k))det.delete(k);
  return out;}
 // Which loaded ships someone else can see in full (only those need their crew, machines and live view built).
 watched(liveRooms){const out=new Set(),me=[];for(const r of liveRooms){const x=this.lastExteriors.get(r);if(x)me.push([r,x]);}
  for(const [r,x] of this.lastExteriors)for(const [v,y] of me)if(v!==r&&y.zone===x.zone&&Math.hypot(x.x-y.x,x.y-y.y)<=VIEW_KEEP){out.add(r);break;}return out;}
 // The rest of the zone for the minimap: [id, x, y, hp, maxHp, width, height, name] per ship.
 far(room){const me=this.lastExteriors.get(room);if(!me)return [];const out=[];for(const [r,x] of this.lastExteriors){if(r===room||x.zone!==me.zone)continue;if(Math.hypot(x.x-me.x,x.y-me.y)<=VIEW_RANGE)continue;const e=x.ext||{l:-4,r:4,t:-4,b:4};out.push([r.id,Math.round(x.x*10)/10,Math.round(x.y*10)/10,Math.ceil(x.hp||0),x.maxHp||0,Math.round(e.r-e.l),Math.round(e.b-e.t),r.name]);}return out;}
 // ---- PvP wars ------------------------------------------------------------------------------------------------
 // Per combat zone with PvP: damage each ship dealt to other ships, disables (a hit that took a ship's shields to 0,
 // making it critical), kills (a ship towed home after staying critical — credited to the last ship that hit it
 // within WAR_CREDIT_SECONDS) and deaths, plus a feed of the latest disables and kills. A war lasts as long as its
 // map: it starts over when the zone regenerates (and with each mission).
 war(zid){let w=this.wars.get(zid);if(!w){w={zone:zid,v:1,seq:0,board:new Map(),feed:[],hits:new Map(),dirty:false,json:null};this.wars.set(zid,w);}return w;}
 warRow(w,r){let e=w.board.get(r.id);if(!e){e={name:r.name,kills:0,disables:0,deaths:0,damage:0};w.board.set(r.id,e);}if(r.name)e.name=r.name;return e;}
 warFeed(w,kind,a,b){w.feed.push({n:++w.seq,kind,a,b,at:this.clock});if(w.feed.length>WAR_FEED)w.feed.shift();w.v++;w.json=null;w.dirty=false;}
 warHit(zid,target,from,res){if(!era.ZONES[zid]?.pvp)return;const w=this.war(zid),dealt=Number(res?.dealt);this.warRow(w,from).damage+=Number.isFinite(dealt)&&dealt>0?dealt:0;this.warRow(w,target);w.hits.set(target.id,{by:from.id,name:from.name,t:this.clock});w.dirty=true;
  if(res?.critical){this.warRow(w,from).disables++;this.warFeed(w,'disable',from.name,target.name);}}
 warSunk(room,zid){if(!era.ZONES[zid]?.pvp)return;const w=this.war(zid),h=w.hits.get(room.id);w.hits.delete(room.id);this.warRow(w,room).deaths++;
  const by=h&&h.by!==room.id&&this.clock-h.t<=WAR_CREDIT_SECONDS?h:null;if(by){const row=w.board.get(by.by)||(w.board.set(by.by,{name:by.name,kills:0,disables:0,deaths:0,damage:0}),w.board.get(by.by));row.kills++;this.warFeed(w,'kill',row.name,room.name);}else this.warFeed(w,'lost',null,room.name);}
 warReset(zid){if(!this.wars.has(zid))return;const w=this.war(zid);w.board.clear();w.hits.clear();w.feed.length=0;w.v++;w.json=null;w.dirty=false;}
 // The war in this ship's zone as snapshot text (only when it changed since this client last got it), else ''.
 warFor(room,ws){const me=this.lastExteriors.get(room);const w=me&&era.ZONES[me.zone]?.pvp?this.wars.get(me.zone):null;const key=w?w.zone+':'+w.v:'';if(ws.warKey===key)return '';ws.warKey=key;if(!w)return ',"war":null';
  if(!w.json){const board=[...w.board.entries()].map(([id,e])=>({id,name:e.name,kills:e.kills,disables:e.disables,deaths:e.deaths,damage:Math.round(e.damage)})).sort((a,b)=>b.kills-a.kills||b.disables-a.disables||b.damage-a.damage||a.deaths-b.deaths).slice(0,WAR_BOARD_ROWS);
   w.json=JSON.stringify({zone:w.zone,v:w.v,ships:w.board.size,board,feed:w.feed.map(f=>({n:f.n,kind:f.kind,a:f.a,b:f.b,age:+(this.clock-f.at).toFixed(1)}))});}
  return ',"war":'+w.json;}
 save(){if(!this.file||!this.dirty)return;const out={_mission:this.mission};for(const [id,z] of this.zones)out[id]={seed:z.seed,gv:z.grid.version||1,mined:[...z.mined],regenIn:z.regenIn,resetIn:z.resetIn};const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(out),{mode:0o600});fs.renameSync(tmp,this.file);this.dirty=false;}
}
module.exports={ZoneBus};
