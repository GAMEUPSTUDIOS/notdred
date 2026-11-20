'use strict';
function canStore(f,t){return (f.materials[t]||0)>0||Object.values(f.materials).filter(n=>n>0).length<3}

function transferMaterial(type,eject=false){if(!activeFab||!TYPES.includes(type))return;const mat=activeFab.materials;if(!eject&&!fabIngredients(activeFab).has(type))return toast(NAMES[type]+' is not an ingredient for anything a '+FABRICATORS[fabKind(activeFab)].name.toLowerCase()+' makes.');if(eject){const count=Math.min(stackLimit(type),mat[type]||0);scatter(type,count,V(activeFab.x-1.2,activeFab.y+1),key(activeFab.x,activeFab.y));mat[type]-=count;}else {if(!canStore(activeFab,type))return toast('All three fabricator bins are occupied. Eject a bin first.');const n=Math.min(inventory[type],64-(mat[type]||0));if(n<=0)return toast('That bin is full (64).');inventory[type]-=n;mat[type]=(mat[type]||0)+n;toast('Loaded '+n+' '+NAMES[type]+' into the '+FABRICATORS[fabKind(activeFab)].name.toLowerCase()+'.');}renderRecipes();save(true)}

function clearQueue(){if(!activeFab)return;activeFab.queue=[];if(activeFab.job){for(const [m,n] of Object.entries(recipeNeeds(activeFab.job.type)||{}))inventory[m]+=n;activeFab.job=null}renderRecipes();save(true)}

function craft(t,count=1){const f=activeFab||nearFab();if(!f||!recipeNeeds(t)||piloting)return false;if(!FABRICATORS[fabKind(f)].recipes.includes(t)){toast('A '+FABRICATORS[fabKind(f)].name+' cannot make '+NAMES[t]+'.');return false;}if(f.queue.length+count>32){toast('Queue limit: 32.');return false}for(let i=0;i<count;i++)f.queue.push(t);if(activeFab)renderRecipes();save(true);return true}

// Machines never swallow loose items thrown or dropped onto them: a player loads one by clicking it with the item in
// hand, or a loader feeds it.
function tickFabricators(dt){for(const f of terrain.values()){if(f.type!=='fabricator')continue;f.queue=f.queue.filter(t=>recipeNeeds(t));if(f.job&&!recipeNeeds(f.job.type)){f.materials.iron=(f.materials.iron||0)+12;f.job=null;}if(!f.job&&f.queue.length){const t=f.queue[0];const need=Object.entries(recipeNeeds(t));if(need.every(([m,n])=>(f.materials[m]||0)>=n)){for(const [m,n] of need)f.materials[m]-=n;f.queue.shift();f.job={type:t,progress:0}}}if(f.job){f.job.progress=Math.min((DURATION[f.job.type]||2),f.job.progress+dt);if(f.job.progress>=(DURATION[f.job.type]||2)){/* The finished item is set down at the fabricator's item doors (its bottom-left hatch), at rest: it never pops
 out with a push. A matching stack already sitting there is topped up; anything else there makes it wait. */
const q=V(f.x+.02,f.y+2.15),n=RECIPE_YIELD[f.job.type]||1,here=items.filter(i=>P.Vec2.distance(i.body.getPosition(),q)<.8),same=here.find(i=>i.type===f.job.type&&i.count+n<=stackLimit(i.type));
if(same||!here.length){if(same){same.count+=n;same.body.setAwake(true);}else{const it=spawnItem(f.job.type,q,V(0,0),n);it.intakeFrom=key(f.x,f.y);}effects.push({x:q.x,y:q.y,w:1,h:1,life:.3,color:'green',kind:'craft'});if(f.repeat&&f.queue.length<32)f.queue.push(f.job.type);f.job=null}}}}uiTimer+=dt;if(uiTimer>.2&&el('craft').open){uiTimer=0;renderRecipes()}}

function loadThruster(c,type){if(piloting)return toast('Leave the helm to load a thruster.');const m=mountHit(c);if(!m||m.type!=='thruster')return toast('Click a normal three-tile thruster. Starter thrusters do not need fuel.');if(!inventory[type])return toast('No '+NAMES[type]+' available.');inventory[type]--;const tank=type==='fuel'?'fuelItems':'explosiveItems';m[tank]=(m[tank]||0)+1;save(true);toast('Loaded '+NAMES[type]+'. Fuel: '+(m.fuelItems||0)+' / Explosives: '+(m.explosiveItems||0));}

