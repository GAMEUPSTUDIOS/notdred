// Zones (dist/modules/zones.js, the treasure of dist/modules/missions.js), ported one for one: see zone.h.
#include "zone.h"
#include "jsmath.h"
#include "ship.h"
namespace nd {
double terrainHash(double x,double y){return std::fmod(std::fabs(jsmath::sin(x*127.1+y*311.7)*43758.5453),1.0);}
double finchNoise(double x,double y){const double ix=std::floor(x),iy=std::floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v);
 return (terrainHash(ix,iy)*(1-s)+terrainHash(ix+1,iy)*s)*(1-t)+(terrainHash(ix,iy+1)*(1-s)+terrainHash(ix+1,iy+1)*s)*t;}
// A key from numbers, as JavaScript's `${x},${y}` writes them.
static std::string keyd(double x,double y){return jsNum(x)+","+jsNum(y);}
static double tileHp(const std::string& kind){const J& T=data().raw.at("WORLD_TILE_HP");if(kind=="hazard")return 1e9;auto it=T.find(kind);if(it!=T.end()&&it->is_number()&&it->get<double>()!=0)return it->get<double>();return T.at("rock").get<double>();}
static double num(const J& o,const char* k,double d=0){return val(o,k,d);}
static b2Fixture* boxFixture(b2Body* b,double hx,double hy,V2 c,float friction=.2f,float density=0,float restitution=0){b2PolygonShape s;s.SetAsBox((float)hx,(float)hy,bv(c),0);b2FixtureDef fd;fd.shape=&s;fd.friction=friction;fd.density=density;fd.restitution=restitution;return b->CreateFixture(&fd);}

Zone::Zone(const std::string& zid,double sd,const J& minedList,const J& saved,const MissionState* m):id(zid),seed(sd),mission(m){
 def=&zoneDef(id);if(!data().zones.contains(id))id=val(*def,"id",data().startZone);
 if(minedList.is_array())for(auto& v:minedList)if(v.is_string())mined.insert(v.get<std::string>());
 if(saved.is_object()){for(const char* k:{"boulders","loot"})if(saved.contains(k)&&saved[k].is_array())st[k]=saved[k];}
 hasGrid=def->contains("gen")&&(*def)["gen"].is_object();if(hasGrid)grid=generateZone(seed,(*def)["gen"]);
 rng^=(uint64_t)(seed*2654435761.0)+1;setup();}
Zone::~Zone(){}
bool Zone::combat()const{return val(*def,"kind","")=="combat";}
const J& Zone::gen()const{static const J none=J::object();auto it=def->find("gen");return it!=def->end()&&it->is_object()?*it:none;}
double Zone::random(){if(diceAt<dice.size())return dice[diceAt++];rng^=rng<<13;rng^=rng>>7;rng^=rng<<17;return (rng>>11)*(1.0/9007199254740992.0);}

// ---- Rock -----------------------------------------------------------------------------------------------------------
// Rock collision is built per 8×8-cell chunk as a few greedy-merged rectangles (rockChunks); `rocks` holds one record
// per cell; mining a cell rebuilds only its chunk.
std::string Zone::rockChunkOf(double x,double y)const{const double C=data().raw.at("ROCK_CHUNK").get<double>();
 return jsNum(std::floor((x-grid.minX)/grid.cell/C))+":"+jsNum(std::floor((y-grid.minY)/grid.cell/C));}
