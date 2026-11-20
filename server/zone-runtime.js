// Executed in a zone's VM context (server/zone-sim.cjs). One shared world per zone: the rocks, boulders, bots,
// loose loot, projectiles and the exterior hull of EVERY ship in the zone live in this one Box2D world. Each ship's
// own room (server/room.cjs) still simulates its interior and crew; it sends this world its thrust forces and its
// shots, and gets back its position, damage, loot and score.
//
// The game code runs here unchanged. Code written for "the ship" is pointed at one fleet ship at a time by
// rebinding the globals `ship`, `docked` and `damageShip` (each bot is aimed at the nearest ship, for instance).
const fleet=new Map(); // ship id -> {id,name,body,ext,size,mass,damping,docked,forces,impulses}
let scoreOwner=null,dummyShip=ship;dummyShip.setActive(false);dummyShip.setTransform(V(1e5,1e5),0);
const zoneHost=hostApi; // provided by zone-sim.cjs: damage, pvpHit, score, toast, mined
toast=function(m){};toastAll=function(m){zoneHost.toast(String(m));};save=function(){};

function shipBox(body,ext){for(let f=body.getFixtureList();f;){const n=f.getNext();body.destroyFixture(f);f=n;}body.createFixture(P.Box((ext.r-ext.l)/2,(ext.b-ext.t)/2,V((ext.l+ext.r)/2,(ext.t+ext.b)/2)),{friction:.3,restitution:.1,density:1});}
function zsAddShip(id,s){zsRemoveShip(id);const body=world.createDynamicBody({position:V(s.x,s.y),fixedRotation:true,linearDamping:s.damping??.55,userData:{ghost:id,shipId:id}});body.setGravityScale(0);
 const f={id,name:s.name||'',body,ext:{...s.ext},size:s.size||0,mass:s.mass||100,damping:s.damping??.55,docked:false,forces:[],impulses:[]};shipBox(body,f.ext);body.setMassData({mass:f.mass,center:V(0,0),I:0});body.setLinearVelocity(V(s.vx||0,s.vy||0));fleet.set(id,f);zsUpdateShip(id,s);return true;}
function zsRemoveShip(id){const f=fleet.get(id);if(!f)return null;const out={x:f.body.getPosition().x,y:f.body.getPosition().y,vx:f.body.getLinearVelocity().x,vy:f.body.getLinearVelocity().y};world.destroyBody(f.body);fleet.delete(id);return out;}
// Shape, mass and dock state follow the ship's room; a docked ship is held static where the room has it.
// Ship noclip (dev menu): the hull collides with nothing — rocks, bots, loot or other ships.
function shipNoclipApply(f){for(let x=f.body.getFixtureList();x;x=x.getNext())x.setFilterData({groupIndex:0,categoryBits:1,maskBits:f.noclip?0:0xffff});}
function zsUpdateShip(id,s){const f=fleet.get(id);if(!f)return;f.name=s.name||f.name;f.size=s.size||f.size;
 const k=[s.ext.l,s.ext.r,s.ext.t,s.ext.b].join();if(k!==[f.ext.l,f.ext.r,f.ext.t,f.ext.b].join()){f.ext={...s.ext};shipBox(f.body,f.ext);f.body.setMassData({mass:f.mass,center:V(0,0),I:0});shipNoclipApply(f);}
 if(!!s.noclip!==!!f.noclip){f.noclip=!!s.noclip;shipNoclipApply(f);}
 if(s.mass&&Math.abs(s.mass-f.mass)>.01){f.mass=s.mass;f.body.setMassData({mass:f.mass,center:V(0,0),I:0});}if(s.damping!=null&&s.damping!==f.damping){f.damping=s.damping;f.body.setLinearDamping(s.damping);}
 if(s.docked){if(!f.docked||f.body.getType()!=='static'){f.body.setType('static');}f.body.setTransform(V(s.x,s.y),0);f.docked=true;}
 else if(f.docked){f.docked=false;f.body.setType('dynamic');f.body.setFixedRotation(true);f.body.setMassData({mass:f.mass,center:V(0,0),I:0});f.body.setTransform(V(s.x,s.y),0);f.body.setLinearVelocity(V(s.vx||0,s.vy||0));}}
// Hard reposition (portal arrival, regeneration, recovery).
function zsPlaceShip(id,s){const f=fleet.get(id);if(!f)return;f.body.setTransform(V(s.x,s.y),0);f.body.setLinearVelocity(V(s.vx||0,s.vy||0));f.body.setAwake(true);}
function zsForces(id,forces,impulses){const f=fleet.get(id);if(!f)return;f.forces=forces||[];f.impulses=impulses||[];}

