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
function newCrew(id,name){if(crew.size>=8)throw Error('Ship crew is full');storeCrew();if(!crew.size){currentCrew=null;roomOwner??=id;}else {player=inside.createDynamicBody({position:V(helm.x,helm.y-.15),fixedRotation:true,bullet:true});/* same chamfered shape as the first crew member's body, so later crew don't catch on tile seams */player.createFixture(P.Polygon([V(-.15,-.62),V(.15,-.62),V(.23,-.54),V(.23,.54),V(.15,.62),V(-.15,.62),V(-.23,.54),V(-.23,-.54)]),{density:1,friction:0,restitution:0,filterCategoryBits:2|128,filterMaskBits:1|4|8|256});slots=['wrench',null,null,null,null];stackCounts=[1,0,0,0,0];}
 const member={id,name,player,slots,stackCounts,selected:0,tool:'walk',piloting:false,climbing:false,ladderX:0,ladderCooldown:0,jumpTime:0,jumpWas:false,grounded:false,facing:1,keys:{},buildRotation:0,buildJob:null,activeFab:null,pusherPull:false,pusherHeld:false,pusherVisual:null,mouse:{x:0,y:0,active:true},manning:null};crew.set(id,member);currentCrew=null;bindCrew(id);return member;
}
function removeCrew(id){if(!crew.has(id))return;bindCrew(id);for(let n=0;n<5;n++){if(slots[n]&&slots[n]!=='wrench')scatter(slots[n],stackCounts[n],localPlayer());slots[n]=null;stackCounts[n]=0;}if(crew.size>1)inside.destroyBody(player);else{player.setActive(true);player.setTransform(V(helm.x,helm.y-.15),0);}crew.delete(id);currentCrew=null;piloting=false;keys={};if(crew.size)bindCrew(crew.keys().next().value);save(true);}
// Dev toggles (dev menu, host token only): per player noclip flight and sandbox building; per ship noclip.
let shipNoclip=false;
function devToggles(m){if(!piloting&&m.noclip){if(!m.noclipMask){m.noclipMask=[];for(let f=player.getFixtureList();f;f=f.getNext()){m.noclipMask.push(f.getFilterMaskBits());f.setFilterData({groupIndex:f.getFilterGroupIndex(),categoryBits:f.getFilterCategoryBits(),maskBits:0});}}
  player.setGravityScale(0);climbing=false;const fast=keys.shift?2:1,s=12*fast;player.setLinearVelocity(V(((keys.d||keys.arrowright)?1:0)-((keys.a||keys.arrowleft)?1:0),((keys.s||keys.arrowdown)?1:0)-((keys.w||keys.arrowup||keys[' '])?1:0)).mul(s));player.setAwake(true);}
 else if(m.noclipMask){let k=0;for(let f=player.getFixtureList();f;f=f.getNext())f.setFilterData({groupIndex:f.getFilterGroupIndex(),categoryBits:f.getFilterCategoryBits(),maskBits:m.noclipMask[k++]??0xffff});m.noclipMask=null;if(!piloting)player.setGravityScale(1);}}
