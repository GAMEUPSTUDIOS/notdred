'use strict';
const native=require('../build/physics.node');let nextWorld=1,nextBody=1;const ids=new WeakMap(),fixtureCache=new WeakMap(),sent=new WeakMap();
// Each step sends the native solver only what changed since it last saw a body: new bodies, bodies the game moved,
// pushed, woke, resized or re-shaped (fixtures are sent only when they change). A body the game left alone — most
// loose cargo, resting most of the time — isn't re-sent, and the solver only returns bodies that are awake (or just
// fell asleep), so a ship's resting piles cost nothing per tick.
const TYPE={static:0,kinematic:1,dynamic:2};
// Change tracking, so a tick only walks bodies that changed: every way a body's fixtures change — added, removed, or
// altered in place (collision filter, sensor flag, material) — bumps that body's __fixVer. Static bodies count too:
// the collision skin switches a ship's tile boxes off (mask 0) after they're made, and that never reached the native
// world (it kept colliding with the boxes: seams, hops) for ships built or loaded before the skin pass. Patched once on
// the shared planck module, before any world exists, so every room and zone context sees it.
{const planck=require('../dist/vendor/planck.min.js'),bump=b=>{if(b)b.__fixVer=(b.__fixVer|0)+1;};
 for(const m of ['createFixture','destroyFixture']){const orig=planck.Body.prototype[m];planck.Body.prototype[m]=function(...a){bump(this);return orig.apply(this,a);};}
 for(const m of ['setFilterData','setSensor','setFriction','setRestitution','setDensity']){const orig=planck.Fixture.prototype[m];if(typeof orig==='function')planck.Fixture.prototype[m]=function(...a){bump(this.getBody?.());return orig.apply(this,a);};}}
function watchFixtures(){}
{const planck=require('../dist/vendor/planck.min.js'),orig=planck.World.prototype.destroyBody;planck.World.prototype.destroyBody=function(b){if(b&&b.__nid&&this.__nativeID&&(b.__nsent||b.__nfx)){(this.__nativeRemoved??=[]).push(b.__nid);this.__nativeMap?.delete(b.__nid);}if(b){b.__nsent=null;b.__nfx=null;}return orig.call(this,b);};}
// Shapes as the native side wants them (JSON; sent only for new bodies and when a body's fixtures change).
function fixtureList(refs){return refs.map(f=>{const s=f.getShape();const entry={shape:s.getType(),density:f.getDensity(),friction:f.getFriction(),restitution:f.getRestitution(),sensor:f.isSensor(),category:f.getFilterCategoryBits(),mask:f.getFilterMaskBits(),group:f.getFilterGroupIndex()};
 if(entry.shape==='circle'){entry.radius=s.m_radius;entry.center=[s.m_p.x,s.m_p.y];}else if(entry.shape==='polygon')entry.vertices=s.m_vertices.map(v=>[v.x,v.y]);else if(entry.shape==='chain'){entry.loop=!!s.m_isLoop;entry.vertices=s.m_vertices.slice(0,s.m_isLoop?s.m_count-1:s.m_count).map(v=>[v.x,v.y]);}else throw Error('Unsupported native shape '+entry.shape);return entry;});}
