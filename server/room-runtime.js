// Executed in an isolated server VM. All mutation here is server-side.
// attachedToZone: on a server with shared zones (server/zone-sim.cjs) this ship's hull lives in its zone's shared
// world; this room keeps the interior and crew, sends thrust and shots to the zone, and takes back its position.
const attachedToZone=typeof zoneLink==='object'&&zoneLink!==null;
const crew=new Map();let currentCrew=null,roomOwner=null;
// Notices go to the crew member whose action caused them; world events (bot kills, shields critical,
// zone regeneration) go to everyone aboard. `actor` is set only while one member's input is being applied.
let actor=null;
// Snapshot numbers are rounded to millimetres: invisible on screen, roughly halves the payload.
function roundReplacer(k,v){return typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1000)/1000:v;}
const personalNames=['player','slots','stackCounts','selected','tool','piloting','climbing','ladderX','ladderCooldown','jumpTime','jumpWas','grounded','facing','keys','buildRotation','buildJob','activeFab','pusherPull','pusherHeld','pusherVisual','mouse','manning'];
function storeCrew(){if(!currentCrew)return;Object.assign(currentCrew,{player,slots,stackCounts,selected,tool,piloting,climbing,ladderX,ladderCooldown,jumpTime,jumpWas,grounded,facing,keys,buildRotation,buildJob,activeFab,pusherPull,pusherHeld,pusherVisual,mouse,manning});}
function bindCrew(id){storeCrew();currentCrew=crew.get(id);if(!currentCrew)return false;({player,slots,stackCounts,selected,tool,piloting,climbing,ladderX,ladderCooldown,jumpTime,jumpWas,grounded,facing,keys,buildRotation,buildJob,activeFab,pusherPull,pusherHeld,pusherVisual,mouse,manning=null}=currentCrew);W=H=0;zoom=1;cam={x:0,y:0};return true;}
function newCrew(id,name){if(crew.size>=8)throw Error('Ship crew is full');storeCrew();if(!crew.size){currentCrew=null;roomOwner??=id;}else {player=inside.createDynamicBody({position:V(helm.x,helm.y-.15),fixedRotation:true,bullet:true});/* same chamfered shape as the first crew member's body, so later crew don't catch on tile seams */player.createFixture(P.Polygon([V(-.15,-.62),V(.15,-.62),V(.23,-.54),V(.23,.54),V(.15,.62),V(-.15,.62),V(-.23,.54),V(-.23,-.54)]),{density:1,friction:0,restitution:0,filterCategoryBits:2|128,filterMaskBits:1|4|8|256|512});slots=['wrench',null,null,null,null];stackCounts=[1,0,0,0,0];}
 const member={id,name,player,slots,stackCounts,selected:0,tool:'walk',piloting:false,climbing:false,ladderX:0,ladderCooldown:0,jumpTime:0,jumpWas:false,grounded:false,facing:1,keys:{},buildRotation:0,buildJob:null,activeFab:null,pusherPull:false,pusherHeld:false,pusherVisual:null,mouse:{x:0,y:0,active:true},manning:null};crew.set(id,member);currentCrew=null;bindCrew(id);return member;
}
function removeCrew(id){if(!crew.has(id))return;bindCrew(id);for(let n=0;n<5;n++){if(slots[n]&&slots[n]!=='wrench')scatter(slots[n],stackCounts[n],localPlayer());slots[n]=null;stackCounts[n]=0;}if(crew.size>1)inside.destroyBody(player);else{player.setActive(true);player.setTransform(V(helm.x,helm.y-.15),0);}crew.delete(id);currentCrew=null;piloting=false;keys={};if(crew.size)bindCrew(crew.keys().next().value);save(true);}
let crashNextTick=false; // admin-only test hook: proves the server restores a ship after a simulation error
function serverCrewStep(dt){if(crashNextTick){crashNextTick=false;throw Error('Injected test crash');}storeCrew();for(const m of crew.values()){bindCrew(m.id);actor=m;if(Date.now()-m.inputAt>500){keys={};pusherHeld=false;}ladderCooldown=Math.max(0,ladderCooldown-dt);tickBuild(dt);if(pusherHeld&&tool==='pusher'&&!piloting)pushAt(localMouse(),dt);stepController(dt);storeCrew();}actor=null;}
function serverCrewAfterStep(){for(const m of crew.values()){bindCrew(m.id);if(!piloting){if(!finiteVec(player.getPosition())||!finiteVec(player.getLinearVelocity()))recover();else clampSpeed(player,SAFETY.maxCrewSpeed);const p=localPlayer();player.setTransform(V(clamp(p.x,bounds.l+.75,bounds.r-.75),clamp(p.y,bounds.t+1.13,bounds.b-1.13)),0);}storeCrew();}}
function notify(targets,message){const text=String(message).slice(0,240);for(const t of targets){t.notices??=[];if(t.notices.at(-1)!==text)t.notices.push(text);if(t.notices.length>8)t.notices.shift();}}
toast=function(message){notify(actor?[actor]:[...crew.values()],message);};toastAll=function(message){notify([...crew.values()],message);};
const originalInteract=interact;interact=function(){if(!piloting&&nearHelm()&&[...crew.values()].some(m=>m.id!==currentCrew.id&&m.piloting))return toast('The helm is already occupied.');return originalInteract();};
// Ranks (2019 drednot): the captain owns the ship and can do anything, including setting ranks; crew can build,
// pilot and use every machine; guests can walk around, chat, pick up and drop items, but cannot build, remove,
// rotate, pilot, man turrets, craft, configure machines or use portals.
// All ranks build and dismantle (v39). Guests still cannot fly, use machines or travel. Doors are set by the captain.
// Ranks: everyone can do everything aboard (build and dismantle, place doors and spawn points, fly, craft, use hatches
// and portals, paint) except: only the captain edits doors and spawn points, renames the ship, and moderates (MOTD,
// ranks, kicks, bans — server.cjs); guests can't place or edit signs. Crew can vote-kick guests (server.cjs).
const RANKS=['captain','crew','guest'],CAPTAIN_ONLY=['rename','door','spawnrank'],GUEST_BLOCKED=['sign'];
// Spawn kit: only the captain spawns with a wrench (crew and guests start empty-handed). The wrench goes with the
// captain when they leave instead of being dropped, so wrenches never pile up aboard.
function spawnKit(id){if(!bindCrew(id))return;const cap=currentCrew.rank==='captain';for(let i=0;i<5;i++)if(slots[i]==='wrench'&&!cap){slots[i]=null;stackCounts[i]=0;}
 if(cap&&!slots.includes('wrench')){const i=slots.indexOf(null);if(i>=0){slots[i]='wrench';stackCounts[i]=1;}}selectSlot(Math.max(0,slots.indexOf('wrench')));
 // ℵ14 spawn logic: a random spawn point set exactly to this player's rank, else the helm.
 const sp=spawnPointFor(currentCrew.rank||'guest');if(sp&&!piloting){climbing=false;player.setTransform(V(sp.x,sp.y-.13),0);player.setLinearVelocity(V(0,0));}storeCrew();}