// The fabricator a crafting/loading action is for: the one named (its window is open) when it's in reach, else the nearest.
function fabFor(msg){if(typeof msg.fab==='string'){for(const t of terrain.values())if(t.id===msg.fab&&fabReach(t))return t;}return nearFab();}
let crashNextTick=false; // admin-only test hook: proves the server restores a ship after a simulation error
function serverCrewStep(dt){if(crashNextTick){crashNextTick=false;throw Error('Injected test crash');}storeCrew();for(const m of crew.values()){bindCrew(m.id);actor=m;if(Date.now()-m.inputAt>500){keys={};pusherHeld=false;}ladderCooldown=Math.max(0,ladderCooldown-dt);if(m.sandbox&&buildJob)buildJob.elapsed=buildJob.duration;tickBuild(dt);if(pusherHeld&&tool==='pusher'&&!piloting)pushAt(localMouse(),dt);stepController(dt);devToggles(m);storeCrew();}actor=null;}
function serverCrewAfterStep(){for(const m of crew.values()){bindCrew(m.id);if(!piloting){if(!finiteVec(player.getPosition())||!finiteVec(player.getLinearVelocity()))recover();else clampSpeed(player,SAFETY.maxCrewSpeed);const p=localPlayer();/* noclip flight may leave the hull; moved only when actually outside (setTransform wakes the body, and a crew member woken every tick kept every pile it touched from ever sleeping) */if(!m.noclip){const x=clamp(p.x,bounds.l+.75,bounds.r-.75),y=clamp(p.y,bounds.t+1.13,bounds.b-1.13);if(x!==p.x||y!==p.y)player.setTransform(V(x,y),0);}}storeCrew();}}
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
 /* the click in ship coordinates as the player saw it wins: on a moving ship it hits the tile they clicked */if(msg.local&&Number.isFinite(msg.local.x)&&Number.isFinite(msg.local.y)&&Math.abs(msg.local.x)<10000&&Math.abs(msg.local.y)<10000){const w=ship.getWorldPoint(V(msg.local.x,msg.local.y));mouse={x:w.x,y:w.y,active:true};}
 if(['edit','remove','rotate'].includes(a)&&!piloting&&!(a==='edit'&&tool==='booster')){const c=cursorCell(),t=terrainAt(c)||blocks.get(key(c.x,c.y));if(P.Vec2.distance(localPlayer(),V(c.x,c.y))>8||buildBlocked(c,t?.f)){toast('Target is out of reach or blocked.');storeCrew();return;}}
 if(a==='input'){keys={};for(const k of ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift'])keys[k]=!!msg.keys?.[k];pusherHeld=!!msg.held;m.inputAt=Date.now();}
 else if(a==='select'&&Number.isInteger(msg.slot)&&msg.slot>=0&&msg.slot<5)selectSlot(msg.slot);
 else if(a==='interact')interact();else if(a==='leave'){if(piloting)recover();else if(manning)toggleController();}else if(a==='edit')edit();else if(a==='remove')secondaryAt(cursorCell());else if(a==='rotate')rotateSelection();else if(a==='helm')setTool('helm');else if(a==='drop')dropItem(!!msg.half);else if(a==='portal')usePortal();
 else if(a==='moveStack'&&[msg.from,msg.to].every(n=>Number.isInteger(n)&&n>=0&&n<5))moveStack(msg.from,msg.to,!!msg.half);
 else if(a==='craft'&&recipeNeeds(msg.item)&&Number.isInteger(msg.count)&&msg.count>=1&&msg.count<=8){activeFab=fabFor(msg);if(activeFab)craft(msg.item,msg.count);}
 else if(a==='material'&&TYPES.includes(msg.item)){activeFab=fabFor(msg);if(activeFab)transferMaterial(msg.item,!!msg.eject);}
 else if(a==='clearQueue'){activeFab=fabFor(msg);if(activeFab)clearQueue();}
 else if(a==='repeat'){activeFab=fabFor(msg);if(activeFab)activeFab.repeat=!!msg.value;}
 else if(a==='door'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell);if(t?.type==='door'&&tileInReach(t)&&setDoorAccess(t,msg.access))toast('Door: '+({captain:'captain only',crew:'crew and captain',guest:'everyone'})[msg.access]+'.');}
 else if(a==='spawnrank'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell);if(t?.type==='spawn'&&tileInReach(t)&&setSpawnRank(t,msg.rank))toast('Spawn point: '+({captain:'captain',crew:'crew',guest:'guests'})[msg.rank]+' spawn here.');}
 else if(a==='sign'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell);if(t?.type==='sign'&&tileInReach(t)){t.text=cleanSign(msg.text);}}
 else if(a==='paint'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)){const t=terrainAt(msg.cell),c=cleanColor(msg.color);if(t?.type==='paint'&&c&&tileInReach(t)){t.color=c;}}
 else if(a==='pusher'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y)&&msg.settings&&typeof msg.settings==='object')configurePusher(msg.cell,msg.settings);
 else if(a==='hatch'&&msg.cell&&Number.isInteger(msg.cell.x)&&Number.isInteger(msg.cell.y))configureHatch(msg.cell,msg.mode,msg.items,{pull:!!msg.pull,requireOutput:!!msg.requireOutput});
 else if(a==='recover'){recover();}
 else if(a==='rename'){if(!m.captain)toast('Only the captain can rename the ship.');else renameShip(msg.name);}
 else if(a==='dev'&&m.admin){if(attachedToZone&&['killgreen','killred','killbots','spawnbot','ai'].includes(msg.op))zoneLink.dev(msg.op,msg.species);else if(msg.op==='noclip'){m.noclip=!m.noclip;toast('Noclip '+(m.noclip?'on: WASD/Space fly through anything, Shift for speed.':'off.'));}else if(msg.op==='sandbox'){m.sandbox=!m.sandbox;toast('Sandbox build mode '+(m.sandbox?'on: building is instant and uses no items.':'off.'));}else if(msg.op==='shipnoclip'){shipNoclip=!shipNoclip;toast('Ship noclip '+(shipNoclip?'on: the ship passes through rocks, bots and other ships.':'off.'));}else if(msg.op==='give'&&TYPES.includes(msg.item))giveItem(msg.item,clamp(Math.floor(msg.count)||1,1,512));else if(Object.hasOwn(ZONES,msg.op)){snapshotZone();zone=msg.op;setupZone(true);}else if(msg.op==='damage')damageShip(shipMaxHP()*.25);else if(msg.op==='heal')shipHP=shipMaxHP();else if(msg.op==='killgreen'||msg.op==='killred'||msg.op==='killbots'){const sp=msg.op==='killbots'?msg.species:msg.op.slice(4);if(Object.hasOwn(BOT_TYPES,sp))for(const b of botsOf(sp))damageBot(1e9,sp,b.index);}else if(msg.op==='crash')crashNextTick=true;else if(msg.op==='spawnbot'&&Object.hasOwn(BOT_TYPES,msg.species)){const list=zoneData[zone]?.bots?.[msg.species],i=list?list.findIndex(r=>r?.dead):-1;if(i>=0&&spawnBot(msg.species,null,i))list[i]={dead:false};}else if(msg.op==='ai')botsPaused=!botsPaused;else if(msg.op==='regen')regenerateZone();else if(msg.op==='mission')startMission(msg.zone);else if(msg.op==='endmission'||msg.op==='treasure')zoneEvent({type:msg.op});}
 }finally{actor=null;}storeCrew();}
