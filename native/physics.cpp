// Native authoritative Box2D solver. Node owns sessions/rules; browsers only send intents.
#include "node_api.h"
#include "json.hpp"
#include <box2d/box2d.h>
#include <unordered_map>
#include <unordered_set>
#include <memory>
#include <vector>
#include <cstring>
#include <cmath>
#include <algorithm>
using J=nlohmann::json;
// fixtures: the last fixture list's signature; awake: awake after the last step; touched: sent this step.
// still: seconds this body has been below Box2D's sleep tolerances (see the end of call2).
struct Body {b2Body* p;std::string fixtures;bool awake=true;bool touched=false;float still=0;};
struct World {b2World physics{{0,20}};std::unordered_map<int,Body> bodies;};
static std::unordered_map<int,std::unique_ptr<World>> worlds;
static b2Vec2 vec(const J& a){return {a[0].get<float>(),a[1].get<float>()};}
static void buildFixtures(b2Body* b,const J& list){while(b->GetFixtureList())b->DestroyFixture(b->GetFixtureList());for(auto& f:list){
   b2FixtureDef fd;fd.density=f.value("density",0.f);fd.friction=f.value("friction",.2f);fd.restitution=f.value("restitution",0.f);fd.isSensor=f.value("sensor",false);fd.filter.categoryBits=f.value("category",1);fd.filter.maskBits=f.value("mask",65535);fd.filter.groupIndex=f.value("group",0);
   b2PolygonShape poly;b2CircleShape circle;b2ChainShape chain;
   if(f.at("shape")=="chain"){std::vector<b2Vec2> vs;for(auto& v:f.at("vertices"))vs.push_back(vec(v));if(vs.size()<3)continue;if(f.value("loop",true))chain.CreateLoop(vs.data(),(int)vs.size());else chain.CreateChain(vs.data(),(int)vs.size(),vs.front(),vs.back());fd.shape=&chain;}
   else if(f.at("shape")=="circle"){circle.m_radius=f.at("radius");circle.m_p=vec(f.at("center"));fd.shape=&circle;}else{b2Vec2 vs[8];int count=0;for(auto& v:f.at("vertices")){if(count>=8)break;vs[count++]=vec(v);}if(count<3)continue;poly.Set(vs,count);fd.shape=&poly;}
   b->CreateFixture(&fd);
  }}