void Zone::buildRockChunk(const std::string& k){RockChunk* ch=rockChunks.get(k);if(!ch)return;if(ch->body){world->destroy(ch->body);ch->body=nullptr;}ch->dirty=false;if(ch->cells.empty())return;
 const double c=grid.cell;std::unordered_set<std::string> taken;auto has=[&](double x,double y){const std::string q=keyd(x,y);return ch->cells.count(q)&&!taken.count(q);};
 b2BodyDef d;ch->body=world->w.CreateBody(&d);std::vector<const Rock*> cells;for(auto& id:ch->cells)if(const Rock* r=rocks.get(id))cells.push_back(r);
 std::sort(cells.begin(),cells.end(),[](const Rock* a,const Rock* b){return a->y!=b->y?a->y<b->y:a->x<b->x;});
 for(const Rock* r:cells){if(taken.count(r->id))continue;int w=1,h=1;while(has(r->x+w*c,r->y))w++;
  for(;;){bool row=true;for(int i=0;i<w;i++)if(!has(r->x+i*c,r->y+h*c)){row=false;break;}if(!row)break;h++;}
  for(int j=0;j<h;j++)for(int i=0;i<w;i++)taken.insert(keyd(r->x+i*c,r->y+j*c));
  boxFixture(ch->body,w*c/2,h*c/2,{r->x+(w-1)*c/2,r->y+(h-1)*c/2},.4f);}}
bool Zone::removeRock(const std::string& rid,bool rebuild){Rock* r=rocks.get(rid);if(!r)return false;const std::string k=r->chunk;rocks.erase(rid);
 if(RockChunk* ch=rockChunks.get(k)){ch->cells.erase(rid);ch->dirty=true;if(rebuild)buildRockChunk(k);}return true;}
void Zone::rebuildDirtyRockChunks(){for(auto& [k,ch]:rockChunks)if(ch.dirty)buildRockChunk(k);}
// Which rock cell a ray hit: step just inside the surface along the incoming direction and snap to the grid.
std::string Zone::rockAtHit(V2 point,V2 dir)const{if(!hasGrid)return "";for(double depth:{.2,1.0,2.0}){const double x=grid.minX+jsRound((point.x+dir.x*depth-grid.minX)/grid.cell)*grid.cell,y=grid.minY+jsRound((point.y+dir.y*depth-grid.minY)/grid.cell)*grid.cell;
  const std::string q=keyd(x,y);if(rocks.has(q))return q;}return "";}
bool Zone::zoneSolid(double x,double y)const{const double ix=jsRound((x-grid.minX)/grid.cell),iy=jsRound((y-grid.minY)/grid.cell);
 return ix<0||iy<0||ix>=grid.width||iy>=grid.height||grid.solid[(size_t)(iy*grid.width+ix)];}

// ---- Portals --------------------------------------------------------------------------------------------------------
// Safe zones use the fixed list in era.js. Combat-zone portals follow the cave seed: the first destination sits on the
// entry cavern; the rest go in roomy caverns, spread as far apart as possible. The open spot farthest from them is kept
// for the mission portal (Sparrow I, while a mission runs).
std::vector<Portal> Zone::zonePortals(){
 auto missionPortals=[&](bool spot,V2 at){std::vector<Portal> out;if(mission&&!mission->active.empty()&&id==data().raw.at("MISSION_PORTAL_ZONE").get<std::string>()&&spot)out.push_back({mission->active,at.x,at.y,true});return out;};
 if(def->contains("portals")&&(*def)["portals"].is_array()){std::vector<Portal> out;for(auto& p:(*def)["portals"])out.push_back({val(p,"to",""),num(p,"x"),num(p,"y"),false});for(auto& p:missionPortals(false,{}))out.push_back(p);return out;}
 if(!portalsMade){portalsMade=true;const ZoneGrid& g=grid;std::vector<V2> roomy;const J& pit=g.extra.contains("pit")?g.extra["pit"]:J();
  for(int y=3;y<g.height-3;y++)for(int x=4;x<g.width-4;x++){if(pit.is_object()&&(y<pit["hall"]["y0"].get<double>()+2||y>pit["hall"]["y1"].get<double>()-2))continue;bool ok=true;
   for(int dy=-1;dy<=1&&ok;dy++)for(int dx=-2;dx<=2;dx++)if(!g.centers[(size_t)((y+dy)*g.width+x+dx)]){ok=false;break;}if(ok)roomy.push_back({g.minX+x*g.cell,g.minY+y*g.cell});}
  const J& to=(*def)["portalsTo"];const J& entry=g.extra.contains("entry")?g.extra["entry"]:J();
  auto orZero=[](double v){return v==0||std::isnan(v)?0.0:v;};
  portalList.push_back({to[0].get<std::string>(),orZero(num(entry,"x")),orZero(num(entry,"y")),false});
  auto nearest=[&](V2 p){double d=INFINITY;for(auto& q:portalList)d=std::min(d,jsmath::hypot(p.x-q.x,p.y-q.y));return d;};
  for(size_t k=1;k<to.size();k++){const V2* best=nullptr;double score=-1;for(auto& p:roomy){const double d=nearest(p);if(d>score){score=d;best=&p;}}V2 b=best?*best:V2(0,0);portalList.push_back({to[k].get<std::string>(),b.x,b.y,false});}
  double ms=-1;for(auto& p:roomy){const double d=nearest(p);if(d>ms){ms=d;missionSpot=p;hasMissionSpot=true;}}}
 std::vector<Portal> out=portalList;for(auto& p:missionPortals(hasMissionSpot,missionSpot))out.push_back(p);return out;}
