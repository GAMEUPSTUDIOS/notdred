'use strict';
// Zone runtime. What each zone *is* (size, bots, portals, rules) lives in era.js; this file builds it.

function snapshotZone(){const st=zoneData[zone]??={mined:[],loot:[]};if(isCombatZone()){st.bots??={};for(const b of allBots())(st.bots[b.species]??=[])[b.index]={dead:false,bot:{hp:b.hp,...b.body.getPosition()}};}st.boulders=boulderState();st.loot=worldLoot.map(i=>({type:i.type,count:i.count,...i.body.getPosition(),vx:i.body.getLinearVelocity().x,vy:i.body.getLinearVelocity().y,angle:i.body.getAngle(),spin:i.body.getAngularVelocity(),grace:i.grace||0}));return zoneData;}

function addWorldLoot(type,p,count,velocity=V(0,0)){const body=world.createDynamicBody({position:V(p.x,p.y),linearDamping:.05,angularDamping:.25,bullet:true});body.createFixture(P.Box(2,2),{density:.7,friction:.35,restitution:.35});body.setLinearVelocity(velocity);const i={type,count:Math.min(count,stackLimit(type)),body,grace:0};worldLoot.push(i);if(count>stackLimit(type))addWorldLoot(type,V(p.x+4.1,p.y),count-stackLimit(type),velocity);return i;}

// Cave grids are cached per zone and seed. Combat zones only; safe zones return null.
const zoneGridCache={};
// Rock collision is built per 8×8-cell chunk as a few greedy-merged rectangles instead of one body per cell:
// ~10× fewer physics proxies, so entering a zone, its first physics step, and every raycast are much cheaper.
// `rocks` still holds one record per cell (ore, hp); mining a cell rebuilds only that cell's chunk.
const ROCK_CHUNK=8;let rockChunks=new Map();
function rockChunkOf(x,y,g=zoneGrid()){return Math.floor((x-g.minX)/g.cell/ROCK_CHUNK)+':'+Math.floor((y-g.minY)/g.cell/ROCK_CHUNK);}
function buildRockChunk(k){const ch=rockChunks.get(k);if(!ch)return;if(ch.body){world.destroyBody(ch.body);ch.body=null;}ch.dirty=false;if(!ch.cells.size)return;const g=zoneGrid(),c=g.cell,taken=new Set(),has=(x,y)=>ch.cells.has(key(x,y))&&!taken.has(key(x,y));
 ch.body=world.createBody({userData:{rockChunk:k}});const cells=[...ch.cells].map(id=>rocks.get(id)).filter(Boolean).sort((a,b)=>a.y-b.y||a.x-b.x);
 for(const r of cells){if(taken.has(r.id))continue;let w=1,h=1;while(has(r.x+w*c,r.y))w++;grow:for(;;){for(let i=0;i<w;i++)if(!has(r.x+i*c,r.y+h*c))break grow;h++;}
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)taken.add(key(r.x+i*c,r.y+j*c));ch.body.createFixture(P.Box(w*c/2,h*c/2,V(r.x+(w-1)*c/2,r.y+(h-1)*c/2)),{friction:.4});}}
function removeRock(id,rebuild=true){const r=rocks.get(id);if(!r)return false;rocks.delete(id);const ch=rockChunks.get(r.chunk);if(ch){ch.cells.delete(id);ch.dirty=true;if(rebuild)buildRockChunk(r.chunk);}return true;}
function rebuildDirtyRockChunks(){for(const [k,ch] of rockChunks)if(ch.dirty)buildRockChunk(k);}
// Which rock cell a ray hit: step just inside the surface along the incoming direction and snap to the grid.
function rockAtHit(point,dir){const g=zoneGrid();if(!g)return null;for(const depth of [.2,1,2]){const x=g.minX+Math.round((point.x+dir.x*depth-g.minX)/g.cell)*g.cell,y=g.minY+Math.round((point.y+dir.y*depth-g.minY)/g.cell)*g.cell,id=key(x,y);if(rocks.has(id))return id;}return null;}
function zoneGrid(id=zone){const def=zoneDef(id);if(!def.gen)return null;const seed=zoneData[id]?.seed||0,c=zoneGridCache[id];if(c?.seed===seed)return c.grid;const grid=ZoneGenerator.generate(seed,def.gen);zoneGridCache[id]={seed,grid};return grid;}
function finchGrid(){return zoneGrid('finch');}
function zoneSolid(x,y,id=zone){const g=zoneGrid(id),ix=Math.round((x-g.minX)/g.cell),iy=Math.round((y-g.minY)/g.cell);return ix<0||iy<0||ix>=g.width||iy>=g.height||!!g.solid[iy*g.width+ix];}