const REC=20,OUT=8;let recBuf=new Float64Array(REC*256);
function step(world,dt,opts=null){
 if(!native.step2)return stepJSON(world,dt,opts);
 const wid=world.__nativeID??=nextWorld++;const map=world.__nativeMap||(world.__nativeMap=new Map()),shapes=[];let n=0;
 // Per-body state lives on the body (__nid, __nfx, __nsent): an unchanged static body — a zone's hundreds of rock pieces
 // — is a handful of property reads per tick. Removals are recorded by World#destroyBody (patched above).
 for(let b=world.getBodyList();b;b=b.getNext()){
  let id=b.__nid;if(!id)id=b.__nid=nextBody++;
  const type=b.m_type||b.getType(),old=b.__nfx,sameFixtures=!!old&&old.ver===(b.__fixVer|0)&&old.head===b.m_fixtureList;let refs=null;
  if(type==='static'&&sameFixtures){const L=b.__nsent,q=b.m_xf.p;if(L&&q.x===L.px&&q.y===L.py&&b.m_sweep.a===L.angle)continue;}
  map.set(id,b);
  if(!sameFixtures){refs=[];for(let f=b.getFixtureList();f;f=f.getNext())refs.push(f);}
  const p=b.getPosition(),v=b.getLinearVelocity(),c=b.getLocalCenter(),angle=b.getAngle(),spin=b.getAngularVelocity(),awake=b.isAwake(),fx=b.m_force.x,fy=b.m_force.y,torque=b.m_torque;
  const flags=(b.isActive()?1:0)|(b.isFixedRotation()?2:0)|(b.isBullet()?4:0)|(b.isSleepingAllowed()?8:0)|(awake?16:0),gs=b.getGravityScale(),ld=b.getLinearDamping(),ad=b.getAngularDamping(),mass=b.getMass(),inertia=b.getInertia();
  const L=b.__nsent;
  if(L&&sameFixtures&&!fx&&!fy&&!torque&&p.x===L.px&&p.y===L.py&&v.x===L.vx&&v.y===L.vy&&angle===L.angle&&spin===L.spin&&flags===L.flags&&gs===L.gs&&ld===L.ld&&ad===L.ad&&mass===L.mass&&inertia===L.inertia&&c.x===L.cx&&c.y===L.cy)continue;
  if(!sameFixtures){shapes.push({id,type:TYPE[type],p:[p.x,p.y],fixtures:fixtureList(refs)});b.__nfx={head:b.getFixtureList(),ver:b.__fixVer|0};}
  if((n+1)*REC>recBuf.length){const g=new Float64Array(recBuf.length*2);g.set(recBuf);recBuf=g;}
  const o=n*REC;recBuf[o]=id;recBuf[o+1]=TYPE[type];recBuf[o+2]=p.x;recBuf[o+3]=p.y;recBuf[o+4]=v.x;recBuf[o+5]=v.y;recBuf[o+6]=angle;recBuf[o+7]=spin;recBuf[o+8]=fx;recBuf[o+9]=fy;recBuf[o+10]=torque;
  recBuf[o+11]=gs;recBuf[o+12]=ld;recBuf[o+13]=ad;recBuf[o+14]=mass;recBuf[o+15]=inertia;recBuf[o+16]=c.x;recBuf[o+17]=c.y;recBuf[o+18]=flags;recBuf[o+19]=0;n++;
  b.__nsent={px:p.x,py:p.y,vx:v.x,vy:v.y,angle,spin,flags,gs,ld,ad,mass,inertia,cx:c.x,cy:c.y};
 }
 const removed=world.__nativeRemoved||[];world.__nativeRemoved=[];for(const id of removed)map.delete(id);
 const structural=shapes.length||removed.length?JSON.stringify({shapes,removed}):'';
 const g=world.getGravity(),out=native.step2(wid,dt,g.x,g.y,structural,recBuf.subarray(0,n*REC));
 for(let k=0;k<out.length;k+=OUT){const b=map.get(out[k]);if(!b)continue;b.setTransform({x:out[k+1],y:out[k+2]},out[k+5]);b.setLinearVelocity({x:out[k+3],y:out[k+4]});b.setAngularVelocity(out[k+6]);b.setAwake(out[k+7]===1);
  const L=b.__nsent;if(L){const p=b.getPosition(),v=b.getLinearVelocity();L.px=p.x;L.py=p.y;L.vx=v.x;L.vy=v.y;L.angle=b.getAngle();L.spin=b.getAngularVelocity();L.flags=(L.flags&~16)|(b.isAwake()?16:0);}}
 world.clearForces();
 // Keep the read-only Planck broadphase/contact mirror in sync for gameplay queries.
 // Bodies moved by setTransform only update the broadphase; Planck looks for new pairs during step() only when
 // m_newFixture is set, so without this, contacts appeared only after something was spawned (stacks that slid
 // together never 'touched' and so never merged). A world that never reads contact lists — the shared zone uses only
 // raycasts and AABB queries, which follow setTransform — skips it: {contacts:false}.
 if(opts?.contacts!==false){world.m_newFixture=true;world.step(0);}return out;
}
// The original all-JSON bridge, used only with an older build/physics.node that has no step2.
function stepJSON(world,dt,opts=null){
 const wid=world.__nativeID??=nextWorld++;const bodies=[],map=new Map(),live=[];
 for(let b=world.getBodyList();b;b=b.getNext()){
  let id=ids.get(b);if(!id){id=nextBody++;ids.set(b,id);}map.set(id,b);live.push(id);
  const type=b.getType(),old=fixtureCache.get(b),refs=[],sig=[];let sameFixtures=!!old&&old.ver===(b.__fixVer|0);
  for(let f=b.getFixtureList(),k=0;f;f=f.getNext(),k++){if(k===0)watchFixtures(f);refs.push(f);if(sameFixtures&&old.refs[k]!==f)sameFixtures=false;
   // Moving bodies: a fixture changed in place (collision filter — doors letting ranks through —, sensor, material) counts too.
   if(type!=='static'){const o=k*7;sig.push(f.getFilterCategoryBits(),f.getFilterMaskBits(),f.getFilterGroupIndex(),f.isSensor()?1:0,f.getDensity(),f.getFriction(),f.getRestitution());if(sameFixtures)for(let q=o;q<o+7;q++)if(old.sig[q]!==sig[q]){sameFixtures=false;break;}}}
  if(sameFixtures&&refs.length!==old.refs.length)sameFixtures=false;
  if(type==='static'&&sameFixtures)continue;
  const p=b.getPosition(),v=b.getLinearVelocity(),c=b.getLocalCenter(),angle=b.getAngle(),spin=b.getAngularVelocity(),awake=b.isAwake(),fx=b.m_force.x,fy=b.m_force.y,torque=b.m_torque;
  const props=[TYPE[type],b.getGravityScale(),b.getLinearDamping(),b.getAngularDamping(),b.getMass(),b.getInertia(),c.x,c.y,b.isActive(),b.isFixedRotation(),b.isBullet(),b.isSleepingAllowed()];
  const L=sent.get(b);
  if(L&&sameFixtures&&!fx&&!fy&&!torque&&p.x===L.p[0]&&p.y===L.p[1]&&v.x===L.v[0]&&v.y===L.v[1]&&angle===L.angle&&spin===L.spin&&awake===L.awake&&props.every((x,i)=>x===L.props[i]))continue;
  const body={id,type:props[0],p:[p.x,p.y],v:[v.x,v.y],angle,spin,force:[fx,fy],torque,gravityScale:props[1],linearDamping:props[2],angularDamping:props[3],mass:props[4],inertia:props[5],center:[c.x,c.y],active:props[8],fixed:props[9],bullet:props[10],allowSleep:props[11],awake};
  if(!sameFixtures){const fixtures=[];
   for(const f of refs){const s=f.getShape();const entry={shape:s.getType(),density:f.getDensity(),friction:f.getFriction(),restitution:f.getRestitution(),sensor:f.isSensor(),category:f.getFilterCategoryBits(),mask:f.getFilterMaskBits(),group:f.getFilterGroupIndex()};if(entry.shape==='circle'){entry.radius=s.m_radius;entry.center=[s.m_p.x,s.m_p.y];}else if(entry.shape==='polygon')entry.vertices=s.m_vertices.map(v=>[v.x,v.y]);else if(entry.shape==='chain'){entry.loop=!!s.m_isLoop;entry.vertices=s.m_vertices.slice(0,s.m_isLoop?s.m_count-1:s.m_count).map(v=>[v.x,v.y]);}else throw Error('Unsupported native shape '+entry.shape);fixtures.push(entry);}
   body.fixtures=fixtures;fixtureCache.set(b,{refs,sig,ver:b.__fixVer|0});}
  bodies.push(body);if(type!=='static')sent.set(b,{p:body.p,v:body.v,angle,spin,awake,props});
 }
 const g=world.getGravity(),result=JSON.parse(native.step(JSON.stringify({id:wid,gravity:[g.x,g.y],dt,bodies,live})));
 for(const r of result){const b=map.get(r.id);if(!b)continue;b.setTransform({x:r.p[0],y:r.p[1]},r.angle);b.setLinearVelocity({x:r.v[0],y:r.v[1]});b.setAngularVelocity(r.spin);b.setAwake(r.awake);
  // What the game now holds for this body is exactly what the solver has, so it needn't be sent back next step.
  const L=sent.get(b);if(L){const p=b.getPosition(),v=b.getLinearVelocity();L.p=[p.x,p.y];L.v=[v.x,v.y];L.angle=b.getAngle();L.spin=b.getAngularVelocity();L.awake=b.isAwake();}}
 world.clearForces();
 // Keep the read-only Planck broadphase/contact mirror in sync for gameplay queries.
 // Bodies moved by setTransform only update the broadphase; Planck looks for new pairs during step() only when
 // m_newFixture is set, so without this, contacts appeared only after something was spawned (stacks that slid
 // together never 'touched' and so never merged).
 // (A world that never reads contact lists — the shared zone uses only raycasts and AABB queries, which follow
 // setTransform — skips this: {contacts:false}.)
 if(opts?.contacts!==false){world.m_newFixture=true;world.step(0);}return result;
}
function destroy(world){if(world?.__nativeID){native.step(JSON.stringify({id:world.__nativeID,destroy:true}));delete world.__nativeID;delete world.__nativeLive;delete world.__nativeMap;world.__nativeRemoved=[];}}
module.exports={step,destroy};
