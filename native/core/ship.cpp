#include "ship.h"
namespace nd {
uint16_t rankBit(const std::string& r){return r=="captain"?32:r=="crew"?64:r=="guest"?128:32;}
static bool doorAllows(const std::string& access,const std::string& rank){return access=="guest"||rank=="captain"||(access=="crew"&&rank=="crew");}
static uint16_t doorMask(const std::string& access){uint16_t m=8|512;for(const char* r:{"captain","crew","guest"})if(!doorAllows(access,r))m|=rankBit(r);return m;}
static void rotOffset(int dx,int dy,int r,int& ox,int& oy){r=((r%4)+4)%4;if(r==0){ox=dx;oy=dy;}else if(r==1){ox=-dy;oy=dx;}else if(r==2){ox=-dx;oy=-dy;}else{ox=dy;oy=-dx;}}
static bool inList(const char* table,const std::string& v){const J& t=data().raw.at(table);for(auto& x:t)if(x.is_string()&&x.get_ref<const std::string&>()==v)return true;return false;}
static bool turnsWithRotation(const std::string& type){return !inList("PHYSICS_MACHINES",type)&&!inList("STANDING_MACHINES",type)&&type!="fabricator"&&type!="storage"&&type!="ladder";}
static void machineSize(const std::string& type,int& w,int& h){const J& m=data().raw.at("MACHINE_SIZE");auto it=m.find(type);if(it!=m.end()){w=(*it)[0];h=(*it)[1];}else{w=1;h=1;}}
static std::vector<std::pair<int,int>> terrainCells(const Tile& t){int w,h;machineSize(t.type,w,h);int r=turnsWithRotation(t.type)?t.rotation:0;std::vector<std::pair<int,int>> out;
 for(int dx=0;dx<w;dx++)for(int dy=0;dy<h;dy++){int ox,oy;rotOffset(dx,dy,r,ox,oy);out.push_back({t.x+ox,t.y+oy});}return out;}
static b2PolygonShape boxShape(double hx,double hy,V2 c){b2PolygonShape s;s.SetAsBox((float)hx,(float)hy,bv(c),0);return s;}
// doorBox (game.js): a 1×2 door, its second cell rotOffset(0,1) away, so the box sits half a tile toward it.
static b2PolygonShape doorBox(int x,int y,int r){r=((r%4)+4)%4;const double dx=0,dy=.5;const double ox=r==0?dx:r==1?-dy:r==2?-dx:dy,oy=r==0?dy:r==1?dx:r==2?-dy:-dx;
 const bool odd=r%2;return boxShape(odd?1:.5,odd?.5:1,{x+ox,y+oy});}
Keys Keys::from(const J& k){Keys o;if(!k.is_object())return o;auto b=[&](const char* n){auto it=k.find(n);if(it==k.end())return false;const J& v=*it;
  if(v.is_boolean())return v.get<bool>();if(v.is_number())return v.get<double>()!=0;if(v.is_string())return !v.get_ref<const std::string&>().empty();return !v.is_null();};
 o.w=b("w");o.a=b("a");o.s=b("s");o.d=b("d");o.up=b("arrowup");o.down=b("arrowdown");o.left=b("arrowleft");o.right=b("arrowright");o.space=b(" ");o.shift=b("shift");return o;}

Ship::Ship(const J& saved){
 if(saved.is_object()&&saved.contains("bounds")&&saved["bounds"].is_object()){const J& b=saved["bounds"];bounds.l=b.value("l",-5);bounds.r=b.value("r",5);bounds.t=b.value("t",-4);bounds.b=b.value("b",3);}
 b2BodyDef d;interior=inside.w.CreateBody(&d);
 rebuildShell();
 if(saved.is_object()&&saved.contains("helm")&&saved["helm"].is_object()){helm.x=saved["helm"].value("x",1);helm.y=saved["helm"].value("y",bounds.b-1);}else{helm.x=1;helm.y=bounds.b-1;}
 if(saved.is_object()&&saved.contains("blocks")&&saved["blocks"].is_array())for(auto& b:saved["blocks"]){if(!b.is_object())continue;int x=b.value("x",0),y=b.value("y",0);if(interiorCell(x,y)&&!(x==helm.x&&y==helm.y))addBlock(x,y,b.value("rotation",0));}
 if(saved.is_object()&&saved.contains("terrain")&&saved["terrain"].is_array())for(auto& t:saved["terrain"]){if(!t.is_object())continue;std::string type=t.value("type","");int x=t.value("x",0),y=t.value("y",0);
  if(type.empty()||type=="fabricator"||!interiorCell(x,y)||blocks.has(key(x,y)))continue;
  if(type=="storage")continue; // TODO stage 4: expando boxes (spawnBox)
  Tile* n=addTerrain(type,x,y,t.value("rotation",0));if(!n)continue;
  if(type=="door"&&t.contains("access")&&t["access"].is_string()){std::string a=t["access"];if(a=="captain"||a=="crew"||a=="guest"){n->access=a;if(n->f){interior->DestroyFixture(n->f);skinDirty=true;b2PolygonShape s=doorBox(x,y,n->rotation);n->f=fixture(s,.2f,DOOR_BIT,doorMask(a));}}}
  if(type=="spawn"&&t.contains("access")&&t["access"].is_string()){std::string a=t["access"];if(a=="captain"||a=="crew"||a=="guest")n->access=a;}}
 // TODO stage 4: mounts, machines (game.js creates them here, before the first crew body)
 // The first crew member's body exists with the ship (game.js initialize), before the cargo: body order matters to Box2D.
 spare=makeCrewBody(2|32);
 if(saved.is_object()&&saved.contains("position")&&saved["position"].is_object()){shipPos.x=saved["position"].value("x",0.0);shipPos.y=saved["position"].value("y",0.0);}
 if(saved.is_object()&&saved.contains("items")&&saved["items"].is_array())for(auto& i:saved["items"]){if(!i.is_object())continue;std::string type=i.contains("type")&&i["type"].is_string()?i["type"].get<std::string>():"";
  const auto& ty=data().types;if(std::find(ty.begin(),ty.end(),type)==ty.end()){if(type.empty()||type=="empty"||type=="undefined"||type=="null")type="ammo";else continue;}
  auto n=[&](const char* k){return i.contains(k)&&i[k].is_number()?i[k].get<double>():0.0;};int count=i.contains("count")&&i["count"].is_number()&&i["count"].get<double>()?(int)i["count"].get<double>():1;
  spawnItem(type,{clamp(n("x"),bounds.l+.9,bounds.r-.9),clamp(n("y"),bounds.t+.9,bounds.b-.9)},{0,0},count).intakeFrom=i.contains("intakeFrom")?i["intakeFrom"]:J();}
 if(saved.is_object()&&saved.contains("boxes")&&saved["boxes"].is_array())for(auto& b:saved["boxes"]){if(!b.is_object())continue;J mats=J::object();
  if(b.contains("materials")&&b["materials"].is_object())for(auto& [k,v]:b["materials"].items()){std::string t=k;const auto& ty=data().types;if(std::find(ty.begin(),ty.end(),t)==ty.end()){if(t.empty()||t=="empty"||t=="undefined"||t=="null")t="ammo";else continue;}
   if(v.is_number()&&v.get<double>()>0)mats[t]=(mats.contains(t)?mats[t].get<double>():0)+v.get<double>();}
  auto n=[&](const char* k){return b.contains(k)&&b[k].is_number()?b[k].get<double>():0.0;};Box& x=spawnBox({n("x"),n("y")},mats);x.body->SetTransform(x.body->GetPosition(),(float)n("angle"));}
 if(saved.is_object()&&saved.contains("stacks")&&saved["stacks"].is_array())savedStacks=saved["stacks"];
 else if(saved.is_object()){
  // A save from before hands existed (no "stacks"): the old inventory — a wrench and 16 blocks, ladders, walkways and
  // nets, plus whatever it listed — is handed out type by type in TYPES order; what doesn't fit drops at the helm.
  J inv=J::object();for(auto& t:data().types)inv[t]=0;inv["wrench"]=1;inv["block"]=16;inv["ladder"]=16;inv["walkway"]=16;inv["net"]=16;
  if(saved.contains("inventory")&&saved["inventory"].is_object())for(auto& t:data().types){auto it=saved["inventory"].find(t);if(it!=saved["inventory"].end()&&it->is_number())inv[t]=std::max(0.0,std::floor(it->get<double>()));}
  Crew tmp;for(int i=0;i<5;i++){tmp.slots[i].clear();tmp.counts[i]=0;}tmp.body=spare;
  for(auto& t:data().types){int n=(int)inv[t].get<double>();if(n>0){int added=addCarried(tmp,t,n);if(n>added)scatter(t,n-added,vv(spare->GetPosition()));}}
  savedStacks=J::array();for(int i=0;i<5;i++)savedStacks.push_back(tmp.slots[i].empty()?J():J({{"type",tmp.slots[i]},{"count",tmp.counts[i]}}));}
}
Ship::~Ship(){}
b2Fixture* Ship::fixture(const b2Shape& shape,float friction,uint16_t cat,uint16_t mask,float density){b2FixtureDef fd;fd.shape=&shape;fd.friction=friction;fd.density=density;fd.filter.categoryBits=cat;fd.filter.maskBits=mask;skinDirty=true;return interior->CreateFixture(&fd);}
// The hull ring: top and bottom rows, then the side columns (game.js rebuildShell; the outside hull comes with the
// exterior in a later stage).
void Ship::rebuildShell(){for(b2Fixture* f:shell)interior->DestroyFixture(f);shell.clear();skinDirty=true;std::vector<std::pair<int,int>> cells;
 for(int x=bounds.l;x<=bounds.r;x++)for(int y:{bounds.t,bounds.b})cells.push_back({x,y});for(int y=bounds.t+1;y<bounds.b;y++)for(int x:{bounds.l,bounds.r})cells.push_back({x,y});
 for(auto [x,y]:cells){b2PolygonShape s=boxShape(.5,.5,{(double)x,(double)y});b2FixtureDef fd;fd.shape=&s;fd.density=1;fd.friction=.4f;shell.push_back(interior->CreateFixture(&fd));}}
void Ship::addBlock(int x,int y,int rotation){b2PolygonShape s=boxShape(.5,.5,{(double)x,(double)y});Block b;b.x=x;b.y=y;b.rotation=rotation;b.f=fixture(s,.7f);blocks.set(key(x,y),b);}
Tile* Ship::addTerrain(const std::string& type,int x,int y,int rotation){if(type=="ladder")rotation=0;
 if(type=="storage")return nullptr;            // TODO stage 4: spawnBox
 if(inList("PHYSICS_MACHINES",type))return nullptr; // TODO stage 5: spawnMachine
 Tile t;t.type=type;t.x=x;t.y=y;t.rotation=rotation;b2Fixture* f=nullptr;
 if(type=="wedge"||type=="walkway_wedge"){double a=rotation*M_PI/2;b2Vec2 vs[3];const double pts[3][2]={{-.5,-.5},{.5,.5},{-.5,.5}};
  for(int i=0;i<3;i++)vs[i]=b2Vec2((float)(x+pts[i][0]*std::cos(a)-pts[i][1]*std::sin(a)),(float)(y+pts[i][0]*std::sin(a)+pts[i][1]*std::cos(a)));
  b2PolygonShape s;s.Set(vs,3);f=type=="walkway_wedge"?fixture(s,.65f,CAT_WALKWAY,2|512):fixture(s,.65f);}
 if(type=="walkway"){auto s=boxShape(.5,.5,{(double)x,(double)y});f=fixture(s,.7f,CAT_WALKWAY,2|512);}
 if(type=="glass"){auto s=boxShape(.5,.5,{(double)x,(double)y});f=fixture(s,.02f);}
 if(type=="pusher_block"||type=="paint"){auto s=boxShape(.5,.5,{(double)x,(double)y});f=fixture(s,.7f);}
 if(type=="loader"){auto s=boxShape(.5,.5,{(double)x,(double)y});f=fixture(s,.7f,CAT_TILE,0xffff&~8);}
 if(type=="net"){auto s=boxShape(.5,.5,{(double)x,(double)y});f=fixture(s,.7f,CAT_NET,8|512);}
 if(type=="door"){auto s=doorBox(x,y,rotation);f=fixture(s,.2f,DOOR_BIT,doorMask("crew"));}
 t.f=f;if(type=="door"||type=="spawn")t.access="crew";if(type=="sign")t.extra["text"]="";if(type=="paint")t.extra["color"]=data().raw.at("PAINT_DEFAULT");
 return &terrain.set(key(x,y),t);}
// terrainAt (game.js): the tile whose cells cover c; a later tile wins a shared cell, as in the old index.
const Tile* Ship::terrainAt(int x,int y)const{const Tile* hit=nullptr;for(auto& [k,t]:terrain)for(auto [cx,cy]:terrainCells(t))if(cx==x&&cy==y)hit=&t;return hit;}
std::vector<const Tile*> Ship::terrainOfType(const std::string& type)const{std::vector<const Tile*> out;for(auto& [k,t]:terrain)if(t.type==type)out.push_back(&t);return out;}

// ---- Collision skin (game.js syncSkin/cellLoops/unitCell): one smooth chain loop around each patch of same-kind
// 1×1 tiles, so nothing catches on the seams between tile boxes; the boxes themselves stop colliding (mask 0).
static bool unitCell(b2Fixture* f,int& cx,int& cy){if(f->GetType()!=b2Shape::e_polygon)return false;auto* s=(b2PolygonShape*)f->GetShape();if(s->m_count!=4)return false;
 float x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(int i=0;i<4;i++){x0=std::min(x0,s->m_vertices[i].x);x1=std::max(x1,s->m_vertices[i].x);y0=std::min(y0,s->m_vertices[i].y);y1=std::max(y1,s->m_vertices[i].y);}
 if(std::fabs(x1-x0-1)>1e-4||std::fabs(y1-y0-1)>1e-4)return false;for(int i=0;i<4;i++){auto v=s->m_vertices[i];if((std::fabs(v.x-x0)>1e-4&&std::fabs(v.x-x1)>1e-4)||(std::fabs(v.y-y0)>1e-4&&std::fabs(v.y-y1)>1e-4))return false;}
 double x=x0+.5,y=y0+.5;if(std::fabs(x-jsRound(x))<1e-4&&std::fabs(y-jsRound(y))<1e-4){cx=(int)jsRound(x);cy=(int)jsRound(y);return true;}return false;}
std::vector<std::vector<std::pair<double,double>>> cellLoops(const std::vector<std::pair<int,int>>& cells){
 struct E{int ax,ay,bx,by;bool used=false;};std::unordered_set<long long> has;auto ck=[](int x,int y){return ((long long)x<<32)^(unsigned)y;};for(auto [x,y]:cells)has.insert(ck(x,y));
 OMap<std::string,std::vector<int>> out;std::vector<E> edges;auto edge=[&](int ax,int ay,int bx,int by){std::string k=std::to_string(ax)+","+std::to_string(ay);auto* l=out.get(k);if(!l)l=&out.set(k,{});edges.push_back({ax,ay,bx,by});l->push_back((int)edges.size()-1);};
 for(auto [x,y]:cells){int X0=2*x-1,X1=2*x+1,Y0=2*y-1,Y1=2*y+1;auto h=[&](int i,int j){return has.count(ck(x+i,y+j))>0;};
  if(!h(0,-1))edge(X0,Y0,X1,Y0);if(!h(1,0))edge(X1,Y0,X1,Y1);if(!h(0,1))edge(X1,Y1,X0,Y1);if(!h(-1,0))edge(X0,Y1,X0,Y0);}
 std::vector<std::vector<std::pair<double,double>>> loops;
 for(auto& [k,list]:out)for(int i0:list){if(edges[i0].used)continue;std::vector<std::pair<int,int>> pts;int e=i0;
  while(e>=0&&!edges[e].used){edges[e].used=true;pts.push_back({edges[e].ax,edges[e].ay});int dx=edges[e].bx-edges[e].ax,dy=edges[e].by-edges[e].ay;
   std::vector<int> next;if(auto* l=out.get(std::to_string(edges[e].bx)+","+std::to_string(edges[e].by)))for(int n:*l)if(!edges[n].used)next.push_back(n);
   auto turn=[&](int n){int ex=edges[n].bx-edges[n].ax,ey=edges[n].by-edges[n].ay,cr=dx*ey-dy*ex;return cr>0?0:cr==0?1:2;};
   std::stable_sort(next.begin(),next.end(),[&](int p,int q){return turn(p)<turn(q);});e=next.empty()?-1:next[0];}
  std::vector<std::pair<double,double>> v;const size_t n=pts.size();for(size_t i=0;i<n;i++){auto a=pts[(i+n-1)%n],p=pts[i],b=pts[(i+1)%n];
   if((long long)(p.first-a.first)*(b.second-p.second)-(long long)(p.second-a.second)*(b.first-p.first)!=0)v.push_back({p.first/2.0,p.second/2.0});}
  if(v.size()>=3)loops.push_back(v);}
 return loops;}
void Ship::syncSkin(){if(!skinDirty)return;skinDirty=false;if(skinBody)inside.destroy(skinBody);b2BodyDef d;skinBody=inside.w.CreateBody(&d);
 struct G{uint16_t cat,mask;float friction;std::vector<std::pair<int,int>> cells;};OMap<std::string,G> groups;static std::unordered_map<const void*,uint16_t> dummy;(void)dummy;
 for(b2Fixture* f=interior->GetFixtureList();f;f=f->GetNext()){if(f->IsSensor())continue;int x,y;if(!unitCell(f,x,y))continue;
  // the mask a tile had before the skin took over (kept in the fixture's user data: Box2D 2.4.1 gives one pointer-size slot)
  auto& ud=f->GetUserData();if(!ud.pointer)ud.pointer=0x10000|f->GetFilterData().maskBits;uint16_t skinMask=(uint16_t)(ud.pointer&0xffff);
  const uint16_t cat=f->GetFilterData().categoryBits;const bool ice=f->GetFriction()<.1f;std::string k=std::to_string(cat)+":"+std::to_string(skinMask)+":"+(ice?"true":"false");
  G* g=groups.get(k);if(!g)g=&groups.set(k,G{cat,skinMask,ice?f->GetFriction():.55f,{}});g->cells.push_back({x,y});
  if(f->GetFilterData().maskBits!=0){b2Filter fl=f->GetFilterData();fl.maskBits=0;f->SetFilterData(fl);}}
 for(auto& [k,g]:groups)for(auto& loop:cellLoops(g.cells)){std::vector<b2Vec2> vs;for(auto [x,y]:loop)vs.push_back(b2Vec2((float)x,(float)y));b2ChainShape ch;ch.CreateLoop(vs.data(),(int)vs.size());
  b2FixtureDef fd;fd.shape=&ch;fd.friction=g.friction;fd.filter.categoryBits=g.cat;fd.filter.maskBits=g.mask;skinBody->CreateFixture(&fd);}}

// ---- Crew --------------------------------------------------------------------------------------------------------
b2Body* Ship::makeCrewBody(uint16_t cat){b2BodyDef d;d.type=b2_dynamicBody;d.position=b2Vec2((float)helm.x,(float)helm.y-.15f);d.fixedRotation=true;d.bullet=true;b2Body* b=inside.w.CreateBody(&d);
 const b2Vec2 vs[8]={{-.15f,-.62f},{.15f,-.62f},{.23f,-.54f},{.23f,.54f},{.15f,.62f},{-.15f,.62f},{-.23f,.54f},{-.23f,-.54f}};b2PolygonShape s;s.Set(vs,8);
 b2FixtureDef fd;fd.shape=&s;fd.density=1;fd.friction=0;fd.restitution=0;fd.filter.categoryBits=cat;fd.filter.maskBits=1|4|8|256;b->CreateFixture(&fd);return b;}
// newCrew (room-runtime): the first to join takes the ship's own body and hands (saved with the ship); others start at
// the helm with a wrench. spawnKit: only captains keep a wrench.
Crew& Ship::newCrew(const std::string& id,const std::string& name){if(crew.size()>=8)fail("Ship crew is full");
 Crew c;c.id=id;c.name=name;
 if(crew.size()==0&&spare){c.body=spare;spare=nullptr;if(savedStacks.is_array()){for(int i=0;i<5;i++){const J& a=savedStacks[i];c.slots[i]=a.is_object()&&a.contains("type")&&a["type"].is_string()?a["type"].get<std::string>():"";c.counts[i]=a.is_object()&&a.contains("count")&&a["count"].is_number()?a["count"].get<int>():0;}savedStacks=J();}}
 else c.body=makeCrewBody(2|128);
 return crew.set(id,c);}
void Ship::spawnKit(Crew& c){const bool cap=c.rank=="captain";for(int i=0;i<5;i++)if(c.slots[i]=="wrench"&&!cap){c.slots[i].clear();c.counts[i]=0;}
 bool has=false;for(auto& s:c.slots)if(s=="wrench")has=true;if(cap&&!has){for(int i=0;i<5;i++)if(c.slots[i].empty()){c.slots[i]="wrench";c.counts[i]=1;break;}}
 int w=-1;for(int i=0;i<5;i++)if(c.slots[i]=="wrench"){w=i;break;}selectSlot(c,std::max(0,w));
 // TODO stage 4: spawn points (spawnPointFor)
}
// removeCrew: their stacks (but a wrench) drop where they stood; the last one's body stays for the next to join.
void Ship::removeCrew(const std::string& id){Crew* c=crew.get(id);if(!c)return;Crew* was=actor;actor=c;V2 p=vv(c->body->GetPosition());
 for(int n=0;n<5;n++){if(!c->slots[n].empty()&&c->slots[n]!="wrench")scatter(c->slots[n],c->counts[n],p);c->slots[n].clear();c->counts[n]=0;}
 if(crew.size()>1)inside.destroy(c->body);else{spare=c->body;spare->SetEnabled(true);spare->SetTransform(b2Vec2((float)helm.x,(float)helm.y-.15f),0);}
 actor=was==c?nullptr:was;crew.erase(id);}
// playerFilter (game.js): a crew member collides as their rank (doors read it).
void Ship::setRank(const std::string& id,const std::string& rank){Crew* c=crew.get(id);if(!c||(rank!="captain"&&rank!="crew"&&rank!="guest"))return;c->rank=rank;
 b2Fixture* f=c->body->GetFixtureList();if(!f)return;uint16_t cat=2|rankBit(rank),mask=1|4|8|DOOR_BIT;b2Filter fl=f->GetFilterData();if(fl.categoryBits!=cat||fl.maskBits!=mask){fl.categoryBits=cat;fl.maskBits=mask;fl.groupIndex=0;f->SetFilterData(fl);}}
static double accelerate(double v,double target,double amount){return v<target?std::min(target,v+amount):std::max(target,v-amount);}
// The planck velocity setter, as the native interiors saw it: a real change is applied (waking the body); setting a
// sleeping body to a non-zero velocity wakes it even when the change is tiny.
static void setVel(b2Body* b,V2 v){setVelocity(b,v);if((v.x!=0||v.y!=0)&&!b->IsAwake())b->SetAwake(true);}
// stepController (controller.js), on foot. Piloting (thrusters) comes with the exterior.
void Ship::stepController(Crew& c,double dt){if(c.piloting)return;b2Body* player=c.body;
 V2 p=vv(player->GetPosition()),v=vv(player->GetLinearVelocity());const Keys& k=c.keys;
 const int move=(k.moveRight()?1:0)-(k.moveLeft()?1:0);const bool up=k.upKey(),down=k.downKey();
 if(!c.manning.empty()&&(move||up||down||k.space))c.manning.clear();
 const Tile* ladder=nullptr;for(const Tile* t:terrainOfType("ladder"))if(!(t->rotation%2)&&std::fabs(t->x-p.x)<.6&&t->y-p.y<1.2&&p.y-t->y<1.04){ladder=t;break;}
 if(!ladder)c.climbing=false;else if((up||down)&&c.ladderCooldown<=0){c.climbing=true;c.ladderX=ladder->x;}
 if(c.climbing&&move){double top=1e18;for(const Tile* t:terrainOfType("ladder"))if(t->x==c.ladderX)top=std::min(top,(double)t->y);
  if(p.y<=top-.85){c.climbing=false;c.ladderCooldown=.3;player->SetGravityScale(1);v.x=move*3.2;v.y=std::min(v.y,-.6);c.facing=move;}}
 c.grounded=false;inside.rayCast({p.x,p.y+.53},{p.x,p.y+.75},[&](b2Fixture* f,b2Vec2,b2Vec2 n,float){if(f->GetBody()!=player&&f->GetFilterData().categoryBits!=16&&n.y<-.4f)c.grounded=true;return 1.f;});
 const bool pressed=k.space&&!c.jumpWas;if(pressed&&(c.grounded||c.climbing)){c.climbing=false;c.ladderCooldown=.3;c.jumpTime=.16;v.y=-4.6;}
 if(c.climbing){setTransform(player,{c.ladderX,p.y});v.x=0;v.y=accelerate(v.y,((down?1:0)-(up?1:0))*3.2,30*dt);player->SetGravityScale(0);}
 else{if(move)c.facing=move;const Tile* under=c.grounded?terrainAt((int)jsRound(p.x),(int)jsRound(p.y+.95)):nullptr;const bool onIce=under&&under->type=="glass";
  v.x=accelerate(v.x,move*4.5,(c.grounded?(onIce?(move?4:1):(move?28:34)):14)*dt);player->SetGravityScale(1);
  if(k.space&&c.jumpTime>0){v.y-=35*dt;c.jumpTime-=dt;}else{c.jumpTime=0;if(!k.space&&v.y<-4)v.y=accelerate(v.y,-4,30*dt);}}
 setVel(player,v);c.jumpWas=k.space;}
// clampToLadder (game.js), for every climbing crew member (the old server only clamped the last one it had stepped).
void Ship::clampToLadder(Crew& c){if(!c.climbing)return;double lo=1e18,hi=-1e18;bool any=false;for(const Tile* t:terrainOfType("ladder"))if(t->x==c.ladderX){any=true;lo=std::min(lo,(double)t->y);hi=std::max(hi,(double)t->y);}
 if(!any)return;V2 p=vv(c.body->GetPosition());double y=clamp(p.y,lo-1.13,hi+.4);if(y!=p.y){setTransform(c.body,{c.ladderX,y});setVel(c.body,{0,0});}}
// One tick (game.js step + room-runtime serverCrewStep/serverCrewAfterStep), the parts ported so far.
void Ship::tick(double dt){clock+=dt;
 mergeTouchingCargo();tickHullLeaks();tickTrashDecay(dt);
 for(auto& [id,c]:crew){actor=&c;c.inputAge+=dt;if(c.inputAge>.5)c.keys=Keys();c.ladderCooldown=std::max(0.0,c.ladderCooldown-dt);stepController(c,dt);}actor=nullptr;
 syncSkin();inside.step(dt);tickSafeguards(dt);
 const double maxSpeed=data().raw.at("SAFETY").at("maxCrewSpeed").get<double>();
 for(auto& [id,c]:crew){clampToLadder(c);if(c.piloting)continue;b2Body* b=c.body;V2 p=vv(b->GetPosition()),v=vv(b->GetLinearVelocity());
  if(!std::isfinite(p.x)||!std::isfinite(p.y)||!std::isfinite(v.x)||!std::isfinite(v.y)){c.climbing=false;b->SetEnabled(true);b->SetGravityScale(1);setTransform(b,{(double)helm.x,helm.y-.15});setVel(b,{0,0});continue;}
  double s=v.len();if(s>maxSpeed)setVel(b,{v.x*maxSpeed/s,v.y*maxSpeed/s});
  if(!c.noclip){double x=clamp(p.x,bounds.l+.75,bounds.r-.75),y=clamp(p.y,bounds.t+1.13,bounds.b-1.13);if(x!=p.x||y!=p.y)setTransform(b,{x,y});}}}
J Ship::crewState()const{J out=J::array();for(auto& [id,c]:crew){auto p=c.body->GetPosition(),v=c.body->GetLinearVelocity();
 out.push_back({{"id",id},{"p",{{"x",p.x},{"y",p.y}}},{"v",{{"x",v.x},{"y",v.y}}},{"climbing",c.climbing},{"grounded",c.grounded},{"facing",c.facing},{"ladderX",c.ladderX},{"awake",c.body->IsAwake()}});}return out;}
}