// Portals. Safe zones use the fixed list in era.js. Combat-zone portals follow the cave seed: the first
// destination sits on the entry cavern at (0,0); the rest go in roomy caverns, spread as far apart as possible.
const portalCache={};
function zonePortals(id=zone){const def=zoneDef(id);if(def.portals)return typeof missionPortals==='function'?[...def.portals,...missionPortals(id)]:def.portals;const g=zoneGrid(id),k=id+':'+g.seed;const withMission=c=>typeof missionPortals==='function'?[...c.list,...missionPortals(id,c.missionSpot)]:c.list;/* kept on the map itself: on the server every ship in a zone shares one grid, so this is worked out once per map, not once per ship */const cached=g.__portals||portalCache[id];if(cached?.k===k)return withMission(cached);
 const roomy=[];for(let y=3;y<g.height-3;y++)for(let x=4;x<g.width-4;x++){if(g.pit&&(y<g.pit.hall.y0+2||y>g.pit.hall.y1-2))continue;let ok=true;for(let dy=-1;dy<=1&&ok;dy++)for(let dx=-2;dx<=2;dx++)if(!g.centers[(y+dy)*g.width+x+dx]){ok=false;break;}if(ok)roomy.push(V(g.minX+x*g.cell,g.minY+y*g.cell));}
 const list=[{to:def.portalsTo[0],x:g.entry?.x||0,y:g.entry?.y||0}];
 for(const to of def.portalsTo.slice(1)){let best=null,score=-1;for(const p of roomy){const d=Math.min(...list.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));if(d>score){score=d;best=p;}}if(!best)best=V(0,0);list.push({to,x:best.x,y:best.y});}
 // The open spot farthest from the regular portals is kept for the mission portal (Sparrow I, while a mission runs).
 let missionSpot=null,ms=-1;for(const p of roomy){const d=Math.min(...list.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));if(d>ms){ms=d;missionSpot={x:p.x,y:p.y};}}
 portalCache[id]={k,list,missionSpot};try{Object.defineProperty(g,'__portals',{value:portalCache[id],configurable:true,writable:true});}catch{}return withMission(portalCache[id]);}
function portalPosition(){const q=zonePortals()[0];return V(q.x,q.y);}
function nearestPortal(p=ship.getPosition()){let best=null;for(const q of zonePortals()){const distance=Math.hypot(q.x-p.x,q.y-p.y);if(!best||distance<best.distance)best={...q,distance};}return best;}