function burn(m,dt,power){if(m.type==='starter')return THRUSTER_FORCE.starter;if((m.burnRemaining||0)<=0){if(m.fuelItems>0){m.fuelItems--;m.burnKind='fuel';m.burnRemaining=120}else if(m.explosiveItems>0){m.explosiveItems--;m.burnKind='explosives';m.burnRemaining=60}else return 0}const used=Math.min(m.burnRemaining,dt*power);m.burnRemaining-=used;return (m.burnKind==='fuel'?THRUSTER_FORCE.fuel:THRUSTER_FORCE.explosives)*(used/(dt*power));}

// Placed shredder tiles (pre-v13 saves; they become shredder items on load) no longer eat loose items: nothing takes
// loose items by itself except loaders and pushers.
function tickShredders(){}

function hatchOutput(t){const a=(t.rotation||0)*Math.PI/2;return V(t.x-Math.sin(a)*.95,t.y+Math.cos(a)*.95);}

function ejectorExit(t){if(t.type!=='ejector'||!t.side)return null;const dir=inward(t).clone().neg(),q=mountPoint(t);return {dir,p:V(q.x+dir.x*3.2,q.y+dir.y*3.2)};}

function launchCargo(t,type,count){const port=ejectorExit(t);if(!port)return false;const p=ship.getWorldPoint(port.p);let blocked=false;world.queryAABB(new P.AABB(V(p.x-2,p.y-2),V(p.x+2,p.y+2)),f=>{if(f.getBody()!==ship&&!f.isSensor()&&f.getBody().getType()==='static')blocked=true;return true;});if(blocked){toast('Ejector outlet blocked. Move the ship.');return false;}const v=ship.getLinearVelocity();const loot=addWorldLoot(type,p,count,V(v.x+port.dir.x*12,v.y+port.dir.y*12));loot.body.setAngularVelocity((terrainHash(clock,count)-.5)*4);loot.grace=2;t.flash=clock+.2;t.cooldown=.4;return true;}

function ejectCarried(t){if(P.Vec2.distance(localPlayer(),mountPoint(t))>5||buildBlocked(mountPoint(t)))return toast('Move closer with a clear path to the ejector.');if(!slots[selected]||!stackCounts[selected])return toast('Hold an item stack and click the ejector.');const type=slots[selected],count=stackCounts[selected];if(launchCargo(t,type,count)){takeItem(type,count);save(true);toast('Ejected '+count+' '+NAMES[type]+'.');}}

function tickEjectors(dt){for(const t of mounts)if(t.type==='ejector')t.cooldown=Math.max(0,(t.cooldown||0)-dt);}

function lootReachable(i){let blocked=false;world.rayCast(i.body.getPosition(),ship.getPosition(),f=>{if(f.getBody()!==ship&&f.getBody().getType()==='static'){blocked=true;return 0;}return 1;});return !blocked;}

function ejectTurretAmmo(m){if(piloting||P.Vec2.distance(localPlayer(),mountPoint(m))>8||buildBlocked(mountPoint(m)))return toast('Move closer with a clear path to the turret.');if(!m.ammo)return toast('Turret is empty.');const p=mountPoint(m),n=inward(m),t=V(-n.y,n.x);let output=null;for(const offset of [0,-.8,.8]){const q=V(p.x+n.x*1.35+t.x*offset,p.y+n.y*1.35+t.y*offset);if(q.x<bounds.l+.85||q.x>bounds.r-.85||q.y<bounds.t+.85||q.y>bounds.b-.85)continue;let blocked=false;inside.queryAABB(new P.AABB(V(q.x-.35,q.y-.35),V(q.x+.35,q.y+.35)),f=>{if(f.getBody()!==player&&(f.getFilterMaskBits()&8)&&!f.isSensor())blocked=true;return true;});if(!blocked){output=q;break;}}if(!output)return toast('Clear the turret’s interior outlet before ejecting ammo.');const count=m.ammo;spawnItem(m.ammoType||'ammo',output,V(n.x*.5,n.y*.5),count);m.ammo=0;save(true);toast('Ejected '+count+' ammo.');return true;}

function hatchClear(t){const q=hatchOutput(t);if(q.x<bounds.l+.85||q.x>bounds.r-.85||q.y<bounds.t+.85||q.y>bounds.b-.85)return false;let clear=true;inside.queryAABB(new P.AABB(V(q.x-.34,q.y-.34),V(q.x+.34,q.y+.34)),f=>{if(!f.isSensor()&&f.getBody()!==player){clear=false;return false;}return true;});return clear;}

