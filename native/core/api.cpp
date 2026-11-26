#include "api.h"
#include "rules.h"
#include "ship.h"
#include "zonegen.h"
#include "jsmath.h"
#include "zone.h"
#include <cstring>
#include <memory>
namespace nd {
#ifdef ND_NO_EXCEPTIONS
}
#include <cstdio>
#include <cstdlib>
namespace nd {
void fail(const std::string& why){std::fprintf(stderr,"core error: %s\n",why.c_str());std::fflush(stderr);std::abort();}
#endif
static Bounds boundsOf(const J& b){Bounds o;if(b.is_object()){o.l=val(b,"l",o.l);o.r=val(b,"r",o.r);o.t=val(b,"t",o.t);o.b=val(b,"b",o.b);}return o;}
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
 if(fn=="turretReload"){const J& m=a.at(0);return turretReload(val(m,"starterRC",false),str(val(m,"kind",J())),str(val(m,"ammoType",J())));}
 if(fn=="turretCapacity"){const J& m=a.at(0);return turretCapacity(val(m,"starterRC",false),str(val(m,"kind",J())));}
 if(fn=="itemMaxHp")return itemMaxHp(s(0));
 if(fn=="isAmmo")return isAmmo(s(0));
 if(fn=="recipeNeeds")return recipeNeeds(s(0));
 if(fn=="cleanShipName")return cleanShipName(s(0));
 if(fn=="jsNum")return jsNum(a.at(0).get<double>());
 if(fn=="jsFixed")return jsFixed(a.at(0).get<double>(),(int)a.at(1).get<double>());
 fail("unknown rule "+fn);return J();}
