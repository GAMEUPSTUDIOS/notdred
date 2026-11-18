'use strict';
function canStore(f,t){return (f.materials[t]||0)>0||Object.values(f.materials).filter(n=>n>0).length<3}

function transferMaterial(type,eject=false){if(!activeFab||!TYPES.includes(type))return;const mat=activeFab.materials;if(eject){const count=Math.min(stackLimit(type),mat[type]||0);scatter(type,count,V(activeFab.x-1.2,activeFab.y+1),key(activeFab.x,activeFab.y));mat[type]-=count;}else {if(!canStore(activeFab,type))return toast('All three fabricator bins are occupied. Eject a bin first.');const n=Math.min(inventory[type],64-(mat[type]||0));inventory[type]-=n;mat[type]=(mat[type]||0)+n;}renderRecipes();save(true)}

function clearQueue(){if(!activeFab)return;activeFab.queue=[];if(activeFab.job){for(const [m,n] of Object.entries(recipeNeeds(activeFab.job.type)||{}))inventory[m]+=n;activeFab.job=null}renderRecipes();save(true)}

function craft(t,count=1){const f=activeFab||nearFab();if(!f||!recipeNeeds(t)||piloting)return false;if(!FABRICATORS[fabKind(f)].recipes.includes(t)){toast('A '+FABRICATORS[fabKind(f)].name+' cannot make '+NAMES[t]+'.');return false;}if(f.queue.length+count>32){toast('Queue limit: 32.');return false}for(let i=0;i<count;i++)f.queue.push(t);if(activeFab)renderRecipes();save(true);return true}

function tickFabricators(dt){for(const f of terrain.values()){if(f.type!=='fabricator')continue;for(const item of [...items]){const p=item.body.getPosition();if(item.intakeFrom!==key(f.x,f.y)&&p.x>f.x-.45&&p.x<f.x+1.45&&p.y>f.y-.45&&p.y<f.y+2.45&&canStore(f,item.type)&&(f.materials[item.type]||0)<64){const n=Math.min(item.count,64-(f.materials[item.type]||0));f.materials[item.type]=(f.materials[item.type]||0)+n;item.count-=n;if(!item.count){inside.destroyBody(item.body);items.splice(items.indexOf(item),1);}}}f.queue=f.queue.filter(t=>recipeNeeds(t));if(f.job&&!recipeNeeds(f.job.type)){f.materials.iron=(f.materials.iron||0)+12;f.job=null;}if(!f.job&&f.queue.length){const t=f.queue[0];const need=Object.entries(recipeNeeds(t));if(need.every(([m,n])=>(f.materials[m]||0)>=n)){for(const [m,n] of need)f.materials[m]-=n;f.queue.shift();f.job={type:t,progress:0}}}if(f.job){f.job.progress=Math.min((DURATION[f.job.type]||2),f.job.progress+dt);if(f.job.progress>=(DURATION[f.job.type]||2)){const q=V(f.x-.9,f.y+1.5);const blocked=q.x<bounds.l+.85||[...blocks.values(),...[...terrain.values()].filter(t=>t.type==='net')].some(t=>Math.abs(t.x-q.x)<.85&&Math.abs(t.y-q.y)<.85)||items.filter(i=>P.Vec2.distance(i.body.getPosition(),q)<1).length>=4;if(!blocked){spawnItem(f.job.type,q,V(-1,-1),RECIPE_YIELD[f.job.type]||1).intakeFrom=key(f.x,f.y);effects.push({x:q.x,y:q.y,w:1,h:1,life:.3,color:'green',kind:'craft'});if(f.repeat&&f.queue.length<32)f.queue.push(f.job.type);f.job=null}}}}uiTimer+=dt;if(uiTimer>.2&&el('craft').open){uiTimer=0;renderRecipes()}}

function loadThruster(c,type){if(piloting)return toast('Leave the helm to load a thruster.');const m=mountHit(c);if(!m||m.type!=='thruster')return toast('Click a normal three-tile thruster. Starter thrusters do not need fuel.');if(!inventory[type])return toast('No '+NAMES[type]+' available.');inventory[type]--;const tank=type==='fuel'?'fuelItems':'explosiveItems';m[tank]=(m[tank]||0)+1;save(true);toast('Loaded '+NAMES[type]+'. Fuel: '+(m.fuelItems||0)+' / Explosives: '+(m.explosiveItems||0));}

function burn(m,dt,power){if(m.type==='starter')return 900;if((m.burnRemaining||0)<=0){if(m.fuelItems>0){m.fuelItems--;m.burnKind='fuel';m.burnRemaining=120}else if(m.explosiveItems>0){m.explosiveItems--;m.burnKind='explosives';m.burnRemaining=60}else return 0}const used=Math.min(m.burnRemaining,dt*power);m.burnRemaining-=used;return (m.burnKind==='fuel'?1600:1100)*(used/(dt*power));}