// ---- Shared zones (driven by server/zone-bus.cjs) ------------------------------------------------------
// Other ships in this zone exist here as kinematic "ghost" hulls: this ship collides with them and its RC
// shots stop on them. Their real simulation runs in their own room.
let ghosts=new Map();
let zonePlaced=true;const originalSetupZone=setupZone;setupZone=function(...args){ghosts=new Map();if(attachedToZone&&zoneData[zone])zoneData[zone].loot=[];zonePlaced=true;const r=originalSetupZone(...args);if(attachedToZone){bots=[];enemyShots=[];}return r;};
function exterior(){const p=ship.getPosition(),v=ship.getLinearVelocity(),placed=zonePlaced;zonePlaced=false;return {zone,x:p.x,y:p.y,vx:v.x,vy:v.y,ext:shipExtents(),size:shipSize(),hp:shipHP,maxHp:shipMaxHP(),booster:boosterLeft>0?[+boosterLeft.toFixed(1),boosterTotal]:0,docked:!!docked,mass:ship.getMass(),damping:ship.getLinearDamping(),placed,noclip:shipNoclip};}
function exteriorLayout(){return {bounds:{...bounds},helm:{x:helm.x,y:helm.y},brokenHull:[...brokenHull],blocks:[...blocks.values()].map(b=>[b.x,b.y,b.rotation||0]),terrain:[...terrain.values()].filter(t=>!t.body).map(t=>t.type==='sign'?[t.type,t.x,t.y,0,{text:t.text||''}]:t.type==='paint'?[t.type,t.x,t.y,0,{color:t.color}]:[t.type,t.x,t.y,t.rotation||0]),mounts:mounts.map(({type,side,at,rotation=0,starterRC=false,ammo=0,kind})=>({type,side,at,rotation,starterRC,ammo,...(kind?{kind}:{})}))};}
// What other ships need to draw this one as it is right now (sent to nearby ships with every other snapshot, 10 a second): turret aim and
// recoil, thruster flames and direction, ammo counts, machine states (doors, fabricators, loaders, pushers, recyclers,
// comms), loose items and expando boxes. Clock-based timers go out as time remaining (each client has its own clock).
const LIVE_TERRAIN=['door','fabricator','loader','pusher_block','recycler','comms','spawn','ejector','shredder','hatch','starter_hatch'];
// Physics machines (fabricators, recyclers, comms) move, so they go to other ships with every snapshot, not in the layout.
function exteriorMachines(){const left=v=>v>clock?+(v-clock).toFixed(2):0,r2=v=>Math.round(v*100)/100;return [...terrain.values()].filter(t=>t.body).map(t=>{const o={};if(t.type==='fabricator'){o.kind=t.kind;o.materials=t.materials;if(t.job)o.job={type:t.job.type,progress:r2(t.job.progress||0)};}if(t.type==='recycler'){o.busy=left(t.busy||0);if(o.busy)o.lastOut=t.lastOut;}if(t.type==='comms')o.sent=left(t.sent||0);if((t.hp??100)<100)o.hp=Math.round(t.hp);return [t.type,r2(t.x),r2(t.y),o];});}
// Other ships' view of this one, every snapshot (20 a second). Loose items: a full list on `full` passes (once a second),
// otherwise only the ones that moved, changed or appeared, plus the ids that went away — resting piles cost nothing.
let liveSeq=0,livePrev=new Set();
function exteriorLive(full=true){const left=v=>v>clock?+(v-clock).toFixed(2):0,r2=v=>Math.round(v*100)/100,now=new Set(),il=[];
 for(const i of items){const id=i.nid||(i.nid=++liveSeq);now.add(id);const b=i.body;if(!full&&livePrev.has(id)&&!b.isAwake()&&i.liveCount===i.count)continue;i.liveCount=i.count;const p=b.getPosition(),v=b.getLinearVelocity();il.push([id,i.type,i.count,r2(p.x),r2(p.y),r2(b.getAngle()),r2(v.x),r2(v.y)]);}
 const gone=full?[]:[...livePrev].filter(id=>!now.has(id));livePrev=now;
 return {m:mounts.map(m=>[m.aim==null?null:r2(m.aim),left(m.recoilUntil||0),m.active?1:0,m.ammo||0,m.thrustDirection?[r2(m.thrustDirection.x),r2(m.thrustDirection.y)]:0,m.ammoType&&m.ammoType!=='ammo'?m.ammoType:0]),
  t:[...terrain.values()].filter(t=>!t.body&&LIVE_TERRAIN.includes(t.type)).map(t=>{const o={};if(t.access)o.access=t.access;if(t.filterMode&&t.filterMode!=='all')o.filterMode=t.filterMode;if(t.type==='fabricator'){o.kind=t.kind;o.materials=t.materials;if(t.job)o.job={type:t.job.type,progress:r2(t.job.progress||0)};}if(t.type==='loader'){o.phase=r2(t.phase??1);if(t.cargo?.length)o.cargo=[{type:t.cargo[0].type}];}if(t.type==='pusher_block'){o.beam=r2(t.beam||0);if(t.pull)o.pull=true;o.beamMode=t.beamMode||(t.pull?'pull':'push');}if(t.type==='recycler'){o.busy=left(t.busy||0);if(o.busy)o.lastOut=t.lastOut;}if(t.type==='comms')o.sent=left(t.sent||0);if(t.flash)o.flash=left(t.flash);if(t.chewing)o.chewing=left(t.chewing);return [t.x,t.y,o];}),
  // Battle damage others can see: [x, y, health %] for each hurt block or placed piece, and each turret/thruster's health.
  d:(()=>{const d=[];for(const t of blocks.values())if((t.hp??100)<100)d.push([t.x,t.y,Math.round(t.hp)]);for(const t of terrain.values())if(!t.body&&(t.hp??100)<100)d.push([t.x,t.y,Math.round(t.hp)]);return d;})(),
  md:mounts.some(m=>(m.hp??100)<100)?mounts.map(m=>Math.round(m.hp??100)):0,
  i:il,gone,full:full?1:0,
  b:boxes.map(b=>{const p=b.body.getPosition(),v=b.body.getLinearVelocity();return [r2(p.x),r2(p.y),r2(b.body.getAngle()),b.size,b.materials,r2(v.x),r2(v.y)];})};}