// Takes the nearest allowed loose world item near a hatch (on a server, from the shared zone).
// Loot within LOOT_REACH of the ship's hull (any part of it, not just the hatch) can be drawn in; the one nearest
// the hatch comes first. (It used to be 9 units from the hatch itself, so most of a big ship never collected.)
const LOOT_REACH=7;
function hullBox(){let box=null;for(let f=ship.getFixtureList();f;f=f.getNext()){const a=f.getAABB(0);if(!a)continue;if(!box)box={l:a.lowerBound.x,t:a.lowerBound.y,r:a.upperBound.x,b:a.upperBound.y};else{box.l=Math.min(box.l,a.lowerBound.x);box.t=Math.min(box.t,a.lowerBound.y);box.r=Math.max(box.r,a.upperBound.x);box.b=Math.max(box.b,a.upperBound.y);}}return box;}
function nearHull(p,box){if(!box)return false;const dx=Math.max(box.l-p.x,0,p.x-box.r),dy=Math.max(box.t-p.y,0,p.y-box.b);return Math.hypot(dx,dy)<LOOT_REACH;}
function claimWorldLoot(hp,allow){const box=hullBox();let i=null,best=Infinity;for(const c of worldLoot){if(!allow(c.type)||(c.grace||0)>0)continue;const p=c.body.getPosition();if(!nearHull(p,box)&&P.Vec2.distance(p,hp)>=9)continue;const d=P.Vec2.distance(p,hp);if(d<best&&lootReachable(c)){best=d;i=c;}}if(!i)return null;world.destroyBody(i.body);worldLoot.splice(worldLoot.indexOf(i),1);return {type:i.type,count:i.count};}
// Where a hatch puts the next item: its outlet, or a tile or two further in when something sits on the outlet (an item
// left there used to jam the hatch for good). A same-type stack on the outlet with room takes it instead.
function hatchSpot(t,type,count){const a=(t.rotation||0)*Math.PI/2,n=V(-Math.sin(a),Math.cos(a)),q0=hatchOutput(t);
 const there=items.find(i=>i.type===type&&i.count+count<=stackLimit(type)&&P.Vec2.distance(i.body.getPosition(),q0)<.6);if(there)return {merge:there};
 for(const k of [0,1,2]){const q=V(q0.x+n.x*k,q0.y+n.y*k);if(q.x<bounds.l+.85||q.x>bounds.r-.85||q.y<bounds.t+.85||q.y>bounds.b-.85)break;let clear=true;inside.queryAABB(new P.AABB(V(q.x-.34,q.y-.34),V(q.x+.34,q.y+.34)),f=>{if(!f.isSensor()&&f.getBody()!==player){clear=false;return false;}return true;});if(clear)return {at:q};}return null;}
function tickHatches(dt){const hatches=[...terrain.values()].filter(t=>['hatch','starter_hatch'].includes(t.type));for(const t of hatches){t.outputTimer=Math.max(0,(t.outputTimer||0)-dt);if(t.outputTimer>0||t.filterMode==='off')continue;const queued=t.cargo?.findIndex(i=>hatchAllows(t,i.type));let cargo=queued>=0?t.cargo.splice(queued,1)[0]:null;
  if(!cargo){if(!hatchSpot(t,'',0))continue;cargo=claimWorldLoot(ship.getWorldPoint(V(t.x,t.y)),type=>hatchAllows(t,type));if(!cargo)continue;}
  const spot=hatchSpot(t,cargo.type,cargo.count);if(!spot){(t.cargo??=[]).unshift(cargo);t.outputTimer=.4;continue;}
  if(spot.merge){spot.merge.count+=cargo.count;wakeCargo(spot.merge.body);}else spawnItem(cargo.type,spot.at,V(0,0),cargo.count);t.outputTimer=.4;}}

