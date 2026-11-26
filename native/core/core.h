// notdred.io game core: the game's rules in C++, built two ways from the same sources —
//   build/core.node  (N-API module, the server)          scripts/build-core.cjs
//   dist/core.wasm   (WebAssembly, the page's prediction) scripts/build-core.cjs --wasm
// Data (items, zones, ammo, bots…) is not compiled in: era.js and game.js stay the one place to tune numbers;
// tools/core-data.cjs writes them to dist/core-data.json, which both builds load at start (nd::loadData).
// See PORTING.md for what has been ported from the JavaScript rules and how each piece is checked against them.
#pragma once
#include "json.hpp"
#include <string>
#include <vector>
#include <map>
#include <unordered_map>
#include <cmath>
#include <algorithm>
namespace nd {
// ordered_json keeps keys in insertion order, as JavaScript objects do (string keys), so tables iterate in the same order.
using J=nlohmann::ordered_json;
// Fatal input errors: the native build throws (the binding turns it into a JavaScript exception); the WebAssembly
// build has no exceptions, so it records the message and returns an error result instead.
#ifdef ND_NO_EXCEPTIONS
void fail(const std::string& why);
#else
struct Error:std::runtime_error{using std::runtime_error::runtime_error;};
[[noreturn]] inline void fail(const std::string& why){throw Error(why);}
#endif
struct V2{double x=0,y=0;V2(){}V2(double a,double b):x(a),y(b){}
 V2 operator+(V2 o)const{return {x+o.x,y+o.y};}V2 operator-(V2 o)const{return {x-o.x,y-o.y};}V2 operator*(double k)const{return {x*k,y*k};}
 double len()const{return std::hypot(x,y);}double dot(V2 o)const{return x*o.x+y*o.y;}};
inline double clamp(double v,double a,double b){return std::max(a,std::min(b,v));}
// Ship bounds in ship tiles (left, right, top, bottom: inclusive hull rows/columns).
struct Bounds{int l=-5,r=5,t=-4,b=3;};
}
