#pragma once
#include "physics.h"
#include "rules.h"
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
struct Tile{std::string type;int x=0,y=0,rotation=0;b2Fixture* f=nullptr;std::string access;J extra=J::object();double hp=100;};
struct Keys{bool w=false,a=false,s=false,d=false,up=false,down=false,left=false,right=false,space=false,shift=false;
 static Keys from(const J& k);bool moveRight()const{return d||right;}bool moveLeft()const{return a||left;}bool upKey()const{return w||up;}bool downKey()const{return s||down;}};
struct Crew{std::string id,name,rank="guest";b2Body* body=nullptr;Keys keys;bool climbing=false,piloting=false,jumpWas=false,grounded=false,noclip=false;
 double ladderX=0,ladderCooldown=0,jumpTime=0;int facing=1;std::string manning;};
struct Ship{
 Bounds bounds;struct{int x=1,y=2;}helm;
 World inside{V2(0,20)};b2Body* interior=nullptr;b2Body* skinBody=nullptr;bool skinDirty=true;
 std::vector<b2Fixture*> shell;
 OMap<std::string,Block> blocks;OMap<std::string,Tile> terrain;
 OMap<std::string,Crew> crew;
 double clock=0;
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
 void removeCrew(const std::string& id);
 void setRank(const std::string& id,const std::string& rank);
 void stepController(Crew& c,double dt);
 void clampToLadder(Crew& c);
 void tick(double dt);
 J crewState()const;
};
std::vector<std::vector<std::pair<double,double>>> cellLoops(const std::vector<std::pair<int,int>>& cells);
}
