'use strict';
function spawnItem(type,p,velocity=V(0,0),count=1){const body=inside.createDynamicBody({position:V(p.x,p.y),bullet:true,angularDamping:3});body.createFixture(P.Box(.32,.32),{density:3,friction:.8,restitution:.08,filterCategoryBits:8,filterMaskBits:1|2|8|16|256|512});body.setLinearVelocity(velocity);const item={type,body,count:Math.min(stackLimit(type),count)};items.push(item);return item}

function stackLimit(type){return ['wrench','fabricator','thruster','turret','turret_burst','turret_auto','turret_controller','starter_rc','starter','storage','shredder','shredder_gold','pusher','repair','pusher_block','fab_starter','fab_machine','fab_engineering','fab_munitions','loader','recycler','anchor','comms','spawn'].includes(type)?1:16}

function makeInventory(){return new Proxy(Object.fromEntries(TYPES.map(t=>[t,0])),{get(o,t){return TYPES.includes(t)?carried(t):o[t]},set(o,t,value){if(!TYPES.includes(t)){o[t]=value;return true}const delta=value-carried(t);if(delta>0)giveItem(t,delta);else if(delta<0)takeItem(t,-delta);return true},ownKeys(){return TYPES},getOwnPropertyDescriptor(){return {enumerable:true,configurable:true}}})}

function takeItem(type,count){for(const i of [selected,...[0,1,2,3,4].filter(i=>i!==selected)])if(slots[i]===type){const n=Math.min(count,stackCounts[i]);stackCounts[i]-=n;count-=n;if(!stackCounts[i])slots[i]=null;if(!count)break}selectSlot(selected)}

function scatter(type,count,p=localPlayer(),intakeFrom=null){while(count>0){const n=Math.min(stackLimit(type),count);const x=clamp(p.x+(items.length%5-2)*.3,bounds.l+.9,bounds.r-.9);spawnItem(type,V(x,clamp(p.y-.4,bounds.t+.9,bounds.b-.9)),V(0,0),n).intakeFrom=intakeFrom;count-=n}}

function giveItem(type,count){const added=addCarried(type,count);if(count>added)scatter(type,count-added);return added}

function moveStack(from,to,split=false){if(from===to||!slots[from])return;const t=slots[from],n=split?Math.ceil(stackCounts[from]/2):stackCounts[from];if(!slots[to]||slots[to]===t){const moved=Math.min(n,stackLimit(t)-stackCounts[to]);slots[to]=t;stackCounts[to]+=moved;stackCounts[from]-=moved;if(!stackCounts[from])slots[from]=null;}else if(!split){[slots[from],slots[to]]=[slots[to],slots[from]];[stackCounts[from],stackCounts[to]]=[stackCounts[to],stackCounts[from]];}selectSlot(to);save(true)}

function refund(type,p){/* into your hands; with no room it drops where the piece was */const added=addCarried(type,1);if(!added&&p)scatter(type,1,V(p.x,p.y+.4));else if(!added)scatter(type,1);}

function hoverItem(){if(!mouse.active)return null;const p=localMouse();return items.filter(i=>P.Vec2.distance(i.body.getPosition(),p)<.5).sort((a,b)=>P.Vec2.distance(a.body.getPosition(),p)-P.Vec2.distance(b.body.getPosition(),p))[0]||null}

function pickupAt(p){const i=items.find(i=>P.Vec2.distance(i.body.getPosition(),p)<.5);if(!i)return false;if(piloting||P.Vec2.distance(localPlayer(),i.body.getPosition())>3.5){toast('Move closer on foot to pick it up.');return true}/* reach: nets (items only) never block it; a block does; a walkway does too — unless the item is in that walkway's own tile */const ip=i.body.getPosition(),own=terrainAt({x:Math.round(ip.x),y:Math.round(ip.y)});let blocked=false;inside.rayCast(localPlayer(),ip,f=>{if(f.getBody()!==interior)return 1;const cat=f.getFilterCategoryBits();if(cat===1||(cat===4&&!(own&&own.f===f))){blocked=true;return 0}return 1});if(blocked){toast('Something solid is in the way.');return true}const n=addCarried(i.type,i.count||1);i.count-=n;if(i.count<=0){inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}else toast('Inventory full: drop a stack with Q.');save(true);return true}