function tickShredders(){for(const t of terrain.values()){if(t.type!=='shredder')continue;for(const i of [...items]){const q=i.body.getPosition();if(Math.abs(q.x-t.x)<.49&&Math.abs(q.y-t.y)<.49){inside.destroyBody(i.body);items.splice(items.indexOf(i),1);t.chewing=clock+.5;actionEffect(t.x,t.y,'red',i.count+' x '+NAMES[i.type],V(t.x,t.y));}}}}

function hatchOutput(t){const a=(t.rotation||0)*Math.PI/2;return V(t.x-Math.sin(a)*.95,t.y+Math.cos(a)*.95);}

function ejectorExit(t){if(t.type!=='ejector'||!t.side)return null;const dir=inward(t).clone().neg(),q=mountPoint(t);return {dir,p:V(q.x+dir.x*3.2,q.y+dir.y*3.2)};}

function launchCargo(t,type,count){const port=ejectorExit(t);if(!port)return false;const p=ship.getWorldPoint(port.p);let blocked=false;world.queryAABB(new P.AABB(V(p.x-2,p.y-2),V(p.x+2,p.y+2)),f=>{if(f.getBody()!==ship&&!f.isSensor()&&f.getBody().getType()==='static')blocked=true;return true;});if(blocked){toast('Ejector outlet blocked. Move the ship.');return false;}const v=ship.getLinearVelocity();const loot=addWorldLoot(type,p,count,V(v.x+port.dir.x*12,v.y+port.dir.y*12));loot.body.setAngularVelocity((terrainHash(clock,count)-.5)*4);loot.grace=2;t.flash=clock+.2;t.cooldown=.4;return true;}

function ejectCarried(t){if(P.Vec2.distance(localPlayer(),mountPoint(t))>5||buildBlocked(mountPoint(t)))return toast('Move closer with a clear path to the ejector.');if(!slots[selected]||!stackCounts[selected])return toast('Hold an item stack and click the ejector.');const type=slots[selected],count=stackCounts[selected];if(launchCargo(t,type,count)){takeItem(type,count);save(true);toast('Ejected '+count+' '+NAMES[type]+'.');}}

function tickEjectors(dt){for(const t of mounts){if(t.type!=='ejector')continue;t.cooldown=Math.max(0,(t.cooldown||0)-dt);if(t.cooldown>0)continue;const p=mountPoint(t),n=inward(t),q=V(p.x+n.x*1.1,p.y+n.y*1.1);const i=items.find(i=>P.Vec2.distance(i.body.getPosition(),q)<.8);if(i&&launchCargo(t,i.type,i.count)){inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}}}

function lootReachable(i){let blocked=false;world.rayCast(i.body.getPosition(),ship.getPosition(),f=>{if(f.getBody()!==ship&&f.getBody().getType()==='static'){blocked=true;return 0;}return 1;});return !blocked;}

function ejectTurretAmmo(m){if(piloting||P.Vec2.distance(localPlayer(),mountPoint(m))>8||buildBlocked(mountPoint(m)))return toast('Move closer with a clear path to the turret.');if(!m.ammo)return toast('Turret is empty.');const p=mountPoint(m),n=inward(m),t=V(-n.y,n.x);let output=null;for(const offset of [0,-.8,.8]){const q=V(p.x+n.x*1.35+t.x*offset,p.y+n.y*1.35+t.y*offset);if(q.x<bounds.l+.85||q.x>bounds.r-.85||q.y<bounds.t+.85||q.y>bounds.b-.85)continue;let blocked=false;inside.queryAABB(new P.AABB(V(q.x-.35,q.y-.35),V(q.x+.35,q.y+.35)),f=>{if(f.getBody()!==player&&(f.getFilterMaskBits()&8)&&!f.isSensor())blocked=true;return true;});if(!blocked){output=q;break;}}if(!output)return toast('Clear the turret’s interior outlet before ejecting ammo.');const count=m.ammo;spawnItem(m.ammoType||'ammo',output,V(n.x*.5,n.y*.5),count);m.ammo=0;save(true);toast('Ejected '+count+' ammo.');return true;}

function hatchClear(t){const q=hatchOutput(t);if(q.x<bounds.l+.85||q.x>bounds.r-.85||q.y<bounds.t+.85||q.y>bounds.b-.85)return false;let clear=true;inside.queryAABB(new P.AABB(V(q.x-.34,q.y-.34),V(q.x+.34,q.y+.34)),f=>{if(!f.isSensor()&&f.getBody()!==player){clear=false;return false;}return true;});return clear;}

