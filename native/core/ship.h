#pragma once
#include "physics.h"
#include "rules.h"
#include <memory>
#include <set>
// A ship: its interior (tiles, the hull shell, the collision skin, crew bodies) and the rules that act on them.
// Ported from dist/game.js (initialize, rebuildShell, addBlock, addTerrain, syncSkin, cellLoops, unitCell, doorBox,
// playerFilter, clampToLadder, step), dist/modules/controller.js (stepController) and server/room-runtime.js
// (newCrew, crewBody, serverCrewStep, serverCrewAfterStep). Stage 2: what crew movement needs; the rest follows.
namespace nd {
// Collision categories (game.js): 1 tiles/hull, 2 crew, 4 walkways, 8 items, 16 nets, 32/64/128 crew ranks,
// 256 doors, 512 machines' cargo probes.
enum : uint16_t {CAT_TILE=1,CAT_CREW=2,CAT_WALKWAY=4,CAT_ITEM=8,CAT_NET=16,DOOR_BIT=256};
uint16_t rankBit(const std::string& rank);
struct Block{int x=0,y=0,rotation=0;b2Fixture* f=nullptr;double hp=100;};
// A placed piece. Grid pieces sit at integer x,y; physics machines (fabricators, recyclers, comms stations) have a
// fixture-less static body and an id (their key), with x,y the top-left cell centre following that body.
struct Tile{std::string type,id;double x=0,y=0;int rotation=0;b2Fixture* f=nullptr;b2Body* body=nullptr;std::string access;J extra=J::object();double hp=100;bool hpSet=false;   // hpSet: a machine's health is saved only once it has one
 V2 mpos;            // a physics machine's centre (kept in doubles, as the JavaScript did: machines never move)
 int ix()const{return (int)x;}int iy()const{return (int)y;}};
// A hull attachment (thruster, turret, starter thruster/RC, ejector, turret controller): its side and first tile.
struct Mount{std::string type,kind,side,ammoType="ammo";J burnKind;bool starterRC=false,active=false;int at=0,rotation=0;double hp=100,fuelItems=0,explosiveItems=0,burnRemaining=0,ammo=0;J extra=J::object();};
struct Keys{bool w=false,a=false,s=false,d=false,up=false,down=false,left=false,right=false,space=false,shift=false;
 static Keys from(const J& k);bool moveRight()const{return d||right;}bool moveLeft()const{return a||left;}bool upKey()const{return w||up;}bool downKey()const{return s||down;}};
struct Crew{std::string id,name,rank="guest";b2Body* body=nullptr;Keys keys;bool climbing=false,piloting=false,jumpWas=false,grounded=false,noclip=false,admin=false,sandbox=false;
 double ladderX=0,ladderCooldown=0,jumpTime=0,inputAge=0;int facing=1;std::string manning;
 // the five hands (game.js slots/stackCounts: an empty slot is "")
 std::string slots[5]={"wrench","","","",""};int counts[5]={1,0,0,0,0};int selected=0;std::string tool="walk";
 V2 mouse{0,0};bool mouseActive=true;   // the aim, in ship coordinates
 int buildRotation=0;J buildJob;bool pusherPull=false,pusherHeld=false;std::string activeFab;
 J pusherVisual;double shredReady=0;
 std::vector<std::string> notices;};
// A loose stack aboard (cargo.js spawnItem).
struct Item{std::string type;b2Body* body=nullptr;int count=1;double grace=0,stuck=0;J intakeFrom;long nid=0;bool taken=false;};
// An expando box (cargo.js spawnBox): one item type, grows a quarter tile per 64 items.
struct Box{b2Body* body=nullptr;b2Fixture* fixture=nullptr;double size=2;J materials=J::object();};
struct Ship{
 Bounds bounds;struct{int x=1,y=2,rotation=0;}helm;
 J effects=J::array();
 J hullHP=J::object();                // damaged hull tiles ("x,y" → health %), from combat
 std::unordered_map<long long,std::vector<Item*>> itemGrid;   // loose items by 2×2 cell while loaders look (tickLoaders)               // short-lived visual effects (build flashes, labels), sent to the crew
 V2* placingAim=nullptr;             // a delayed build places where it was aimed when it began
 std::unique_ptr<World> inside=std::make_unique<World>(V2(0,20));b2Body* interior=nullptr;b2Body* skinBody=nullptr;bool skinDirty=true;
 std::vector<b2Fixture*> shell;
 OMap<std::string,Block> blocks;OMap<std::string,Tile> terrain;std::vector<Mount> mounts;int machineSeq=0;
 OMap<std::string,Crew> crew;
 std::vector<std::unique_ptr<Item>> items;std::vector<std::unique_ptr<Box>> boxes;
 V2 shipPos{0,0};                       // the hull's position in its zone (the exterior arrives in a later stage)
 J savedStacks;                         // the saved hands, for the first crew member to join (game.js keeps them on the ship)
 double clock=0,safetyTimer=0;int mergePass=0;long liveSeq=0;
 Crew* actor=nullptr;                   // whose action is being applied (their notices), else everyone's
 explicit Ship(const J& saved);
 ~Ship();
 // tiles
 b2Fixture* fixture(const b2Shape& shape,float friction,uint16_t cat=CAT_TILE,uint16_t mask=0xffff,float density=0);
 void rebuildShell();
 void addBlock(int x,int y,int rotation);
 Tile* addTerrain(const std::string& type,int x,int y,int rotation);
 bool interiorCell(int x,int y)const{return x>bounds.l&&x<bounds.r&&y>bounds.t&&y<bounds.b;}
 const Tile* terrainAt(int x,int y)const;
 std::vector<const Tile*> terrainOfType(const std::string& type)const;
 void syncSkin();
 // crew
 Crew& newCrew(const std::string& id,const std::string& name);
 void spawnKit(Crew& c);
 b2Body* makeCrewBody(uint16_t cat);
 b2Body* spare=nullptr;          // the body the next first crew member takes (game.js keeps one player body always)
 void removeCrew(const std::string& id);
 void setRank(const std::string& id,const std::string& rank);
 void stepController(Crew& c,double dt);
 void clampToLadder(Crew& c);
 void tick(double dt);
 J crewState()const;
 // notices (room-runtime notify/toast)
 void toast(const std::string& text);void toastAll(const std::string& text);
 // hands (game.js carried/addCarried/selectSlot/setTool, cargo.js takeItem/giveItem/moveStack/refund)
 int carried(const Crew& c,const std::string& type)const;
 int addCarried(Crew& c,const std::string& type,int count);
 void takeItem(Crew& c,const std::string& type,int count);
 int giveItem(Crew& c,const std::string& type,int count);
 void selectSlot(Crew& c,int n);
 void moveStack(Crew& c,int from,int to,bool split);
 void refund(Crew& c,const std::string& type,const V2* p);
 // loose items (cargo.js)
 Item& spawnItem(const std::string& type,V2 p,V2 velocity,int count);
 void scatter(const std::string& type,int count,V2 p,J intakeFrom=J());
 void dropItem(Crew& c,bool split);
 void destroyItem(size_t index);
 void mergeTouchingCargo();
 void wakeCargoNear(V2 p,double radius);
 // expando boxes (cargo.js)
 Box& spawnBox(V2 p,const J& materials);
 bool boxSpace(V2 p,double size,const Box* ignore,bool growing,const Crew* standing)const;
 bool resizeBox(Box& b);
 int boxInsert(Box& b,const std::string& type,int n);
 Box* boxAt(V2 p);Box* boxNear(V2 p,double pad);
 std::vector<std::pair<int,int>> helmCells()const;
 // mounts (game.js)
 static int mountWidth(const Mount& m){return m.type=="starter"?1:3;}
 V2 mountPoint(const Mount& m,const Bounds* b=nullptr)const;
 static V2 inward(const Mount& m);
 const Mount* mountHit(V2 c)const;
 bool mountAt(V2 c,const std::string& type,Mount& out)const;
 bool mountValid(const Mount& m,const Bounds* b=nullptr,const Mount* ignore=nullptr)const;
 static std::string mountItem(const Mount& m);
 // physics machines and standing pieces (game.js)
 Tile& spawnMachine(const std::string& type,V2 p,const J& fields,const std::string& id);
 void syncMachines();
 bool machineSpace(const std::string& type,V2 p,const Crew* standing)const;
 bool fabFits(int x,int y,bool checkSupport,const std::string& type)const;
 const Tile* machineOnTop(int x,int y)const;
 bool supportsMachine(int x,int y)const;
 const Tile* spawnPointFor(const std::string& rank);
 std::vector<std::pair<int,int>> terrainCells(const Tile& t)const;
 // safeguards.js
 bool solidCell(int x,int y,bool cargo)const;
 V2 safeCell(V2 p,bool cargo)const;
 bool wedgedInSolid(b2Body* b)const;
 static uint16_t skinMaskOf(b2Fixture* f){auto p=f->GetUserData().pointer;return p?(uint16_t)(p&0xffff):f->GetFilterData().maskBits;}
 void rescueBody(b2Body* b,bool cargo);
 int mergeLooseStacks();
 void tickSafeguards(double dt);
 void tickHullLeaks();
 void tickTrashDecay(double dt);
 // building and the click (construction.js, game.js edit/interact)
 V2 localMouse(const Crew& c)const;std::pair<int,int> cursorCell(const Crew& c)const;
 void actionEffect(double x,double y,const std::string& color,const std::string& label,const Crew& c);
 bool rayBlocked(const Crew& c,V2 cell,b2Fixture* ignore,double ox,double oy);
 bool buildBlocked(const Crew& c,V2 cell,b2Fixture* ignore);
 std::vector<std::pair<int,int>> footprintCells(const std::string& t,int x,int y,int r)const;
 std::pair<int,int> buildAnchor(const std::string& t,V2 m,const Crew& who)const;
 std::pair<int,int> buildCell(const std::string& t,const Crew& c)const;
 double supportTopBelow(double x0,double x1,double yFrom)const;
 bool placementPoint(std::pair<int,int> c,const std::string& type,const Crew& who,V2& out)const;
 std::string cellTaken(int x,int y,bool ignoreHelm)const;
 std::string validity(std::pair<int,int> c,const std::string& t,Crew& who);
 bool beginBuild(Crew& c,std::pair<int,int> cell,std::string t);
 void tickBuild(Crew& c,double dt);
 void commitBuild(Crew& c,std::pair<int,int> cell,const std::string& t,int rotation);
 void resizeCut(Crew& c,std::pair<int,int> cell,bool grow);
 void load(const J& saved);
 void reloadAfterResize(const J& r);          // initialize (game.js): everything from a saved ship, in a fresh interior world
 void rebuildMounts();
 void dropContents(Tile& t,V2 p);
 void dropMachine(const std::string& key,Crew& who);
 void removeAt(Crew& c,std::pair<int,int> cell);
 bool setDoorAccess(Tile& t,const std::string& access);
 b2Fixture* makeDoorFixture(int x,int y,int r,const std::string& access);
 void rotateSelection(Crew& c);
 bool nearHelm(const Crew& c)const;void recover(Crew& c);void takeHelm(Crew& c);
 double fabDistance(const Crew& c,const Tile& f)const;bool fabInSight(Crew& c,const Tile& f);bool fabReach(Crew& c,const Tile* f);Tile* nearFab(Crew& c);void openCraft(Crew& c,Tile* fab);
 std::vector<const Mount*> controlledTurrets(const Mount& ctrl)const;bool toggleController(Crew& c);
 void ejectTurretAmmo(Crew& c,Mount& m);
 void interact(Crew& c);bool pickupAt(Crew& c,V2 p);bool useBox(Crew& c,V2 p);void edit(Crew& c);void secondaryAt(Crew& c,std::pair<int,int> cell);
 // machinery (machinery.js, hatches.js)
 struct Beam{V2 d;double length;b2Body* hit;};
 Tile* activeFabOf(Crew& c);
 void transferMaterial(Crew& c,std::string type,bool eject);void clearQueue(Crew& c);bool craft(Crew& c,const std::string& t,int count);void tickFabricators(double dt);
 void loadThruster(Crew& c,std::pair<int,int> cell,std::string type);double burn(Mount& m,double dt,double power);
 bool configureHatch(Crew& c,std::pair<int,int> cell,const J& mode,const J& list,bool pull,bool requireOutput);
 std::vector<std::string> objectInventory(b2Body* body);std::string pusherModeFor(Tile& t,b2Body* body);bool configurePusher(Crew& c,std::pair<int,int> cell,const J& o);
 bool beamPasses(b2Fixture* f,b2Vec2 pt,V2 d);Beam pusherBeam(Tile& t);void tickPushers(double dt);void pushAt(Crew& c,V2 p,double dt);
 std::vector<std::pair<int,int>> loaderInputCells(const Tile& t,std::pair<int,int> c)const;bool loaderTake(Tile& t,std::pair<int,int> c,J& got);std::vector<Item*> nearbyItems(const Tile& t,const std::vector<std::pair<int,int>>& cells);
 int loaderGive(Tile& t,std::pair<int,int> c,J& stack);bool loaderDrop(Tile& t,const J& stack,std::pair<int,int> output,std::pair<int,int> input);void tickLoaders(double dt);
 bool startRecycle(Tile& f,const std::string& type,int count);void finishRecycle(Tile& f);void dropRecycled(Tile& f,const J& st);void tickRecyclers(double dt);void recycleCarried(Crew& c,Tile& f);
 bool shredAt(Crew& c,V2 p);void repairAt(Crew& c,std::pair<int,int> cell);const Tile* nearComms(V2 p)const;bool commsCheck(const std::string& id);bool launchCargo(Mount& m,const std::string& type,int count);
 // commands (room-runtime command): the parts ported so far
 void command(const std::string& id,const J& msg);
 Tile* fabFor(Crew& m,const J& msg);
 J state()const;   // the durable parts ported so far, in game.js state() form
 double random();  // the core's own dice (xorshift, seeded per ship)
 uint64_t seed=0x9e3779b97f4a7c15ull;
};
int stackLimit(const std::string& type);
std::string nameOf(const std::string& type);
std::string physicsMachineType(const std::string& t);
bool placeable(const std::string& t);
J recycleYield(const std::string& type,int count);
bool hatchAllows(const Tile& t,const std::string& type);
std::set<std::string> fabIngredients(const Tile& f);
// game.js fixItemType / fixMaterials: unknown types dropped, blank ones read as standard ammo ("" = dropped).
std::string fixItemType(const std::string& t);
J fixMaterials(const J& m);
std::vector<std::vector<std::pair<double,double>>> cellLoops(const std::vector<std::pair<int,int>>& cells);
}
