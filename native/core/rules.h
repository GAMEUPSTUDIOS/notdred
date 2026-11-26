#pragma once
#include "data.h"
// Small rules from era.js, ported one for one (same names, same results).
namespace nd {
const J& zoneDef(const std::string& id);
bool isCombatZone(const std::string& id);
struct Half{double w,h;};
Half zoneHalf(const std::string& id);
int shipExpansions(const Bounds& b);
int shipMaxHP(const Bounds& b);
int shipSize(const Bounds& b);
double pvpMultiplierFor(double size,const std::string& id);
const J& turretDef(bool starterRC,const std::string& kind);
double turretReload(bool starterRC,const std::string& kind,const std::string& ammoType);
int turretCapacity(bool starterRC,const std::string& kind);
int itemMaxHp(const std::string& type);
bool isAmmo(const std::string& type);
// null when the item can't be crafted; otherwise ingredient → amount (iron first, as in JavaScript).
J recipeNeeds(const std::string& type);
std::string cleanShipName(const std::string& name);
// game.js cleanColor: '#rrggbb' (lower case) or "" when it isn't a colour.
std::string cleanColor(const std::string& c);
// JavaScript string helpers on UTF-16 code units, so lengths and slices match the page and the old server.
std::u16string toU16(const std::string& s);
std::string fromU16(const std::u16string& s);
bool jsSpace(char16_t c);
}