function shipOverlapsRock(p){const e=shipExtents();for(const r of rocks.values())if(r.x+2>p.x+e.l&&r.x-2<p.x+e.r&&r.y+2>p.y+e.t&&r.y-2<p.y+e.b)return true;return false;}
// 2019 Help page: a portal drops you "at a random position in the linked zone". Cavern centres are
// guaranteed ship clearance by the generator; keep clear of the arrival portal so Q does not bounce you back.
// Other ships already in this zone (from the zone server), as world-space boxes, so arrivals avoid them.
function shipClashes(p){if(typeof occupiedByShips!=='function')return false;const e=shipExtents();return occupiedByShips(zone).some(o=>p.x+e.l-2<o.x+o.ext.r&&p.x+e.r+2>o.x+o.ext.l&&p.y+e.t-2<o.y+o.ext.b&&p.y+e.b+2>o.y+o.ext.t);}
function randomArrival(){const g=zoneGrid();if(!g)return null;const portals=zonePortals(),open=[];for(let i=0;i<g.centers.length;i++)if(g.centers[i])open.push(i);for(let n=0;n<80&&open.length;n++){const i=open.splice(Math.floor(Math.random()*open.length),1)[0],p=V(g.minX+i%g.width*g.cell,g.minY+Math.floor(i/g.width)*g.cell);if(portals.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<PORTAL_RANGE+6))continue;if(!shipOverlapsRock(p)&&!shipClashes(p))return p;}return null;}
// ---- Freeport layout (all three Freeports, like the original's harbour map) ------------------------------------------
// A square harbour with cut corners; four I-shaped docks in a 2×2 grid (a top bar and a bottom bar joined by a stem);
// the outer walls are docks too. Every dock piece is a rectangle; a ship berths against whichever face it touched.
const FREEPORT_CUT=40,FREEPORT_DOCK={cx:90,cy:85,halfW:34,halfH:30,t:2};
function freeportLayout(){const {w,h}=zoneHalf(),C=FREEPORT_CUT,D=FREEPORT_DOCK,docks=[];
 for(const sx of [-1,1])for(const sy of [-1,1]){const cx=sx*D.cx,cy=sy*D.cy;docks.push({x0:cx-D.halfW,y0:cy-D.halfH-D.t,x1:cx+D.halfW,y1:cy-D.halfH,part:'bar'},{x0:cx-D.halfW,y0:cy+D.halfH,x1:cx+D.halfW,y1:cy+D.halfH+D.t,part:'bar'},{x0:cx-D.t/2,y0:cy-D.halfH,x1:cx+D.t/2,y1:cy+D.halfH,part:'stem'});}
 const walls=[{x0:-w+C,y0:-h-2,x1:w-C,y1:-h,part:'wall'},{x0:-w+C,y0:h,x1:w-C,y1:h+2,part:'wall'},{x0:-w-2,y0:-h+C,x1:-w,y1:h-C,part:'wall'},{x0:w,y0:-h+C,x1:w+2,y1:h-C,part:'wall'}];
 /* the cut corners: a wall band from the end of one side wall to the next (outer corner points, clockwise) */const corners=[[[-w,-h+C],[-w+C,-h]],[[w-C,-h],[w,-h+C]],[[w,h-C],[w-C,h]],[[-w+C,h],[-w,h-C]]];
 return {w,h,docks,walls,corners};}