bool Zone::nearestPortal(V2 p,Portal& out,double& distance){bool found=false;
 for(auto& q:zonePortals()){const double d=jsmath::hypot(q.x-p.x,q.y-p.y);if(!found||d<distance){out=q;distance=d;found=true;}}return found;}

// ---- Arrivals -------------------------------------------------------------------------------------------------------
bool Zone::shipOverlapsRock(V2 p,const ShipExt& e)const{for(auto& [k,r]:rocks)if(r.x+2>p.x+e.l&&r.x-2<p.x+e.r&&r.y+2>p.y+e.t&&r.y-2<p.y+e.b)return true;return false;}
// Other ships already in this zone, as world-space boxes, so arrivals avoid them.
bool Zone::shipClashes(V2 p,const ShipExt& e,const std::vector<OtherShip>& others)const{for(auto& o:others)if(p.x+e.l-2<o.x+o.ext.r&&p.x+e.r+2>o.x+o.ext.l&&p.y+e.t-2<o.y+o.ext.b&&p.y+e.b+2>o.y+o.ext.t)return true;return false;}
// 2019 Help page: a portal drops you "at a random position in the linked zone". Cavern centres are guaranteed ship
// clearance by the generator; keep clear of the arrival portal so Q does not bounce you back.
bool Zone::randomArrival(const ShipExt& e,const std::vector<OtherShip>& others,V2& out){if(!hasGrid)return false;const std::vector<Portal> portals=zonePortals();const double R=data().raw.at("PORTAL_RANGE").get<double>();
 std::vector<int> open;for(size_t i=0;i<grid.centers.size();i++)if(grid.centers[i])open.push_back((int)i);
 for(int n=0;n<80&&!open.empty();n++){const size_t at=(size_t)std::floor(random()*open.size());const int i=open[at];open.erase(open.begin()+at);
  const V2 p{grid.minX+i%grid.width*grid.cell,grid.minY+std::floor((double)i/grid.width)*grid.cell};
  bool nearPortal=false;for(auto& q:portals)if(jsmath::hypot(q.x-p.x,q.y-p.y)<R+6){nearPortal=true;break;}if(nearPortal)continue;
  if(!shipOverlapsRock(p,e)&&!shipClashes(p,e,others)){out=p;return true;}}return false;}