function dropItem(split=false){const t=slots[selected];if(piloting||!t||!stackCounts[selected])return toast('Select a carried item while on foot.');const p=localPlayer(),aim=mouse.active?localMouse():V(p.x+facing,p.y-.3),dir=V(aim.x-p.x,aim.y-p.y);if(dir.length()<.01)dir.x=facing;dir.normalize();const candidates=[V(p.x+dir.x*.9,p.y+dir.y*.9),V(p.x-facing*.9,p.y-.3),V(p.x,p.y-.95),V(p.x,p.y)];const q=candidates.find(q=>q.x>bounds.l+.85&&q.x<bounds.r-.85&&q.y>bounds.t+.85&&q.y<bounds.b-.85&&![...blocks.values(),...[...terrain.values()].filter(t=>t.type==='net')].some(b=>Math.abs(b.x-q.x)<.85&&Math.abs(b.y-q.y)<.85));if(!q)return toast('Make room to drop the item.');const count=split?Math.ceil(stackCounts[selected]/2):stackCounts[selected];stackCounts[selected]-=count;if(!stackCounts[selected])slots[selected]=null;spawnItem(t,q,V(dir.x*5,dir.y*5),count);selectSlot(selected);save(true)}

function touching(a,b){for(let e=a.getContactList();e;e=e.next)if(e.other===b&&e.contact.isTouching())return true;return false}

/* growing=true (an expando box getting bigger): resting boxes sink a hair into what they sit on, so edges get a little
 slack, and players beside it are simply nudged aside by the physics — the one clicking it always stands right there */
function boxSpace(p,size,ignore=null,growing=false){const h=size/2,e=growing?.04:0;if(p.x-h<bounds.l+.5-e||p.x+h>bounds.r-.5+e||p.y-h<bounds.t+.5-e||p.y+h>bounds.b-.5+e)return false;if(!growing&&player&&Math.abs(localPlayer().x-p.x)<h+.24&&Math.abs(localPlayer().y-p.y)<h+.63)return false;/* solid tiles (doors and machines over all their tiles), the helm, and fixed machines are in the way too */const cellHit=(x,y)=>Math.abs(x-p.x)<h+.49-e&&Math.abs(y-p.y)<h+.49-e;
 if([...terrain.values()].some(t=>t.body?(()=>{const [w2,h2]=MACHINE_SIZE[t.type],q=t.body.getPosition();return Math.abs(q.x-p.x)<w2/2+h-e&&Math.abs(q.y-p.y)<h2/2+h-e;})():['wedge','walkway_wedge','glass','net','door','hatch','starter_hatch','pusher_block','paint','anchor','spawn'].includes(t.type)&&terrainCells(t).some(c=>cellHit(c.x,c.y))))return false;
 if(typeof helmCells==='function'&&helmCells().some(c=>cellHit(c.x,c.y)))return false;
 return ![...blocks.values()].some(t=>cellHit(t.x,t.y))&&!boxes.some(b=>b!==ignore&&Math.abs(b.body.getPosition().x-p.x)<(b.size+size)/2-e&&Math.abs(b.body.getPosition().y-p.y)<(b.size+size)/2-e)}

function spawnBox(p,materials={}){const count=Object.values(materials).reduce((a,b)=>a+b,0),size=2+Math.floor(count/64)*.25;const body=inside.createDynamicBody({position:p,angularDamping:5,linearDamping:.1,bullet:true});const box={body,size,materials:{...materials}};box.fixture=body.createFixture(P.Box(size/2,size/2),{density:.35,friction:.18,filterCategoryBits:8,filterMaskBits:1|2|8|16|256|512});boxes.push(box);return box}