// Is the ship (at p) wholly inside the harbour and clear of every dock piece?
function freeportBerthOK(p=ship.getPosition()){const e=shipExtents(),L=freeportLayout();return [[e.l,e.t],[e.r,e.t],[e.l,e.b],[e.r,e.b]].every(([dx,dy])=>insideFreeport(p.x+dx,p.y+dy,-.1))&&!L.docks.some(d=>p.x+e.l+.05<d.x1&&p.x+e.r-.05>d.x0&&p.y+e.t+.05<d.y1&&p.y+e.b-.05>d.y0);}
// Inside the harbour's cut-corner outline (with a margin)?
function insideFreeport(x,y,m=0){const {w,h}=zoneHalf();return Math.abs(x)<=w-m&&Math.abs(y)<=h-m&&Math.abs(x)+Math.abs(y)<=w+h-FREEPORT_CUT-m*1.42;}
// Safe zones: spread arriving ships along the dock instead of stacking them on one spot.
// Sized to the ship: any ship up to the 80×80 limit finds a berth that lies inside the zone's walls and clear of every
// other ship (searching outward from the middle, row by row).
// Where this hull can sit in a Freeport: inside the harbour, clear of the piers and away from the portal.
function freeportFits(p,e=shipExtents()){const L=freeportLayout();return [[e.l,e.t],[e.r,e.t],[e.l,e.b],[e.r,e.b]].every(([dx,dy])=>insideFreeport(p.x+dx,p.y+dy,3))&&!L.docks.some(d=>p.x+e.l-2<d.x1&&p.x+e.r+2>d.x0&&p.y+e.t-2<d.y1&&p.y+e.b+2>d.y0)&&!zonePortals().some(q=>Math.hypot(q.x-p.x,q.y-p.y)<PORTAL_RANGE+4||p.x+e.l-4<q.x&&p.x+e.r+4>q.x&&p.y+e.t-4<q.y&&p.y+e.b+4>q.y);}
// A ship spawning in a Freeport (loaded from the ship list, brought back from a combat zone, towed home) appears at a
// random free spot in the harbour, floating — never docked. Falls back to the nearest free spot to the middle.
function randomBerth(){const {w,h}=zoneHalf(),e=shipExtents();for(let n=0;n<400;n++){const p=V(Math.round(-w+Math.random()*2*w),Math.round(-h+Math.random()*2*h));if(freeportFits(p,e)&&!shipClashes(p))return p;}return safeArrival();}
function safeArrival(){const e=shipExtents(),stepX=Math.max(8,Math.ceil((e.r-e.l)/2)),stepY=Math.max(8,Math.ceil((e.b-e.t)/2)),fits=p=>freeportFits(p,e);
 const rows=[0];for(let k=1;k<40;k++){rows.push(-k*stepY,k*stepY);}for(const y of rows){for(let k=0;k<60;k++){const p=V((k%2?1:-1)*Math.ceil(k/2)*stepX,y);if(!fits(p))continue;if(!shipClashes(p))return p;}}return V(0,0);}