// ℵ30 stationary pusher. Its beam runs from the pusher in the facing direction (R rotates; 0 = right) with no
// length limit: it passes through loose cargo, crew and every tile that lets a beam through (walkways, walkway
// wedges, glass, item nets, ladders, hatches) and stops at the first solid tile — a block, wedge, hull,
// fabricator, loader or another pusher. Every loose item, expando box and crew member in the beam is driven toward
// PUSHER_SPEED. Speed/accel are PLACEHOLDERS.
const PUSHER_SPEED=10,PUSHER_ACCEL=60,BEAM_PASSES=['walkway','walkway_wedge','glass','net','ladder','hatch','starter_hatch'];
function pusherDirection(t){const a=(t.rotation||0)*Math.PI/2;return V(Math.round(Math.cos(a)),Math.round(Math.sin(a)));}
// Push or pull (right-click), with the same item filter as hatches. The pusher block itself is solid; its beam is
// cast from its centre, ignoring its own shape. Pulled cargo stops a tile short of the pusher instead of grinding into it.
function pusherTarget(body){const item=items.find(i=>i.body===body);if(item)return {kind:'item',type:item.type};if(boxes.some(b=>b.body===body))return {kind:'box'};for(const t of terrain.values())if(t.body===body)return {kind:'machine'};return {kind:'crew'};}
// Pusher settings (the configuration window): max beam length (tiles), target speed, a default mode and a filtered
// mode (push / pull / off), up to three item filters, and "filter by inventory". The first object in the beam uses the
// filtered mode when it matches a filter — a loose stack of that item, or, with filter-by-inventory, an expando box,
// machine or crew member carrying one — and the default mode otherwise. Old pushers (pull flag, hatch-style filters)
// are converted the first time they're read.
const PUSHER_MODES=['push','pull','off'],PUSHER_FILTERS=3,PUSHER_MAX_BEAM=1000,PUSHER_MAX_SPEED=60;
function pusherSettings(t){if(t.mode)return t;const base=t.filterMode==='off'?'off':t.pull?'pull':'push',list=(t.filterItems||[]).slice(0,PUSHER_FILTERS);
 t.maxBeam=PUSHER_MAX_BEAM;t.speed=PUSHER_SPEED;t.filterInv=false;t.filters=[...list,null,null,null].slice(0,PUSHER_FILTERS);
 if(t.filterMode==='whitelist'){t.mode='off';t.filteredMode=base==='off'?'push':base;}else if(t.filterMode==='blacklist'){t.mode=base;t.filteredMode='off';}else{t.mode=base;t.filteredMode=base;}return t;}
function objectInventory(body){for(const b of boxes)if(b.body===body)return Object.keys(b.materials).filter(k=>b.materials[k]>0);for(const t of terrain.values())if(t.body===body)return Object.keys(t.materials||{}).filter(k=>t.materials[k]>0);if(typeof crew!=='undefined')for(const c of crew.values())if(c.player===body)return (c.slots||[]).filter(Boolean);if(player===body)return slots.filter(Boolean);return [];}
function pusherModeFor(t,body){pusherSettings(t);const set=(t.filters||[]).filter(Boolean);if(!set.length)return t.mode;const target=pusherTarget(body);let match=false;
 if(target.kind==='item')match=set.includes(target.type);else if(t.filterInv)match=objectInventory(body).some(k=>set.includes(k));return match?t.filteredMode:t.mode;}
function pusherAllows(t,body){return pusherModeFor(t,body)!=='off';}
function configurePusher(c,o){const t=terrainAt(c);if(!t||t.type!=='pusher_block'||piloting||P.Vec2.distance(localPlayer(),V(t.x,t.y))>8||buildBlocked({x:t.x,y:t.y},t.f))return false;pusherSettings(t);
 const num=(v,lo,hi,d)=>Number.isFinite(+v)?Math.min(hi,Math.max(lo,Math.round(+v))):d;
 t.maxBeam=num(o.maxBeam,1,PUSHER_MAX_BEAM,t.maxBeam);t.speed=num(o.speed,1,PUSHER_MAX_SPEED,t.speed);if(PUSHER_MODES.includes(o.mode))t.mode=o.mode;if(PUSHER_MODES.includes(o.filteredMode))t.filteredMode=o.filteredMode;t.filterInv=!!o.filterInv;
 if(Array.isArray(o.filters))t.filters=Array.from({length:PUSHER_FILTERS},(_,k)=>TYPES.includes(o.filters[k])?o.filters[k]:null);t.pull=t.mode==='pull';save(true);return true;}
