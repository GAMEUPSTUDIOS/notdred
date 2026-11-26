#pragma once
#include "zonegen.h"
#include "rules.h"
#include <memory>
#include <unordered_set>
// A zone: what is outside the ships — rock (cell records and greedy-merged 8×8 chunk bodies), the Freeport harbour
// (docks, walls, cut corners) or a combat zone's edge, portals, boulders and loose loot, in one Box2D world per zone.
// Ported from dist/modules/zones.js (setupZone's zone side, decorateZone, portals, arrivals, the Freeport layout),
// dist/modules/missions.js (treasure ranks) and the terrain hashes of dist/game.js. The ships, bots, rounds and the
// zone's step follow in stage 7 (server/zone-runtime.js, combat.js).
namespace nd {
// game.js terrainHash / finchNoise (through V8's sin, so every cell gets the kind the JavaScript gave it).
double terrainHash(double x,double y);
double finchNoise(double x,double y);
// A ship's outline in its own frame (game.js shipExtents: the hull plus its attachments).
struct ShipExt{double l=-5.5,r=5.5,t=-4.5,b=3.5;};
// Another ship in the zone, as arrivals see it (occupiedByShips).
struct OtherShip{double x=0,y=0;ShipExt ext;};
// The server-wide mission schedule (the zone bus keeps it; missions.js reads it).
struct MissionState{std::string active;double endsIn=0,nextIn=0,elapsed=0,cleared=0;int index=0;bool clearedOut=false;};
struct Rock{std::string id,chunk,kind;double x=0,y=0,hp=0,maxhp=0;bool ore=false;};
struct RockChunk{std::unordered_set<std::string> cells;b2Body* body=nullptr;bool dirty=false;};
struct Portal{std::string to;double x=0,y=0;bool mission=false;};
struct Boulder{std::string id;b2Body* body=nullptr;double r=0;bool sentRest=false;};
struct WorldLoot{std::string type;int count=1;b2Body* body=nullptr;double grace=0;long nid=0;};
struct DockRect{double x0,y0,x1,y1;std::string part;};
struct FreeportLayout{double w=0,h=0;std::vector<DockRect> docks,walls;std::vector<std::pair<V2,V2>> corners;};
struct Zone{
 std::string id;const J* def=nullptr;double seed=0;std::unordered_set<std::string> mined;
 J st=J::object();                       // zoneData[id]: saved boulders, treasure
 bool hasGrid=false;ZoneGrid grid;
 std::unique_ptr<World> world;b2Body* dockBody=nullptr;b2Body* edge=nullptr;
 OMap<std::string,Rock> rocks;OMap<std::string,RockChunk> rockChunks;
 std::vector<Boulder> boulders;std::vector<std::unique_ptr<WorldLoot>> worldLoot;
 const MissionState* mission=nullptr;   // the schedule this zone reads (null: none running)
 std::vector<double> dice;size_t diceAt=0;uint64_t rng=0x2545f4914f6cdd1dull;
 // mined: rock ids already gone; saved: {boulders:[…], loot:[…]} kept from before (zoneData)
 Zone(const std::string& id,double seed,const J& mined,const J& saved,const MissionState* mission);
 ~Zone();
 bool combat()const;
 const J& gen()const;
 double random();                        // the zone's dice (tests may script them: dice)
 // ---- rock
 std::string rockChunkOf(double x,double y)const;
 void buildRockChunk(const std::string& k);
 bool removeRock(const std::string& id,bool rebuild=true);
 void rebuildDirtyRockChunks();
 std::string rockAtHit(V2 point,V2 dir)const;
 bool zoneSolid(double x,double y)const;
 // ---- portals
 std::vector<Portal> zonePortals();
 bool nearestPortal(V2 p,Portal& out,double& distance);
 // ---- arrivals
 bool shipOverlapsRock(V2 p,const ShipExt& e)const;
 bool shipClashes(V2 p,const ShipExt& e,const std::vector<OtherShip>& others)const;
 bool randomArrival(const ShipExt& e,const std::vector<OtherShip>& others,V2& out);
 FreeportLayout freeportLayout()const;
 bool insideFreeport(double x,double y,double m=0)const;
 bool freeportBerthOK(V2 p,const ShipExt& e)const;
 bool freeportFits(V2 p,const ShipExt& e);
 V2 randomBerth(const ShipExt& e,const std::vector<OtherShip>& others);
 V2 safeArrival(const ShipExt& e,const std::vector<OtherShip>& others);
 // ---- contents
 WorldLoot& addWorldLoot(const std::string& type,V2 p,int count,V2 velocity);
 Boulder& addBoulder(const std::string& id,V2 p,double a,double r);
 J boulderState(bool all);
 struct Exposed{Rock* r;V2 open;int dx,dy;};
 std::vector<Exposed> exposedRocks();
 // ---- treasure (missions.js)
 const std::vector<std::string>& treasureRanks();
 int treasureTarget()const;
 void refreshTreasure();
private:
 void setup();
 void decorateZone();
 bool portalsMade=false;std::vector<Portal> portalList;bool hasMissionSpot=false;V2 missionSpot;
 bool ranksMade=false;std::vector<std::string> ranks;
};
}
