// Machines that run by themselves or by a click: fabricators, loaders, pushers (stationary and handheld), recyclers,
// shredders, comms stations, thruster tanks, hatch filters and repairs — dist/modules/machinery.js, hatches.js and
// the shredAt/pushAt parts of dist/game.js and repairAt of combat.js, ported one for one. A tile's settings and
// working state live in its `extra` object under the JavaScript field names.
#include "ship.h"
#include "jsmath.h"
namespace nd {
std::string nameOf(const std::string& t);
static bool among(const std::string& t,std::initializer_list<const char*> l){for(const char* s:l)if(t==s)return true;return false;}
static bool inTable(const char* table,const std::string& v){for(auto& x:data().raw.at(table))if(x.is_string()&&x.get_ref<const std::string&>()==v)return true;return false;}
static double dist(V2 a,V2 b){return (a-b).len();}
static V2 pos(const Crew& c){return vv(c.body->GetPosition());}
static bool isType(const std::string& t){const auto& ty=data().types;return std::find(ty.begin(),ty.end(),t)!=ty.end();}
static double num(const J& o,const char* k,double d=0){auto it=o.find(k);return it!=o.end()&&it->is_number()?it->get<double>():d;}
static std::string fabKindOf(const Tile& t){auto it=t.extra.find("kind");if(it!=t.extra.end()&&it->is_string()&&data().raw.at("FABRICATORS").contains(it->get<std::string>()))return it->get<std::string>();return "legacy";}
static const J& fabDef(const Tile& t){return data().raw.at("FABRICATORS").at(fabKindOf(t));}
static std::string lower(std::string s){for(auto& c:s)c=(char)std::tolower((unsigned char)c);return s;}
// `extra` keeps keys in insertion order (a vector underneath), so adding a key moves the others: every key a function
// will touch is made first (as null), and only then are references taken.
static void ensure(J& o,std::initializer_list<const char*> keys){if(!o.is_object())o=J::object();for(const char* k:keys)if(!o.contains(k))o[k]=nullptr;}
static J& mats(Tile& t){J& m=t.extra["materials"];if(!m.is_object())m=J::object();return m;}
// ---- Fabricators -------------------------------------------------------------------------------------------------
static bool canStore(Tile& f,const std::string& t){J& m=mats(f);if(num(m,t.c_str())>0)return true;int used=0;for(auto& [k,v]:m.items())if(v.is_number()&&v.get<double>()>0)used++;return used<3;}
std::set<std::string> fabIngredients(const Tile& f){std::set<std::string> s;for(auto& r:fabDef(f).at("recipes")){J need=recipeNeeds(r.get<std::string>());if(need.is_object())for(auto& [k,v]:need.items())s.insert(k);}return s;}
Tile* Ship::activeFabOf(Crew& c){if(c.activeFab.empty())return nullptr;for(auto& [k,t]:terrain)if(t.id==c.activeFab||k==c.activeFab)return &t;return nullptr;}
void Ship::transferMaterial(Crew& c,std::string type,bool eject){Tile* f=activeFabOf(c);if(!f||!isType(type))return;J& m=mats(*f);
 if(!eject&&!fabIngredients(*f).count(type)){toast(nameOf(type)+" is not an ingredient for anything a "+lower(fabDef(*f).at("name"))+" makes.");return;}
 if(eject){int count=std::min(stackLimit(type),(int)num(m,type.c_str()));scatter(type,count,{f->x-1.2,f->y+1},J(key((int)f->x,(int)f->y)));m[type]=num(m,type.c_str())-count;}
 else{if(!canStore(*f,type)){toast("All three fabricator bins are occupied. Eject a bin first.");return;}int n=std::min(carried(c,type),64-(int)num(m,type.c_str()));if(n<=0){toast("That bin is full (64).");return;}
  takeItem(c,type,n);m[type]=num(m,type.c_str())+n;toast("Loaded "+std::to_string(n)+" "+nameOf(type)+" into the "+lower(fabDef(*f).at("name"))+".");}}
void Ship::clearQueue(Crew& c){Tile* f=activeFabOf(c);if(!f)return;f->extra["queue"]=J::array();J& job=f->extra["job"];if(job.is_object()){J need=recipeNeeds(val(job,"type",""));if(need.is_object())for(auto& [k,n]:need.items())giveItem(c,k,n.get<int>());job=nullptr;}}
bool Ship::craft(Crew& c,const std::string& t,int count){Tile* f=activeFabOf(c);if(!f)f=nearFab(c);if(!f||recipeNeeds(t).is_null()||c.piloting)return false;
 bool can=false;for(auto& r:fabDef(*f).at("recipes"))if(r==t)can=true;if(!can){toast("A "+fabDef(*f).at("name").get<std::string>()+" cannot make "+nameOf(t)+".");return false;}
 J& q=f->extra["queue"];if(!q.is_array())q=J::array();if((int)q.size()+count>32){toast("Queue limit: 32.");return false;}for(int i=0;i<count;i++)q.push_back(t);return true;}
void Ship::tickFabricators(double dt){for(auto& [k,f]:terrain){if(f.type!="fabricator")continue;ensure(f.extra,{"queue","job","materials"});if(!f.extra["materials"].is_object())f.extra["materials"]=J::object();J& q=f.extra["queue"];if(!q.is_array())q=J::array();
  {J kept=J::array();for(auto& t:q)if(t.is_string()&&!recipeNeeds(t.get<std::string>()).is_null())kept.push_back(t);q=kept;}
  J& job=f.extra["job"];J& m=mats(f);
  if(job.is_object()&&recipeNeeds(val(job,"type","")).is_null()){m["iron"]=num(m,"iron")+12;job=nullptr;}
  if(!job.is_object()&&q.size()){const std::string t=q[0];J need=recipeNeeds(t);bool ok=true;for(auto& [mm,n]:need.items())if(num(m,mm.c_str())<n.get<double>())ok=false;
   if(ok){for(auto& [mm,n]:need.items())m[mm]=num(m,mm.c_str())-n.get<double>();q.erase(0);job={{"type",t},{"progress",0}};}}
  if(job.is_object()){const std::string jt=job["type"];const double dur=num(data().raw.at("DURATION"),jt.c_str(),0)?num(data().raw.at("DURATION"),jt.c_str()):2;job["progress"]=std::min(dur,job["progress"].get<double>()+dt);
   if(job["progress"].get<double>()>=dur){const V2 qp{f.x+.02,f.y+2.15};const int n=(int)(num(data().raw.at("RECIPE_YIELD"),jt.c_str(),0)?num(data().raw.at("RECIPE_YIELD"),jt.c_str()):1);
    std::vector<Item*> here;for(auto& i:items)if(dist(vv(i->body->GetPosition()),qp)<.8)here.push_back(i.get());Item* same=nullptr;for(Item* i:here)if(i->type==jt&&i->count+n<=stackLimit(i->type)){same=i;break;}
    if(same||here.empty()){if(same){same->count+=n;same->body->SetAwake(true);}else{Item& it=spawnItem(jt,qp,{0,0},n);it.intakeFrom=key((int)f.x,(int)f.y);}
     effects.push_back({{"x",qp.x},{"y",qp.y},{"w",1},{"h",1},{"life",.3},{"color","green"},{"kind","craft"}});if(val(f.extra,"repeat",false)&&q.size()<32)q.push_back(jt);job=nullptr;}}}}}
// ---- Thruster tanks (machinery.js loadThruster / burn) -----------------------------------------------------------
void Ship::loadThruster(Crew& c,std::pair<int,int> cell,std::string type){if(c.piloting){toast("Leave the helm to load a thruster.");return;}const Mount* mh=mountHit({(double)cell.first,(double)cell.second});
 if(!mh||mh->type!="thruster"){toast("Click a normal three-tile thruster. Starter thrusters do not need fuel.");return;}if(!carried(c,type)){toast("No "+nameOf(type)+" available.");return;}
 Mount& m=mounts[mh-mounts.data()];takeItem(c,type,1);if(type=="fuel")m.fuelItems+=1;else m.explosiveItems+=1;toast("Loaded "+nameOf(type)+". Fuel: "+std::to_string((int)m.fuelItems)+" / Explosives: "+std::to_string((int)m.explosiveItems));}
double Ship::burn(Mount& m,double dt,double power){const J& F=data().raw.at("THRUSTER_FORCE");if(m.type=="starter")return F.at("starter");
 if(m.burnRemaining<=0){if(m.fuelItems>0){m.fuelItems--;m.burnKind="fuel";m.burnRemaining=120;}else if(m.explosiveItems>0){m.explosiveItems--;m.burnKind="explosives";m.burnRemaining=60;}else return 0;}
 const double used=std::min(m.burnRemaining,dt*power);m.burnRemaining-=used;return (m.burnKind=="fuel"?F.at("fuel").get<double>():F.at("explosives").get<double>())*(used/(dt*power));}
// ---- Hatch-style filters ---------------------------------------------------------------------------------------------
bool hatchAllows(const Tile& t,const std::string& type){std::string mode=val(t.extra,"filterMode",std::string("all"));if(mode.empty())mode="all";bool has=false;auto it=t.extra.find("filterItems");
 if(it!=t.extra.end()&&it->is_array())for(auto& x:*it)if(x==type)has=true;return mode=="all"||(mode=="whitelist"&&has)||(mode=="blacklist"&&!has);}
bool Ship::configureHatch(Crew& c,std::pair<int,int> cell,const J& mode,const J& list,bool pull,bool requireOutput){const Tile* tc=terrainAt(cell.first,cell.second);
 if(!tc||!inTable("CONFIGURABLE",tc->type)||c.piloting||dist(pos(c),{tc->x,tc->y})>8||buildBlocked(c,{(double)cell.first,(double)cell.second},tc->f))return false;
 if(!mode.is_string()||!among(mode.get<std::string>(),{"all","off","whitelist","blacklist"})||!list.is_array())return false;for(auto& x:list)if(!x.is_string()||!isType(x.get<std::string>()))return false;
 Tile& t=const_cast<Tile&>(*tc);t.extra["filterMode"]=mode;J uniq=J::array();for(auto& x:list){bool dup=false;for(auto& y:uniq)if(y==x)dup=true;if(!dup)uniq.push_back(x);}while(uniq.size()>data().types.size())uniq.erase(uniq.size()-1);t.extra["filterItems"]=uniq;
 if(t.type=="loader")t.extra["requireOutput"]=requireOutput;if(t.type=="pusher_block")t.extra["pull"]=pull;return true;}
// ---- Pushers -----------------------------------------------------------------------------------------------------------
static V2 pusherDirection(const Tile& t){const double a=t.rotation*M_PI/2;return {jsRound(jsmath::cos(a)),jsRound(jsmath::sin(a))};}
static void pusherSettings(Tile& t){J& e=t.extra;if(e.contains("mode")&&!e["mode"].is_null()&&!(e["mode"].is_string()&&e["mode"].get<std::string>().empty()))return;
 const std::string fm=val(e,"filterMode",std::string("all"));const std::string base=fm=="off"?"off":val(e,"pull",false)?"pull":"push";J list=J::array();if(e.contains("filterItems")&&e["filterItems"].is_array())for(size_t i=0;i<e["filterItems"].size()&&i<3;i++)list.push_back(e["filterItems"][i]);
 e["maxBeam"]=data().raw.at("PUSHER_MAX_BEAM");e["speed"]=data().raw.at("PUSHER_SPEED");e["filterInv"]=false;J f=list;while(f.size()<3)f.push_back(nullptr);e["filters"]=f;
 if(fm=="whitelist"){e["mode"]="off";e["filteredMode"]=base=="off"?"push":base;}else if(fm=="blacklist"){e["mode"]=base;e["filteredMode"]="off";}else{e["mode"]=base;e["filteredMode"]=base;}}
std::vector<std::string> Ship::objectInventory(b2Body* body){std::vector<std::string> out;for(auto& b:boxes)if(b->body==body){for(auto& [k,v]:b->materials.items())if(v.is_number()&&v.get<double>()>0)out.push_back(k);return out;}
 for(auto& [k,t]:terrain)if(t.body==body){auto it=t.extra.find("materials");if(it!=t.extra.end()&&it->is_object())for(auto& [kk,v]:it->items())if(v.is_number()&&v.get<double>()>0)out.push_back(kk);return out;}
 for(auto& [id,c]:crew)if(c.body==body){for(auto& s:c.slots)if(!s.empty())out.push_back(s);return out;}return out;}
std::string Ship::pusherModeFor(Tile& t,b2Body* body){pusherSettings(t);std::vector<std::string> set;for(auto& f:t.extra["filters"])if(f.is_string()&&!f.get<std::string>().empty())set.push_back(f);const std::string mode=t.extra["mode"];
 if(set.empty())return mode;bool match=false;Item* item=nullptr;for(auto& i:items)if(i->body==body){item=i.get();break;}
 if(item)match=std::find(set.begin(),set.end(),item->type)!=set.end();else if(val(t.extra,"filterInv",false)){for(auto& k:objectInventory(body))if(std::find(set.begin(),set.end(),k)!=set.end())match=true;}
 return match?t.extra["filteredMode"].get<std::string>():mode;}
bool Ship::configurePusher(Crew& c,std::pair<int,int> cell,const J& o){const Tile* tc=terrainAt(cell.first,cell.second);if(!tc||tc->type!="pusher_block"||c.piloting||dist(pos(c),{tc->x,tc->y})>8||buildBlocked(c,{tc->x,tc->y},tc->f))return false;
 Tile& t=const_cast<Tile&>(*tc);pusherSettings(t);J& e=t.extra;auto nm=[&](const char* k,double lo,double hi,const J& d)->J{auto it=o.find(k);if(it==o.end())return d;double v;
   if(it->is_number())v=it->get<double>();else if(it->is_boolean())v=it->get<bool>()?1:0;else if(it->is_null())v=0;else if(it->is_string()){const std::string& s=it->get_ref<const std::string&>();char* end=nullptr;v=std::strtod(s.c_str(),&end);bool blank=true;for(char ch:s)if(!std::isspace((unsigned char)ch))blank=false;if(blank)v=0;else if(end!=s.c_str()+s.size())return d;}else return d;
   if(!std::isfinite(v))return d;return J(std::min(hi,std::max(lo,jsRound(v))));};
 e["maxBeam"]=nm("maxBeam",1,data().raw.at("PUSHER_MAX_BEAM").get<double>(),e["maxBeam"]);e["speed"]=nm("speed",1,data().raw.at("PUSHER_MAX_SPEED").get<double>(),e["speed"]);
 if(o.contains("mode")&&o["mode"].is_string()&&among(o["mode"].get<std::string>(),{"push","pull","off"}))e["mode"]=o["mode"];
 if(o.contains("filteredMode")&&o["filteredMode"].is_string()&&among(o["filteredMode"].get<std::string>(),{"push","pull","off"}))e["filteredMode"]=o["filteredMode"];
 {auto it=o.find("filterInv");e["filterInv"]=it!=o.end()&&!it->is_null()&&!(it->is_boolean()&&!it->get<bool>())&&!(it->is_number()&&it->get<double>()==0)&&!(it->is_string()&&it->get<std::string>().empty());}
 if(o.contains("filters")&&o["filters"].is_array()){J f=J::array();for(size_t k=0;k<3;k++){const J v=k<o["filters"].size()?o["filters"][k]:J();f.push_back(v.is_string()&&isType(v.get<std::string>())?v:J());}e["filters"]=f;}
 e["pull"]=e["mode"]=="pull";return true;}
bool Ship::beamPasses(b2Fixture* f,b2Vec2 pt,V2 d){const uint16_t cat=f->GetFilterData().categoryBits;if(cat==4||cat==16)return true;int x=(int)jsRound(pt.x+d.x*.05),y=(int)jsRound(pt.y+d.y*.05);if(blocks.has(key(x,y)))return false;const Tile* t=terrainAt(x,y);return t&&inTable("BEAM_PASSES",t->type);}
Ship::Beam Ship::pusherBeam(Tile& t){pusherSettings(t);const V2 d=pusherDirection(t);const double reach=std::min(num(t.extra,"maxBeam",0)?num(t.extra,"maxBeam"):data().raw.at("PUSHER_MAX_BEAM").get<double>(),(double)std::max(bounds.r-bounds.l,bounds.b-bounds.t)+2);
 const V2 from{t.x,t.y},to{t.x+d.x*reach,t.y+d.y*reach};double wall=1,firstFrac=1;b2Body* first=nullptr;
 inside->rayCast(from,to,[&](b2Fixture* f,b2Vec2 pt,b2Vec2,float frac)->float{if(f==t.f||f->IsSensor())return -1;b2Body* body=f->GetBody();
  if(body==interior){if(beamPasses(f,pt,d))return -1;if(frac<wall)wall=frac;return frac;}if(body->GetType()==b2_dynamicBody){if(frac<firstFrac){firstFrac=frac;first=body;}return frac;}return -1;});
 if(first&&firstFrac<wall)return {d,firstFrac*reach,first};return {d,wall*reach,nullptr};}
void Ship::tickPushers(double dt){const double accel=data().raw.at("PUSHER_ACCEL").get<double>(),speed0=data().raw.at("PUSHER_SPEED").get<double>();
 for(auto& [k,t]:terrain){if(t.type!="pusher_block")continue;Beam b=pusherBeam(t);t.extra["beam"]=b.length;std::string mode=b.hit?pusherModeFor(t,b.hit):t.extra["mode"].get<std::string>();t.extra["beamMode"]=mode;if(!b.hit||mode=="off")continue;
  const double sign=mode=="pull"?-1:1,target=num(t.extra,"speed",0)?num(t.extra,"speed"):speed0;V2 p=vv(b.hit->GetPosition());const V2 d=b.d;
  if(mode=="pull"&&std::fabs((p.x-t.x)*d.x+(p.y-t.y)*d.y)<1.25){V2 v=vv(b.hit->GetLinearVelocity());double along=v.x*d.x+v.y*d.y;if(along<0)b.hit->SetLinearVelocity(b2Vec2((float)(v.x-along*d.x),(float)(v.y-along*d.y)));continue;}
  V2 v=vv(b.hit->GetLinearVelocity());double along=(v.x*d.x+v.y*d.y)*sign;if(along>=target)continue;b.hit->SetAwake(true);const double m=b.hit->GetMass()*std::min(target-along,accel*dt)*sign;
  b.hit->ApplyLinearImpulse(b2Vec2((float)(d.x*m),(float)(d.y*m)),b.hit->GetWorldCenter(),true);}}
// The handheld pusher (game.js pushAt): a beam from you to the aim, through what beams cross; the first object is pushed.
void Ship::pushAt(Crew& c,V2 p,double dt){V2 from=pos(c),d{p.x-from.x,p.y-from.y};if(d.len()<.01)return;d.normalize();const double R=data().raw.at("HAND_PUSHER_RANGE");V2 end{from.x+d.x*R,from.y+d.y*R};
 b2Body* hit=nullptr;V2 point=end;double fraction=1;inside->rayCast(from,end,[&](b2Fixture* f,b2Vec2 pt,b2Vec2,float t)->float{b2Body* body=f->GetBody();if(body==c.body||f->IsSensor())return -1;
  if(body==interior&&beamPasses(f,pt,d))return -1;if(body!=interior&&body->GetType()!=b2_dynamicBody)return -1;if(t<fraction){fraction=t;hit=body;point=vv(pt);}return t;});
 c.pusherVisual={{"from",{{"x",from.x},{"y",from.y}}},{"to",{{"x",point.x},{"y",point.y}}},{"pull",c.pusherPull},{"until",clock+.09}};
 if(!hit||hit->GetType()!=b2_dynamicBody)return;const double sign=c.pusherPull?-1:1;hit->SetAwake(true);const double k=hit->GetMass()*24*dt*sign;hit->ApplyLinearImpulse(b2Vec2((float)(d.x*k),(float)(d.y*k)),hit->GetWorldCenter(),true);}
// ---- Loaders -------------------------------------------------------------------------------------------------------------
struct Ends{V2 d;std::pair<int,int> input,output;};
static Ends loaderEnds(const Tile& t){V2 d=pusherDirection(t);return {d,{(int)(t.x-d.x),(int)(t.y-d.y)},{(int)(t.x+d.x),(int)(t.y+d.y)}};}
std::vector<std::pair<int,int>> Ship::loaderInputCells(const Tile& t,std::pair<int,int> c)const{V2 d=pusherDirection(t);std::vector<std::pair<int,int>> cells{c};auto q=c;
 for(int n=0;n<4;n++){const Tile* there=terrainAt(q.first,q.second);if(!there||!inTable("LOADER_REACHES_THROUGH",there->type))break;q={q.first-(int)d.x,q.second-(int)d.y};cells.push_back(q);}return cells;}
static bool inLoaderHotbox(const Tile& t,V2 p){V2 d=pusherDirection(t);const J& H=data().raw.at("LOADER_HOTBOX");const double rx=p.x-t.x,ry=p.y-t.y,back=-(rx*d.x+ry*d.y),side=std::fabs(rx*d.y-ry*d.x);
 return back>H.at("near").get<double>()&&back<H.at("far").get<double>()&&side<H.at("half").get<double>();}
bool Ship::loaderTake(Tile& t,std::pair<int,int> c,J& got){
 if(const Tile* src=terrainAt(c.first,c.second))if(src->type=="recycler"&&src->extra.contains("output")&&src->extra["output"].is_array()&&src->extra["output"].size()){J& out=const_cast<Tile*>(src)->extra["output"];
   for(size_t i=0;i<out.size();i++)if(hatchAllows(t,val(out[i],"type",""))){got={{"type",out[i]["type"]},{"count",out[i]["count"]}};out.erase(i);return true;}}
 auto cells=loaderInputCells(t,c);auto near=[&](V2 p,std::pair<int,int> q){const Tile* tq=terrainAt(q.first,q.second);bool walk=tq&&inTable("LOADER_REACHES_THROUGH",tq->type);return std::fabs(p.x-q.first)<.6&&p.y-q.second<.6&&q.second-p.y<(walk?1.1:.6);};
 const std::string me=key((int)t.x,(int)t.y);
 for(Item* i:nearbyItems(t,cells)){V2 p=vv(i->body->GetPosition());bool in=inLoaderHotbox(t,p);if(!in)for(auto& q:cells)if(near(p,q)){in=true;break;}
  if(in&&!(i->intakeFrom.is_string()&&i->intakeFrom.get<std::string>()==me)&&hatchAllows(t,i->type)){got={{"type",i->type},{"count",i->count}};i->taken=true;for(size_t k=0;k<items.size();k++)if(items[k].get()==i){destroyItem(k);break;}return true;}}
 Box* outBox=nullptr;{auto o=loaderEnds(t).output;outBox=boxNear({(double)o.first,(double)o.second},.55);}
 for(auto& q:cells){Box* b=boxAt({(double)q.first,(double)q.second});if(b&&b!=outBox){std::string type;for(auto& k:data().types)if(num(b->materials,k.c_str())>0&&hatchAllows(t,k)){type=k;break;}
   if(!type.empty()){int count=std::min(stackLimit(type),(int)num(b->materials,type.c_str()));b->materials[type]=num(b->materials,type.c_str())-count;resizeBox(*b);got={{"type",type},{"count",count}};return true;}break;}}
 return false;}
std::vector<Item*> Ship::nearbyItems(const Tile& t,const std::vector<std::pair<int,int>>& cells){std::set<Item*> seen;std::vector<Item*> out;
 auto add=[&](double x,double y){int x0=(int)std::floor((x-2.5)/2),x1=(int)std::floor((x+2.5)/2),y0=(int)std::floor((y-2.5)/2),y1=(int)std::floor((y+2.5)/2);
  for(int gx=x0;gx<=x1;gx++)for(int gy=y0;gy<=y1;gy++){auto it=itemGrid.find(((long long)(gx+32768)<<17)^(gy+32768));if(it!=itemGrid.end())for(Item* i:it->second)if(seen.insert(i).second)out.push_back(i);}};
 add(t.x,t.y);for(auto& c:cells)add(c.first,c.second);std::vector<Item*> r;for(Item* i:out)if(!i->taken)r.push_back(i);return r;}
int Ship::loaderGive(Tile& t,std::pair<int,int> c,J& stack){t.extra["refused"]=false;auto refuse=[&](){t.extra["refused"]=true;return 0;};const std::string type=stack["type"];const int count=stack["count"];
 const Tile* hit=terrainAt(c.first,c.second);
 if(hit&&hit->type=="recycler"){if(recycleYield(type,count).is_null())return refuse();return startRecycle(const_cast<Tile&>(*hit),type,count)?count:0;}
 if(hit&&hit->type=="fabricator"){Tile& fab=const_cast<Tile&>(*hit);if(!fabIngredients(fab).count(type))return refuse();if(!canStore(fab,type))return 0;J& m=mats(fab);int n=std::min(count,64-(int)num(m,type.c_str()));m[type]=num(m,type.c_str())+n;return n;}
 if(Box* box=boxNear({(double)c.first,(double)c.second},.55)){std::string held;for(auto& [k,v]:box->materials.items())if(v.is_number()&&v.get<double>()>0){held=k;break;}if(!held.empty()&&held!=type)return refuse();return boxInsert(*box,type,count);}
 if(const Mount* mh=mountHit({(double)c.first,(double)c.second})){Mount& m=mounts[mh-mounts.data()];
  if(m.type=="turret"){if(!isAmmo(type)||(m.ammo&&(m.ammoType.empty()?"ammo":m.ammoType)!=type))return refuse();int n=std::min(count,turretCapacity(m.starterRC,m.kind)-(int)m.ammo);if(n>0){m.ammoType=type;m.ammo+=n;t.extra["cooldown"]=data().raw.at("LOADER_TURRET_CYCLE");}return n;}
  if(m.type=="ejector")return launchCargo(m,type,count)?count:0;
  if(m.type=="thruster"){if(type!="fuel"&&type!="explosives")return refuse();double& tank=type=="fuel"?m.fuelItems:m.explosiveItems;int n=std::min(count,data().raw.at("THRUSTER_TANK").get<int>()-(int)tank);if(n>0)tank+=n;return std::max(0,n);}}
 if(val(t.extra,"requireOutput",false)||!interiorCell(c.first,c.second)||blocks.has(key(c.first,c.second)))return 0;
 if(const Tile* there=terrainAt(c.first,c.second))if(among(there->type,{"wedge","glass","net","fabricator","loader","pusher_block","walkway_wedge"}))return 0;
 for(auto& i:items){V2 p=vv(i->body->GetPosition());if(std::fabs(p.x-c.first)<.7&&std::fabs(p.y-c.second)<.7)return 0;}
 spawnItem(type,{(double)c.first,(double)c.second},{0,0},count).intakeFrom=key((int)t.x,(int)t.y);return count;}
bool Ship::loaderDrop(Tile& t,const J& stack,std::pair<int,int> output,std::pair<int,int> input){auto open=[&](std::pair<int,int> c){if(!interiorCell(c.first,c.second)||blocks.has(key(c.first,c.second))||mountHit({(double)c.first,(double)c.second}))return false;
   for(auto& b:boxes){V2 q=vv(b->body->GetPosition());if(std::fabs(q.x-c.first)<b->size/2+.3&&std::fabs(q.y-c.second)<b->size/2+.3)return false;}
   const Tile* tt=terrainAt(c.first,c.second);return !(tt&&among(tt->type,{"wedge","glass","net","loader","pusher_block","walkway_wedge","hatch","starter_hatch","door"}));};
 const std::pair<int,int> up{(int)t.x,(int)t.y-1};const std::pair<int,int>* c=nullptr;const std::pair<int,int>* opts[3]={&output,&up,&input};for(const auto* o:opts)if(open(*o)){c=o;break;}if(!c)return false;
 spawnItem(stack["type"],{(double)c->first,(double)c->second},{0,0},stack["count"]).intakeFrom=key((int)t.x,(int)t.y);return true;}
void Ship::tickLoaders(double dt){bool any=false;for(auto& [k,t]:terrain)if(t.type=="loader"){any=true;break;}if(!any)return;
 itemGrid.clear();for(auto& i:items){V2 p=vv(i->body->GetPosition());itemGrid[((long long)((int)std::floor(p.x/2)+32768)<<17)^((int)std::floor(p.y/2)+32768)].push_back(i.get());}
 const double half=data().raw.at("LOADER_CYCLE").get<double>()/2;
 for(auto& [k,t]:terrain){if(t.type!="loader")continue;J& e=t.extra;ensure(e,{"cooldown","cargo","phase","swing","refused","flash"});e["cooldown"]=std::max(0.0,num(e,"cooldown",0)-dt);if(!e.contains("cargo")||!e["cargo"].is_array())e["cargo"]=J::array();if(!e.contains("phase")||e["phase"].is_null())e["phase"]=0;
  std::string swing=e["swing"].is_string()?e["swing"].get<std::string>():std::string();if(swing.empty()){swing=e["cargo"].size()?"carry":(e["phase"].get<double>()>0?"return":"idle");e["swing"]=swing;}
  if(swing=="return"){e["phase"]=std::max(0.0,e["phase"].get<double>()-dt/half);if(e["phase"].get<double>()==0&&e["cooldown"].get<double>()==0){e["swing"]="idle";swing="idle";}else continue;}
  if(val(e,"filterMode",std::string("all"))=="off"&&swing=="idle")continue;
  Ends ends=loaderEnds(t);
  if(swing=="idle"){J got;if(!loaderTake(t,ends.input,got))continue;e["cargo"].push_back(got);e["swing"]="carry";swing="carry";}
  if(swing=="carry"){if(e["phase"].get<double>()<1){e["phase"]=std::min(1.0,e["phase"].get<double>()+dt/half);if(e["phase"].get<double>()<1)continue;}
   if(!e["cargo"].size()){e["swing"]="return";continue;}J& stack=e["cargo"][0];int n=loaderGive(t,ends.output,stack);
   if(n>0){stack["count"]=stack["count"].get<int>()-n;if(stack["count"].get<int>()<=0)e["cargo"].erase(0);e["flash"]=clock+.25;}
   else if(val(e,"refused",false)&&!val(e,"requireOutput",false)&&loaderDrop(t,stack,ends.output,ends.input))e["cargo"].erase(0);
   if(!e["cargo"].size())e["swing"]="return";}}
 itemGrid.clear();}
// ---- Recyclers -------------------------------------------------------------------------------------------------------------
J recycleYield(const std::string& type,int count){const J& swap=data().raw.at("RECYCLE_SWAP");if(swap.contains(type)&&swap[type].is_string())return J({{swap[type].get<std::string>(),count}});
 if(inTable("STARTER_ITEMS",type)||type=="fab_starter")return J();if(inTable("FREE_RECIPES",type))return J::object();J need=recipeNeeds(type);if(need.is_null())return J();
 const double per=num(data().raw.at("RECIPE_YIELD"),type.c_str(),0)?num(data().raw.at("RECIPE_YIELD"),type.c_str()):1,ret=data().raw.at("RECYCLE_RETURN");J out=J::object();for(auto& [m,n]:need.items())out[m]=n.get<double>()*count/per*ret;return out;}
bool Ship::startRecycle(Tile& f,const std::string& type,int count){ensure(f.extra,{"job","busy","lastOut","credit","output"});if(f.extra.contains("job")&&f.extra["job"].is_object())return false;if(recycleYield(type,count).is_null())return false;const double secs=data().raw.at("RECYCLE_SECONDS");
 f.extra["job"]={{"type",type},{"count",count},{"left",secs}};f.extra["busy"]=clock+secs;f.extra["lastOut"]="";effects.push_back({{"x",f.x+1},{"y",f.y+1},{"w",1},{"h",1},{"life",.5},{"color","red"},{"label",std::to_string(count)+" x "+nameOf(type)},{"from",{{"x",0},{"y",0}}}});return true;}
void Ship::finishRecycle(Tile& f){ensure(f.extra,{"job","credit","output","lastOut","busy"});J job=f.extra["job"];f.extra["job"]=nullptr;J y=recycleYield(job["type"],job["count"]);if(!y.is_object())y=J::object();J& credit=f.extra["credit"];if(!credit.is_object())credit=J::object();
 std::vector<std::pair<std::string,int>> out;for(auto& [m,n]:y.items()){credit[m]=num(credit,m.c_str())+n.get<double>();int whole=(int)std::floor(credit[m].get<double>()+1e-9);if(whole>0){credit[m]=credit[m].get<double>()-whole;out.push_back({m,whole});}}
 J stacks=J::array();for(auto& [m,k]:out){int left=k;while(left>0){int c=std::min(stackLimit(m),left);stacks.push_back({{"type",m},{"count",c}});left-=c;}}
 bool unloaded=false;for(auto& [k,l]:terrain)if(l.type=="loader"){auto in=loaderEnds(l).input;if(terrainAt(in.first,in.second)==&f)unloaded=true;}
 if(unloaded){J& o=f.extra["output"];if(!o.is_array())o=J::array();for(auto& s:stacks)o.push_back(s);while(o.size()>8){J first=o[0];o.erase(0);dropRecycled(f,first);}}else for(auto& s:stacks)dropRecycled(f,s);
 std::string last;for(size_t i=0;i<out.size();i++){if(i)last+=", ";last+=std::to_string(out[i].second)+" "+nameOf(out[i].first);}f.extra["lastOut"]=out.empty()?"(nothing left)":last;f.extra["busy"]=clock+1.5;}
void Ship::dropRecycled(Tile& f,const J& st){int w=3,h=4;{const J& m=data().raw.at("MACHINE_SIZE").at("recycler");w=m[0];h=m[1];}const double y=f.y+h-1;
 auto open=[&](double x){int rx=(int)jsRound(x),ry=(int)jsRound(y);return interiorCell(rx,ry)&&!blocks.has(key(rx,ry))&&!(terrainAt(rx,ry)&&solidCell(rx,ry,false));};
 const double right=f.x+w-.5+.4,left=f.x-.5-.4;spawnItem(st["type"],{open(right)||!open(left)?right:left,y},{0,0},st["count"]);}
void Ship::tickRecyclers(double dt){for(auto& [k,f]:terrain){if(f.type!="recycler")continue;ensure(f.extra,{"job","busy","credit","output","lastOut"});J& job=f.extra["job"];if(!job.is_object())continue;job["left"]=job["left"].get<double>()-dt;f.extra["busy"]=clock+std::max(job["left"].get<double>(),0.0)+.05;if(job["left"].get<double>()<=0)finishRecycle(f);}}
void Ship::recycleCarried(Crew& c,Tile& f){if(dist(pos(c),{f.x+1,f.y+1.5})>4){toast("Move closer to the recycler.");return;}const std::string t=c.slots[c.selected];const int n=c.counts[c.selected];
 if(t.empty()||!n){toast("Click the recycler with the stack you want to recycle in your hand.");return;}if(f.extra.contains("job")&&f.extra["job"].is_object()){toast("The recycler is still working.");return;}
 if(recycleYield(t,n).is_null()){toast(nameOf(t)+" can't be recycled.");return;}startRecycle(f,t,n);c.counts[c.selected]=0;c.slots[c.selected].clear();selectSlot(c,c.selected);}
// ---- Shredders, repairs, comms --------------------------------------------------------------------------------------------
bool Ship::shredAt(Crew& c,V2 p){const bool gold=c.tool=="shredder_gold";if(c.piloting||!(c.tool=="shredder"||gold)||!carried(c,c.tool))return false;
 if(!gold&&c.shredReady>clock){char buf[64];std::snprintf(buf,sizeof buf,"%g",std::ceil((c.shredReady-clock)*10)/10);toast(std::string("The shredder is still clearing its blades (")+buf+"s). A golden shredder has no wait.");return false;}
 size_t idx=items.size();for(size_t k=0;k<items.size();k++)if(dist(vv(items[k]->body->GetPosition()),p)<.55){idx=k;break;}if(idx==items.size()){toast("Point the shredder at a loose item stack.");return false;}
 Item& i=*items[idx];V2 q=vv(i.body->GetPosition());if(dist(pos(c),q)>3.5){toast("Move closer to shred it.");return false;}bool blocked=false;
 inside->rayCast(pos(c),q,[&](b2Fixture* f,b2Vec2,b2Vec2,float){if(f->GetBody()==interior&&f->GetFilterData().categoryBits==1){blocked=true;return 0.f;}return 1.f;});if(blocked){toast("A block is in the way.");return false;}
 c.facing=q.x<pos(c).x?-1:1;actionEffect(q.x,q.y,gold?"gold":"red",std::to_string(i.count)+" x "+nameOf(i.type),c);destroyItem(idx);if(!gold)c.shredReady=clock+data().raw.at("SHRED_COOLDOWN").get<double>();return true;}
void Ship::repairAt(Crew& c,std::pair<int,int> cell){const std::string k=key(cell.first,cell.second);Block* b=blocks.get(k);const Tile* t=b?nullptr:terrainAt(cell.first,cell.second);const Mount* m=(b||t)?nullptr:mountHit({(double)cell.first,(double)cell.second});
 const bool hull=hullHP.contains(k);b2Fixture* f=b?b->f:t?t->f:nullptr;
 if((!b&&!t&&!m&&!hull)||dist(pos(c),{(double)cell.first,(double)cell.second})>4||buildBlocked(c,{(double)cell.first,(double)cell.second},f)){toast("Aim at a reachable damaged tile.");return;}
 double hp=hull?hullHP[k].get<double>():b?b->hp:t?t->hp:m->hp;if(hp>=100){toast("Tile is already repaired.");return;}if(!carried(c,"iron")){toast("Repair costs 1 Iron.");return;}takeItem(c,"iron",1);
 const double n=std::min(100.0,hp+25);if(hull)hullHP[k]=n;else if(b)b->hp=n;else if(t)const_cast<Tile*>(t)->hp=n;else mounts[m-mounts.data()].hp=n;actionEffect(cell.first,cell.second,"blue","Repaired",c);}
const Tile* Ship::nearComms(V2 p)const{const double range=data().raw.at("COMMS_RANGE");for(auto& [k,t]:terrain)if(t.type=="comms"&&dist(p,{t.x,t.y+.5})<range)return &t;return nullptr;}
bool Ship::commsCheck(const std::string& id){Crew* c=crew.get(id);if(!c)return false;const Tile* t=!c->piloting?nearComms(pos(*c)):nullptr;if(t)const_cast<Tile*>(t)->extra["sent"]=clock+3;return t!=nullptr;}
// The outside (ejectors launching cargo into the zone) arrives with the exterior.
bool Ship::launchCargo(Mount& m,const std::string& type,int count){(void)m;(void)type;(void)count;return false;} // TODO stage 7
}