// Takes the nearest allowed loose world item near a hatch (on a server, from the shared zone).
function claimWorldLoot(hp,allow){const i=worldLoot.find(i=>allow(i.type)&&(i.grace||0)<=0&&P.Vec2.distance(i.body.getPosition(),hp)<9&&lootReachable(i));if(!i)return null;world.destroyBody(i.body);worldLoot.splice(worldLoot.indexOf(i),1);return {type:i.type,count:i.count};}
function tickHatches(dt){const hatches=[...terrain.values()].filter(t=>['hatch','starter_hatch'].includes(t.type));for(const t of hatches){t.outputTimer=Math.max(0,(t.outputTimer||0)-dt);if(t.outputTimer>0||t.filterMode==='off'||!hatchClear(t))continue;const queued=t.cargo?.findIndex(i=>hatchAllows(t,i.type));let cargo=queued>=0?t.cargo.splice(queued,1)[0]:null;if(!cargo){cargo=claimWorldLoot(ship.getWorldPoint(V(t.x,t.y)),type=>hatchAllows(t,type));if(!cargo)continue;}spawnItem(cargo.type,hatchOutput(t),V(0,0),cargo.count);t.outputTimer=1.5;}}

// ℵ30 stationary pusher. Its beam runs from the pusher in the facing direction (R rotates; 0 = right) with no
// length limit: it passes through loose cargo, crew and every tile that lets a beam through (walkways, walkway
// wedges, glass, item nets, ladders, hatches) and stops at the first solid tile — a block, wedge, hull,
// fabricator, loader or another pusher. Every loose item, expando box and crew member in the beam is driven toward
// PUSHER_SPEED. Speed/accel are PLACEHOLDERS.
const PUSHER_SPEED=10,PUSHER_ACCEL=60,BEAM_PASSES=['walkway','walkway_wedge','glass','net','ladder','hatch','starter_hatch'];
function pusherDirection(t){const a=(t.rotation||0)*Math.PI/2;return V(Math.round(Math.cos(a)),Math.round(Math.sin(a)));}
// Push or pull (right-click), with the same item filter as hatches. The pusher block itself is solid; its beam is
// cast from its centre, ignoring its own shape. Pulled cargo stops a tile short of the pusher instead of grinding into it.
function pusherTarget(body){const item=items.find(i=>i.body===body);if(item)return {kind:'item',type:item.type};if(boxes.some(b=>b.body===body))return {kind:'box'};return {kind:'crew'};}
function pusherAllows(t,body){if((t.filterMode||'all')==='off')return false;const target=pusherTarget(body);if(target.kind==='item')return hatchAllows(t,target.type);return (t.filterMode||'all')!=='whitelist';}
// Does this interior fixture let a beam through? Walkways (category 4) and nets (16) are recognised by their
// collision category; glass shares the solid category, so the tile just past the hit point is looked up.
function beamPasses(f,pt,d){const cat=f.getFilterCategoryBits();if(cat===4||cat===16)return true;const c={x:Math.round(pt.x+d.x*.05),y:Math.round(pt.y+d.y*.05)};if(blocks.has(key(c.x,c.y)))return false;const t=terrainAt(c);return !!t&&BEAM_PASSES.includes(t.type);}
function pusherBeam(t){const d=pusherDirection(t),reach=Math.max(bounds.r-bounds.l,bounds.b-bounds.t)+2,from=V(t.x,t.y),to=V(t.x+d.x*reach,t.y+d.y*reach);let wall=1;const hits=[];
 inside.rayCast(from,to,(f,pt,n,frac)=>{if(f===t.f||f.isSensor())return -1;const body=f.getBody();
  if(body===interior){if(beamPasses(f,pt,d))return -1;if(frac<wall)wall=frac;return frac;}
  if(body.getType()==='dynamic')hits.push({body,frac});return -1;});
 const seen=new Set(),bodies=[];for(const h of hits.sort((a,b)=>a.frac-b.frac))if(h.frac<wall&&!seen.has(h.body)){seen.add(h.body);bodies.push(h.body);}
 return {d,length:wall*reach,bodies};}