// Does this interior fixture let a beam through? Walkways (category 4) and nets (16) are recognised by their
// collision category; glass shares the solid category, so the tile just past the hit point is looked up.
function beamPasses(f,pt,d){const cat=f.getFilterCategoryBits();if(cat===4||cat===16)return true;const c={x:Math.round(pt.x+d.x*.05),y:Math.round(pt.y+d.y*.05)};if(blocks.has(key(c.x,c.y)))return false;const t=terrainAt(c);return !!t&&BEAM_PASSES.includes(t.type);}
// The beam is blocked by the first thing in its path, solid tile or object (item stack, expando box, crew), and acts
// only on that object: whatever sits in a beam shields everything behind it, which is what item-logic builds rely on.
function pusherBeam(t){pusherSettings(t);const d=pusherDirection(t),reach=Math.min(t.maxBeam||PUSHER_MAX_BEAM,Math.max(bounds.r-bounds.l,bounds.b-bounds.t)+2),from=V(t.x,t.y),to=V(t.x+d.x*reach,t.y+d.y*reach);let wall=1,first=null,firstFrac=1;
 inside.rayCast(from,to,(f,pt,n,frac)=>{if(f===t.f||f.isSensor())return -1;const body=f.getBody();
  if(body===interior){if(beamPasses(f,pt,d))return -1;if(frac<wall)wall=frac;return frac;}
  if(body.getType()==='dynamic'){if(frac<firstFrac){firstFrac=frac;first=body;}return frac;}return -1;});
 if(first&&firstFrac<wall)return {d,length:firstFrac*reach,bodies:[first]};
 return {d,length:wall*reach,bodies:[]};}
function tickPushers(dt){for(const t of terrain.values()){if(t.type!=='pusher_block')continue;const {d,length,bodies}=pusherBeam(t);t.beam=length;const hit=bodies[0],mode=hit?pusherModeFor(t,hit):t.mode;t.beamMode=mode;if(!hit||mode==='off')continue;
 const sign=mode==='pull'?-1:1,target=t.speed||PUSHER_SPEED,p=hit.getPosition();
 if(mode==='pull'&&Math.abs((p.x-t.x)*d.x+(p.y-t.y)*d.y)<1.25){const v=hit.getLinearVelocity(),along=v.x*d.x+v.y*d.y;if(along<0)hit.setLinearVelocity(V(v.x-along*d.x,v.y-along*d.y));continue;}
 const v=hit.getLinearVelocity(),along=(v.x*d.x+v.y*d.y)*sign;if(along>=target)continue;wakeCargo(hit);const m=hit.getMass()*Math.min(target-along,PUSHER_ACCEL*dt)*sign;hit.applyLinearImpulse(V(d.x*m,d.y*m),hit.getWorldCenter(),true);}}
// Item loader (ℵ33, Oct 2019 — "load/unload items from machines and boxes", "same filters as cargo hatches",
// "will fill turrets more slowly"). A 1×1 background machine: each cycle it takes one stack from the tile
// behind it and delivers it to the tile in front (R rotates; 0 = moving right). Sources: loose items, expando
// boxes. Destinations: fabricators (as material), expando boxes, turrets (ammo), ejectors, or the floor.
// If the destination is full the loader holds the stack and retries. Cycle times are PLACEHOLDERS.
const LOADER_CYCLE=1.5,LOADER_TURRET_CYCLE=6;
function loaderEnds(t){const d=pusherDirection(t);return {d,input:{x:t.x-d.x,y:t.y-d.y},output:{x:t.x+d.x,y:t.y+d.y}};}
// Loaders reach through walkways: when the input tile is a walkway (or walkway wedge / item net), they also
// grab from the tile beyond it, and from items resting on top of the walkway.
const LOADER_REACHES_THROUGH=['walkway','walkway_wedge','net'];
function loaderInputCells(t,c){const {d}=loaderEnds(t),cells=[c];let q=c;for(let n=0;n<4;n++){const there=terrainAt(q);if(!there||!LOADER_REACHES_THROUGH.includes(there.type))break;q={x:q.x-d.x,y:q.y-d.y};cells.push(q);}return cells;}
// Pickup hotbox: the area just behind the loader's input face, a little larger than one tile. Anything in it is
// taken, whether resting there, thrown against the loader or falling through mid-air.
const LOADER_HOTBOX={near:.4,far:1.8,half:.8};
function inLoaderHotbox(t,p){const d=pusherDirection(t),rx=p.x-t.x,ry=p.y-t.y,back=-(rx*d.x+ry*d.y),side=Math.abs(rx*d.y-ry*d.x);return back>LOADER_HOTBOX.near&&back<LOADER_HOTBOX.far&&side<LOADER_HOTBOX.half;}
function loaderTake(t,c){
 const src=terrainAt(c);if(src?.type==='recycler'&&src.output?.length){const st=src.output.find(x=>hatchAllows(t,x.type));if(st){src.output.splice(src.output.indexOf(st),1);return {type:st.type,count:st.count};}}
 const cells=loaderInputCells(t,c),near=(p,q)=>{const walk=LOADER_REACHES_THROUGH.includes(terrainAt(q)?.type);return Math.abs(p.x-q.x)<.6&&p.y-q.y<.6&&q.y-p.y<(walk?1.1:.6);};
 const pool=loaderItemGrid?nearbyItems(t,cells):items;
 const item=pool.find(i=>{const p=i.body.getPosition();return (inLoaderHotbox(t,p)||cells.some(q=>near(p,q)))&&i.intakeFrom!==key(t.x,t.y)&&hatchAllows(t,i.type)&&!cargoWakeLocks.get(i.body)?.size;});
 if(item){item.taken=true;inside.destroyBody(item.body);items.splice(items.indexOf(item),1);return {type:item.type,count:item.count};}
 const box=cells.map(q=>boxAt(V(q.x,q.y))).find(Boolean);if(box){const type=TYPES.find(k=>(box.materials[k]||0)>0&&hatchAllows(t,k));if(type){const count=Math.min(stackLimit(type),box.materials[type]);box.materials[type]-=count;resizeBox(box);return {type,count};}}
 return null;}
