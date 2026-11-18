// Native authoritative Box2D solver. Node owns sessions/rules; browsers only send intents.
#include "node_api.h"
#include "json.hpp"
#include <box2d/box2d.h>
#include <unordered_map>
#include <unordered_set>
#include <memory>
#include <cmath>
using J=nlohmann::json;
// fixtures: the last fixture list's signature; awake: awake after the last step; touched: sent this step.
struct Body {b2Body* p;std::string fixtures;bool awake=true;bool touched=false;};
struct World {b2World physics{{0,20}};std::unordered_map<int,Body> bodies;};
static std::unordered_map<int,std::unique_ptr<World>> worlds;
static b2Vec2 vec(const J& a){return {a[0].get<float>(),a[1].get<float>()};}
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
  if(record.fixtures!=signature){while(b->GetFixtureList())b->DestroyFixture(b->GetFixtureList());for(auto& f:j.at("fixtures")){
   b2FixtureDef fd;fd.density=f.value("density",0.f);fd.friction=f.value("friction",.2f);fd.restitution=f.value("restitution",0.f);fd.isSensor=f.value("sensor",false);fd.filter.categoryBits=f.value("category",1);fd.filter.maskBits=f.value("mask",65535);fd.filter.groupIndex=f.value("group",0);
   b2PolygonShape poly;b2CircleShape circle;
   if(f.at("shape")=="circle"){circle.m_radius=f.at("radius");circle.m_p=vec(f.at("center"));fd.shape=&circle;}else{b2Vec2 vs[8];int count=0;for(auto& v:f.at("vertices")){if(count>=8)break;vs[count++]=vec(v);}if(count<3)continue;poly.Set(vs,count);fd.shape=&poly;}
   b->CreateFixture(&fd);
  }record.fixtures=signature;}
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
static napi_value init(napi_env env,napi_value exports){napi_value f;napi_create_function(env,"step",4,step,nullptr,&f);napi_set_named_property(env,exports,"step",f);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