namespace nd {
// ---- Commands (room-runtime command): the parts ported so far ------------------------------------------------------
static bool isInt(const J& v){return v.is_number_integer()||(v.is_number_float()&&std::floor(v.get<double>())==v.get<double>());}
void Ship::command(const std::string& id,const J& msg){Crew* m=crew.get(id);if(!m||!msg.is_object())return;actor=m;
 const std::string a=msg.contains("action")&&msg["action"].is_string()?msg["action"].get<std::string>():"";
 auto allowed=[&](){if(m->rank=="captain"||a=="dev")return true;if(a=="rename"||a=="door"||a=="spawnrank")return false;if(m->rank=="guest"&&a=="sign")return false;return true;};
 if(!allowed()){if(a!="input")toast(a=="rename"||a=="door"||a=="spawnrank"?"Only the captain can do that.":"Guests cannot do that here — ask the captain to make you crew.");actor=nullptr;return;}
 auto vec=[&](const char* k,V2& out){auto it=msg.find(k);if(it==msg.end()||!it->is_object())return false;auto x=it->find("x"),y=it->find("y");if(x==it->end()||y==it->end()||!x->is_number()||!y->is_number())return false;
  double X=x->get<double>(),Y=y->get<double>();if(!std::isfinite(X)||!std::isfinite(Y)||std::fabs(X)>=10000||std::fabs(Y)>=10000)return false;out={X,Y};return true;};
 V2 aim;if(vec("aim",aim)){m->mouse=aim-shipPos;m->mouseActive=true;}if(vec("local",aim)){m->mouse=aim;m->mouseActive=true;}
 auto flagOf=[&](const char* k){auto it=msg.find(k);return it!=msg.end()&&((it->is_boolean()&&it->get<bool>())||(it->is_number()&&it->get<double>()!=0)||(it->is_string()&&!it->get_ref<const std::string&>().empty())||it->is_object()||it->is_array());};
 auto intOf=[&](const char* k,int& out){auto it=msg.find(k);if(it==msg.end()||!it->is_number()||!isInt(*it))return false;out=(int)it->get<double>();return true;};
 if(a=="input"){m->keys=Keys::from(msg.contains("keys")?msg["keys"]:J());m->inputAge=0;}
 else if(a=="select"){int n;if(intOf("slot",n)&&n>=0&&n<5)selectSlot(*m,n);}
 else if(a=="drop")dropItem(*m,flagOf("half"));
 else if(a=="moveStack"){int f,t;if(intOf("from",f)&&intOf("to",t)&&f>=0&&f<5&&t>=0&&t<5)moveStack(*m,f,t,flagOf("half"));}
 else if(a=="dev"&&m->admin){const std::string op=msg.contains("op")&&msg["op"].is_string()?msg["op"].get<std::string>():"";
  if(op=="noclip"){m->noclip=!m->noclip;toast(std::string("Noclip ")+(m->noclip?"on: WASD/Space fly through anything, Shift for speed.":"off."));}
  else if(op=="sandbox"){m->sandbox=!m->sandbox;toast(std::string("Sandbox build mode ")+(m->sandbox?"on: building is instant and uses no items.":"off."));}
  else if(op=="give"&&msg.contains("item")&&msg["item"].is_string()){std::string item=msg["item"];const auto& ty=data().types;if(std::find(ty.begin(),ty.end(),item)!=ty.end()){
   double c=msg.contains("count")&&msg["count"].is_number()?std::floor(msg["count"].get<double>()):0;int n=(int)clamp(c&&std::isfinite(c)?c:1,1,512);giveItem(*m,item,n);}}}
 // TODO later stages: interact, leave, edit, remove, rotate, helm, portal, craft, material, clearQueue, repeat, door,
 // spawnrank, sign, paint, pusher, hatch, recover, rename, the other dev ops.
 actor=nullptr;}
J Ship::state()const{J out=J::object();out["bounds"]={{"l",bounds.l},{"r",bounds.r},{"t",bounds.t},{"b",bounds.b}};out["helm"]={{"x",helm.x},{"y",helm.y}};
 J it=J::array();for(auto& i:items){auto p=i->body->GetPosition();it.push_back({{"type",i->type},{"count",i->count},{"intakeFrom",i->intakeFrom},{"x",p.x},{"y",p.y}});}out["items"]=it;
 J bx=J::array();for(auto& b:boxes){auto p=b->body->GetPosition(),v=b->body->GetLinearVelocity();bx.push_back({{"x",p.x},{"y",p.y},{"angle",b->body->GetAngle()},{"materials",b->materials},{"size",b->size},{"vx",v.x},{"vy",v.y}});}out["boxes"]=bx;
 return out;}
}