function loaderGive(t,c,stack,d){
 // A loader facing into a recycler feeds it one stack per cycle (while it isn't busy). Anything the object it faces
 // can never take (a recycler: what can't be recycled; a fabricator: anything but its ingredients; a turret: anything
 // but its ammo; a thruster: anything but fuel or explosives) is refused (t.refused) and the loader drops it; when the
 // object only can't take it yet (busy, full), the loader waits holding it.
 t.refused=false;const refuse=()=>{t.refused=true;return 0;};
 const hit=terrainAt(c),rec=hit?.type==='recycler'?hit:null;
 if(rec){if(!recycleYield(stack.type,stack.count))return refuse();return startRecycle(rec,stack.type,stack.count)?stack.count:0;}
 const fab=hit?.type==='fabricator'?hit:null;
 if(fab){if(!fabIngredients(fab).has(stack.type))return refuse();if(!canStore(fab,stack.type))return 0;const n=Math.min(stack.count,64-(fab.materials[stack.type]||0));fab.materials[stack.type]=(fab.materials[stack.type]||0)+n;return n;}
 const box=boxAt(V(c.x,c.y));if(box){const room=256-Object.values(box.materials).reduce((a,b)=>a+b,0),n=Math.min(stack.count,room);if(n<=0)return 0;box.materials[stack.type]=(box.materials[stack.type]||0)+n;if(!resizeBox(box)){box.materials[stack.type]-=n;return 0;}return n;}
 const m=mountHit(c);
 if(m?.type==='turret'){if(!isAmmo(stack.type)||(m.ammo&&(m.ammoType||'ammo')!==stack.type))return refuse();const n=Math.min(stack.count,turretCapacity(m)-(m.ammo||0));if(n>0){m.ammoType=stack.type;m.ammo=(m.ammo||0)+n;t.cooldown=LOADER_TURRET_CYCLE;}return n;}
 if(m?.type==='ejector')return launchCargo(m,stack.type,stack.count)?stack.count:0;
 if(m?.type==='thruster'){if(!['fuel','explosives'].includes(stack.type))return refuse();const tank=stack.type==='fuel'?'fuelItems':'explosiveItems',n=Math.min(stack.count,THRUSTER_TANK-(m[tank]||0));if(n>0)m[tank]=(m[tank]||0)+n;return Math.max(0,n);}
 // Floor: an open interior cell with no solid tile and no stack already sitting there.
 if(t.requireOutput||!interiorCell(c)||blocks.has(key(c.x,c.y)))return 0;const there=terrainAt(c);if(there&&['wedge','glass','net','fabricator','loader','pusher_block','walkway_wedge'].includes(there.type))return 0;
 if(items.some(i=>{const p=i.body.getPosition();return Math.abs(p.x-c.x)<.7&&Math.abs(p.y-c.y)<.7;}))return 0;
 // Dropped, not thrown: the stack is left resting on the tile the loader faces.
 spawnItem(stack.type,V(c.x,c.y),V(0,0),stack.count).intakeFrom=key(t.x,t.y);return stack.count;}
// A refused stack is dropped where the hand is: on the tile it faces when that's open (a machine's tiles are — crew
// and items pass through machines), otherwise back on its input side. Either way this loader won't pick it up again.
// A loader set to Require output inventory never drops anything: it keeps holding the stack.
function loaderDrop(t,stack,output,input){const open=c=>interiorCell(c)&&!blocks.has(key(c.x,c.y))&&!mountHit(c)&&!['wedge','glass','net','loader','pusher_block','walkway_wedge','hatch','starter_hatch','door'].includes(terrainAt(c)?.type);
 const c=open(output)?output:open(input)?input:null;if(!c)return false;spawnItem(stack.type,V(c.x,c.y),V(0,0),stack.count).intakeFrom=key(t.x,t.y);return true;}