// Expando boxes hold ONE item type, and grow (¼ tile per 64 items) evenly in every direction when there's room. A side
// that's blocked — the floor under it, a wall, a tile, another box or machine — makes it grow the other way instead:
// up off the floor, sideways away from a wall, or diagonally out of a corner. No room any way: it doesn't take the items.
function boxType(box){return Object.keys(box.materials).find(k=>box.materials[k]>0)||null;}
function boxAccepts(box,type){const t=boxType(box);return !t||t===type;}
function resizeBox(box){const total=Object.values(box.materials).reduce((a,b)=>a+b,0),size=2+Math.floor(total/64)*.25;if(size===box.size)return true;let pos=box.body.getPosition().clone();
 if(size>box.size){const d=(size-box.size)/2,ok=[[0,0],[0,-d],[d,0],[-d,0],[0,d],[d,-d],[-d,-d],[d,d],[-d,d]].map(([dx,dy])=>V(pos.x+dx,pos.y+dy)).find(q=>boxSpace(q,size,box,true));if(!ok)return false;pos=ok;}
 box.body.destroyFixture(box.fixture);box.size=size;box.fixture=box.body.createFixture(P.Box(size/2,size/2),{density:.35,friction:.18,filterCategoryBits:8,filterMaskBits:1|2|8|16|256|512});box.body.setTransform(pos,box.body.getAngle());box.body.setAwake(true);return true}

// Put up to n items of one type in a box. No fixed cap: it takes them as long as it can grow to fit; when it can't,
// it still fills the size it already is (a box grows a quarter tile per 64 items). Returns how many went in.
function boxInsert(box,type,n){if(n<=0||!boxAccepts(box,type))return 0;const total=Object.values(box.materials).reduce((a,v)=>a+v,0);box.materials[type]=(box.materials[type]||0)+n;if(resizeBox(box))return n;box.materials[type]-=n;
 const fits=Math.min(n,(Math.floor(total/64)+1)*64-1-total);if(fits<=0)return 0;box.materials[type]+=fits;if(resizeBox(box))return fits;box.materials[type]-=fits;return 0;}
// A box covering p, or (pad > 0) one whose edge comes within pad of it — loaders use this so a box that has slid a little
// off their output tile is still the one they fill.
function boxNear(p,pad){return boxAt(p)||boxes.find(b=>{const q=b.body.getLocalPoint(p);return Math.abs(q.x)<b.size/2+pad&&Math.abs(q.y)<b.size/2+pad})}
function boxAt(p){return boxes.find(b=>{const q=b.body.getLocalPoint(p);return Math.abs(q.x)<b.size/2&&Math.abs(q.y)<b.size/2})}

function useBox(p){const b=boxAt(p);if(!b)return false;if(piloting||P.Vec2.distance(localPlayer(),p)>3.5){toast('Move closer to the expando box.');return true}if(tool==='walk'||tool==='empty'){const t=TYPES.find(t=>b.materials[t]>0);if(t){const n=Math.min(stackLimit(t),b.materials[t]);scatter(t,n,V(p.x-b.size/2-.5,p.y));b.materials[t]-=n;resizeBox(b);}else toast('Empty expando box. Right-click with wrench to package it.');}else if(TYPES.includes(tool)){const t=tool;if(!boxAccepts(b,t)){toast('This expando box holds '+NAMES[boxType(b)]+'. One item type per box — empty it first.');return true;}const n=boxInsert(b,t,inventory[t]);if(n>0)inventory[t]-=n;if(n<inventory[t]+n&&inventory[t]>0)toast(n?'The box is full until it has room to grow ('+inventory[t]+' left in hand).':'Box needs more room to expand.');}save(true);return true}

function wakeCargo(body){if(body?.getType()==='dynamic')body.setAwake(true);}

function wakeCargoNear(p,radius){for(const t of terrain.values())if(t.body&&P.Vec2.distance(t.body.getPosition(),p)<radius+2)wakeCargo(t.body);for(const i of [...items,...boxes])if(P.Vec2.distance(i.body.getPosition(),p)<radius+(i.size||0)/2)wakeCargo(i.body);}