function setupZone(reposition=true,arrival='entry'){for(let b=world.getBodyList();b;){const next=b.getNext();if(b!==ship)world.destroyBody(b);b=next;}rocks=new Map();rockChunks=new Map();worldLoot=[];shots=[];boulders=[];dockBody=world.createBody();const def=zoneDef();if(!ZONES[zone])zone=def.id;zoneData[zone]??={mined:[],loot:[]};const st=zoneData[zone];if(typeof authoritativeZone==='function'&&def.kind==='combat'){const a=authoritativeZone(zone);if(a){if((st.seed||0)!==a.seed){st.seed=a.seed;st.loot=[];delete st.bots;}st.mined=Array.from(a.mined);st.regenIn=a.regenIn??undefined;st.resetIn=a.resetIn??undefined;if(a.grid&&a.grid.seed===a.seed)zoneGridCache[zone]={seed:a.seed,grid:a.grid};}}const mined=new Set(st.mined||[]);const edge=world.createBody();const {w,h}=zoneHalf();
// Freeports: the harbour (freeportLayout) — its docks and walls are dock pieces, its cut corners plain wall.
if(def.kind==='safe'){const L=freeportLayout();for(const r of [...L.docks,...L.walls])dockBody.createFixture(P.Box((r.x1-r.x0)/2,(r.y1-r.y0)/2,V((r.x0+r.x1)/2,(r.y0+r.y1)/2)),{userData:{dock:{rect:{x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1}}}});
 for(const [a,b] of L.corners){/* a 2-thick band along the cut, outward */const nx=Math.sign(a[0]+b[0]),ny=Math.sign(a[1]+b[1]),o=[nx*1.42,ny*1.42];edge.createFixture(P.Polygon([V(a[0],a[1]),V(b[0],b[1]),V(b[0]+o[0],b[1]+o[1]),V(a[0]+o[0],a[1]+o[1])]));}}
else for(const [x,y,hx,hy] of [[0,h,w,1],[0,-h,w,1],[-w,0,1,h],[w,0,1,h]])edge.createFixture(P.Box(hx,hy,V(x,y)));
if(def.kind!=='safe'){const g=zoneGrid(),seed=st.seed||0,s=seed+(def.gen.salt%9973),oreCut=1-def.gen.oreChance,maxX=g.minX+(g.width-1)*g.cell,maxY=g.minY+(g.height-1)*g.cell;/* Every tile's kind (rock, ore, flux…) and chunk is worked out once per map and kept with it — the server hands every
  ship in the zone the same map object, so ships arriving in a big zone only filter out what's been mined. */
 let list=g.__rockList;if(!list||list.seed!==seed||list.zone!==zone){list=[];for(let x=g.minX;x<=maxX;x+=g.cell)for(let y=g.minY;y<=maxY;y+=g.cell){if(!zoneSolid(x,y))continue;const hash=terrainHash(x+s*17,y-s*29),inMine=finchNoise(x/36+s*11,y/36-s*7)>.57,pitKind=g.kinds?['','hazard','rock','ore','flux','iron'][g.kinds[Math.round((y-g.minY)/g.cell)*g.width+Math.round((x-g.minX)/g.cell)]]:null,ore=pitKind?pitKind==='ore':inMine&&hash>oreCut,kind=pitKind||(!ore?'rock':def.tiles==='canary'?(terrainHash(x-s*5,y+s*3)<(def.gen.flux||0)?'flux':'iron'):'ore');list.push({id:key(x,y),x,y,kind,chunk:rockChunkOf(x,y,g)});}list.seed=seed;list.zone=zone;try{g.__rockList=list;}catch{}}
 for(const r0 of list){if(mined.has(r0.id))continue;const kind=r0.kind,hp=kind==='hazard'?1e9:WORLD_TILE_HP[kind]||WORLD_TILE_HP.rock;rocks.set(r0.id,{id:r0.id,x:r0.x,y:r0.y,chunk:r0.chunk,kind,ore:kind==='ore',hp,maxhp:hp});let ch=rockChunks.get(r0.chunk);if(!ch)rockChunks.set(r0.chunk,ch={cells:new Set(),body:null,dirty:true});ch.cells.add(r0.id);}decorateZone(def,st,seed,mined);rebuildDirtyRockChunks();delete st.treasure;if(typeof refreshTreasure==='function')refreshTreasure();}
for(const i of st.loot||[]){const loot=addWorldLoot(i.type,V(i.x,i.y),i.count,V(i.vx||0,i.vy||0));loot.body.setAngle(i.angle||0);loot.body.setAngularVelocity(i.spin||0);loot.grace=i.grace||0;}
if(reposition){docked=null;ship.setType('dynamic');ship.setFixedRotation(true);const entry=def.kind==='combat'&&zoneGrid()?.entry;let p=(arrival==='random'&&(def.kind==='combat'?randomArrival():def.kind==='safe'&&randomBerth()))||(entry?V(entry.x,entry.y):V(0,def.kind==='combat'?0:-4));if(shipClashes(p))p=(def.kind==='combat'?randomArrival():safeArrival())||p;ship.setTransform(p,0);ship.setLinearVelocity(V(0,0));cam={...ship.getPosition()};}
if(def.kind==='combat'&&shipOverlapsRock(ship.getPosition())){const e=zoneGrid()?.entry||{x:0,y:0};ship.setTransform(V(e.x,e.y),0);ship.setLinearVelocity(V(0,0));cam={x:e.x,y:e.y};}
setupDungeonActors();const z=document.querySelector('.zone');if(z)z.innerHTML='Zone: '+def.name+' <span>'+def.blurb+'</span>';}