// What a fabricator accepts from a loader: only the ingredients of recipes its kind can make (iron, explosives,
// flux…), never finished items.
function fabIngredients(f){const set=new Set();for(const r of FABRICATORS[fabKind(f)].recipes)for(const m of Object.keys(recipeNeeds(r)||{}))set.add(m);return set;}
// Loose items bucketed by 2×2-tile cell once per tick, so each loader only looks at items near its input instead of
// every item aboard (hundreds of loaders × hundreds of items was most of a big ship's tick).
let loaderItemGrid=null;
const gridKey=(gx,gy)=>(gx+32768)*65536+(gy+32768);
function nearbyItems(t,cells){let out=null;const add=(x,y)=>{const x0=Math.floor((x-2.5)/2),x1=Math.floor((x+2.5)/2),y0=Math.floor((y-2.5)/2),y1=Math.floor((y+2.5)/2);for(let gx=x0;gx<=x1;gx++)for(let gy=y0;gy<=y1;gy++){const b=loaderItemGrid.get(gridKey(gx,gy));if(b)for(const i of b)(out??=new Set()).add(i);}};
 add(t.x,t.y);for(const c of cells)add(c.x,c.y);if(!out)return [];const r=[];for(const i of out)if(!i.taken)r.push(i);return r;}
function tickLoaders(dt){loaderItemGrid=new Map();for(const i of items){const p=i.body.getPosition(),k=gridKey(Math.floor(p.x/2),Math.floor(p.y/2));let b=loaderItemGrid.get(k);if(!b)loaderItemGrid.set(k,b=[]);b.push(i);}try{tickLoadersNow(dt);}finally{loaderItemGrid=null;}}
// The loader's swing is its cooldown: the hand grabs a stack on the input side, carries it across (half a cycle),
// delivers only when it arrives (waiting there if the target is full), then swings back empty (the other half) before
// it can grab again — so what you see is exactly when it can act. phase: 0 = hand at the input, 1 = at the output.
// A turret delivery adds the turret's own loading wait (LOADER_TURRET_CYCLE) before the next grab.
function tickLoadersNow(dt){const half=LOADER_CYCLE/2;for(const t of terrain.values()){if(t.type!=='loader')continue;t.cooldown=Math.max(0,(t.cooldown??0)-dt);t.cargo??=[];t.phase??=0;
 if(!t.swing)t.swing=t.cargo.length?'carry':(t.phase>0?'return':'idle');
 if(t.swing==='return'){t.phase=Math.max(0,t.phase-dt/half);if(t.phase===0&&t.cooldown===0)t.swing='idle';else continue;}
 if(t.filterMode==='off'&&t.swing==='idle')continue;
 const {d,input,output}=loaderEnds(t);
 // Idle: the empty hand grabs from its hotbox every tick, so thrown or falling items are caught as they pass.
 if(t.swing==='idle'){const got=loaderTake(t,input);if(!got)continue;t.cargo.push(got);t.swing='carry';}
 if(t.swing==='carry'){if(t.phase<1){t.phase=Math.min(1,t.phase+dt/half);if(t.phase<1)continue;}
  const stack=t.cargo[0];if(!stack){t.swing='return';continue;}const n=loaderGive(t,output,stack,d);if(n>0){stack.count-=n;if(stack.count<=0)t.cargo.shift();t.flash=clock+.25;}
  else if(t.refused&&!t.requireOutput&&loaderDrop(t,stack,output,input))t.cargo.shift();
  if(!t.cargo.length)t.swing='return';}}}