static std::unordered_map<int,std::unique_ptr<Ship>> ships;static int nextShip=1;
static Ship& shipOf(const J& q){int id=(int)num(q,"ship",0);auto it=ships.find(id);if(it==ships.end())fail("no such ship");return *it->second;}
static J shipOp(const std::string& op,const J& q){
 if(op=="ship.new"){int id=nextShip++;ships[id]=std::make_unique<Ship>(field(q,"saved",J::object()));return {{"ship",id}};}
 if(op=="ship.dispose"){ships.erase((int)num(q,"ship",0));return {{"ok",true}};}
 Ship& s=shipOf(q);
 if(op=="ship.join"){Crew& c=s.newCrew(str(field(q,"uid")),str(field(q,"name")));c.admin=flag(q,"admin");s.setRank(c.id,str(field(q,"rank",J("guest"))));s.spawnKit(c);return {{"ok",true}};}
 if(op=="ship.command"){s.command(str(field(q,"uid")),field(q,"msg",J::object()));return {{"ok",true}};}
 if(op=="ship.state"){J st=s.state();J hands=J::object();for(auto& [id,c]:s.crew){J h=J::array();for(int i=0;i<5;i++)h.push_back(c.slots[i].empty()?J():J({{"type",c.slots[i]},{"count",c.counts[i]}}));hands[id]={{"stacks",h},{"selected",c.selected},{"tool",c.tool},{"notices",c.notices},{"piloting",c.piloting},{"buildRotation",c.buildRotation},{"manning",c.manning},{"activeFab",c.activeFab}};}st["crew"]=hands;return st;}
 // Internal rules one at a time, for the differential tests.
 if(op=="ship.query"){const std::string fn=str(field(q,"fn"));const J a=field(q,"args",J::array());auto n=[&](size_t i){return i<a.size()&&a[i].is_number()?a[i].get<double>():0.0;};auto t=[&](size_t i){return i<a.size()?str(a[i]):std::string();};
  if(fn=="mountHit"){const Mount* m=s.mountHit({n(0),n(1)});if(!m)return {{"result",nullptr}};return {{"result",{{"side",m->side},{"at",m->at},{"type",m->type}}}};}
  if(fn=="mountAt"){Mount m;if(!s.mountAt({n(0),n(1)},t(2),m))return {{"result",nullptr}};J o={{"type",m.type},{"starterRC",m.starterRC}};if(!m.kind.empty())o["kind"]=m.kind;o["side"]=m.side;o["at"]=m.at;o["active"]=false;return {{"result",o}};}
  if(fn=="mountValidAt"){Mount m;if(!s.mountAt({n(0),n(1)},t(2),m))return {{"result",false}};return {{"result",s.mountValid(m)}};}
  if(fn=="mountPoint"){if((size_t)n(0)>=s.mounts.size())return {{"result",nullptr}};V2 p=s.mountPoint(s.mounts[(size_t)n(0)]);return {{"result",{{"x",p.x},{"y",p.y}}}};}
  if(fn=="machineSpace"){Crew* c=s.crew.size()?&s.crew.begin()->second:nullptr;return {{"result",s.machineSpace(t(0),{n(1),n(2)},c)}};}
  if(fn=="fabFits")return {{"result",s.fabFits((int)n(0),(int)n(1),!(a.size()>2&&a[2].is_boolean()&&!a[2].get<bool>()),a.size()>3?t(3):std::string("fabricator"))}};
  if(fn=="machineOnTop"){const Tile* m=s.machineOnTop((int)n(0),(int)n(1));return {{"result",m?J(m->type):J()}};}
  if(fn=="supportsMachine")return {{"result",s.supportsMachine((int)n(0),(int)n(1))}};
  if(fn=="terrainAt"){const Tile* m=s.terrainAt((int)n(0),(int)n(1));return {{"result",m?J(m->type):J()}};}
  if(fn=="boxSpace"){Crew* c=s.crew.size()?&s.crew.begin()->second:nullptr;return {{"result",s.boxSpace({n(0),n(1)},n(2),nullptr,false,c)}};}
  if(fn=="safeCell"){V2 p=s.safeCell({n(0),n(1)},a.size()>2&&a[2].is_boolean()&&a[2].get<bool>());return {{"result",{{"x",p.x},{"y",p.y}}}};}
  fail("unknown query "+fn);}
 if(op=="ship.boxInsert"){size_t k=(size_t)num(q,"box",0);if(k>=s.boxes.size())fail("no such box");return {{"inserted",s.boxInsert(*s.boxes[k],str(field(q,"type")),(int)num(q,"n",0))}};}
 if(op=="ship.leave"){s.removeCrew(str(field(q,"uid")));return {{"ok",true}};}
 if(op=="ship.input"){Crew* c=s.crew.get(str(field(q,"uid")));if(c){c->keys=Keys::from(field(q,"keys",J::object()));c->inputAge=0;}return {{"ok",c!=nullptr}};}
 if(op=="ship.place"){Crew* c=s.crew.get(str(field(q,"uid")));if(!c)fail("no such crew member");c->body->SetTransform(b2Vec2((float)num(q,"x",0),(float)num(q,"y",0)),0);c->body->SetLinearVelocity(b2Vec2((float)num(q,"vx",0),(float)num(q,"vy",0)));c->body->SetAwake(true);return {{"ok",true}};}
 if(op=="ship.tick"){int n=std::max(1,std::min(100000,(int)num(q,"n",1)));double dt=clamp(num(q,"dt",1.0/60),0,1.0/15);J trace=J::array();bool tr=flag(q,"trace");
  for(int i=0;i<n;i++){s.tick(dt);if(tr)trace.push_back(s.crewState());}return tr?J({{"trace",trace}}):J({{"ok",true}});}
 if(op=="ship.crew")return {{"crew",s.crewState()}};
 fail("unknown op "+op);return J();}