// Zone extras chosen from the seed, so every ship (and the zone server) agrees on them:
//   Canary seekers — rock tiles that are really dormant seeker bots (they wake when shot).
//   The Pits pockets — flux and turret-ore tiles in a cave wall, each sealed by a loose boulder that a ship has to
//   shove out of the way. Boulders are dynamic bodies; their positions are kept with the zone (st.boulders).
let boulders=[];
function exposedRocks(g){const out=[];for(const r of rocks.values()){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=r.x+dx*g.cell,y=r.y+dy*g.cell;if(!rocks.has(key(x,y))&&!zoneSolid(x,y)){out.push({r,open:{x,y},dx,dy});break;}}}return out;}
function decorateZone(def,st,seed,mined){boulders=[];const g=zoneGrid();if(!g)return;const pick=(list,n,salt)=>list.map(e=>({e,h:terrainHash(e.r.x*3+salt+seed,e.r.y*5-salt)})).sort((a,b)=>a.h-b.h).slice(0,n).map(x=>x.e);
 // The Pits: fill the three holes (and the room under them) with boulders of many sizes, packed from the bottom up.
 if(g.pit){const [rMin,rMax]=def.gen.boulderRadius||[3.5,9.5],placed=[],y0=g.minY+(g.pit.holes.top)*g.cell,y1=g.minY+(g.pit.room.y1)*g.cell,free=(x,y,r)=>{/* exact: no wall tile (a cell×cell square) may come within the circle — sampling a few points on the rim let big boulders start inside the slanted hole walls, where they fought the wall forever and never settled */const c=g.cell,h=c/2,m=r+.15;for(let gx=Math.floor((x-m)/c)*c;gx<=x+m+c;gx+=c)for(let gy=Math.floor((y-m)/c)*c;gy<=y+m+c;gy+=c){const cx=Math.round(gx/c)*c,cy=Math.round(gy/c)*c;if(!zoneSolid(cx,cy))continue;const dx=Math.max(Math.abs(x-cx)-h,0),dy=Math.max(Math.abs(y-cy)-h,0);if(dx*dx+dy*dy<m*m)return false;}return !placed.some(b=>Math.hypot(b.x-x,b.y-y)<b.r+r+.2);};
  let n=0;const put=(x,y,r)=>{placed.push({x,y,r});const id='p'+n++,saved=st.boulders?.find(b=>b.id===id);addBoulder(id,saved?V(saved.x,saved.y):V(x,y),saved?.a||0,r);};
  // First a column of boulders of random size up the middle of each hole (from its loot room to the hall)…
  for(const [k,h] of (g.pit.holes.list||[]).entries()){const H=g.pit.holes,at=y=>{const gy=(y-g.minY)/g.cell,t=Math.max(0,Math.min(1,(H.bottom-gy)/(H.bottom-H.top)));return g.minX+(h.bottomX+(h.topX-h.bottomX)*t)*g.cell;};
   for(let top=y1+g.cell/2,i=0;top>y0&&n<70;i++){const want=rMin+(rMax-rMin)*terrainHash(k*31+i*7.3+seed,i*3.1-seed);let done=false;for(let r=want;r>=rMin&&!done;r-=.25){const y=top-r-.1,x=at(y);if(free(x,y,r)){put(x,y,r);top=y-r;done=true;}}if(!done)top-=1;}}
  // …then smaller ones in the gaps left beside them.
  for(let y=y1;y>=y0&&n<70;y-=2)for(let x=g.minX;x<=g.minX+(g.width-1)*g.cell&&n<70;x+=2){if(!free(x,y,rMin))continue;let fit=rMin;for(let r=Math.min(rMax,rMin*1.6);r>rMin;r-=.5)if(free(x,y,r)){fit=r;break;}put(x,y,rMin+(fit-rMin)*terrainHash(x*1.7+seed,y*2.3-seed));}}
 // Canary's square: dormant seekers are buried all through the rock, chosen per tile from the seed (so mining never
 // turns another tile into a seeker).
 if(def.gen.seekerChance){for(const r of rocks.values())if((r.kind==='rock'||r.kind==='iron')&&terrainHash(r.x*3.7+seed,r.y*5.3-seed*2)<def.gen.seekerChance){r.kind='seeker';r.ore=false;r.hp=r.maxhp=1;}}
 if(def.gen.seekers){for(const {r} of pick(exposedRocks(g),def.gen.seekers,71)){r.kind='seeker';r.ore=false;r.hp=r.maxhp=1;}}
 if(def.gen.pockets){const portals=zonePortals();const spots=exposedRocks(g).filter(({open})=>Math.hypot(open.x,open.y)>30&&!portals.some(q=>Math.hypot(q.x-open.x,q.y-open.y)<30));
  pick(spots,def.gen.pockets,131).forEach(({r,open},n)=>{r.kind=n%2?'ore':'flux';r.ore=r.kind==='ore';r.hp=r.maxhp=WORLD_TILE_HP[r.kind]||WORLD_TILE_HP.rock;const id='b'+n,saved=st.boulders?.find(b=>b.id===id);if(saved?.gone)return;addBoulder(id,saved?V(saved.x,saved.y):V(open.x,open.y),saved?.a||0);});}}