function tickPushers(dt){for(const t of terrain.values()){if(t.type!=='pusher_block')continue;const {d,length,bodies}=pusherBeam(t);t.beam=length;const sign=t.pull?-1:1;
 for(const hit of bodies){if(!pusherAllows(t,hit))continue;const p=hit.getPosition();
  if(t.pull&&Math.abs((p.x-t.x)*d.x+(p.y-t.y)*d.y)<1.25){const v=hit.getLinearVelocity(),along=v.x*d.x+v.y*d.y;if(along<0)hit.setLinearVelocity(V(v.x-along*d.x,v.y-along*d.y));continue;}
  const v=hit.getLinearVelocity(),along=(v.x*d.x+v.y*d.y)*sign;if(along>=PUSHER_SPEED)continue;wakeCargo(hit);const m=hit.getMass()*Math.min(PUSHER_SPEED-along,PUSHER_ACCEL*dt)*sign;hit.applyLinearImpulse(V(d.x*m,d.y*m),hit.getWorldCenter(),true);}}}
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
 const cells=loaderInputCells(t,c),near=(p,q)=>{const walk=LOADER_REACHES_THROUGH.includes(terrainAt(q)?.type);return Math.abs(p.x-q.x)<.6&&p.y-q.y<.6&&q.y-p.y<(walk?1.1:.6);};
 const item=items.find(i=>{const p=i.body.getPosition();return (inLoaderHotbox(t,p)||cells.some(q=>near(p,q)))&&i.intakeFrom!==key(t.x,t.y)&&hatchAllows(t,i.type)&&!cargoWakeLocks.get(i.body)?.size;});
 if(item){inside.destroyBody(item.body);items.splice(items.indexOf(item),1);return {type:item.type,count:item.count};}
 const box=cells.map(q=>boxAt(V(q.x,q.y))).find(Boolean);if(box){const type=TYPES.find(k=>(box.materials[k]||0)>0&&hatchAllows(t,k));if(type){const count=Math.min(stackLimit(type),box.materials[type]);box.materials[type]-=count;resizeBox(box);return {type,count};}}
 return null;}
function loaderGive(t,c,stack,d){
 const fab=[...terrain.values()].find(f=>f.type==='fabricator'&&terrainCells(f).some(q=>q.x===c.x&&q.y===c.y));
 if(fab){if(!fabIngredients(fab).has(stack.type)||!canStore(fab,stack.type))return 0;const n=Math.min(stack.count,64-(fab.materials[stack.type]||0));fab.materials[stack.type]=(fab.materials[stack.type]||0)+n;return n;}
 const box=boxAt(V(c.x,c.y));if(box){const room=256-Object.values(box.materials).reduce((a,b)=>a+b,0),n=Math.min(stack.count,room);if(n<=0)return 0;box.materials[stack.type]=(box.materials[stack.type]||0)+n;if(!resizeBox(box)){box.materials[stack.type]-=n;return 0;}return n;}
 const m=mountHit(c);
 if(m?.type==='turret'){if(!isAmmo(stack.type)||(m.ammo&&(m.ammoType||'ammo')!==stack.type))return 0;const n=Math.min(stack.count,turretCapacity(m)-(m.ammo||0));if(n>0){m.ammoType=stack.type;m.ammo=(m.ammo||0)+n;t.cooldown=LOADER_TURRET_CYCLE;}return n;}
 if(m?.type==='ejector')return launchCargo(m,stack.type,stack.count)?stack.count:0;
 // Floor: an open interior cell with no solid tile and no stack already sitting there.
 if(t.requireOutput||!interiorCell(c)||blocks.has(key(c.x,c.y)))return 0;const there=terrainAt(c);if(there&&['wedge','glass','net','fabricator','loader','pusher_block','walkway_wedge'].includes(there.type))return 0;
 if(items.some(i=>{const p=i.body.getPosition();return Math.abs(p.x-c.x)<.7&&Math.abs(p.y-c.y)<.7;}))return 0;
 // Dropped, not thrown: the stack is left resting on the tile the loader faces.
 spawnItem(stack.type,V(c.x,c.y),V(0,0),stack.count).intakeFrom=key(t.x,t.y);return stack.count;}
// What a fabricator accepts from a loader: only the ingredients of recipes its kind can make (iron, explosives,
// flux…), never finished items.
function fabIngredients(f){const set=new Set();for(const r of FABRICATORS[fabKind(f)].recipes)for(const m of Object.keys(recipeNeeds(r)||{}))set.add(m);return set;}
function tickLoaders(dt){for(const t of terrain.values()){if(t.type!=='loader')continue;t.phase=Math.min(1,(t.phase||0)+dt/LOADER_CYCLE);t.cooldown=Math.max(0,(t.cooldown??0)-dt);if(t.filterMode==='off')continue;
 const {d,input,output}=loaderEnds(t);t.cargo??=[];
 // An empty loader grabs from its hotbox every tick, so thrown or falling items are caught as they pass; delivery
 // still happens once per cycle.
 if(!t.cargo.length){const got=loaderTake(t,input);if(got){t.cargo.push(got);t.phase=0;}}
 if(t.cooldown>0)continue;
 if(t.cargo.length){const stack=t.cargo[0],n=loaderGive(t,output,stack,d);if(n>0){stack.count-=n;if(stack.count<=0)t.cargo.shift();t.flash=clock+.25;}}
 t.cooldown=Math.max(t.cooldown,LOADER_CYCLE);}}
