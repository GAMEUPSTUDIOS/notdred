#include "api.h"
#include "rules.h"
#include "ship.h"
#include <memory>
namespace nd {
#ifdef ND_NO_EXCEPTIONS
}
#include <cstdio>
#include <cstdlib>
namespace nd {
void fail(const std::string& why){std::fprintf(stderr,"core error: %s\n",why.c_str());std::fflush(stderr);std::abort();}
#endif
static Bounds boundsOf(const J& b){Bounds o;if(b.is_object()){o.l=b.value("l",o.l);o.r=b.value("r",o.r);o.t=b.value("t",o.t);o.b=b.value("b",o.b);}return o;}
// Safe readers for request fields (a wrong type must not abort the WebAssembly build).
static double num(const J& q,const char* k,double d){auto it=q.find(k);return it!=q.end()&&it->is_number()?it->get<double>():d;}
static bool flag(const J& q,const char* k){auto it=q.find(k);return it!=q.end()&&it->is_boolean()&&it->get<bool>();}
static J field(const J& q,const char* k,J d=J()){auto it=q.find(k);return it!=q.end()?*it:d;}
static std::string str(const J& v){if(v.is_string())return v.get<std::string>();if(v.is_null())return "";return v.dump();}
// Rules exposed one by one, so tests can compare each with its JavaScript original.
static J rule(const std::string& fn,const J& a){
 auto s=[&](size_t i){return i<a.size()?str(a[i]):std::string();};
 if(fn=="zoneHalf"){Half h=zoneHalf(s(0));return {{"w",h.w},{"h",h.h}};}
 if(fn=="isCombatZone")return isCombatZone(s(0));
 if(fn=="zoneDef")return zoneDef(s(0));
 if(fn=="shipMaxHP")return shipMaxHP(boundsOf(a.at(0)));
 if(fn=="shipSize")return shipSize(boundsOf(a.at(0)));
 if(fn=="shipExpansions")return shipExpansions(boundsOf(a.at(0)));
 if(fn=="pvpMultiplier")return pvpMultiplierFor(a.at(0).get<double>(),s(1));
 if(fn=="turretReload"){const J& m=a.at(0);return turretReload(m.value("starterRC",false),str(m.value("kind",J())),str(m.value("ammoType",J())));}
 if(fn=="turretCapacity"){const J& m=a.at(0);return turretCapacity(m.value("starterRC",false),str(m.value("kind",J())));}
 if(fn=="itemMaxHp")return itemMaxHp(s(0));
 if(fn=="isAmmo")return isAmmo(s(0));
 if(fn=="recipeNeeds")return recipeNeeds(s(0));
 if(fn=="cleanShipName")return cleanShipName(s(0));
 fail("unknown rule "+fn);return J();}
static std::unordered_map<int,std::unique_ptr<Ship>> ships;static int nextShip=1;
static Ship& shipOf(const J& q){int id=(int)num(q,"ship",0);auto it=ships.find(id);if(it==ships.end())fail("no such ship");return *it->second;}
static J shipOp(const std::string& op,const J& q){
 if(op=="ship.new"){int id=nextShip++;ships[id]=std::make_unique<Ship>(field(q,"saved",J::object()));return {{"ship",id}};}
 if(op=="ship.dispose"){ships.erase((int)num(q,"ship",0));return {{"ok",true}};}
 Ship& s=shipOf(q);
 if(op=="ship.join"){Crew& c=s.newCrew(str(field(q,"uid")),str(field(q,"name")));s.setRank(c.id,str(field(q,"rank",J("guest"))));return {{"ok",true}};}
 if(op=="ship.leave"){s.removeCrew(str(field(q,"uid")));return {{"ok",true}};}
 if(op=="ship.input"){Crew* c=s.crew.get(str(field(q,"uid")));if(c)c->keys=Keys::from(field(q,"keys",J::object()));return {{"ok",c!=nullptr}};}
 if(op=="ship.place"){Crew* c=s.crew.get(str(field(q,"uid")));if(!c)fail("no such crew member");c->body->SetTransform(b2Vec2((float)num(q,"x",0),(float)num(q,"y",0)),0);c->body->SetLinearVelocity(b2Vec2((float)num(q,"vx",0),(float)num(q,"vy",0)));c->body->SetAwake(true);return {{"ok",true}};}
 if(op=="ship.tick"){int n=std::max(1,std::min(100000,(int)num(q,"n",1)));double dt=clamp(num(q,"dt",1.0/60),0,1.0/15);J trace=J::array();bool tr=flag(q,"trace");
  for(int i=0;i<n;i++){s.tick(dt);if(tr)trace.push_back(s.crewState());}return tr?J({{"trace",trace}}):J({{"ok",true}});}
 if(op=="ship.crew")return {{"crew",s.crewState()}};
 fail("unknown op "+op);return J();}
static J dispatch(const J& q){const std::string op=str(field(q,"op",J("")));
 if(op.rfind("ship.",0)==0)return shipOp(op,q);
 if(op=="init"){const J d=field(q,"data");if(d.is_null())fail("init needs data");loadData(d.is_string()?d.get<std::string>():d.dump());return {{"ok",true}};}
 if(op=="rule"){J a=field(q,"args",J::array());return {{"result",rule(str(field(q,"fn")),a.is_array()?a:J::array())}};}
 if(op=="version")return {{"core",1}};
 fail("unknown op "+op);return J();}
std::string call(const std::string& request){
 J q=J::parse(request,nullptr,false);if(q.is_discarded()||!q.is_object())return R"({"error":"request is not a JSON object"})";
#ifdef ND_NO_EXCEPTIONS
 return dispatch(q).dump(-1,' ',false,J::error_handler_t::replace);
#else
 try{return dispatch(q).dump(-1,' ',false,J::error_handler_t::replace);}catch(const std::exception& e){return J({{"error",e.what()}}).dump(-1,' ',false,J::error_handler_t::replace);}
#endif
}
}