// Move this ship to free space if another ship in the zone overlaps it (Freeports: the next free berth).
function clearSpawnSpot(){const p0=ship.getPosition().clone();if(!shipClashes(p0))return false;let p=null;if(zoneDef().kind==='safe')p=safeArrival();else for(let k=1;k<40&&!p;k++){const a=k*2.4,d=10+k*3,q=V(p0.x+Math.cos(a)*d,p0.y+Math.sin(a)*d),e=shipExtents();if(!shipClashes(q)&&!(typeof zoneSolid==='function'&&[[e.l,e.t],[e.r,e.t],[e.l,e.b],[e.r,e.b],[0,0]].some(([dx,dy])=>zoneSolid(q.x+dx,q.y+dy))))p=q;}if(!p||shipClashes(p))return false;docked=null;ship.setType('dynamic');ship.setFixedRotation(true);ship.setTransform(p,0);ship.setLinearVelocity(V(0,0));zonePlaced=true;return true;}
// A crew member's handheld pusher beam while it's firing (ship-local from/to, and whether it pulls).
function handBeam(v){if(!v||v.until<clock)return null;const r2=n=>Math.round(n*100)/100;return [r2(v.from.x),r2(v.from.y),r2(v.to.x),r2(v.to.y),v.pull?1:0];}
function exteriorCrew(){storeCrew();return [...crew.values()].map(c=>({b:handBeam(c.pusherVisual),n:c.name,x:+c.player.getPosition().x.toFixed(2),y:+c.player.getPosition().y.toFixed(2),f:c.facing,p:c.piloting,c:c.climbing,t:c.tool,h:c.slots[c.selected],r:c.rank||'guest',vx:+c.player.getLinearVelocity().x.toFixed(1),vy:+c.player.getLinearVelocity().y.toFixed(1)}));}
function syncGhosts(list,selfId){const seen=new Set();const me=ship.getPosition(),mine=shipExtents();for(const g of list){const e0=g.ext,ox=Math.min(me.x+mine.r,g.x+e0.r)-Math.max(me.x+mine.l,g.x+e0.l),oy=Math.min(me.y+mine.b,g.y+e0.b)-Math.max(me.y+mine.t,g.y+e0.t);if(ox>.5&&oy>.5&&!docked){const away=V(me.x-g.x,me.y-g.y);if(away.length()<.5)away.set(String(selfId)<String(g.id)?-1:1,0);away.normalize();const v=ship.getLinearVelocity();ship.setLinearVelocity(V(v.x+away.x*Math.min(ox,6)*.4,v.y+away.y*Math.min(oy,6)*.4));}seen.add(g.id);const e=g.ext,k=[e.l,e.r,e.t,e.b].join();let h=ghosts.get(g.id);if(h&&h.k!==k){world.destroyBody(h.body);h=null;}
 if(!h){const body=world.createBody({type:'kinematic',position:V(g.x,g.y),userData:{ghost:g.id}});body.createFixture(P.Box((e.r-e.l)/2,(e.b-e.t)/2,V((e.l+e.r)/2,(e.t+e.b)/2)),{friction:.3,restitution:.1});h={body,k};ghosts.set(g.id,h);}
 h.body.setTransform(V(g.x,g.y),0);h.body.setLinearVelocity(V(g.vx,g.vy));}
 for(const [id,h] of ghosts)if(!seen.has(id)){world.destroyBody(h.body);ghosts.delete(id);}}