// Comms: may this player talk to the zone right now (standing at a comms station, on foot)?
function commsCheck(id){if(!bindCrew(id))return false;const t=!piloting&&nearComms();if(t)t.sent=clock+3;storeCrew();return !!t;}
function mayBuildDoor(){return true;}
// Guests can't place signs.
function mayPlaceSign(){return (currentCrew?.rank||'guest')!=='guest';}
// A door or spawn point starts out set to the rank of whoever placed it; only the captain changes it afterwards.
function placerRank(){return currentCrew?.rank||'crew';}
function setCrewRank(id,rank){const c=crew.get(id);if(!c||!RANKS.includes(rank))return false;c.rank=rank;c.captain=rank==='captain';storeCrew();playerFilter(c.player,rank);return true;}
function allowed(m,a){const rank=m.rank||'guest';if(rank==='captain'||a==='dev')return true;if(CAPTAIN_ONLY.includes(a))return false;if(rank==='guest'&&GUEST_BLOCKED.includes(a))return false;return true;}
function command(id,msg){if(!bindCrew(id))return;const m=currentCrew;const a=msg.action;actor=m;try{
 if(!allowed(m,a)){if(a!=='input')toast(CAPTAIN_ONLY.includes(a)?'Only the captain can do that.':'Guests cannot do that here — ask the captain to make you crew.');storeCrew();return;}
 if(msg.aim&&Number.isFinite(msg.aim.x)&&Number.isFinite(msg.aim.y)&&Math.abs(msg.aim.x)<10000&&Math.abs(msg.aim.y)<10000)mouse={x:msg.aim.x,y:msg.aim.y,active:true};
 if(['edit','remove','rotate'].includes(a)&&!piloting&&!(a==='edit'&&tool==='booster')){const c=cursorCell(),t=terrainAt(c)||blocks.get(key(c.x,c.y));if(P.Vec2.distance(localPlayer(),V(c.x,c.y))>8||buildBlocked(c,t?.f)){toast('Target is out of reach or blocked.');storeCrew();return;}}
 if(a==='input'){keys={};for(const k of ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift'])keys[k]=!!msg.keys?.[k];pusherHeld=!!msg.held;m.inputAt=Date.now();}
 else if(a==='select'&&Number.isInteger(msg.slot)&&msg.slot>=0&&msg.slot<5)selectSlot(msg.slot);
 else if(a==='interact')interact();else if(a==='edit')edit();else if(a==='remove')removeAt(cursorCell());else if(a==='rotate')rotateSelection();else if(a==='helm')setTool('helm');else if(a==='drop')dropItem(!!msg.half);else if(a==='portal')usePortal();
 else if(a==='moveStack'&&[msg.from,msg.to].every(n=>Number.isInteger(n)&&n>=0&&n<5))moveStack(msg.from,msg.to,!!msg.half);
 else if(a==='craft'&&recipeNeeds(msg.item)&&Number.isInteger(msg.count)&&msg.count>=1&&msg.count<=8){activeFab=nearFab();if(activeFab)craft(msg.item,msg.count);}
 else if(a==='material'&&TYPES.includes(msg.item)){activeFab=nearFab();if(activeFab)transferMaterial(msg.item,!!msg.eject);}
 else if(a==='clearQueue'){activeFab=nearFab();if(activeFab)clearQueue();}
 else if(a==='repeat'){activeFab=nearFab();if(activeFab)activeFab.repeat=!!msg.value;}
 else if(a==='door'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell);if(t?.type==='door'&&setDoorAccess(t,msg.access))toast('Door: '+({captain:'captain only',crew:'crew and captain',guest:'everyone'})[msg.access]+'.');}
 else if(a==='spawnrank'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell);if(t?.type==='spawn'&&P.Vec2.distance(localPlayer(),V(t.x,t.y))<8&&setSpawnRank(t,msg.rank))toast('Spawn point: '+({captain:'captain',crew:'crew',guest:'guests'})[msg.rank]+' spawn here.');}
 else if(a==='sign'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell);if(t?.type==='sign'&&P.Vec2.distance(localPlayer(),V(t.x,t.y))<8){t.text=cleanSign(msg.text);}}
 else if(a==='paint'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell),c=cleanColor(msg.color);if(t?.type==='paint'&&c&&P.Vec2.distance(localPlayer(),V(t.x,t.y))<8){t.color=c;}}
 else if(a==='pusher'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)&&msg.settings&&typeof msg.settings==='object')configurePusher(msg.cell,msg.settings);
 else if(a==='hatch'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y))configureHatch(msg.cell,msg.mode,msg.items,{pull:!!msg.pull,requireOutput:!!msg.requireOutput});
 else if(a==='recover'){recover();}
 else if(a==='rename'){if(!m.captain)toast('Only the captain can rename the ship.');else renameShip(msg.name);}
 else if(a==='dev'&&m.admin){if(attachedToZone&&['killgreen','killred','killbots','spawnbot','ai'].includes(msg.op))zoneLink.dev(msg.op,msg.species);else if(msg.op==='give'&&TYPES.includes(msg.item))giveItem(msg.item,clamp(Math.floor(msg.count)||1,1,512));else if(Object.hasOwn(ZONES,msg.op)){snapshotZone();zone=msg.op;setupZone(true);}else if(msg.op==='damage')damageShip(shipMaxHP()*.25);else if(msg.op==='heal')shipHP=shipMaxHP();else if(msg.op==='killgreen'||msg.op==='killred'||msg.op==='killbots'){const sp=msg.op==='killbots'?msg.species:msg.op.slice(4);if(Object.hasOwn(BOT_TYPES,sp))for(const b of botsOf(sp))damageBot(1e9,sp,b.index);}else if(msg.op==='crash')crashNextTick=true;else if(msg.op==='spawnbot'&&Object.hasOwn(BOT_TYPES,msg.species)){const list=zoneData[zone]?.bots?.[msg.species],i=list?list.findIndex(r=>r?.dead):-1;if(i>=0&&spawnBot(msg.species,null,i))list[i]={dead:false};}else if(msg.op==='ai')botsPaused=!botsPaused;else if(msg.op==='regen')regenerateZone();else if(msg.op==='mission')startMission(msg.zone);else if(msg.op==='endmission'||msg.op==='treasure')zoneEvent({type:msg.op});}
 }finally{actor=null;}storeCrew();}