// A square harbour with cut corners; four I-shaped docks in a 2×2 grid (a top bar and a bottom bar joined by a stem);
// the outer walls are docks too. Every dock piece is a rectangle; a ship berths against whichever face it touched.
FreeportLayout Zone::freeportLayout()const{const Half H=zoneHalf(id);const double w=H.w,h=H.h,C=data().raw.at("FREEPORT_CUT").get<double>();const J& D=data().raw.at("FREEPORT_DOCK");
 const double dcx=D["cx"],dcy=D["cy"],hw=D["halfW"],hh=D["halfH"],t=D["t"];FreeportLayout L;L.w=w;L.h=h;
 for(int sx:{-1,1})for(int sy:{-1,1}){const double cx=sx*dcx,cy=sy*dcy;L.docks.push_back({cx-hw,cy-hh-t,cx+hw,cy-hh,"bar"});L.docks.push_back({cx-hw,cy+hh,cx+hw,cy+hh+t,"bar"});L.docks.push_back({cx-t/2,cy-hh,cx+t/2,cy+hh,"stem"});}
 L.walls={{-w+C,-h-2,w-C,-h,"wall"},{-w+C,h,w-C,h+2,"wall"},{-w-2,-h+C,-w,h-C,"wall"},{w,-h+C,w+2,h-C,"wall"}};
 L.corners={{{-w,-h+C},{-w+C,-h}},{{w-C,-h},{w,-h+C}},{{w,h-C},{w-C,h}},{{-w+C,h},{-w,h-C}}};return L;}
bool Zone::insideFreeport(double x,double y,double m)const{const Half H=zoneHalf(id);const double C=data().raw.at("FREEPORT_CUT").get<double>();
 return std::fabs(x)<=H.w-m&&std::fabs(y)<=H.h-m&&std::fabs(x)+std::fabs(y)<=H.w+H.h-C-m*1.42;}
static bool corners(V2 p,const ShipExt& e,const std::function<bool(double,double)>& f){const double c[4][2]={{e.l,e.t},{e.r,e.t},{e.l,e.b},{e.r,e.b}};for(auto& q:c)if(!f(p.x+q[0],p.y+q[1]))return false;return true;}
// Is the ship (at p) wholly inside the harbour and clear of every dock piece?
bool Zone::freeportBerthOK(V2 p,const ShipExt& e)const{const FreeportLayout L=freeportLayout();if(!corners(p,e,[&](double x,double y){return insideFreeport(x,y,-.1);}))return false;
 for(auto& d:L.docks)if(p.x+e.l+.05<d.x1&&p.x+e.r-.05>d.x0&&p.y+e.t+.05<d.y1&&p.y+e.b-.05>d.y0)return false;return true;}
// Where this hull can sit in a Freeport: inside the harbour, clear of the piers and away from the portal.
bool Zone::freeportFits(V2 p,const ShipExt& e){const FreeportLayout L=freeportLayout();if(!corners(p,e,[&](double x,double y){return insideFreeport(x,y,3);}))return false;
 for(auto& d:L.docks)if(p.x+e.l-2<d.x1&&p.x+e.r+2>d.x0&&p.y+e.t-2<d.y1&&p.y+e.b+2>d.y0)return false;const double R=data().raw.at("PORTAL_RANGE").get<double>();
 for(auto& q:zonePortals())if(jsmath::hypot(q.x-p.x,q.y-p.y)<R+4||(p.x+e.l-4<q.x&&p.x+e.r+4>q.x&&p.y+e.t-4<q.y&&p.y+e.b+4>q.y))return false;return true;}
// A ship spawning in a Freeport appears at a random free spot in the harbour, floating — never docked. Falls back to
// the nearest free spot to the middle.
V2 Zone::randomBerth(const ShipExt& e,const std::vector<OtherShip>& others){const Half H=zoneHalf(id);
 for(int n=0;n<400;n++){const double x=jsRound(-H.w+random()*2*H.w),y=jsRound(-H.h+random()*2*H.h);const V2 p{x,y};if(freeportFits(p,e)&&!shipClashes(p,e,others))return p;}return safeArrival(e,others);}
// Safe zones: spread arriving ships along the dock instead of stacking them on one spot (searching outward from the
// middle, row by row).
V2 Zone::safeArrival(const ShipExt& e,const std::vector<OtherShip>& others){const double stepX=std::max(8.0,std::ceil((e.r-e.l)/2)),stepY=std::max(8.0,std::ceil((e.b-e.t)/2));
 std::vector<double> rows{0};for(int k=1;k<40;k++){rows.push_back(-k*stepY);rows.push_back(k*stepY);}
 for(double y:rows)for(int k=0;k<60;k++){const V2 p{(k%2?1:-1)*std::ceil(k/2.0)*stepX,y};if(!freeportFits(p,e))continue;if(!shipClashes(p,e,others))return p;}return {0,0};}