static J call(const J& in){
 int id=in.at("id");
 if(in.value("destroy",false)){worlds.erase(id);return J::array();}
 if(!worlds.count(id))worlds[id]=std::make_unique<World>();
 auto& w=*worlds[id];w.physics.SetGravity(vec(in.at("gravity")));
 std::unordered_set<int> seen;for(auto& n:in.at("live"))seen.insert(n.get<int>());
 for(auto& j:in.at("bodies")){
  int n=j.at("id");seen.insert(n);b2Body* b;
  if(!w.bodies.count(n)){b2BodyDef d;d.type=(b2BodyType)j.at("type").get<int>();d.position=vec(j.at("p"));b=w.physics.CreateBody(&d);w.bodies[n]={b,""};}else b=w.bodies[n].p;
  auto& record=w.bodies[n];record.touched=true;
  // Fixtures come only when they change (and always for a new body).
  std::string signature=j.contains("fixtures")?j.at("fixtures").dump():record.fixtures;
  if(record.fixtures!=signature){buildFixtures(b,j.at("fixtures"));record.fixtures=signature;}
  b->SetType((b2BodyType)j.at("type").get<int>());b->SetEnabled(j.at("active"));b->SetFixedRotation(j.at("fixed"));b->SetBullet(j.at("bullet"));b->SetGravityScale(j.at("gravityScale"));b->SetLinearDamping(j.at("linearDamping"));b->SetAngularDamping(j.at("angularDamping"));b->SetSleepingAllowed(j.at("allowSleep"));
  b2Vec2 p=vec(j.at("p")),v=vec(j.at("v"));float angle=j.at("angle");
  if((p-b->GetPosition()).LengthSquared()>1e-10f||fabs(angle-b->GetAngle())>1e-6)b->SetTransform(p,angle);
  b->SetLinearVelocity(v);b->SetAngularVelocity(j.at("spin"));
  if(b->GetType()==b2_dynamicBody&&j.value("mass",0.f)>0){b2MassData md;md.mass=j.at("mass");md.center=vec(j.at("center"));md.I=j.at("inertia");b->SetMassData(&md);}
  b->SetAwake(j.at("awake"));auto force=vec(j.at("force"));if(force.LengthSquared()>0)b->ApplyForceToCenter(force,true);float torque=j.at("torque");if(torque)b->ApplyTorque(torque,true);
 }
 for(auto it=w.bodies.begin();it!=w.bodies.end();){if(!seen.count(it->first)){w.physics.DestroyBody(it->second.p);it=w.bodies.erase(it);}else ++it;}
 float dt=in.at("dt");if(!std::isfinite(dt)||dt<0||dt>1.f/15)throw std::runtime_error("Invalid timestep");
 // Two substeps reduce high-speed tunnelling and make stacks less jittery.
 w.physics.SetAutoClearForces(false);for(int i=0;i<2;i++)w.physics.Step(dt*.5f,8,3);w.physics.ClearForces();
 // Only bodies that moved are returned: awake ones, ones that just fell asleep (their resting pose), and ones the
 // game sent this step. Resting cargo isn't reported again until something wakes it.
 J out=J::array();for(auto& [n,r]:w.bodies){auto b=r.p;bool awake=b->IsAwake(),report=awake||r.awake||r.touched;r.awake=awake;r.touched=false;if(b->GetType()==b2_staticBody||!report)continue;auto p=b->GetPosition(),v=b->GetLinearVelocity();out.push_back({{"id",n},{"p",{p.x,p.y}},{"v",{v.x,v.y}},{"angle",b->GetAngle()},{"spin",b->GetAngularVelocity()},{"awake",awake}});}return out;
}
static napi_value step(napi_env env,napi_callback_info info){
 try{size_t argc=1;napi_value argv[1];napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);size_t len=0;napi_get_value_string_utf8(env,argv[0],nullptr,0,&len);if(len>16*1024*1024)throw std::runtime_error("World too large");std::string input(len+1,'\0');napi_get_value_string_utf8(env,argv[0],input.data(),input.size(),&len);input.resize(len);std::string out=call(J::parse(input)).dump();napi_value result;napi_create_string_utf8(env,out.c_str(),out.size(),&result);return result;}catch(const std::exception& e){napi_throw_error(env,nullptr,e.what());return nullptr;}
}