// ---- Shared zones (driven by server/zone-bus.cjs) ------------------------------------------------------
// Other ships in this zone exist here as kinematic "ghost" hulls: this ship collides with them and its RC
// shots stop on them. Their real simulation runs in their own room.
let ghosts=new Map();
let zonePlaced=true;const originalSetupZone=setupZone;setupZone=function(...args){ghosts=new Map();if(attachedToZone&&zoneData[zone])zoneData[zone].loot=[];zonePlaced=true;const r=originalSetupZone(...args);if(attachedToZone){bots=[];enemyShots=[];}return r;};
function exterior(){const p=ship.getPosition(),v=ship.getLinearVelocity(),placed=zonePlaced;zonePlaced=false;return {zone,x:p.x,y:p.y,vx:v.x,vy:v.y,ext:shipExtents(),size:shipSize(),hp:shipHP,maxHp:shipMaxHP(),docked:!!docked,mass:ship.getMass(),damping:ship.getLinearDamping(),placed};}
function exteriorLayout(){return {bounds:{...bounds},helm:{x:helm.x,y:helm.y},brokenHull:[...brokenHull],blocks:[...blocks.values()].map(b=>[b.x,b.y,b.rotation||0]),terrain:[...terrain.values()].filter(t=>!t.body).map(t=>t.type==='sign'?[t.type,t.x,t.y,0,{text:t.text||''}]:t.type==='paint'?[t.type,t.x,t.y,0,{color:t.color}]:[t.type,t.x,t.y,t.rotation||0]),mounts:mounts.map(({type,side,at,rotation=0,starterRC=false,ammo=0,kind})=>({type,side,at,rotation,starterRC,ammo,...(kind?{kind}:{})}))};}
// What other ships need to draw this one as it is right now (sent to nearby ships with every other snapshot, 10 a second): turret aim and
// recoil, thruster flames and direction, ammo counts, machine states (doors, fabricators, loaders, pushers, recyclers,
// comms), loose items and expando boxes. Clock-based timers go out as time remaining (each client has its own clock).
const LIVE_TERRAIN=['door','fabricator','loader','pusher_block','recycler','comms','spawn','ejector','shredder'];
// Physics machines (fabricators, recyclers, comms) move, so they go to other ships with every snapshot, not in the layout.
function exteriorMachines(){const left=v=>v>clock?+(v-clock).toFixed(2):0,r2=v=>Math.round(v*100)/100;return [...terrain.values()].filter(t=>t.body).map(t=>{const o={};if(t.type==='fabricator'){o.kind=t.kind;o.materials=t.materials;if(t.job)o.job={type:t.job.type,progress:r2(t.job.progress||0)};}if(t.type==='recycler'){o.busy=left(t.busy||0);if(o.busy)o.lastOut=t.lastOut;}if(t.type==='comms')o.sent=left(t.sent||0);return [t.type,r2(t.x),r2(t.y),o];});}
function exteriorLive(){const left=v=>v>clock?+(v-clock).toFixed(2):0,r2=v=>Math.round(v*100)/100;
 return {m:mounts.map(m=>[m.aim==null?null:r2(m.aim),left(m.recoilUntil||0),m.active?1:0,m.ammo||0,m.thrustDirection?[r2(m.thrustDirection.x),r2(m.thrustDirection.y)]:0]),
  t:[...terrain.values()].filter(t=>!t.body&&LIVE_TERRAIN.includes(t.type)).map(t=>{const o={};if(t.access)o.access=t.access;if(t.type==='fabricator'){o.kind=t.kind;o.materials=t.materials;if(t.job)o.job={type:t.job.type,progress:r2(t.job.progress||0)};}if(t.type==='loader'){o.phase=r2(t.phase??1);if(t.cargo?.length)o.cargo=[{type:t.cargo[0].type}];}if(t.type==='pusher_block'){o.beam=r2(t.beam||0);if(t.pull)o.pull=true;o.beamMode=t.beamMode||(t.pull?'pull':'push');}if(t.type==='recycler'){o.busy=left(t.busy||0);if(o.busy)o.lastOut=t.lastOut;}if(t.type==='comms')o.sent=left(t.sent||0);if(t.flash)o.flash=left(t.flash);if(t.chewing)o.chewing=left(t.chewing);return [t.x,t.y,o];}),
  i:items.map(i=>{const p=i.body.getPosition();return [i.type,i.count,r2(p.x),r2(p.y),r2(i.body.getAngle())];}),
  b:boxes.map(b=>{const p=b.body.getPosition();return [r2(p.x),r2(p.y),r2(b.body.getAngle()),b.size,b.materials];})};}