// War record: a ship towed home after staying critical in a combat zone was sunk; its zone credits whoever last hit it.
{const towHome=returnToFreeport;returnToFreeport=function(reason){const from=zone;const moved=towHome(reason);if(moved&&reason==='critical'&&typeof zoneEvent==='function')zoneEvent({type:'sunk',zone:from});return moved;};}
// A ship spawning from the ship list (a new ship, or one loaded from storage) appears in a Freeport at a random free
// spot, never docked: the Freeport it was left in, or — if it was left in a combat zone — the Freeport tied to that
// zone. Returns where it went.
function spawnInFreeport(){criticalFor=0;if(zoneDef().kind!=='safe'){snapshotZone();zone=homeFreeport();setupZone(true,'random');}else{docked=null;ship.setType('dynamic');ship.setFixedRotation(true);ship.setTransform(randomBerth(),0);ship.setLinearVelocity(V(0,0));zonePlaced=true;}updateShipMass();save(true);return {zone,x:ship.getPosition().x,y:ship.getPosition().y};}
function remoteMined(id){if(!removeRock(id))return false;zoneData[zone].mined.push(id);return true;}
let lastHitNotice=-99;
function pvpHit(amount,localPoint,dir,ammo,shooter){if(!isCombatZone()||!(amount>0))return;if(docked)releaseDock();const imp=AMMO[ammo]?.impulse||0;if(imp){ship.applyLinearImpulse(V(dir.x*ship.getMass()*5*imp,dir.y*ship.getMass()*5*imp),ship.getWorldCenter(),true);noteKick(dir.x*5*imp,dir.y*5*imp);}const okDir=dir&&Number.isFinite(dir.x)&&Number.isFinite(dir.y);let out=null;const before=shipHP;if(shipHP<=0&&okDir){hullEntryHit(V(localPoint.x,localPoint.y));out={pierce:true};}else damageShip(amount,V(localPoint.x,localPoint.y),okDir?V(dir.x,dir.y):null);/* for the zone's war record: what this hit did */out={...(out||{}),dealt:before>0?Math.min(before,amount):amount,critical:before>0&&shipHP<=0};if(clock-lastHitNotice>4){lastHitNotice=clock;toastAll(shooter?'Under fire from '+shooter+'!':'Hit by your own shot!');}return out;}
function serverRegenerate(seed){zonePlaced=true;snapshotZone();const old=zoneData[zone];zoneData[zone]={seed,mined:[],loot:old.loot||[]};originalSetupZone(true);ghosts=new Map();updateShipMass();save(true);toastAll(zoneDef().name+' regenerated with a new layout. Your ship is at the entry portal.');}
function missionNotice(text){toastAll(text);}
function setRegenTimer(t,reset){const st=zoneData[zone];if(!st)return;st.regenIn=t??undefined;st.resetIn=reset??undefined;}
const DELTA_MIN=1;
// Snapshots are built in two parts: what every crew member of this ship sees (built and encoded once per pass for
// the whole ship), and each member's own part (their slots, notices, mined-tile catch-up, and the tile/machine lists
// or deltas they haven't seen yet). Own fields come after the shared ones in the message, so they win.
const OWN_FIELDS=['stacks','slots','inventory','blocks','terrain','mounts','zoneData'];
let botPass=0;
function snapshotShared(){storeCrew();const st=state(),data={...st};for(const k of OWN_FIELDS)delete data[k];data.clock=clock;data.devDraw=cleanDevShapes(devDraw);
 data.crew=[...crew.values()].map(c=>({id:c.id,name:c.name,rank:c.rank||'guest',p:c.player.getPosition(),v:c.player.getLinearVelocity(),facing:c.facing,piloting:c.piloting,tool:c.tool,climbing:c.climbing,selected:c.selected,held:c.slots[c.selected],beam:handBeam(c.pusherVisual)}));
 data.velocity=ship.getLinearVelocity();data.mission=currentMission();data.criticalFor=+criticalFor.toFixed(2);data.effects=effects;
 if(attachedToZone){const z=zoneLink.snapshot();data.bots=z?.bots||[];data.rockHp=z?.rockHp||[];data.projectiles=z?.projectiles||[];data.zoneLoot=z?.loot||[];data.zoneDevDraw=z?.devDraw;data.zoneBoulders=z?.boulders||[];}else{data.bots=allBots().map(b=>({color:b.species,index:b.index,hp:b.hp,p:b.body.getPosition(),v:b.body.getLinearVelocity()}));data.projectiles=[...shots.map(s=>({...s,owner:undefined})),...enemyShots.map(s=>({...s,owner:undefined}))];}
 // Loose items and zone loot go to each member as changes (see snapshotOwn): [id, type, count, x, y, angle, vx, vy] per
 // stack to 0.01 (velocity 0 when still), so a resting pile costs nothing after the first snapshot.
 const r2=v=>Math.round(v*100)/100,rv=v=>Math.abs(v)<.01?0:r2(v);
 delete data.items;const itemRecs=items.map(i=>{const p=i.body.getPosition(),v=i.body.getLinearVelocity();return [i.nid||(i.nid=++liveSeq),i.type,i.count,r2(p.x),r2(p.y),r2(i.body.getAngle()),rv(v.x),rv(v.y)];});
 // The zone record (without its mined list, which each member catches up on separately).
 const zone0=snapshotZone()[zone]||{},zd={...zone0};delete zd.mined;const lootRecs=(data.zoneLoot||zd.loot||[]).map((l,k)=>[l.id??k+1,l.type,l.count,r2(l.x),r2(l.y),rv(l.vx||0),rv(l.vy||0)]);delete zd.loot;if(data.zoneBoulders)zd.boulders=data.zoneBoulders;delete data.zoneLoot;delete data.zoneBoulders;

 // Bots go out compact — [species, index, hp, x, y, vx, vy] to 0.01 m — about 40 bytes each instead of ~95 (a combat
 // zone's bots were half of every update). The page (network.js) and snapshot() unpack them.
 /* Bots within 250 m of this ship (a zoomed-out view while flying) go out every snapshot; farther ones 5 times a second
  (botsAll marks a full list), and the page keeps those moving on their last velocity in between — at 2 a second, frozen
  in between, they visibly jumped on a zoomed-out screen. */botPass=(botPass+1)%4;{const sp=ship.getPosition(),all=botPass===0||botPass<0;data.botsAll=all;if(!all)data.bots=(data.bots||[]).filter(b=>Math.abs(b.p.x-sp.x)<250&&Math.abs(b.p.y-sp.y)<250);}
 data.bots=(data.bots||[]).map(b=>[b.color,b.index,Math.round(b.hp),Math.round(b.p.x*100)/100,Math.round(b.p.y*100)/100,Math.round(b.v.x*100)/100,Math.round(b.v.y*100)/100]);
 const json=JSON.stringify(data,roundReplacer);
 // Tiles, machines and turrets: encoded once here; each member gets the whole list or only what changed for them.
 const round=v=>JSON.parse(JSON.stringify(v,roundReplacer)),blocks=round(st.blocks),lists={};
 for(const [field,keyOf] of [['terrain',t=>t.type+':'+t.x+','+t.y+':'+(t.rotation||0)],['mounts',t=>t.type+':'+t.side+':'+t.at]]){const list=round(field==='mounts'?mounts.map(({f,...m})=>m):st[field]);lists[field]={list,keys:list.length<DELTA_MIN?null:list.map(keyOf).join('|'),json:list.length<DELTA_MIN?null:list.map(t=>JSON.stringify(t))};}
 return {json,zone:zd,mined:zone0.mined||[],seed:zone0.seed||0,blocks,blocksJSON:JSON.stringify(blocks),lists,items:{recs:itemRecs,json:itemRecs.map(r=>JSON.stringify(r))},loot:{recs:lootRecs,json:lootRecs.map(r=>JSON.stringify(r))}};}
