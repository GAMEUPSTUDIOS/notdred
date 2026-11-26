// Hull attachments and physics machines: the mount and machine helpers of dist/game.js, spawn points from
// dist/modules/machinery.js, ported one for one.
#include "ship.h"
namespace nd {
static void sizeOf(const std::string& type,int& w,int& h){const J& m=data().raw.at("MACHINE_SIZE");auto it=m.find(type);if(it!=m.end()){w=(*it)[0];h=(*it)[1];}else{w=1;h=1;}}
// ---- Mounts --------------------------------------------------------------------------------------------------------
std::string Ship::mountItem(const Mount& m){return m.starterRC?"starter_rc":m.kind=="burst"?"turret_burst":m.kind=="auto"?"turret_auto":m.type;}
V2 Ship::mountPoint(const Mount& m,const Bounds* bp)const{const Bounds& b=bp?*bp:bounds;const double off=(mountWidth(m)-1)/2.0;
 if(m.side=="top")return {m.at+off,(double)b.t};if(m.side=="bottom")return {m.at+off,(double)b.b};if(m.side=="left")return {(double)b.l,m.at+off};return {(double)b.r,m.at+off};}
V2 Ship::inward(const Mount& m){if(m.side=="top")return {0,1};if(m.side=="bottom")return {0,-1};if(m.side=="left")return {1,0};return {-1,0};}
const Mount* Ship::mountHit(V2 c)const{for(auto& m:mounts){V2 p=mountPoint(m);const double half=mountWidth(m)/2.0;const bool h=m.side=="top"||m.side=="bottom";
  if(std::fabs(c.x-p.x)<=(h?half:.85)&&std::fabs(c.y-p.y)<=(h?.85:half))return &m;}return nullptr;}
bool Ship::mountAt(V2 c,const std::string& type,Mount& out)const{const Bounds& b=bounds;std::string side=std::fabs(c.y-b.t)<.6?"top":std::fabs(c.y-b.b)<.6?"bottom":std::fabs(c.x-b.l)<.6?"left":std::fabs(c.x-b.r)<.6?"right":"";
 if(side.empty())return false;Mount m;m.type=(type=="starter_rc"||type=="turret_burst"||type=="turret_auto")?"turret":type;m.starterRC=type=="starter_rc";if(type=="turret_burst")m.kind="burst";else if(type=="turret_auto")m.kind="auto";
 m.side=side;m.at=(int)jsRound(side=="top"||side=="bottom"?c.x:c.y);m.active=false;out=m;return true;}
bool Ship::mountValid(const Mount& m,const Bounds* bp,const Mount* ignore)const{const Bounds& b=bp?*bp:bounds;
 if(m.type=="starter"&&m.side=="bottom"&&(m.at==b.l||m.at==b.r)){for(auto& o:mounts)if(&o!=ignore&&o.side==m.side&&o.at==m.at)return false;return true;}
 const bool h=m.side=="top"||m.side=="bottom";const int lo=h?b.l:b.t,hi=h?b.r:b.b,n=mountWidth(m);if(m.at<=lo||m.at+n-1>=hi)return false;
 for(auto& o:mounts)if(&o!=ignore&&o.side==m.side&&m.at<o.at+mountWidth(o)&&o.at<m.at+n)return false;return true;}
// ---- Physics machines ------------------------------------------------------------------------------------------
Tile& Ship::spawnMachine(const std::string& type,V2 p,const J& fields,const std::string& givenId){int w,h;sizeOf(type,w,h);
 std::string id=givenId.empty()?"m"+std::to_string(++machineSeq)+"-"+std::to_string((int)std::floor(random()*1e6)):givenId;
 Tile t;t.type=type;t.x=p.x-(w-1)/2.0;t.y=p.y-(h-1)/2.0;t.rotation=0;t.id=id;
 if(type=="fabricator"){t.extra["materials"]={{"iron",0},{"explosives",0}};t.extra["queue"]=J::array();t.extra["job"]=nullptr;t.extra["repeat"]=false;}
 if(fields.is_object())for(auto& [k,v]:fields.items()){if(k=="hp"&&v.is_number()){t.hp=v.get<double>();t.hpSet=true;}else if(k=="rotation"&&v.is_number())t.rotation=(int)v.get<double>();else if(k=="access"&&v.is_string())t.access=v.get<std::string>();else t.extra[k]=v;}
 b2BodyDef d;d.position=bv(p);t.body=inside->w.CreateBody(&d);t.mpos=p;return terrain.set(id,t);}
void Ship::syncMachines(){for(auto& [k,t]:terrain)if(t.body){int w,h;sizeOf(t.type,w,h);V2 p=t.mpos;t.x=p.x-(w-1)/2.0;t.y=p.y-(h-1)/2.0;}}
static bool among(const std::string& t,std::initializer_list<const char*> l){for(const char* s:l)if(t==s)return true;return false;}
bool Ship::machineSpace(const std::string& type,V2 p,const Crew* standing)const{int w,h;sizeOf(type,w,h);const double hw=w/2.0,hh=h/2.0;
 if(p.x-hw<bounds.l+.5||p.x+hw>bounds.r-.5||p.y-hh<bounds.t+.5||p.y+hh>bounds.b-.5)return false;
 for(int x=(int)jsRound(p.x-hw+.5);x<=(int)jsRound(p.x+hw-.5);x++)for(int y=(int)jsRound(p.y-hh+.5);y<=(int)jsRound(p.y+hh-.5);y++){if(blocks.has(key(x,y)))return false;const Tile* t=terrainAt(x,y);if(t&&!among(t->type,{"ladder","walkway","net","sign"}))return false;}
 for(auto [cx,cy]:helmCells())if(std::fabs(cx-p.x)<hw+.5&&std::fabs(cy-p.y)<hh+.5)return false;
 if(standing){V2 q=vv(standing->body->GetPosition());if(std::fabs(q.x-p.x)<hw+.24&&std::fabs(q.y-p.y)<hh+.63)return false;}
 for(auto& b:boxes){V2 q=vv(b->body->GetPosition());if(std::fabs(q.x-p.x)<(b->size/2+hw)&&std::fabs(q.y-p.y)<(b->size/2+hh))return false;}
 for(auto& [k,t]:terrain)if(t.body){int w2,h2;sizeOf(t.type,w2,h2);V2 q=t.mpos;if(std::fabs(q.x-p.x)<(w2+w)/2.0&&std::fabs(q.y-p.y)<(h2+h)/2.0)return false;}
 return true;}
bool Ship::supportsMachine(int x,int y)const{if(blocks.has(key(x,y)))return true;const Tile* t=terrainAt(x,y);return t&&(t->type=="walkway"||t->type=="glass");}
bool Ship::fabFits(int x,int y,bool checkSupport,const std::string& type)const{int w=2,h=3;{const J& m=data().raw.at("MACHINE_SIZE");auto it=m.find(type);if(it!=m.end()){w=(*it)[0];h=(*it)[1];}}
 Tile probe;probe.type=type;probe.x=x;probe.y=y;auto hc=helmCells();
 for(auto [cx,cy]:terrainCells(probe)){if(!interiorCell(cx,cy)||blocks.has(key(cx,cy))||terrainAt(cx,cy))return false;for(auto [hx,hy]:hc)if(hx==cx&&hy==cy)return false;}
 if(!checkSupport||y+h-1==bounds.b-1)return true;for(int i=0;i<w;i++)if(!supportsMachine(x+i,y+h))return false;return true;}
static bool standingMachine(const std::string& t){for(auto& s:data().raw.at("STANDING_MACHINES"))if(s==t)return true;return false;}
const Tile* Ship::machineOnTop(int x,int y)const{for(auto& [k,f]:terrain)if(f.body){int w,h;sizeOf(f.type,w,h);V2 p=f.mpos;if(std::fabs(y-.5-(p.y+h/2.0))<.08&&x+.5>p.x-w/2.0+.01&&x-.5<p.x+w/2.0-.01)return &f;}
 for(auto& [k,f]:terrain)if(!f.body&&standingMachine(f.type)){int w,h;sizeOf(f.type,w,h);if(x>=f.x&&x<f.x+w&&y==f.y+h)return &f;}return nullptr;}
// A random spawn point set exactly to this rank (ℵ14), else none (the helm).
const Tile* Ship::spawnPointFor(const std::string& rank){std::vector<const Tile*> list;for(auto& [k,t]:terrain)if(t.type=="spawn"&&(t.access.empty()?"crew":t.access)==rank)list.push_back(&t);
 if(list.empty())return nullptr;return list[(size_t)std::floor(random()*list.size())];}
}
