#include "physics.h"
namespace nd {
void World::step(double dt){
 w.SetAutoClearForces(false);for(int i=0;i<2;i++)w.Step((float)dt*.5f,8,3);w.ClearForces();
 const float STILL_SLEEP=1.0f,lin=b2_linearSleepTolerance*b2_linearSleepTolerance,ang=b2_angularSleepTolerance*b2_angularSleepTolerance;
 std::unordered_map<b2Body*,int> idx;std::vector<b2Body*> bodies;
 for(b2Body* b=w.GetBodyList();b;b=b->GetNext()){if(b->GetType()==b2_staticBody)continue;if(!b->IsAwake()||!b->IsEnabled()){still[b]=0;continue;}
  bool rests=false;for(b2ContactEdge* e=b->GetContactList();e&&!rests;e=e->next)rests=e->contact->IsTouching()&&e->contact->IsEnabled()&&!e->contact->GetFixtureA()->IsSensor()&&!e->contact->GetFixtureB()->IsSensor();
  bool calm=rests&&b->IsSleepingAllowed()&&b->GetLinearVelocity().LengthSquared()<=lin&&b->GetAngularVelocity()*b->GetAngularVelocity()<=ang;float& s=still[b];s=calm?s+(float)dt:0;
  idx[b]=(int)bodies.size();bodies.push_back(b);}
 if(bodies.empty())return;std::vector<int> up(bodies.size());for(size_t k=0;k<up.size();k++)up[k]=(int)k;
 auto find=[&](int a){while(up[a]!=a){up[a]=up[up[a]];a=up[a];}return a;};
 for(b2Body* b:bodies)for(b2ContactEdge* e=b->GetContactList();e;e=e->next){b2Contact* c=e->contact;if(!c->IsTouching()||!c->IsEnabled()||c->GetFixtureA()->IsSensor()||c->GetFixtureB()->IsSensor())continue;
  auto ib=idx.find(e->other);if(ib==idx.end())continue;int a=find(idx[b]),o=find(ib->second);if(a!=o)up[a]=o;}
 std::vector<float> minStill(bodies.size(),1e9f);for(size_t k=0;k<bodies.size();k++){int r=find((int)k);minStill[r]=std::min(minStill[r],still[bodies[k]]);}
 for(size_t k=0;k<bodies.size();k++)if(minStill[find((int)k)]>=STILL_SLEEP){bodies[k]->SetAwake(false);still[bodies[k]]=0;}}
namespace{struct Ray:b2RayCastCallback{const std::function<float(b2Fixture*,b2Vec2,b2Vec2,float)>* f;float ReportFixture(b2Fixture* x,const b2Vec2& p,const b2Vec2& n,float fr)override{return (*f)(x,p,n,fr);}};
 struct Box:b2QueryCallback{const std::function<bool(b2Fixture*)>* f;bool ReportFixture(b2Fixture* x)override{return (*f)(x);}};}
void World::rayCast(V2 a,V2 b,const std::function<float(b2Fixture*,b2Vec2,b2Vec2,float)>& cb){if((bv(b)-bv(a)).LengthSquared()<=0)return;Ray r;r.f=&cb;w.RayCast(&r,bv(a),bv(b));}
void World::queryAABB(V2 lo,V2 hi,const std::function<bool(b2Fixture*)>& cb){Box q;q.f=&cb;b2AABB box;box.lowerBound=bv(lo);box.upperBound=bv(hi);w.QueryAABB(&q,box);}
}