// ---- Fast path (step2) -----------------------------------------------------------------------------------------
// The per-step state of every body the game touched travels as plain numbers (REC values each); only structural
// changes — new bodies, new or changed fixtures, removed bodies — travel as JSON, and that string is empty on most
// steps. Parsing ~10 KB of JSON each step used to cost several times the physics itself.
//   step2(worldId, dt, gx, gy, structuralJson, Float64Array records) -> Float64Array of OUT values per moved body
//   structural: {destroy?:true, removed:[id…], shapes:[{id,type,p:[x,y],fixtures:[…]}…]}
//   record: id,type,px,py,vx,vy,angle,spin,fx,fy,torque,gravityScale,linearDamping,angularDamping,mass,inertia,cx,cy,
//           flags(1 active,2 fixedRotation,4 bullet,8 allowSleep,16 awake),0
//   out:    id,px,py,vx,vy,angle,spin,awake
static const int REC=20,OUT=8;
static std::vector<double> call2(int id,double dt,double gx,double gy,const std::string& structural,const double* rec,size_t n){
 if(!structural.empty()){J in=J::parse(structural);if(in.value("destroy",false)){worlds.erase(id);return {};}}
 if(!worlds.count(id))worlds[id]=std::make_unique<World>();auto& w=*worlds[id];w.physics.SetGravity(b2Vec2((float)gx,(float)gy));
 if(!structural.empty()){J in=J::parse(structural);
  if(in.contains("removed"))for(auto& r:in.at("removed")){int n2=r.get<int>();auto it=w.bodies.find(n2);if(it!=w.bodies.end()){w.physics.DestroyBody(it->second.p);w.bodies.erase(it);}}
  if(in.contains("shapes"))for(auto& j:in.at("shapes")){int n2=j.at("id");b2Body* b;if(!w.bodies.count(n2)){b2BodyDef d;d.type=(b2BodyType)j.at("type").get<int>();d.position=vec(j.at("p"));b=w.physics.CreateBody(&d);w.bodies[n2]={b,""};}else b=w.bodies[n2].p;buildFixtures(b,j.at("fixtures"));}}
 if(n%REC)throw std::runtime_error("Bad record block");
 for(size_t k=0;k<n;k+=REC){const double* r=rec+k;int n2=(int)r[0];b2Body* b;auto it=w.bodies.find(n2);
  if(it==w.bodies.end()){b2BodyDef d;d.type=(b2BodyType)(int)r[1];d.position.Set((float)r[2],(float)r[3]);b=w.physics.CreateBody(&d);w.bodies[n2]={b,""};}else b=it->second.p;
  auto& record=w.bodies[n2];record.touched=true;int flags=(int)r[18];
  b->SetType((b2BodyType)(int)r[1]);b->SetEnabled(flags&1);b->SetFixedRotation(flags&2);b->SetBullet(flags&4);b->SetGravityScale((float)r[11]);b->SetLinearDamping((float)r[12]);b->SetAngularDamping((float)r[13]);b->SetSleepingAllowed(flags&8);
  b2Vec2 p((float)r[2],(float)r[3]),v((float)r[4],(float)r[5]);float angle=(float)r[6];
  if((p-b->GetPosition()).LengthSquared()>1e-10f||fabs(angle-b->GetAngle())>1e-6)b->SetTransform(p,angle);
  // Box2D treats every velocity update and every SetAwake(true) as a wake-up that restarts the body's sleep timer, so a
  // body the game re-sends each tick (the crew member, standing still) kept every pile it touched awake for good. Only
  // real changes are applied: velocities differing by more than a hair, and the awake flag when it actually flips.
  if((v-b->GetLinearVelocity()).LengthSquared()>4e-6f)b->SetLinearVelocity(v);
  if(fabs((float)r[7]-b->GetAngularVelocity())>2e-3f)b->SetAngularVelocity((float)r[7]);
  if(b->GetType()==b2_dynamicBody&&r[14]>0){b2MassData md;md.mass=(float)r[14];md.center.Set((float)r[16],(float)r[17]);md.I=(float)r[15];b->SetMassData(&md);}
  if(((flags&16)!=0)!=b->IsAwake())b->SetAwake(flags&16);b2Vec2 force((float)r[8],(float)r[9]);if(force.LengthSquared()>0)b->ApplyForceToCenter(force,true);if(r[10])b->ApplyTorque((float)r[10],true);}
 if(!std::isfinite(dt)||dt<0||dt>1.0/15)throw std::runtime_error("Invalid timestep");
 w.physics.SetAutoClearForces(false);for(int i=0;i<2;i++)w.physics.Step((float)dt*.5f,8,3);w.physics.ClearForces();
 // Box2D only lets a group of touching bodies sleep once every overlap in it is fully resolved. A big pile of cargo
 // crammed against walls never quite gets there, so it stayed awake (and was solved every tick) forever though nothing
 // moved. Here each body keeps its own stillness time (under Box2D's sleep tolerances); touching awake bodies are
 // linked into groups, and a group whose members have all been still for STILL_SLEEP seconds is put to sleep together
 // (one at a time didn't work: an awake neighbour wakes a sleeping body straight away). Anything that touches it later
 // wakes it as usual.
 {const float STILL_SLEEP=1.0f,lin=b2_linearSleepTolerance*b2_linearSleepTolerance,ang=b2_angularSleepTolerance*b2_angularSleepTolerance;
  std::unordered_map<b2Body*,int> idx;std::vector<Body*> recs;
  for(auto& [n2,r]:w.bodies){auto b=r.p;if(b->GetType()==b2_staticBody)continue;if(!b->IsAwake()||!b->IsEnabled()){r.still=0;continue;}
   bool calm=b->IsSleepingAllowed()&&b->GetLinearVelocity().LengthSquared()<=lin&&b->GetAngularVelocity()*b->GetAngularVelocity()<=ang;r.still=calm?r.still+(float)dt:0;
   idx[b]=(int)recs.size();recs.push_back(&r);}
  if(!recs.empty()){std::vector<int> up(recs.size());for(size_t k=0;k<up.size();k++)up[k]=(int)k;
   auto find=[&](int a){while(up[a]!=a){up[a]=up[up[a]];a=up[a];}return a;};
   for(auto* r:recs)for(b2ContactEdge* e=r->p->GetContactList();e;e=e->next){b2Contact* c=e->contact;if(!c->IsTouching()||!c->IsEnabled()||c->GetFixtureA()->IsSensor()||c->GetFixtureB()->IsSensor())continue;
    auto ia=idx.find(r->p),ib=idx.find(e->other);if(ib==idx.end())continue;int a=find(ia->second),b=find(ib->second);if(a!=b)up[a]=b;}
   std::vector<float> minStill(recs.size(),1e9f);for(size_t k=0;k<recs.size();k++){int root=find((int)k);minStill[root]=std::min(minStill[root],recs[k]->still);}
   for(size_t k=0;k<recs.size();k++)if(minStill[find((int)k)]>=STILL_SLEEP){recs[k]->p->SetAwake(false);recs[k]->still=0;}}}
 std::vector<double> out;for(auto& [n2,r]:w.bodies){auto b=r.p;bool awake=b->IsAwake(),report=awake||r.awake||r.touched;r.awake=awake;r.touched=false;if(b->GetType()==b2_staticBody||!report)continue;auto p=b->GetPosition(),v=b->GetLinearVelocity();double o[OUT]={(double)n2,p.x,p.y,v.x,v.y,b->GetAngle(),b->GetAngularVelocity(),awake?1.0:0.0};out.insert(out.end(),o,o+OUT);}
 return out;}