// Bind the single-ship globals to fleet ship f (or to nothing).
function bindTarget(f){ship=f?f.body:dummyShip;docked=f?.docked?{side:'floor'}:null;currentTarget=f||null;}
let currentTarget=null,zsTick=0;const BOT_FAR=160;
damageShip=function(amount,point,dir=null){const f=currentTarget;if(!f)return null;return zoneHost.damage(f.id,amount,{x:point.x,y:point.y},dir?{x:dir.x,y:dir.y}:null,null,null);};
releaseDock=function(){};
shipExtents=function(){return currentTarget?currentTarget.ext:{l:-1,r:1,t:-1,b:1};};
nearAnyShip=function(q,r){for(const f of fleet.values())if(P.Vec2.distance(q,f.body.getPosition())<r)return true;return false;};
// Player shots: credit the shooter, hit their own hull only once they've cleared it, and scale PvP damage by the
// SHOOTER's size (hitting yourself always does full damage).
onShotStart=function(s){scoreOwner=s.owner??null;};
shotLeftOwner=function(s){const f=fleet.get(s.owner);if(!f)return true;const q=f.body.getLocalPoint(s.p),e=f.ext;return q.x<e.l-1||q.x>e.r+1||q.y<e.t-1||q.y>e.b+1;};
shotPvp=function(s){const f=fleet.get(s.owner);return pvpMultiplierFor(f?.size||0,zone);};
addScore=function(n){if(scoreOwner!=null&&Number.isFinite(n)&&n>0)zoneHost.score(scoreOwner,n);};
zoneEvent=function(e){if(e.type==='hit'){const t=fleet.get(e.target);if(!t)return;const lp=t.body.getLocalPoint(V(e.point.x,e.point.y));zoneHost.pvpHit(e.target,e.amount,{x:lp.x,y:lp.y},e.dir,e.ammo,scoreOwner);}else if(e.type==='mined')zoneHost.mined(e.id,e.seed);};

function zsNearest(p,maxDist=Infinity){let best=null,bd=maxDist;for(const f of fleet.values()){const d=P.Vec2.distance(p,f.body.getPosition());if(d<bd){bd=d;best=f;}}return best;}

function zsStep(dt){clock+=dt;
 for(const f of fleet.values()){if(f.docked){f.forces=[];f.impulses=[];continue;}for(const a of f.forces)f.body.applyForce(V(a.fx,a.fy),f.body.getWorldPoint(V(a.px,a.py)),true);for(const a of f.impulses)f.body.applyLinearImpulse(V(a.fx,a.fy),f.body.getWorldPoint(V(a.px,a.py)),true);f.forces=[];f.impulses=[];}
 for(const i of worldLoot)i.grace=Math.max(0,(i.grace||0)-dt);mergeTouchingCargo(worldLoot,world);
 if(isCombatZone()){bindTarget(null);tickBotRespawn(dt);}

 // The shared world (hulls, rock, bots, boulders, loot) is solved by native Box2D (C++), like ship interiors; Planck
 // keeps a mirror of it for the game's raycasts and lookups.
 if(typeof nativeStep==='function')nativeStep(world,dt,{contacts:false});else world.step(dt,8,3);
 if(isCombatZone()){
  // Each bot hunts the nearest ship (bots ignore ships parked on a portal; see BOT_RULES).
  // Bots far from every ship (BOT_FAR) decide only every 6th step and keep their last heading in between; near ones
  // think every step as before.
  zsTick++;
  if(!botsPaused)for(const bot of allBots()){const bp=bot.body.getPosition(),f=zsNearest(bp);bindTarget(f);if(!f){bot.body.applyForceToCenter(V(0,0),false);continue;}
   if(P.Vec2.distance(bp,f.body.getPosition())>BOT_FAR&&(zsTick+bot.index)%6){const def=BOT_TYPES[bot.species];if(bot.best&&def)bot.body.applyForceToCenter(V(bot.best.x*bot.body.getMass()*def.thrust,bot.best.y*bot.body.getMass()*def.thrust),true);continue;}
   botThink(bot,dt,nearPortal(f.body.getPosition(),BOT_RULES.portalKeepout));}
  bindTarget(null);
  tickShots(dt);scoreOwner=null;
  zsEnemyShots(dt);
  if(typeof refreshTreasure==='function')refreshTreasure();
 }else{shots=[];enemyShots=[];}
 bindTarget(null);}

