#pragma once
#include "core.h"
#include <box2d/box2d.h>
#include <functional>
#include <list>
#include <unordered_set>
namespace nd {
inline b2Vec2 bv(V2 v){return b2Vec2((float)v.x,(float)v.y);}
inline V2 vv(b2Vec2 v){return {v.x,v.y};}
// JavaScript's Math.round (halves go up, also for negatives).
inline double jsRound(double v){return std::floor(v+0.5);}
// A Box2D world stepped the way the server's native interiors are (native/physics.cpp): two half steps of 8 velocity
// and 3 position iterations, then "still groups" — touching bodies that have all rested under Box2D's sleep
// tolerances for a second are put to sleep together (a crammed pile otherwise never sleeps).
struct World{
 b2World w;std::unordered_map<b2Body*,float> still;
 explicit World(V2 gravity):w(bv(gravity)){w.SetAllowSleeping(true);}
 void step(double dt);
 // Every fixture the segment a→b crosses, nearest last like Box2D reports them: cb(fixture, point, normal, fraction)
 // returns -1 to ignore, 0 to stop, fraction to clip, 1 to go on.
 void rayCast(V2 a,V2 b,const std::function<float(b2Fixture*,b2Vec2,b2Vec2,float)>& cb);
 void queryAABB(V2 lo,V2 hi,const std::function<bool(b2Fixture*)>& cb);
 void destroy(b2Body* b){still.erase(b);w.DestroyBody(b);}
};
// The game's way of setting a body's velocity: only a real change is applied, so a body set to its own velocity every
// tick (a crew member standing still) can still fall asleep (Box2D restarts the sleep timer on every set).
inline void setVelocity(b2Body* b,V2 v){if((bv(v)-b->GetLinearVelocity()).LengthSquared()>4e-6f)b->SetLinearVelocity(bv(v));}
inline void setTransform(b2Body* b,V2 p,double angle=0){if((bv(p)-b->GetPosition()).LengthSquared()>1e-10f||std::fabs((float)angle-b->GetAngle())>1e-6f)b->SetTransform(bv(p),(float)angle);}
// Insertion-ordered map (JavaScript Map order: lookups, iteration and "first match" searches agree with the old code).
template<class K,class Vv> struct OMap{
 std::list<std::pair<K,Vv>> items;std::unordered_map<K,typename std::list<std::pair<K,Vv>>::iterator> index;
 Vv* get(const K& k){auto it=index.find(k);return it==index.end()?nullptr:&it->second->second;}
 const Vv* get(const K& k)const{auto it=index.find(k);return it==index.end()?nullptr:&it->second->second;}
 bool has(const K& k)const{return index.count(k)>0;}
 Vv& set(const K& k,Vv v){auto it=index.find(k);if(it!=index.end()){it->second->second=std::move(v);return it->second->second;}items.emplace_back(k,std::move(v));index[k]=std::prev(items.end());return items.back().second;}
 bool erase(const K& k){auto it=index.find(k);if(it==index.end())return false;items.erase(it->second);index.erase(it);return true;}
 size_t size()const{return items.size();}
 void clear(){items.clear();index.clear();}
 auto begin(){return items.begin();}auto end(){return items.end();}auto begin()const{return items.begin();}auto end()const{return items.end();}
};
inline std::string key(int x,int y){return std::to_string(x)+","+std::to_string(y);}
}
