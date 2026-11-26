// Hands, loose items, expando boxes and the cargo safeguards: dist/modules/cargo.js, dist/modules/safeguards.js and
// the inventory helpers of dist/game.js, ported one for one.
#include "ship.h"
namespace nd {
static const char* SINGLE[]={"wrench","fabricator","thruster","turret","turret_burst","turret_auto","turret_controller","starter_rc","starter","storage","shredder","shredder_gold","pusher","repair","pusher_block","fab_starter","fab_machine","fab_engineering","fab_munitions","loader","recycler","anchor","comms","spawn"};
int stackLimit(const std::string& type){for(const char* s:SINGLE)if(type==s)return 1;return 16;}
static bool isType(const std::string& t){const auto& ty=data().types;return std::find(ty.begin(),ty.end(),t)!=ty.end();}
static int total(const J& m){int n=0;for(auto& [k,v]:m.items())if(v.is_number())n+=v.get<int>();return n;}
double Ship::random(){seed^=seed<<13;seed^=seed>>7;seed^=seed<<17;return (seed>>11)*(1.0/9007199254740992.0);}
// ---- Notices (room-runtime notify): to whoever acted, else to everyone aboard ------------------------------------
static void notify(Crew& c,const std::string& text){std::u16string u=toU16(text);if(u.size()>240)u.resize(240);std::string t=fromU16(u);if(c.notices.empty()||c.notices.back()!=t)c.notices.push_back(t);if(c.notices.size()>8)c.notices.erase(c.notices.begin());}
void Ship::toast(const std::string& text){if(actor)notify(*actor,text);else for(auto& [id,c]:crew)notify(c,text);}
void Ship::toastAll(const std::string& text){for(auto& [id,c]:crew)notify(c,text);}
// ---- Hands -------------------------------------------------------------------------------------------------------
int Ship::carried(const Crew& c,const std::string& type)const{int n=0;for(int i=0;i<5;i++)if(c.slots[i]==type)n+=c.counts[i];return n;}
static std::vector<int> handOrder(const Crew& c){std::vector<int> o{c.selected};for(int i=0;i<5;i++)if(i!=c.selected)o.push_back(i);return o;}
void Ship::selectSlot(Crew& c,int n){c.selected=n;c.tool=c.slots[n]=="wrench"?"walk":c.slots[n].empty()?"empty":c.slots[n];}
int Ship::addCarried(Crew& c,const std::string& type,int count){int left=count;auto order=handOrder(c);std::vector<int> pick;for(int i:order)if(c.slots[i]==type)pick.push_back(i);for(int i:order)if(c.slots[i].empty())pick.push_back(i);
 for(int i:pick){int n=std::min(left,stackLimit(type)-c.counts[i]);if(n>0){c.slots[i]=type;c.counts[i]+=n;left-=n;}if(!left)break;}selectSlot(c,c.selected);return count-left;}
void Ship::takeItem(Crew& c,const std::string& type,int count){for(int i:handOrder(c))if(c.slots[i]==type){int n=std::min(count,c.counts[i]);c.counts[i]-=n;count-=n;if(!c.counts[i])c.slots[i].clear();if(!count)break;}selectSlot(c,c.selected);}
int Ship::giveItem(Crew& c,const std::string& type,int count){int added=addCarried(c,type,count);if(count>added)scatter(type,count-added,vv(c.body->GetPosition()));return added;}
void Ship::moveStack(Crew& c,int from,int to,bool split){if(from==to||c.slots[from].empty())return;const std::string t=c.slots[from];int n=split?(c.counts[from]+1)/2:c.counts[from];
 if(c.slots[to].empty()||c.slots[to]==t){int moved=std::min(n,stackLimit(t)-c.counts[to]);c.slots[to]=t;c.counts[to]+=moved;c.counts[from]-=moved;if(!c.counts[from])c.slots[from].clear();}
 else if(!split){std::swap(c.slots[from],c.slots[to]);std::swap(c.counts[from],c.counts[to]);}selectSlot(c,to);}
void Ship::refund(Crew& c,const std::string& type,const V2* p){int added=addCarried(c,type,1);if(!added&&p)scatter(type,1,{p->x,p->y+.4});else if(!added)scatter(type,1,vv(c.body->GetPosition()));}
// ---- Loose items -------------------------------------------------------------------------------------------------
Item& Ship::spawnItem(const std::string& type,V2 p,V2 velocity,int count){b2BodyDef d;d.type=b2_dynamicBody;d.position=bv(p);d.bullet=true;d.angularDamping=3;b2Body* b=inside.w.CreateBody(&d);
 b2PolygonShape s;s.SetAsBox(.32f,.32f);b2FixtureDef fd;fd.shape=&s;fd.density=3;fd.friction=.8f;fd.restitution=.08f;fd.filter.categoryBits=8;fd.filter.maskBits=1|2|8|16|256|512;b->CreateFixture(&fd);b->SetLinearVelocity(bv(velocity));
 auto it=std::make_unique<Item>();it->type=type;it->body=b;it->count=std::min(stackLimit(type),count);items.push_back(std::move(it));return *items.back();}
void Ship::scatter(const std::string& type,int count,V2 p,J intakeFrom){while(count>0){int n=std::min(stackLimit(type),count);double x=clamp(p.x+((int)(items.size()%5)-2)*.3,bounds.l+.9,bounds.r-.9);
  spawnItem(type,{x,clamp(p.y-.4,bounds.t+.9,bounds.b-.9)},{0,0},n).intakeFrom=intakeFrom;count-=n;}}
void Ship::destroyItem(size_t i){inside.destroy(items[i]->body);items.erase(items.begin()+i);}
void Ship::dropItem(Crew& c,bool split){const std::string t=c.slots[c.selected];if(c.piloting||t.empty()||!c.counts[c.selected]){toast("Select a carried item while on foot.");return;}
 V2 p=vv(c.body->GetPosition()),aim=c.mouseActive?c.mouse:V2(p.x+c.facing,p.y-.3),dir=aim-p;if(dir.len()<.01)dir.x=c.facing;{double l=dir.len();if(l>=1e-9){dir.x/=l;dir.y/=l;}}
 const V2 cand[4]={{p.x+dir.x*.9,p.y+dir.y*.9},{p.x-c.facing*.9,p.y-.3},{p.x,p.y-.95},{p.x,p.y}};const V2* q=nullptr;
 for(const V2& o:cand){if(!(o.x>bounds.l+.85&&o.x<bounds.r-.85&&o.y>bounds.t+.85&&o.y<bounds.b-.85))continue;bool hit=false;
  for(auto& [k,b]:blocks)if(std::fabs(b.x-o.x)<.85&&std::fabs(b.y-o.y)<.85){hit=true;break;}
  if(!hit)for(auto& [k,t2]:terrain)if(t2.type=="net"&&std::fabs(t2.x-o.x)<.85&&std::fabs(t2.y-o.y)<.85){hit=true;break;}
  if(!hit){q=&o;break;}}
 if(!q){toast("Make room to drop the item.");return;}int count=split?(c.counts[c.selected]+1)/2:c.counts[c.selected];c.counts[c.selected]-=count;if(!c.counts[c.selected])c.slots[c.selected].clear();
 spawnItem(t,*q,{dir.x*5,dir.y*5},count);selectSlot(c,c.selected);}
static double cargoHalf(b2Body* b){b2Fixture* f=b->GetFixtureList();if(f&&f->GetType()==b2Shape::e_polygon)return std::fabs(((b2PolygonShape*)f->GetShape())->m_vertices[0].x);return .32;}
static bool cargoNear(b2Body* a,b2Body* b){auto p=a->GetPosition(),q=b->GetPosition();return std::hypot(p.x-q.x,p.y-q.y)<(cargoHalf(a)+cargoHalf(b))*1.15;}
// Stacks of one type that touch (or sit face to face within a few hundredths) become one; resting ones are looked at
// every MERGE_FULL ticks, awake ones every tick.
void Ship::mergeTouchingCargo(){const int MERGE_FULL=data().raw.at("MERGE_FULL");const bool full=(++mergePass%MERGE_FULL)==0;
 if(!full){bool any=false;for(auto& i:items)if(i->body->IsAwake()){any=true;break;}if(!any)return;}
 std::unordered_map<b2Body*,Item*> byBody;for(auto& i:items)byBody[i->body]=i.get();std::unordered_set<Item*> removed;
 for(auto& xp:items){Item* x=xp.get();if(removed.count(x))continue;if(!full&&!x->body->IsAwake())continue;
  for(b2ContactEdge* e=x->body->GetContactList();e;e=e->next){auto f=byBody.find(e->other);if(f==byBody.end())continue;Item* y=f->second;
   if(y==x||removed.count(y)||x->type!=y->type||x->count+y->count>stackLimit(x->type)||!(e->contact->IsTouching()||cargoNear(x->body,y->body)))continue;
   b2Vec2 vx=x->body->GetLinearVelocity(),vy=y->body->GetLinearVelocity();int t=x->count+y->count;x->body->SetLinearVelocity(b2Vec2((float)((vx.x*x->count+vy.x*y->count)/(double)t),(float)((vx.y*x->count+vy.y*y->count)/(double)t)));
   x->count=t;x->grace=std::max(x->grace,y->grace);x->body->SetAwake(true);removed.insert(y);}}
 if(removed.empty())return;for(size_t i=items.size();i-->0;)if(removed.count(items[i].get()))destroyItem(i);}
void Ship::wakeCargoNear(V2 p,double radius){for(auto& i:items)if((vv(i->body->GetPosition())-p).len()<radius)i->body->SetAwake(true);
 for(auto& b:boxes)if((vv(b->body->GetPosition())-p).len()<radius+b->size/2)b->body->SetAwake(true);}
// ---- Expando boxes -------------------------------------------------------------------------------------------------
static b2Fixture* boxFixture(b2Body* b,double size){b2PolygonShape s;s.SetAsBox((float)(size/2),(float)(size/2));b2FixtureDef fd;fd.shape=&s;fd.density=.35f;fd.friction=.18f;fd.filter.categoryBits=8;fd.filter.maskBits=1|2|8|16|256|512;return b->CreateFixture(&fd);}
Box& Ship::spawnBox(V2 p,const J& materials){const double size=2+std::floor(total(materials)/64)*.25;b2BodyDef d;d.type=b2_dynamicBody;d.position=bv(p);d.angularDamping=5;d.linearDamping=.1f;d.bullet=true;
 auto b=std::make_unique<Box>();b->body=inside.w.CreateBody(&d);b->size=size;b->materials=materials.is_object()?materials:J::object();b->fixture=boxFixture(b->body,size);boxes.push_back(std::move(b));return *boxes.back();}
std::vector<std::pair<int,int>> Ship::helmCells()const{return {{helm.x,helm.y},{helm.x+1,helm.y},{helm.x,helm.y-1},{helm.x+1,helm.y-1}};}
static bool among(const std::string& t,std::initializer_list<const char*> l){for(const char* s:l)if(t==s)return true;return false;}
bool Ship::boxSpace(V2 p,double size,const Box* ignore,bool growing,const Crew* standing)const{const double h=size/2,e=growing?.04:0;
 if(p.x-h<bounds.l+.5-e||p.x+h>bounds.r-.5+e||p.y-h<bounds.t+.5-e||p.y+h>bounds.b-.5+e)return false;
 if(!growing&&standing){V2 q=vv(standing->body->GetPosition());if(std::fabs(q.x-p.x)<h+.24&&std::fabs(q.y-p.y)<h+.63)return false;}
 auto cellHit=[&](int x,int y){return std::fabs(x-p.x)<h+.49-e&&std::fabs(y-p.y)<h+.49-e;};
 for(auto& [k,t]:terrain){if(among(t.type,{"wedge","walkway_wedge","glass","net","door","hatch","starter_hatch","pusher_block","paint","anchor","spawn"})){
   int w=1,hh=1;{const J& m=data().raw.at("MACHINE_SIZE");auto it=m.find(t.type);if(it!=m.end()){w=(*it)[0];hh=(*it)[1];}}
   const bool turns=!among(t.type,{"anchor","spawn","fabricator","storage","ladder","recycler","comms"});const int r=turns?((t.rotation%4)+4)%4:0;
   for(int dx=0;dx<w;dx++)for(int dy=0;dy<hh;dy++){int ox=r==0?dx:r==1?-dy:r==2?-dx:dy,oy=r==0?dy:r==1?dx:r==2?-dy:-dx;if(cellHit(t.x+ox,t.y+oy))return false;}}}
 for(auto [x,y]:helmCells())if(cellHit(x,y))return false;
 for(auto& [k,b]:blocks)if(cellHit(b.x,b.y))return false;
 for(auto& b:boxes){if(b.get()==ignore)continue;V2 q=vv(b->body->GetPosition());if(std::fabs(q.x-p.x)<(b->size+size)/2-e&&std::fabs(q.y-p.y)<(b->size+size)/2-e)return false;}
 return true;}
bool Ship::resizeBox(Box& box){const double size=2+std::floor(total(box.materials)/64)*.25;if(size==box.size)return true;V2 pos=vv(box.body->GetPosition());
 if(size>box.size){const double d=(size-box.size)/2;const double off[9][2]={{0,0},{0,-d},{d,0},{-d,0},{0,d},{d,-d},{-d,-d},{d,d},{-d,d}};bool ok=false;
  for(auto& o:off){V2 q{pos.x+o[0],pos.y+o[1]};if(boxSpace(q,size,&box,true,nullptr)){pos=q;ok=true;break;}}if(!ok)return false;}
 box.body->DestroyFixture(box.fixture);box.size=size;box.fixture=boxFixture(box.body,size);box.body->SetTransform(bv(pos),box.body->GetAngle());box.body->SetAwake(true);return true;}
int Ship::boxInsert(Box& box,const std::string& type,int n){if(n<=0)return 0;{std::string have;for(auto& [k,v]:box.materials.items())if(v.is_number()&&v.get<int>()>0){have=k;break;}if(!have.empty()&&have!=type)return 0;}
 const int t=total(box.materials);auto add=[&](int k){box.materials[type]=(box.materials.contains(type)?box.materials[type].get<int>():0)+k;};
 add(n);if(resizeBox(box))return n;add(-n);const int fits=std::min(n,(t/64+1)*64-1-t);if(fits<=0)return 0;add(fits);if(resizeBox(box))return fits;add(-fits);return 0;}
Box* Ship::boxAt(V2 p){for(auto& b:boxes){b2Vec2 q=b->body->GetLocalPoint(bv(p));if(std::fabs(q.x)<b->size/2&&std::fabs(q.y)<b->size/2)return b.get();}return nullptr;}
Box* Ship::boxNear(V2 p,double pad){if(Box* b=boxAt(p))return b;for(auto& b:boxes){b2Vec2 q=b->body->GetLocalPoint(bv(p));if(std::fabs(q.x)<b->size/2+pad&&std::fabs(q.y)<b->size/2+pad)return b.get();}return nullptr;}
// ---- Safeguards (safeguards.js) -------------------------------------------------------------------------------------
bool Ship::solidCell(int x,int y,bool cargo)const{if(blocks.has(key(x,y)))return true;const Tile* t=terrainAt(x,y);
 return t&&among(t->type,{"door","wedge","glass","pusher_block","loader","paint","fabricator","net","walkway","walkway_wedge"})&&!(cargo&&t->type=="loader");}
V2 Ship::safeCell(V2 p,bool cargo)const{if(!std::isfinite(p.x)||!std::isfinite(p.y))p={(double)helm.x,helm.y-1.0};
 struct C{int x,y;};C start{(int)clamp(jsRound(p.x),bounds.l+1,bounds.r-1),(int)clamp(jsRound(p.y),bounds.t+1,bounds.b-1)};std::unordered_set<std::string> seen{key(start.x,start.y)};std::vector<C> q{start};
 auto hc=helmCells();
 for(size_t i=0;i<q.size();i++){C c=q[i];bool helmHere=false;for(auto [hx,hy]:hc)if(hx==c.x&&hy==c.y)helmHere=true;
  bool boxHere=false;if(cargo)for(auto& b:boxes){b2Vec2 w=b->body->GetPosition();if(std::fabs(w.x-c.x)<b->size/2+.4&&std::fabs(w.y-c.y)<b->size/2+.4){boxHere=true;break;}}
  if(!solidCell(c.x,c.y,cargo)&&!helmHere&&!boxHere)return {(double)c.x,(double)c.y};
  for(auto [dx,dy]:std::initializer_list<std::pair<int,int>>{{1,0},{-1,0},{0,1},{0,-1}}){C n{c.x+dx,c.y+dy};if(n.x<=bounds.l||n.x>=bounds.r||n.y<=bounds.t||n.y>=bounds.b)continue;std::string k=key(n.x,n.y);if(seen.count(k))continue;seen.insert(k);q.push_back(n);}}
 return {(double)helm.x,helm.y-1.0};}
bool Ship::wedgedInSolid(b2Body* body)const{b2Vec2 c=body->GetPosition();b2Fixture* own=body->GetFixtureList();uint16_t cat=own?own->GetFilterData().categoryBits:1,mask=own?own->GetFilterData().maskBits:0xffff;bool stuck=false;
 const_cast<World&>(inside).queryAABB({c.x-.05,c.y-.05},{c.x+.05,c.y+.05},[&](b2Fixture* f){if(f->GetBody()==interior&&f->GetFilterData().categoryBits==1&&(skinMaskOf(f)&cat)&&(mask&1)&&f->TestPoint(c)){stuck=true;return false;}return true;});return stuck;}
void Ship::rescueBody(b2Body* b,bool cargo){b->SetTransform(bv(safeCell(vv(b->GetPosition()),cargo)),0);b->SetLinearVelocity(b2Vec2(0,0));b->SetAngularVelocity(0);b->SetAwake(true);}
static void clampSpeed(b2Body* b,double max){V2 v=vv(b->GetLinearVelocity());double s=v.len();if(s>max)b->SetLinearVelocity(b2Vec2((float)(v.x*max/s),(float)(v.y*max/s)));}
int Ship::mergeLooseStacks(){const size_t before=items.size();OMap<std::string,std::vector<Item*>> byType;for(auto& i:items){auto* l=byType.get(i->type);if(!l)l=&byType.set(i->type,{});l->push_back(i.get());}
 std::unordered_set<Item*> gone;for(auto& [type,list]:byType){const int cap=stackLimit(type);if(cap<=1)continue;std::stable_sort(list.begin(),list.end(),[](Item* a,Item* b){return a->count>b->count;});
  size_t i=0,j=list.size()-1;while(i<j){Item* dst=list[i];Item* src=list[j];if(dst->count>=cap){i++;continue;}int n=std::min(cap-dst->count,src->count);dst->count+=n;src->count-=n;if(src->count<=0){gone.insert(src);j--;}}}
 for(size_t i=items.size();i-->0;)if(gone.count(items[i].get()))destroyItem(i);return (int)(before-items.size());}
void Ship::tickSafeguards(double dt){const J& S=data().raw.at("SAFETY");const double cargoMax=S.at("maxCargoSpeed").get<double>();
 auto finite=[](b2Body* b){auto p=b->GetPosition(),v=b->GetLinearVelocity();return std::isfinite(p.x)&&std::isfinite(p.y)&&std::isfinite(v.x)&&std::isfinite(v.y);};
 for(auto& i:items){if(!i->body->IsAwake())continue;if(!finite(i->body))rescueBody(i->body,true);else clampSpeed(i->body,cargoMax);}
 for(auto& b:boxes){if(!finite(b->body))rescueBody(b->body,true);else clampSpeed(b->body,cargoMax);}
 safetyTimer+=dt;if(safetyTimer<S.at("checkInterval").get<double>())return;const double step=safetyTimer;safetyTimer=0;
 for(auto& i:items){if(wedgedInSolid(i->body)){i->stuck+=step;if(i->stuck>=S.at("compactionSeconds").get<double>()){rescueBody(i->body,true);i->stuck=0;}}else i->stuck=0;}
 if((int)items.size()>S.at("maxLooseStacks").get<int>()){int merged=mergeLooseStacks();if(merged)toastAll("Cargo tidy-up: merged "+std::to_string(merged)+" loose stacks.");}
 // TODO stage 7 (exterior): past hardLooseStacks the oldest excess stacks are ejected into the zone as loot.
}
// Cargo pushed out through solid hull goes back in (a broken hull lets it out into the zone: stage 7, with the exterior).
void Ship::tickHullLeaks(){for(auto& i:items){b2Vec2 p=i->body->GetPosition();if(p.x>bounds.l-.5&&p.x<bounds.r+.5&&p.y>bounds.t-.5&&p.y<bounds.b+.5)continue;if(std::isfinite(p.x)&&std::isfinite(p.y))rescueBody(i->body,true);}}
void Ship::tickTrashDecay(double dt){const double life=data().ammo.at("trash").value("itemDecay",45.0);
 for(size_t k=items.size();k-->0;){Item& i=*items[k];if(i.type=="trash"&&random()<dt/life){i.count--;if(i.count<=0)destroyItem(k);}}
 for(auto& b:boxes){int n=b->materials.contains("trash")&&b->materials["trash"].is_number()?b->materials["trash"].get<int>():0;if(n>0&&random()<dt*std::min(16,n)/life/4)b->materials["trash"]=n-1;}}
}