static napi_value step2(napi_env env,napi_callback_info info){
 try{size_t argc=6;napi_value argv[6];napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);if(argc<6)throw std::runtime_error("step2 needs 6 arguments");
  double id,dt,gx,gy;napi_get_value_double(env,argv[0],&id);napi_get_value_double(env,argv[1],&dt);napi_get_value_double(env,argv[2],&gx);napi_get_value_double(env,argv[3],&gy);
  size_t len=0;napi_get_value_string_utf8(env,argv[4],nullptr,0,&len);if(len>16*1024*1024)throw std::runtime_error("World too large");std::string structural(len+1,'\0');napi_get_value_string_utf8(env,argv[4],structural.data(),structural.size(),&len);structural.resize(len);
  napi_typedarray_type tt;size_t count=0;void* data=nullptr;napi_value ab;size_t off=0;if(napi_get_typedarray_info(env,argv[5],&tt,&count,&data,&ab,&off)!=napi_ok||tt!=napi_float64_array)throw std::runtime_error("records must be a Float64Array");
  std::vector<double> out=call2((int)id,dt,gx,gy,structural,(const double*)data,count);
  void* buf=nullptr;napi_value arr,res;napi_create_arraybuffer(env,out.size()*sizeof(double),&buf,&arr);if(!out.empty())memcpy(buf,out.data(),out.size()*sizeof(double));napi_create_typedarray(env,napi_float64_array,out.size(),arr,0,&res);return res;}
 catch(const std::exception& e){napi_throw_error(env,nullptr,e.what());return nullptr;}
}
static napi_value init(napi_env env,napi_value exports){napi_value f;napi_create_function(env,"step",4,step,nullptr,&f);napi_set_named_property(env,exports,"step",f);napi_value f2;napi_create_function(env,"step2",5,step2,nullptr,&f2);napi_set_named_property(env,exports,"step2",f2);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