// ---- Zones (tests drive them directly until the zone sim and rooms move into the core) ------------------------------
struct ZoneRec{std::unique_ptr<MissionState> mission=std::make_unique<MissionState>();std::unique_ptr<Zone> zone;};
static std::unordered_map<int,ZoneRec> zones;static int nextZone=1;
static ShipExt extOf(const J& e){ShipExt o;if(e.is_object()){o.l=val(e,"l",o.l);o.r=val(e,"r",o.r);o.t=val(e,"t",o.t);o.b=val(e,"b",o.b);}return o;}
static V2 v2Of(const J& p){return p.is_object()?V2(val(p,"x",0.0),val(p,"y",0.0)):V2();}
static std::vector<OtherShip> othersOf(const J& a){std::vector<OtherShip> out;if(a.is_array())for(auto& o:a)if(o.is_object())out.push_back({val(o,"x",0.0),val(o,"y",0.0),extOf(val(o,"ext",J()))});return out;}
static J pj(V2 p){return {{"x",p.x},{"y",p.y}};}
static J fixturesOf(b2Body* b){J out=J::array();if(!b)return out;for(b2Fixture* f=b->GetFixtureList();f;f=f->GetNext()){J o;if(f->GetType()==b2Shape::e_circle){auto* c=(b2CircleShape*)f->GetShape();o={{"circle",c->m_radius},{"x",c->m_p.x},{"y",c->m_p.y}};}
  else if(f->GetType()==b2Shape::e_polygon){auto* s=(b2PolygonShape*)f->GetShape();J vs=J::array();for(int i=0;i<s->m_count;i++)vs.push_back({s->m_vertices[i].x,s->m_vertices[i].y});o={{"poly",vs}};}
  o["friction"]=f->GetFriction();o["density"]=f->GetDensity();o["restitution"]=f->GetRestitution();out.push_back(o);}return out;}