// ---- Contents -------------------------------------------------------------------------------------------------------
WorldLoot& Zone::addWorldLoot(const std::string& type,V2 p,int count,V2 velocity){b2BodyDef d;d.type=b2_dynamicBody;d.position=bv(p);d.linearDamping=.05f;d.angularDamping=.25f;d.bullet=true;
 b2Body* body=world->w.CreateBody(&d);boxFixture(body,2,2,{0,0},.35f,.7f,.35f);body->SetLinearVelocity(bv(velocity));
 auto l=std::make_unique<WorldLoot>();l->type=type;l->count=std::min(count,stackLimit(type));l->body=body;WorldLoot& out=*l;worldLoot.push_back(std::move(l));
 if(count>stackLimit(type))addWorldLoot(type,{p.x+4.1,p.y},count-stackLimit(type),velocity);return out;}
// r: a round boulder of that radius (the Pits' shaft); without it, a square stone block (wall pockets).
Boulder& Zone::addBoulder(const std::string& bid,V2 p,double a,double r){b2BodyDef d;d.type=b2_dynamicBody;d.position=bv(p);d.angle=(float)a;d.linearDamping=r?.8f:2.5f;d.angularDamping=r?1.f:3.f;
 b2Body* body=world->w.CreateBody(&d);if(r){b2CircleShape s;s.m_radius=(float)r;b2FixtureDef fd;fd.shape=&s;fd.density=.9f;fd.friction=.5f;fd.restitution=.05f;body->CreateFixture(&fd);}
 else boxFixture(body,1.8,1.8,{0,0},.6f,6,.05f);Boulder b;b.id=bid;b.body=body;b.r=r;boulders.push_back(b);return boulders.back();}
static double fixed2(double v){return jsFixed(v,2);}
// Boulders at rest don't change: a snapshot carries only the moving ones (with their velocity), and every boulder once
// a second (all=true) for anyone who just arrived.
J Zone::boulderState(bool all){J out=J::array();for(auto& b:boulders){const bool awake=b.body->IsAwake();if(!all&&!awake&&b.sentRest)continue;b.sentRest=!awake;const V2 p=vv(b.body->GetPosition()),v=vv(b.body->GetLinearVelocity());
  J o={{"id",b.id}};if(b.r)o["r"]=b.r;o["x"]=fixed2(p.x);o["y"]=fixed2(p.y);o["a"]=fixed2(b.body->GetAngle());if(awake){o["vx"]=fixed2(v.x);o["vy"]=fixed2(v.y);o["w"]=fixed2(b.body->GetAngularVelocity());}out.push_back(o);}return out;}
std::vector<Zone::Exposed> Zone::exposedRocks(){std::vector<Exposed> out;const double c=grid.cell;
 for(auto& [k,r]:rocks){const int dirs[4][2]={{1,0},{-1,0},{0,1},{0,-1}};for(auto& d:dirs){const double x=r.x+d[0]*c,y=r.y+d[1]*c;if(!rocks.has(keyd(x,y))&&!zoneSolid(x,y)){out.push_back({&r,{x,y},d[0],d[1]});break;}}}return out;}

