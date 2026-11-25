'use strict';
// Anti-lag and anti-breakage safeguards. drednot.io grew the same kinds of protection over time (anti item
// compaction, ejecting crammed items, stack limits); these keep contraptions from wedging items into walls,
// launching cargo through the hull, corrupting physics, or piling up enough loose bodies to lag a server.
// Every limit lives in SAFETY.
const SAFETY={
 maxLooseStacks:1200,     // loose item bodies inside one ship before stacks are merged (high: item logic counts stacks)
 hardLooseStacks:1600,    // …and before the oldest excess stacks are ejected from the ship
 maxCargoSpeed:40,        // m/s, loose items and expando boxes (stops pusher/loader launch exploits)
 maxCrewSpeed:30,         // m/s, crew members
 compactionSeconds:2,     // an item wedged inside a solid tile this long is moved to the nearest open cell
 checkInterval:.25,       // seconds between the slower checks
 maxMachines:{}          // no cap on loaders or pushers: big battleships and item-logic builds use hundreds
};
let safetyTimer=0,lastGoodShip=null;
const finiteVec=v=>Number.isFinite(v.x)&&Number.isFinite(v.y);
// cargo: loose items and boxes pass over loaders (background machines), so a loader's cell is open to them.
function solidCell(x,y,cargo=false){if(blocks.has(key(x,y)))return true;const t=terrainAt({x,y});return !!t&&['door','wedge','glass','pusher_block','loader','paint','fabricator','net','walkway','walkway_wedge'].includes(t.type)&&!(cargo&&t.type==='loader');}
// Nearest open interior cell to p (breadth-first over the ship's grid).
function safeCell(p,cargo=false){if(!finiteVec(p))p=V(helm.x,helm.y-1);const start={x:clamp(Math.round(p.x),bounds.l+1,bounds.r-1),y:clamp(Math.round(p.y),bounds.t+1,bounds.b-1)},seen=new Set([key(start.x,start.y)]),q=[start];
 for(let i=0;i<q.length;i++){const c=q[i];if(!solidCell(c.x,c.y,cargo)&&!helmCells().some(h=>h.x===c.x&&h.y===c.y)&&!(cargo&&boxes.some(b=>{const q=b.body.getPosition();return Math.abs(q.x-c.x)<b.size/2+.4&&Math.abs(q.y-c.y)<b.size/2+.4;})))return V(c.x,c.y);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:c.x+dx,y:c.y+dy};if(n.x<=bounds.l||n.x>=bounds.r||n.y<=bounds.t||n.y>=bounds.b||seen.has(key(n.x,n.y)))continue;seen.add(key(n.x,n.y));q.push(n);}}
 return V(helm.x,helm.y-1);}
// Is this body's centre inside a solid interior shape (block, glass, wedge, pusher, hull)?
// Only shapes the body actually collides with count (cargo resting on a loader, a background machine, is not stuck).
function wedgedInSolid(body){const c=body.getPosition(),own=body.getFixtureList();const cat=own?own.getFilterCategoryBits():1,mask=own?own.getFilterMaskBits():0xffff;let stuck=false;inside.queryAABB(new P.AABB(V(c.x-.05,c.y-.05),V(c.x+.05,c.y+.05)),f=>{if(f.getBody()===interior&&f.getFilterCategoryBits()===1&&(f.getFilterMaskBits()&cat)&&(mask&1)&&f.testPoint(c)){stuck=true;return false;}return true;});return stuck;}
function clampSpeed(body,max){const v=body.getLinearVelocity(),s=v.length();if(s>max)body.setLinearVelocity(V(v.x*max/s,v.y*max/s));}
function rescueBody(body,cargo=false){body.setTransform(safeCell(body.getPosition(),cargo),0);body.setLinearVelocity(V(0,0));body.setAngularVelocity(0);body.setAwake(true);}
// Combine same-type loose stacks (up to the stack limit) without losing a single item.
function mergeLooseStacks(){const before=items.length,byType=new Map();for(const i of items){if(cargoWakeLocks.get(i.body)?.size)continue;if(!byType.has(i.type))byType.set(i.type,[]);byType.get(i.type).push(i);}
 const gone=new Set();
 for(const [type,list] of byType){const cap=stackLimit(type);if(cap<=1)continue;list.sort((a,b)=>b.count-a.count);
  // Two pointers: fill the fullest stacks from the emptiest ones; emptied stacks are removed.
  let i=0,j=list.length-1;while(i<j){const dst=list[i],src=list[j];if(dst.count>=cap){i++;continue;}const n=Math.min(cap-dst.count,src.count);dst.count+=n;src.count-=n;if(src.count<=0){gone.add(src);j--;}}}
 for(const g of gone)inside.destroyBody(g.body);if(gone.size){let n=0;for(const it of items)if(!gone.has(it))items[n++]=it;items.length=n;}
 return before-items.length;}
