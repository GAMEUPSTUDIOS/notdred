#include "data.h"
namespace nd {
static GameData g;static bool loaded=false;
const GameData& data(){if(!loaded)fail("game data not loaded (call init with dist/core-data.json first)");return g;}
bool dataLoaded(){return loaded;}
void loadData(const std::string& text){
 J d=J::parse(text,nullptr,false);if(d.is_discarded()||!d.is_object())fail("game data is not valid JSON");
 for(const char* k:{"TYPES","COST","ZONES","AMMO","BOT_TYPES","SHIELDS","TURRETS","AMMO_RELOAD","RECIPE_EXTRA","FREE_RECIPES","ITEM_HP","START_ZONE"})if(!d.contains(k))fail(std::string("game data is missing ")+k);
 GameData n;n.raw=d;n.types=d["TYPES"].get<std::vector<std::string>>();for(auto& [k,v]:d["COST"].items())n.cost[k]=v.get<int>();
 n.zones=d["ZONES"];n.ammo=d["AMMO"];n.bots=d["BOT_TYPES"];n.shields=d["SHIELDS"];n.turrets=d["TURRETS"];n.ammoReload=d["AMMO_RELOAD"];n.recipeExtra=d["RECIPE_EXTRA"];n.freeRecipes=d["FREE_RECIPES"];n.itemHp=d["ITEM_HP"];n.startZone=d["START_ZONE"];
 g=std::move(n);loaded=true;}
}
