'use strict';
const native=require('../build/physics.node');let nextWorld=1,nextBody=1;const ids=new WeakMap(),fixtureCache=new WeakMap(),sent=new WeakMap();
// Each step sends the native solver only what changed since it last saw a body: new bodies, bodies the game moved,
// pushed, woke, resized or re-shaped (fixtures are sent only when they change). A body the game left alone — most
// loose cargo, resting most of the time — isn't re-sent, and the solver only returns bodies that are awake (or just
// fell asleep), so a ship's resting piles cost nothing per tick.
const TYPE={static:0,kinematic:1,dynamic:2};
function step(world,dt){
 const wid=world.__nativeID??=nextWorld++;const bodies=[],map=new Map(),live=[];
 for(let b=world.getBodyList();b;b=b.getNext()){
  let id=ids.get(b);if(!id){id=nextBody++;ids.set(b,id);}map.set(id,b);live.push(id);
  const type=b.getType(),old=fixtureCache.get(b),refs=[],sig=[];let sameFixtures=!!old;
  for(let f=b.getFixtureList(),k=0;f;f=f.getNext(),k++){refs.push(f);if(sameFixtures&&old.refs[k]!==f)sameFixtures=false;
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
   body.fixtures=fixtures;fixtureCache.set(b,{refs,sig});}
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
 world.m_newFixture=true;world.step(0);return result;
}
function destroy(world){if(world?.__nativeID){native.step(JSON.stringify({id:world.__nativeID,destroy:true}));delete world.__nativeID;}}
module.exports={step,destroy};