// ---- Building the zone (setupZone's zone side) ----------------------------------------------------------------------
void Zone::setup(){world=std::make_unique<World>(V2(0,20));{b2BodyDef d;dockBody=world->w.CreateBody(&d);edge=world->w.CreateBody(&d);}const Half H=zoneHalf(id);const double w=H.w,h=H.h;
 // Freeports: the harbour (freeportLayout) — its docks and walls are dock pieces, its cut corners plain wall.
 if(val(*def,"kind","")=="safe"){const FreeportLayout L=freeportLayout();std::vector<DockRect> all=L.docks;all.insert(all.end(),L.walls.begin(),L.walls.end());
  for(auto& r:all)boxFixture(dockBody,(r.x1-r.x0)/2,(r.y1-r.y0)/2,{(r.x0+r.x1)/2,(r.y0+r.y1)/2});
  for(auto& [a,b]:L.corners){auto sign=[](double v){return (double)((v>0)-(v<0));};const double nx=sign(a.x+b.x),ny=sign(a.y+b.y),ox=nx*1.42,oy=ny*1.42;
   const b2Vec2 vs[4]={bv(a),bv(b),bv({b.x+ox,b.y+oy}),bv({a.x+ox,a.y+oy})};b2PolygonShape s;s.Set(vs,4);b2FixtureDef fd;fd.shape=&s;edge->CreateFixture(&fd);}}
 else{const double e[4][4]={{0,h,w,1},{0,-h,w,1},{-w,0,1,h},{w,0,1,h}};for(auto& q:e)boxFixture(edge,q[2],q[3],{q[0],q[1]});}
 if(val(*def,"kind","")!="safe"&&hasGrid){const J& G=gen();const ZoneGrid& g=grid;const double s=seed+std::fmod(num(G,"salt"),9973.0),oreCut=1-val(G,"oreChance",NAN),maxX=g.minX+(g.width-1)*g.cell,maxY=g.minY+(g.height-1)*g.cell;
  static const char* kindNames[6]={"","hazard","rock","ore","flux","iron"};const bool canary=val(*def,"tiles","")=="canary";
  for(double x=g.minX;x<=maxX;x+=g.cell)for(double y=g.minY;y<=maxY;y+=g.cell){if(!zoneSolid(x,y))continue;const double hash=terrainHash(x+s*17,y-s*29);const bool inMine=finchNoise(x/36+s*11,y/36-s*7)>.57;
   std::string pitKind;if(!g.kinds.empty()){const uint8_t k=g.kinds[(size_t)(jsRound((y-g.minY)/g.cell)*g.width+jsRound((x-g.minX)/g.cell))];pitKind=k<6?kindNames[k]:"";}
   const bool ore=!pitKind.empty()?pitKind=="ore":inMine&&hash>oreCut;
   const std::string kind=!pitKind.empty()?pitKind:!ore?"rock":canary?(terrainHash(x-s*5,y+s*3)<val(G,"flux",0.0)?"flux":"iron"):"ore";
   const std::string rid=keyd(x,y);if(mined.count(rid))continue;const double hp=tileHp(kind);Rock r;r.id=rid;r.x=x;r.y=y;r.chunk=rockChunkOf(x,y);r.kind=kind;r.ore=kind=="ore";r.hp=r.maxhp=hp;rocks.set(rid,r);
   RockChunk* ch=rockChunks.get(r.chunk);if(!ch)ch=&rockChunks.set(r.chunk,RockChunk());ch->dirty=true;ch->cells.insert(rid);}
  decorateZone();rebuildDirtyRockChunks();st.erase("treasure");refreshTreasure();}
 if(st.contains("loot"))for(auto& i:st["loot"]){if(!i.is_object())continue;WorldLoot& l=addWorldLoot(val(i,"type",""),{num(i,"x"),num(i,"y")},val(i,"count",1),{num(i,"vx"),num(i,"vy")});
  l.body->SetTransform(l.body->GetPosition(),(float)num(i,"angle"));l.body->SetAngularVelocity((float)num(i,"spin"));l.grace=num(i,"grace");}}
