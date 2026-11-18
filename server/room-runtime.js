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
const RANKS=['captain','crew','guest'],GUEST_BLOCKED=['helm','interact','craft','material','clearQueue','repeat','hatch','portal','rename'];
// Spawn kit: only the captain spawns with a wrench (crew and guests start empty-handed). The wrench goes with the
// captain when they leave instead of being dropped, so wrenches never pile up aboard.
function spawnKit(id){if(!bindCrew(id))return;const cap=currentCrew.rank==='captain';for(let i=0;i<5;i++)if(slots[i]==='wrench'&&!cap){slots[i]=null;stackCounts[i]=0;}
 if(cap&&!slots.includes('wrench')){const i=slots.indexOf(null);if(i>=0){slots[i]='wrench';stackCounts[i]=1;}}selectSlot(Math.max(0,slots.indexOf('wrench')));storeCrew();}
function mayBuildDoor(){return (currentCrew?.rank||'guest')==='captain';}
function setCrewRank(id,rank){const c=crew.get(id);if(!c||!RANKS.includes(rank))return false;c.rank=rank;c.captain=rank==='captain';storeCrew();playerFilter(c.player,rank);return true;}
function allowed(m,a){const rank=m.rank||'guest';if(rank==='captain'||a==='dev')return true;if(a==='rename'||a==='door')return false;if(rank==='crew')return true;if(GUEST_BLOCKED.includes(a))return false;return true;}
function command(id,msg){if(!bindCrew(id))return;const m=currentCrew;const a=msg.action;actor=m;try{
 if(!allowed(m,a)){if(a!=='input')toast(m.rank==='guest'?'Guests cannot do that here — ask the captain to make you crew.':'Only the captain can do that.');storeCrew();return;}
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
function exteriorLayout(){return {bounds:{...bounds},helm:{x:helm.x,y:helm.y},brokenHull:[...brokenHull],blocks:[...blocks.values()].map(b=>[b.x,b.y,b.rotation||0]),terrain:[...terrain.values()].map(t=>[t.type,t.x,t.y,t.rotation||0]),mounts:mounts.map(({type,side,at,rotation=0,starterRC=false,ammo=0})=>({type,side,at,rotation,starterRC,ammo}))};}
function exteriorCrew(){storeCrew();return [...crew.values()].map(c=>({n:c.name,x:+c.player.getPosition().x.toFixed(2),y:+c.player.getPosition().y.toFixed(2),f:c.facing,p:c.piloting,c:c.climbing,t:c.tool,h:c.slots[c.selected]}));}
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
function snapshot(id){storeCrew();const m=crew.get(id);if(!m)return null;bindCrew(id);const data=state();data.inventory={};data.clock=clock;data.crew=[...crew.values()].map(c=>({id:c.id,name:c.name,rank:c.rank||'guest',p:c.player.getPosition(),v:c.player.getLinearVelocity(),facing:c.facing,piloting:c.piloting,tool:c.tool,climbing:c.climbing,selected:c.selected,held:c.slots[c.selected]}));data.self={id,selected,tool,piloting,facing,climbing,rotation:buildRotation,pusherPull,buildJob,manning,rank:m.rank||'guest'};data.velocity=ship.getLinearVelocity();data.mission=currentMission();data.criticalFor=+criticalFor.toFixed(2);data.effects=effects;data.zoneData={[zone]:data.zoneData[zone]};if(attachedToZone){const z=zoneLink.snapshot();data.bots=z?.bots||[];data.rockHp=z?.rockHp||[];data.projectiles=z?.projectiles||[];data.zoneLoot=z?.loot||[];data.zoneBoulders=z?.boulders||[];}else{data.bots=allBots().map(b=>({color:b.species,index:b.index,hp:b.hp,p:b.body.getPosition(),v:b.body.getLinearVelocity()}));data.projectiles=[...shots.map(s=>({...s,owner:undefined})),...enemyShots.map(s=>({...s,owner:undefined}))];}data.items=items.map(i=>({type:i.type,count:i.count,p:i.body.getPosition(),x:i.body.getPosition().x,y:i.body.getPosition().y,v:i.body.getLinearVelocity(),angle:i.body.getAngle()}));data.mounts=mounts.map(({f,...m})=>m);data.notices=(m.notices||[]).splice(0);const zd=data.zoneData[zone]={...data.zoneData[zone]},minedList=zd.mined||[],sent=m.minedSent;if(sent&&sent.zone===zone&&sent.seed===(zd.seed||0)&&sent.count<=minedList.length){data.minedAdd=minedList.slice(sent.count);delete zd.mined;}else data.minedReset=true;m.minedSent={zone,seed:zd.seed||0,count:minedList.length};zd.loot=(data.zoneLoot||zd.loot||[]).map(({type,count,x,y,vx,vy})=>({type,count,x,y,vx,vy}));if(data.zoneBoulders)zd.boulders=data.zoneBoulders;delete data.zoneLoot;delete data.zoneBoulders;return JSON.parse(JSON.stringify(data,roundReplacer));}
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
