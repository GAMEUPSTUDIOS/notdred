// Building, dismantling, rotating, the helm and the click dispatcher: dist/modules/construction.js and the edit,
// interact, takeHelm, recover, pickupAt, useBox parts of dist/game.js / cargo.js, ported one for one.
#include "ship.h"
namespace nd {
static const J& names(){return data().raw.at("NAMES");}
std::string nameOf(const std::string& t){const J& n=names();auto it=n.find(t);return it!=n.end()&&it->is_string()?it->get<std::string>():t;}
static std::string lower(std::string s){for(auto& c:s)c=(char)std::tolower((unsigned char)c);return s;}
static bool inTable(const char* table,const std::string& v){for(auto& x:data().raw.at(table))if(x.is_string()&&x.get_ref<const std::string&>()==v)return true;return false;}
static bool among(const std::string& t,std::initializer_list<const char*> l){for(const char* s:l)if(t==s)return true;return false;}
static void sizeOf(const std::string& type,int& w,int& h){const J& m=data().raw.at("MACHINE_SIZE");auto it=m.find(type);if(it!=m.end()){w=(*it)[0];h=(*it)[1];}else{w=1;h=1;}}
static bool isFabItem(const std::string& t){return data().raw.at("FAB_ITEMS").contains(t);}
std::string physicsMachineType(const std::string& t){return isFabItem(t)?"fabricator":t=="recycler"||t=="comms"?t:"";}
static std::string fabKind(const Tile& t){auto it=t.extra.find("kind");if(it!=t.extra.end()&&it->is_string()&&data().raw.at("FABRICATORS").contains(it->get<std::string>()))return it->get<std::string>();return "legacy";}
static std::string placedName(const Tile* t){if(!t)return nameOf("block");if(t->type=="fabricator")return data().raw.at("FABRICATORS").at(fabKind(*t)).at("name");return nameOf(t->type);}
static double dist(V2 a,V2 b){return (a-b).len();}
static V2 pos(const Crew& c){return vv(c.body->GetPosition());}
V2 Ship::localMouse(const Crew& c)const{return c.mouse;}
std::pair<int,int> Ship::cursorCell(const Crew& c)const{return {(int)jsRound(c.mouse.x),(int)jsRound(c.mouse.y)};}
void Ship::actionEffect(double x,double y,const std::string& color,const std::string& label,const Crew& c){V2 f=pos(c);effects.push_back({{"x",x},{"y",y},{"w",1},{"h",1},{"life",.5},{"color",color},{"label",label},{"from",{{"x",f.x+c.facing*.3},{"y",f.y-.2}}}});}
// ---- Reach ---------------------------------------------------------------------------------------------------------
// A tile is in reach along a clear line from you to its centre, or to any of four points near its corners.
bool Ship::rayBlocked(const Crew& c,V2 cell,b2Fixture* ignore,double ox,double oy){V2 end{cell.x+ox,cell.y+oy},start=pos(c);if(dist(start,end)<.01)return false;bool blocked=false;
 inside->rayCast(start,end,[&](b2Fixture* f,b2Vec2 p,b2Vec2,float fraction){const uint16_t cat=f->GetFilterData().categoryBits;
  if(f!=ignore&&f->GetBody()==interior&&(cat==1||cat==4)&&fraction<.999f){bool shellTile=std::find(shell.begin(),shell.end(),f)!=shell.end();
   if(!(shellTile&&(f->TestPoint(bv(end))||(std::fabs(p.x-end.x)<=.62&&std::fabs(p.y-end.y)<=.62)))){blocked=true;return 0.f;}}return 1.f;});return blocked;}
bool Ship::buildBlocked(const Crew& c,V2 cell,b2Fixture* ignore){const double o[5][2]={{0,0},{-.3,-.3},{.3,-.3},{-.3,.3},{.3,.3}};for(auto& d:o)if(!rayBlocked(c,cell,ignore,d[0],d[1]))return false;return true;}
// ---- Footprints and placement ------------------------------------------------------------------------------------
static bool isMountType(const std::string& t){return inTable("MOUNT_TYPES",t);}
bool placeable(const std::string& t){if(t=="helm")return true;const auto& ty=data().types;return std::find(ty.begin(),ty.end(),t)!=ty.end()&&!isAmmo(t)&&!inTable("NOT_PLACEABLE",t);}
static void placeSize(const std::string& t,int& w,int& h){if(t=="helm"||t=="storage"){w=h=2;return;}std::string mt=physicsMachineType(t);sizeOf(mt.empty()?t:mt,w,h);}
std::vector<std::pair<int,int>> Ship::footprintCells(const std::string& t,int x,int y,int r)const{if(t=="helm"){return {{x,y},{x+1,y},{x,y-1},{x+1,y-1}};}Tile probe;probe.type=t;probe.x=x;probe.y=y;probe.rotation=r;return terrainCells(probe);}
std::pair<int,int> Ship::buildAnchor(const std::string& t,V2 m,const Crew& who)const{std::pair<int,int> c{(int)jsRound(m.x),(int)jsRound(m.y)};
 if(isMountType(t)){Mount mt;if(!mountAt({(double)c.first,(double)c.second},t,mt))return c;int n=mountWidth(mt);if(mt.side=="top"||mt.side=="bottom")return {(int)jsRound(m.x-(n-1)/2.0),c.second};return {c.first,(int)jsRound(m.y-(n-1)/2.0)};}
 if(!physicsMachineType(t).empty()||t=="storage")return c;
 if(t=="helm"){int x0=(int)jsRound(m.x-.5),y0=(int)jsRound(m.y-.5);return {x0,y0+1};}
 auto off=footprintCells(t,0,0,who.buildRotation);double mx=0,my=0;for(auto [x,y]:off){mx+=x;my+=y;}mx/=off.size();my/=off.size();return {(int)jsRound(m.x-mx),(int)jsRound(m.y-my)};}
std::pair<int,int> Ship::buildCell(const std::string& t,const Crew& c)const{return buildAnchor(t,c.mouse,c);}
double Ship::supportTopBelow(double x0,double x1,double yFrom)const{double best=NAN;const int k0=(int)std::ceil(x0-.5+1e-6),k1=(int)std::floor(x1+.5-1e-6);
 for(int x=k0;x<=k1;x++)for(int y=std::max((int)jsRound(yFrom),bounds.t+1);y<=bounds.b;y++){const Tile* t=y<bounds.b?terrainAt(x,y):nullptr;
  if(y==bounds.b||blocks.has(key(x,y))||(t&&!t->body&&inTable("SUPPORT_TYPES",t->type))){if(std::isnan(best)||y-.5<best)best=y-.5;break;}}return best;}
bool Ship::placementPoint(std::pair<int,int> c,const std::string& type,const Crew& who,V2& out)const{int w=1,h=1;{std::string mt=physicsMachineType(type);if(type=="storage"){w=h=2;}else if(!mt.empty())sizeOf(mt,w,h);}
 V2 aim;bool have=false;if(placingAim){aim=*placingAim;have=true;}else if(who.buildJob.is_object()&&who.buildJob.contains("p")){aim={who.buildJob["p"]["x"].get<double>(),who.buildJob["p"]["y"].get<double>()};have=true;}
 if(!have&&who.mouseActive){V2 m=who.mouse;if(std::fabs(m.x-c.first)<=.5&&std::fabs(m.y-c.second)<=.5){aim=m;have=true;}}if(!have)aim={(double)c.first,(double)c.second};
 const double x=clamp(aim.x,bounds.l+.5+w/2.0,bounds.r-.5-w/2.0);
 if(type=="storage"){V2 p{x,clamp(aim.y,bounds.t+.5+h/2.0,bounds.b-.5-h/2.0)};if(!boxSpace(p,w,nullptr,false,&who))return false;out=p;return true;}
 double top=supportTopBelow(x-w/2.0,x+w/2.0,aim.y);if(std::isnan(top))return false;out={x,top-h/2.0-.01};return true;}
// Why tile p can't take a piece ("" when it can). ignoreHelm: moving the helm may overlap where it stands now.
std::string Ship::cellTaken(int x,int y,bool ignoreHelm)const{if(!interiorCell(x,y))return "Build inside the ship.";if(blocks.has(key(x,y))||terrainAt(x,y))return "This cell is occupied.";
 if(!ignoreHelm)for(auto [hx,hy]:helmCells())if(hx==x&&hy==y)return "The 2×2 helm is here.";
 for(auto& b:boxes){b2Vec2 q=b->body->GetPosition();if(std::fabs(q.x-x)<b->size/2+.47&&std::fabs(q.y-y)<b->size/2+.47)return "An expando box is in the way.";}
 for(auto& [k,t]:terrain)if(t.body){int w,h;sizeOf(t.type,w,h);V2 q=t.mpos;if(std::fabs(q.x-x)<w/2.0+.47&&std::fabs(q.y-y)<h/2.0+.47){
   const J& n=names();return t.type=="fabricator"?"A fabricator is in the way.":n.contains(t.type)?"The "+lower(nameOf(t.type))+" is in the way.":"A machine is in the way.";}}
 return "";}
std::string Ship::validity(std::pair<int,int> c,const std::string& t,Crew& who){
 if(t=="sign"&&(who.rank.empty()?"guest":who.rank)=="guest")return "Guests cannot place signs.";
 if(buildBlocked(who,{(double)c.first,(double)c.second},nullptr))return "A solid tile blocks your reach.";if(who.piloting)return "Leave the helm to build.";
 if(isMountType(t)){Mount m;return mountAt({(double)c.first,(double)c.second},t,m)&&mountValid(m)?"":"Choose free hull tiles. Normal thrusters and turrets occupy three adjacent tiles.";}
 if(t=="embiggener"||t=="shrinker")return interiorCell(c.first,c.second)?"":"Aim at a cut inside the ship; R changes the axis.";
 if(t=="storage"){V2 p;if(!placementPoint(c,t,who,p))return "It needs a block or the floor to stand on.";if(dist(pos(who),p)>8)return "Move closer to build.";return boxSpace(p,2,nullptr,false,&who)?"":"Make room to spawn the box.";}
 {std::string mt=physicsMachineType(t);if(!mt.empty()){V2 p;if(!placementPoint(c,t,who,p))return "It needs a block or the floor to stand on.";if(dist(pos(who),p)>8)return "Move closer to build.";int w,h;sizeOf(mt,w,h);
   return machineSpace(mt,p,&who)?"":(mt=="fabricator"?std::string("Fabricator"):nameOf(mt))+" needs a clear "+std::to_string(w)+"×"+std::to_string(h)+" space.";}}
 auto cells=footprintCells(t,c.first,c.second,who.buildRotation);int w,h;placeSize(t,w,h);double mx=0,my=0;for(auto [x,y]:cells){mx+=x;my+=y;}mx/=cells.size();my/=cells.size();
 if(dist(pos(who),{mx,my})>8)return "Move closer to build.";
 for(auto [x,y]:cells){std::string r=cellTaken(x,y,t=="helm");if(!r.empty()){if(t=="door"&&r=="This cell is occupied.")return "A door needs two clear tiles, one above the other.";
   if(cells.size()>1&&r=="This cell is occupied.")return (t=="helm"?std::string("Helm"):nameOf(t))+" needs a clear "+std::to_string(w)+"×"+std::to_string(h)+" space.";return r;}}
 if(inTable("SOLID_PIECES",t)){V2 pl=pos(who);for(auto [x,y]:cells)if(std::fabs(x-pl.x)<.75&&std::fabs(y-pl.y)<1.15)return "You are standing here.";
  for(auto [x,y]:cells)for(auto& i:items){b2Vec2 q=i->body->GetPosition();if(std::fabs(q.x-x)<.85&&std::fabs(q.y-y)<.85)return "Pick up the item here first.";}}
 if(t=="helm"&&!(c.second==bounds.b-1||(supportsMachine(c.first,c.second+1)&&supportsMachine(c.first+1,c.second+1))))return "Place this on the floor, a block or a walkway.";
 if(inTable("STANDING_MACHINES",t)){bool ok=c.second+h-1==bounds.b-1;if(!ok){ok=true;for(int k=0;k<w;k++)if(!supportsMachine(c.first+k,c.second+h))ok=false;}
  if(!ok)return nameOf(t)+" needs a clear "+std::to_string(w)+"×"+std::to_string(h)+" area, supported across its bottom.";}
 return "";}
// ---- Building ------------------------------------------------------------------------------------------------------
static bool notBuildable(const std::string& t){return isAmmo(t)||among(t,{"iron","explosives","fuel","flux","wrench","shredder","shredder_gold","pusher","repair","booster","empty","walk"});}
bool Ship::beginBuild(Crew& c,std::pair<int,int> cell,const std::string& t){if(c.buildJob.is_object()){toast("Finish the current build first.");return false;}
 if(notBuildable(t)){toast("Select a placeable item.");return false;}std::string err=validity(cell,t,c);if(!err.empty()){toast(err);return false;}
 if(t=="helm"?!carried(c,"wrench"):!carried(c,t)){toast("You need the item before building.");return false;}
 J j=J::object();j["c"]={{"x",cell.first},{"y",cell.second}};if(!physicsMachineType(t).empty()||t=="storage"){V2 p=c.mouseActive?c.mouse:V2(cell.first,cell.second);j["p"]={{"x",p.x},{"y",p.y}};}
 j["type"]=t;j["rotation"]=c.buildRotation;j["elapsed"]=0;j["duration"]=isFabItem(t)||inTable("STANDING_MACHINES",t)?.55:among(t,{"turret","starter_rc","thruster","storage"})?.4:.28;c.buildJob=j;return true;}
void Ship::tickBuild(Crew& c,double dt){J& j=c.buildJob;if(!j.is_object())return;const std::string type=j["type"];
 if(type=="booster"){V2 p=pos(c);j["c"]={{"x",jsRound(p.x)},{"y",jsRound(p.y)}};}
 const V2 cc{j["c"]["x"].get<double>(),j["c"]["y"].get<double>()};
 if(c.piloting||c.tool!=type||c.buildRotation!=j["rotation"].get<int>()||dist(pos(c),cc)>8||(type=="helm"?!carried(c,"wrench"):!carried(c,type))){c.buildJob=J();return;}
 j["elapsed"]=j["elapsed"].get<double>()+dt;if(j["elapsed"].get<double>()<j["duration"].get<double>())return;J job=j;c.buildJob=J();
 if(type=="booster")return; // TODO stage 7: applyBooster
 V2 aim;bool hasP=job.contains("p");if(hasP){aim={job["p"]["x"].get<double>(),job["p"]["y"].get<double>()};placingAim=&aim;}
 std::pair<int,int> cell{(int)cc.x,(int)cc.y};std::string err=validity(cell,type,c);if(!err.empty()){placingAim=nullptr;toast("Build cancelled: "+err);return;}
 commitBuild(c,cell,type,job["rotation"].get<int>());placingAim=nullptr;}
void Ship::commitBuild(Crew& c,std::pair<int,int> cell,const std::string& t,int rotation){
 if(t=="helm"){if(!carried(c,"wrench")){toast("Carry a wrench.");return;}helm.x=cell.first;helm.y=cell.second;selectSlot(c,0);return;}
 if(!carried(c,t)){toast("Craft or pick up this item first.");return;}if(t=="iron"||t=="ammo"||t=="flux"){toast("This is a carried resource. Q drops it.");return;}
 if(t=="embiggener"||t=="shrinker"){resizeCut(c,cell,t=="embiggener");return;}
 if(t=="storage"){V2 p;if(placementPoint(cell,t,c,p))spawnBox(p,J::object());}
 else if(isMountType(t)){Mount m;mountAt({(double)cell.first,(double)cell.second},t,m);mounts.push_back(m);rebuildMounts();}
 else if(t=="block")addBlock(cell.first,cell.second,rotation);
 else if(!physicsMachineType(t).empty()){std::string mt=physicsMachineType(t);V2 p;placementPoint(cell,t,c,p);Tile& m=spawnMachine(mt,p,J::object(),"");if(mt=="fabricator")m.extra["kind"]=data().raw.at("FAB_ITEMS").at(t);}
 else{Tile* n=addTerrain(t,cell.first,cell.second,rotation);if(n&&(t=="door"||t=="spawn")){const std::string rk=c.rank.empty()?"crew":c.rank;if(t=="door")setDoorAccess(*n,rk);else if(rk=="captain"||rk=="crew"||rk=="guest")n->access=rk;}}
 int w=1,h=1;if(isFabItem(t)){w=2;h=3;}else if(t=="storage"){w=h=2;}else sizeOf(t,w,h);effects.push_back({{"x",cell.first},{"y",cell.second},{"w",w},{"h",h},{"life",.45},{"label","1 x "+nameOf(t)}});
 if(!c.sandbox)takeItem(c,t,1);}
// ---- Dismantling ---------------------------------------------------------------------------------------------------
void Ship::dropContents(Tile& t,V2 p){const J m=t.extra.contains("materials")?t.extra["materials"]:J();
 if(m.is_object())for(auto& k:data().types){auto it=m.find(k);if(it!=m.end()&&it->is_number()&&it->get<double>()>0){scatter(k,(int)it->get<double>(),{p.x,p.y+.4});t.extra["materials"][k]=0;}}
 if(t.extra.contains("job")&&t.extra["job"].is_object()){J need=recipeNeeds(t.extra["job"].value("type",""));if(need.is_object())for(auto& [k,n]:need.items())scatter(k,n.get<int>(),{p.x,p.y+.4});t.extra["job"]=nullptr;}
 if(t.extra.contains("cargo")&&t.extra["cargo"].is_array())for(auto& i:t.extra["cargo"])if(i.is_object())scatter(i.value("type",""),i.value("count",1),{p.x,p.y+.4});t.extra["cargo"]=J::array();}
void Ship::dropMachine(const std::string& k,Crew& who){Tile* t=terrain.get(k);if(!t)return;int w,h;sizeOf(t->type,w,h);V2 p=t->body?t->mpos:V2(t->x+(w-1)/2.0,t->y+(h-1)/2.0);dropContents(*t,p);
 std::string item=t->type=="fabricator"?data().raw.at("FABRICATORS").at(fabKind(*t)).at("item").get<std::string>():t->type,label=placedName(t)+" fell";
 if(t->f){interior->DestroyFixture(t->f);skinDirty=true;}if(t->body)inside->destroy(t->body);terrain.erase(k);scatter(item,1,{p.x,p.y+.4});actionEffect(p.x,p.y,"red",label,who);wakeCargoNear(p,4);}
static std::string keyOf(const Ship& s,const Tile* t){for(auto& [k,v]:s.terrain)if(&v==t)return k;return "";}
void Ship::removeAt(Crew& c,std::pair<int,int> cell){V2 cv{(double)cell.first,(double)cell.second};wakeCargoNear(cv,3);
 if(c.tool!="walk"&&c.tool!="remove"){toast("Select the wrench to dismantle tiles.");return;}
 if(Box* box=boxAt(cv)){V2 bp=vv(box->body->GetPosition());if(dist(pos(c),bp)>8){toast("Move closer.");return;}if(!carried(c,"wrench")||c.piloting){toast("Carry a wrench first.");return;}
  for(auto& t:data().types){auto it=box->materials.find(t);if(it!=box->materials.end()&&it->is_number()&&it->get<double>())scatter(t,(int)it->get<double>(),bp);}
  inside->destroy(box->body);for(size_t i=0;i<boxes.size();i++)if(boxes[i].get()==box){boxes.erase(boxes.begin()+i);break;}actionEffect(cv.x,cv.y,"red","Expando box",c);refund(c,"storage",&cv);return;}
 if(c.piloting||!carried(c,"wrench")){toast("Carry a wrench and leave the helm first.");return;}
 if(const Mount* mh=mountHit(cv)){size_t i=mh-mounts.data();Mount m=*mh;mounts.erase(mounts.begin()+i);rebuildMounts();actionEffect(cv.x,cv.y,"red",nameOf(m.type),c);refund(c,mountItem(m),&cv);
  if(m.fuelItems)giveItem(c,"fuel",(int)m.fuelItems);if(m.explosiveItems)giveItem(c,"explosives",(int)m.explosiveItems);if(m.ammo)scatter(m.ammoType.empty()?"ammo":m.ammoType,(int)m.ammo,cv);return;}
 if(dist(pos(c),cv)>8){toast("Move closer.");return;}
 Block* blk=blocks.get(key(cell.first,cell.second));const Tile* tt=blk?nullptr:terrainAt(cell.first,cell.second);if(!blk&&!tt){toast("Click a placed tile or hull attachment.");return;}
 if((cell.first==helm.x||cell.first==helm.x+1)&&cell.second==helm.y+1){toast("Move the helm before removing its support.");return;}
 {for(int k=0;k<8;k++){const Tile* top=machineOnTop(cell.first,cell.second);if(!top)break;std::string tk=keyOf(*this,top);if(tk.empty())break;dropMachine(tk,c);}}
 if(blk){Block b=*blk;if(b.f){interior->DestroyFixture(b.f);skinDirty=true;}blocks.erase(key(cell.first,cell.second));actionEffect(cv.x,cv.y,"red",nameOf("block"),c);refund(c,"block",&cv);return;}
 tt=terrainAt(cell.first,cell.second);if(!tt){return;}std::string tk=keyOf(*this,tt);Tile& t=*terrain.get(tk);
 if(t.type=="fabricator"||t.type=="storage")dropContents(t,t.body?t.mpos:V2(t.x+.5,t.y+1));
 if(t.extra.contains("cargo")&&t.extra["cargo"].is_array())for(auto& i:t.extra["cargo"])if(i.is_object())scatter(i.value("type",""),i.value("count",1),{t.x,t.y+.4});
 Tile copy=t;if(t.f){interior->DestroyFixture(t.f);skinDirty=true;}if(t.body)inside->destroy(t.body);blocks.erase(key(cell.first,cell.second));terrain.erase(tk);
 actionEffect(cv.x,cv.y,"red",placedName(&copy),c);refund(c,copy.type=="fabricator"?data().raw.at("FABRICATORS").at(fabKind(copy)).at("item").get<std::string>():copy.type,&cv);}
// ---- Rotating ------------------------------------------------------------------------------------------------------
bool Ship::setDoorAccess(Tile& t,const std::string& access){if(t.type!="door"||(access!="captain"&&access!="crew"&&access!="guest"))return false;t.access=access;
 if(t.f){interior->DestroyFixture(t.f);skinDirty=true;t.f=makeDoorFixture(t.ix(),t.iy(),t.rotation,access);}return true;}
void Ship::rotateSelection(Crew& c){if(c.piloting)return;
 if(c.tool=="pusher"){c.pusherPull=!c.pusherPull;toast(c.pusherPull?"Pusher: PULL · R switches to push":"Pusher: PUSH · R switches to pull");return;}
 auto cell=cursorCell(c);const Tile* t=terrainAt(cell.first,cell.second);Block* b=blocks.get(key(cell.first,cell.second));const Mount* m=mountHit({(double)cell.first,(double)cell.second});Box* box=boxAt(c.mouse);
 const char* noTurn="Turrets, turret controllers and thrusters face out from their hull wall and can't be rotated.";
 if(inTable("MOUNT_TOOLS",c.tool)){toast(noTurn);return;}
 bool onHelm=false;for(auto [hx,hy]:helmCells())if(hx==cell.first&&hy==cell.second)onHelm=true;
 if(isFabItem(c.tool)||c.tool=="ladder"||c.tool=="helm"||inTable("STANDING_MACHINES",c.tool)||(c.tool=="walk"&&((t&&(t->type=="fabricator"||t->type=="ladder"||inTable("STANDING_MACHINES",t->type)))||onHelm))){toast("Fabricators, machines, ladders and the helm stay upright.");return;}
 if(c.tool=="walk"){
  if(box){box->body->SetTransform(box->body->GetPosition(),box->body->GetAngle()+(float)(M_PI/2));box->body->SetAwake(true);}
  else if(m){toast(noTurn);return;}
  else if(t){const int r=(t->rotation+1)%4;V2 pl=pos(c);if((t->type=="wedge"||t->type=="walkway_wedge")&&!(std::fabs(pl.x-t->x)>.8||std::fabs(pl.y-t->y)>1.15)){toast("Move away from the wedge before rotating.");return;}
   if(t->body){toast("Machines stay upright.");return;}
   {std::unordered_set<std::string> mine;for(auto [x,y]:terrainCells(*t))mine.insert(key(x,y));Tile turned=*t;turned.rotation=r;
    for(auto [x,y]:terrainCells(turned)){if(mine.count(key(x,y)))continue;std::string why=cellTaken(x,y,false);if(!why.empty()){std::string w2=why;w2[0]=(char)std::tolower((unsigned char)w2[0]);toast("No room to turn it: "+w2);return;}}}
   std::string tk=keyOf(*this,t);Tile keep=*t;if(keep.f){interior->DestroyFixture(keep.f);skinDirty=true;}terrain.erase(tk);Tile* n=addTerrain(keep.type,keep.ix(),keep.iy(),r);
   if(n){for(const char* k:{"access","text","color","cargo","filterMode","filterItems","requireOutput","pull","mode","filteredMode","speed","maxBeam","hp"}){std::string ks=k;if(ks=="access"){if(!keep.access.empty())n->access=keep.access;}else if(ks=="hp")n->hp=keep.hp;else if(keep.extra.contains(k))n->extra[k]=keep.extra[k];}
    if(n->type=="door")setDoorAccess(*n,n->access.empty()?"crew":n->access);}}
  else if(b)b->rotation=(b->rotation+1)%4;
  else if(cell.first==helm.x&&cell.second==helm.y)helm.rotation=(helm.rotation+1)%4;
  else c.buildRotation=(c.buildRotation+1)%4;}
 else c.buildRotation=(c.buildRotation+1)%4;
 toast("Rotation: "+std::to_string(c.buildRotation*90)+"° · R turns clockwise");}
// ---- Helm, interacting, picking up ------------------------------------------------------------------------------------
bool Ship::nearHelm(const Crew& c)const{return dist(pos(c),{(double)helm.x,(double)helm.y})<2.2;}
void Ship::recover(Crew& c){c.piloting=false;c.climbing=false;c.body->SetEnabled(true);c.body->SetGravityScale(1);c.body->SetTransform(b2Vec2((float)helm.x,(float)helm.y-.15f),0);c.body->SetLinearVelocity(b2Vec2(0,0));}
void Ship::takeHelm(Crew& c){if(c.piloting)return;if(!nearHelm(c)){toast("Move closer to the helm.");return;}for(auto& [id,o]:crew)if(id!=c.id&&o.piloting){toast("The helm is already occupied.");return;}
 c.piloting=true;c.climbing=false;c.body->SetEnabled(false);c.tool="walk";toast("WASD thrust · Space brake · click the helm (or Esc) to leave");}
double Ship::fabDistance(const Crew& c,const Tile& f)const{V2 p=pos(c);double d=INFINITY;for(auto [x,y]:terrainCells(f))d=std::min(d,dist(p,{(double)x,(double)y}));return d;}
bool Ship::fabInSight(Crew& c,const Tile& f){for(auto [x,y]:terrainCells(f))if(!buildBlocked(c,{(double)x,(double)y},nullptr))return true;return false;}
bool Ship::fabReach(Crew& c,const Tile* f){return f&&f->type=="fabricator"&&fabDistance(c,*f)<2.4&&fabInSight(c,*f);}
Tile* Ship::nearFab(Crew& c){Tile* best=nullptr;double bd=2.4;for(auto& [k,t]:terrain)if(t.type=="fabricator"){double d=fabDistance(c,t);if(d<bd&&fabInSight(c,t)){bd=d;best=&t;}}return best;}
void Ship::openCraft(Crew& c,Tile* fab){if(!fab)return;c.activeFab=fab->id.empty()?keyOf(*this,fab):fab->id;c.keys=Keys();}
// The turret controller within reach (combat.js nearController / controllerAssignments / toggleController).
std::vector<const Mount*> Ship::controlledTurrets(const Mount& ctrl)const{std::vector<const Mount*> ctrls,free;for(auto& m:mounts){if(m.type=="turret_controller"&&m.side==ctrl.side)ctrls.push_back(&m);if(m.type=="turret"&&m.side==ctrl.side&&!m.starterRC&&(m.kind=="burst"||m.kind=="auto"))free.push_back(&m);}
 std::stable_sort(ctrls.begin(),ctrls.end(),[](const Mount* a,const Mount* b){return a->at<b->at;});const int per=data().raw.at("TURRET_CONTROLLER").at("turrets");
 for(const Mount* k:ctrls){std::stable_sort(free.begin(),free.end(),[&](const Mount* a,const Mount* b){return std::abs(a->at-k->at)<std::abs(b->at-k->at);});std::vector<const Mount*> mine(free.begin(),free.begin()+std::min((size_t)per,free.size()));free.erase(free.begin(),free.begin()+mine.size());if(k==&ctrl)return mine;}
 return {};}
bool Ship::toggleController(Crew& c){if(!c.manning.empty()){bool direct=c.manning.rfind("T:",0)==0;bool exists=false;if(direct)for(auto& m:mounts)if(m.type=="turret"&&"T:"+m.side+":"+std::to_string(m.at)==c.manning)exists=true;
  c.manning.clear();toast(direct&&exists?"Left the turret.":"Left the turret controller.");return true;}
 const Mount* best=nullptr;double bd=data().raw.at("TURRET_CONTROLLER").at("reach").get<double>();V2 p=pos(c);for(auto& m:mounts){if(m.type!="turret_controller")continue;double d=dist(p,mountPoint(m));if(d<bd){bd=d;best=&m;}}
 if(!best)return false;c.manning=best->side+":"+std::to_string(best->at);const size_t n=controlledTurrets(*best).size();size_t all=0;for(auto& m:mounts)if(m.type=="turret"&&m.side==best->side&&(m.kind=="burst"||m.kind=="auto"))all++;
 toast(n?"Manning the "+best->side+" turret controller: aim with the mouse, click to fire ("+std::to_string(n)+" turret"+(n>1?"s":"")+(all>n?"; "+std::to_string(all-n)+" more on this wall need another controller":"")+"). E or move to leave.":"No burst or auto turret on this wall for this controller to work.");return true;}
void Ship::interact(Crew& c){if(c.piloting){recover(c);return;}if(toggleController(c))return;if(Tile* f=nearFab(c)){openCraft(c,f);return;}
 // the server's guard (room-runtime): one pilot at a time
 if(nearHelm(c)){for(auto& [id,o]:crew)if(id!=c.id&&o.piloting){toast("The helm is already occupied.");return;}c.piloting=true;c.climbing=false;c.body->SetEnabled(false);c.tool="walk";toast("WASD thrust · Space brake · Thrust away to undock");}
 else toast("Move closer to the helm or fabricator.");}
bool Ship::pickupAt(Crew& c,V2 p){Item* it=nullptr;size_t idx=0;for(size_t k=0;k<items.size();k++)if(dist(vv(items[k]->body->GetPosition()),p)<.5){it=items[k].get();idx=k;break;}if(!it)return false;
 V2 ip=vv(it->body->GetPosition());if(c.piloting||dist(pos(c),ip)>3.5){toast("Move closer on foot to pick it up.");return true;}
 const Tile* own=terrainAt((int)jsRound(ip.x),(int)jsRound(ip.y));bool blocked=false;
 inside->rayCast(pos(c),ip,[&](b2Fixture* f,b2Vec2,b2Vec2,float){if(f->GetBody()!=interior)return 1.f;const uint16_t cat=f->GetFilterData().categoryBits;if(cat==1||(cat==4&&!(own&&own->f==f))){blocked=true;return 0.f;}return 1.f;});
 if(blocked){toast("Something solid is in the way.");return true;}int n=addCarried(c,it->type,it->count);it->count-=n;if(it->count<=0)destroyItem(idx);else toast("Inventory full: drop a stack with Q.");return true;}
bool Ship::useBox(Crew& c,V2 p){Box* b=boxAt(p);if(!b)return false;if(c.piloting||dist(pos(c),p)>3.5){toast("Move closer to the expando box.");return true;}
 if(c.tool=="walk"||c.tool=="empty"){std::string t;for(auto& ty:data().types){auto it=b->materials.find(ty);if(it!=b->materials.end()&&it->is_number()&&it->get<double>()>0){t=ty;break;}}
  if(!t.empty()){int have=(int)b->materials[t].get<double>(),n=std::min(stackLimit(t),have);scatter(t,n,{p.x-b->size/2-.5,p.y});b->materials[t]=have-n;resizeBox(*b);}else toast("Empty expando box. Right-click with wrench to package it.");}
 else{const auto& ty=data().types;if(std::find(ty.begin(),ty.end(),c.tool)!=ty.end()){const std::string t=c.tool;std::string held;for(auto& [k,v]:b->materials.items())if(v.is_number()&&v.get<double>()>0){held=k;break;}
   if(!held.empty()&&held!=t){toast("This expando box holds "+nameOf(held)+". One item type per box — empty it first.");return true;}
   int have=carried(c,t),n=boxInsert(*b,t,have);if(n>0)takeItem(c,t,n);int left=carried(c,t);if(n<left+n&&left>0)toast(n?"The box is full until it has room to grow ("+std::to_string(left)+" left in hand).":"Box needs more room to expand.");}}
 return true;}
// machinery.js ejectTurretAmmo: a turret's rounds come out on the inside, by its outlet.
void Ship::ejectTurretAmmo(Crew& c,Mount& m){V2 p=mountPoint(m);if(c.piloting||dist(pos(c),p)>8||buildBlocked(c,p,nullptr)){toast("Move closer with a clear path to the turret.");return;}if(!m.ammo){toast("Turret is empty.");return;}
 V2 n=inward(m),t{-n.y,n.x};bool found=false;V2 out;for(double off:{0.0,-.8,.8}){V2 q{p.x+n.x*1.35+t.x*off,p.y+n.y*1.35+t.y*off};if(q.x<bounds.l+.85||q.x>bounds.r-.85||q.y<bounds.t+.85||q.y>bounds.b-.85)continue;bool blocked=false;
  inside->queryAABB({q.x-.35,q.y-.35},{q.x+.35,q.y+.35},[&](b2Fixture* f){if(f->GetBody()!=c.body&&(f->GetFilterData().maskBits&8)&&!f->IsSensor())blocked=true;return true;});if(!blocked){out=q;found=true;break;}}
 if(!found){toast("Clear the turret’s interior outlet before ejecting ammo.");return;}const int count=(int)m.ammo;spawnItem(m.ammoType.empty()?"ammo":m.ammoType,out,{n.x*.5,n.y*.5},count);m.ammo=0;toast("Ejected "+std::to_string(count)+" ammo.");}
// ---- The click (game.js edit) ------------------------------------------------------------------------------------------
void Ship::edit(Crew& c){auto cell=cursorCell(c);V2 cv{(double)cell.first,(double)cell.second};
 if(c.piloting){bool onHelm=false;for(auto [hx,hy]:helmCells())if(hx==cell.first&&hy==cell.second)onHelm=true;if(onHelm){recover(c);return;}return; /* TODO stage 7: fireRC */}
 if(!c.manning.empty()){const Mount* mm=mountHit(cv);if(mm&&mm->type=="turret_controller"){toggleController(c);return;}return; /* TODO stage 7: controllerFire / manned turret */}
 const Mount* clicked=mountHit(cv);
 if(clicked&&clicked->type=="turret_controller"&&c.tool!="helm"&&!c.keys.shift){if(dist(pos(c),mountPoint(*clicked))>3){toast("Move closer to the turret controller.");return;}if(toggleController(c))return;}
 if(clicked&&clicked->type=="turret"&&(clicked->kind=="burst"||clicked->kind=="auto")&&!c.keys.shift&&(c.tool=="empty"||c.tool=="walk"))return; // TODO stage 7: manTurret
 if(clicked&&clicked->type=="turret"&&(c.keys.shift||c.tool=="empty")){ejectTurretAmmo(c,mounts[clicked-mounts.data()]);return;}
 if(isAmmo(c.tool)&&clicked&&clicked->type=="turret"){Mount& m=mounts[clicked-mounts.data()];if(dist(pos(c),mountPoint(m))>8){toast("Move closer to load the RC.");return;}const std::string type=c.tool;
  if(m.ammo&&(m.ammoType.empty()?"ammo":m.ammoType)!=type){toast("Eject the existing ammo first.");return;}const int cap=turretCapacity(m.starterRC,m.kind),n=std::min(carried(c,type),cap-(int)m.ammo);
  if(n<=0){toast("Turret is full ("+std::to_string(cap)+"/"+std::to_string(cap)+").");return;}m.ammoType=type;m.ammo=m.ammo+n;takeItem(c,type,n);int left=carried(c,type);
  toast(turretDef(m.starterRC,m.kind).at("name").get<std::string>()+" loaded: "+std::to_string((int)m.ammo)+"/"+std::to_string(cap)+(left?" · "+std::to_string(left)+" left in hand":""));return;}
 if(c.tool=="pusher"||c.tool=="shredder"||c.tool=="shredder_gold"||c.tool=="repair"||c.tool=="booster")return; // TODO stage 5b/7: pushAt, shredAt, repairAt, useBooster
 if(clicked&&clicked->type=="ejector"&&c.tool!="walk"&&c.tool!="remove")return; // TODO stage 5b: ejectCarried
 if(useBox(c,c.mouse))return;if(pickupAt(c,c.mouse))return;
 {bool onHelm=false;for(auto [hx,hy]:helmCells())if(hx==cell.first&&hy==cell.second)onHelm=true;if(onHelm&&c.tool!="helm"){takeHelm(c);return;}}
 const Tile* target=terrainAt(cell.first,cell.second);
 if(target&&target->type=="recycler"&&c.tool!="walk"&&c.tool!="remove"&&!c.keys.shift)return; // TODO stage 5b: recycleCarried
 if(target&&target->type=="fabricator"&&c.tool!="walk"&&c.tool!="remove"&&std::find(data().types.begin(),data().types.end(),c.tool)!=data().types.end()){if(!fabReach(c,target)){toast("Move closer to load items.");return;}return; /* TODO stage 5b: transferMaterial */}
 if(c.tool=="empty"){Tile* f=const_cast<Tile*>(target);if(fabReach(c,f)){openCraft(c,f);return;}interact(c);return;}
 if(c.tool=="fuel"||c.tool=="explosives")return; // TODO stage 5b: loadThruster
 if(c.tool=="walk"||c.tool=="remove"){if(target&&target->type=="fabricator"&&!c.keys.shift&&c.tool=="walk"){Tile* f=const_cast<Tile*>(target);if(fabReach(c,f))openCraft(c,f);else toast("Move closer to use the fabricator.");return;}removeAt(c,cell);return;}
 beginBuild(c,buildCell(c.tool,c),c.tool);}
void Ship::secondaryAt(Crew& c,std::pair<int,int> cell){const Tile* f=terrainAt(cell.first,cell.second);if(f&&f->type=="recycler"&&!c.slots[c.selected].empty()&&!(c.keys.shift&&c.tool=="walk"))return; // TODO stage 5b: recycleCarried
 if(c.tool=="shredder"||c.tool=="shredder_gold")return; // TODO stage 5b: shredAt
 removeAt(c,cell);}
}