// Zone extras chosen from the seed, so every ship (and the zone server) agrees on them:
//   Canary seekers — rock tiles that are really dormant seeker bots (they wake when shot).
//   The Pits — boulders of many sizes packed into the three holes; wall pockets (flux and turret ore sealed by a loose
//   stone block) where a zone asks for them.
void Zone::decorateZone(){boulders.clear();if(!hasGrid)return;const J& G=gen();const ZoneGrid& g=grid;
 auto savedBoulder=[&](const std::string& bid)->const J*{if(!st.contains("boulders"))return nullptr;for(auto& b:st["boulders"])if(b.is_object()&&val(b,"id","")==bid)return &b;return nullptr;};
 auto pick=[&](std::vector<Exposed> list,size_t n,double salt){std::vector<std::pair<Exposed,double>> h;for(auto& e:list)h.push_back({e,terrainHash(e.r->x*3+salt+seed,e.r->y*5-salt)});
  std::stable_sort(h.begin(),h.end(),[](const auto& a,const auto& b){return a.second<b.second;});std::vector<Exposed> out;for(size_t i=0;i<h.size()&&i<n;i++)out.push_back(h[i].first);return out;};
 const J& pit=g.extra.contains("pit")?g.extra["pit"]:J();
 if(pit.is_object()){double rMin=3.5,rMax=9.5;if(G.contains("boulderRadius")&&G["boulderRadius"].is_array()){rMin=G["boulderRadius"][0];rMax=G["boulderRadius"][1];}
  struct P{double x,y,r;};std::vector<P> placed;const J& holes=pit["holes"];const double c=g.cell,y0=g.minY+holes["top"].get<double>()*c,y1=g.minY+pit["room"]["y1"].get<double>()*c;
  // exact: no wall tile (a cell×cell square) may come within the circle
  auto freeAt=[&](double x,double y,double r){const double hc=c/2,m=r+.15;for(double gx=std::floor((x-m)/c)*c;gx<=x+m+c;gx+=c)for(double gy=std::floor((y-m)/c)*c;gy<=y+m+c;gy+=c){const double cx=jsRound(gx/c)*c,cy=jsRound(gy/c)*c;
    if(!zoneSolid(cx,cy))continue;const double dx=std::max(std::fabs(x-cx)-hc,0.0),dy=std::max(std::fabs(y-cy)-hc,0.0);if(dx*dx+dy*dy<m*m)return false;}
   for(auto& b:placed)if(jsmath::hypot(b.x-x,b.y-y)<b.r+r+.2)return false;return true;};
  int n=0;auto put=[&](double x,double y,double r){placed.push_back({x,y,r});const std::string bid="p"+std::to_string(n++);const J* sv=savedBoulder(bid);addBoulder(bid,sv?V2(num(*sv,"x"),num(*sv,"y")):V2(x,y),sv?num(*sv,"a"):0,r);};
  // First a column of boulders of random size up the middle of each hole (from its loot room to the hall)…
  const J& list=holes.contains("list")?holes["list"]:J::array();
  for(size_t k=0;k<list.size();k++){const J& h=list[k];const double bottomX=h["bottomX"],topX=h["topX"],Hb=holes["bottom"],Ht=holes["top"];
   auto at=[&](double y){const double gy=(y-g.minY)/c,t=std::max(0.0,std::min(1.0,(Hb-gy)/(Hb-Ht)));return g.minX+(bottomX+(topX-bottomX)*t)*c;};
   int i=0;for(double top=y1+c/2;top>y0&&n<70;i++){const double want=rMin+(rMax-rMin)*terrainHash(k*31+i*7.3+seed,i*3.1-seed);bool done=false;
    for(double r=want;r>=rMin&&!done;r-=.25){const double y=top-r-.1,x=at(y);if(freeAt(x,y,r)){put(x,y,r);top=y-r;done=true;}}if(!done)top-=1;}}
  // …then smaller ones in the gaps left beside them.
  for(double y=y1;y>=y0&&n<70;y-=2)for(double x=g.minX;x<=g.minX+(g.width-1)*c&&n<70;x+=2){if(!freeAt(x,y,rMin))continue;double fit=rMin;
   for(double r=std::min(rMax,rMin*1.6);r>rMin;r-=.5)if(freeAt(x,y,r)){fit=r;break;}put(x,y,rMin+(fit-rMin)*terrainHash(x*1.7+seed,y*2.3-seed));}}
 // Canary's square: dormant seekers are buried all through the rock, chosen per tile from the seed.
 if(num(G,"seekerChance")){const double chance=num(G,"seekerChance");for(auto& [k,r]:rocks)if((r.kind=="rock"||r.kind=="iron")&&terrainHash(r.x*3.7+seed,r.y*5.3-seed*2)<chance){r.kind="seeker";r.ore=false;r.hp=r.maxhp=1;}}
 if(num(G,"seekers")){for(auto& e:pick(exposedRocks(),(size_t)num(G,"seekers"),71)){e.r->kind="seeker";e.r->ore=false;e.r->hp=e.r->maxhp=1;}}
 if(num(G,"pockets")){const std::vector<Portal> portals=zonePortals();std::vector<Exposed> spots;
  for(auto& e:exposedRocks()){if(!(jsmath::hypot(e.open.x,e.open.y)>30))continue;bool near=false;for(auto& q:portals)if(jsmath::hypot(q.x-e.open.x,q.y-e.open.y)<30){near=true;break;}if(!near)spots.push_back(e);}
  int n=0;for(auto& e:pick(spots,(size_t)num(G,"pockets"),131)){Rock& r=*e.r;r.kind=n%2?"ore":"flux";r.ore=r.kind=="ore";r.hp=r.maxhp=tileHp(r.kind);const std::string bid="b"+std::to_string(n);const J* sv=savedBoulder(bid);n++;
   if(sv&&val(*sv,"gone",false))continue;addBoulder(bid,sv?V2(num(*sv,"x"),num(*sv,"y")):e.open,sv?num(*sv,"a"):0,0);}}}