// A list by id, as changes for one member: the whole list the first time (and every RESYNC passes, which also corrects
// anything the page's own physics moved), otherwise the records that changed or appeared and the ids that went away.
const RESYNC=40;function listDelta(m,field,L,own,scope=''){const sent=m[field+'Sent'],n=m[field+'Pass']=(m[field+'Pass']||0)+1,now=new Map();L.recs.forEach((r,k)=>now.set(r[0],L.json[k]));
 if(!sent||sent.scope!==scope||n%RESYNC===0){own[field+'Full']=L.recs;}else{const up=[],gone=[];L.recs.forEach((r,k)=>{if(sent.map.get(r[0])!==L.json[k])up.push(r);});for(const id of sent.map.keys())if(!now.has(id))gone.push(id);if(up.length)own[field+'Up']=up;if(gone.length)own[field+'Gone']=gone;}
 m[field+'Sent']={scope,map:now};}
function snapshotOwn(id,sh){const m=crew.get(id);if(!m)return null;bindCrew(id);
 const own={zone,stacks:slots.map((type,i)=>type?{type,count:stackCounts[i]}:null),slots:[...slots],inventory:{},self:{id,selected,tool,piloting,facing,climbing,rotation:buildRotation,pusherPull,buildJob,manning,rank:m.rank||'guest',noclip:!!m.noclip,sandbox:!!m.sandbox,shipNoclip},notices:(m.notices||[]).splice(0),kick:shipKick};
 const zd={...sh.zone},sent=m.minedSent;if(sent&&sent.zone===zone&&sent.seed===sh.seed&&sent.count<=sh.mined.length)own.minedAdd=sh.mined.slice(sent.count);else{own.minedReset=true;zd.mined=sh.mined;}m.minedSent={zone,seed:sh.seed,count:sh.mined.length};own.zoneData={[zone]:zd};
 // The ship's tiles go to each crew member only when they change (built, removed, damaged, repaired): an 80×80
 // battleship has thousands of them, which would otherwise be resent 20 times a second. null = "same as before".
 if(m.blocksSent===sh.blocksJSON)own.blocks=null;else{m.blocksSent=sh.blocksJSON;own.blocks=sh.blocks;}
 // Big ships: machine and turret records go out only when they change ([index, record] pairs), as long as the
 // set of machines is the same as last time; otherwise the whole list is sent again.
 listDelta(m,'items',sh.items,own);listDelta(m,'loot',sh.loot,own,zone+':'+(sh.seed||0));
 for(const field of ['terrain','mounts']){const L=sh.lists[field];own[field]=L.list;if(!L.keys){m[field+'Sent']=null;continue;}const sent=m[field+'Sent'];if(sent&&sent.keys===L.keys){const d=[];L.json.forEach((j,i)=>{if(sent.json[i]!==j)d.push([i,L.list[i]]);});own[field]=null;own[field+'Delta']=d;}m[field+'Sent']={keys:L.keys,json:L.json};}
 return JSON.parse(JSON.stringify(own,roundReplacer));}
