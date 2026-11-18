'use strict';
const native=require('../build/physics.node');let nextWorld=1,nextBody=1;const ids=new WeakMap(),staticCache=new WeakMap();
function step(world,dt){
 const wid=world.__nativeID??=nextWorld++;const bodies=[],map=new Map(),live=[];
 for(let b=world.getBodyList();b;b=b.getNext()){
  let id=ids.get(b);if(!id){id=nextBody++;ids.set(b,id);}map.set(id,b);live.push(id);const refs=[];for(let f=b.getFixtureList();f;f=f.getNext())refs.push(f);if(b.getType()==='static'){const old=staticCache.get(b);if(old&&refs.length===old.length&&refs.every((f,i)=>f===old[i]))continue;staticCache.set(b,refs);}else staticCache.delete(b);const fixtures=[];
  for(let f=b.getFixtureList();f;f=f.getNext()){const s=f.getShape();const entry={shape:s.getType(),density:f.getDensity(),friction:f.getFriction(),restitution:f.getRestitution(),sensor:f.isSensor(),category:f.getFilterCategoryBits(),mask:f.getFilterMaskBits(),group:f.getFilterGroupIndex()};if(entry.shape==='circle'){entry.radius=s.m_radius;entry.center=[s.m_p.x,s.m_p.y];}else if(entry.shape==='polygon')entry.vertices=s.m_vertices.map(v=>[v.x,v.y]);else throw Error('Unsupported native shape '+entry.shape);fixtures.push(entry);}
  const p=b.getPosition(),v=b.getLinearVelocity(),c=b.getLocalCenter();bodies.push({id,type:{static:0,kinematic:1,dynamic:2}[b.getType()],p:[p.x,p.y],v:[v.x,v.y],angle:b.getAngle(),spin:b.getAngularVelocity(),force:[b.m_force.x,b.m_force.y],torque:b.m_torque,gravityScale:b.getGravityScale(),linearDamping:b.getLinearDamping(),angularDamping:b.getAngularDamping(),mass:b.getMass(),inertia:b.getInertia(),center:[c.x,c.y],active:b.isActive(),fixed:b.isFixedRotation(),bullet:b.isBullet(),allowSleep:b.isSleepingAllowed(),awake:b.isAwake(),fixtures});
 }
 const g=world.getGravity(),result=JSON.parse(native.step(JSON.stringify({id:wid,gravity:[g.x,g.y],dt,bodies,live})));
 for(const r of result){const b=map.get(r.id);b.setTransform({x:r.p[0],y:r.p[1]},r.angle);b.setLinearVelocity({x:r.v[0],y:r.v[1]});b.setAngularVelocity(r.spin);b.setAwake(r.awake);}
 world.clearForces();
 // Keep the read-only Planck broadphase/contact mirror in sync for gameplay queries.
 // Bodies moved by setTransform only update the broadphase; Planck looks for new pairs during step() only when
 // m_newFixture is set, so without this, contacts appeared only after something was spawned (stacks that slid
 // together never 'touched' and so never merged).
 world.m_newFixture=true;world.step(0);return result;
}
function destroy(world){if(world?.__nativeID){native.step(JSON.stringify({id:world.__nativeID,destroy:true}));delete world.__nativeID;}}
module.exports={step,destroy};
