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
// Errors: the native build throws (the binding returns it as {"error"}); the WebAssembly build has no exceptions, so
// it prints the message and traps (core-wasm.js turns that into a JavaScript error; the page then reloads the core).
#ifdef ND_NO_EXCEPTIONS
[[noreturn]] void fail(const std::string& why);
#else
struct Error:std::runtime_error{using std::runtime_error::runtime_error;};
[[noreturn]] inline void fail(const std::string& why){throw Error(why);}
#endif
struct V2{double x=0,y=0;V2(){}V2(double a,double b):x(a),y(b){}
 V2 operator+(V2 o)const{return {x+o.x,y+o.y};}V2 operator-(V2 o)const{return {x-o.x,y-o.y};}V2 operator*(double k)const{return {x*k,y*k};}
 // planck.js Vec2 semantics (the old rules' vectors): length is sqrt(x²+y²) — not Math.hypot, which rounds differently
 // (jsmath::hypot is Math.hypot) — and normalize multiplies by 1/length, leaving vectors shorter than 1e-9 alone.
 double len()const{return std::sqrt(x*x+y*y);}double dot(V2 o)const{return x*o.x+y*o.y;}
 void normalize(){const double l=len();if(l<1e-9)return;const double k=1/l;x*=k;y*=k;}};
inline double clamp(double v,double a,double b){return std::max(a,std::min(b,v));}
// Ship bounds in ship tiles (left, right, top, bottom: inclusive hull rows/columns).
struct Bounds{int l=-5,r=5,t=-4,b=3;};
}
namespace nd {
// Safe field reads (nlohmann's value() throws, or aborts in WebAssembly, when the field is there but of another type —
// a hand-edited save, a null an extra field was made as). The default is returned for missing, null or mistyped fields.
inline std::string val(const J& o,const char* k,const char* d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()&&it->is_string()?it->get<std::string>():std::string(d);}
inline std::string val(const J& o,const char* k,const std::string& d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()&&it->is_string()?it->get<std::string>():d;}
inline double val(const J& o,const char* k,double d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()&&it->is_number()?it->get<double>():d;}
inline int val(const J& o,const char* k,int d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()&&it->is_number()?(int)it->get<double>():d;}
inline float val(const J& o,const char* k,float d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()&&it->is_number()?(float)it->get<double>():d;}
inline bool val(const J& o,const char* k,bool d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()&&it->is_boolean()?it->get<bool>():d;}
inline J val(const J& o,const char* k,const J& d){if(!o.is_object())return d;auto it=o.find(k);return it!=o.end()?*it:d;}
}