// One member's whole snapshot (tests, tools). The server uses snapshotPass, which shares the common part.
function unpackBots(list){return (list||[]).map(a=>Array.isArray(a)?{color:a[0],index:a[1],hp:a[2],p:{x:a[3],y:a[4]},v:{x:a[5],y:a[6]}}:a);}
function snapshot(id){if(!crew.has(id))return null;/* a one-off snapshot (classic mode, tests) always has every bot, and the plain item and loot lists */botPass=-1;const sh=snapshotShared(),own=snapshotOwn(id,sh),out=Object.assign(JSON.parse(sh.json),own);out.bots=unpackBots(out.bots);
 out.items=sh.items.recs.map(([nid,type,count,x,y,angle,vx,vy])=>({nid,type,count,x,y,angle,...(vx||vy?{v:{x:vx,y:vy}}:{})}));if(out.zoneData?.[zone])out.zoneData[zone].loot=sh.loot.recs.map(([id,type,count,x,y,vx,vy])=>({id,type,count,x,y,vx,vy}));return out;}
// Every listed member's snapshot for one pass: the shared part as encoded text, plus each member's own part.
function snapshotPass(ids){const sh=snapshotShared();return {shared:sh.json,own:ids.map(id=>snapshotOwn(id,sh))};}
function durableState(){storeCrew();const s=JSON.parse(JSON.stringify(state()));s.stacks=[null,null,null,null,null];s.inventory={};s.slots=[null,null,null,null,null];for(const m of crew.values())for(let i=0;i<5;i++)if(m.slots[i]&&m.slots[i]!=='wrench')s.items.push({type:m.slots[i],count:m.stackCounts[i],...m.player.getPosition()});return s;}

// ---- Shared zone link ----------------------------------------------------------------------------------------
let shipForces=[],shipImpulses=[];
function hookShipBody(){if(!attachedToZone||ship.__zoneHooked)return;ship.__zoneHooked=true;
 // Thrust and knockback are recorded (in ship coordinates) and applied to this ship's hull in the zone world.
 ship.applyForce=function(f,p){const lp=ship.getLocalPoint(p);shipForces.push({fx:f.x,fy:f.y,px:lp.x,py:lp.y});};
 ship.applyLinearImpulse=function(f,p){const lp=ship.getLocalPoint(p);shipImpulses.push({fx:f.x,fy:f.y,px:lp.x,py:lp.y});};
 ship.applyForceToCenter=function(f){shipForces.push({fx:f.x,fy:f.y,px:0,py:0});};}
function takeForces(){hookShipBody();const out={forces:shipForces,impulses:shipImpulses};shipForces=[];shipImpulses=[];return out;}
// Punch/yank knocks on the hull, added up: the pilot's screen predicts the ship, so it adds each new knock at once
// instead of drifting into it over a second.
const shipKick={n:0,x:0,y:0};function noteKick(dx,dy){shipKick.n++;shipKick.x+=dx;shipKick.y+=dy;}
// Settings windows (doors, signs, paint, spawn points) only apply within reach and not through a solid tile.
function tileInReach(t){return P.Vec2.distance(localPlayer(),V(t.x,t.y))<8&&!buildBlocked({x:t.x,y:t.y},t.f);}
// The zone hands this hull its pose every tick. Moving a planck body re-files every one of its fixtures in the broadphase
// (a big ship has hundreds) — and this copy of the outside isn't solved in a shared zone — so off the Freeports the
// body is moved directly and fully re-filed only every 6th tick (or after a jump); in Freeports, every tick (docking).
let posePass=0;
function setPose(x,y,vx,vy,kx,ky){if(kx||ky)noteKick(kx,ky);if(docked)return;const p=ship.getPosition();posePass=(posePass+1)%6;
 if(posePass===0||zoneDef().kind==='safe'||Math.abs(p.x-x)+Math.abs(p.y-y)>4||!ship.m_xf||!ship.m_sweep)ship.setTransform(V(x,y),0);else{ship.m_xf.p.x=x;ship.m_xf.p.y=y;ship.m_sweep.setTransform(ship.m_xf);}
 ship.setLinearVelocity(V(vx,vy));}