// Move this ship to free space if another ship in the zone overlaps it (Freeports: the next free berth).
function clearSpawnSpot(){const p0=ship.getPosition().clone();if(!shipClashes(p0))return false;let p=null;if(zoneDef().kind==='safe')p=safeArrival();else for(let k=1;k<40&&!p;k++){const a=k*2.4,d=10+k*3,q=V(p0.x+Math.cos(a)*d,p0.y+Math.sin(a)*d),e=shipExtents();if(!shipClashes(q)&&!(typeof zoneSolid==='function'&&[[e.l,e.t],[e.r,e.t],[e.l,e.b],[e.r,e.b],[0,0]].some(([dx,dy])=>zoneSolid(q.x+dx,q.y+dy))))p=q;}if(!p||shipClashes(p))return false;docked=null;ship.setType('dynamic');ship.setFixedRotation(true);ship.setTransform(p,0);ship.setLinearVelocity(V(0,0));zonePlaced=true;return true;}
function exteriorCrew(){storeCrew();return [...crew.values()].map(c=>({n:c.name,x:+c.player.getPosition().x.toFixed(2),y:+c.player.getPosition().y.toFixed(2),f:c.facing,p:c.piloting,c:c.climbing,t:c.tool,h:c.slots[c.selected],r:c.rank||'guest',vx:+c.player.getLinearVelocity().x.toFixed(1)}));}
function syncGhosts(list,selfId){const seen=new Set();const me=ship.getPosition(),mine=shipExtents();for(const g of list){const e0=g.ext,ox=Math.min(me.x+mine.r,g.x+e0.r)-Math.max(me.x+mine.l,g.x+e0.l),oy=Math.min(me.y+mine.b,g.y+e0.b)-Math.max(me.y+mine.t,g.y+e0.t);if(ox>.5&&oy>.5&&!docked){const away=V(me.x-g.x,me.y-g.y);if(away.length()<.5)away.set(String(selfId)<String(g.id)?-1:1,0);away.normalize();const v=ship.getLinearVelocity();ship.setLinearVelocity(V(v.x+away.x*Math.min(ox,6)*.4,v.y+away.y*Math.min(oy,6)*.4));}seen.add(g.id);const e=g.ext,k=[e.l,e.r,e.t,e.b].join();let h=ghosts.get(g.id);if(h&&h.k!==k){world.destroyBody(h.body);h=null;}
 if(!h){const body=world.createBody({type:'kinematic',position:V(g.x,g.y),userData:{ghost:g.id}});body.createFixture(P.Box((e.r-e.l)/2,(e.b-e.t)/2,V((e.l+e.r)/2,(e.t+e.b)/2)),{friction:.3,restitution:.1});h={body,k};ghosts.set(g.id,h);}
 h.body.setTransform(V(g.x,g.y),0);h.body.setLinearVelocity(V(g.vx,g.vy));}
 for(const [id,h] of ghosts)if(!seen.has(id)){world.destroyBody(h.body);ghosts.delete(id);}}