// ---- Treasure (missions.js) -----------------------------------------------------------------------------------------
// The Pits (ℵ25): "a new treasure block will spawn every 5 minutes". Which rock cells hold treasure is decided by the
// seed alone (cells ranked by a hash): the first gen.treasure + (minutes elapsed / 5) ranks are treasure.
const std::vector<std::string>& Zone::treasureRanks(){if(ranksMade)return ranks;ranksMade=true;const ZoneGrid& g=grid;struct C{std::string id;double x,h;};std::vector<C> list;
 for(size_t i=0;i<g.solid.size();i++)if(g.solid[i]&&(g.kinds.empty()||g.kinds[i]==2)){const double x=g.minX+(double)(i%g.width)*g.cell,y=g.minY+std::floor((double)i/g.width)*g.cell;list.push_back({keyd(x,y),x,terrainHash(x*7+seed,y*13-seed)});}
 std::stable_sort(list.begin(),list.end(),[](const C& a,const C& b){return a.h<b.h;});
 // The Pits: deal treasure out to the three holes in turn, so every hole's loot room gets its share.
 if(g.extra.contains("pit")&&g.extra["pit"].contains("rooms")){std::vector<std::vector<C>> per;for(auto& r:g.extra["pit"]["rooms"]){std::vector<C> p;const double x0=r["x0"],x1=r["x1"];
   for(auto& c:list){const double gx=jsRound((c.x-g.minX)/g.cell);if(gx>=x0&&gx<=x1)p.push_back(c);}per.push_back(p);}
  std::vector<C> mixed;for(size_t i=0;;i++){bool any=false;for(auto& p:per)if(i<p.size())any=true;if(!any)break;for(auto& p:per)if(i<p.size())mixed.push_back(p[i]);}list=mixed;}
 for(auto& c:list)ranks.push_back(c.id);return ranks;}
int Zone::treasureTarget()const{const double t=num(gen(),"treasure");if(!t)return 0;const double every=data().raw.at("MISSIONS").at("treasureEverySeconds").get<double>();
 return (int)(t+(mission&&mission->active==id?std::floor(mission->elapsed/every):0));}
void Zone::refreshTreasure(){if(!combat()||!num(gen(),"treasure"))return;const int want=treasureTarget();if(val(st,"treasure",0)==want)return;
 st["treasure"]=want;const auto& R=treasureRanks();for(size_t i=0;i<std::min((size_t)want,R.size());i++){Rock* r=rocks.get(R[i]);if(r&&r->kind!="treasure"){r->kind="treasure";r->ore=false;r->hp=r->maxhp=tileHp("treasure");}}}
}
