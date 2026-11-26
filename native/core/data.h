#pragma once
#include "core.h"
namespace nd {
// Everything tunable, from dist/core-data.json (tools/core-data.cjs: era.js + the item tables in game.js).
struct GameData{
 J raw;                                  // the whole document, for rarely used tables
 std::vector<std::string> types;         // TYPES: every item type, in inventory order
 std::unordered_map<std::string,int> cost;   // COST: iron per item
 J zones,ammo,bots,shields,turrets,ammoReload,recipeExtra,freeRecipes,itemHp;
 std::string startZone;
};
const GameData& data();
void loadData(const std::string& json);
bool dataLoaded();
}