static J zoneOp(const std::string& op,const J& q){
 if(op=="zone.new"){const int id=nextZone++;ZoneRec& r=zones[id];const J m=field(q,"mission",J::object());if(m.is_object()){r.mission->active=str(val(m,"active",J()));r.mission->elapsed=val(m,"elapsed",0.0);}
  r.zone=std::make_unique<Zone>(str(field(q,"id")),num(q,"seed",0),field(q,"mined",J::array()),field(q,"saved",J::object()),r.mission.get());return {{"zone",id}};}
 auto it=zones.find((int)num(q,"zone",0));if(it==zones.end())fail("no such zone");Zone& z=*it->second.zone;
 if(op=="zone.dispose"){zones.erase(it);return {{"ok",true}};}
 if(op=="zone.mission"){MissionState& m=*it->second.mission;m.active=str(field(q,"active"));m.elapsed=num(q,"elapsed",0);return {{"ok",true}};}
 if(op=="zone.state"){J rocks=J::array();for(auto& [k,r]:z.rocks)rocks.push_back({r.id,r.x,r.y,r.kind,r.ore,r.hp,r.maxhp,r.chunk});
  J chunks=J::object();for(auto& [k,ch]:z.rockChunks){J cells=J::array();for(auto& c:ch.cells)cells.push_back(c);chunks[k]={{"cells",cells},{"fixtures",fixturesOf(ch.body)}};}
  J portals=J::array();for(auto& p:z.zonePortals()){J o={{"to",p.to},{"x",p.x},{"y",p.y}};if(p.mission)o["mission"]=true;portals.push_back(o);}
  J loot=J::array();for(auto& l:z.worldLoot){const V2 p=vv(l->body->GetPosition()),v=vv(l->body->GetLinearVelocity());loot.push_back({{"type",l->type},{"count",l->count},{"x",p.x},{"y",p.y},{"vx",v.x},{"vy",v.y},{"grace",l->grace}});}
  J boulders=J::array();for(auto& b:z.boulders){const V2 p=vv(b.body->GetPosition());boulders.push_back({{"id",b.id},{"r",b.r},{"x",p.x},{"y",p.y},{"a",b.body->GetAngle()},{"fixtures",fixturesOf(b.body)}});}
  return {{"id",z.id},{"seed",z.seed},{"rocks",rocks},{"chunks",chunks},{"portals",portals},{"loot",loot},{"boulders",boulders},{"treasure",val(z.st,"treasure",J())},{"dock",fixturesOf(z.dockBody)},{"edge",fixturesOf(z.edge)}};}
 if(op=="zone.query"){const std::string fn=str(field(q,"fn"));const J a=field(q,"args",J::array());auto arg=[&](size_t i){return i<a.size()?a[i]:J();};
  auto n=[&](size_t i){return arg(i).is_number()?arg(i).get<double>():0.0;};
  if(q.contains("dice")&&q["dice"].is_array()){z.dice.clear();z.diceAt=0;for(auto& d:q["dice"])if(d.is_number())z.dice.push_back(d.get<double>());}
  if(fn=="zoneSolid")return {{"result",z.zoneSolid(n(0),n(1))}};
  if(fn=="rockAtHit"){std::string r=z.rockAtHit(v2Of(arg(0)),v2Of(arg(1)));return {{"result",r.empty()?J():J(r)}};}
  if(fn=="shipOverlapsRock")return {{"result",z.shipOverlapsRock(v2Of(arg(0)),extOf(arg(1)))}};
  if(fn=="shipClashes")return {{"result",z.shipClashes(v2Of(arg(0)),extOf(arg(1)),othersOf(arg(2)))}};
  if(fn=="randomArrival"){V2 p;bool ok=z.randomArrival(extOf(arg(0)),othersOf(arg(1)),p);return {{"result",ok?pj(p):J()},{"used",z.diceAt}};}
  if(fn=="randomBerth")return {{"result",pj(z.randomBerth(extOf(arg(0)),othersOf(arg(1))))},{"used",z.diceAt}};
  if(fn=="safeArrival")return {{"result",pj(z.safeArrival(extOf(arg(0)),othersOf(arg(1))))}};
  if(fn=="freeportFits")return {{"result",z.freeportFits(v2Of(arg(0)),extOf(arg(1)))}};
  if(fn=="freeportBerthOK")return {{"result",z.freeportBerthOK(v2Of(arg(0)),extOf(arg(1)))}};
  if(fn=="insideFreeport")return {{"result",z.insideFreeport(n(0),n(1),n(2))}};
  if(fn=="freeportLayout"){FreeportLayout L=z.freeportLayout();auto rects=[](const std::vector<DockRect>& v){J o=J::array();for(auto& r:v)o.push_back({{"x0",r.x0},{"y0",r.y0},{"x1",r.x1},{"y1",r.y1},{"part",r.part}});return o;};
   J c=J::array();for(auto& [p,q2]:L.corners)c.push_back({{p.x,p.y},{q2.x,q2.y}});return {{"result",{{"w",L.w},{"h",L.h},{"docks",rects(L.docks)},{"walls",rects(L.walls)},{"corners",c}}}};}
  if(fn=="treasureRanks")return {{"result",z.treasureRanks()}};
  if(fn=="exposedRocks"){J o=J::array();for(auto& e:z.exposedRocks())o.push_back({e.r->id,e.open.x,e.open.y,e.dx,e.dy});return {{"result",o}};}
  if(fn=="nearestPortal"){Portal p;double d=0;if(!z.nearestPortal(v2Of(arg(0)),p,d))return {{"result",nullptr}};J o={{"to",p.to},{"x",p.x},{"y",p.y}};if(p.mission)o["mission"]=true;o["distance"]=d;return {{"result",o}};}
  if(fn=="removeRock")return {{"result",z.removeRock(str(arg(0)),arg(1).is_boolean()?arg(1).get<bool>():true)}};
  if(fn=="refreshTreasure"){z.refreshTreasure();return {{"result",val(z.st,"treasure",J())}};}
  if(fn=="boulderState")return {{"result",z.boulderState(arg(0).is_boolean()?arg(0).get<bool>():true)}};
  if(fn=="terrainHash")return {{"result",terrainHash(n(0),n(1))}};
  if(fn=="finchNoise")return {{"result",finchNoise(n(0),n(1))}};
  fail("unknown zone query "+fn);}
 fail("unknown op "+op);return J();}