function remoteMined(id){if(!removeRock(id))return false;zoneData[zone].mined.push(id);return true;}
let lastHitNotice=-99;
function pvpHit(amount,localPoint,dir,ammo,shooter){if(!isCombatZone()||!(amount>0))return;if(docked)releaseDock();const imp=AMMO[ammo]?.impulse||0;if(imp)ship.applyLinearImpulse(V(dir.x*ship.getMass()*5*imp,dir.y*ship.getMass()*5*imp),ship.getWorldCenter(),true);damageShip(amount,V(localPoint.x,localPoint.y),dir&&Number.isFinite(dir.x)&&Number.isFinite(dir.y)?V(dir.x,dir.y):null);if(clock-lastHitNotice>4){lastHitNotice=clock;toastAll('Under fire from '+shooter+'!');}}
function serverRegenerate(seed){zonePlaced=true;snapshotZone();const old=zoneData[zone];zoneData[zone]={seed,mined:[],loot:old.loot||[]};originalSetupZone(true);ghosts=new Map();updateShipMass();save(true);toastAll(zoneDef().name+' regenerated with a new layout. Your ship is at the entry portal.');}
function missionNotice(text){toastAll(text);}
function setRegenTimer(t,reset){const st=zoneData[zone];if(!st)return;st.regenIn=t??undefined;st.resetIn=reset??undefined;}
const DELTA_MIN=40;
function snapshot(id){storeCrew();const m=crew.get(id);if(!m)return null;bindCrew(id);const data=state();data.inventory={};data.clock=clock;data.crew=[...crew.values()].map(c=>({id:c.id,name:c.name,rank:c.rank||'guest',p:c.player.getPosition(),v:c.player.getLinearVelocity(),facing:c.facing,piloting:c.piloting,tool:c.tool,climbing:c.climbing,selected:c.selected,held:c.slots[c.selected]}));data.self={id,selected,tool,piloting,facing,climbing,rotation:buildRotation,pusherPull,buildJob,manning,rank:m.rank||'guest'};data.velocity=ship.getLinearVelocity();data.mission=currentMission();data.criticalFor=+criticalFor.toFixed(2);data.effects=effects;data.zoneData={[zone]:data.zoneData[zone]};if(attachedToZone){const z=zoneLink.snapshot();data.bots=z?.bots||[];data.rockHp=z?.rockHp||[];data.projectiles=z?.projectiles||[];data.zoneLoot=z?.loot||[];data.zoneBoulders=z?.boulders||[];}else{data.bots=allBots().map(b=>({color:b.species,index:b.index,hp:b.hp,p:b.body.getPosition(),v:b.body.getLinearVelocity()}));data.projectiles=[...shots.map(s=>({...s,owner:undefined})),...enemyShots.map(s=>({...s,owner:undefined}))];}data.items=items.map(i=>{const p=i.body.getPosition(),v=i.body.getLinearVelocity(),o={type:i.type,count:i.count,x:p.x,y:p.y,angle:i.body.getAngle()};if(Math.abs(v.x)>.005||Math.abs(v.y)>.005)o.v=v;return o;});data.mounts=mounts.map(({f,...m})=>m);data.notices=(m.notices||[]).splice(0);const zd=data.zoneData[zone]={...data.zoneData[zone]},minedList=zd.mined||[],sent=m.minedSent;if(sent&&sent.zone===zone&&sent.seed===(zd.seed||0)&&sent.count<=minedList.length){data.minedAdd=minedList.slice(sent.count);delete zd.mined;}else data.minedReset=true;m.minedSent={zone,seed:zd.seed||0,count:minedList.length};zd.loot=(data.zoneLoot||zd.loot||[]).map(({type,count,x,y,vx,vy})=>({type,count,x,y,vx,vy}));if(data.zoneBoulders)zd.boulders=data.zoneBoulders;delete data.zoneLoot;delete data.zoneBoulders;
 // The ship's tiles go to each crew member only when they change (built, removed, damaged, repaired): an 80×80
 // battleship has thousands of them, which would otherwise be resent 20 times a second. null = "same as before".
 {const bs=JSON.stringify(data.blocks);if(m.blocksSent===bs)data.blocks=null;else m.blocksSent=bs;}
 // Big ships: machine and turret records go out only when they change ([index, record] pairs), as long as the
 // set of machines is the same as last time; otherwise the whole list is sent again.
 for(const [field,keyOf] of [['terrain',t=>t.type+':'+t.x+','+t.y+':'+(t.rotation||0)],['mounts',t=>t.type+':'+t.side+':'+t.at]]){const list=data[field];if(list.length<DELTA_MIN){m[field+'Sent']=null;continue;}const keys=list.map(keyOf).join('|'),json=list.map(t=>JSON.stringify(t,roundReplacer)),sent=m[field+'Sent'];if(sent&&sent.keys===keys){const d=[];json.forEach((j,i)=>{if(sent.json[i]!==j)d.push([i,list[i]]);});data[field]=null;data[field+'Delta']=d;}m[field+'Sent']={keys,json};}
 return JSON.parse(JSON.stringify(data,roundReplacer));}