function holdCargoAwake(body,owner){let locks=cargoWakeLocks.get(body);if(!locks){locks=new Set();cargoWakeLocks.set(body,locks);}const token={owner};locks.add(token);body.setSleepingAllowed(false);wakeCargo(body);let released=false;return ()=>{if(released)return;released=true;locks.delete(token);if(!locks.size){body.setSleepingAllowed(true);wakeCargo(body);}};}

// Resting stacks often sit a hair apart (the physics engine keeps a tiny gap), so 'touching' also means face to face
// within a few hundredths of a tile — otherwise two piles side by side, or one dropped on another, never merged.
function cargoHalf(b){const v=b.getFixtureList()?.getShape()?.m_vertices;return v?Math.abs(v[0].x):.32;}
function cargoNear(a,b){const p=a.getPosition(),q=b.getPosition();return Math.hypot(p.x-q.x,p.y-q.y)<(cargoHalf(a)+cargoHalf(b))*1.15;}
// Resting (sleeping) stacks are checked only every MERGE_FULL ticks; awake ones every tick (an awake stack also finds
// the sleeping ones it touches). A ship with a big resting pile spent a tenth of its tick here.
const MERGE_FULL=30;let mergePass=0;
function mergeTouchingCargo(list,physics){const full=(++mergePass%MERGE_FULL)===0;if(!full&&!list.some(i=>i.body.isAwake()))return;const byBody=new Map(list.map(i=>[i.body,i])),removed=new Set();for(const x of list){if(removed.has(x))continue;if(!full&&!x.body.isAwake())continue;for(let e=x.body.getContactList();e;e=e.next){const y=byBody.get(e.other);if(!y||y===x||removed.has(y)||x.type!==y.type||x.count+y.count>stackLimit(x.type)||!(e.contact.isTouching()||cargoNear(x.body,y.body)))continue;
// An active logic owner can keep an item's identity stable while manipulating it.
if(cargoWakeLocks.get(x.body)?.size||cargoWakeLocks.get(y.body)?.size)continue;
const vx=x.body.getLinearVelocity(),vy=y.body.getLinearVelocity(),total=x.count+y.count;x.body.setLinearVelocity(V((vx.x*x.count+vy.x*y.count)/total,(vx.y*x.count+vy.y*y.count)/total));x.count=total;x.grace=Math.max(x.grace||0,y.grace||0);wakeCargo(x.body);removed.add(y);}}
for(const i of removed)physics.destroyBody(i.body);if(removed.size){let n=0;for(const i of list)if(!removed.has(i))list[n++]=i;list.length=n;}}

function cargoSleepStats(){const cargo=[...items,...boxes,...worldLoot],awake=cargo.filter(i=>i.body.isAwake()).length;return awake+' awake / '+(cargo.length-awake)+' sleeping cargo bodies';}

// Cargo leaves the ship only through a hole in the hull (a broken hull cell). A stack squeezed through solid hull
// (crushed under a heavy expando box, rammed by a pusher) is put back inside instead of being lost to the zone.
function leakedThroughHole(p){const cx=clamp(Math.round(p.x),bounds.l,bounds.r),cy=clamp(Math.round(p.y),bounds.t,bounds.b);for(let d=-1;d<=1;d++){const c=(cx===bounds.l||cx===bounds.r)&&cy!==bounds.t&&cy!==bounds.b?{x:cx,y:clamp(cy+d,bounds.t,bounds.b)}:{x:clamp(cx+d,bounds.l,bounds.r),y:cy};if(brokenHull.has(key(c.x,c.y)))return true;}return false;}
function tickHullLeaks(){for(const i of [...items]){const p=i.body.getPosition();if(p.x>bounds.l-.5&&p.x<bounds.r+.5&&p.y>bounds.t-.5&&p.y<bounds.b+.5)continue;if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&!leakedThroughHole(p)&&typeof rescueBody==='function'){rescueBody(i.body,true);continue;}const v=i.body.getLinearVelocity(),sv=ship.getLinearVelocity(),q=ship.getWorldPoint(p);addWorldLoot(i.type,q,i.count,V(v.x+sv.x,v.y+sv.y)).grace=2;inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}}