// ---- Recyclers -------------------------------------------------------------------------------------------------------
// Loaded by clicking it with a stack in hand or by a loader facing into it (never by throwing things in). It works on
// one stack for RECYCLE_SECONDS, then drops half of what that stack cost (RECYCLE_RETURN) from its bottom-right
// corner, where a loader or pusher can take it away. Fractions carry over, so small stacks of ammo still add up.
// Starter items, raw resources and anything without a recipe are refused; trash ammo is simply eaten.
function recycleYield(type,count){if(RECYCLE_SWAP[type])return {[RECYCLE_SWAP[type]]:count};if(STARTER_ITEMS.includes(type)||type==='fab_starter')return null;if(FREE_RECIPES.includes(type))return {};const need=recipeNeeds(type);if(!need)return null;const per=RECIPE_YIELD[type]||1,out={};for(const [m,n] of Object.entries(need))out[m]=n*count/per*RECYCLE_RETURN;return out;}
function startRecycle(f,type,count){if(f.job||!recycleYield(type,count))return false;f.job={type,count,left:RECYCLE_SECONDS};f.busy=clock+RECYCLE_SECONDS;f.lastOut='';actionEffect(f.x+1,f.y+1,'red',count+' x '+NAMES[type]);return true;}
function finishRecycle(f){const {type,count}=f.job;f.job=null;const y=recycleYield(type,count)||{};f.credit=f.credit||{};const out=[];for(const [m,n] of Object.entries(y)){f.credit[m]=(f.credit[m]||0)+n;const whole=Math.floor(f.credit[m]+1e-9);if(whole>0){f.credit[m]-=whole;out.push([m,whole]);}}
 // A loader facing out of this recycler takes the resources straight from it; otherwise they are dropped (not
 // thrown) on the floor beside it, on whichever side is open.
 const stacks=[];for(const [m,k] of out){let left=k;while(left>0){const c=Math.min(stackLimit(m),left);stacks.push({type:m,count:c});left-=c;}}
 const unloaded=[...terrain.values()].some(l=>l.type==='loader'&&terrainAt(loaderEnds(l).input)===f);
 if(unloaded){f.output=(f.output||[]).concat(stacks);while(f.output.length>8)dropRecycled(f,f.output.shift());}else for(const st of stacks)dropRecycled(f,st);
 f.lastOut=out.length?out.map(([m,k])=>k+' '+NAMES[m]).join(', '):'(nothing left)';f.busy=clock+1.5;}
function dropRecycled(f,st){const [w,h]=MACHINE_SIZE.recycler,y=f.y+h-1,open=x=>interiorCell({x:Math.round(x),y:Math.round(y)})&&!blocks.has(key(Math.round(x),Math.round(y)))&&!(terrainAt({x:Math.round(x),y:Math.round(y)})&&solidCell(Math.round(x),Math.round(y)));const right=f.x+w-.5+.4,left=f.x-.5-.4;spawnItem(st.type,V(open(right)||!open(left)?right:left,y),V(0,0),st.count);}
function tickRecyclers(dt){for(const f of terrain.values()){if(f.type!=='recycler'||!f.job)continue;f.job.left-=dt;f.busy=clock+Math.max(f.job.left,0)+.05;if(f.job.left<=0)finishRecycle(f);}}
// Clicking a recycler with an item in hand loads the whole stack.
function recycleCarried(f){if(P.Vec2.distance(localPlayer(),V(f.x+1,f.y+1.5))>4)return toast('Move closer to the recycler.');const t=slots[selected],n=stackCounts[selected];if(!t||!n)return toast('Click the recycler with the stack you want to recycle in your hand.');if(f.job)return toast('The recycler is still working.');if(!recycleYield(t,n))return toast(NAMES[t]+' can\'t be recycled.');startRecycle(f,t,n);stackCounts[selected]=0;slots[selected]=null;selectSlot(selected);save(true);}

// ---- Trash ammo decays (ℵ23: "It will decay in item form and in expando-boxes") ------------------------------------
function tickTrashDecay(dt){const life=AMMO.trash.itemDecay||45;for(const i of [...items])if(i.type==='trash'&&Math.random()<dt/life){i.count--;if(i.count<=0){inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}}for(const b of boxes)if(b.materials.trash>0&&Math.random()<dt*Math.min(16,b.materials.trash)/life/4)b.materials.trash--;}

// ---- Comms stations and spawn points ----------------------------------------------------------------------------------
function nearComms(p=localPlayer()){return [...terrain.values()].find(t=>t.type==='comms'&&P.Vec2.distance(p,V(t.x,t.y+.5))<COMMS_RANGE);}
// ℵ14: a joining player appears at a random spawn point set exactly to their rank.
function spawnPointFor(rank){const list=[...terrain.values()].filter(t=>t.type==='spawn'&&(t.access||'crew')===rank);return list.length?list[Math.floor(Math.random()*list.length)]:null;}
function setSpawnRank(t,rank){if(!t||t.type!=='spawn'||!SPAWN_RANKS.includes(rank))return false;t.access=rank;return true;}
// ℵ34 Freeport anchor: while one is aboard, the ship can't leave a safe zone through a portal.
function anchored(){return zoneDef().kind==='safe'&&[...terrain.values()].some(t=>t.type==='anchor');}
