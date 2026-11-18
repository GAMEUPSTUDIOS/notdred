'use strict';
function spawnItem(type,p,velocity=V(0,0),count=1){const body=inside.createDynamicBody({position:V(p.x,p.y),bullet:true,angularDamping:3});body.createFixture(P.Box(.32,.32),{density:3,friction:.8,restitution:.08,filterCategoryBits:8,filterMaskBits:1|2|8|16|256|512});body.setLinearVelocity(velocity);const item={type,body,count:Math.min(stackLimit(type),count)};items.push(item);return item}

function stackLimit(type){return ['wrench','fabricator','thruster','turret','turret_burst','turret_auto','turret_controller','starter_rc','starter','storage','shredder','pusher','repair','pusher_block','fab_starter','fab_machine','fab_engineering','fab_munitions','loader','recycler','anchor','comms','spawn'].includes(type)?1:16}

function makeInventory(){return new Proxy(Object.fromEntries(TYPES.map(t=>[t,0])),{get(o,t){return TYPES.includes(t)?carried(t):o[t]},set(o,t,value){if(!TYPES.includes(t)){o[t]=value;return true}const delta=value-carried(t);if(delta>0)giveItem(t,delta);else if(delta<0)takeItem(t,-delta);return true},ownKeys(){return TYPES},getOwnPropertyDescriptor(){return {enumerable:true,configurable:true}}})}

function takeItem(type,count){for(const i of [selected,...[0,1,2,3,4].filter(i=>i!==selected)])if(slots[i]===type){const n=Math.min(count,stackCounts[i]);stackCounts[i]-=n;count-=n;if(!stackCounts[i])slots[i]=null;if(!count)break}selectSlot(selected)}

function scatter(type,count,p=localPlayer(),intakeFrom=null){while(count>0){const n=Math.min(stackLimit(type),count);const x=clamp(p.x+(items.length%5-2)*.3,bounds.l+.9,bounds.r-.9);spawnItem(type,V(x,clamp(p.y-.4,bounds.t+.9,bounds.b-.9)),V(0,0),n).intakeFrom=intakeFrom;count-=n}}

function giveItem(type,count){const added=addCarried(type,count);if(count>added)scatter(type,count-added);return added}

function moveStack(from,to,split=false){if(from===to||!slots[from])return;const t=slots[from],n=split?Math.ceil(stackCounts[from]/2):stackCounts[from];if(!slots[to]||slots[to]===t){const moved=Math.min(n,stackLimit(t)-stackCounts[to]);slots[to]=t;stackCounts[to]+=moved;stackCounts[from]-=moved;if(!stackCounts[from])slots[from]=null;}else if(!split){[slots[from],slots[to]]=[slots[to],slots[from]];[stackCounts[from],stackCounts[to]]=[stackCounts[to],stackCounts[from]];}selectSlot(to);save(true)}

function refund(type,p){inventory[type]=(inventory[type]||0)+1}

function hoverItem(){if(!mouse.active)return null;const p=localMouse();return items.filter(i=>P.Vec2.distance(i.body.getPosition(),p)<.5).sort((a,b)=>P.Vec2.distance(a.body.getPosition(),p)-P.Vec2.distance(b.body.getPosition(),p))[0]||null}

function pickupAt(p){const i=items.find(i=>P.Vec2.distance(i.body.getPosition(),p)<.5);if(!i)return false;if(piloting||P.Vec2.distance(localPlayer(),i.body.getPosition())>3.5){toast('Move closer on foot to pick it up.');return true}let blocked=false;inside.rayCast(localPlayer(),i.body.getPosition(),f=>{if(f.getBody()===interior&&f.getFilterCategoryBits()===1){blocked=true;return 0}return 1});if(blocked){toast('A block is in the way.');return true}const n=addCarried(i.type,i.count||1);i.count-=n;if(i.count<=0){inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}else toast('Inventory full: drop a stack with Q.');save(true);return true}

function dropItem(split=false){const t=slots[selected];if(piloting||!t||!stackCounts[selected])return toast('Select a carried item while on foot.');const p=localPlayer(),aim=mouse.active?localMouse():V(p.x+facing,p.y-.3),dir=V(aim.x-p.x,aim.y-p.y);if(dir.length()<.01)dir.x=facing;dir.normalize();const candidates=[V(p.x+dir.x*.9,p.y+dir.y*.9),V(p.x-facing*.9,p.y-.3),V(p.x,p.y-.95),V(p.x,p.y)];const q=candidates.find(q=>q.x>bounds.l+.85&&q.x<bounds.r-.85&&q.y>bounds.t+.85&&q.y<bounds.b-.85&&![...blocks.values(),...[...terrain.values()].filter(t=>t.type==='net')].some(b=>Math.abs(b.x-q.x)<.85&&Math.abs(b.y-q.y)<.85));if(!q)return toast('Make room to drop the item.');const count=split?Math.ceil(stackCounts[selected]/2):stackCounts[selected];stackCounts[selected]-=count;if(!stackCounts[selected])slots[selected]=null;spawnItem(t,q,V(dir.x*5,dir.y*5),count);selectSlot(selected);save(true)}

function touching(a,b){for(let e=a.getContactList();e;e=e.next)if(e.other===b&&e.contact.isTouching())return true;return false}

function boxSpace(p,size,ignore=null){const h=size/2;if(p.x-h<bounds.l+.5||p.x+h>bounds.r-.5||p.y-h<bounds.t+.5||p.y+h>bounds.b-.5)return false;if(player&&Math.abs(localPlayer().x-p.x)<h+.24&&Math.abs(localPlayer().y-p.y)<h+.63)return false;return ![...blocks.values(),...[...terrain.values()].filter(t=>['wedge','glass','net'].includes(t.type))].some(t=>Math.abs(t.x-p.x)<h+.49&&Math.abs(t.y-p.y)<h+.49)&&!boxes.some(b=>b!==ignore&&Math.abs(b.body.getPosition().x-p.x)<(b.size+size)/2&&Math.abs(b.body.getPosition().y-p.y)<(b.size+size)/2)}

