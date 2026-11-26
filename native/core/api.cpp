#include "api.h"
#include "rules.h"
namespace nd {
#ifdef ND_NO_EXCEPTIONS
static std::string failure;
void fail(const std::string& why){if(failure.empty())failure=why;}
#endif
static Bounds boundsOf(const J& b){Bounds o;if(b.is_object()){o.l=b.value("l",o.l);o.r=b.value("r",o.r);o.t=b.value("t",o.t);o.b=b.value("b",o.b);}return o;}
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
static J dispatch(const J& q){const std::string op=q.value("op","");
 if(op=="init"){const J& d=q.at("data");loadData(d.is_string()?d.get<std::string>():d.dump());return {{"ok",true}};}
 if(op=="rule")return {{"result",rule(q.at("fn").get<std::string>(),q.value("args",J::array()))}};
 if(op=="version")return {{"core",1}};
 fail("unknown op "+op);return J();}
std::string call(const std::string& request){
 J q=J::parse(request,nullptr,false);if(q.is_discarded()||!q.is_object())return R"({"error":"request is not a JSON object"})";
#ifdef ND_NO_EXCEPTIONS
 failure.clear();J r=dispatch(q);if(!failure.empty())return J({{"error",failure}}).dump();return r.dump(-1,' ',false,J::error_handler_t::replace);
#else
 try{return dispatch(q).dump(-1,' ',false,J::error_handler_t::replace);}catch(const std::exception& e){return J({{"error",e.what()}}).dump(-1,' ',false,J::error_handler_t::replace);}
#endif
}
}