// A zone round meets this hull. Shields up: they take it. Critical: the round goes in ({pierce:true}) and the zone
// moves it on through the ship, asking zonePierce each step what it runs into.
function zoneDamage(amount,lp,dir,ammo){if(shipHP<=0&&dir&&amount>0){hullEntryHit(V(lp.x,lp.y));return {pierce:true};}const r=damageShip(amount,V(lp.x,lp.y),dir?V(dir.x,dir.y):null);return r?.exit?{x:r.exit.x,y:r.exit.y}:null;}
function zonePierce(amount,a,b){return pierceShip(amount,V(a.x,a.y),V(b.x,b.y));}
function addZoneScore(n){addScore(n);}
if(attachedToZone){hookShipBody();
 // Shots leave for the zone the tick they are fired; bots, bot bullets and loose loot exist only in the zone.
 tickShots=function(){if(!shots.length)return;zoneLink.fire(shots.map(s=>({type:s.type,p:{x:s.p.x,y:s.p.y},v:{x:s.v.x,y:s.v.y},life:s.life,maxLife:s.maxLife,bounces:s.bounces||0,damage:s.damage,frag:s.frag})));shots=[];};
 setupDungeonActors=function(){bots=[];enemyShots=[];};bots=[];enemyShots=[];
 addWorldLoot=function(type,p,count,velocity=V(0,0)){zoneLink.addLoot(type,p.x,p.y,count,velocity.x,velocity.y);return {type,count,grace:0,body:{setAngularVelocity(){},setAngle(){},getPosition:()=>V(p.x,p.y)}};};
 claimWorldLoot=function(hp,allow){return zoneLink.claim(hp.x,hp.y,allow);};
 worldLoot=[];}

// ---- Dev live code helpers (ship) ---------------------------------------------------------------------------------
// Short names for testing; `help()` lists them. They act as the crew member who ran the code (`me`).
function help(){return 'tp(x, y) move yourself · here() where you and the ship are · give(type, n=16) · clearInv() · crit() shields to 0 · heal() · '+
 'fillArea(x0, y0, x1, y1, type="block") place tiles · clearArea(x0, y0, x1, y1) remove tiles · fly(x, y) put the ship there · zoneTo(id) · '+
 'spawnAt(type, x, y, n=16) loose stack · hurt(x, y, hp) set a tile\'s health · log(...) · after/every(sec, fn) · cancel(id?) · timers() · devTick=dt=>… · devDraw=[…] · '+
 'globals: ship, blocks, terrain, items, boxes, mounts, bounds, crew, inventory, shipHP, zone';}
function tp(x,y){player.setTransform(V(+x,+y),0);player.setLinearVelocity(V(0,0));player.setAwake(true);return here();}
function here(){const p=player.getPosition(),s=ship.getPosition();return {you:{x:+p.x.toFixed(2),y:+p.y.toFixed(2),cell:{x:Math.round(p.x),y:Math.round(p.y)}},ship:{x:+s.x.toFixed(1),y:+s.y.toFixed(1),zone},bounds};}
function give(type,n=16){if(!TYPES.includes(type))throw Error('Unknown item '+type+'. Items: '+TYPES.join(', '));giveItem(type,n);return slots.map((s,i)=>s?s+'×'+stackCounts[i]:null);}
function clearInv(){slots=[null,null,null,null,null];stackCounts=[0,0,0,0,0];return 'emptied';}
function crit(){shipHP=0;lastShieldHit=clock;return 'critical';}
function heal(){shipHP=shipMaxHP();for(const t of [...blocks.values(),...terrain.values(),...mounts])t.hp=100;return 'healed';}
function fillArea(x0,y0,x1,y1,type="block"){let n=0;for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++){if(x<=bounds.l||x>=bounds.r||y<=bounds.t||y>=bounds.b||blocks.get(key(x,y))||terrainAt({x,y}))continue;if(type==='block')addBlock(x,y);else addTerrain(type,x,y,buildRotation);n++;}return n+' placed';}
function clearArea(x0,y0,x1,y1){let n=0;for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++){const b=blocks.get(key(x,y));if(b){interior.destroyFixture(b.f);blocks.delete(key(x,y));n++;continue;}const t=terrainAt({x,y});if(t&&t.type!=='fabricator'){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);terrain.delete(t.key||key(t.x,t.y));n++;}}return n+' removed';}
function fly(x,y){docked=null;ship.setType('dynamic');ship.setFixedRotation(true);ship.setTransform(V(+x,+y),0);ship.setLinearVelocity(V(0,0));zonePlaced=true;return {x,y};}
function zoneTo(id){if(!ZONES[id])throw Error('Zones: '+Object.keys(ZONES).join(', '));snapshotZone();zone=id;setupZone(true);return 'now in '+ZONES[id].name;}
function spawnAt(type,x,y,n=16){if(!TYPES.includes(type))throw Error('Unknown item '+type);spawnItem(type,V(+x,+y),V(0,0),n);return items.length+' loose stacks';}
function hurt(x,y,hp){const t=blocks.get(key(x,y))||terrainAt({x,y});if(!t)throw Error('No tile at '+x+','+y);t.hp=Math.max(0,Math.min(100,+hp));t.hitAt=clock;return t.type||'block';}