static J dispatch(const J& q){const std::string op=str(field(q,"op",J("")));
 if(op.rfind("ship.",0)==0)return shipOp(op,q);
 if(op.rfind("zone.",0)==0&&op!="zone.generate")return zoneOp(op,q);
 if(op=="init"){const J d=field(q,"data");if(d.is_null())fail("init needs data");loadData(d.is_string()?d.get<std::string>():d.dump());return {{"ok",true}};}
 if(op=="rule"){J a=field(q,"args",J::array());return {{"result",rule(str(field(q,"fn")),a.is_array()?a:J::array())}};}
 if(op=="version")return {{"core",1}};
 // Math functions over doubles given as 16 hex digits (exact, and NaN/Infinity survive), for the jsmath tests.
 if(op=="math"){const std::string fn=str(field(q,"fn"));const J a=field(q,"a",J::array()),b=field(q,"b",J::array());
  auto bits=[](const J& v){double d=0;if(v.is_string()){unsigned long long u=std::strtoull(v.get<std::string>().c_str(),nullptr,16);std::memcpy(&d,&u,8);}return d;};
  auto hex=[](double d){unsigned long long u;std::memcpy(&u,&d,8);char t[17];std::snprintf(t,sizeof t,"%016llx",u);return std::string(t);};
  using F1=double(*)(double);using F2=double(*)(double,double);F1 f1=nullptr;F2 f2=nullptr;
  static const std::pair<const char*,F1> one[]={{"acos",jsmath::acos},{"acosh",jsmath::acosh},{"asin",jsmath::asin},{"asinh",jsmath::asinh},{"atan",jsmath::atan},{"cos",jsmath::cos},{"exp",jsmath::exp},{"atanh",jsmath::atanh},{"log",jsmath::log},{"log1p",jsmath::log1p},{"log2",jsmath::log2},{"log10",jsmath::log10},{"expm1",jsmath::expm1},{"cbrt",jsmath::cbrt},{"sin",jsmath::sin},{"tan",jsmath::tan},{"cosh",jsmath::cosh},{"sinh",jsmath::sinh},{"tanh",jsmath::tanh}};
  static const std::pair<const char*,F2> two[]={{"atan2",jsmath::atan2},{"pow",jsmath::pow},{"hypot",jsmath::hypot}};
  for(auto& [n,f]:one)if(fn==n)f1=f;for(auto& [n,f]:two)if(fn==n)f2=f;if(!f1&&!f2)fail("unknown math function "+fn);
  J r=J::array();for(size_t i=0;i<a.size();i++)r.push_back(hex(f1?f1(bits(a[i])):f2(bits(a[i]),i<b.size()?bits(b[i]):0)));return {{"r",r}};}
 if(op=="zone.generate"){ZoneGrid g=generateZone(num(q,"seed",0),field(q,"opts",J::object()));return g.toJSON(true);}
 fail("unknown op "+op);return J();}
// Replies are written as JSON.stringify would: -0 is 0 (and NaN/Infinity are null, as nlohmann already does).
static void jsonLike(J& v){if(v.is_number_float()){if(v.get<double>()==0)v=0.0;}else if(v.is_structured())for(auto& e:v)jsonLike(e);}
static std::string reply(J v){jsonLike(v);return v.dump(-1,' ',false,J::error_handler_t::replace);}
std::string call(const std::string& request){
 J q=J::parse(request,nullptr,false);if(q.is_discarded()||!q.is_object())return R"({"error":"request is not a JSON object"})";
#ifdef ND_NO_EXCEPTIONS
 return reply(dispatch(q));
#else
 try{return reply(dispatch(q));}catch(const std::exception& e){return J({{"error",e.what()}}).dump(-1,' ',false,J::error_handler_t::replace);}
#endif
}
}