function tickSafeguards(dt){
 // Every tick: corrupted physics and runaway speeds.
 const sp=ship.getPosition();if(!finiteVec(sp)||!finiteVec(ship.getLinearVelocity())){ship.setTransform(lastGoodShip||V(0,0),0);ship.setLinearVelocity(V(0,0));}else lastGoodShip=sp.clone();
 /* sleeping cargo can't be moving or broken: only awake stacks are checked each tick */for(const i of items){if(!i.body.isAwake())continue;if(!finiteVec(i.body.getPosition())||!finiteVec(i.body.getLinearVelocity()))rescueBody(i.body,true);else clampSpeed(i.body,SAFETY.maxCargoSpeed);}
 for(const b of boxes){if(!finiteVec(b.body.getPosition())||!finiteVec(b.body.getLinearVelocity()))rescueBody(b.body,true);else clampSpeed(b.body,SAFETY.maxCargoSpeed);}
 for(const t of terrain.values())if(t.body){if(!finiteVec(t.body.getPosition())||!finiteVec(t.body.getLinearVelocity()))rescueBody(t.body);else clampSpeed(t.body,SAFETY.maxCargoSpeed);}
 if(player&&!piloting){if(!finiteVec(player.getPosition())||!finiteVec(player.getLinearVelocity()))recover();else clampSpeed(player,SAFETY.maxCrewSpeed);}
 safetyTimer+=dt;if(safetyTimer<SAFETY.checkInterval)return;const step=safetyTimer;safetyTimer=0;
 // Items wedged inside solid tiles (squeezed by pushers, built over, etc.) are moved to open space.
 for(const i of items){if(wedgedInSolid(i.body)){i.stuck=(i.stuck||0)+step;if(i.stuck>=SAFETY.compactionSeconds){rescueBody(i.body,true);i.stuck=0;}}else i.stuck=0;}
 // Too many loose bodies: merge stacks first; past the hard limit, eject the oldest excess (never deleted).
 if(items.length>SAFETY.maxLooseStacks){const merged=mergeLooseStacks();if(merged)toastAll('Cargo tidy-up: merged '+merged+' loose stacks.');}
 if(items.length>SAFETY.hardLooseStacks){const extra=items.splice(0,items.length-SAFETY.hardLooseStacks);for(const i of extra){addWorldLoot(i.type,ship.getWorldPoint(V(0,bounds.t-4)),i.count,ship.getLinearVelocity()).grace=5;inside.destroyBody(i.body);}toastAll(extra.length+' loose stacks were ejected: too much cargo lying around (limit '+SAFETY.hardLooseStacks+').');}}
// Server lag relief (room.cjs calls this when a ship's simulation runs slow): put still cargo to sleep so it costs
// nothing until something touches it. It no longer merges stacks: item-logic builds (gates, sorters, counters) depend
// on exactly which stacks exist, and a sleeping item wakes the moment a pusher or loader acts on it.
function lagRelief(){const merged=0;let slept=0;for(const i of [...items,...boxes])if(!cargoWakeLocks.get(i.body)?.size&&i.body.isAwake()&&i.body.getLinearVelocity().length()<.3){i.body.setAwake(false);slept++;}if(slept)toastAll('This ship was lagging the server: settled '+slept+' idle items.');return {merged,slept};}
function machineLimitReached(type){const max=SAFETY.maxMachines[type];if(!max)return false;let n=0;for(const t of terrain.values())if(t.type===type)n++;return n>=max;}