function spawnBox(p,materials={}){const count=Object.values(materials).reduce((a,b)=>a+b,0),size=2+Math.floor(count/64)*.25;const body=inside.createDynamicBody({position:p,angularDamping:5,linearDamping:.1,bullet:true});const box={body,size,materials:{...materials}};box.fixture=body.createFixture(P.Box(size/2,size/2),{density:.35,friction:.18,filterCategoryBits:8,filterMaskBits:1|2|8|16|256|512});boxes.push(box);return box}

function resizeBox(box){const total=Object.values(box.materials).reduce((a,b)=>a+b,0),size=2+Math.floor(total/64)*.25;if(size>box.size&&!boxSpace(box.body.getPosition(),size,box))return false;box.body.destroyFixture(box.fixture);box.size=size;box.fixture=box.body.createFixture(P.Box(size/2,size/2),{density:.35,friction:.18,filterCategoryBits:8,filterMaskBits:1|2|8|16|256|512});box.body.setAwake(true);return true}

function boxAt(p){return boxes.find(b=>{const q=b.body.getLocalPoint(p);return Math.abs(q.x)<b.size/2&&Math.abs(q.y)<b.size/2})}

function useBox(p){const b=boxAt(p);if(!b)return false;if(piloting||P.Vec2.distance(localPlayer(),p)>3.5){toast('Move closer to the expando box.');return true}if(tool==='walk'||tool==='empty'){const t=TYPES.find(t=>b.materials[t]>0);if(t){const n=Math.min(stackLimit(t),b.materials[t]);scatter(t,n,V(p.x-b.size/2-.5,p.y));b.materials[t]-=n;resizeBox(b);}else toast('Empty expando box. Right-click with wrench to package it.');}else if(TYPES.includes(tool)){const t=tool,n=Math.min(inventory[t],256-Object.values(b.materials).reduce((a,v)=>a+v,0));b.materials[t]=(b.materials[t]||0)+n;if(resizeBox(b))inventory[t]-=n;else {b.materials[t]-=n;toast('Box needs more room to expand.');}}save(true);return true}

function wakeCargo(body){if(body?.getType()==='dynamic')body.setAwake(true);}

function wakeCargoNear(p,radius){for(const t of terrain.values())if(t.body&&P.Vec2.distance(t.body.getPosition(),p)<radius+2)wakeCargo(t.body);for(const i of [...items,...boxes])if(P.Vec2.distance(i.body.getPosition(),p)<radius+(i.size||0)/2)wakeCargo(i.body);}

function holdCargoAwake(body,owner){let locks=cargoWakeLocks.get(body);if(!locks){locks=new Set();cargoWakeLocks.set(body,locks);}const token={owner};locks.add(token);body.setSleepingAllowed(false);wakeCargo(body);let released=false;return ()=>{if(released)return;released=true;locks.delete(token);if(!locks.size){body.setSleepingAllowed(true);wakeCargo(body);}};}

// Resting stacks often sit a hair apart (the physics engine keeps a tiny gap), so 'touching' also means face to face
// within a few hundredths of a tile — otherwise two piles side by side, or one dropped on another, never merged.
function cargoHalf(b){const v=b.getFixtureList()?.getShape()?.m_vertices;return v?Math.abs(v[0].x):.32;}
function cargoNear(a,b){const p=a.getPosition(),q=b.getPosition();return Math.hypot(p.x-q.x,p.y-q.y)<(cargoHalf(a)+cargoHalf(b))*1.15;}
function mergeTouchingCargo(list,physics){const byBody=new Map(list.map(i=>[i.body,i])),removed=new Set();for(const x of list){if(removed.has(x))continue;for(let e=x.body.getContactList();e;e=e.next){const y=byBody.get(e.other);if(!y||y===x||removed.has(y)||x.type!==y.type||x.count+y.count>stackLimit(x.type)||!(e.contact.isTouching()||cargoNear(x.body,y.body)))continue;
// An active logic owner can keep an item's identity stable while manipulating it.
if(cargoWakeLocks.get(x.body)?.size||cargoWakeLocks.get(y.body)?.size)continue;
const vx=x.body.getLinearVelocity(),vy=y.body.getLinearVelocity(),total=x.count+y.count;x.body.setLinearVelocity(V((vx.x*x.count+vy.x*y.count)/total,(vx.y*x.count+vy.y*y.count)/total));x.count=total;x.grace=Math.max(x.grace||0,y.grace||0);wakeCargo(x.body);removed.add(y);}}
for(const i of removed)physics.destroyBody(i.body);if(removed.size){let n=0;for(const i of list)if(!removed.has(i))list[n++]=i;list.length=n;}}

function cargoSleepStats(){const cargo=[...items,...boxes,...worldLoot],awake=cargo.filter(i=>i.body.isAwake()).length;return awake+' awake / '+(cargo.length-awake)+' sleeping cargo bodies';}

function tickHullLeaks(){for(const i of [...items]){const p=i.body.getPosition();if(p.x>bounds.l-.5&&p.x<bounds.r+.5&&p.y>bounds.t-.5&&p.y<bounds.b+.5)continue;const v=i.body.getLinearVelocity(),sv=ship.getLinearVelocity(),q=ship.getWorldPoint(p);addWorldLoot(i.type,q,i.count,V(v.x+sv.x,v.y+sv.y)).grace=2;inside.destroyBody(i.body);items.splice(items.indexOf(i),1);}}