// r: a round boulder of that radius (the Pits' shaft); without it, a square stone block (wall pockets).
function addBoulder(id,p,a=0,r=0){const body=world.createDynamicBody({position:p,angle:a,linearDamping:r?.8:2.5,angularDamping:r?1:3,userData:{boulder:id}});if(r)body.createFixture(P.Circle(r),{density:.9,friction:.5,restitution:.05});else body.createFixture(P.Box(1.8,1.8),{density:6,friction:.6,restitution:.05});const b={id,body,r};boulders.push(b);return b;}
// Boulders at rest don't change: a snapshot carries only the moving ones (with their velocity, so pages can lead them
// to the present), and every boulder once a second (all=true) for anyone who just arrived.
function boulderState(all=true){const out=[];for(const b of boulders){const awake=b.body.isAwake();if(!all&&!awake&&b.sentRest)continue;b.sentRest=!awake;const p=b.body.getPosition(),v=b.body.getLinearVelocity(),o={id:b.id,r:b.r||undefined,x:+p.x.toFixed(2),y:+p.y.toFixed(2),a:+b.body.getAngle().toFixed(2)};if(awake){o.vx=+v.x.toFixed(2);o.vy=+v.y.toFixed(2);o.w=+b.body.getAngularVelocity().toFixed(2);}out.push(o);}return out;}
function travelZone(to,arrival){arrival??=ZONES[to]?.arrival;if(!piloting)return toast('Take the helm before travelling.');if(!ZONES[to])to=zonePortals()[0]?.to;if(!to)return;if(ZONES[to].mission&&!(typeof missionOpen==='function'&&missionOpen(to)))return toast(zoneDef(to).name+' is a mission zone and is closed right now.');snapshotZone();zone=to;setupZone(true,arrival??(isCombatZone()?PORTAL_ARRIVAL:'entry'));updateShipMass();save(true);const def=zoneDef();if(def.mission)addScore(SCORE.missionEnter);toast(def.kind==='combat'?def.name+' — '+def.blurb+'. Loaded RC turrets mine rock. Fly onto a cyan portal and press Q to leave.':'Arrived at '+def.name+'. '+def.blurb);}

function usePortal(){if(!piloting)return;if(anchored())return toast('A Freeport anchor is aboard: dismantle it to leave the Freeport.');const q=nearestPortal();if(!q||q.distance>PORTAL_RANGE)return toast('Fly onto a cyan portal (see the minimap), then press Q.');travelZone(q.to);portalCooldown=1;}

// ℵ25: "Zones no longer use a fixed seed, and will generate with a new seed each regeneration."
// Seeds stay below the save codec's 1e6 numeric limit.
function freshSeed(previous){let s;do s=Math.floor(Math.random()*999983);while(s===previous);return s;}
function regenerateZone(){if(typeof zoneEvent==='function'&&isCombatZone())return zoneEvent({type:'regenRequest',zone});snapshotZone();const old=zoneData[zone];zoneData[zone]={seed:freshSeed(old.seed),mined:[],loot:old.loot||[]};setupZone(true);updateShipMass();save(true);toastAll(zoneDef().name+' regenerated with a new layout. Your ship and loose cargo were kept; the ship is at the entry portal.');}