// Bot bullets against every hull in the zone (critical hulls let them through to the tiles behind).
function zsEnemyShots(dt){for(const s of enemyShots){s.v.y+=10*dt;const next=V(s.p.x+s.v.x*dt,s.p.y+s.v.y*dt);let hit=null,point=null,fraction=1;
  world.rayCast(s.p,next,(f,p,n,t)=>{const b=f.getBody();if(b===s.owner||(s.through!=null&&b.getUserData()?.shipId===s.through))return -1;if(t<fraction){hit=b;point=p.clone();fraction=t;}return t;});
  if(hit){const sid=hit.getUserData()?.shipId,f=sid!=null&&fleet.get(sid);if(f){const d=s.v.clone();d.normalize();const imp=AMMO[s.type]?.impulse||0;if(imp&&!f.docked){f.body.applyLinearImpulse(V(d.x*f.body.getMass()*5*imp,d.y*f.body.getMass()*5*imp),f.body.getWorldCenter(),true);f.kx=(f.kx||0)+d.x*5*imp;f.ky=(f.ky||0)+d.y*5*imp;}
    const lp=f.body.getLocalPoint(point),ld=f.body.getLocalVector(d),through=zoneHost.damage(f.id,s.damage??(AMMO[s.type]||AMMO.ammo).damage,{x:lp.x,y:lp.y},{x:ld.x,y:ld.y},s.type,null);
    if(through){s.through=f.id;s.p=f.body.getWorldPoint(V(through.x,through.y));s.life-=dt;continue;}}s.life=0;}
  s.p=next;s.life-=dt;}enemyShots=enemyShots.filter(s=>s.life>0);}

// Ships hand their projectiles to the zone.
function zsFire(id,list){for(const s of list||[])shots.push({...s,p:V(s.p.x,s.p.y),v:V(s.v.x,s.v.y),owner:id});}
// Loot thrown out of a ship (ejectors, hull leaks, broken tiles) joins the zone.
function zsAddLoot(type,x,y,count,vx,vy,grace=2){if(!TYPES.includes(type)||!(count>0))return;const l=addWorldLoot(type,V(x,y),count,V(vx||0,vy||0));l.grace=grace;}
// A ship's hatch asks for the nearest allowed loot by its hull.
function zsClaimLoot(id,x,y,allow){const f=fleet.get(id);if(!f)return null;bindTarget(f);const got=claimWorldLoot(V(x,y),allow);bindTarget(null);return got;}
// Developer operations that act on the zone (bots live here now).
function zsDev(op,species,id){const f=fleet.get(id);scoreOwner=id;if(op==='killgreen'||op==='killred'||op==='killbots'){const sp=op==='killbots'?species:op.slice(4);if(Object.hasOwn(BOT_TYPES,sp))for(const b of botsOf(sp))damageBot(1e9,sp,b.index);}
 else if(op==='spawnbot'&&Object.hasOwn(BOT_TYPES,species)){const list=zoneData[zone]?.bots?.[species],i=list?list.findIndex(r=>r?.dead):-1;if(i>=0&&spawnBot(species,null,i))list[i]={dead:false};}
 else if(op==='ai')botsPaused=!botsPaused;scoreOwner=null;return true;}
// New layout for the whole zone: rebuild rock, bots, boulders and loot; ships stay where the rooms put them.
function zsRegenerate(seed){const keep=[...fleet.entries()].map(([id,f])=>[id,{x:f.body.getPosition().x,y:f.body.getPosition().y,ext:f.ext,size:f.size,mass:f.mass,damping:f.damping,name:f.name}]);fleet.clear();
 zoneData[zone]={seed,mined:[],loot:[]};setupZone(false);dummyShip=ship;dummyShip.setActive(false);for(const [id,s] of keep)zsAddShip(id,s);}
function zsShip(id){const f=fleet.get(id);if(!f)return null;const p=f.body.getPosition(),v=f.body.getLinearVelocity();const out={x:p.x,y:p.y,vx:v.x,vy:v.y,kx:f.kx||0,ky:f.ky||0};f.kx=f.ky=0;return out;}
// Rocks that have taken damage, so every ship can show their health bars.
const hurtRocks=new Set();function noteRockHurt(r){hurtRocks.add(r.id);}
function rockHealth(){const out=[];for(const id of hurtRocks){const r=rocks.get(id);if(!r||r.hp>=r.maxhp){hurtRocks.delete(id);continue;}out.push([id,Math.max(0,Math.round(r.hp)),r.maxhp]);}return out;}
function zsSnapshot(){return {devDraw:cleanDevShapes(devDraw,'world'),rockHp:rockHealth(),bots:allBots().map(b=>({color:b.species,index:b.index,hp:b.hp,p:{x:+b.body.getPosition().x.toFixed(3),y:+b.body.getPosition().y.toFixed(3)},v:{x:+b.body.getLinearVelocity().x.toFixed(3),y:+b.body.getLinearVelocity().y.toFixed(3)}})),
 projectiles:[...shots,...enemyShots].map(s=>({type:s.type,p:{x:+s.p.x.toFixed(3),y:+s.p.y.toFixed(3)},v:{x:+s.v.x.toFixed(3),y:+s.v.y.toFixed(3)},life:+(s.life||0).toFixed(3),frag:s.frag||undefined})),
 loot:worldLoot.map(i=>({type:i.type,count:i.count,x:+i.body.getPosition().x.toFixed(3),y:+i.body.getPosition().y.toFixed(3),vx:+i.body.getLinearVelocity().x.toFixed(3),vy:+i.body.getLinearVelocity().y.toFixed(3)})),
 boulders:boulderState()};}