function durableState(){storeCrew();const s=JSON.parse(JSON.stringify(state()));s.stacks=[null,null,null,null,null];s.inventory={};s.slots=[null,null,null,null,null];for(const m of crew.values())for(let i=0;i<5;i++)if(m.slots[i]&&m.slots[i]!=='wrench')s.items.push({type:m.slots[i],count:m.stackCounts[i],...m.player.getPosition()});return s;}

// ---- Shared zone link ----------------------------------------------------------------------------------------
let shipForces=[],shipImpulses=[];
function hookShipBody(){if(!attachedToZone||ship.__zoneHooked)return;ship.__zoneHooked=true;
 // Thrust and knockback are recorded (in ship coordinates) and applied to this ship's hull in the zone world.
 ship.applyForce=function(f,p){const lp=ship.getLocalPoint(p);shipForces.push({fx:f.x,fy:f.y,px:lp.x,py:lp.y});};
 ship.applyLinearImpulse=function(f,p){const lp=ship.getLocalPoint(p);shipImpulses.push({fx:f.x,fy:f.y,px:lp.x,py:lp.y});};
 ship.applyForceToCenter=function(f){shipForces.push({fx:f.x,fy:f.y,px:0,py:0});};}
function takeForces(){hookShipBody();const out={forces:shipForces,impulses:shipImpulses};shipForces=[];shipImpulses=[];return out;}
function setPose(x,y,vx,vy){if(docked)return;ship.setTransform(V(x,y),0);ship.setLinearVelocity(V(vx,vy));}
function zoneDamage(amount,lp,dir,ammo){const r=damageShip(amount,V(lp.x,lp.y),dir?V(dir.x,dir.y):null);return r?.exit?{x:r.exit.x,y:r.exit.y}:null;}
function addZoneScore(n){addScore(n);}
if(attachedToZone){hookShipBody();
 // Shots leave for the zone the tick they are fired; bots, bot bullets and loose loot exist only in the zone.
 tickShots=function(){if(!shots.length)return;zoneLink.fire(shots.map(s=>({type:s.type,p:{x:s.p.x,y:s.p.y},v:{x:s.v.x,y:s.v.y},life:s.life,maxLife:s.maxLife,bounces:s.bounces||0,damage:s.damage,frag:s.frag})));shots=[];};
 setupDungeonActors=function(){bots=[];enemyShots=[];};bots=[];enemyShots=[];
 addWorldLoot=function(type,p,count,velocity=V(0,0)){zoneLink.addLoot(type,p.x,p.y,count,velocity.x,velocity.y);return {type,count,grace:0,body:{setAngularVelocity(){},setAngle(){},getPosition:()=>V(p.x,p.y)}};};
 claimWorldLoot=function(hp,allow){return zoneLink.claim(hp.x,hp.y,allow);};
 worldLoot=[];}
